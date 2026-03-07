import logging
import re
import uuid as _uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import select
from sqlalchemy import desc, func, distinct

from fastapi.responses import PlainTextResponse

from auth import get_current_user
from auto_sync import sync_single_session
from database import async_session
from models.conversation import Conversation
from models.session import Session
from models.bot_user import BotUser

logger = logging.getLogger(__name__)

conversation_router = APIRouter(prefix="/conversations", tags=["conversations"])


def _conversation_to_dict(c: Conversation) -> dict:
    return {
        "id": str(c.id),
        "session_id": str(c.session_id) if c.session_id else None,
        "agent_id": c.agent_id,
        "platform": c.platform,
        "peer_id": c.peer_id,
        "sender_type": c.sender_type,
        "sender_name": c.sender_name,
        "sender_platform_id": c.sender_platform_id,
        "message": c.message,
        "message_type": c.message_type,
        "metadata": c.meta,
        "timestamp": c.timestamp.isoformat() if c.timestamp else None,
    }


@conversation_router.get("")
async def list_conversations(
    session_id: str = Query("", max_length=100),
    agent_id: str = Query("", max_length=100),
    platform: str = Query("", max_length=50),
    peer_id: str = Query("", max_length=200),
    limit: int = Query(100, ge=1, le=500),
    user=Depends(get_current_user),
):
    filters = []
    if session_id:
        try:
            sid = _uuid.UUID(session_id)
        except ValueError:
            raise HTTPException(400, "Invalid session_id UUID")
        filters.append(Conversation.session_id == sid)
    if agent_id:
        filters.append(Conversation.agent_id == agent_id)
    if platform:
        filters.append(Conversation.platform == platform)
    if peer_id:
        filters.append(Conversation.peer_id == peer_id)

    async with async_session() as session:
        result = await session.execute(
            select(Conversation)
            .where(*filters)
            .order_by(desc(Conversation.timestamp))
            .limit(limit)
        )
        rows = result.scalars().all()
    return [_conversation_to_dict(c) for c in rows]


@conversation_router.get("/by-session-key")
async def get_conversations_by_session_key(
    session_key: str = Query(..., min_length=1, max_length=300),
    limit: int = Query(500, ge=1, le=2000),
    user=Depends(get_current_user),
):
    # On-demand sync: import new messages from JSONL before querying
    try:
        n = await sync_single_session(session_key)
        if n:
            logger.info(f"On-demand sync: {n} new messages for {session_key}")
    except Exception:
        logger.exception(f"On-demand sync failed for {session_key}")

    async with async_session() as session:
        result = await session.execute(
            select(Session).where(Session.session_key == session_key)
        )
        sess = result.scalar_one_or_none()
        if not sess:
            return []
        result = await session.execute(
            select(Conversation)
            .where(Conversation.session_id == sess.id)
            .order_by(Conversation.timestamp)
            .limit(limit)
        )
        convos = result.scalars().all()

        # Look up user profiles by sender_platform_id.
        # Both tables now use raw IDs (e.g. "U...", "123") — no platform prefix.
        platform_ids = {
            c.sender_platform_id
            for c in convos
            if c.sender_platform_id
        }
        user_lookup: dict = {}
        if platform_ids:
            # Case-insensitive matching: session keys use lowercase IDs
            # but bot_users stores original case (e.g. "Ubc9c7dda..." vs "ubc9c7dda...")
            lower_ids = [pid.lower() for pid in platform_ids]
            result = await session.execute(
                select(BotUser).where(
                    func.lower(BotUser.platform_user_id).in_(lower_ids)
                )
            )
            for bu in result.scalars().all():
                user_lookup[bu.platform_user_id.lower()] = {
                    "display_name": bu.display_name,
                    "avatar_url": bu.avatar_url,
                }

        enriched = []
        for c in convos:
            d = _conversation_to_dict(c)
            profile = user_lookup.get((c.sender_platform_id or "").lower(), {})
            d["display_name"] = profile.get("display_name", "")
            d["avatar_url"] = profile.get("avatar_url")
            enriched.append(d)

        return enriched


