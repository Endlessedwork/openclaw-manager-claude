# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenClaw Manager is a web dashboard for managing an OpenClaw bot gateway. It provides a UI to view/manage agents, skills, models, channels, sessions, cron jobs, hooks, and configuration. The backend is a thin orchestration layer that bridges the frontend to the `openclaw` CLI tool and a PostgreSQL database.

## Commands

### Backend
```bash
# Run backend server (from project root)
cd backend && python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Seed initial admin user
cd backend && python seed_admin.py

# Backend tests
pytest backend_test.py

# Linting
cd backend && black . && isort . && flake8 .
```

### Frontend
```bash
# Install dependencies (uses yarn)
cd frontend && yarn install

# Dev server
cd frontend && yarn start

# Build for production
cd frontend && yarn build

# Run tests
cd frontend && yarn test

# Run a single test file
cd frontend && yarn test -- --testPathPattern=DashboardPage
```

### Environment
- Backend requires `backend/.env` with: `JWT_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY`
- Frontend uses `REACT_APP_BACKEND_URL` (defaults to same origin)
- Python 3.12, venv at `./venv/`

## Architecture

### Backend (`backend/`)
- **FastAPI** app in `server.py` — all API routes are defined here under `/api` prefix
- **`gateway_cli.py`** — wraps the `openclaw` CLI binary (`~/.npm-global/bin/openclaw`). All agent/skill/model/session/cron/health data comes from shelling out to this CLI with `--json`. Results are cached via `CLICache` with TTLs and stale-while-revalidate support. Max 3 concurrent CLI processes (semaphore).
- **`auth.py`** — JWT auth (access + refresh tokens). Refresh token is httponly cookie. Roles: `superadmin`, `admin`, `manager`, `user`. Use `get_current_user` dependency for auth, `require_role("superadmin", "admin")` for write endpoints.
- **`routes/auth_routes.py`** — login/logout/refresh/me endpoints
- **`routes/user_routes.py`** — admin-only user CRUD
- **`routes/ai_chat_routes.py`** — AI chat assistant endpoints (superadmin only). SSE streaming for messages, thread CRUD.
- **`services/ai_chat_service.py`** — Claude API integration with streaming + tool calling loop (max 5 rounds). Uses `anthropic` SDK.
- **`services/ai_chat_tools.py`** — 12 tool definitions for querying system data (sessions, agents, skills, models, channels, health, cron, bot_users, bot_groups, conversations, usage, dashboard). Tools call gateway CLI or DB as appropriate.
- **PostgreSQL** (via SQLAlchemy async + SQLModel) stores all data:
  - `users` — dashboard login accounts
  - `sessions` — auto-synced from gateway JSONL files on startup (`auto_sync.py`)
  - `conversations` — chat messages linked to sessions via `session_id`, auto-synced on startup
  - `bot_users` — user profiles (display_name, avatar_url, platform, platform_user_id). IDs are stored as **raw platform IDs** (e.g. `Ubc9c7dda...`, `90988085`) without platform prefix — the `platform` column stores the platform separately. Auto-backfilled from disk profiles when missing.
  - `bot_groups` — group profiles (name, platform, platform_group_id). Same raw ID convention as bot_users. Auto-backfilled from disk profiles when missing.
  - `workspace_documents` — auto-synced from workspace files on startup
  - `knowledge_articles` — auto-synced from workspace knowledge base on startup
  - `activity_logs`, `agent_activities`, `system_logs` — operational logs
  - `ai_chat_threads` — AI assistant conversation threads (per user)
  - `ai_chat_messages` — messages within threads (role: user/assistant, tool metadata)
  - `notification_rules`, `app_settings`, `clawhub_skills`, `agent_memory`, `daily_usage`, `agent_fallbacks`
  - Database config: `database.py` with async engine, connection pool (10+20)
- **`auto_sync.py`** — runs on startup, syncs documents/knowledge/sessions from disk to PostgreSQL. Idempotent (skips existing records).
- **`routes/conversation_routes.py`** — conversation query endpoints including `/by-session-key` (enriches messages with user profiles)
- **`routes/workspace_routes.py`** — CRUD for bot_users/bot_groups, document access control (RBAC by sensitivity + role)
- **WebSocket endpoints** at `/api/ws/logs` and `/api/ws/activities` — stream real-time data from `openclaw logs --follow --json`
- **SSE endpoint** at `POST /api/ai-chat/messages` — streams Claude API responses with tool calling indicators

