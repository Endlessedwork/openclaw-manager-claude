# Login + RBAC System Design

**Date:** 2026-02-18
**Status:** Approved

## Overview

Add authentication and role-based access control (RBAC) to OpenClaw Manager dashboard. Currently all endpoints and pages are completely open with zero security.

## Decisions

- **Approach:** Monolithic auth - add auth layer directly to existing FastAPI backend
- **Auth method:** Username/Password with JWT tokens
- **Roles:** 3 roles - Admin, Editor, Viewer
- **First user:** Seed command (`python seed_admin.py`)
- **No registration page** - Admin creates all users

## Data Model

**`users` collection (MongoDB):**

```python
{
    "_id": ObjectId,
    "email": str,           # unique, used as login identifier
    "hashed_password": str, # bcrypt hashed
    "name": str,            # display name
    "role": str,            # "admin" | "editor" | "viewer"
    "is_active": bool,      # soft disable account
    "created_at": datetime,
    "updated_at": datetime,
    "last_login": datetime
}
```

## API Endpoints

### Auth (public)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Returns JWT access + refresh token |
| `/api/auth/refresh` | POST | Refresh access token |
| `/api/auth/me` | GET | Current user profile (protected) |

### User Management (Admin only)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/users` | GET | List all users |
| `/api/users` | POST | Create user with assigned role |
| `/api/users/{id}` | PUT | Update user role/status |
| `/api/users/{id}` | DELETE | Delete user |

## Token Strategy

- **Access token:** JWT, 30 min expiry, payload: `{user_id, email, role}`
- **Refresh token:** JWT, 7 days expiry, httpOnly cookie
- **Storage:** Access token in memory (React state), refresh in httpOnly cookie

## Permission Matrix

| Page/Action | Admin | Editor | Viewer |
|------------|-------|--------|--------|
| Dashboard (view) | Y | Y | Y |
| Agents (view) | Y | Y | Y |
| Agents (edit) | Y | Y | N |
| Skills (view) | Y | Y | Y |
| Skills (install/uninstall) | Y | Y | N |
| Models (view) | Y | Y | Y |
| Models (CRUD providers) | Y | Y | N |
| Channels (view) | Y | Y | Y |
| Config (view) | Y | Y | Y |
| Config (edit) | Y | Y | N |
| Gateway (view status) | Y | Y | Y |
| Gateway (restart) | Y | N | N |
| Logs (view) | Y | Y | Y |
| Activities (view) | Y | Y | Y |
| Sessions (view) | Y | Y | Y |
| ClawHub (view) | Y | Y | Y |
| ClawHub (install/uninstall) | Y | Y | N |
| User Management | Y | N | N |

## Backend Changes

1. **`backend/auth.py`** - Password hashing (bcrypt), JWT create/verify, FastAPI dependencies (`get_current_user`, `require_role`)
2. **`backend/routes/auth_routes.py`** - Login, refresh, me endpoints
3. **`backend/routes/user_routes.py`** - User CRUD (Admin only)
4. **`backend/seed_admin.py`** - CLI script to create first Admin user
5. **`backend/server.py`** - Add auth dependency to all existing endpoints with role checks

## Frontend Changes

1. **`LoginPage.js`** - Login form at `/login` route
2. **`AuthContext.js`** - React Context for JWT + user info + role
3. **`ProtectedRoute.js`** - Route wrapper checking auth + role
4. **`UserManagementPage.js`** - User CRUD page (Admin only) at `/users`
5. **Sidebar update** - Hide menu items based on role
6. **Axios interceptor** - Attach JWT header, handle 401 redirect to login
7. **Existing pages** - Hide write actions (buttons, forms) for Viewer role

## Agent Team Strategy

3 parallel agents for efficient implementation:

| Agent | Scope | Dependencies |
|-------|-------|--------------|
| backend-auth | auth.py, routes, seed, protect endpoints | None |
| frontend-auth | LoginPage, AuthContext, ProtectedRoute, UserManagementPage | None |
| frontend-update | Sidebar, Axios interceptor, role-based UI hiding | Depends on frontend-auth (AuthContext) |
