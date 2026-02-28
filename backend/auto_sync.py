"""
Auto-sync file-based data from OpenClaw workspace into PostgreSQL on server startup.

Syncs three data sources:
  1. Workspace Documents:  ~/.openclaw/workspace/shared/documents/{domain}/*
  2. Knowledge Articles:   ~/.openclaw/workspace/shared/knowledge_base/{domain}/*.md
  3. Sessions + Messages:  ~/.openclaw/agents/*/sessions/*.jsonl

Runs as a background task during FastAPI startup. Idempotent — skips records
that already exist in the database.
"""

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import text as sa_text
from sqlmodel import select

from database import async_session
from models.conversation import Conversation
from models.document import WorkspaceDocument
from models.knowledge import KnowledgeArticle
from models.session import Session
from utils import utcnow

logger = logging.getLogger(__name__)

OPENCLAW_DIR = Path.home() / ".openclaw"
WORKSPACE_SHARED = OPENCLAW_DIR / "workspace" / "shared"
AGENTS_DIR = OPENCLAW_DIR / "agents"


# ---------------------------------------------------------------------------
# 1. Workspace Documents
# ---------------------------------------------------------------------------

async def sync_documents() -> int:
    docs_dir = WORKSPACE_SHARED / "documents"
    if not docs_dir.is_dir():
        return 0

    # Get existing file_paths from DB
    async with async_session() as session:
        result = await session.execute(select(WorkspaceDocument.file_path))
        existing_paths = {r[0] for r in result.all()}

    new_docs = []
    for domain_dir in sorted(docs_dir.iterdir()):
        if not domain_dir.is_dir():
            continue
        domain = domain_dir.name

        for fpath in sorted(domain_dir.rglob("*")):
            if not fpath.is_file():
                continue
            if fpath.name.endswith(".metadata.json"):
                continue
            if ".metadata" in fpath.parts:
                continue
            if fpath.name.startswith("."):
                continue

            file_path_str = str(fpath)
            if file_path_str in existing_paths:
                continue

            file_ext = fpath.suffix.lstrip(".").lower()
            try:
                file_size = fpath.stat().st_size
            except OSError:
                file_size = 0

            # Read metadata sidecar
            sidecar_data = {}
            for sc in [fpath.parent / f"{fpath.name}.metadata.json",
                        fpath.parent / ".metadata" / f"{fpath.stem}.json"]:
                if sc.exists():
                    try:
                        sidecar_data = json.loads(sc.read_text(encoding="utf-8"))
                    except (json.JSONDecodeError, OSError):
                        pass
                    break

            sensitivity = sidecar_data.get("sensitivity", "internal").lower()
            uploaded_by = None
            src = sidecar_data.get("source", {})
            if isinstance(src, dict) and src.get("uploaded_by"):
                uploaded_by = src["uploaded_by"]
            elif sidecar_data.get("stored_by"):
                uploaded_by = sidecar_data["stored_by"]

            meta = {}
            for k in ["description", "tags", "domain", "file_type",
                       "original_name", "raw_path", "restored_at"]:
                if k in sidecar_data:
                    meta[k] = sidecar_data[k]
            if src and isinstance(src, dict):
                meta["source"] = src

            new_docs.append({
                "id": str(uuid.uuid4()),
                "domain": domain,
                "filename": fpath.name,
                "file_path": file_path_str,
                "file_type": file_ext,
                "file_size": file_size,
                "sensitivity": sensitivity,
                "uploaded_by": uploaded_by,
                "approved_by": sidecar_data.get("approved_by"),
                "metadata": json.dumps(meta) if meta else None,
                "created_at": utcnow(),
                "updated_at": utcnow(),
            })

    if not new_docs:
        return 0

    async with async_session() as session:
        for doc in new_docs:
            await session.execute(sa_text("""
                INSERT INTO workspace_documents
                    (id, domain, filename, file_path, file_type, file_size,
                     sensitivity, uploaded_by, approved_by, metadata,
                     created_at, updated_at)
                VALUES
                    (:id, :domain, :filename, :file_path, :file_type, :file_size,
                     :sensitivity, :uploaded_by, :approved_by, :metadata,
                     :created_at, :updated_at)
            """), doc)
        await session.commit()

    return len(new_docs)


# ---------------------------------------------------------------------------
# 2. Knowledge Articles
# ---------------------------------------------------------------------------

