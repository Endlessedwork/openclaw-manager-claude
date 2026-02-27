"""
Import file-based data from the OpenClaw workspace into PostgreSQL.

Sources:
  1. Bot Users:      ~/.openclaw/workspace/shared/users/profiles/*.json
  2. Bot Groups:     ~/.openclaw/workspace/shared/groups/profiles/*.json
  3. Knowledge Base: ~/.openclaw/workspace/shared/knowledge_base/{domain}/*.md
  4. Documents:      ~/.openclaw/workspace/shared/documents/{domain}/*

Usage:
    cd backend && python import_file_data.py
"""

import asyncio
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://openclaw:oc_pg_s3cur3_2026@127.0.0.1:5433/openclaw_manager",
)
WORKSPACE_SHARED = Path.home() / ".openclaw" / "workspace" / "shared"

# ---------------------------------------------------------------------------
# Database setup (standalone -- does not import the app's database module so
# the script can run independently without starting the FastAPI app)
# ---------------------------------------------------------------------------

engine = create_async_engine(DATABASE_URL, echo=False, pool_size=5, max_overflow=10)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def parse_iso(dt_str: str | None) -> datetime | None:
    """Parse an ISO-8601 datetime string into a naive UTC datetime.

    The database columns are 'timestamp without time zone', so we store
    UTC datetimes without tzinfo to avoid asyncpg offset-naive/aware clashes.
    """
    if not dt_str:
        return None
    try:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        # Convert to UTC then strip tzinfo for naive storage
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except (ValueError, TypeError):
        return None


