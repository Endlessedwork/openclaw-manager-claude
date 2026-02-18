# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenClaw Manager is a web dashboard for managing an OpenClaw bot gateway. It provides a UI to view/manage agents, skills, models, channels, sessions, cron jobs, hooks, and configuration. The backend is a thin orchestration layer that bridges the frontend to the `openclaw` CLI tool and a MongoDB database.

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
- Backend requires `backend/.env` with: `MONGO_URL`, `DB_NAME`, `JWT_SECRET`
- Frontend uses `REACT_APP_BACKEND_URL` (defaults to same origin)
- Python 3.12, venv at `./venv/`

## Architecture

### Backend (`backend/`)
- **FastAPI** app in `server.py` — all API routes are defined here under `/api` prefix
- **`gateway_cli.py`** — wraps the `openclaw` CLI binary (`~/.npm-global/bin/openclaw`). All agent/skill/model/session/cron/health data comes from shelling out to this CLI with `--json`. Results are cached via `CLICache` with TTLs and stale-while-revalidate support. Max 3 concurrent CLI processes (semaphore).
- **`auth.py`** — JWT auth (access + refresh tokens). Refresh token is httponly cookie. Roles: `admin`, `editor`, `viewer`. Use `get_current_user` dependency for auth, `require_role("admin", "editor")` for write endpoints.
- **`routes/auth_routes.py`** — login/logout/refresh/me endpoints
- **`routes/user_routes.py`** — admin-only user CRUD
- **MongoDB** (via motor async driver) stores: `users`, `activity_logs`, `agent_activities`, `system_logs`, `clawhub_skills`
- **WebSocket endpoints** at `/api/ws/logs` and `/api/ws/activities` — stream real-time data from `openclaw logs --follow --json`

### Data flow pattern
Most resources (agents, skills, models, channels, sessions, cron) are **read-only from the CLI**. The backend calls `openclaw <resource> list --json`, caches the result, and transforms it for the frontend. Write operations go through config modification (`openclaw.json` at `~/.openclaw/openclaw.json`) followed by `gateway reload`. Only model providers and ClawHub skills have full CRUD.

### Frontend (`frontend/`)
- **React 19** with Create React App + **CRACO** (for `@` path alias to `src/`)
- **Tailwind CSS** with shadcn/ui components (`src/components/ui/`)
- **Routing**: React Router v7 in `App.js`. All pages wrapped in `ProtectedRoute` + `MainLayout` (sidebar + content area)
- **Auth**: `AuthContext.js` manages JWT tokens with axios interceptors for auto-refresh on 401
- **API layer**: `src/lib/api.js` — axios instance with all endpoint functions
- **Pages**: one file per page in `src/pages/` (DashboardPage, AgentsPage, SkillsPage, etc.)
- **Layout**: `MainLayout.js` uses `Sidebar.js` for navigation. Sidebar shows different items based on user role.

### Design System
- Dark theme only. Background `#09090b`, surfaces `#121212`/`#18181b`
- Primary color: orange (`#f97316`). Accent: electric blue (`#0ea5e9`)
- Fonts: Manrope (headings), Inter (body), JetBrains Mono (code)
- See `design_guidelines.json` for full palette and component patterns

### Deployment
- Nginx serves the built frontend and proxies `/api/` to the backend on port 8001
- WebSocket proxy configured at `/api/ws/`
- Config in `nginx-control.conf`