def _extract_title(content: str, fallback: str) -> str:
    match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    return match.group(1).strip() if match else Path(fallback).stem


def _extract_tags(content: str) -> list[str]:
    fm_match = re.match(r"^---\s*\n(.*?)\n---\s*\n", content, re.DOTALL)
    if not fm_match:
        return []
    fm = fm_match.group(1)
    tag_match = re.search(r"^tags:\s*\[(.+?)\]", fm, re.MULTILINE)
    if tag_match:
        raw = tag_match.group(1)
        return [t.strip().strip("'\"") for t in raw.split(",") if t.strip()]
    tags = []
    in_tags = False
    for line in fm.splitlines():
        if re.match(r"^tags:\s*$", line):
            in_tags = True
            continue
        if in_tags:
            m = re.match(r"^\s*-\s+(.+)$", line)
            if m:
                tags.append(m.group(1).strip().strip("'\""))
            else:
                break
    return tags


async def sync_knowledge() -> int:
    kb_dir = WORKSPACE_SHARED / "knowledge_base"
    if not kb_dir.is_dir():
        return 0

    # Get existing domain+title combos from DB
    async with async_session() as session:
        result = await session.execute(
            select(KnowledgeArticle.domain, KnowledgeArticle.title)
        )
        existing = {(r[0], r[1]) for r in result.all()}

    new_articles = []
    for domain_dir in sorted(kb_dir.iterdir()):
        if not domain_dir.is_dir():
            continue
        domain = domain_dir.name

        for fpath in sorted(domain_dir.rglob("*.md")):
            if fpath.name.lower() == "readme.md":
                continue

            try:
                content = fpath.read_text(encoding="utf-8")
            except OSError:
                continue

            title = _extract_title(content, fpath.name)
            if (domain, title) in existing:
                continue

            tags = _extract_tags(content)

            # Check sidecar metadata
            created_by = None
            sidecar = fpath.parent / f"{fpath.name}.metadata.json"
            if not sidecar.exists():
                sidecar = fpath.parent / f"{fpath.stem}.metadata.json"
            if sidecar.exists():
                try:
                    meta = json.loads(sidecar.read_text(encoding="utf-8"))
                    if meta.get("tags") and not tags:
                        tags = meta["tags"]
                    created_by = meta.get("published_by")
                except (json.JSONDecodeError, OSError):
                    pass

            new_articles.append({
                "id": str(uuid.uuid4()),
                "domain": domain,
                "title": title,
                "content": content,
                "tags": tags,
                "status": "published",
                "created_by": created_by,
                "updated_by": None,
                "created_at": utcnow(),
                "updated_at": utcnow(),
            })

    if not new_articles:
        return 0

    async with async_session() as session:
        for art in new_articles:
            await session.execute(sa_text("""
                INSERT INTO knowledge_articles
                    (id, domain, title, content, tags, status,
                     created_by, updated_by, created_at, updated_at)
                VALUES
                    (:id, :domain, :title, :content, :tags, :status,
                     :created_by, :updated_by, :created_at, :updated_at)
            """), art)
        await session.commit()

    return len(new_articles)


# ---------------------------------------------------------------------------
# 3. Sessions + Conversations
# ---------------------------------------------------------------------------

def _parse_session_key(key: str) -> dict:
    parts = key.split(":")
    agent_id = parts[1] if len(parts) > 1 else "main"
    platform = ""
    peer_id = ""
    if len(parts) > 2:
        rest = parts[2:]
        if rest[0] == "main":
            platform = "main"
        else:
            platform = rest[0]
            if len(rest) > 2:
                peer_id = ":".join(rest[2:])
            elif len(rest) > 1:
                peer_id = rest[1]
    return {"agent_id": agent_id, "platform": platform, "peer_id": peer_id}


def _extract_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        texts = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    texts.append(block.get("text", ""))
                elif block.get("type") == "toolCall":
                    texts.append(f"[tool_call: {block.get('name', '')}]")
            elif isinstance(block, str):
                texts.append(block)
        return "\n".join(texts)
    return str(content) if content else ""


def _msg_type(content) -> str:
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict):
                t = block.get("type", "text")
                if t == "toolCall":
                    return "tool_call"
                if t in ("image", "image_url"):
                    return "image"
    return "text"


def _parse_ts(ts_str: str) -> datetime:
    if not ts_str:
        return utcnow()
    try:
        ts_str = ts_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(ts_str)
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except (ValueError, TypeError):
        return utcnow()


