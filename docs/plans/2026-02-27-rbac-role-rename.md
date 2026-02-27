# RBAC Role Rename Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename roles from `admin/editor/viewer` to `superadmin/admin/user` across the entire codebase.

**Architecture:** Direct string rename with identical permission mapping. `admin` → `superadmin`, `editor` → `admin`, `viewer` → `user`. Auto-migrate existing database rows on server startup.

**Tech Stack:** FastAPI (Python), React 19, SQLModel/PostgreSQL, JWT auth

---

### Task 1: Create feature branch

**Step 1: Create and checkout new branch**

```bash
git checkout -b feat/rbac-role-rename
```

**Step 2: Verify branch**

```bash
git branch --show-current
```

Expected: `feat/rbac-role-rename`

---

### Task 2: Backend — Update User model default role

**Files:**
- Modify: `backend/models/user.py:15`

**Step 1: Change default role and comment**

Change line 15 from:
```python
    role: str = Field(default="viewer")  # admin / editor / viewer
```
to:
```python
    role: str = Field(default="user")  # superadmin / admin / user
```

**Step 2: Commit**

```bash
git add backend/models/user.py
git commit -m "refactor: update User model default role to 'user'"
```

---

### Task 3: Backend — Update user_routes.py role strings

**Files:**
- Modify: `backend/routes/user_routes.py:14,21,32,52,78,92,114`

**Step 1: Update VALID_ROLES**

Change line 14 from:
```python
VALID_ROLES = {"admin", "editor", "viewer"}
```
to:
```python
VALID_ROLES = {"superadmin", "admin", "user"}
```

**Step 2: Update CreateUserRequest default**

Change line 21 from:
```python
    role: str = "viewer"
```
to:
```python
    role: str = "user"
```

**Step 3: Update all require_role("admin") to require_role("superadmin")**

Four endpoints need updating — lines 32, 52, 78, 114:

- Line 32: `require_role("admin")` → `require_role("superadmin")`
- Line 52: `require_role("admin")` → `require_role("superadmin")`
- Line 78: `require_role("admin")` → `require_role("superadmin")`
- Line 114: `require_role("admin")` → `require_role("superadmin")`

**Step 4: Update self-demotion guard**

Change line 92 from:
```python
            if body.role is not None and body.role != "admin":
                raise HTTPException(400, "Cannot demote your own admin account")
```
to:
```python
            if body.role is not None and body.role != "superadmin":
                raise HTTPException(400, "Cannot demote your own superadmin account")
```

**Step 5: Commit**

```bash
git add backend/routes/user_routes.py
git commit -m "refactor: update user_routes.py roles to superadmin/admin/user"
```

---

### Task 4: Backend — Update server.py role strings

**Files:**
- Modify: `backend/server.py` (lines 322, 508, 534, 557, 591, 802, 921, 947, 1020, 1241, 1251, 1291, 1403, 1426, 1452, 1720, 1748)

**Step 1: Update gateway restart — admin-only → superadmin-only**

Line 1291: Change `require_role("admin")` → `require_role("superadmin")`

**Step 2: Update all admin+editor endpoints → superadmin+admin**

All other `require_role("admin", "editor")` occurrences (16 total) change to `require_role("superadmin", "admin")`:

Lines: 322, 508, 534, 557, 591, 802, 921, 947, 1020, 1241, 1251, 1403, 1426, 1452, 1720, 1748

**Step 3: Commit**

```bash
git add backend/server.py
git commit -m "refactor: update server.py roles to superadmin/admin/user"
```

---

### Task 5: Backend — Update remaining route files

**Files:**
- Modify: `backend/routes/notification_routes.py` (lines 56, 79, 94, 105)
- Modify: `backend/routes/workspace_routes.py` (lines 47, 116)
- Modify: `backend/routes/file_routes.py` (line 270)
- Modify: `backend/routes/memory_routes.py` (lines 71, 90, 118)

**Step 1: Update all require_role("admin", "editor") → require_role("superadmin", "admin")**

All occurrences in these 4 files use `require_role("admin", "editor")` and should become `require_role("superadmin", "admin")`.

**Step 2: Commit**

```bash
git add backend/routes/notification_routes.py backend/routes/workspace_routes.py backend/routes/file_routes.py backend/routes/memory_routes.py
git commit -m "refactor: update route files roles to superadmin/admin/user"
```

---