@conversation_router.get("/session/{session_id}")
async def get_session_conversations(
    session_id: str,
    limit: int = Query(500, ge=1, le=2000),
    user=Depends(get_current_user),
):
    try:
        sid = _uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(400, "Invalid session_id UUID")

    async with async_session() as session:
        result = await session.execute(
            select(Conversation)
            .where(Conversation.session_id == sid)
            .order_by(Conversation.timestamp)
            .limit(limit)
        )
        rows = result.scalars().all()
    return [_conversation_to_dict(c) for c in rows]


@conversation_router.get("/recent-by-peer")
async def recent_by_peer(
    platform: str = Query(..., min_length=1, max_length=50),
    peer_id: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(5, ge=1, le=20),
):
    """Return recent conversation messages for a peer as plain text.

    No auth required — intended for localhost hook calls only.
    """
    # Sync latest messages from JSONL before querying
    async with async_session() as db:
        result = await db.execute(
            select(Session.session_key).where(
                func.lower(Session.platform) == platform.lower(),
                func.lower(Session.peer_id) == peer_id.lower(),
            ).order_by(desc(Session.last_activity_at)).limit(1)
        )
        latest_key = result.scalar_one_or_none()
    if latest_key:
        try:
            n = await sync_single_session(latest_key)
            if n:
                logger.info(f"On-demand sync: {n} new msgs for {latest_key}")
        except Exception:
            logger.exception(f"On-demand sync failed for {latest_key}")

    async with async_session() as session:
        # Find all sessions for this peer (case-insensitive)
        sess_result = await session.execute(
            select(Session.id).where(
                func.lower(Session.platform) == platform.lower(),
                func.lower(Session.peer_id) == peer_id.lower(),
            )
        )
        session_ids = [row[0] for row in sess_result.all()]

        if not session_ids:
            return PlainTextResponse("")

        # Get recent messages across all sessions for this peer
        # Use distinct on (timestamp, sender_type, message) to deduplicate
        result = await session.execute(
            select(Conversation)
            .where(
                Conversation.session_id.in_(session_ids),
                Conversation.sender_type.in_(["user", "agent"]),
                Conversation.message_type == "text",
            )
            .order_by(desc(Conversation.timestamp))
            .limit(limit * 4)  # fetch extra to account for dupes
        )
        all_msgs = result.scalars().all()

        # Deduplicate by (timestamp, sender_type, message[:100])
        # Also skip system-injected messages (session reset prompts)
        seen = set()
        messages = []
        for m in all_msgs:
            msg = m.message or ""
            # Skip system-injected messages
            if m.sender_type == "user" and msg.startswith(
                "A new session was started"
            ):
                continue
            if m.sender_type == "agent" and msg.startswith(
                "\u2705 New session started"
            ):
                continue
            key = (m.timestamp, m.sender_type, msg[:100])
            if key not in seen:
                seen.add(key)
                messages.append(m)
        messages = list(reversed(messages[:limit]))

    if not messages:
        return PlainTextResponse("")

    lines = [f"## Recent Conversation ({platform}: {peer_id})", ""]
    for m in messages:
        ts = m.timestamp.strftime("%Y-%m-%d %H:%M") if m.timestamp else "?"
        msg = m.message or ""
        # Strip gateway metadata prefix from user messages
        # Handles both "Conversation info..." and "Sender (untrusted metadata)..." formats
        # Use rsplit to get content after the LAST ``` block (may have multiple)
        if m.sender_type == "user" and "```\n\n" in msg:
            msg = msg.rsplit("```\n\n", 1)[-1]
        # Strip [[reply_to_*]] directives from assistant messages
        if m.sender_type == "agent" and msg.startswith("[["):
            idx = msg.find("]]")
            if idx != -1:
                msg = msg[idx + 2:].lstrip()
        msg = msg.strip()
        if not msg:
            continue
        if m.sender_type == "user":
            name = m.sender_name or "User"
            lines.append(f"[{ts}] User ({name}): {msg}")
        else:
            # Truncate long assistant messages
            if len(msg) > 300:
                msg = msg[:300] + "..."
            lines.append(f"[{ts}] Assistant: {msg}")

    return PlainTextResponse("\n".join(lines) + "\n")


@conversation_router.get("/{conversation_id}")
async def get_conversation(conversation_id: str, user=Depends(get_current_user)):
    try:
        cid = _uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(400, "Invalid conversation ID")

    async with async_session() as session:
        conv = await session.get(Conversation, cid)
    if not conv:
        raise HTTPException(404, "Conversation message not found")
    return _conversation_to_dict(conv)
