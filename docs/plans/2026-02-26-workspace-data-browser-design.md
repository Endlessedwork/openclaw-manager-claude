# Workspace Data Browser — Design Document

**Date:** 2026-02-26
**Status:** Approved

## Overview

Add a "Workspace" section to the sidebar with 4 pages that display data from `~/.openclaw/workspace/shared/`. Provides a database-like admin view for bot users, groups, knowledge base, and documents.

## Pages

| Page | Route | Data Source | Editable Fields |
|------|-------|-------------|-----------------|
| Bot Users | `/workspace/users` | `users/profiles/*.json` | role, status, notes |
| Groups | `/workspace/groups` | `groups/profiles/*.json` | status |
| Knowledge Base | `/workspace/kb` | `knowledge_base/**/*.md` + `_catalog.jsonl` | — (read-only) |
| Documents | `/workspace/docs` | `documents/**/*` + `.metadata.json` | — (read-only) |

## Backend API

New endpoints in `server.py`:

```
GET    /api/workspace/users          → list all user profiles
PATCH  /api/workspace/users/{id}     → update role/status/notes
GET    /api/workspace/groups         → list all group profiles
PATCH  /api/workspace/groups/{id}    → update status
GET    /api/workspace/knowledge      → list KB articles (with domain grouping)
GET    /api/workspace/documents      → list documents with metadata
```

All endpoints read directly from filesystem (`~/.openclaw/workspace/shared/`), not via CLI. PATCH endpoints write back to the JSON files.

## Frontend Design

### Sidebar
New group "Workspace" (icon: `Database`) between "System" and admin items, containing:
- Bot Users (icon: `UserCircle`)
- Groups (icon: `UsersRound`)
- Knowledge Base (icon: `BookOpen`)
- Documents (icon: `FileText`)

### Page Pattern (shared across all 4 pages)
1. **Header** — title + description + count badge
2. **Search bar** — full-text search across visible fields
3. **Filter pills** — platform, role, status, domain (varies by page)
4. **Data table** — sortable columns using existing shadcn Table
5. **Edit dialog** — modal for editable fields (Users/Groups only)

### Bot Users Page
- Columns: Display Name, Platform, Role, Status, Created, Last Seen
- Filters: platform (line/telegram), role (guest/member/admin), status
- Click row → edit dialog for role/status/notes

### Groups Page
- Columns: Group Name, Platform, Status, Members (count), Last Seen
- Expandable row → shows member list
- Click status → edit dialog

### Knowledge Base Page
- Domain tabs/pills: financial, strategic, operations, production, hr, commercial
- Cards showing article title, domain, date
- Click card → markdown preview in dialog/panel

### Documents Page
- Columns: Filename, Domain, Type, Uploaded By, Sensitivity, Date
- Filters: domain, sensitivity, file type
- Group by domain (accordion/tabs)

## Data Schemas

### User Profile (from JSON files)
```json
{
  "platform": "line",
  "user_id": "U52c...",
  "display_name": "Sumalee245",
  "role": "guest",
  "status": "new",
  "created_at": "2026-02-25T02:54:12.320Z",
  "last_seen_at": "2026-02-25T03:00:34.582Z",
  "notes": ""
}
```

### Group Profile (from JSON files)
```json
{
  "platform": "line",
  "group_id": "C05c...",
  "group_name": "PARTY",
  "status": "active",
  "created_at": "2026-02-25T08:07:27.101Z",
  "last_seen_at": "2026-02-25T19:27:22.792Z",
  "members": { "U...": { "display_name": "ff", "first_seen_at": "..." } }
}
```

### Document Metadata (from .metadata.json)
```json
{
  "source": { "platform": "...", "original_path": "...", "uploaded_by": "..." },
  "domain": "financial",
  "sensitivity": "INTERNAL",
  "stored_by": "...",
  "approved_by": "lucy"
}
```
