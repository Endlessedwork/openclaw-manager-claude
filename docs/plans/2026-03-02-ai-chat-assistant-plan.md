# AI Chat Assistant — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an AI Chat page where superadmins can ask questions about the bot system and get answers powered by Claude API with tool calling.

**Architecture:** Backend streams Claude API responses via SSE (Server-Sent Events) to the frontend. Claude has tools to query sessions, agents, users, etc. from both CLI and DB. Conversation history is persisted in PostgreSQL.

**Tech Stack:** FastAPI + anthropic SDK (backend), React + fetch ReadableStream (frontend), SSE for streaming, PostgreSQL for history.

**Design doc:** `docs/plans/2026-03-02-ai-chat-assistant-design.md`

---

### Task 1: Add backend dependencies

**Files:**
- Modify: `backend/requirements.txt`

**Step 1: Add anthropic SDK to requirements**

Add `anthropic>=0.49.0` to `backend/requirements.txt` (after the last line).

**Step 2: Install**

Run: `cd /home/walter/openclaw-manager-claude/backend && pip install anthropic>=0.49.0`
Expected: Successfully installed anthropic

**Step 3: Add ANTHROPIC_API_KEY to .env**

Run: `echo 'ANTHROPIC_API_KEY=your-key-here' >> /home/walter/openclaw-manager-claude/backend/.env`
Then prompt the user to set the actual key.

**Step 4: Commit**

```bash
git add backend/requirements.txt
git commit -m "chore: add anthropic SDK dependency"
```

---

### Task 2: Database models for AI chat

**Files:**
- Create: `backend/models/ai_chat.py`
- Modify: `backend/models/__init__.py`

**Step 1: Create the model file**

Create `backend/models/ai_chat.py`:

```python
import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON
from utils import utcnow


class AIChatThread(SQLModel, table=True):
    __tablename__ = "ai_chat_threads"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: int = Field(index=True)
    title: str = ""
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class AIChatMessage(SQLModel, table=True):
    __tablename__ = "ai_chat_messages"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    thread_id: uuid.UUID = Field(foreign_key="ai_chat_threads.id", index=True)
    role: str = ""  # user | assistant | tool_use | tool_result
    content: str = ""
    tool_name: Optional[str] = None
    tool_input: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow)
```

**Step 2: Register models in `__init__.py`**

Add to `backend/models/__init__.py`:

```python
from .ai_chat import AIChatThread, AIChatMessage
```

And add `"AIChatThread", "AIChatMessage"` to `__all__`.

**Step 3: Verify tables create on startup**

Run: `cd /home/walter/openclaw-manager-claude/backend && python -c "
import asyncio
from database import init_db
import models  # registers all models
asyncio.run(init_db())
print('OK')
"`
Expected: `OK` (tables created)

**Step 4: Commit**

```bash
git add backend/models/ai_chat.py backend/models/__init__.py
git commit -m "feat: add AIChatThread and AIChatMessage database models"
```

---

### Task 3: AI chat tool definitions and executor

**Files:**
- Create: `backend/services/ai_chat_tools.py`

This file defines the Claude tool schemas and executes them when called.

**Step 1: Create the tools module**

Create `backend/services/ai_chat_tools.py`:

