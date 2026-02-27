# Design: MongoDB to PostgreSQL Migration

> **Date**: 2026-02-27
> **Status**: Approved
> **Scope**: Replace MongoDB with PostgreSQL + add file-based data + new chat/memory tables

---

## Context

OpenClaw Manager currently uses MongoDB (7 collections, ~18 records) as its database. The system also reads bot user profiles, groups, and knowledge base from JSON/markdown files on disk. Chat history and agent memory are stored as JSONL and SQLite files by OpenClaw but are not queryable through the dashboard.

### Why PostgreSQL

- **Relations**: Data has clear relationships (agent ↔ group, session ↔ messages) that PostgreSQL handles natively
- **pgvector**: Built-in vector search for future semantic search on knowledge base and memory
- **Full-text search**: Better than MongoDB for Thai + English text search with ranking
- **JSONB**: Handles flexible schema data (metadata, cost breakdowns) as well as MongoDB
- **Familiar**: W.I.N.E. project used the same stack (SQLAlchemy + Alembic + PostgreSQL)
- **Low migration cost**: Only 18 records in MongoDB, easy to move

### Technology Choice

**SQLModel** (by FastAPI creator) — combines SQLAlchemy + Pydantic. One model class serves as both DB table definition and API schema. Paired with **Alembic** for migrations and **asyncpg** as the async driver.

---

## Infrastructure

### New PostgreSQL Container

```yaml
openclaw-postgres:
  image: postgres:16-alpine
  port: 127.0.0.1:5433:5432    # 5433 on host to avoid conflicts
  volumes:
    - openclaw_pgdata:/var/lib/postgresql/data
  environment:
    POSTGRES_DB: openclaw_manager
    POSTGRES_USER: openclaw
    POSTGRES_PASSWORD: <secure_password>
```

### Environment Variables

```env
# Replace MONGO_URL with:
DATABASE_URL=postgresql+asyncpg://openclaw:<password>@127.0.0.1:5433/openclaw_manager
```

### Container Lifecycle

- MongoDB container (`openclaw-mongo`) stays running during migration as backup
- Remove MongoDB container after Phase 3 is verified

---

## Database Schema (14 Tables)

### Group A: Migrated from MongoDB (7 tables)

#### `users` — Dashboard app users
| Column | Type | Notes |
|--------|------|-------|
| id | UUID, PK | |
| username | TEXT, UNIQUE | |
| hashed_password | TEXT | bcrypt |
| name | TEXT | |
| role | TEXT | admin / editor / viewer |
| is_active | BOOLEAN | default true |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| last_login | TIMESTAMPTZ | nullable |

#### `activity_logs` — User action audit trail (insert-only)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID, PK | |
| action | TEXT | create / update / delete / restart |
| entity_type | TEXT | channel / agent / config / etc. |
| entity_id | TEXT | |
| details | TEXT | |
| timestamp | TIMESTAMPTZ | **INDEX** |

#### `agent_activities` — Agent telemetry from WebSocket (insert-only, high volume)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID, PK | |
| agent_id | TEXT | |
| agent_name | TEXT | |
| event_type | TEXT | tool_call / llm_request / message_received |
| tool_name | TEXT | nullable |
| status | TEXT | completed / error / running |
| duration_ms | INTEGER | nullable |
| tokens_in | INTEGER | nullable |
| tokens_out | INTEGER | nullable |
| channel | TEXT | nullable |
| model_used | TEXT | nullable |
| message | TEXT | |
| timestamp | TIMESTAMPTZ | **INDEX** |
| **Indexes** | | timestamp, agent_id, event_type |

#### `system_logs` — Gateway logs from WebSocket (insert-only, high volume)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID, PK | |
| level | TEXT | INFO / WARN / ERROR |
| source | TEXT | subsystem |
| message | TEXT | |
| raw | TEXT | raw log text |
| timestamp | TIMESTAMPTZ | **INDEX** |
| **Indexes** | | timestamp, level, source |

#### `daily_usage` — AI cost tracking
| Column | Type | Notes |
|--------|------|-------|
| id | UUID, PK | |
| date | DATE, UNIQUE | |
| total_tokens | BIGINT | |
| total_cost | FLOAT | |
| cost_breakdown | JSONB | raw cost data from CLI (variable structure) |
| updated_at | TIMESTAMPTZ | |

#### `agent_fallbacks` — Per-agent model fallback chains
| Column | Type | Notes |
|--------|------|-------|
| id | UUID, PK | |
| agent_id | TEXT, UNIQUE | |
| fallbacks | TEXT[] | ordered list of model IDs |

#### `clawhub_skills` — Marketplace skill cache
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT, PK | skill ID from ClawHub |
| slug | TEXT | |
| name | TEXT | |
| description | TEXT | |
| category | TEXT | |
| tags | TEXT[] | |
| downloads | INTEGER | |
| version | TEXT | |
| installed | BOOLEAN | |
| installed_version | TEXT | nullable |

### Group B: Migrated from Files (4 tables)

#### `bot_users` — From `workspace/shared/users/profiles/*.json`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID, PK | |
| platform_user_id | TEXT, UNIQUE | e.g. line_U1234, tg_5678 |
| platform | TEXT | line / telegram / web |
| display_name | TEXT | |
| avatar_url | TEXT | nullable |
| role | TEXT | |
| status | TEXT | |
| notes | TEXT | nullable |
| metadata | JSONB | platform-specific extra data |
| first_seen_at | TIMESTAMPTZ | |
| last_seen_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### `bot_groups` — From `workspace/shared/groups/profiles/*.json`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID, PK | |
| platform_group_id | TEXT, UNIQUE | e.g. line_C1234, tg_-5678 |
| platform | TEXT | line / telegram |
| name | TEXT | |
| status | TEXT | active / inactive |
| member_count | INTEGER | |
| members | JSONB | member map |
| assigned_agent_id | TEXT | nullable |
| metadata | JSONB | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### `knowledge_articles` — From `workspace/shared/knowledge_base/{domain}/*.md`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID, PK | |
| domain | TEXT | financial / strategic / hr / etc. |
| title | TEXT | |
| content | TEXT | markdown body |
| tags | TEXT[] | |
| status | TEXT | draft / published |
| created_by | TEXT | nullable |
| updated_by | TEXT | nullable |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| **Indexes** | | domain, GIN on content for full-text search |

