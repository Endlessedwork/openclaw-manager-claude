"""
MongoDB → PostgreSQL data migration script.

Reads all documents from MongoDB collections and inserts them into
the corresponding PostgreSQL tables (already created via Alembic).

Collections migrated:
  - users           (3 records)  — ObjectId → new UUID
  - activity_logs   (13 records) — existing string UUID preserved
  - daily_usage     (2 records)  — flat cost fields → cost_breakdown JSON
  - agent_activities, system_logs, agent_fallbacks, clawhub_skills (0 records each)

Usage:
    cd backend && python migrate_data.py
"""

import asyncio
import uuid
from datetime import datetime, timezone, date as date_type

from pymongo import MongoClient
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# ── Connection strings ──────────────────────────────────────────────
MONGO_URL = "mongodb://openclaw:oc_m0ng0_s3cur3_2024@127.0.0.1:27017"
MONGO_DB = "openclaw_manager"
PG_URL = "postgresql+asyncpg://openclaw:oc_pg_s3cur3_2026@127.0.0.1:5433/openclaw_manager"

# ── Import all SQLModel models ──────────────────────────────────────
from models.user import User
from models.activity import ActivityLog, AgentActivity, SystemLog
from models.usage import DailyUsage
from models.fallback import AgentFallback
from models.clawhub import ClawHubSkill


def connect_mongo():
    client = MongoClient(MONGO_URL)
    return client[MONGO_DB]


def make_pg_engine():
    engine = create_async_engine(PG_URL, echo=False)
    session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return engine, session_factory


# ── Helpers ─────────────────────────────────────────────────────────

def parse_datetime(val) -> datetime:
    """Convert various datetime representations to a naive (UTC) datetime.

    PostgreSQL columns are TIMESTAMP WITHOUT TIME ZONE, so asyncpg rejects
    offset-aware Python datetimes.  We normalise everything to UTC then
    strip tzinfo before returning.
    """
    if val is None:
        return None
    if isinstance(val, datetime):
        if val.tzinfo is not None:
            # Convert to UTC, then strip tzinfo
            val = val.astimezone(timezone.utc).replace(tzinfo=None)
        return val
    if isinstance(val, str):
        val = val.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(val)
            if dt.tzinfo is not None:
                dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
            return dt
        except ValueError:
            return datetime.utcnow()
    return datetime.utcnow()


def parse_date(val) -> date_type:
    """Convert a date string (YYYY-MM-DD) to a date object."""
    if isinstance(val, date_type):
        return val
    if isinstance(val, str):
        return date_type.fromisoformat(val)
    return date_type.today()


# ── Migration functions ─────────────────────────────────────────────

async def migrate_users(mongo_db, session_factory):
    """Migrate users collection. ObjectId → new UUID. Print mapping."""
    collection = mongo_db["users"]
    docs = list(collection.find())

    if not docs:
        print("[users] No documents to migrate.")
        return 0

    id_mapping = {}  # old ObjectId string → new UUID
    rows = []

    for doc in docs:
        old_id = str(doc["_id"])
        new_id = uuid.uuid4()
        id_mapping[old_id] = new_id

        user = User(
            id=new_id,
            username=doc["username"],
            hashed_password=doc["hashed_password"],
            name=doc.get("name", ""),
            role=doc.get("role", "user"),
            is_active=doc.get("is_active", True),
            created_at=parse_datetime(doc.get("created_at")),
            updated_at=parse_datetime(doc.get("updated_at")),
            last_login=parse_datetime(doc.get("last_login")),
        )
        rows.append(user)

    async with session_factory() as session:
        session.add_all(rows)
        await session.commit()

    print(f"[users] Migrated {len(rows)} records.")
    print("  User ID mapping (MongoDB ObjectId → PostgreSQL UUID):")
    for doc in docs:
        old_id = str(doc["_id"])
        print(f"    {doc['username']:15s}  {old_id}  →  {id_mapping[old_id]}")

    return len(rows)


async def migrate_activity_logs(mongo_db, session_factory):
    """Migrate activity_logs. Preserves existing string UUID ids."""
    collection = mongo_db["activity_logs"]
    docs = list(collection.find())

    if not docs:
        print("[activity_logs] No documents to migrate.")
        return 0

    rows = []
    for doc in docs:
        # The 'id' field is already a UUID string in MongoDB
        existing_uuid = uuid.UUID(doc["id"])

        log = ActivityLog(
            id=existing_uuid,
            action=doc.get("action", ""),
            entity_type=doc.get("entity_type", ""),
            entity_id=doc.get("entity_id", ""),
            details=doc.get("details", ""),
            timestamp=parse_datetime(doc.get("timestamp")),
        )
        rows.append(log)

    async with session_factory() as session:
        session.add_all(rows)
        await session.commit()

    print(f"[activity_logs] Migrated {len(rows)} records.")
    return len(rows)


async def migrate_daily_usage(mongo_db, session_factory):
    """Migrate daily_usage. Pack individual cost fields into cost_breakdown JSON."""
    collection = mongo_db["daily_usage"]
    docs = list(collection.find())

    if not docs:
        print("[daily_usage] No documents to migrate.")
        return 0

    rows = []
    for doc in docs:
        # Build cost_breakdown from individual fields
        cost_breakdown = {}
        for key in ["cacheRead", "cacheReadCost", "cacheWrite", "cacheWriteCost",
                     "input", "inputCost", "output", "outputCost", "missingCostEntries"]:
            if key in doc:
                cost_breakdown[key] = doc[key]

        usage = DailyUsage(
            id=uuid.uuid4(),
            date=parse_date(doc["date"]),
            total_tokens=doc.get("totalTokens", 0),
            total_cost=doc.get("totalCost", 0.0),
            cost_breakdown=cost_breakdown if cost_breakdown else None,
            updated_at=parse_datetime(doc.get("updated_at")),
        )
        rows.append(usage)

    async with session_factory() as session:
        session.add_all(rows)
        await session.commit()

    print(f"[daily_usage] Migrated {len(rows)} records.")
    for r in rows:
        print(f"    {r.date}  tokens={r.total_tokens}  cost=${r.total_cost:.4f}")
    return len(rows)


