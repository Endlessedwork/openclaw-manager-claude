# MongoDB → PostgreSQL Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace MongoDB with PostgreSQL using SQLModel, migrate all 7 collections + 4 file-based data sources, and add 3 new tables for conversations/sessions/memory.

**Architecture:** SQLModel (SQLAlchemy + Pydantic) with asyncpg driver, Alembic for migrations. PostgreSQL 16 in Docker container on port 5433. Backend API response formats stay identical — frontend untouched.

**Tech Stack:** SQLModel, asyncpg, Alembic, PostgreSQL 16, FastAPI

---

## Phase 1: Infrastructure + Schema

### Task 1: Create PostgreSQL Docker Container

**Files:**
- Create: `backend/docker-compose.db.yml`

**Step 1: Write docker-compose file**

```yaml
# backend/docker-compose.db.yml
services:
  openclaw-postgres:
    image: postgres:16-alpine
    container_name: openclaw-postgres
    restart: unless-stopped
    ports:
      - "127.0.0.1:5433:5432"
    volumes:
      - openclaw_pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: openclaw_manager
      POSTGRES_USER: openclaw
      POSTGRES_PASSWORD: oc_pg_s3cur3_2026

volumes:
  openclaw_pgdata:
```

**Step 2: Start the container**

Run: `docker compose -f backend/docker-compose.db.yml up -d`
Expected: Container `openclaw-postgres` running on port 5433

**Step 3: Verify connection**

Run: `docker exec openclaw-postgres psql -U openclaw -d openclaw_manager -c "SELECT version();"`
Expected: PostgreSQL 16.x output

**Step 4: Update backend .env**

Add to `backend/.env`:
```
DATABASE_URL=postgresql+asyncpg://openclaw:oc_pg_s3cur3_2026@127.0.0.1:5433/openclaw_manager
```
Keep existing `MONGO_URL` for now (Phase 1-2 runs both).

**Step 5: Commit**

```bash
git add backend/docker-compose.db.yml backend/.env
git commit -m "infra: add PostgreSQL container for DB migration"
```

---

### Task 2: Update Dependencies

**Files:**
- Modify: `backend/requirements.txt`

**Step 1: Update requirements.txt**

Add these packages (keep motor/pymongo for now — removed in Phase 3):
```
sqlmodel>=0.0.22
asyncpg>=0.30.0
alembic>=1.14.0
greenlet>=3.0.0
```

**Step 2: Install**

Run: `cd backend && pip install sqlmodel asyncpg alembic greenlet`
Expected: All packages install successfully

**Step 3: Verify import**

Run: `python -c "import sqlmodel; import asyncpg; import alembic; print('OK')"`
Expected: `OK`

**Step 4: Commit**

```bash
git add backend/requirements.txt
git commit -m "deps: add sqlmodel, asyncpg, alembic for PostgreSQL"
```

---

### Task 3: Database Connection Module

**Files:**
- Create: `backend/database.py`

**Step 1: Write database.py**

```python
import os
from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL", "")

engine = create_async_engine(DATABASE_URL, echo=False, pool_size=10, max_overflow=20)

async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session
```

**Step 2: Verify module loads**

Run: `cd backend && python -c "from database import engine; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add backend/database.py
git commit -m "feat: add async PostgreSQL database module"
```

---

### Task 4: SQLModel Table Definitions — Group A (MongoDB collections)

**Files:**
- Create: `backend/models/__init__.py`
- Create: `backend/models/user.py`
- Create: `backend/models/activity.py`
- Create: `backend/models/usage.py`
- Create: `backend/models/fallback.py`
- Create: `backend/models/clawhub.py`

**Step 1: Create models/__init__.py**