#### `workspace_documents` — From `workspace/shared/documents/` metadata
| Column | Type | Notes |
|--------|------|-------|
| id | UUID, PK | |
| domain | TEXT | |
| filename | TEXT | |
| file_path | TEXT | path to actual file on disk |
| file_type | TEXT | |
| file_size | BIGINT | |
| sensitivity | TEXT | public / internal / confidential |
| uploaded_by | TEXT | nullable |
| approved_by | TEXT | nullable |
| metadata | JSONB | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### Group C: New Tables (3 tables)

#### `conversations` — Chat message history
| Column | Type | Notes |
|--------|------|-------|
| id | UUID, PK | |
| session_id | UUID, FK → sessions | |
| agent_id | TEXT | |
| platform | TEXT | line / telegram / web |
| peer_id | TEXT | group or user ID |
| sender_type | TEXT | user / agent / system |
| sender_name | TEXT | |
| sender_platform_id | TEXT | nullable |
| message | TEXT | |
| message_type | TEXT | text / image / tool_call / tool_result |
| metadata | JSONB | reply_to, mentions, etc. |
| timestamp | TIMESTAMPTZ | |
| **Indexes** | | session_id, agent_id, peer_id, timestamp |

#### `sessions` — Persistent session metadata
| Column | Type | Notes |
|--------|------|-------|
| id | UUID, PK | |
| session_key | TEXT, UNIQUE | e.g. "agent:main:telegram:group:-100383..." |
| agent_id | TEXT | |
| platform | TEXT | |
| peer_id | TEXT | |
| model_used | TEXT | nullable |
| total_tokens | BIGINT | default 0 |
| status | TEXT | active / ended / reset |
| started_at | TIMESTAMPTZ | |
| last_activity_at | TIMESTAMPTZ | |
| context_summary | TEXT | nullable — for resume after restart |
| **Indexes** | | agent_id, platform, status |

#### `agent_memory` — Long-term agent memory
| Column | Type | Notes |
|--------|------|-------|
| id | UUID, PK | |
| agent_id | TEXT | |
| memory_type | TEXT | fact / preference / instruction / summary |
| content | TEXT | |
| source | TEXT | conversation / manual / system |
| source_session_id | UUID | nullable, FK → sessions |
| relevance_score | FLOAT | nullable, for ranking |
| embedding | VECTOR(1536) | nullable — pgvector, add later |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| **Indexes** | | agent_id, memory_type |

---

## Backend Architecture Changes

### New Files
```
backend/
├── database.py            # async engine + session factory (SQLModel)
├── models/                # SQLModel table definitions
│   ├── __init__.py
│   ├── user.py
│   ├── activity.py
│   ├── bot_user.py
│   ├── bot_group.py
│   ├── knowledge.py
│   ├── document.py
│   ├── conversation.py
│   ├── session.py
│   ├── memory.py
│   ├── usage.py
│   ├── clawhub.py
│   └── fallback.py
├── alembic.ini
└── alembic/
    ├── env.py
    └── versions/
```

### Modified Files
- `server.py` — Replace Motor client with SQLModel async session
- `auth.py` — Change MongoDB queries to SQLModel queries
- `routes/auth_routes.py` — Change MongoDB queries
- `routes/user_routes.py` — Change MongoDB queries
- `requirements.txt` — Add sqlmodel, asyncpg, alembic; remove motor

### Unchanged
- `gateway_cli.py` — Still reads from CLI + cache
- All CLI-based routes (agents, skills, models, sessions, health)
- Config routes (still reads/writes openclaw.json)
- WebSocket endpoints (same stream, just change insert target)
- Frontend — No changes needed (API response format stays the same)

---

## Migration Strategy (3 Phases)

### Phase 1: Setup + Schema + Data Migration
1. Create PostgreSQL Docker container
2. Add SQLModel + Alembic to backend
3. Define all 14 table models
4. Run initial Alembic migration to create schema
5. Write migration script to copy MongoDB data → PostgreSQL
6. Write import scripts for file-based data (profiles, groups, KB, documents)

### Phase 2: Switch Backend to PostgreSQL
1. Replace Motor (MongoDB) with SQLModel (PostgreSQL) in all routes
2. Change WebSocket log/activity insertion to PostgreSQL
3. Change background usage collector to PostgreSQL
4. Add new API endpoints for conversations, sessions, agent_memory
5. Change file-based routes (workspace users/groups/KB) to read/write from DB
6. Test all endpoints

### Phase 3: Sync Layer + Cleanup
1. Build sync service to import OpenClaw JSONL session files → conversations table
2. Import memory SQLite + markdown → agent_memory table
3. Set up periodic sync for new data (profiles, sessions)
4. Verify everything works
5. Remove MongoDB container
6. Remove motor from requirements

---

## What Does NOT Change

- **CLI integration** — Agents, skills, models, sessions, health still come from `openclaw` CLI with caching
- **Config management** — Still reads/writes `openclaw.json` directly
- **Frontend** — No changes. API response shapes remain identical
- **WebSocket streaming** — Same log/activity stream, different storage backend
- **File browser** — Still browses ~/.openclaw/ filesystem directly
