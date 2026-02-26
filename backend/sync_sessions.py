#!/usr/bin/env python3
"""
Sync OpenClaw JSONL session files into PostgreSQL sessions + conversations tables.

Reads:
  ~/.openclaw/agents/*/sessions/sessions.json  (session metadata)
  ~/.openclaw/agents/*/sessions/*.jsonl         (message transcripts)

Writes to: sessions, conversations tables.
"""

import asyncio
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

# Load env before importing database
load_dotenv(Path(__file__).parent / ".env")

from sqlmodel import select
from database import async_session, engine, init_db
from models.session import Session
from models.conversation import Conversation


OPENCLAW_DIR = Path.home() / ".openclaw"
AGENTS_DIR = OPENCLAW_DIR / "agents"


def parse_session_key(session_key: str) -> dict:
    """Parse session key like 'agent:main:telegram:direct:90988085' into components."""
    parts = session_key.split(":")
    # Format: agent:<agent_id>:<rest...>
    agent_id = parts[1] if len(parts) > 1 else "main"

    # Determine platform and peer_id from remaining parts
    # agent:<agent>:main                        -> platform="main", peer_id=""
    # agent:<agent>:telegram:direct:<peer>      -> platform="telegram", peer_id=<peer>
    # agent:<agent>:telegram:group:<peer>       -> platform="telegram", peer_id=<peer>
    # agent:<agent>:line:direct:<peer>          -> platform="line", peer_id=<peer>
    # agent:<agent>:line:group:group:<peer>     -> platform="line", peer_id=<peer>
    platform = ""
    peer_id = ""
    if len(parts) > 2:
        rest = parts[2:]
        if rest[0] == "main":
            platform = "main"
        else:
            platform = rest[0]
            # Everything after platform type (direct/group/...) is peer_id
            if len(rest) > 2:
                peer_id = ":".join(rest[2:])
            elif len(rest) > 1:
                peer_id = rest[1]

    return {"agent_id": agent_id, "platform": platform, "peer_id": peer_id}


