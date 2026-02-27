import uuid as _uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import select
from sqlalchemy import desc, func

from auth import get_current_user
from database import async_session
from models.session import Session
from models.conversation import Conversation

session_router = APIRouter(prefix="/sessions", tags=["sessions"])


def _session_to_dict(s: Session, message_count: int = 0) -> dict:
    return {
        "id": str(s.id),
        "session_key": s.session_key,
        "agent_id": s.agent_id,
        "platform": s.platform,
        "peer_id": s.peer_id,
        "model_used": s.model_used,
        "total_tokens": s.total_tokens,
        "status": s.status,
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "last_activity_at": s.last_activity_at.isoformat() if s.last_activity_at else None,
        "context_summary": s.context_summary,
        "message_count": message_count,
    }


@session_router.get("/persistent")
async def list_persistent_sessions(
    agent_id: str = Query("", max_length=100),
    platform: str = Query("", max_length=50),
    status: str = Query("", max_length=20),
    limit: int = Query(100, ge=1, le=500),
    user=Depends(get_current_user),
):
    filters = []
    if agent_id:
        filters.append(Session.agent_id == agent_id)
    if platform:
        filters.append(Session.platform == platform)
    if status:
        filters.append(Session.status == status)

    async with async_session() as session:
        result = await session.execute(
            select(Session)
            .where(*filters)
            .order_by(desc(Session.last_activity_at))
            .limit(limit)
        )
        rows = result.scalars().all()
    return [_session_to_dict(s) for s in rows]


@session_router.get("/persistent/{session_id}")
async def get_persistent_session(session_id: str, user=Depends(get_current_user)):
    try:
        sid = _uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(400, "Invalid session ID")

    async with async_session() as session:
        sess_row = await session.get(Session, sid)
        if not sess_row:
            raise HTTPException(404, "Session not found")
        # Count messages in this session
        count_result = await session.execute(
            select(func.count()).select_from(Conversation)
            .where(Conversation.session_id == sid)
        )
        message_count = count_result.scalar() or 0
    return _session_to_dict(sess_row, message_count=message_count)