```python
from .user import User
from .activity import ActivityLog, AgentActivity, SystemLog
from .usage import DailyUsage
from .fallback import AgentFallback
from .clawhub import ClawHubSkill
from .bot_user import BotUser
from .bot_group import BotGroup
from .knowledge import KnowledgeArticle
from .document import WorkspaceDocument
from .conversation import Conversation
from .session import Session
from .memory import AgentMemory

__all__ = [
    "User", "ActivityLog", "AgentActivity", "SystemLog",
    "DailyUsage", "AgentFallback", "ClawHubSkill",
    "BotUser", "BotGroup", "KnowledgeArticle", "WorkspaceDocument",
    "Conversation", "Session", "AgentMemory",
]
```

**Step 2: Create models/user.py**

```python
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    username: str = Field(unique=True, index=True)
    hashed_password: str
    name: str
    role: str = Field(default="viewer")  # admin / editor / viewer
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_login: Optional[datetime] = None
```

**Step 3: Create models/activity.py**

```python
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field


class ActivityLog(SQLModel, table=True):
    __tablename__ = "activity_logs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    action: str
    entity_type: str
    entity_id: str = ""
    details: str = ""
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), index=True
    )


class AgentActivity(SQLModel, table=True):
    __tablename__ = "agent_activities"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    agent_id: str = Field(index=True)
    agent_name: str = ""
    event_type: str = Field(index=True)  # tool_call / llm_request / message_received
    tool_name: Optional[str] = None
    status: str = "completed"  # completed / error / running
    duration_ms: Optional[int] = None
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None
    channel: Optional[str] = None
    model_used: Optional[str] = None
    message: str = ""
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), index=True
    )


class SystemLog(SQLModel, table=True):
    __tablename__ = "system_logs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    level: str = Field(index=True)  # INFO / WARN / ERROR
    source: str = Field(default="", index=True)
    message: str = ""
    raw: str = ""
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), index=True
    )
```

**Step 4: Create models/usage.py**

```python
import uuid
from datetime import date, datetime, timezone
from typing import Optional, Any
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON


class DailyUsage(SQLModel, table=True):
    __tablename__ = "daily_usage"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    date: date = Field(unique=True, index=True)
    total_tokens: int = 0
    total_cost: float = 0.0
    cost_breakdown: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

**Step 5: Create models/fallback.py**

```python
import uuid
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import ARRAY, Text


class AgentFallback(SQLModel, table=True):
    __tablename__ = "agent_fallbacks"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    agent_id: str = Field(unique=True, index=True)
    fallbacks: list[str] = Field(default=[], sa_column=Column(ARRAY(Text)))
```

**Step 6: Create models/clawhub.py**

```python
from typing import Optional
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import ARRAY, Text


class ClawHubSkill(SQLModel, table=True):
    __tablename__ = "clawhub_skills"

    id: str = Field(primary_key=True)
    slug: str = ""
    name: str = ""
    description: str = ""
    category: str = ""
    tags: list[str] = Field(default=[], sa_column=Column(ARRAY(Text)))
    downloads: int = 0
    version: str = ""
    installed: bool = False
    installed_version: Optional[str] = None
```

**Step 7: Verify all models load**

Run: `cd backend && python -c "from models import User, ActivityLog, AgentActivity, SystemLog, DailyUsage, AgentFallback, ClawHubSkill; print('Group A OK')"`
Expected: `Group A OK` (will fail until Group B models exist — that's Task 5)

**Step 8: Commit**

```bash
git add backend/models/
git commit -m "feat: add SQLModel definitions for Group A tables (from MongoDB)"
```

---

### Task 5: SQLModel Table Definitions — Group B (file-based) + Group C (new)

**Files:**
- Create: `backend/models/bot_user.py`
- Create: `backend/models/bot_group.py`
- Create: `backend/models/knowledge.py`
- Create: `backend/models/document.py`
- Create: `backend/models/conversation.py`
- Create: `backend/models/session.py`
- Create: `backend/models/memory.py`

**Step 1: Create models/bot_user.py**

```python
import uuid
from datetime import datetime, timezone
from typing import Optional, Any
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON


