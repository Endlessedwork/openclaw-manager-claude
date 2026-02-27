# OpenClaw Management System - PRD

## Problem Statement
สร้างระบบจัดการ OpenClaw ที่ครบทุกฟังก์ชั่น ตั้งค่าทุกอย่างได้จากระบบ มี CRUD Agent อย่างเป็นระบบ ระบบสกิลทั้งหลาย ใช้สำหรับดู OpenClaw ในเครื่องที่ติดตั้งระบบนี้

## Architecture
- **Frontend**: React + Tailwind CSS + shadcn/ui (Dark theme, "Tech-Noir" aesthetic)
- **Backend**: FastAPI + MongoDB (Motor async driver) + PostgreSQL (SQLAlchemy async + SQLModel)
- **Database (MongoDB)**: collections: `users`, `activity_logs`, `agent_activities`, `system_logs`, `clawhub_skills`
- **Database (PostgreSQL)**: tables: `sessions`, `conversations`, `bot_users`, `bot_groups` — persistent bot data synced from gateway files

## User Personas
1. **System Administrator** - Manages OpenClaw gateway, channels, and security policies
2. **Developer** - Configures agents, models, tools, and skills for AI workflows
3. **DevOps** - Monitors gateway status, manages cron jobs, views logs

## Core Requirements
- Full CRUD for Agents with workspace, model, tools, sandbox configuration
- Skills management with enable/disable, API key config, env vars
- Tool policies management with allow/deny, profiles, categories
- Model provider configuration with primary/fallback models
- Channel management for WhatsApp, Telegram, Discord, Slack, etc.
- Session monitoring and management
- Cron job scheduling with CRUD operations
- Raw JSON5 config editor for openclaw.json
- Gateway status monitoring, restart, and activity logs

## What's Been Implemented (Feb 2026)
- [x] Dashboard with gateway status, stat cards, recent activity
- [x] Agents CRUD (name, description, workspace, model, tools profile, heartbeat, sandbox, SOUL.md, AGENTS.md)
- [x] Skills management (browse, search, enable/disable, configure API keys/env, location types)
- [x] Tools configuration (categories, allow/deny, tool groups reference, enable/disable)
- [x] Model providers (provider catalog, models, API keys, primary/fallback, toggle)
- [x] Channels (10+ channel types, DM policies, group policies, enable/disable)
- [x] Sessions (list, details, peer/channel info, delete, **chat transcript viewer with user profile thumbnails**)
- [x] Cron Jobs (schedule, task, agent, concurrent limits, toggle)
- [x] Config editor (raw JSON5 editor, config reference, settings overview)
- [x] Gateway (status, restart, activity logs viewer)
- [x] Sidebar navigation with collapse/expand
- [x] Seed data with realistic OpenClaw defaults
- [x] Workspace management (Bot Users, Groups, Knowledge Base, Documents)
- [x] Live session chat viewer (slide-in panel with profile avatars, tool call display, enriched messages)
- [x] Real-time WebSocket logs and activities streaming

## Testing Results
- Backend: 100% (35/35 tests passed)
- Frontend: 95% pass rate
- All CRUD operations verified
- All navigation working

## Prioritized Backlog
### P0 (Done)
- All core CRUD operations
- Dashboard overview
- Gateway monitoring
- Real-time WebSocket connection to OpenClaw gateway (logs + activities)
- Live session transcript viewer with profile enrichment

### P1
- Config validation before save
- Import/export configuration

### P2
- ClawHub skill browser/installer integration
- Multi-agent routing visualization
- Channel QR pairing flow (WhatsApp)
- Session analytics charts
- Webhook/hooks management
- Node management (macOS/iOS/Android)

## Next Tasks
1. Add config validation and schema-aware editor
2. Implement webhook/hooks management UI
3. Add real-time notifications for gateway events
4. Session analytics charts
5. Import/export configuration
