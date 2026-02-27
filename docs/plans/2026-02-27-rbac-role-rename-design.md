# RBAC Role Rename Design

**Date:** 2026-02-27
**Status:** Approved

## Overview

Rename the existing 3-role system from `admin/editor/viewer` to `superadmin/admin/user` with identical permissions mapping.

## Role Mapping

| Old Role | New Role | Permissions |
|----------|----------|-------------|
| `admin` | `superadmin` | Full access: manage dashboard users, restart gateway, all CRUD |
| `editor` | `admin` | Write access: agents, models, config, channels, bindings, etc. No user management |
| `viewer` | `user` | Read-only: view all pages, no edit/delete capabilities |

## Approach

Direct rename — change all role string references across the codebase. No logic changes needed.

## Backend Changes

### Models
- `backend/models/user.py`: default role `"viewer"` → `"user"`

### Auth
- `backend/auth.py`: no changes (uses string matching from JWT)

### Routes
- `backend/routes/user_routes.py`: `VALID_ROLES = {"superadmin", "admin", "user"}`, all `require_role("admin")` → `require_role("superadmin")`
- `backend/server.py`: `require_role("admin")` → `require_role("superadmin")` for gateway restart; `require_role("admin", "editor")` → `require_role("superadmin", "admin")` for all write endpoints
- All other route files: same pattern for `require_role` calls

### Seed Script
- `backend/seed_admin.py`: create initial user with `role="superadmin"`

### Auto-Migration (server startup)
```python
await db.users.update_many({"role": "admin"}, {"$set": {"role": "superadmin"}})
await db.users.update_many({"role": "editor"}, {"$set": {"role": "admin"}})
await db.users.update_many({"role": "viewer"}, {"$set": {"role": "user"}})
```

## Frontend Changes

### Auth Context
- `canEdit()`: check `superadmin` || `admin`
- `isAdmin()`: check `superadmin`

### UI Components
- `UsersPage.js`: update `ROLE_CONFIG` keys and labels
- `Sidebar.js`: Users nav shown for `superadmin` only
- `App.js`: ProtectedRoute roles `["admin"]` → `["superadmin"]`

### Pages using `canEdit()`/`isAdmin()`
No changes needed — these rely on AuthContext helpers which will be updated.

## No Changes Required
- WebSocket auth (no role check)
- API layer (`src/lib/api.js`)
- JWT token structure (still carries `role` field)
