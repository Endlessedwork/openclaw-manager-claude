#!/usr/bin/env python3
"""
Import memory entries from OpenClaw workspace files into the PostgreSQL agent_memory table.

Reads:
  ~/.openclaw/workspace/memory/*.md   (markdown conversation summaries)
  ~/.openclaw/memory/main.sqlite      (if exists, SQLite memory store)

Writes to: agent_memory table.
"""

import asyncio
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

# Load env before importing database
load_dotenv(Path(__file__).parent / ".env")

from sqlmodel import select
from database import async_session, engine, init_db
from models.memory import AgentMemory


OPENCLAW_DIR = Path.home() / ".openclaw"
WORKSPACE_MEMORY_DIR = OPENCLAW_DIR / "workspace" / "memory"
SQLITE_MEMORY_PATH = OPENCLAW_DIR / "memory" / "main.sqlite"


def parse_memory_md(file_path: Path) -> dict:
    """Parse a memory markdown file and extract structured data.

    These files have a header block like:
        # Session: 2026-02-25 15:09:08 UTC
        - **Session Key**: agent:main:telegram:group:-1003838276320
        - **Session ID**: ac04df23-c7da-42d2-a86f-5732f111637c
        - **Source**: telegram

        ## Conversation Summary
        ...
    """
    text = file_path.read_text(encoding="utf-8")

    # Extract metadata from header
    session_id = None
    session_key = ""
    source = ""
    session_date = None

    # Parse session date from title
    date_match = re.search(r"# Session:\s*(.+)", text)
    if date_match:
        try:
            date_str = date_match.group(1).strip()
            # Remove timezone suffix for naive datetime
            date_str = date_str.replace(" UTC", "").strip()
            session_date = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
        except (ValueError, TypeError):
            pass

    # Parse session key
    key_match = re.search(r"\*\*Session Key\*\*:\s*(.+)", text)
    if key_match:
        session_key = key_match.group(1).strip()

    # Parse session ID
    id_match = re.search(r"\*\*Session ID\*\*:\s*([a-f0-9-]+)", text)
    if id_match:
        try:
            session_id = uuid.UUID(id_match.group(1).strip())
        except ValueError:
            pass

    # Parse source
    source_match = re.search(r"\*\*Source\*\*:\s*(\w+)", text)
    if source_match:
        source = source_match.group(1).strip()

    # Extract agent_id from session_key
    agent_id = "main"
    if session_key:
        parts = session_key.split(":")
        if len(parts) > 1:
            agent_id = parts[1]

    # The conversation content is everything after the header
    content = text.strip()

    return {
        "agent_id": agent_id,
        "session_id": session_id,
        "source": source or "conversation",
        "content": content,
        "filename": file_path.name,
        "created_at": session_date or datetime.utcnow(),
    }


async def import_md_files():
    """Import markdown memory files into agent_memory table."""
    if not WORKSPACE_MEMORY_DIR.exists():
        print(f"No workspace memory directory at {WORKSPACE_MEMORY_DIR}")
        return 0

    md_files = sorted(WORKSPACE_MEMORY_DIR.glob("*.md"))
    if not md_files:
        print("No .md files found in workspace memory directory")
        return 0

    imported = 0
    skipped = 0

    for md_path in md_files:
        # Check if this file is already imported (by matching content hash or filename in source)
        async with async_session() as session:
            existing = (await session.execute(
                select(AgentMemory).where(
                    AgentMemory.source == f"file:{md_path.name}"
                )
            )).scalar_one_or_none()
            if existing:
                skipped += 1
                continue

        parsed = parse_memory_md(md_path)

        # Verify source_session_id exists in sessions table before setting FK
        source_session_id = parsed["session_id"]
        if source_session_id:
            async with async_session() as session:
                from models.session import Session
                exists = await session.get(Session, source_session_id)
                if not exists:
                    source_session_id = None

        async with async_session() as session:
            entry = AgentMemory(
                agent_id=parsed["agent_id"],
                memory_type="summary",
                content=parsed["content"],
                source=f"file:{parsed['filename']}",
                source_session_id=source_session_id,
                created_at=parsed["created_at"],
                updated_at=parsed["created_at"],
            )
            session.add(entry)
            await session.commit()

        imported += 1
        print(f"  Imported: {md_path.name} (agent={parsed['agent_id']})")

    return imported, skipped


