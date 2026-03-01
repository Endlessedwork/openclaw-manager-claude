# AI Chat Assistant Page — Design

## Summary

A new "AI Assistant" page in the dashboard where superadmins can chat with an AI to query system data (sessions, agents, users, usage, etc.). Uses Claude API directly from the backend with tool calling to fetch real data, and streams responses via SSE.

**Phase 1** (this design): System query assistant — ask questions about the bot system.
**Phase 2** (future): Agent testing — send messages to OpenClaw agents and see replies.

## Architecture

```
Frontend (AIChatPage)
    │
    │ POST /api/ai-chat/messages  (send user message)
    │ ← SSE stream (AI response chunks + tool status)
    │
    │ GET /api/ai-chat/threads     (list past threads)
    │ GET /api/ai-chat/threads/:id (load thread history)
    │
Backend (FastAPI)
    │
    ├── Claude API (anthropic SDK)
    │   ├── System prompt with system context
    │   ├── Tool definitions (query_sessions, query_agents, etc.)
    │   └── Streaming response → SSE to frontend
    │
    ├── Tool execution layer
    │   ├── DB queries (sessions, conversations, bot_users, bot_groups, usage)
    │   └── CLI queries (agents, skills, models, channels, health, cron)
    │
    └── PostgreSQL (existing database)
        ├── ai_chat_threads (new)
        └── ai_chat_messages (new)
```

### Flow

1. User types a question (e.g., "มี session กี่ตัวที่ active อยู่?")
2. Frontend POSTs to `/api/ai-chat/messages` with `thread_id` + `message`
3. Backend builds Claude request with conversation history + tool definitions
4. Claude decides which tools to call (e.g., `query_sessions`)
5. Backend executes tool (CLI/DB query) → returns result to Claude
6. Claude summarizes and streams response back via SSE
7. On completion, assistant message is saved to DB

## Database Schema

Uses the existing PostgreSQL database. Two new tables:

```sql
CREATE TABLE ai_chat_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES users(id),
    title VARCHAR(200),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ai_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID REFERENCES ai_chat_threads(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,   -- 'user' | 'assistant' | 'tool'
    content TEXT NOT NULL,
    tool_name VARCHAR(100),
    tool_input JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ai_chat_messages_thread ON ai_chat_messages(thread_id, created_at);
```

## Tools

| Tool | Source | Description |
|---|---|---|
| `query_sessions` | CLI | Active sessions (agent, channel, model, tokens, age) |
| `query_agents` | CLI | Agent list + config |
| `query_skills` | CLI | All skills |
| `query_models` | CLI | Model providers + models |
| `query_channels` | CLI | Channels (LINE, Telegram, etc.) |
| `query_health` | CLI | Gateway health status |
| `query_cron` | CLI | Cron jobs |
| `query_bot_users` | DB | Bot users (searchable by name, platform) |
| `query_bot_groups` | DB | Bot groups |
| `query_conversations` | DB | Conversation search/summary (filter by session, user, date) |
| `query_usage` | CLI | Usage cost (by days) |
| `query_dashboard` | DB+CLI | Dashboard stats summary |

## API Endpoints

```
POST /api/ai-chat/messages
  Auth: superadmin only
  Body: { thread_id?: string, message: string }
  Response: SSE stream
    event: message_start    → { thread_id }
    event: content_delta    → { text }
    event: tool_use         → { tool_name, status: "calling"|"done" }
    event: message_done     → { message_id }
    event: error            → { detail }

GET  /api/ai-chat/threads
  Auth: superadmin only
  Response: [{ id, title, updated_at }]

GET  /api/ai-chat/threads/:id
  Auth: superadmin only
  Response: { id, title, messages: [...] }

DELETE /api/ai-chat/threads/:id
  Auth: superadmin only
  Response: 204
```

## UI Design

ChatGPT-style layout within the existing dashboard:

```
┌─────────────────────────────────────────────────────┐
│  Main Sidebar (existing)  │  AI Chat Page           │
│                           │  ┌──────────┬─────────┐ │
│  > AI Assistant ★         │  │ Threads  │  Chat   │ │
│                           │  │          │         │ │
│                           │  │ ▸ Thread1│ [msgs]  │ │
│                           │  │ ▸ Thread2│         │ │
│                           │  │          │         │ │
│                           │  │ [+ New]  │ [input] │ │
│                           │  └──────────┴─────────┘ │
└─────────────────────────────────────────────────────┘
```

- **Thread sidebar**: "+ New Chat" button, threads sorted by updated_at, title + time
- **Chat area**: User messages right-aligned, AI messages left-aligned with streaming
- **Tool indicators**: Badge showing "Querying sessions..." with spinner during tool calls
- **Input**: Textarea + send button, Enter to send, Shift+Enter for newline
- **Style**: Existing dark theme, orange accent, reuse patterns from SessionChatSheet
- **Markdown rendering** in AI messages

## Backend Components

```
backend/
├── routes/
│   └── ai_chat_routes.py     # API endpoints
├── services/
│   └── ai_chat_service.py    # Claude API + tool execution
└── models.py                 # AIChatThread, AIChatMessage
```

## Frontend Components

```
frontend/src/
├── pages/
│   └── AIChatPage.js         # Main page
├── components/
│   └── ai-chat/
│       ├── ThreadSidebar.js   # Thread list sidebar
│       ├── ChatArea.js        # Message display + streaming
│       └── ChatInput.js       # Message input
└── lib/
    └── api.js                 # Add ai-chat endpoints
```

## Configuration

- `ANTHROPIC_API_KEY` added to `backend/.env`
- `anthropic` Python package added to requirements
- Route: `/ai-chat`, superadmin only
- Sidebar: "AI Assistant" item under a suitable group

## Access Control

- superadmin only (all endpoints use `require_role("superadmin")`)

## System Prompt

```
You are an AI assistant for the OpenClaw bot management dashboard.
You help administrators query and understand their bot system.
You have tools to query sessions, agents, users, and more.
Always answer in the same language the user uses.
Be concise and use data from tools — don't make up information.
```
