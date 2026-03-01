import uuid as _uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import select
from sqlalchemy import desc

from auth import require_role
from database import async_session
from models.ai_chat import AIChatThread, AIChatMessage
from services.ai_chat_service import stream_chat
from utils import utcnow

ai_chat_router = APIRouter(prefix="/ai-chat", tags=["ai-chat"])


class SendMessageRequest(BaseModel):
    thread_id: Optional[str] = None
    message: str


@ai_chat_router.post("/messages")
async def send_message(
    req: SendMessageRequest,
    user=Depends(require_role("superadmin")),
):
    user_id = _uuid.UUID(user["id"]) if isinstance(user["id"], str) else user["id"]

    async with async_session() as session:
        if req.thread_id:
            try:
                tid = _uuid.UUID(req.thread_id)
            except ValueError:
                raise HTTPException(400, "Invalid thread_id")
            thread = await session.get(AIChatThread, tid)
            if not thread:
                raise HTTPException(404, "Thread not found")
        else:
            thread = AIChatThread(user_id=user_id, title=req.message[:100])
            session.add(thread)
            await session.commit()
            await session.refresh(thread)

        thread_id = str(thread.id)

        user_msg = AIChatMessage(thread_id=thread.id, role="user", content=req.message)
        session.add(user_msg)
        await session.commit()

        result = await session.execute(
            select(AIChatMessage).where(AIChatMessage.thread_id == thread.id).order_by(AIChatMessage.created_at)
        )
        all_msgs = result.scalars().all()

    claude_messages = []
    for m in all_msgs:
        if m.role in ("user", "assistant"):
            claude_messages.append({"role": m.role, "content": m.content})

    async def generate():
        full_text = ""
        async for chunk in stream_chat(claude_messages, thread_id):
            if '"full_text"' in chunk:
                import json as _json
                try:
                    data_line = chunk.split("data: ", 1)[1].split("\n")[0]
                    parsed = _json.loads(data_line)
                    full_text = parsed.get("full_text", "")
                except Exception:
                    pass
            yield chunk

        if full_text:
            async with async_session() as session:
                assistant_msg = AIChatMessage(thread_id=_uuid.UUID(thread_id), role="assistant", content=full_text)
                session.add(assistant_msg)
                thread = await session.get(AIChatThread, _uuid.UUID(thread_id))
                if thread:
                    thread.updated_at = utcnow()
                await session.commit()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@ai_chat_router.get("/threads")
async def list_threads(user=Depends(require_role("superadmin"))):
    user_id = _uuid.UUID(user["id"]) if isinstance(user["id"], str) else user["id"]
    async with async_session() as session:
        result = await session.execute(
            select(AIChatThread).where(AIChatThread.user_id == user_id).order_by(desc(AIChatThread.updated_at))
        )
        threads = result.scalars().all()
    return [
        {
            "id": str(t.id),
            "title": t.title,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        }
        for t in threads
    ]


@ai_chat_router.get("/threads/{thread_id}")
async def get_thread(thread_id: str, user=Depends(require_role("superadmin"))):
    try:
        tid = _uuid.UUID(thread_id)
    except ValueError:
        raise HTTPException(400, "Invalid thread_id")
    async with async_session() as session:
        thread = await session.get(AIChatThread, tid)
        if not thread:
            raise HTTPException(404, "Thread not found")
        result = await session.execute(
            select(AIChatMessage).where(AIChatMessage.thread_id == tid).order_by(AIChatMessage.created_at)
        )
        messages = result.scalars().all()
    return {
        "id": str(thread.id),
        "title": thread.title,
        "created_at": thread.created_at.isoformat() if thread.created_at else None,
        "updated_at": thread.updated_at.isoformat() if thread.updated_at else None,
        "messages": [
            {
                "id": str(m.id),
                "role": m.role,
                "content": m.content,
                "tool_name": m.tool_name,
                "tool_input": m.tool_input,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in messages
        ],
    }


@ai_chat_router.delete("/threads/{thread_id}")
async def delete_thread(thread_id: str, user=Depends(require_role("superadmin"))):
    try:
        tid = _uuid.UUID(thread_id)
    except ValueError:
        raise HTTPException(400, "Invalid thread_id")
    async with async_session() as session:
        thread = await session.get(AIChatThread, tid)
        if not thread:
            raise HTTPException(404, "Thread not found")
        await session.delete(thread)
        await session.commit()
    return {"status": "deleted"}