class BotUser(SQLModel, table=True):
    __tablename__ = "bot_users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    platform_user_id: str = Field(unique=True, index=True)
    platform: str  # line / telegram / web
    display_name: str = ""
    avatar_url: Optional[str] = None
    role: str = ""
    status: str = ""
    notes: Optional[str] = None
    metadata: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    first_seen_at: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

**Step 2: Create models/bot_group.py**

```python
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON


class BotGroup(SQLModel, table=True):
    __tablename__ = "bot_groups"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    platform_group_id: str = Field(unique=True, index=True)
    platform: str  # line / telegram
    name: str = ""
    status: str = "active"  # active / inactive
    member_count: int = 0
    members: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    assigned_agent_id: Optional[str] = None
    metadata: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

**Step 3: Create models/knowledge.py**

```python
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import ARRAY, Text


class KnowledgeArticle(SQLModel, table=True):
    __tablename__ = "knowledge_articles"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    domain: str = Field(index=True)
    title: str
    content: str = ""
    tags: list[str] = Field(default=[], sa_column=Column(ARRAY(Text)))
    status: str = "published"  # draft / published
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

**Step 4: Create models/document.py**

```python
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON


class WorkspaceDocument(SQLModel, table=True):
    __tablename__ = "workspace_documents"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    domain: str = ""
    filename: str
    file_path: str
    file_type: str = ""
    file_size: int = 0
    sensitivity: str = "internal"  # public / internal / confidential
    uploaded_by: Optional[str] = None
    approved_by: Optional[str] = None
    metadata: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

**Step 5: Create models/session.py**

```python
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field


class Session(SQLModel, table=True):
    __tablename__ = "sessions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    session_key: str = Field(unique=True, index=True)
    agent_id: str = Field(index=True)
    platform: str = ""
    peer_id: str = ""
    model_used: Optional[str] = None
    total_tokens: int = 0
    status: str = Field(default="active", index=True)  # active / ended / reset
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_activity_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    context_summary: Optional[str] = None
```

**Step 6: Create models/conversation.py**

```python
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON


class Conversation(SQLModel, table=True):
    __tablename__ = "conversations"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    session_id: Optional[uuid.UUID] = Field(default=None, foreign_key="sessions.id", index=True)
    agent_id: str = Field(index=True)
    platform: str = ""
    peer_id: str = Field(default="", index=True)
    sender_type: str = ""  # user / agent / system
    sender_name: str = ""
    sender_platform_id: Optional[str] = None
    message: str = ""
    message_type: str = "text"  # text / image / tool_call / tool_result
    metadata: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), index=True
    )
```

**Step 7: Create models/memory.py**

```python
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field


class AgentMemory(SQLModel, table=True):
    __tablename__ = "agent_memory"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    agent_id: str = Field(index=True)
    memory_type: str = Field(index=True)  # fact / preference / instruction / summary
    content: str = ""
    source: str = ""  # conversation / manual / system
    source_session_id: Optional[uuid.UUID] = Field(default=None, foreign_key="sessions.id")
    relevance_score: Optional[float] = None
    # embedding: pgvector column — add later via Alembic migration
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

**Step 8: Verify all 14 models load**

Run: `cd backend && python -c "from models import *; print('All 14 models OK')"`
Expected: `All 14 models OK`

**Step 9: Commit**

```bash
git add backend/models/
git commit -m "feat: add SQLModel definitions for Group B + C tables"
```

---

### Task 6: Alembic Setup + Initial Migration

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/script.mako`

**Step 1: Initialize Alembic**

Run: `cd backend && alembic init alembic`
Expected: Creates `alembic/` dir and `alembic.ini`

**Step 2: Edit alembic.ini — set sqlalchemy.url**

In `backend/alembic.ini`, set:
```ini
sqlalchemy.url = postgresql+asyncpg://openclaw:oc_pg_s3cur3_2026@127.0.0.1:5433/openclaw_manager
```

**Step 3: Edit alembic/env.py for async + SQLModel**

Replace `backend/alembic/env.py` with async-compatible version that imports all SQLModel models:

```python
import asyncio
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context
from sqlmodel import SQLModel