```python
"""Tool definitions and executor for AI Chat assistant.

Each tool queries system data from CLI (gateway) or DB and returns
a JSON-serializable result for Claude to summarize.
"""
import json
from sqlmodel import select
from sqlalchemy import func, desc

from database import async_session
from gateway_cli import gateway
from models.session import Session
from models.conversation import Conversation
from models.bot_user import BotUser
from models.bot_group import BotGroup

# ── Tool definitions (Claude format) ─────────────────────────

TOOLS = [
    {
        "name": "query_sessions",
        "description": "Get active gateway sessions. Returns list of sessions with agent, channel, model, token usage, and age.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "query_agents",
        "description": "Get list of configured agents with their details (model, skills, channels).",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "query_skills",
        "description": "Get list of all skills available to agents.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "query_models",
        "description": "Get list of model providers and models configured in the gateway.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "query_channels",
        "description": "Get list of channels (LINE, Telegram, etc.) and their status.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "query_health",
        "description": "Get gateway health status including uptime, agent status, and channel connectivity.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "query_cron",
        "description": "Get list of cron jobs configured in the gateway.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "query_bot_users",
        "description": "Search bot users. Can filter by name or platform. Returns display names, platforms, and IDs.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {
                    "type": "string",
                    "description": "Search term to filter users by display name or username.",
                },
                "platform": {
                    "type": "string",
                    "description": "Filter by platform (e.g. 'line', 'telegram').",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results to return. Default 50.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "query_bot_groups",
        "description": "Search bot groups. Can filter by name or platform.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {
                    "type": "string",
                    "description": "Search term to filter groups by name.",
                },
                "platform": {
                    "type": "string",
                    "description": "Filter by platform.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results to return. Default 50.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "query_conversations",
        "description": "Search conversations/messages. Can filter by platform, date range, or search text. Returns recent messages.",
        "input_schema": {
            "type": "object",
            "properties": {
                "platform": {
                    "type": "string",
                    "description": "Filter by platform (e.g. 'line', 'telegram').",
                },
                "search": {
                    "type": "string",
                    "description": "Search term to find in message text.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results to return. Default 30.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "query_usage",
        "description": "Get token usage and cost data for the gateway. Specify number of days to look back.",
        "input_schema": {
            "type": "object",
            "properties": {
                "days": {
                    "type": "integer",
                    "description": "Number of days to look back. Default 7.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "query_dashboard",
        "description": "Get dashboard summary stats: counts of agents, skills, channels, sessions, and recent activity.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
]


# ── Tool executors ────────────────────────────────────────────

async def execute_tool(name: str, input_data: dict) -> str:
    """Execute a tool and return the result as a JSON string."""
    try:
        result = await _EXECUTORS[name](input_data)
        return json.dumps(result, ensure_ascii=False, default=str)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


async def _query_sessions(_input):
    data = await gateway.sessions()
    return data


async def _query_agents(_input):
    data = await gateway.agents()
    return data


async def _query_skills(_input):
    data = await gateway.skills()
    return data


async def _query_models(_input):
    data = await gateway.models()
    return data


async def _query_channels(_input):
    config = await gateway.config_read()
    channels = config.get("channels", {})
    return {"channels": channels}


async def _query_health(_input):
    data = await gateway.health()
    return data


async def _query_cron(_input):
    data = await gateway.cron_jobs()
    return data


async def _query_bot_users(input_data):
    search = input_data.get("search", "")
    platform = input_data.get("platform", "")
    limit = input_data.get("limit", 50)

    async with async_session() as session:
        stmt = select(BotUser)
        if search:
            stmt = stmt.where(
                func.lower(BotUser.display_name).contains(search.lower())
            )
        if platform:
            stmt = stmt.where(func.lower(BotUser.platform) == platform.lower())
        stmt = stmt.limit(limit)
        result = await session.execute(stmt)
        rows = result.scalars().all()

    return {
        "users": [
            {
                "id": str(u.id),
                "display_name": u.display_name,
                "platform": u.platform,
                "platform_user_id": u.platform_user_id,
            }
            for u in rows
        ],
        "count": len(rows),
    }


async def _query_bot_groups(input_data):
    search = input_data.get("search", "")
    platform = input_data.get("platform", "")
    limit = input_data.get("limit", 50)

    async with async_session() as session:
        stmt = select(BotGroup)
        if search:
            stmt = stmt.where(
                func.lower(BotGroup.name).contains(search.lower())
            )
        if platform:
            stmt = stmt.where(func.lower(BotGroup.platform) == platform.lower())
        stmt = stmt.limit(limit)
        result = await session.execute(stmt)
        rows = result.scalars().all()

    return {
        "groups": [
            {
                "id": str(g.id),
                "name": g.name,
                "platform": g.platform,
                "platform_group_id": g.platform_group_id,
            }
            for g in rows
        ],
        "count": len(rows),
    }


async def _query_conversations(input_data):
    platform = input_data.get("platform", "")
    search = input_data.get("search", "")
    limit = input_data.get("limit", 30)

    async with async_session() as session:
        stmt = select(Conversation).order_by(desc(Conversation.timestamp))
        if platform:
            stmt = stmt.where(func.lower(Conversation.platform) == platform.lower())
        if search:
            stmt = stmt.where(Conversation.message.ilike(f"%{search}%"))
        stmt = stmt.limit(limit)
        result = await session.execute(stmt)
        rows = result.scalars().all()

    return {
        "conversations": [
            {
                "sender_type": c.sender_type,
                "sender_name": c.sender_name,
                "platform": c.platform,
                "message": c.message[:500],
                "timestamp": c.timestamp.isoformat() if c.timestamp else None,
            }
            for c in rows
        ],
        "count": len(rows),
    }


async def _query_usage(input_data):
    days = input_data.get("days", 7)
    data = await gateway.usage_cost(days=days)
    return data


async def _query_dashboard(_input):
    try:
        agents = await gateway.agents()
        sessions = await gateway.sessions()
        skills = await gateway.skills()
        health = await gateway.health()
        return {
            "agents_count": len(agents.get("agents", [])),
            "sessions_count": len(sessions.get("sessions", [])),
            "skills_count": len(skills.get("skills", [])),
            "gateway_ok": health.get("ok", False),
        }
    except Exception as e:
        return {"error": str(e)}


_EXECUTORS = {
    "query_sessions": _query_sessions,
    "query_agents": _query_agents,
    "query_skills": _query_skills,
    "query_models": _query_models,
    "query_channels": _query_channels,
    "query_health": _query_health,
    "query_cron": _query_cron,
    "query_bot_users": _query_bot_users,
    "query_bot_groups": _query_bot_groups,
    "query_conversations": _query_conversations,
    "query_usage": _query_usage,
    "query_dashboard": _query_dashboard,
}
```