async def import_sqlite():
    """Import memory entries from main.sqlite if it exists and has data."""
    if not SQLITE_MEMORY_PATH.exists():
        print(f"No SQLite memory file at {SQLITE_MEMORY_PATH}")
        return 0, 0

    import sqlite3

    conn = sqlite3.connect(str(SQLITE_MEMORY_PATH))
    cursor = conn.cursor()

    # Check if there are any tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    if not tables:
        print("SQLite memory database has no tables")
        conn.close()
        return 0, 0

    imported = 0
    skipped = 0

    # Skip internal/system tables (FTS virtual tables, meta, etc.)
    skip_tables = {"meta", "files", "embedding_cache"}
    skip_prefixes = ("chunks_fts",)

    for (table_name,) in tables:
        # Skip internal tables
        if table_name in skip_tables:
            continue
        if any(table_name.startswith(p) for p in skip_prefixes):
            continue

        # Get schema
        import re
        if not re.match(r'^[a-zA-Z0-9_]+$', table_name):
            print(f"  Skipping table with invalid name: {table_name!r}")
            continue
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = [col[1] for col in cursor.fetchall()]
        print(f"  SQLite table '{table_name}' columns: {columns}")

        # Try to read rows
        cursor.execute(f"SELECT * FROM {table_name}")
        rows = cursor.fetchall()
        if not rows:
            print(f"  Table '{table_name}' is empty")
            continue

        for row in rows:
            row_dict = dict(zip(columns, row))

            # Try to map common column names
            content = (
                row_dict.get("content", "")
                or row_dict.get("text", "")
                or row_dict.get("value", "")
                or str(row_dict)
            )
            if not content or content == "{}":
                continue

            agent_id = row_dict.get("agent_id", row_dict.get("agent", "main"))
            memory_type = row_dict.get("memory_type", row_dict.get("type", "fact"))
            now_naive = datetime.utcnow()

            # Check for duplicate
            async with async_session() as session:
                existing = (await session.execute(
                    select(AgentMemory).where(
                        AgentMemory.source == f"sqlite:{table_name}",
                        AgentMemory.content == content[:500],
                    )
                )).scalar_one_or_none()
                if existing:
                    skipped += 1
                    continue

            async with async_session() as session:
                entry = AgentMemory(
                    agent_id=agent_id,
                    memory_type=memory_type,
                    content=content,
                    source=f"sqlite:{table_name}",
                    created_at=now_naive,
                    updated_at=now_naive,
                )
                session.add(entry)
                await session.commit()

            imported += 1

        print(f"  Imported {imported} rows from '{table_name}'")

    conn.close()
    return imported, skipped


async def main():
    """Run the full memory import."""
    await init_db()

    print("=" * 60)
    print("Memory Import: Markdown Files")
    print("=" * 60)
    md_result = await import_md_files()
    if isinstance(md_result, tuple):
        md_imported, md_skipped = md_result
    else:
        md_imported, md_skipped = md_result, 0

    print()
    print("=" * 60)
    print("Memory Import: SQLite Database")
    print("=" * 60)
    sqlite_imported, sqlite_skipped = await import_sqlite()

    print()
    print("=" * 60)
    print("Import complete:")
    print(f"  Markdown files imported: {md_imported}")
    print(f"  Markdown files skipped: {md_skipped}")
    print(f"  SQLite entries imported: {sqlite_imported}")
    print(f"  SQLite entries skipped: {sqlite_skipped}")
    print(f"  Total imported: {md_imported + sqlite_imported}")


if __name__ == "__main__":
    asyncio.run(main())