# Import all models so metadata is populated
from models import *  # noqa: F401, F403

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations():
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online():
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

**Step 4: Generate initial migration**

Run: `cd backend && alembic revision --autogenerate -m "initial: create all 14 tables"`
Expected: Creates migration file in `alembic/versions/`

**Step 5: Apply migration**

Run: `cd backend && alembic upgrade head`
Expected: All 14 tables created in PostgreSQL

**Step 6: Verify tables**

Run: `docker exec openclaw-postgres psql -U openclaw -d openclaw_manager -c "\dt"`
Expected: 14 tables listed + alembic_version

**Step 7: Commit**

```bash
git add backend/alembic.ini backend/alembic/
git commit -m "feat: add Alembic setup + initial migration for 14 tables"
```

---

### Task 7: Data Migration Script (MongoDB → PostgreSQL)

**Files:**
- Create: `backend/migrate_data.py`

**Step 1: Write migration script**

Script that reads from MongoDB and inserts into PostgreSQL for all 7 collections:
- `users` — map `_id` (ObjectId) → new UUID, preserve hashed_password, role, timestamps
- `activity_logs` — map `id` (string UUID) → UUID
- `agent_activities` — same
- `system_logs` — same
- `daily_usage` — map `date` string → date object, extra fields → `cost_breakdown` JSONB
- `agent_fallbacks` — same structure
- `clawhub_skills` — same structure

The script should:
1. Connect to both MongoDB and PostgreSQL
2. For each collection: read all docs, transform, bulk insert
3. Print counts for verification
4. Handle the `users` table specially: map ObjectId to UUID, store mapping for auth token compatibility

**Step 2: Run migration**

Run: `cd backend && python migrate_data.py`
Expected: Output showing count of records migrated per table

**Step 3: Verify data**

Run: `docker exec openclaw-postgres psql -U openclaw -d openclaw_manager -c "SELECT count(*) FROM users;"`
Expected: `3` (matches MongoDB)

**Step 4: Commit**

```bash
git add backend/migrate_data.py
git commit -m "feat: add MongoDB → PostgreSQL data migration script"
```

---

### Task 8: File Data Import Script (profiles, KB, documents → PostgreSQL)

**Files:**
- Create: `backend/import_file_data.py`

**Step 1: Write import script**

Script that reads JSON/markdown files from `~/.openclaw/workspace/shared/` and inserts into PostgreSQL:
- `users/profiles/*.json` → `bot_users` table
- `groups/profiles/*.json` → `bot_groups` table
- `knowledge_base/{domain}/*.md` → `knowledge_articles` table
- `documents/{domain}/*` + `.metadata.json` → `workspace_documents` table

**Step 2: Run import**

Run: `cd backend && python import_file_data.py`
Expected: Output showing count of records imported per table

**Step 3: Commit**

```bash
git add backend/import_file_data.py
git commit -m "feat: add file-based data import script for profiles/KB/docs"
```

---

## Phase 2: Switch Backend to PostgreSQL

### Task 9: Rewrite database.py + server.py Startup

**Files:**
- Modify: `backend/database.py`
- Modify: `backend/server.py` (lines 1-46, 94-103, 1615-1618)

**Step 1: Update server.py imports and startup**

Replace MongoDB imports and startup with SQLModel session:
- Remove: `from motor.motor_asyncio import AsyncIOMotorClient`, `mongo_url`, `client`, `db`
- Add: `from database import engine, async_session, init_db`
- Change `set_db()`: store `async_session` in `app.state.db_session_factory` instead of `app.state.db`
- Change `shutdown_db_client()`: dispose engine instead of closing mongo client

**Step 2: Rewrite log_activity helper**

Change from `db.activity_logs.insert_one()` to SQLModel insert using session.

**Step 3: Rewrite _usage_collector**