**Step 2: Commit**

```bash
git add backend/services/ai_chat_tools.py
git commit -m "feat: add AI chat tool definitions and executors"
```

---

### Task 4: AI chat service (Claude API + streaming)

**Files:**
- Create: `backend/services/ai_chat_service.py`

This is the core service that manages the Claude API conversation loop with tool calling and SSE streaming.

**Step 1: Create the service**

Create `backend/services/ai_chat_service.py`:

```python
"""AI Chat service — manages Claude API conversation with tool calling.

Yields SSE-formatted events:
  event: message_start\ndata: {"thread_id": "..."}\n\n
  event: content_delta\ndata: {"text": "..."}\n\n
  event: tool_use\ndata: {"tool_name": "...", "status": "calling"}\n\n
  event: tool_use\ndata: {"tool_name": "...", "status": "done"}\n\n
  event: message_done\ndata: {}\n\n
  event: error\ndata: {"detail": "..."}\n\n
"""
import os
import json
import anthropic
from services.ai_chat_tools import TOOLS, execute_tool

SYSTEM_PROMPT = """You are an AI assistant for the OpenClaw bot management dashboard.
You help administrators query and understand their bot system — sessions, agents, users, channels, models, usage, and more.
You have tools to query live system data. Always use tools to get real data before answering — do not guess or make up information.
Answer in the same language the user uses. Be concise and helpful.
When presenting data, use markdown tables or bullet lists for clarity."""


def _get_client():
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not configured")
    return anthropic.Anthropic(api_key=api_key)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def stream_chat(messages: list[dict], thread_id: str):
    """Generator that yields SSE-formatted strings.

    Args:
        messages: Conversation history in Claude format
            [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}, ...]
        thread_id: UUID string of the thread
    """
    yield _sse("message_start", {"thread_id": thread_id})

    client = _get_client()
    full_response = ""
    max_tool_rounds = 5  # prevent infinite tool loops

    # Build initial request
    current_messages = list(messages)

    for _round in range(max_tool_rounds + 1):
        try:
            with client.messages.stream(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                messages=current_messages,
                tools=TOOLS,
            ) as stream:
                tool_uses = []
                current_text = ""

                for event in stream:
                    if event.type == "content_block_start":
                        if event.content_block.type == "tool_use":
                            tool_uses.append({
                                "id": event.content_block.id,
                                "name": event.content_block.name,
                                "input_json": "",
                            })
                            yield _sse("tool_use", {
                                "tool_name": event.content_block.name,
                                "status": "calling",
                            })
                    elif event.type == "content_block_delta":
                        if hasattr(event.delta, "text"):
                            current_text += event.delta.text
                            full_response += event.delta.text
                            yield _sse("content_delta", {"text": event.delta.text})
                        elif hasattr(event.delta, "partial_json"):
                            if tool_uses:
                                tool_uses[-1]["input_json"] += event.delta.partial_json

                # Check if we need to handle tool calls
                response = stream.get_final_message()

                if response.stop_reason == "tool_use":
                    # Build assistant message with all content blocks
                    assistant_content = []
                    for block in response.content:
                        if block.type == "text":
                            assistant_content.append({
                                "type": "text",
                                "text": block.text,
                            })
                        elif block.type == "tool_use":
                            assistant_content.append({
                                "type": "tool_use",
                                "id": block.id,
                                "name": block.name,
                                "input": block.input,
                            })

                    current_messages.append({
                        "role": "assistant",
                        "content": assistant_content,
                    })

                    # Execute tools and add results
                    tool_results = []
                    for block in response.content:
                        if block.type == "tool_use":
                            result = await execute_tool(block.name, block.input)
                            tool_results.append({
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": result,
                            })
                            yield _sse("tool_use", {
                                "tool_name": block.name,
                                "status": "done",
                            })

                    current_messages.append({
                        "role": "user",
                        "content": tool_results,
                    })
                    # Continue loop for next Claude call
                    continue
                else:
                    # No more tool calls — we're done
                    break

        except anthropic.APIError as e:
            yield _sse("error", {"detail": f"Claude API error: {str(e)}"})
            return
        except Exception as e:
            yield _sse("error", {"detail": str(e)})
            return

    yield _sse("message_done", {"full_text": full_response})
```