def now_utc() -> datetime:
    """Return current UTC time as a naive datetime (no tzinfo)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def extract_title_from_markdown(content: str, fallback_filename: str) -> str:
    """Extract the first H1 heading from markdown, or fall back to filename."""
    match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return Path(fallback_filename).stem


def extract_frontmatter_tags(content: str) -> list[str]:
    """Extract tags from YAML frontmatter if present."""
    fm_match = re.match(r"^---\s*\n(.*?)\n---\s*\n", content, re.DOTALL)
    if not fm_match:
        return []
    fm = fm_match.group(1)
    tag_match = re.search(r"^tags:\s*\[(.+?)\]", fm, re.MULTILINE)
    if tag_match:
        raw = tag_match.group(1)
        return [t.strip().strip("'\"") for t in raw.split(",") if t.strip()]
    # tags as list items
    tags = []
    in_tags = False
    for line in fm.splitlines():
        if re.match(r"^tags:\s*$", line):
            in_tags = True
            continue
        if in_tags:
            m = re.match(r"^\s*-\s+(.+)$", line)
            if m:
                tags.append(m.group(1).strip().strip("'\""))
            else:
                break
    return tags


# ---------------------------------------------------------------------------
# Importers
# ---------------------------------------------------------------------------

async def import_bot_users(session: AsyncSession) -> int:
    """Import bot user profiles from JSON files."""
    profiles_dir = WORKSPACE_SHARED / "users" / "profiles"
    if not profiles_dir.is_dir():
        print(f"  [SKIP] Directory not found: {profiles_dir}")
        return 0

    count = 0
    for fpath in sorted(profiles_dir.glob("*.json")):
        try:
            data = json.loads(fpath.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            print(f"  [WARN] Skipping {fpath.name}: {exc}")
            continue

        # Use raw user_id without platform prefix — the `platform` column
        # already stores "line"/"telegram"/etc. separately.
        platform_user_id = data.get("user_id", "")
        if not platform_user_id:
            # Derive from filename, stripping any platform prefix
            # e.g. "line_U2191ce..." → "U2191ce..."
            stem = fpath.stem
            platform = data.get("platform", "")
            if platform and stem.startswith(f"{platform}_"):
                platform_user_id = stem[len(platform) + 1 :]
            else:
                platform_user_id = stem

        # Determine first_seen_at and last_seen_at
        first_seen = parse_iso(data.get("first_seen_at") or data.get("created_at"))
        last_seen = parse_iso(data.get("last_seen_at"))
        created_at = parse_iso(data.get("created_at")) or now_utc()

        # Build metadata dict from extra fields not covered by columns
        meta = {}
        if data.get("picture_url"):
            meta["picture_url"] = data["picture_url"]

        await session.execute(
            text("""
                INSERT INTO bot_users
                    (id, platform_user_id, platform, display_name, avatar_url,
                     role, status, notes, metadata, first_seen_at, last_seen_at,
                     created_at, updated_at)
                VALUES
                    (:id, :platform_user_id, :platform, :display_name, :avatar_url,
                     :role, :status, :notes, :metadata, :first_seen_at, :last_seen_at,
                     :created_at, :updated_at)
                ON CONFLICT (platform_user_id) DO UPDATE SET
                    display_name = EXCLUDED.display_name,
                    avatar_url   = EXCLUDED.avatar_url,
                    role         = EXCLUDED.role,
                    status       = EXCLUDED.status,
                    notes        = EXCLUDED.notes,
                    metadata     = EXCLUDED.metadata,
                    last_seen_at = EXCLUDED.last_seen_at,
                    updated_at   = EXCLUDED.updated_at
            """),
            {
                "id": str(uuid.uuid4()),
                "platform_user_id": platform_user_id,
                "platform": data.get("platform", "unknown"),
                "display_name": data.get("display_name", ""),
                "avatar_url": data.get("avatar_url"),
                "role": data.get("role", ""),
                "status": data.get("status", ""),
                "notes": data.get("notes"),
                "metadata": json.dumps(meta) if meta else None,
                "first_seen_at": first_seen,
                "last_seen_at": last_seen,
                "created_at": created_at,
                "updated_at": now_utc(),
            },
        )
        count += 1

    await session.commit()
    return count


async def import_bot_groups(session: AsyncSession) -> int:
    """Import bot group profiles from JSON files."""
    profiles_dir = WORKSPACE_SHARED / "groups" / "profiles"
    if not profiles_dir.is_dir():
        print(f"  [SKIP] Directory not found: {profiles_dir}")
        return 0

    count = 0
    for fpath in sorted(profiles_dir.glob("*.json")):
        try:
            data = json.loads(fpath.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            print(f"  [WARN] Skipping {fpath.name}: {exc}")
            continue

        # Use raw group_id without platform prefix — the `platform` column
        # already stores "line"/"telegram"/etc. separately.
        platform_group_id = data.get("group_id", "")
        if not platform_group_id:
            # Derive from filename, stripping any platform prefix
            stem = fpath.stem
            platform = data.get("platform", "")
            if platform and stem.startswith(f"{platform}_"):
                platform_group_id = stem[len(platform) + 1 :]
            else:
                platform_group_id = stem

        members = data.get("members", {})
        member_count = len(members) if isinstance(members, dict) else 0
        created_at = parse_iso(data.get("created_at")) or now_utc()

        await session.execute(
            text("""
                INSERT INTO bot_groups
                    (id, platform_group_id, platform, name, status,
                     member_count, members, assigned_agent_id, metadata,
                     created_at, updated_at)
                VALUES
                    (:id, :platform_group_id, :platform, :name, :status,
                     :member_count, :members, :assigned_agent_id, :metadata,
                     :created_at, :updated_at)
                ON CONFLICT (platform_group_id) DO UPDATE SET
                    name              = EXCLUDED.name,
                    status            = EXCLUDED.status,
                    member_count      = EXCLUDED.member_count,
                    members           = EXCLUDED.members,
                    assigned_agent_id = EXCLUDED.assigned_agent_id,
                    updated_at        = EXCLUDED.updated_at
            """),
            {
                "id": str(uuid.uuid4()),
                "platform_group_id": platform_group_id,
                "platform": data.get("platform", "unknown"),
                "name": data.get("group_name", ""),
                "status": data.get("status", "active"),
                "member_count": member_count,
                "members": json.dumps(members) if members else None,
                "assigned_agent_id": data.get("assigned_agent_id"),
                "metadata": None,
                "created_at": created_at,
                "updated_at": now_utc(),
            },
        )
        count += 1

    await session.commit()
    return count


async def import_knowledge_articles(session: AsyncSession) -> int:
    """Import knowledge base markdown files."""
    kb_dir = WORKSPACE_SHARED / "knowledge_base"
    if not kb_dir.is_dir():
        print(f"  [SKIP] Directory not found: {kb_dir}")
        return 0

    count = 0
    for domain_dir in sorted(kb_dir.iterdir()):
        if not domain_dir.is_dir():
            continue
        domain = domain_dir.name

        # Walk recursively to find .md files
        for fpath in sorted(domain_dir.rglob("*.md")):
            # Skip README.md files
            if fpath.name.lower() == "readme.md":
                continue

            try:
                content = fpath.read_text(encoding="utf-8")
            except OSError as exc:
                print(f"  [WARN] Skipping {fpath}: {exc}")
                continue

            title = extract_title_from_markdown(content, fpath.name)
            tags = extract_frontmatter_tags(content)

            # Check for .metadata.json sidecar
            sidecar = fpath.parent / f"{fpath.name}.metadata.json"
            if not sidecar.exists():
                sidecar = fpath.parent / f"{fpath.stem}.metadata.json"

            created_by = None
            if sidecar.exists():
                try:
                    meta = json.loads(sidecar.read_text(encoding="utf-8"))
                    if meta.get("tags") and not tags:
                        tags = meta["tags"]
                    created_by = meta.get("published_by")
                except (json.JSONDecodeError, OSError):
                    pass

            await session.execute(
                text("""
                    INSERT INTO knowledge_articles
                        (id, domain, title, content, tags, status,
                         created_by, updated_by, created_at, updated_at)
                    VALUES
                        (:id, :domain, :title, :content, :tags, :status,
                         :created_by, :updated_by, :created_at, :updated_at)
                """),
                {
                    "id": str(uuid.uuid4()),
                    "domain": domain,
                    "title": title,
                    "content": content,
                    "tags": tags,
                    "status": "published",
                    "created_by": created_by,
                    "updated_by": None,
                    "created_at": now_utc(),
                    "updated_at": now_utc(),
                },
            )
            count += 1

    await session.commit()
    return count


async def import_workspace_documents(session: AsyncSession) -> int:
    """Import workspace documents (non-metadata files)."""
    docs_dir = WORKSPACE_SHARED / "documents"
    if not docs_dir.is_dir():
        print(f"  [SKIP] Directory not found: {docs_dir}")
        return 0

    count = 0
    for domain_dir in sorted(docs_dir.iterdir()):
        if not domain_dir.is_dir():
            continue
        domain = domain_dir.name

        # Walk recursively, skip metadata sidecars and .metadata dirs
        for fpath in sorted(domain_dir.rglob("*")):
            if not fpath.is_file():
                continue

            # Skip metadata sidecar files
            if fpath.name.endswith(".metadata.json"):
                continue
            # Skip files inside .metadata directories
            if ".metadata" in fpath.parts:
                continue
            # Skip hidden files
            if fpath.name.startswith("."):
                continue

            filename = fpath.name
            file_path = str(fpath)
            file_ext = fpath.suffix.lstrip(".").lower()
            try:
                file_size = fpath.stat().st_size
            except OSError:
                file_size = 0

            # Look for metadata sidecar (two patterns):
            # 1. filename.metadata.json (next to the file)
            # 2. .metadata/filename_without_ext.json (in .metadata subdir)
            sidecar_data = {}
            sidecar1 = fpath.parent / f"{fpath.name}.metadata.json"
            sidecar2 = fpath.parent / ".metadata" / f"{fpath.stem}.json"
            for sc in [sidecar1, sidecar2]:
                if sc.exists():
                    try:
                        sidecar_data = json.loads(sc.read_text(encoding="utf-8"))
                    except (json.JSONDecodeError, OSError):
                        pass
                    break

            sensitivity = sidecar_data.get("sensitivity", "internal").lower()

            # Extract uploaded_by
            uploaded_by = None
            src = sidecar_data.get("source", {})
            if isinstance(src, dict) and src.get("uploaded_by"):
                uploaded_by = src["uploaded_by"]
            elif sidecar_data.get("stored_by"):
                uploaded_by = sidecar_data["stored_by"]

            approved_by = sidecar_data.get("approved_by")

            # Build meta from remaining sidecar data
            meta_keys_to_include = [
                "description", "tags", "domain", "file_type",
                "original_name", "raw_path", "restored_at",
            ]
            meta = {}
            for k in meta_keys_to_include:
                if k in sidecar_data:
                    meta[k] = sidecar_data[k]
            if src and isinstance(src, dict):
                meta["source"] = src

            await session.execute(
                text("""
                    INSERT INTO workspace_documents
                        (id, domain, filename, file_path, file_type, file_size,
                         sensitivity, uploaded_by, approved_by, metadata,
                         created_at, updated_at)
                    VALUES
                        (:id, :domain, :filename, :file_path, :file_type, :file_size,
                         :sensitivity, :uploaded_by, :approved_by, :metadata,
                         :created_at, :updated_at)
                """),
                {
                    "id": str(uuid.uuid4()),
                    "domain": domain,
                    "filename": filename,
                    "file_path": file_path,
                    "file_type": file_ext,
                    "file_size": file_size,
                    "sensitivity": sensitivity,
                    "uploaded_by": uploaded_by,
                    "approved_by": approved_by,
                    "metadata": json.dumps(meta) if meta else None,
                    "created_at": now_utc(),
                    "updated_at": now_utc(),
                },
            )
            count += 1

    await session.commit()
    return count


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main():
    print("=" * 60)
    print("OpenClaw Manager -- File Data Import")
    print("=" * 60)
    print(f"Database:  {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else DATABASE_URL}")
    print(f"Workspace: {WORKSPACE_SHARED}")
    print()

    # Quick connectivity check
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as exc:
        print(f"[ERROR] Cannot connect to database: {exc}")
        sys.exit(1)

    async with async_session() as session:
        # 1. Bot Users
        print("[1/4] Importing bot users ...")
        n_users = await import_bot_users(session)
        print(f"       => {n_users} bot users imported")

        # 2. Bot Groups
        print("[2/4] Importing bot groups ...")
        n_groups = await import_bot_groups(session)
        print(f"       => {n_groups} bot groups imported")

        # 3. Knowledge Articles
        print("[3/4] Importing knowledge articles ...")
        n_articles = await import_knowledge_articles(session)
        print(f"       => {n_articles} knowledge articles imported")

        # 4. Workspace Documents
        print("[4/4] Importing workspace documents ...")
        n_docs = await import_workspace_documents(session)
        print(f"       => {n_docs} workspace documents imported")

    print()
    print("-" * 60)
    print("Summary:")
    print(f"  Bot Users:          {n_users}")
    print(f"  Bot Groups:         {n_groups}")
    print(f"  Knowledge Articles: {n_articles}")
    print(f"  Workspace Documents:{n_docs}")
    total = n_users + n_groups + n_articles + n_docs
    print(f"  TOTAL:              {total}")
    print("-" * 60)

    # Verify counts in DB
    print()
    print("Verification (row counts in database):")
    # Table names are hardcoded — safe from injection
    _VERIFY_TABLES = ["bot_users", "bot_groups", "knowledge_articles", "workspace_documents"]
    async with engine.connect() as conn:
        for table in _VERIFY_TABLES:
            result = await conn.execute(text(f"SELECT count(*) FROM {table}"))
            db_count = result.scalar()
            print(f"  {table}: {db_count}")

    await engine.dispose()
    print()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