### Task 6: Backend — Update seed_admin.py

**Files:**
- Modify: `backend/seed_admin.py:27,30,46,50`

**Step 1: Update role references**

- Line 27: Change `User.role == "admin"` → `User.role == "superadmin"`
- Line 30: Change `"Admin already exists"` → `"Superadmin already exists"`
- Line 33-35: Change prompts from `"Admin username"` → `"Superadmin username"`, etc.
- Line 46: Change `role="admin"` → `role="superadmin"`
- Line 50: Change `"Admin user created"` → `"Superadmin user created"`

**Step 2: Update docstring**

Line 2: Change `"Create the first admin user"` → `"Create the first superadmin user"`

**Step 3: Commit**

```bash
git add backend/seed_admin.py
git commit -m "refactor: update seed_admin.py to create superadmin role"
```

---

### Task 7: Backend — Add auto-migration on startup

**Files:**
- Modify: `backend/server.py:42-54` (the `set_db` startup function)

**Step 1: Add migration logic after setting async_session**

Insert after line 44 (`app.state.async_session = async_session`), before the warmup task:

```python
    # Migrate old role names to new names (one-time, idempotent)
    async with async_session() as session:
        from sqlmodel import update
        from models.user import User
        # Order matters: admin→superadmin first, then editor→admin
        await session.execute(update(User).where(User.role == "admin").values(role="superadmin"))
        await session.execute(update(User).where(User.role == "editor").values(role="admin"))
        await session.execute(update(User).where(User.role == "viewer").values(role="user"))
        await session.commit()
```

**Step 2: Commit**

```bash
git add backend/server.py
git commit -m "feat: add auto-migration for old role names on startup"
```

---

### Task 8: Frontend — Update AuthContext.js

**Files:**
- Modify: `frontend/src/contexts/AuthContext.js:94-100`

**Step 1: Update canEdit()**

Change line 95 from:
```javascript
    return user && (user.role === 'admin' || user.role === 'editor');
```
to:
```javascript
    return user && (user.role === 'superadmin' || user.role === 'admin');
```

**Step 2: Update isAdmin()**

Change line 99 from:
```javascript
    return user && user.role === 'admin';
```
to:
```javascript
    return user && user.role === 'superadmin';
```

**Step 3: Commit**

```bash
git add frontend/src/contexts/AuthContext.js
git commit -m "refactor: update AuthContext role checks to superadmin/admin/user"
```

---

### Task 9: Frontend — Update App.js route guard

**Files:**
- Modify: `frontend/src/App.js:76`

**Step 1: Update ProtectedRoute roles**

Change line 76 from:
```jsx
<Route path="/users" element={<ProtectedRoute roles={["admin"]}><UsersPage /></ProtectedRoute>} />
```
to:
```jsx
<Route path="/users" element={<ProtectedRoute roles={["superadmin"]}><UsersPage /></ProtectedRoute>} />
```

**Step 2: Commit**

```bash
git add frontend/src/App.js
git commit -m "refactor: update App.js route guard to superadmin"
```

---

### Task 10: Frontend — Update UsersPage.js

**Files:**
- Modify: `frontend/src/pages/UsersPage.js:7-11,19,42,109,146-148,178`

**Step 1: Update ROLE_CONFIG**

Change lines 7-11 from:
```javascript
const ROLE_CONFIG = {
  admin: { label: 'Admin', icon: Shield, color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  editor: { label: 'Editor', icon: Edit3, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  viewer: { label: 'Viewer', icon: Eye, color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20' },
};
```
to:
```javascript
const ROLE_CONFIG = {
  superadmin: { label: 'Superadmin', icon: Shield, color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  admin: { label: 'Admin', icon: Edit3, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  user: { label: 'User', icon: Eye, color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20' },
};
```

**Step 2: Update form default role**

Lines 19, 42, 109: Change all `role: 'viewer'` → `role: 'user'`

**Step 3: Update role dropdown options**

Change lines 146-148 from:
```html
<option value="viewer">Viewer</option>
<option value="editor">Editor</option>
<option value="admin">Admin</option>
```
to:
```html
<option value="user">User</option>
<option value="admin">Admin</option>
<option value="superadmin">Superadmin</option>
```

**Step 4: Update fallback role config**

Line 178: Change `ROLE_CONFIG.viewer` → `ROLE_CONFIG.user`

**Step 5: Commit**