**Step 2: Commit**

```bash
git add backend/services/ai_chat_service.py
git commit -m "feat: add AI chat service with Claude streaming and tool calling"
```

---

### Task 5: AI chat API routes

**Files:**
- Create: `backend/routes/ai_chat_routes.py`
- Modify: `backend/server.py` (add router import + include)

**Step 1: Create the routes file**

Create `backend/routes/ai_chat_routes.py`:

```python
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
    """Send a message and stream AI response via SSE."""
    user_id = int(user["id"]) if isinstance(user["id"], str) and user["id"].isdigit() else user["id"]

    async with async_session() as session:
        # Get or create thread
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

        # Save user message
        user_msg = AIChatMessage(
            thread_id=thread.id,
            role="user",
            content=req.message,
        )
        session.add(user_msg)
        await session.commit()

        # Load conversation history for Claude
        result = await session.execute(
            select(AIChatMessage)
            .where(AIChatMessage.thread_id == thread.id)
            .order_by(AIChatMessage.created_at)
        )
        all_msgs = result.scalars().all()

    # Build Claude messages from history
    claude_messages = []
    for m in all_msgs:
        if m.role == "user":
            claude_messages.append({"role": "user", "content": m.content})
        elif m.role == "assistant":
            claude_messages.append({"role": "assistant", "content": m.content})

    # Stream response
    async def generate():
        full_text = ""
        async for chunk in stream_chat(claude_messages, thread_id):
            # Capture full text from the message_done event
            if '"full_text"' in chunk:
                import json as _json
                try:
                    data_line = chunk.split("data: ", 1)[1].split("\n")[0]
                    parsed = _json.loads(data_line)
                    full_text = parsed.get("full_text", "")
                except Exception:
                    pass
            yield chunk

        # Save assistant response after streaming completes
        if full_text:
            async with async_session() as session:
                assistant_msg = AIChatMessage(
                    thread_id=_uuid.UUID(thread_id),
                    role="assistant",
                    content=full_text,
                )
                session.add(assistant_msg)
                # Update thread timestamp
                thread = await session.get(AIChatThread, _uuid.UUID(thread_id))
                if thread:
                    thread.updated_at = utcnow()
                await session.commit()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@ai_chat_router.get("/threads")
async def list_threads(
    user=Depends(require_role("superadmin")),
):
    """List all threads for the current user."""
    user_id = int(user["id"]) if isinstance(user["id"], str) and user["id"].isdigit() else user["id"]

    async with async_session() as session:
        result = await session.execute(
            select(AIChatThread)
            .where(AIChatThread.user_id == user_id)
            .order_by(desc(AIChatThread.updated_at))
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
async def get_thread(
    thread_id: str,
    user=Depends(require_role("superadmin")),
):
    """Get thread with all messages."""
    try:
        tid = _uuid.UUID(thread_id)
    except ValueError:
        raise HTTPException(400, "Invalid thread_id")

    async with async_session() as session:
        thread = await session.get(AIChatThread, tid)
        if not thread:
            raise HTTPException(404, "Thread not found")

        result = await session.execute(
            select(AIChatMessage)
            .where(AIChatMessage.thread_id == tid)
            .order_by(AIChatMessage.created_at)
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
async def delete_thread(
    thread_id: str,
    user=Depends(require_role("superadmin")),
):
    """Delete a thread and all its messages."""
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
```