Change from `db.daily_usage.update_one(upsert=True)` to SQLModel upsert pattern.

**Step 4: Verify server starts**

Run: `cd backend && python -m uvicorn server:app --host 0.0.0.0 --port 8001`
Expected: Server starts without import errors

**Step 5: Commit**

```bash
git commit -am "refactor: switch server.py startup from MongoDB to PostgreSQL"
```

---

### Task 10: Rewrite auth.py

**Files:**
- Modify: `backend/auth.py` (lines 57-80)

**Step 1: Replace get_current_user**

Change from:
- `from bson import ObjectId`
- `db.users.find_one({"_id": ObjectId(payload["sub"])})`

To:
- SQLModel select query by UUID
- `app.state.db_session_factory` → async session → `select(User).where(User.id == uuid, User.is_active == True)`

**Step 2: Verify auth works**

Run: `curl -X POST http://localhost:8001/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"<password>"}'`
Expected: Returns access_token

**Step 3: Commit**

```bash
git commit -am "refactor: switch auth.py from MongoDB to SQLModel"
```

---

### Task 11: Rewrite auth_routes.py

**Files:**
- Modify: `backend/routes/auth_routes.py`

**Step 1: Replace all MongoDB queries**

- `login`: `db.users.find_one()` → SQLModel select by username
- `login`: `db.users.update_one()` → SQLModel update last_login
- `refresh`: `db.users.find_one()` → SQLModel select by UUID
- Remove `from bson import ObjectId`
- User IDs change from ObjectId strings → UUID strings

**Step 2: Test login/refresh/logout/me**

Run each endpoint and verify responses match previous format.

**Step 3: Commit**

```bash
git commit -am "refactor: switch auth_routes.py from MongoDB to SQLModel"
```

---

### Task 12: Rewrite user_routes.py

**Files:**
- Modify: `backend/routes/user_routes.py`

**Step 1: Replace all MongoDB CRUD**

- `list_users`: `db.users.find()` → `select(User)`
- `create_user`: `db.users.insert_one()` → `session.add(User(...))`
- `update_user`: `db.users.update_one()` → `session.get()` + update fields
- `delete_user`: `db.users.delete_one()` → `session.delete()`
- Remove `from bson import ObjectId` — use UUID throughout
- User IDs: `str(u["_id"])` → `str(user.id)`

**Step 2: Test all CRUD endpoints**

Verify: GET /users, POST /users, PUT /users/{id}, DELETE /users/{id}

**Step 3: Commit**

```bash
git commit -am "refactor: switch user_routes.py from MongoDB to SQLModel"
```

---

### Task 13: Rewrite Fallbacks, Logs, Activities, ClawHub Routes

**Files:**
- Modify: `backend/server.py` (fallbacks section ~line 766-860, logs ~1164-1272, clawhub ~1275-1323)

**Step 1: Rewrite fallbacks routes**

- `get_fallbacks`: `db.agent_fallbacks.find()` → `select(AgentFallback)`
- `update_agent_fallbacks`: `db.agent_fallbacks.update_one(upsert)` → SQLModel upsert

**Step 2: Rewrite activity_logs routes**

- `get_logs`: `db.activity_logs.find().sort().limit()` → `select(ActivityLog).order_by(desc).limit()`

**Step 3: Rewrite system_logs routes**

- `list_system_logs`: MongoDB query with regex → SQLModel with `ilike` for search
- `system_logs_stats`: MongoDB aggregation → SQLAlchemy `func.count()` + `group_by()`

**Step 4: Rewrite agent_activities routes**

- `list_activities`: MongoDB find → SQLModel select with filters
- `activities_stats`: MongoDB aggregation pipelines → SQLAlchemy `func.count()`, `func.sum()`, `func.avg()`, `group_by()`
- `get_activity`: `find_one()` → `session.get()` or `select().where()`

**Step 5: Rewrite clawhub routes**

