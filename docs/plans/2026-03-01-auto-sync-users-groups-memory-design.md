# Auto-Sync Bot Users, Groups, and Memory on Startup

## Problem

When deploying OpenClaw Manager to a new system (or one already running openclaw), the `/workspace/users` page shows no data. The `bot_users` and `bot_groups` tables are empty because:

1. `auto_sync.py` (runs on startup) syncs documents, knowledge, and sessions — but **not** bot users, groups, or memory.
2. `import_file_data.py` and `import_memory.py` handle these, but are manual scripts not mentioned in INSTALL.md.
3. The profile resolver caches users to DB, but only triggers when visiting the Sessions page.

## Solution

Add `sync_bot_users()`, `sync_bot_groups()`, and `sync_memory()` to `auto_sync.py` so all disk-based data is imported automatically on every server startup.

## Changes

**Single file:** `backend/auto_sync.py`

### New Functions

#### `sync_bot_users() -> int`
- Source: `~/.openclaw/workspace/shared/users/profiles/*.json`
- Upsert via `ON CONFLICT (platform_user_id) DO UPDATE`
- Updates: display_name, avatar_url, role, status, notes, metadata, last_seen_at, updated_at
- Skips if directory doesn't exist (returns 0)

#### `sync_bot_groups() -> int`
- Source: `~/.openclaw/workspace/shared/groups/profiles/*.json`
- Upsert via `ON CONFLICT (platform_group_id) DO UPDATE`
- Updates: name, status, member_count, members, updated_at
- Skips if directory doesn't exist (returns 0)

#### `sync_memory() -> int`
- Source 1: `~/.openclaw/workspace/memory/*.md` — insert-only, dedup by `source = "file:{filename}"`
- Source 2: `~/.openclaw/memory/main.sqlite` — insert-only, dedup by `source + content`
- Skips if directories/files don't exist

### Execution Order in `run_auto_sync()`

```
1. sync_bot_users()      ← NEW
2. sync_bot_groups()     ← NEW
3. sync_documents()      (existing)
4. sync_knowledge()      (existing)
5. sync_sessions()       (existing)
6. sync_memory()         ← NEW
```

Users and groups sync before sessions so profile data is available if needed.

## Safety Guarantees

- **No deletes**: Only inserts or updates. Existing records are never removed.
- **Upsert for users/groups**: `ON CONFLICT DO UPDATE` — new data from disk updates DB, but records created via profile resolver or manual entry are preserved.
- **Insert-only for memory**: Dedup check prevents duplicates; existing entries untouched.
- **Idempotent**: Safe to run on every restart. Re-running produces the same state.
- **Graceful degradation**: Missing directories or files are silently skipped with logged counts.

## What Stays the Same

- `import_file_data.py` and `import_memory.py` remain as standalone manual scripts.
- No schema changes or new migrations.
- No changes to INSTALL.md (the manual step is no longer needed).
- Profile resolver continues to work independently for API-based lookups.
