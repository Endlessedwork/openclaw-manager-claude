import uuid as _uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import select
from sqlalchemy import desc

from auth import get_current_user
from database import async_session
from models.conversation import Conversation

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
