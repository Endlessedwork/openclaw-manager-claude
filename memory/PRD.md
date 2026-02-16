# OpenClaw Management System - PRD

## Problem Statement
สร้างระบบจัดการ OpenClaw ที่ครบทุกฟังก์ชั่น ตั้งค่าทุกอย่างได้จากระบบ มี CRUD Agent อย่างเป็นระบบ ระบบสกิลทั้งหลาย ใช้สำหรับดู OpenClaw ในเครื่องที่ติดตั้งระบบนี้

## Architecture
- **Frontend**: React + Tailwind CSS + shadcn/ui (Dark theme, "Tech-Noir" aesthetic)
- **Backend**: FastAPI + MongoDB (Motor async driver)
- **Database**: MongoDB with collections: agents, skills, tools_config, model_providers, channels, sessions, cron_jobs, gateway_config, activity_logs

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
- [x] Sessions (list, details, peer/channel info, delete)
- [x] Cron Jobs (schedule, task, agent, concurrent limits, toggle)
- [x] Config editor (raw JSON5 editor, config reference, settings overview)
- [x] Gateway (status, restart, activity logs viewer)
- [x] Sidebar navigation with collapse/expand
- [x] Seed data with realistic OpenClaw defaults

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

### P1
- Real-time WebSocket connection to OpenClaw gateway
- Live session transcript viewer
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
1. Connect to real OpenClaw gateway via WebSocket for live data
2. Add config validation and schema-aware editor
3. Implement webhook/hooks management UI
4. Add session transcript history viewer
5. Add real-time notifications for gateway events