- `list_clawhub_skills`: MongoDB find with `$regex` + `$or` → SQLModel with `or_()` + `ilike()`
- `install_clawhub_skill`: `find_one()` + `update_one()` → `session.get()` + update
- `uninstall_clawhub_skill`: same pattern

**Step 6: Rewrite usage routes**

- `get_usage_cost`: MongoDB find with date range → `select(DailyUsage).where(between)`
- `get_usage_breakdown`: MongoDB aggregation → SQLAlchemy with `func.sum()`, `group_by()`

**Step 7: Verify all routes work**

Test each endpoint via curl or browser.

**Step 8: Commit**

```bash
git commit -am "refactor: switch all remaining MongoDB routes to SQLModel"
```

---

### Task 14: Rewrite WebSocket Endpoints

**Files:**
- Modify: `backend/server.py` (ws_logs ~line 1461-1527, ws_activities ~1530-1600)

**Step 1: Rewrite ws_logs**

Change: `await db.system_logs.insert_one(log)` → `session.add(SystemLog(**log)); await session.commit()`

Note: WebSocket handlers need their own session per connection since they're long-lived.

**Step 2: Rewrite ws_activities**

- Init: `db.agent_activities.find().sort().limit()` → `select(AgentActivity).order_by(desc).limit(100)`
- Insert: `db.agent_activities.insert_one()` → `session.add(AgentActivity(...))`

**Step 3: Test WebSocket**

Open the Logs and Activities pages in browser, verify real-time streaming works.

**Step 4: Commit**

```bash
git commit -am "refactor: switch WebSocket log/activity insertion to PostgreSQL"
```

---

### Task 15: Rewrite workspace_routes.py (files → DB)

**Files:**
- Modify: `backend/routes/workspace_routes.py`

**Step 1: Rewrite list/patch workspace users**

- `list_workspace_users`: Read from `bot_users` table instead of JSON files
- `patch_workspace_user`: Update `bot_users` table instead of writing JSON

**Step 2: Rewrite list/patch workspace groups**

- `list_workspace_groups`: Read from `bot_groups` table
- `patch_workspace_group`: Update `bot_groups` table

**Step 3: Rewrite knowledge base routes**

- `list_knowledge_base`: Read from `knowledge_articles` table
- `get_knowledge_content`: Read content from `knowledge_articles` table
- Add new routes: `POST /workspace/knowledge` (create), `PUT /workspace/knowledge/{id}` (update)

**Step 4: Rewrite documents route**

- `list_workspace_documents`: Read from `workspace_documents` table

**Step 5: Test all workspace endpoints**

Verify data matches what was previously read from files.

**Step 6: Commit**

```bash
git commit -am "refactor: switch workspace routes from file-based to PostgreSQL"
```

---

### Task 16: Rewrite seed_admin.py

**Files:**
- Modify: `backend/seed_admin.py`

**Step 1: Replace Motor with SQLModel**

- Remove: `from motor.motor_asyncio import AsyncIOMotorClient`
- Add: `from database import engine, async_session`
- Change: MongoDB insert → `session.add(User(...))`

**Step 2: Test**

Run: `cd backend && python seed_admin.py`
Expected: Either "Admin already exists" or creates new admin

**Step 3: Commit**

```bash
git commit -am "refactor: switch seed_admin.py from MongoDB to SQLModel"
```

---

## Phase 3: New Features + Sync + Cleanup

### Task 17: Add New API Endpoints (Conversations, Sessions, Memory)

**Files:**
- Create: `backend/routes/conversation_routes.py`
- Create: `backend/routes/session_routes.py`
- Create: `backend/routes/memory_routes.py`
- Modify: `backend/server.py` (add router imports)

**Step 1: Create conversation_routes.py**

Endpoints:
- `GET /conversations` — list with filters (session_id, agent_id, platform, peer_id, date range)
- `GET /conversations/{id}` — single message
- `GET /conversations/session/{session_id}` — all messages in a session

**Step 2: Create session_routes.py**

