"""
Auto-sync file-based data from OpenClaw workspace into PostgreSQL on server startup.

Syncs eight data sources (plus one backfill step):
  1. Bot Users:                 ~/.openclaw/workspace/shared/users/profiles/*.json
  2. Bot Groups:                ~/.openclaw/workspace/shared/groups/profiles/*.json
  3. Bot Users (group members): extracted from group profile ``members`` dicts
  4. Workspace Documents:       ~/.openclaw/workspace/shared/documents/{domain}/*
  5. Knowledge Articles:        ~/.openclaw/workspace/shared/knowledge_base/{domain}/*.md
  6. Sessions + Messages:       ~/.openclaw/agents/*/sessions/*.jsonl
  7a. Backfill senders:         re-parse existing conversations for sender metadata
  7b. Bot Users (conversations): extracted from conversation sender_platform_id
  8. Agent Memory:              ~/.openclaw/workspace/memory/*.md + ~/.openclaw/memory/main.sqlite

Runs as a background task during FastAPI startup. Idempotent — uses upsert for
users/groups, dedup checks for other records.
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
from models.memory import AgentMemory
from models.session import Session
from utils import utcnow

logger = logging.getLogger(__name__)

OPENCLAW_DIR = Path.home() / ".openclaw"
WORKSPACE_SHARED = OPENCLAW_DIR / "workspace" / "shared"
AGENTS_DIR = OPENCLAW_DIR / "agents"
WORKSPACE_MEMORY_DIR = OPENCLAW_DIR / "workspace" / "memory"
SQLITE_MEMORY_PATH = OPENCLAW_DIR / "memory" / "main.sqlite"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_iso(dt_str: str | None) -> datetime | None:
    """Parse ISO-8601 string into naive UTC datetime for asyncpg compatibility."""
    if not dt_str:
        return None
    try:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# 1. Bot Users
# ---------------------------------------------------------------------------

async def sync_bot_users() -> int:
    """Upsert bot user profiles from disk JSON files."""
    profiles_dir = WORKSPACE_SHARED / "users" / "profiles"
    if not profiles_dir.is_dir():
        return 0

    count = 0
    async with async_session() as session:
        for fpath in sorted(profiles_dir.glob("*.json")):
            try:
                data = json.loads(fpath.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                continue

            platform_user_id = data.get("user_id", "")
            if not platform_user_id:
                stem = fpath.stem
                platform = data.get("platform", "")
                if platform and stem.startswith(f"{platform}_"):
                    platform_user_id = stem[len(platform) + 1:]
                else:
                    platform_user_id = stem

            if not platform_user_id:
                continue

            first_seen = _parse_iso(
                data.get("first_seen_at") or data.get("created_at")
            )
            last_seen = _parse_iso(data.get("last_seen_at"))
            created_at = _parse_iso(data.get("created_at")) or utcnow()

            meta = {}
            if data.get("picture_url"):
                meta["picture_url"] = data["picture_url"]

            await session.execute(sa_text("""
                INSERT INTO bot_users
                    (id, platform_user_id, platform, display_name, avatar_url,
                     role, status, notes, metadata, first_seen_at, last_seen_at,
                     created_at, updated_at)
                VALUES
                    (:id, :platform_user_id, :platform, :display_name, :avatar_url,
                     :role, :status, :notes, :metadata, :first_seen_at, :last_seen_at,
                     :created_at, :updated_at)
                ON CONFLICT (platform_user_id) DO UPDATE SET
                    display_name = EXCLUDED.display_name,
                    avatar_url   = EXCLUDED.avatar_url,
                    role         = EXCLUDED.role,
                    status       = EXCLUDED.status,
                    notes        = EXCLUDED.notes,
                    metadata     = EXCLUDED.metadata,
                    last_seen_at = EXCLUDED.last_seen_at,
                    updated_at   = EXCLUDED.updated_at
            """), {
                "id": str(uuid.uuid4()),
                "platform_user_id": platform_user_id,
                "platform": data.get("platform", "unknown"),
                "display_name": data.get("display_name", ""),
                "avatar_url": data.get("avatar_url"),
                "role": data.get("role", ""),
                "status": data.get("status", ""),
                "notes": data.get("notes"),
                "metadata": json.dumps(meta) if meta else None,
                "first_seen_at": first_seen,
                "last_seen_at": last_seen,
                "created_at": created_at,
                "updated_at": utcnow(),
            })
            count += 1

        await session.commit()

    return count


# ---------------------------------------------------------------------------
# 2. Bot Groups
# ---------------------------------------------------------------------------

async def sync_bot_groups() -> int:
    """Upsert bot group profiles from disk JSON files."""
    profiles_dir = WORKSPACE_SHARED / "groups" / "profiles"
    if not profiles_dir.is_dir():
        return 0

    count = 0
    async with async_session() as session:
        for fpath in sorted(profiles_dir.glob("*.json")):
            try:
                data = json.loads(fpath.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                continue

            platform_group_id = data.get("group_id", "")
            if not platform_group_id:
                stem = fpath.stem
                platform = data.get("platform", "")
                if platform and stem.startswith(f"{platform}_"):
                    platform_group_id = stem[len(platform) + 1:]
                else:
                    platform_group_id = stem

            if not platform_group_id:
                continue

            members = data.get("members", {})
            member_count = len(members) if isinstance(members, dict) else 0
            created_at = _parse_iso(data.get("created_at")) or utcnow()

            await session.execute(sa_text("""
                INSERT INTO bot_groups
                    (id, platform_group_id, platform, name, status,
                     member_count, members, assigned_agent_id, metadata,
                     created_at, updated_at)
                VALUES
                    (:id, :platform_group_id, :platform, :name, :status,
                     :member_count, :members, :assigned_agent_id, :metadata,
                     :created_at, :updated_at)
                ON CONFLICT (platform_group_id) DO UPDATE SET
                    name              = EXCLUDED.name,
                    status            = EXCLUDED.status,
                    member_count      = EXCLUDED.member_count,
                    members           = EXCLUDED.members,
                    assigned_agent_id = EXCLUDED.assigned_agent_id,
                    updated_at        = EXCLUDED.updated_at
            """), {
                "id": str(uuid.uuid4()),
                "platform_group_id": platform_group_id,
                "platform": data.get("platform", "unknown"),
                "name": data.get("group_name", ""),
                "status": data.get("status", "active"),
                "member_count": member_count,
                "members": json.dumps(members) if members else None,
                "assigned_agent_id": data.get("assigned_agent_id"),
                "metadata": None,
                "created_at": created_at,
                "updated_at": utcnow(),
            })
            count += 1

        await session.commit()

    return count


# ---------------------------------------------------------------------------
# 3. Bot Users from Group Members
# ---------------------------------------------------------------------------

async def sync_bot_users_from_group_members() -> int:
    """Extract user records from group profile member dicts.

    Group JSON files contain a ``members`` dict mapping platform_user_id to
    ``{display_name, first_seen_at}``.  We upsert these into bot_users with a
    *conditional* update — only fill empty display_name so that richer data
    from disk user profiles is never overwritten.
    """
    profiles_dir = WORKSPACE_SHARED / "groups" / "profiles"
    if not profiles_dir.is_dir():
        return 0

    count = 0
    async with async_session() as session:
        # Pre-fetch existing IDs (lowercased) to avoid case-variant duplicates.
        # The unique index on platform_user_id is case-sensitive, but IDs from
        # group member dicts may differ in case from disk profiles.
        result = await session.execute(sa_text(
            "SELECT LOWER(platform_user_id) FROM bot_users"
        ))
        existing_lower_ids = {r[0] for r in result.all()}

        for fpath in sorted(profiles_dir.glob("*.json")):
            try:
                data = json.loads(fpath.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                continue

            platform = data.get("platform", "unknown")
            members = data.get("members", {})
            if not isinstance(members, dict):
                continue

            for platform_user_id, member_info in members.items():
                if not platform_user_id:
                    continue

                # Skip if a case-variant already exists from disk profiles
                lower_id = platform_user_id.lower()
                if lower_id in existing_lower_ids:
                    continue

                if not isinstance(member_info, dict):
                    member_info = {}

                display_name = member_info.get("display_name", "")
                first_seen = _parse_iso(member_info.get("first_seen_at"))

                await session.execute(sa_text("""
                    INSERT INTO bot_users
                        (id, platform_user_id, platform, display_name,
                         role, status, first_seen_at, created_at, updated_at)
                    VALUES
                        (:id, :platform_user_id, :platform, :display_name,
                         :role, :status, :first_seen_at, :created_at, :updated_at)
                    ON CONFLICT (platform_user_id) DO UPDATE SET
                        display_name = CASE
                            WHEN bot_users.display_name IS NULL
                                 OR bot_users.display_name = ''
                            THEN EXCLUDED.display_name
                            ELSE bot_users.display_name
                        END,
                        first_seen_at = COALESCE(
                            bot_users.first_seen_at, EXCLUDED.first_seen_at
                        ),
                        updated_at = EXCLUDED.updated_at
                """), {
                    "id": str(uuid.uuid4()),
                    "platform_user_id": platform_user_id,
                    "platform": platform,
                    "display_name": display_name,
                    "role": "",
                    "status": "",
                    "first_seen_at": first_seen,
                    "created_at": utcnow(),
                    "updated_at": utcnow(),
                })
                existing_lower_ids.add(lower_id)
                count += 1

        await session.commit()

    return count


# ---------------------------------------------------------------------------
# 4. Workspace Documents
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
# 5. Knowledge Articles
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
# 6. Sessions + Conversations
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
                                    if "sender_id" in text_val or "Sender" in text_val:
                                        try:
                                            for jm in re.finditer(
                                                r'```json\s*(\{[^`]+\})\s*```',
                                                text_val, re.DOTALL,
                                            ):
                                                info = json.loads(jm.group(1))
                                                # Old format: {sender_id, sender}
                                                if info.get("sender_id"):
                                                    sender_platform_id = info["sender_id"]
                                                    sender_name = info.get("sender", "")
                                                    break
                                                # New format: {label, name, username}
                                                if info.get("username") or info.get("name"):
                                                    sender_platform_id = info.get("username") or info.get("name")
                                                    sender_name = info.get("label") or info.get("name", "")
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
# 7a. Backfill conversation sender data
# ---------------------------------------------------------------------------

def _extract_sender_from_message(message: str) -> tuple[str | None, str]:
    """Parse sender metadata from a conversation message string.

    Supports both old format (``sender_id``) and new format
    (``label``/``name``/``username``).  Returns (platform_id, display_name).
    """
    if "sender_id" not in message and "Sender" not in message:
        return None, ""
    for jm in re.finditer(r'```json\s*(\{[^`]+\})\s*```', message, re.DOTALL):
        try:
            info = json.loads(jm.group(1))
        except json.JSONDecodeError:
            continue
        if info.get("sender_id"):
            return info["sender_id"], info.get("sender", "")
        if info.get("username") or info.get("name"):
            pid = info.get("username") or info.get("name")
            name = info.get("label") or info.get("name", "")
            return pid, name
    return None, ""


async def backfill_conversation_senders() -> int:
    """Update existing conversations that have NULL sender_platform_id.

    Re-parses the message text column to extract sender metadata that the
    original sync may have missed (e.g. due to format changes).
    """
    async with async_session() as session:
        result = await session.execute(sa_text("""
            SELECT id, message FROM conversations
            WHERE sender_type = 'user'
              AND sender_platform_id IS NULL
              AND (message LIKE '%sender_id%' OR message LIKE '%Sender%')
        """))
        rows = result.fetchall()

    if not rows:
        return 0

    count = 0
    async with async_session() as session:
        for conv_id, message in rows:
            pid, name = _extract_sender_from_message(message or "")
            if not pid:
                continue
            await session.execute(sa_text("""
                UPDATE conversations
                SET sender_platform_id = :pid,
                    sender_name = CASE
                        WHEN sender_name IS NULL OR sender_name = ''
                        THEN :name ELSE sender_name
                    END
                WHERE id = :id
            """), {"id": conv_id, "pid": pid, "name": name})
            count += 1
        await session.commit()

    return count


# ---------------------------------------------------------------------------
# 7b. Bot Users from Conversations
# ---------------------------------------------------------------------------

async def sync_bot_users_from_conversations() -> int:
    """Create minimal bot_user records from conversation sender data.

    This is the lowest-priority source — it only inserts users that don't
    already exist (case-insensitive match on platform_user_id).  It skips
    rows where sender_name equals sender_platform_id (Telegram numeric IDs
    used as placeholder names).
    """
    async with async_session() as session:
        result = await session.execute(sa_text("""
            SELECT DISTINCT ON (LOWER(c.sender_platform_id))
                c.sender_platform_id, c.sender_name, c.platform
            FROM conversations c
            WHERE c.sender_type = 'user'
              AND c.sender_platform_id IS NOT NULL
              AND c.sender_platform_id != ''
              AND NOT EXISTS (
                  SELECT 1 FROM bot_users bu
                  WHERE LOWER(bu.platform_user_id) = LOWER(c.sender_platform_id)
              )
            ORDER BY LOWER(c.sender_platform_id),
                     CASE WHEN c.sender_name IS NOT NULL
                               AND c.sender_name != ''
                               AND c.sender_name != c.sender_platform_id
                          THEN 0 ELSE 1 END,
                     c.timestamp DESC
        """))
        rows = result.fetchall()

    if not rows:
        return 0

    count = 0
    async with async_session() as session:
        for sender_platform_id, sender_name, platform in rows:
            # Skip if sender_name is just the platform ID (no real name)
            display_name = ""
            if sender_name and sender_name != sender_platform_id:
                display_name = sender_name

            await session.execute(sa_text("""
                INSERT INTO bot_users
                    (id, platform_user_id, platform, display_name,
                     role, status, created_at, updated_at)
                VALUES
                    (:id, :platform_user_id, :platform, :display_name,
                     :role, :status, :created_at, :updated_at)
                ON CONFLICT (platform_user_id) DO NOTHING
            """), {
                "id": str(uuid.uuid4()),
                "platform_user_id": sender_platform_id,
                "platform": platform or "unknown",
                "display_name": display_name,
                "role": "",
                "status": "",
                "created_at": utcnow(),
                "updated_at": utcnow(),
            })
            count += 1

        await session.commit()

    return count


# ---------------------------------------------------------------------------
# 8. Agent Memory
# ---------------------------------------------------------------------------

def _parse_memory_md(file_path: Path) -> dict | None:
    """Parse a memory markdown file and extract structured data."""
    try:
        text = file_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None

    session_id = None
    agent_id = "main"
    session_date = None

    date_match = re.search(r"# Session:\s*(.+)", text)
    if date_match:
        try:
            date_str = date_match.group(1).strip().replace(" UTC", "").strip()
            session_date = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
        except (ValueError, TypeError):
            pass

    key_match = re.search(r"\*\*Session Key\*\*:\s*(.+)", text)
    if key_match:
        parts = key_match.group(1).strip().split(":")
        if len(parts) > 1:
            agent_id = parts[1]

    id_match = re.search(r"\*\*Session ID\*\*:\s*([a-f0-9-]+)", text)
    if id_match:
        try:
            session_id = uuid.UUID(id_match.group(1).strip())
        except ValueError:
            pass

    return {
        "agent_id": agent_id,
        "session_id": session_id,
        "content": text.strip(),
        "filename": file_path.name,
        "created_at": session_date or utcnow(),
    }


async def sync_memory() -> int:
    """Import memory entries from markdown files and optional SQLite database."""
    count = 0

    # --- Markdown files ---
    if WORKSPACE_MEMORY_DIR.is_dir():
        async with async_session() as session:
            result = await session.execute(
                select(AgentMemory.source).where(
                    AgentMemory.source.like("file:%")
                )
            )
            existing_sources = {r[0] for r in result.all()}

        for md_path in sorted(WORKSPACE_MEMORY_DIR.glob("*.md")):
            source_key = f"file:{md_path.name}"
            if source_key in existing_sources:
                continue

            parsed = _parse_memory_md(md_path)
            if not parsed or not parsed["content"]:
                continue

            # Verify FK if session_id is set
            source_session_id = parsed["session_id"]
            if source_session_id:
                async with async_session() as session:
                    exists = await session.get(Session, source_session_id)
                    if not exists:
                        source_session_id = None

            async with async_session() as session:
                entry = AgentMemory(
                    agent_id=parsed["agent_id"],
                    memory_type="summary",
                    content=parsed["content"],
                    source=source_key,
                    source_session_id=source_session_id,
                    created_at=parsed["created_at"],
                    updated_at=parsed["created_at"],
                )
                session.add(entry)
                await session.commit()

            count += 1

    # --- SQLite database ---
    if SQLITE_MEMORY_PATH.exists():
        try:
            import sqlite3

            conn = sqlite3.connect(str(SQLITE_MEMORY_PATH))
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = cursor.fetchall()

            skip_tables = {"meta", "files", "embedding_cache"}
            skip_prefixes = ("chunks_fts",)

            for (table_name,) in tables:
                if table_name in skip_tables:
                    continue
                if any(table_name.startswith(p) for p in skip_prefixes):
                    continue
                if not re.match(r'^[a-zA-Z0-9_]+$', table_name):
                    continue

                cursor.execute(f"PRAGMA table_info({table_name})")
                columns = [col[1] for col in cursor.fetchall()]
                cursor.execute(f"SELECT * FROM {table_name}")
                rows = cursor.fetchall()

                for row in rows:
                    row_dict = dict(zip(columns, row))
                    content = (
                        row_dict.get("content", "")
                        or row_dict.get("text", "")
                        or row_dict.get("value", "")
                        or str(row_dict)
                    )
                    if not content or content == "{}":
                        continue

                    source_key = f"sqlite:{table_name}"

                    # Dedup by source + content prefix
                    async with async_session() as session:
                        existing = (await session.execute(
                            select(AgentMemory).where(
                                AgentMemory.source == source_key,
                                AgentMemory.content == content[:500],
                            )
                        )).scalar_one_or_none()
                        if existing:
                            continue

                    agent_id = row_dict.get(
                        "agent_id", row_dict.get("agent", "main")
                    )
                    memory_type = row_dict.get(
                        "memory_type", row_dict.get("type", "fact")
                    )

                    async with async_session() as session:
                        entry = AgentMemory(
                            agent_id=agent_id,
                            memory_type=memory_type,
                            content=content,
                            source=source_key,
                            created_at=utcnow(),
                            updated_at=utcnow(),
                        )
                        session.add(entry)
                        await session.commit()

                    count += 1

            conn.close()
        except Exception:
            logger.exception("Auto-sync: SQLite memory import failed")

    return count


# ---------------------------------------------------------------------------
# Main entry point (called from server.py startup)
# ---------------------------------------------------------------------------

async def run_auto_sync():
    logger.info("Auto-sync: starting...")

    try:
        n_users = await sync_bot_users()
        if n_users:
            logger.info(f"Auto-sync: {n_users} bot users synced")
    except Exception:
        logger.exception("Auto-sync: bot users sync failed")

    try:
        n_groups = await sync_bot_groups()
        if n_groups:
            logger.info(f"Auto-sync: {n_groups} bot groups synced")
    except Exception:
        logger.exception("Auto-sync: bot groups sync failed")

    try:
        n_group_users = await sync_bot_users_from_group_members()
        if n_group_users:
            logger.info(
                f"Auto-sync: {n_group_users} bot users upserted from group members"
            )
    except Exception:
        logger.exception("Auto-sync: bot users from group members sync failed")

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

    try:
        n_backfill = await backfill_conversation_senders()
        if n_backfill:
            logger.info(
                f"Auto-sync: {n_backfill} conversation senders backfilled"
            )
    except Exception:
        logger.exception("Auto-sync: conversation sender backfill failed")

    try:
        n_conv_users = await sync_bot_users_from_conversations()
        if n_conv_users:
            logger.info(
                f"Auto-sync: {n_conv_users} bot users created from conversations"
            )
    except Exception:
        logger.exception("Auto-sync: bot users from conversations sync failed")

    try:
        n_memory = await sync_memory()
        if n_memory:
            logger.info(f"Auto-sync: {n_memory} new memory entries imported")
    except Exception:
        logger.exception("Auto-sync: memory sync failed")

    logger.info("Auto-sync: complete")