```bash
git add frontend/src/pages/UsersPage.js
git commit -m "refactor: update UsersPage role config to superadmin/admin/user"
```

---

### Task 11: Frontend — Update Sidebar.js

**Files:**
- Modify: `frontend/src/layout/Sidebar.js:254`

**Step 1: Verify isAdmin() is used (not raw role check)**

Line 254 uses `isAdmin()` — this is already updated via AuthContext (Task 8). No code change needed.

**Step 2: Verify and move on**

Read line 254 to confirm it uses `isAdmin()` and not a raw string. If it uses `isAdmin()`, no change needed.

---

### Task 12: Frontend — Update test files

**Files:**
- Modify: `frontend/src/pages/UsersPage.test.js:18-20,33,51,63-66`
- Modify: `frontend/src/pages/ConfigPage.test.js:292` (test description only — "viewer role" in comment)

**Step 1: Update UsersPage.test.js mock data**

Change lines 18-20 from:
```javascript
  { id: 'user-1', username: 'admin', name: 'Admin User', role: 'admin', is_active: true, last_login: '2026-02-19T10:00:00Z' },
  { id: 'user-2', username: 'viewer1', name: 'Viewer One', role: 'viewer', is_active: true, last_login: null },
  { id: 'user-3', username: 'editor1', name: 'Editor One', role: 'editor', is_active: false, last_login: '2026-02-18T08:00:00Z' },
```
to:
```javascript
  { id: 'user-1', username: 'superadmin1', name: 'Superadmin User', role: 'superadmin', is_active: true, last_login: '2026-02-19T10:00:00Z' },
  { id: 'user-2', username: 'user1', name: 'User One', role: 'user', is_active: true, last_login: null },
  { id: 'user-3', username: 'admin1', name: 'Admin One', role: 'admin', is_active: false, last_login: '2026-02-18T08:00:00Z' },
```

**Step 2: Update auth mock**

Change line 33 from:
```javascript
  useAuth: () => ({ user: { id: 'user-1', username: 'admin', role: 'admin' } }),
```
to:
```javascript
  useAuth: () => ({ user: { id: 'user-1', username: 'superadmin1', role: 'superadmin' } }),
```

**Step 3: Update test assertions**

- Line 48: `'Admin User'` → `'Superadmin User'`
- Line 50: `'Viewer One'` → `'User One'`
- Line 51: `'Editor One'` → `'Admin One'`
- Line 63: `'Admin'` → `'Superadmin'`
- Line 65: `'Viewer'` → `'User'`
- Line 66: `'Editor'` → `'Admin'`
- Line 72: `'@admin'` → `'@superadmin1'`
- Line 74: `'@viewer1'` → `'@user1'`
- Line 105: `'Admin User'` → `'Superadmin User'`
- Line 115: `'Viewer One'` → `'User One'`

**Step 4: Update ConfigPage.test.js description**

Line 292: Change `'hides Save and Validate buttons for viewer role'` → `'hides Save and Validate buttons for user role'`

**Step 5: Commit**

```bash
git add frontend/src/pages/UsersPage.test.js frontend/src/pages/ConfigPage.test.js
git commit -m "test: update test files for new role names"
```

---

### Task 13: Run frontend tests

**Step 1: Run tests**

```bash
cd frontend && yarn test -- --watchAll=false
```

Expected: All tests pass.

**Step 2: If tests fail, fix failures and re-run until green**

---

### Task 14: Final verification — grep for old role names

**Step 1: Search for leftover "editor" role references**

Search backend and frontend for any remaining `"editor"` strings that are dashboard-role related (not the `Edit3` icon import or unrelated uses).

```bash
grep -rn '"editor"' backend/ frontend/src/ --include='*.py' --include='*.js' --include='*.jsx'
```

**Step 2: Search for leftover "viewer" role references**

```bash
grep -rn '"viewer"' backend/ frontend/src/ --include='*.py' --include='*.js' --include='*.jsx'
```

**Step 3: Fix any missed references**

**Step 4: Final commit if needed**

```bash
git add -A
git commit -m "fix: clean up any remaining old role references"
```

---

### Task 15: Final commit and verification

**Step 1: Review all changes**

```bash
git log --oneline feat/rbac-role-rename --not main
```

**Step 2: Run frontend tests one more time**

```bash
cd frontend && yarn test -- --watchAll=false
```

Expected: All tests pass.