Endpoints:
- `GET /sessions/persistent` — list from DB (vs CLI /sessions which shows live only)
- `GET /sessions/persistent/{id}` — single session with message count

**Step 3: Create memory_routes.py**

Endpoints:
- `GET /memory` — list memories with filters (agent_id, memory_type)
- `POST /memory` — create memory entry
- `PUT /memory/{id}` — update
- `DELETE /memory/{id}` — delete

**Step 4: Register routers in server.py**

**Step 5: Commit**

```bash
git add backend/routes/conversation_routes.py backend/routes/session_routes.py backend/routes/memory_routes.py
git commit -am "feat: add API endpoints for conversations, sessions, memory"
```

---

### Task 18: Session JSONL Sync Service

**Files:**
- Create: `backend/sync_sessions.py`

**Step 1: Write sync script**

Reads `~/.openclaw/agents/*/sessions/*.jsonl` files and imports:
- Session metadata → `sessions` table
- Individual messages → `conversations` table
- Parse JSONL format: each line is a message with role, content, metadata

**Step 2: Run initial sync**

Run: `cd backend && python sync_sessions.py`
Expected: Sessions and conversations imported with counts

**Step 3: Commit**

```bash
git add backend/sync_sessions.py
git commit -am "feat: add session JSONL sync service"
```

---

### Task 19: Memory Import

**Files:**
- Create: `backend/import_memory.py`

**Step 1: Write import script**

Reads:
- `~/.openclaw/workspace/memory/*.md` → parse as memory summaries
- `~/.openclaw/memory/main.sqlite` → extract memory entries

Imports into `agent_memory` table.

**Step 2: Run import**

Run: `cd backend && python import_memory.py`
Expected: Memory entries imported

**Step 3: Commit**

```bash
git add backend/import_memory.py
git commit -am "feat: add memory import script"
```

---

### Task 20: Remove MongoDB Dependencies

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/.env`

**Step 1: Remove MongoDB packages from requirements.txt**

Remove: `pymongo==4.5.0`, `motor==3.3.1`

**Step 2: Remove MONGO_URL from .env**

Remove the `MONGO_URL` and `DB_NAME` lines.

**Step 3: Verify no MongoDB references remain**

Run: `grep -r "motor\|pymongo\|mongo\|bson\|ObjectId" backend/ --include="*.py"`
Expected: No results (or only in migration scripts which can be excluded)

**Step 4: Verify server starts clean**

Run: `cd backend && python -m uvicorn server:app --host 0.0.0.0 --port 8001`
Expected: Starts without MongoDB errors

**Step 5: Commit**

```bash
git commit -am "cleanup: remove MongoDB dependencies"
```

---

### Task 21: Final Verification

**Step 1: Test all pages in browser**

Verify each page loads data correctly:
- Dashboard, Agents, Skills, Tools, Models, Providers
- Channels, Sessions, Usage, Cron
- Logs (WebSocket), Activities (WebSocket)
- Gateway, Config, Hooks, ClawHub
- Health, Files
- Workspace: Users, Groups, Knowledge Base, Documents
- Users (admin), Login/Logout

**Step 2: Stop MongoDB container**

Run: `docker stop openclaw-mongo`

**Step 3: Verify everything still works without MongoDB**

Test all pages again — should work fine since everything now uses PostgreSQL.

**Step 4: Commit final state**

```bash
git commit -am "feat: complete MongoDB → PostgreSQL migration"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | Tasks 1-8 | Infrastructure, schema, data migration |
| 2 | Tasks 9-16 | Switch all backend code to PostgreSQL |
| 3 | Tasks 17-21 | New features, sync, cleanup |

**Total: 21 tasks across 3 phases**

**Files created:** ~20 new files (models, migrations, scripts, routes)
**Files modified:** ~6 existing files (server.py, auth.py, routes, requirements.txt, .env)
**Files unchanged:** gateway_cli.py, all frontend files, all CLI-based routes