async def migrate_agent_activities(mongo_db, session_factory):
    """Migrate agent_activities collection."""
    collection = mongo_db["agent_activities"]
    docs = list(collection.find())

    if not docs:
        print("[agent_activities] No documents to migrate (collection empty).")
        return 0

    rows = []
    for doc in docs:
        activity = AgentActivity(
            id=uuid.uuid4(),
            agent_id=doc.get("agent_id", ""),
            agent_name=doc.get("agent_name", ""),
            event_type=doc.get("event_type", ""),
            tool_name=doc.get("tool_name"),
            status=doc.get("status", "completed"),
            duration_ms=doc.get("duration_ms"),
            tokens_in=doc.get("tokens_in"),
            tokens_out=doc.get("tokens_out"),
            channel=doc.get("channel"),
            model_used=doc.get("model_used"),
            message=doc.get("message", ""),
            timestamp=parse_datetime(doc.get("timestamp")),
        )
        rows.append(activity)

    async with session_factory() as session:
        session.add_all(rows)
        await session.commit()

    print(f"[agent_activities] Migrated {len(rows)} records.")
    return len(rows)


async def migrate_system_logs(mongo_db, session_factory):
    """Migrate system_logs collection."""
    collection = mongo_db["system_logs"]
    docs = list(collection.find())

    if not docs:
        print("[system_logs] No documents to migrate (collection empty).")
        return 0

    rows = []
    for doc in docs:
        log = SystemLog(
            id=uuid.uuid4(),
            level=doc.get("level", "INFO"),
            source=doc.get("source", ""),
            message=doc.get("message", ""),
            raw=doc.get("raw", ""),
            timestamp=parse_datetime(doc.get("timestamp")),
        )
        rows.append(log)

    async with session_factory() as session:
        session.add_all(rows)
        await session.commit()

    print(f"[system_logs] Migrated {len(rows)} records.")
    return len(rows)


async def migrate_agent_fallbacks(mongo_db, session_factory):
    """Migrate agent_fallbacks collection."""
    collection = mongo_db["agent_fallbacks"]
    docs = list(collection.find())

    if not docs:
        print("[agent_fallbacks] No documents to migrate (collection empty).")
        return 0

    rows = []
    for doc in docs:
        fallback = AgentFallback(
            id=uuid.uuid4(),
            agent_id=doc.get("agent_id", ""),
            fallbacks=doc.get("fallbacks", []),
        )
        rows.append(fallback)

    async with session_factory() as session:
        session.add_all(rows)
        await session.commit()

    print(f"[agent_fallbacks] Migrated {len(rows)} records.")
    return len(rows)


async def migrate_clawhub_skills(mongo_db, session_factory):
    """Migrate clawhub_skills collection."""
    collection = mongo_db["clawhub_skills"]
    docs = list(collection.find())

    if not docs:
        print("[clawhub_skills] No documents to migrate (collection empty).")
        return 0

    rows = []
    for doc in docs:
        # ClawHubSkill uses string id (not UUID)
        skill_id = doc.get("id", str(doc["_id"]))
        skill = ClawHubSkill(
            id=skill_id,
            slug=doc.get("slug", ""),
            name=doc.get("name", ""),
            description=doc.get("description", ""),
            category=doc.get("category", ""),
            tags=doc.get("tags", []),
            downloads=doc.get("downloads", 0),
            version=doc.get("version", ""),
            installed=doc.get("installed", False),
            installed_version=doc.get("installed_version"),
        )
        rows.append(skill)

    async with session_factory() as session:
        session.add_all(rows)
        await session.commit()

    print(f"[clawhub_skills] Migrated {len(rows)} records.")
    return len(rows)


# ── Main ────────────────────────────────────────────────────────────

async def main():
    print("=" * 60)
    print("MongoDB → PostgreSQL Data Migration")
    print("=" * 60)
    print()

    # Connect
    mongo_db = connect_mongo()
    engine, session_factory = make_pg_engine()

    total = 0
    results = {}

    # Migrate each collection
    for name, func in [
        ("users", migrate_users),
        ("activity_logs", migrate_activity_logs),
        ("daily_usage", migrate_daily_usage),
        ("agent_activities", migrate_agent_activities),
        ("system_logs", migrate_system_logs),
        ("agent_fallbacks", migrate_agent_fallbacks),
        ("clawhub_skills", migrate_clawhub_skills),
    ]:
        try:
            count = await func(mongo_db, session_factory)
            results[name] = count
            total += count
        except Exception as e:
            print(f"[{name}] ERROR: {e}")
            results[name] = f"ERROR: {e}"

    # Summary
    print()
    print("=" * 60)
    print("Migration Summary")
    print("=" * 60)
    for name, count in results.items():
        print(f"  {name:25s}  {count}")
    print(f"  {'TOTAL':25s}  {total}")
    print()
    print("Done. Verify with:")
    print('  docker exec openclaw-postgres psql -U openclaw -d openclaw_manager \\')
    print("    -c \"SELECT 'users', count(*) FROM users UNION ALL "
          "SELECT 'activity_logs', count(*) FROM activity_logs UNION ALL "
          "SELECT 'daily_usage', count(*) FROM daily_usage;\"")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