async def sync_sessions() -> tuple[int, int]:
    if not AGENTS_DIR.exists():
        return 0, 0

    # Get existing session UUIDs from DB
    async with async_session() as db:
        result = await db.execute(select(Session.id))
        existing_ids = {str(r[0]) for r in result.all()}
        # Also get existing session_keys for dedup
        result2 = await db.execute(select(Session.session_key))
        existing_keys = {r[0] for r in result2.all()}

    total_sessions = 0
    total_messages = 0

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
            except (json.JSONDecodeError, OSError):
                pass

        id_to_meta = {}
        for session_key, meta in sessions_meta.items():
            sid = meta.get("sessionId", "")
            if sid:
                id_to_meta[sid] = {**meta, "_session_key": session_key}

        jsonl_files = sorted(sessions_dir.glob("*.jsonl"))
        for jsonl_path in jsonl_files:
            session_uuid_str = jsonl_path.stem
            try:
                uuid.UUID(session_uuid_str)
            except ValueError:
                continue

            if session_uuid_str in existing_ids:
                continue

            meta = id_to_meta.get(session_uuid_str, {})
            session_key = meta.get("_session_key", f"agent:{agent_id}:unknown")

            # Skip if session_key already exists (different UUID, same chat)
            if session_key in existing_keys:
                continue

            parsed_key = _parse_session_key(session_key)
            model_used = meta.get("model", "")
            total_tokens = meta.get("totalTokens", 0)
            channel = meta.get("channel", "") or parsed_key["platform"]

            messages = []
            session_start_ts = None
            last_ts = None

            try:
                with open(jsonl_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            entry = json.loads(line)
                        except json.JSONDecodeError:
                            continue

                        entry_type = entry.get("type")
                        timestamp = _parse_ts(entry.get("timestamp", ""))

                        if entry_type == "session":
                            session_start_ts = timestamp
                            continue
                        if entry_type != "message":
                            continue

                        msg = entry.get("message", {})
                        role = msg.get("role", "")
                        content = msg.get("content", [])

                        if role == "toolResult":
                            continue

                        sender_type = "user" if role == "user" else "agent" if role == "assistant" else "system"
                        message_text = _extract_text(content)
                        message_type = _msg_type(content)

                        sender_name = ""
                        sender_platform_id = None
                        if role == "user" and isinstance(content, list):
                            for block in content:
                                if isinstance(block, dict) and block.get("type") == "text":
                                    text_val = block.get("text", "")
                                    if "sender_id" in text_val:
                                        try:
                                            json_match = re.search(
                                                r'```json\s*(\{[^`]+\})\s*```',
                                                text_val, re.DOTALL,
                                            )
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
                            session_id=uuid.UUID(session_uuid_str),
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
            except (OSError, UnicodeDecodeError):
                continue

            if not messages:
                continue
            if not session_start_ts:
                session_start_ts = messages[0].timestamp
            if not last_ts:
                last_ts = session_start_ts

            async with async_session() as db:
                new_session = Session(
                    id=uuid.UUID(session_uuid_str),
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
                db.add(new_session)
                await db.flush()
                for msg in messages:
                    db.add(msg)
                await db.commit()

            existing_ids.add(session_uuid_str)
            existing_keys.add(session_key)
            total_sessions += 1
            total_messages += len(messages)

    return total_sessions, total_messages


# ---------------------------------------------------------------------------
# Main entry point (called from server.py startup)
# ---------------------------------------------------------------------------

async def run_auto_sync():
    logger.info("Auto-sync: starting...")

    try:
        n_docs = await sync_documents()
        if n_docs:
            logger.info(f"Auto-sync: {n_docs} new documents imported")
    except Exception:
        logger.exception("Auto-sync: documents sync failed")

    try:
        n_articles = await sync_knowledge()
        if n_articles:
            logger.info(f"Auto-sync: {n_articles} new knowledge articles imported")
    except Exception:
        logger.exception("Auto-sync: knowledge sync failed")

    try:
        n_sessions, n_messages = await sync_sessions()
        if n_sessions:
            logger.info(
                f"Auto-sync: {n_sessions} new sessions, {n_messages} messages imported"
            )
    except Exception:
        logger.exception("Auto-sync: sessions sync failed")

    logger.info("Auto-sync: complete")