def extract_message_text(content) -> str:
    """Extract text from message content (can be string or list of content blocks)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        texts = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    texts.append(block.get("text", ""))
                elif block.get("type") == "toolCall":
                    name = block.get("name", "")
                    texts.append(f"[tool_call: {name}]")
            elif isinstance(block, str):
                texts.append(block)
        return "\n".join(texts)
    return str(content) if content else ""


def determine_message_type(content) -> str:
    """Determine message type from content blocks."""
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict):
                t = block.get("type", "text")
                if t == "toolCall":
                    return "tool_call"
                if t == "image" or t == "image_url":
                    return "image"
    return "text"


def parse_timestamp(ts_str: str) -> datetime:
    """Parse an ISO timestamp string to a naive UTC datetime (for PostgreSQL)."""
    if not ts_str:
        return datetime.utcnow()
    try:
        # Handle Z suffix
        ts_str = ts_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(ts_str)
        # Convert to UTC and strip tzinfo for naive storage
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except (ValueError, TypeError):
        return datetime.utcnow()


async def sync_all():
    """Main sync routine."""
    await init_db()

    if not AGENTS_DIR.exists():
        print(f"No agents directory found at {AGENTS_DIR}")
        return

    total_sessions = 0
    total_messages = 0
    skipped_sessions = 0

    for agent_dir in sorted(AGENTS_DIR.iterdir()):
        if not agent_dir.is_dir():
            continue
        agent_id = agent_dir.name
        sessions_dir = agent_dir / "sessions"
        if not sessions_dir.exists():
            continue

        # Load sessions.json metadata
        sessions_meta = {}
        sessions_json = sessions_dir / "sessions.json"
        if sessions_json.exists():
            try:
                with open(sessions_json) as f:
                    sessions_meta = json.load(f)
            except (json.JSONDecodeError, OSError) as e:
                print(f"  Warning: could not read {sessions_json}: {e}")

        # Build a mapping: sessionId -> session_key and metadata
        id_to_meta = {}
        for session_key, meta in sessions_meta.items():
            sid = meta.get("sessionId", "")
            if sid:
                id_to_meta[sid] = {**meta, "_session_key": session_key}

        # Process JSONL files (active sessions only, not .deleted)
        jsonl_files = sorted(sessions_dir.glob("*.jsonl"))
        if not jsonl_files:
            continue

        print(f"\nAgent: {agent_id} ({len(jsonl_files)} session files)")

        for jsonl_path in jsonl_files:
            session_uuid_str = jsonl_path.stem  # e.g. "1c190018-804e-43fd-98a5-515e34df12f9"

            try:
                session_uuid = uuid.UUID(session_uuid_str)
            except ValueError:
                print(f"  Skipping non-UUID file: {jsonl_path.name}")
                continue

            # Check if session already exists in DB
            async with async_session() as session:
                existing = await session.get(Session, session_uuid)
                if existing:
                    skipped_sessions += 1
                    continue

            # Look up metadata from sessions.json
            meta = id_to_meta.get(session_uuid_str, {})
            session_key = meta.get("_session_key", f"agent:{agent_id}:unknown")
            parsed_key = parse_session_key(session_key)
            model_used = meta.get("model", "")
            total_tokens = meta.get("totalTokens", 0)
            channel = meta.get("channel", "") or parsed_key["platform"]

            # Read all lines from the JSONL file
            messages = []
            session_start_ts = None
            last_ts = None

            try:
                with open(jsonl_path, "r", encoding="utf-8") as f:
                    for line_num, line in enumerate(f):
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            entry = json.loads(line)
                        except json.JSONDecodeError:
                            continue

                        entry_type = entry.get("type")
                        timestamp = parse_timestamp(entry.get("timestamp", ""))

                        if entry_type == "session":
                            session_start_ts = timestamp
                            continue

                        if entry_type != "message":
                            continue

                        msg = entry.get("message", {})
                        role = msg.get("role", "")
                        content = msg.get("content", [])

                        # Skip toolResult messages (internal)
                        if role == "toolResult":
                            continue

                        # Map role to sender_type
                        sender_type = "user" if role == "user" else "agent" if role == "assistant" else "system"
                        message_text = extract_message_text(content)
                        message_type = determine_message_type(content)

                        # Extract sender info from user messages
                        sender_name = ""
                        sender_platform_id = None
                        msg_meta = None

                        if role == "user" and isinstance(content, list):
                            for block in content:
                                if isinstance(block, dict) and block.get("type") == "text":
                                    text = block.get("text", "")
                                    # Try to parse conversation info metadata
                                    if "sender_id" in text:
                                        try:
                                            import re
                                            json_match = re.search(r'```json\s*(\{[^`]+\})\s*```', text, re.DOTALL)
                                            if json_match:
                                                info = json.loads(json_match.group(1))
                                                sender_platform_id = info.get("sender_id")
                                                sender_name = info.get("sender", "")
                                        except (json.JSONDecodeError, AttributeError):
                                            pass

                        msg_model = msg.get("model", "")
                        msg_usage = msg.get("usage", {})

                        conv_meta = None
                        if msg_model or msg_usage.get("totalTokens"):
                            conv_meta = {
                                "model": msg_model,
                                "tokens": msg_usage.get("totalTokens"),
                            }

                        messages.append(Conversation(
                            session_id=session_uuid,
                            agent_id=agent_id,
                            platform=channel or parsed_key["platform"],
                            peer_id=parsed_key["peer_id"],
                            sender_type=sender_type,
                            sender_name=sender_name,
                            sender_platform_id=sender_platform_id,
                            message=message_text[:10000] if message_text else "",
                            message_type=message_type,
                            meta=conv_meta,
                            timestamp=timestamp,
                        ))
                        last_ts = timestamp

            except (OSError, UnicodeDecodeError) as e:
                print(f"  Error reading {jsonl_path.name}: {e}")
                continue

            if not messages:
                continue

            if not session_start_ts:
                session_start_ts = messages[0].timestamp if messages else datetime.utcnow()
            if not last_ts:
                last_ts = session_start_ts

            # Create session and conversation records
            async with async_session() as session:
                new_session = Session(
                    id=session_uuid,
                    session_key=session_key,
                    agent_id=agent_id,
                    platform=channel or parsed_key["platform"],
                    peer_id=parsed_key["peer_id"],
                    model_used=model_used,
                    total_tokens=total_tokens,
                    status="active",
                    started_at=session_start_ts,
                    last_activity_at=last_ts,
                )
                session.add(new_session)
                await session.flush()  # Ensure session row exists before FK-dependent rows
                for msg in messages:
                    session.add(msg)
                await session.commit()

            total_sessions += 1
            total_messages += len(messages)
            print(f"  Imported: {jsonl_path.name} ({len(messages)} messages, key={session_key})")

    print(f"\n{'='*60}")
    print(f"Sync complete:")
    print(f"  Sessions imported: {total_sessions}")
    print(f"  Messages imported: {total_messages}")
    print(f"  Sessions skipped (already exist): {skipped_sessions}")


if __name__ == "__main__":
    asyncio.run(sync_all())