### Session keys & platform ID matching
- **Session key format**: `agent:<agent>:<channel>:<kind>:<id>` (e.g. `agent:main:line:direct:ubc9c7ddaa81fca73cf03b226d93af03b`). Some keys have extra segments (e.g. `agent:main:line:group:group:<id>`) — always use `parts[-1]` for the platform ID and `parts[3]` for kind.
- **IMPORTANT — Case mismatch**: Gateway session keys use **lowercase** IDs (e.g. `ubc9c7dda...`, `c4d64d62...`) but PostgreSQL `bot_users.platform_user_id` and `bot_groups.platform_group_id` store IDs with **original case** (e.g. `Ubc9c7dda...`, `C4d64d62...`). Always use **case-insensitive matching** (`func.lower()`) when joining session keys to bot_users/bot_groups.
- Telegram IDs are numeric strings (e.g. `90988085`, `-1003838276320`) and don't have case issues.

### Data flow pattern
Most resources (agents, skills, models, channels, sessions, cron) are **read-only from the CLI**. The backend calls `openclaw <resource> list --json`, caches the result, and transforms it for the frontend. Write operations go through config modification (`openclaw.json` at `~/.openclaw/openclaw.json`) followed by `gateway reload`. Only model providers and ClawHub skills have full CRUD.

### AI Chat Assistant (`/ai-chat`)
- Superadmin-only page for querying system data via natural language
- Backend calls Claude API (Sonnet) with 12 tool definitions — Claude decides which tools to call based on the question
- Tools query live data from CLI (`gateway.sessions()`, `gateway.agents()`, etc.) and DB (`bot_users`, `bot_groups`, `conversations`)
- Responses stream via SSE (`StreamingResponse` with `text/event-stream`). Events: `message_start`, `content_delta`, `tool_use`, `message_done`, `error`
- Frontend parses SSE via `fetch` + `ReadableStream` reader (not axios — axios doesn't support streaming)
- Conversation threads persisted in `ai_chat_threads` + `ai_chat_messages` tables
- UI: thread sidebar (left) + chat area (right) with markdown rendering (`react-markdown`)

### Frontend (`frontend/`)
- **React 19** with Create React App + **CRACO** (for `@` path alias to `src/`)
- **Tailwind CSS** with shadcn/ui components (`src/components/ui/`)
- **Routing**: React Router v7 in `App.js`. All pages wrapped in `ProtectedRoute` + `MainLayout` (sidebar + content area)
- **Auth**: `AuthContext.js` manages JWT tokens with axios interceptors for auto-refresh on 401
- **API layer**: `src/lib/api.js` — axios instance with all endpoint functions
- **Pages**: one file per page in `src/pages/` (DashboardPage, AgentsPage, SkillsPage, AIChatPage, etc.)
- **Layout**: `MainLayout.js` uses `Sidebar.js` for navigation. Sidebar shows different items based on user role.

### Design System
- Dark theme only. Background `#09090b`, surfaces `#121212`/`#18181b`
- Primary color: orange (`#f97316`). Accent: electric blue (`#0ea5e9`)
- Fonts: Manrope (headings), Inter (body), JetBrains Mono (code)
- See `design_guidelines.json` for full palette and component patterns

### Deployment

#### Architecture Pattern

```
Internet (HTTP/HTTPS)
    │
    ▼
┌────────────────────────────────┐
│  Nginx (Docker container)      │
│  Reverse proxy + static files  │
└──────────────┬─────────────────┘
               │
               ▼
        Backend (uvicorn)
        Runs on HOST, port 8001
        ├── MongoDB (Docker)
        └── PostgreSQL (Docker)
```

- **Nginx container** serves the frontend static build and reverse-proxies `/api` to the backend on the host
- **Backend** runs on the host (not Docker) via uvicorn on port **8001**
- **MongoDB** and **PostgreSQL** run as Docker containers, accessible from the host via localhost

#### How to Deploy Frontend

The frontend build output must be accessible to the nginx container. Check your nginx setup — it may use a **bind mount** from the host or require `docker cp`.

```bash
# 1. Build
cd frontend && yarn build

# 2. Deploy to where nginx serves static files
#    Option A: If bind-mounted, just build in place
#    Option B: If no bind mount, copy into container:
#    docker cp frontend/build/. <nginx-container>:/usr/share/nginx/openclaw-manager/

# 3. Reload nginx
docker exec <nginx-container> nginx -s reload
```

#### Environment-Specific Details
Server paths, container names, domains, and ports vary per deployment. Do NOT hardcode these — refer to each server's actual Docker/nginx configuration.