**Step 2: Register the router in server.py**

Add to imports in `backend/server.py` (after line ~38):
```python
from routes.ai_chat_routes import ai_chat_router
```

Add to router registration (after line ~129):
```python
api_router.include_router(ai_chat_router)
```

**Step 3: Verify backend starts**

Run: `cd /home/walter/openclaw-manager-claude/backend && timeout 5 python -m uvicorn server:app --host 0.0.0.0 --port 18001 2>&1 | head -20`
Expected: Server starts without import errors

**Step 4: Commit**

```bash
git add backend/routes/ai_chat_routes.py backend/server.py
git commit -m "feat: add AI chat API routes (SSE streaming, thread CRUD)"
```

---

### Task 6: Frontend API helpers (SSE streaming)

**Files:**
- Modify: `frontend/src/lib/api.js`

**Step 1: Add AI chat API functions**

Add to `frontend/src/lib/api.js` (at the end, before any closing comments):

```javascript
// ── AI Chat ──────────────────────────────────────────
export const getAIChatThreads = () => api.get('/ai-chat/threads');
export const getAIChatThread = (threadId) => api.get(`/ai-chat/threads/${threadId}`);
export const deleteAIChatThread = (threadId) => api.delete(`/ai-chat/threads/${threadId}`);

/**
 * Send a message to AI chat and return an SSE reader.
 * Usage:
 *   const { reader, threadId } = await sendAIChatMessage({ message, thread_id });
 *   // read chunks from reader
 */
export const sendAIChatMessage = async ({ message, thread_id }, token) => {
  const baseUrl = process.env.REACT_APP_BACKEND_URL || '';
  const res = await fetch(`${baseUrl}/api/ai-chat/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    body: JSON.stringify({ message, thread_id }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }

  return res.body.getReader();
};
```

**Step 2: Commit**

```bash
git add frontend/src/lib/api.js
git commit -m "feat: add AI chat API helpers with SSE streaming support"
```

---

### Task 7: Add react-markdown dependency

**Files:**
- Modify: `frontend/package.json` (via yarn add)

**Step 1: Install react-markdown**

Run: `cd /home/walter/openclaw-manager-claude/frontend && yarn add react-markdown`

**Step 2: Commit**

```bash
git add frontend/package.json frontend/yarn.lock
git commit -m "chore: add react-markdown for AI chat responses"
```

---

### Task 8: Frontend — ChatInput component

**Files:**
- Create: `frontend/src/components/ai-chat/ChatInput.js`

**Step 1: Create the component**

Create `frontend/src/components/ai-chat/ChatInput.js`:

```jsx
import { useState, useRef } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ChatInput({ onSend, disabled }) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e) => {
    setText(e.target.value);
    // Auto-resize textarea
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  return (
    <div className="border-t border-subtle bg-surface-card px-4 py-3">
      <div className="flex items-end gap-2 max-w-3xl mx-auto">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your bot system..."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-surface-page border border-subtle rounded-lg px-4 py-2.5 text-sm text-theme-primary placeholder:text-theme-faint focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/50 disabled:opacity-50"
        />
        <Button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          size="icon"
          className="shrink-0 h-10 w-10 bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-30"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/ai-chat/ChatInput.js
git commit -m "feat: add ChatInput component for AI chat"
```

---

### Task 9: Frontend — ChatArea component

**Files:**
- Create: `frontend/src/components/ai-chat/ChatArea.js`

**Step 1: Create the component**

Create `frontend/src/components/ai-chat/ChatArea.js`:

```jsx
import { useEffect, useRef } from 'react';
import { Bot, User, Wrench, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex gap-2 max-w-[85%] ${isUser ? 'flex-row-reverse' : ''}`}>
        {/* Avatar */}
        <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold mt-1">
          {isUser ? (
            <div className="w-7 h-7 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <User className="w-3.5 h-3.5" />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center">
              <Bot className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        {/* Bubble */}
        <div className="min-w-0">
          <div className={`mb-1 ${isUser ? 'text-right' : ''}`}>
            <span className={`text-[11px] font-medium ${isUser ? 'text-sky-400' : 'text-orange-400'}`}>
              {isUser ? 'You' : 'AI Assistant'}
            </span>
          </div>
          <div className={`rounded-lg px-3 py-2 text-sm leading-relaxed break-words ${
            isUser
              ? 'bg-surface-card border border-subtle text-theme-primary whitespace-pre-wrap'
              : 'bg-orange-500/10 border border-orange-500/20 text-theme-primary'
          }`}>
            {isUser ? (
              msg.content
            ) : (
              <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:text-theme-primary prose-strong:text-theme-primary prose-code:text-orange-300 prose-code:bg-surface-page prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-surface-page prose-pre:border prose-pre:border-subtle">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolIndicator({ toolName, status }) {
  return (
    <div className="flex justify-start">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border bg-violet-500/10 border-violet-500/20 text-violet-400">
        {status === 'calling' ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Wrench className="w-3 h-3" />
        )}
        {toolName.replace('query_', '')}
        {status === 'calling' && '...'}
      </span>
    </div>
  );
}

function StreamingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex gap-2 max-w-[85%]">
        <div className="w-7 h-7 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0">
          <Bot className="w-3.5 h-3.5" />
        </div>
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse [animation-delay:0.2s]" />
            <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse [animation-delay:0.4s]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChatArea({ messages, streamingText, toolStatus, isStreaming }) {
  const scrollRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, toolStatus]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Bot className="w-12 h-12 text-orange-500/30 mx-auto" />
          <p className="text-theme-faint text-sm">Ask anything about your bot system</p>
          <div className="flex flex-wrap gap-2 justify-center max-w-md">
            {['How many active sessions?', 'Show agent list', 'Gateway health status'].map((q) => (
              <span key={q} className="text-xs text-theme-muted bg-surface-card border border-subtle rounded-full px-3 py-1">
                {q}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
      <div className="max-w-3xl mx-auto space-y-4">
        {messages.map((msg, i) => (
          <MessageBubble key={msg.id || i} msg={msg} />
        ))}

        {/* Tool call indicators */}
        {toolStatus && (
          <ToolIndicator toolName={toolStatus.tool_name} status={toolStatus.status} />
        )}

        {/* Streaming assistant message */}
        {isStreaming && streamingText && (
          <MessageBubble msg={{ role: 'assistant', content: streamingText }} />
        )}

        {/* Typing indicator (before first text arrives) */}
        {isStreaming && !streamingText && !toolStatus && (
          <StreamingIndicator />
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/ai-chat/ChatArea.js
git commit -m "feat: add ChatArea component with message bubbles, tool indicators, streaming"
```

---

### Task 10: Frontend — ThreadSidebar component

**Files:**
- Create: `frontend/src/components/ai-chat/ThreadSidebar.js`

**Step 1: Create the component**

Create `frontend/src/components/ai-chat/ThreadSidebar.js`:

```jsx
import { Plus, MessageSquare, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';

export default function ThreadSidebar({ threads, activeThreadId, onSelectThread, onNewThread, onDeleteThread }) {
  return (
    <div className="w-64 border-r border-subtle bg-surface-card flex flex-col shrink-0">
      {/* Header */}
      <div className="p-3 border-b border-subtle">
        <Button
          onClick={onNewThread}
          variant="outline"
          size="sm"
          className="w-full border-subtle text-theme-secondary hover:text-theme-primary hover:border-orange-500/30"
        >
          <Plus className="w-4 h-4 mr-2" /> New Chat
        </Button>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto py-1">
        {threads.length === 0 ? (
          <p className="text-theme-faint text-xs text-center py-8">No conversations yet</p>
        ) : (
          threads.map((t) => (
            <div
              key={t.id}
              onClick={() => onSelectThread(t.id)}
              className={`group flex items-center gap-2 px-3 py-2 mx-1 rounded-md cursor-pointer transition-colors ${
                t.id === activeThreadId
                  ? 'bg-orange-500/10 text-orange-400'
                  : 'text-theme-secondary hover:bg-muted/30 hover:text-theme-primary'
              }`}
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{t.title || 'Untitled'}</p>
                <p className="text-[10px] text-theme-faint">
                  {t.updated_at
                    ? formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })
                    : ''}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteThread(t.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-theme-faint hover:text-red-400 transition-all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/ai-chat/ThreadSidebar.js
git commit -m "feat: add ThreadSidebar component for AI chat thread list"
```

---

### Task 11: Frontend — AIChatPage (main page)

**Files:**
- Create: `frontend/src/pages/AIChatPage.js`

**Step 1: Create the page**

Create `frontend/src/pages/AIChatPage.js`:

```jsx
import { useState, useEffect, useCallback } from 'react';
import { Bot } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { getAIChatThreads, getAIChatThread, deleteAIChatThread, sendAIChatMessage } from '@/lib/api';
import ThreadSidebar from '@/components/ai-chat/ThreadSidebar';
import ChatArea from '@/components/ai-chat/ChatArea';
import ChatInput from '@/components/ai-chat/ChatInput';

export default function AIChatPage() {
  const { token } = useAuth();
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [toolStatus, setToolStatus] = useState(null);

  // Load threads
  const loadThreads = useCallback(async () => {
    try {
      const res = await getAIChatThreads();
      setThreads(res.data);
    } catch {
      // silent — threads list is non-critical
    }
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  // Load thread messages
  const selectThread = useCallback(async (threadId) => {
    setActiveThreadId(threadId);
    setStreamingText('');
    setToolStatus(null);
    try {
      const res = await getAIChatThread(threadId);
      setMessages(res.data.messages || []);
    } catch {
      toast.error('Failed to load conversation');
    }
  }, []);

  // New thread
  const handleNewThread = () => {
    setActiveThreadId(null);
    setMessages([]);
    setStreamingText('');
    setToolStatus(null);
  };

  // Delete thread
  const handleDeleteThread = async (threadId) => {
    try {
      await deleteAIChatThread(threadId);
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      if (activeThreadId === threadId) {
        setActiveThreadId(null);
        setMessages([]);
      }
      toast.success('Conversation deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  // Send message
  const handleSend = async (text) => {
    if (isStreaming) return;

    // Optimistically add user message
    const userMsg = { id: `temp-${Date.now()}`, role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setStreamingText('');
    setToolStatus(null);

    try {
      const reader = await sendAIChatMessage(
        { message: text, thread_id: activeThreadId },
        token,
      );

      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let currentThreadId = activeThreadId;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete line in buffer

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);

              switch (eventType) {
                case 'message_start':
                  if (data.thread_id && !currentThreadId) {
                    currentThreadId = data.thread_id;
                    setActiveThreadId(data.thread_id);
                  }
                  break;
                case 'content_delta':
                  fullText += data.text;
                  setStreamingText(fullText);
                  break;
                case 'tool_use':
                  setToolStatus(data);
                  if (data.status === 'done') {
                    // Clear after a short delay
                    setTimeout(() => setToolStatus(null), 500);
                  }
                  break;
                case 'message_done':
                  // Finalize: add assistant message to messages
                  setMessages((prev) => [
                    ...prev,
                    { id: `ai-${Date.now()}`, role: 'assistant', content: fullText },
                  ]);
                  setStreamingText('');
                  break;
                case 'error':
                  toast.error(data.detail || 'AI error');
                  break;
                default:
                  break;
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }

      // Reload threads (new thread may have been created)
      loadThreads();
    } catch (e) {
      toast.error(e.message || 'Failed to send message');
    } finally {
      setIsStreaming(false);
      setToolStatus(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-theme-primary flex items-center gap-2">
          <Bot className="w-6 h-6 text-orange-500" /> AI Assistant
        </h1>
        <p className="text-theme-faint text-sm mt-1">Ask questions about your bot system</p>
      </div>

      <div className="bg-surface-card border border-subtle rounded-xl overflow-hidden flex" style={{ height: 'calc(100vh - 200px)' }}>
        <ThreadSidebar
          threads={threads}
          activeThreadId={activeThreadId}
          onSelectThread={selectThread}
          onNewThread={handleNewThread}
          onDeleteThread={handleDeleteThread}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <ChatArea
            messages={messages}
            streamingText={streamingText}
            toolStatus={toolStatus}
            isStreaming={isStreaming}
          />
          <ChatInput onSend={handleSend} disabled={isStreaming} />
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/pages/AIChatPage.js
git commit -m "feat: add AIChatPage with SSE streaming, thread management, tool indicators"
```

---

### Task 12: Add route and sidebar entry

**Files:**
- Modify: `frontend/src/App.js`
- Modify: `frontend/src/layout/Sidebar.js`
- Modify: `frontend/src/layout/MainLayout.js`

**Step 1: Add import and route in App.js**

In `frontend/src/App.js`, add import with the other page imports:
```javascript
import AIChatPage from './pages/AIChatPage';
```

Add route inside the authenticated layout block (after other superadmin routes like `/users`):
```jsx
<Route path="/ai-chat" element={<ProtectedRoute roles={["superadmin"]}><AIChatPage /></ProtectedRoute>} />
```

**Step 2: Add sidebar entry in Sidebar.js**

In `frontend/src/layout/Sidebar.js`, add `BrainCircuit` to the lucide-react import (if not already there).

Add a new standalone nav group entry in the `navGroups` array. Place it after the dashboard entry:
```javascript
{ id: 'ai-chat', type: 'standalone', roles: ['superadmin'], items: [{ path: '/ai-chat', label: 'AI Assistant', icon: BrainCircuit }] },
```

**Step 3: Add page title in MainLayout.js**

In `frontend/src/layout/MainLayout.js`, find the `PAGE_TITLES` object and add:
```javascript
'/ai-chat': 'AI Assistant',
```

**Step 4: Verify frontend compiles**

Run: `cd /home/walter/openclaw-manager-claude/frontend && yarn build 2>&1 | tail -5`
Expected: Compiled successfully

**Step 5: Commit**

```bash
git add frontend/src/App.js frontend/src/layout/Sidebar.js frontend/src/layout/MainLayout.js
git commit -m "feat: add AI Assistant route, sidebar entry, and page title"
```

---

### Task 13: End-to-end testing and polish

**Step 1: Set ANTHROPIC_API_KEY**

Ask the user to set the actual API key in `backend/.env`.

**Step 2: Start backend**

Run: `cd /home/walter/openclaw-manager-claude/backend && python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload`

**Step 3: Start frontend**

Run: `cd /home/walter/openclaw-manager-claude/frontend && yarn start`

**Step 4: Manual test checklist**

- [ ] Navigate to `/ai-chat` — page loads with empty state
- [ ] Only visible to superadmin in sidebar
- [ ] Type a message and hit Enter — SSE stream starts
- [ ] Tool indicators appear when tools are called
- [ ] Response streams in real-time with markdown rendering
- [ ] Thread appears in sidebar after first message
- [ ] Click a thread to reload its messages
- [ ] "New Chat" creates a fresh conversation
- [ ] Delete thread works

**Step 5: Fix any issues found during testing**

**Step 6: Final commit**

```bash
git add -A
git commit -m "polish: AI chat assistant final adjustments"
```

---

## File Summary

### New Files
| File | Description |
|---|---|
| `backend/models/ai_chat.py` | AIChatThread + AIChatMessage models |
| `backend/services/ai_chat_tools.py` | Tool definitions + executors |
| `backend/services/ai_chat_service.py` | Claude API streaming + tool calling loop |
| `backend/routes/ai_chat_routes.py` | API endpoints (SSE stream, thread CRUD) |
| `frontend/src/components/ai-chat/ChatInput.js` | Message input component |
| `frontend/src/components/ai-chat/ChatArea.js` | Chat messages + streaming display |
| `frontend/src/components/ai-chat/ThreadSidebar.js` | Thread list sidebar |
| `frontend/src/pages/AIChatPage.js` | Main page orchestrating everything |

### Modified Files
| File | Change |
|---|---|
| `backend/requirements.txt` | Add `anthropic` |
| `backend/models/__init__.py` | Register new models |
| `backend/server.py` | Import + include ai_chat_router |
| `frontend/src/lib/api.js` | Add AI chat API functions |
| `frontend/src/App.js` | Add route |
| `frontend/src/layout/Sidebar.js` | Add nav item |
| `frontend/src/layout/MainLayout.js` | Add page title |
| `frontend/package.json` | Add react-markdown |
