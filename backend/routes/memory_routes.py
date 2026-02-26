import uuid as _uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from sqlmodel import select
from sqlalchemy import desc

from auth import get_current_user, require_role
from database import async_session
from models.memory import AgentMemory

memory_router = APIRouter(prefix="/memory", tags=["memory"])


class CreateMemoryRequest(BaseModel):
    agent_id: str
    memory_type: str  # fact / preference / instruction / summary
    content: str
    source: str = "manual"


class UpdateMemoryRequest(BaseModel):
    memory_type: Optional[str] = None
    content: Optional[str] = None
    source: Optional[str] = None
    relevance_score: Optional[float] = None


def _memory_to_dict(m: AgentMemory) -> dict:
    return {
        "id": str(m.id),
        "agent_id": m.agent_id,
        "memory_type": m.memory_type,
        "content": m.content,
        "source": m.source,
        "source_session_id": str(m.source_session_id) if m.source_session_id else None,
        "relevance_score": m.relevance_score,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
    }


@memory_router.get("")
async def list_memory(
    agent_id: str = Query("", max_length=100),
    memory_type: str = Query("", max_length=50),
    limit: int = Query(100, ge=1, le=500),
    user=Depends(get_current_user),
):
    filters = []
    if agent_id:
        filters.append(AgentMemory.agent_id == agent_id)
    if memory_type:
        filters.append(AgentMemory.memory_type == memory_type)

    async with async_session() as session:
        result = await session.execute(
            select(AgentMemory)
            .where(*filters)
            .order_by(desc(AgentMemory.created_at))
            .limit(limit)
        )
        rows = result.scalars().all()
    return [_memory_to_dict(m) for m in rows]


@memory_router.post("")
async def create_memory(
    body: CreateMemoryRequest,
    user=Depends(require_role("admin", "editor")),
):
    async with async_session() as session:
        entry = AgentMemory(
            agent_id=body.agent_id,
            memory_type=body.memory_type,
            content=body.content,
            source=body.source,
        )
        session.add(entry)
        await session.commit()
        await session.refresh(entry)
    return _memory_to_dict(entry)


@memory_router.put("/{memory_id}")
async def update_memory(
    memory_id: str,
    body: UpdateMemoryRequest,
    user=Depends(require_role("admin", "editor")),
):
    try:
        mid = _uuid.UUID(memory_id)
    except ValueError:
        raise HTTPException(400, "Invalid memory ID")

    async with async_session() as session:
        entry = await session.get(AgentMemory, mid)
        if not entry:
            raise HTTPException(404, "Memory entry not found")
        if body.memory_type is not None:
            entry.memory_type = body.memory_type
        if body.content is not None:
            entry.content = body.content
        if body.source is not None:
            entry.source = body.source
        if body.relevance_score is not None:
            entry.relevance_score = body.relevance_score
        entry.updated_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(entry)
    return _memory_to_dict(entry)


@memory_router.delete("/{memory_id}")
async def delete_memory(
    memory_id: str,
    user=Depends(require_role("admin", "editor")),
):
    try:
        mid = _uuid.UUID(memory_id)
    except ValueError:
        raise HTTPException(400, "Invalid memory ID")

    async with async_session() as session:
        entry = await session.get(AgentMemory, mid)
        if not entry:
            raise HTTPException(404, "Memory entry not found")
        await session.delete(entry)
        await session.commit()
    return {"status": "ok", "id": memory_id}
