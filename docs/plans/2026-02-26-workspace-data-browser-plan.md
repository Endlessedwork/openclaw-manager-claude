# Workspace Data Browser Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Workspace" sidebar section with 4 pages (Bot Users, Groups, Knowledge Base, Documents) that display and partially edit data from `~/.openclaw/workspace/shared/`.

**Architecture:** Backend reads JSON/markdown files from the filesystem and serves them via REST endpoints. Frontend pages follow the existing pattern (state, load, table, edit dialog). New `workspace_routes.py` router mounted at `/api/workspace`.

**Tech Stack:** FastAPI + aiofiles (backend), React + shadcn/ui + Tailwind (frontend), Jest (tests)

---

### Task 1: Backend — Workspace Routes Module (Users + Groups)

**Files:**
- Create: `backend/routes/workspace_routes.py`
- Modify: `backend/server.py` (add router import + include)

**Step 1: Create `backend/routes/workspace_routes.py` with user/group list + patch endpoints**

```python
import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Body
from auth import get_current_user, require_role

workspace_router = APIRouter(prefix="/workspace", tags=["workspace"])
SHARED_DIR = Path.home() / ".openclaw" / "workspace" / "shared"


def _read_json_profiles(subdir: str) -> list[dict]:
    """Read all JSON profile files from a subdirectory."""
    profiles_dir = SHARED_DIR / subdir / "profiles"
    if not profiles_dir.is_dir():
        return []
    results = []
    for f in sorted(profiles_dir.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            data["_file"] = f.name
            results.append(data)
        except (json.JSONDecodeError, OSError):
            continue
    return results


@workspace_router.get("/users")
async def list_workspace_users(user=Depends(get_current_user)):
    return _read_json_profiles("users")


@workspace_router.patch("/users/{filename}")
async def patch_workspace_user(
    filename: str,
    updates: dict = Body(...),
    user=Depends(require_role("admin", "editor")),
):
    allowed = {"role", "status", "notes"}
    invalid = set(updates.keys()) - allowed
    if invalid:
        raise HTTPException(400, f"Cannot update fields: {', '.join(invalid)}")
    filepath = (SHARED_DIR / "users" / "profiles" / filename).resolve()
    if not filepath.is_relative_to(SHARED_DIR.resolve()) or not filepath.is_file():
        raise HTTPException(404, "User profile not found")
    data = json.loads(filepath.read_text(encoding="utf-8"))
    data.update(updates)
    filepath.write_text(json.dumps(data, indent=4, ensure_ascii=False), encoding="utf-8")
    return data


@workspace_router.get("/groups")
async def list_workspace_groups(user=Depends(get_current_user)):
    groups = _read_json_profiles("groups")
    for g in groups:
        members = g.get("members", {})
        g["member_count"] = len(members)
    return groups


@workspace_router.patch("/groups/{filename}")
async def patch_workspace_group(
    filename: str,
    updates: dict = Body(...),
    user=Depends(require_role("admin", "editor")),
):
    allowed = {"status"}
    invalid = set(updates.keys()) - allowed
    if invalid:
        raise HTTPException(400, f"Cannot update fields: {', '.join(invalid)}")
    filepath = (SHARED_DIR / "groups" / "profiles" / filename).resolve()
    if not filepath.is_relative_to(SHARED_DIR.resolve()) or not filepath.is_file():
        raise HTTPException(404, "Group profile not found")
    data = json.loads(filepath.read_text(encoding="utf-8"))
    data.update(updates)
    filepath.write_text(json.dumps(data, indent=4, ensure_ascii=False), encoding="utf-8")
    return data
```

**Step 2: Register the router in `backend/server.py`**

Add import near line 20 (with other route imports):
```python
from routes.workspace_routes import workspace_router
```

Add inclusion near line 88 (after `file_router`):
```python
api_router.include_router(workspace_router)
```

**Step 3: Test manually**

Run: `cd backend && python -c "from routes.workspace_routes import workspace_router; print('OK')"`
Expected: `OK`

**Step 4: Commit**

```bash
git add backend/routes/workspace_routes.py backend/server.py
git commit -m "feat(workspace): add backend routes for users and groups"
```

---

### Task 2: Backend — Knowledge Base + Documents Endpoints

**Files:**
- Modify: `backend/routes/workspace_routes.py`

**Step 1: Add knowledge base and documents list endpoints**

Append to `workspace_routes.py`:

```python
@workspace_router.get("/knowledge")
async def list_knowledge_base(user=Depends(get_current_user)):
    kb_dir = SHARED_DIR / "knowledge_base"
    if not kb_dir.is_dir():
        return []
    results = []
    for domain_dir in sorted(kb_dir.iterdir()):
        if not domain_dir.is_dir():
            continue
        domain = domain_dir.name
        for f in sorted(domain_dir.rglob("*.md")):
            stat = f.stat()
            results.append({
                "name": f.stem,
                "filename": f.name,
                "domain": domain,
                "path": str(f.relative_to(SHARED_DIR)),
                "size": stat.st_size,
                "modified": stat.st_mtime,
            })
    return results


@workspace_router.get("/knowledge/content")
async def get_knowledge_content(
    path: str,
    user=Depends(get_current_user),
):
    resolved = (SHARED_DIR / path).resolve()
    if not resolved.is_relative_to(SHARED_DIR.resolve()):
        raise HTTPException(403, "Access denied")
    if not resolved.is_file() or resolved.suffix != ".md":
        raise HTTPException(404, "Article not found")
    return {"content": resolved.read_text(encoding="utf-8"), "path": path}


@workspace_router.get("/documents")
async def list_workspace_documents(user=Depends(get_current_user)):
    docs_dir = SHARED_DIR / "documents"
    if not docs_dir.is_dir():
        return []
    results = []
    for domain_dir in sorted(docs_dir.iterdir()):
        if not domain_dir.is_dir():
            continue
        domain = domain_dir.name
        for f in sorted(domain_dir.iterdir()):
            if f.name.startswith(".") or f.name.endswith(".metadata.json"):
                continue
            if not f.is_file():
                continue
            meta_file = f.parent / f"{f.name}.metadata.json"
            meta = {}
            if meta_file.is_file():
                try:
                    meta = json.loads(meta_file.read_text(encoding="utf-8"))
                except (json.JSONDecodeError, OSError):
                    pass
            stat = f.stat()
            results.append({
                "name": f.name,
                "domain": domain,
                "path": str(f.relative_to(SHARED_DIR)),
                "size": stat.st_size,
                "modified": stat.st_mtime,
                "type": f.suffix.lstrip(".") or "unknown",
                "sensitivity": meta.get("sensitivity", ""),
                "uploaded_by": meta.get("source", {}).get("uploaded_by", ""),
                "approved_by": meta.get("approved_by", ""),
            })
    return results
```

**Step 2: Test manually**

Run: `cd backend && python -c "from routes.workspace_routes import workspace_router; print(len(workspace_router.routes), 'routes')"`
Expected: `6 routes`

**Step 3: Commit**

```bash
git add backend/routes/workspace_routes.py
git commit -m "feat(workspace): add knowledge base and documents endpoints"
```

---

### Task 3: Frontend — API Functions + Sidebar Menu

**Files:**
- Modify: `frontend/src/lib/api.js`
- Modify: `frontend/src/layout/Sidebar.js`

**Step 1: Add API functions to `frontend/src/lib/api.js`**

Add at end of file (before closing or after last export):

```javascript
// Workspace
export const getWorkspaceUsers = () => api.get('/workspace/users');
export const patchWorkspaceUser = (filename, data) => api.patch(`/workspace/users/${filename}`, data);
export const getWorkspaceGroups = () => api.get('/workspace/groups');
export const patchWorkspaceGroup = (filename, data) => api.patch(`/workspace/groups/${filename}`, data);
export const getWorkspaceKnowledge = () => api.get('/workspace/knowledge');
export const getWorkspaceKnowledgeContent = (path) => api.get(`/workspace/knowledge/content?path=${encodeURIComponent(path)}`);
export const getWorkspaceDocuments = () => api.get('/workspace/documents');
```

**Step 2: Add "Workspace" group to Sidebar.js**

In the `navGroups` array, add a new entry after `'monitoring'` group and before `'system'` group. Add imports for new icons:

Add to icon imports (line 4):
```javascript
import { ..., Database, UserCircle, UsersRound, BookOpen, FileText } from 'lucide-react';
```

Add new nav group object between monitoring and system:
```javascript
{
  id: 'workspace',
  label: 'Workspace',
  icon: Database,
  items: [
    { path: '/workspace/users', label: 'Bot Users', icon: UserCircle },
    { path: '/workspace/groups', label: 'Groups', icon: UsersRound },
    { path: '/workspace/kb', label: 'Knowledge Base', icon: BookOpen },
    { path: '/workspace/docs', label: 'Documents', icon: FileText },
  ],
},
```

**Step 3: Commit**

```bash
git add frontend/src/lib/api.js frontend/src/layout/Sidebar.js
git commit -m "feat(workspace): add API functions and sidebar menu group"
```

---

### Task 4: Frontend — Bot Users Page

**Files:**
- Create: `frontend/src/pages/WorkspaceUsersPage.js`
- Modify: `frontend/src/App.js` (add route)

**Step 1: Create `frontend/src/pages/WorkspaceUsersPage.js`**

```javascript
import React, { useEffect, useState, useMemo } from 'react';
import { getWorkspaceUsers, patchWorkspaceUser } from '../lib/api';
import { UserCircle, RefreshCw, Search, Loader2, Pencil } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

const ROLES = ['guest', 'member', 'vip', 'admin', 'blocked'];
const STATUSES = ['new', 'active', 'inactive', 'blocked'];
const PLATFORMS = ['line', 'telegram'];

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function WorkspaceUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ role: '', status: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const { canEdit } = useAuth();

  const load = async () => {
    setLoading(true);
    try {
      const res = await getWorkspaceUsers();
      setUsers(res.data);
    } catch {
      toast.error('Failed to load bot users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = users;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        (u.display_name || '').toLowerCase().includes(q) ||
        (u.user_id || '').toLowerCase().includes(q)
      );
    }
    if (filterPlatform !== 'all') list = list.filter(u => u.platform === filterPlatform);
    if (filterRole !== 'all') list = list.filter(u => u.role === filterRole);
    return list;
  }, [users, search, filterPlatform, filterRole]);

  const openEdit = (u) => {
    setEditing(u);
    setForm({ role: u.role || 'guest', status: u.status || 'new', notes: u.notes || '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await patchWorkspaceUser(editing._file, {
        role: form.role,
        status: form.status,
        notes: form.notes,
      });
      toast.success('User updated');
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const roleBadge = (role) => {
    const colors = {
      admin: 'bg-orange-500/20 text-orange-400',
      vip: 'bg-purple-500/20 text-purple-400',
      member: 'bg-sky-500/20 text-sky-400',
      guest: 'bg-zinc-500/20 text-zinc-400',
      blocked: 'bg-red-500/20 text-red-400',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[role] || colors.guest}`}>
        {role}
      </span>
    );
  };

  const platformBadge = (platform) => {
    const colors = {
      line: 'bg-green-500/20 text-green-400',
      telegram: 'bg-blue-500/20 text-blue-400',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[platform] || 'bg-zinc-500/20 text-zinc-400'}`}>
        {platform}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-theme-primary flex items-center gap-2">
            <UserCircle className="w-6 h-6 text-orange-500" /> Bot Users
          </h1>
          <p className="text-theme-faint text-sm mt-1">
            {users.length} users across all platforms
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}
          className="border-subtle text-theme-secondary hover:text-theme-primary">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-faint" />
          <Input
            placeholder="Search by name or ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-surface-card border-subtle text-theme-primary"
          />
        </div>
        <Select value={filterPlatform} onValueChange={setFilterPlatform}>
          <SelectTrigger className="w-[140px] bg-surface-card border-subtle text-theme-primary">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent className="bg-surface-card border-subtle">
            <SelectItem value="all">All Platforms</SelectItem>
            {PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-[130px] bg-surface-card border-subtle text-theme-primary">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent className="bg-surface-card border-subtle">
            <SelectItem value="all">All Roles</SelectItem>
            {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-theme-faint">No users found</div>
      ) : (
        <div className="bg-surface-card border border-subtle rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-subtle">
                <th className="text-left px-4 py-3 text-theme-faint font-medium">User</th>
                <th className="text-left px-4 py-3 text-theme-faint font-medium">Platform</th>
                <th className="text-left px-4 py-3 text-theme-faint font-medium">Role</th>
                <th className="text-left px-4 py-3 text-theme-faint font-medium">Status</th>
                <th className="text-left px-4 py-3 text-theme-faint font-medium">Last Seen</th>
                {canEdit() && <th className="text-right px-4 py-3 text-theme-faint font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u._file} className="border-b border-subtle last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-theme-primary font-medium">{u.display_name || 'Unknown'}</div>
                    <div className="text-theme-faint text-xs font-mono">{u.user_id}</div>
                  </td>
                  <td className="px-4 py-3">{platformBadge(u.platform)}</td>
                  <td className="px-4 py-3">{roleBadge(u.role)}</td>
                  <td className="px-4 py-3 text-theme-secondary text-xs">{u.status || '—'}</td>
                  <td className="px-4 py-3 text-theme-faint text-xs">{timeAgo(u.last_seen_at)}</td>
                  {canEdit() && (
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(u)}
                        data-testid={`edit-user-${u._file}`}
                        className="text-theme-faint hover:text-orange-400">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-surface-card border-subtle max-w-md">
          <DialogHeader>
            <DialogTitle className="text-theme-primary">
              Edit {editing?.display_name || 'User'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs text-theme-faint mb-1 block">Role</label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger className="bg-surface-page border-subtle text-theme-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-surface-card border-subtle">
                  {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-theme-faint mb-1 block">Status</label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="bg-surface-page border-subtle text-theme-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-surface-card border-subtle">
                  {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-theme-faint mb-1 block">Notes</label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="bg-surface-page border-subtle text-theme-primary"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}
                className="border-subtle text-theme-secondary">Cancel</Button>
              <Button onClick={handleSave} disabled={saving}
                className="bg-orange-600 hover:bg-orange-700 text-white">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

**Step 2: Add route in `App.js`**

Add import:
```javascript
import WorkspaceUsersPage from './pages/WorkspaceUsersPage';
```

Add route inside the protected routes block (after `/files` route):
```javascript
<Route path="/workspace/users" element={<WorkspaceUsersPage />} />
```

**Step 3: Verify it renders**

Run: `cd frontend && yarn start` — navigate to `/workspace/users`

**Step 4: Commit**

```bash
git add frontend/src/pages/WorkspaceUsersPage.js frontend/src/App.js
git commit -m "feat(workspace): add Bot Users page with search, filter, and edit"
```

---

### Task 5: Frontend — Groups Page

**Files:**
- Create: `frontend/src/pages/WorkspaceGroupsPage.js`
- Modify: `frontend/src/App.js` (add route)

**Step 1: Create `frontend/src/pages/WorkspaceGroupsPage.js`**

```javascript
import React, { useEffect, useState, useMemo } from 'react';
import { getWorkspaceGroups, patchWorkspaceGroup } from '../lib/api';
import { UsersRound, RefreshCw, Search, Loader2, Pencil, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

const STATUSES = ['active', 'inactive', 'blocked'];

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function WorkspaceGroupsPage() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [expanded, setExpanded] = useState({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ status: '' });
  const [saving, setSaving] = useState(false);
  const { canEdit } = useAuth();

  const load = async () => {
    setLoading(true);
    try {
      const res = await getWorkspaceGroups();
      setGroups(res.data);
    } catch {
      toast.error('Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = groups;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(g =>
        (g.group_name || '').toLowerCase().includes(q) ||
        (g.group_id || '').toLowerCase().includes(q)
      );
    }
    if (filterPlatform !== 'all') list = list.filter(g => g.platform === filterPlatform);
    return list;
  }, [groups, search, filterPlatform]);

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const openEdit = (g) => {
    setEditing(g);
    setForm({ status: g.status || 'active' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await patchWorkspaceGroup(editing._file, { status: form.status });
      toast.success('Group updated');
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (status) => {
    const colors = {
      active: 'bg-green-500/20 text-green-400',
      inactive: 'bg-zinc-500/20 text-zinc-400',
      blocked: 'bg-red-500/20 text-red-400',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.active}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-theme-primary flex items-center gap-2">
            <UsersRound className="w-6 h-6 text-orange-500" /> Groups
          </h1>
          <p className="text-theme-faint text-sm mt-1">{groups.length} groups</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}
          className="border-subtle text-theme-secondary hover:text-theme-primary">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-faint" />
          <Input placeholder="Search groups..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-surface-card border-subtle text-theme-primary" />
        </div>
        <Select value={filterPlatform} onValueChange={setFilterPlatform}>
          <SelectTrigger className="w-[140px] bg-surface-card border-subtle text-theme-primary">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent className="bg-surface-card border-subtle">
            <SelectItem value="all">All Platforms</SelectItem>
            <SelectItem value="line">line</SelectItem>
            <SelectItem value="telegram">telegram</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-theme-faint">No groups found</div>
      ) : (
        <div className="bg-surface-card border border-subtle rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-subtle">
                <th className="w-8"></th>
                <th className="text-left px-4 py-3 text-theme-faint font-medium">Group</th>
                <th className="text-left px-4 py-3 text-theme-faint font-medium">Platform</th>
                <th className="text-left px-4 py-3 text-theme-faint font-medium">Status</th>
                <th className="text-left px-4 py-3 text-theme-faint font-medium">Members</th>
                <th className="text-left px-4 py-3 text-theme-faint font-medium">Last Seen</th>
                {canEdit() && <th className="text-right px-4 py-3 text-theme-faint font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(g => {
                const members = Object.entries(g.members || {});
                const isOpen = expanded[g.group_id];
                return (
                  <React.Fragment key={g._file}>
                    <tr className="border-b border-subtle hover:bg-muted/30 transition-colors">
                      <td className="pl-3">
                        {members.length > 0 && (
                          <button onClick={() => toggle(g.group_id)} className="text-theme-faint hover:text-theme-secondary p-1">
                            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-theme-primary font-medium">{g.group_name || 'Unnamed'}</div>
                        <div className="text-theme-faint text-xs font-mono">{g.group_id}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          g.platform === 'line' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
                        }`}>{g.platform}</span>
                      </td>
                      <td className="px-4 py-3">{statusBadge(g.status)}</td>
                      <td className="px-4 py-3 text-theme-secondary">{g.member_count || 0}</td>
                      <td className="px-4 py-3 text-theme-faint text-xs">{timeAgo(g.last_seen_at)}</td>
                      {canEdit() && (
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(g)}
                            data-testid={`edit-group-${g._file}`}
                            className="text-theme-faint hover:text-orange-400">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                    {isOpen && members.length > 0 && (
                      <tr className="bg-muted/20">
                        <td colSpan={canEdit() ? 7 : 6} className="px-8 py-3">
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                            {members.map(([id, m]) => (
                              <div key={id} className="text-xs bg-surface-page rounded px-2 py-1.5 border border-subtle">
                                <div className="text-theme-secondary font-medium truncate">{m.display_name || id}</div>
                                <div className="text-theme-faint font-mono truncate">{id}</div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-surface-card border-subtle max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-theme-primary">
              Edit {editing?.group_name || 'Group'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs text-theme-faint mb-1 block">Status</label>
              <Select value={form.status} onValueChange={v => setForm({ status: v })}>
                <SelectTrigger className="bg-surface-page border-subtle text-theme-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-surface-card border-subtle">
                  {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}
                className="border-subtle text-theme-secondary">Cancel</Button>
              <Button onClick={handleSave} disabled={saving}
                className="bg-orange-600 hover:bg-orange-700 text-white">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

**Step 2: Add route in `App.js`**

```javascript
import WorkspaceGroupsPage from './pages/WorkspaceGroupsPage';
```

```javascript
<Route path="/workspace/groups" element={<WorkspaceGroupsPage />} />
```

**Step 3: Commit**

```bash
git add frontend/src/pages/WorkspaceGroupsPage.js frontend/src/App.js
git commit -m "feat(workspace): add Groups page with expandable members and edit"
```

---

### Task 6: Frontend — Knowledge Base Page

**Files:**
- Create: `frontend/src/pages/WorkspaceKBPage.js`
- Modify: `frontend/src/App.js`

**Step 1: Create `frontend/src/pages/WorkspaceKBPage.js`**

```javascript
import React, { useEffect, useState, useMemo } from 'react';
import { getWorkspaceKnowledge, getWorkspaceKnowledgeContent } from '../lib/api';
import { BookOpen, RefreshCw, Search, Loader2, FileText, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';

const DOMAINS = ['financial', 'strategic', 'operations', 'production', 'hr', 'commercial'];

const DOMAIN_COLORS = {
  financial: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  strategic: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  operations: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  production: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  hr: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  commercial: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function WorkspaceKBPage() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDomain, setFilterDomain] = useState('all');
  const [viewOpen, setViewOpen] = useState(false);
  const [viewContent, setViewContent] = useState('');
  const [viewTitle, setViewTitle] = useState('');
  const [loadingContent, setLoadingContent] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getWorkspaceKnowledge();
      setArticles(res.data);
    } catch {
      toast.error('Failed to load knowledge base');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = articles;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a => a.name.toLowerCase().includes(q) || a.filename.toLowerCase().includes(q));
    }
    if (filterDomain !== 'all') list = list.filter(a => a.domain === filterDomain);
    return list;
  }, [articles, search, filterDomain]);

  const grouped = useMemo(() => {
    const map = {};
    for (const a of filtered) {
      if (!map[a.domain]) map[a.domain] = [];
      map[a.domain].push(a);
    }
    return map;
  }, [filtered]);

  const openArticle = async (article) => {
    setViewTitle(article.name);
    setViewOpen(true);
    setLoadingContent(true);
    try {
      const res = await getWorkspaceKnowledgeContent(article.path);
      setViewContent(res.data.content);
    } catch {
      setViewContent('Failed to load content.');
    } finally {
      setLoadingContent(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-theme-primary flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-orange-500" /> Knowledge Base
          </h1>
          <p className="text-theme-faint text-sm mt-1">{articles.length} articles across {DOMAINS.length} domains</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}
          className="border-subtle text-theme-secondary hover:text-theme-primary">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-faint" />
          <Input placeholder="Search articles..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-surface-card border-subtle text-theme-primary" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setFilterDomain('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filterDomain === 'all'
                ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                : 'bg-surface-card text-theme-faint border-subtle hover:text-theme-secondary'
            }`}>All</button>
          {DOMAINS.map(d => (
            <button key={d} onClick={() => setFilterDomain(d)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                filterDomain === d
                  ? DOMAIN_COLORS[d]
                  : 'bg-surface-card text-theme-faint border-subtle hover:text-theme-secondary'
              }`}>{d}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-theme-faint">No articles found</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([domain, items]) => (
            <div key={domain}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-theme-faint mb-3 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${DOMAIN_COLORS[domain]?.split(' ')[0] || 'bg-zinc-500'}`} />
                {domain} <span className="text-theme-dimmed font-normal">({items.length})</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map(a => (
                  <button key={a.path} onClick={() => openArticle(a)}
                    className="text-left bg-surface-card border border-subtle rounded-lg p-4 hover:border-orange-500/30 hover:bg-muted/30 transition-all group">
                    <div className="flex items-start gap-3">
                      <FileText className="w-5 h-5 text-theme-faint group-hover:text-orange-400 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="text-theme-primary font-medium truncate group-hover:text-orange-400">
                          {a.name}
                        </div>
                        <div className="text-theme-faint text-xs mt-1">
                          {formatSize(a.size)} · {new Date(a.modified * 1000).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="bg-surface-card border-subtle max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-theme-primary">{viewTitle}</DialogTitle>
          </DialogHeader>
          {loadingContent ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            </div>
          ) : (
            <pre className="whitespace-pre-wrap text-sm text-theme-secondary font-mono leading-relaxed p-4 bg-surface-page rounded-lg border border-subtle overflow-x-auto">
              {viewContent}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

**Step 2: Add route in `App.js`**

```javascript
import WorkspaceKBPage from './pages/WorkspaceKBPage';
```

```javascript
<Route path="/workspace/kb" element={<WorkspaceKBPage />} />
```

**Step 3: Commit**

```bash
git add frontend/src/pages/WorkspaceKBPage.js frontend/src/App.js
git commit -m "feat(workspace): add Knowledge Base page with domain grouping and article viewer"
```

---

### Task 7: Frontend — Documents Page

**Files:**
- Create: `frontend/src/pages/WorkspaceDocsPage.js`
- Modify: `frontend/src/App.js`

**Step 1: Create `frontend/src/pages/WorkspaceDocsPage.js`**

```javascript
import React, { useEffect, useState, useMemo } from 'react';
import { getWorkspaceDocuments } from '../lib/api';
import { FileText, RefreshCw, Search, Loader2, File, Image, FileSpreadsheet } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';

const DOMAINS = ['financial', 'legal', 'strategic', 'operations', 'production', 'hr', 'commercial', 'uncategorized'];

const DOMAIN_COLORS = {
  financial: 'bg-emerald-500/20 text-emerald-400',
  legal: 'bg-yellow-500/20 text-yellow-400',
  strategic: 'bg-purple-500/20 text-purple-400',
  operations: 'bg-sky-500/20 text-sky-400',
  production: 'bg-amber-500/20 text-amber-400',
  hr: 'bg-pink-500/20 text-pink-400',
  commercial: 'bg-blue-500/20 text-blue-400',
  uncategorized: 'bg-zinc-500/20 text-zinc-400',
};

const SENSITIVITY_COLORS = {
  INTERNAL: 'bg-yellow-500/20 text-yellow-400',
  CONFIDENTIAL: 'bg-red-500/20 text-red-400',
  PUBLIC: 'bg-green-500/20 text-green-400',
};

function fileIcon(type) {
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(type)) return Image;
  if (['xlsx', 'xls', 'csv'].includes(type)) return FileSpreadsheet;
  return File;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function WorkspaceDocsPage() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDomain, setFilterDomain] = useState('all');
  const [filterSensitivity, setFilterSensitivity] = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const res = await getWorkspaceDocuments();
      setDocs(res.data);
    } catch {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = docs;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        d.name.toLowerCase().includes(q) ||
        (d.uploaded_by || '').toLowerCase().includes(q)
      );
    }
    if (filterDomain !== 'all') list = list.filter(d => d.domain === filterDomain);
    if (filterSensitivity !== 'all') list = list.filter(d => d.sensitivity === filterSensitivity);
    return list;
  }, [docs, search, filterDomain, filterSensitivity]);

  const grouped = useMemo(() => {
    const map = {};
    for (const d of filtered) {
      if (!map[d.domain]) map[d.domain] = [];
      map[d.domain].push(d);
    }
    return map;
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-theme-primary flex items-center gap-2">
            <FileText className="w-6 h-6 text-orange-500" /> Documents
          </h1>
          <p className="text-theme-faint text-sm mt-1">{docs.length} documents across {DOMAINS.length} domains</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}
          className="border-subtle text-theme-secondary hover:text-theme-primary">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-faint" />
          <Input placeholder="Search documents..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-surface-card border-subtle text-theme-primary" />
        </div>
        <Select value={filterDomain} onValueChange={setFilterDomain}>
          <SelectTrigger className="w-[150px] bg-surface-card border-subtle text-theme-primary">
            <SelectValue placeholder="Domain" />
          </SelectTrigger>
          <SelectContent className="bg-surface-card border-subtle">
            <SelectItem value="all">All Domains</SelectItem>
            {DOMAINS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSensitivity} onValueChange={setFilterSensitivity}>
          <SelectTrigger className="w-[160px] bg-surface-card border-subtle text-theme-primary">
            <SelectValue placeholder="Sensitivity" />
          </SelectTrigger>
          <SelectContent className="bg-surface-card border-subtle">
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="PUBLIC">Public</SelectItem>
            <SelectItem value="INTERNAL">Internal</SelectItem>
            <SelectItem value="CONFIDENTIAL">Confidential</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-theme-faint">No documents found</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([domain, items]) => (
            <div key={domain}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-theme-faint mb-3 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${(DOMAIN_COLORS[domain] || 'bg-zinc-500/20').split(' ')[0]}`} />
                {domain} <span className="text-theme-dimmed font-normal">({items.length})</span>
              </h2>
              <div className="bg-surface-card border border-subtle rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-subtle">
                      <th className="text-left px-4 py-2.5 text-theme-faint font-medium">File</th>
                      <th className="text-left px-4 py-2.5 text-theme-faint font-medium">Type</th>
                      <th className="text-left px-4 py-2.5 text-theme-faint font-medium">Size</th>
                      <th className="text-left px-4 py-2.5 text-theme-faint font-medium">Uploaded By</th>
                      <th className="text-left px-4 py-2.5 text-theme-faint font-medium">Sensitivity</th>
                      <th className="text-left px-4 py-2.5 text-theme-faint font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(d => {
                      const Icon = fileIcon(d.type);
                      return (
                        <tr key={d.path} className="border-b border-subtle last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <Icon className="w-4 h-4 text-theme-faint shrink-0" />
                              <span className="text-theme-primary truncate max-w-[300px]">{d.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="px-2 py-0.5 rounded bg-surface-page text-theme-faint text-xs font-mono">
                              {d.type}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-theme-faint text-xs">{formatSize(d.size)}</td>
                          <td className="px-4 py-2.5 text-theme-secondary text-xs">{d.uploaded_by || '—'}</td>
                          <td className="px-4 py-2.5">
                            {d.sensitivity ? (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SENSITIVITY_COLORS[d.sensitivity] || 'bg-zinc-500/20 text-zinc-400'}`}>
                                {d.sensitivity}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-theme-faint text-xs">
                            {new Date(d.modified * 1000).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Add route in `App.js`**

```javascript
import WorkspaceDocsPage from './pages/WorkspaceDocsPage';
```

```javascript
<Route path="/workspace/docs" element={<WorkspaceDocsPage />} />
```

**Step 3: Commit**

```bash
git add frontend/src/pages/WorkspaceDocsPage.js frontend/src/App.js
git commit -m "feat(workspace): add Documents page with domain grouping and metadata"
```

---

### Task 8: Frontend Tests — Bot Users Page

**Files:**
- Create: `frontend/src/pages/WorkspaceUsersPage.test.js`

**Step 1: Write tests**

```javascript
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import WorkspaceUsersPage from './WorkspaceUsersPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('lucide-react', () => {
  const C = (name) => (props) => <svg data-testid={`icon-${name}`} {...props} />;
  return {
    UserCircle: C('user-circle'), RefreshCw: C('refresh'), Search: C('search'),
    Loader2: C('loader'), Pencil: C('pencil'),
  };
});

let mockCanEdit = true;
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ canEdit: () => mockCanEdit }),
}));

const mockUsers = [
  { _file: 'line_U001.json', platform: 'line', user_id: 'U001', display_name: 'Alice', role: 'member', status: 'active', last_seen_at: new Date().toISOString() },
  { _file: 'telegram_T001.json', platform: 'telegram', user_id: 'T001', display_name: 'Bob', role: 'guest', status: 'new', last_seen_at: null },
];

let mockGetUsers, mockPatchUser;
jest.mock('../lib/api', () => ({
  getWorkspaceUsers: (...a) => mockGetUsers(...a),
  patchWorkspaceUser: (...a) => mockPatchUser(...a),
}));

beforeEach(() => {
  mockGetUsers = jest.fn().mockResolvedValue({ data: mockUsers });
  mockPatchUser = jest.fn().mockResolvedValue({ data: {} });
  mockCanEdit = true;
});

describe('WorkspaceUsersPage', () => {
  it('renders users after loading', async () => {
    render(<WorkspaceUsersPage />);
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });
  });

  it('shows loading spinner initially', () => {
    mockGetUsers.mockReturnValue(new Promise(() => {}));
    render(<WorkspaceUsersPage />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('filters by search text', async () => {
    render(<WorkspaceUsersPage />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('Search by name or ID...'), { target: { value: 'Alice' } });
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  });

  it('hides edit button for non-editors', async () => {
    mockCanEdit = false;
    render(<WorkspaceUsersPage />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(screen.queryByTestId('edit-user-line_U001.json')).not.toBeInTheDocument();
  });

  it('opens edit dialog and saves', async () => {
    render(<WorkspaceUsersPage />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('edit-user-line_U001.json'));
    await waitFor(() => expect(screen.getByText('Edit Alice')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockPatchUser).toHaveBeenCalledWith('line_U001.json', expect.objectContaining({ role: 'member' }));
    });
  });
});
```

**Step 2: Run tests**

Run: `cd frontend && yarn test -- --testPathPattern=WorkspaceUsersPage --watchAll=false`
Expected: 5 tests pass

**Step 3: Commit**

```bash
git add frontend/src/pages/WorkspaceUsersPage.test.js
git commit -m "test(workspace): add Bot Users page tests"
```

---

### Task 9: Frontend Tests — Groups Page

**Files:**
- Create: `frontend/src/pages/WorkspaceGroupsPage.test.js`

**Step 1: Write tests**

```javascript
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import WorkspaceGroupsPage from './WorkspaceGroupsPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('lucide-react', () => {
  const C = (name) => (props) => <svg data-testid={`icon-${name}`} {...props} />;
  return {
    UsersRound: C('users'), RefreshCw: C('refresh'), Search: C('search'),
    Loader2: C('loader'), Pencil: C('pencil'), ChevronDown: C('chevron-down'),
    ChevronRight: C('chevron-right'),
  };
});

let mockCanEdit = true;
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ canEdit: () => mockCanEdit }),
}));

const mockGroups = [
  { _file: 'line_C001.json', platform: 'line', group_id: 'C001', group_name: 'Test Group', status: 'active', member_count: 2, last_seen_at: new Date().toISOString(), members: { U1: { display_name: 'User 1' }, U2: { display_name: 'User 2' } } },
];

let mockGetGroups, mockPatchGroup;
jest.mock('../lib/api', () => ({
  getWorkspaceGroups: (...a) => mockGetGroups(...a),
  patchWorkspaceGroup: (...a) => mockPatchGroup(...a),
}));

beforeEach(() => {
  mockGetGroups = jest.fn().mockResolvedValue({ data: mockGroups });
  mockPatchGroup = jest.fn().mockResolvedValue({ data: {} });
  mockCanEdit = true;
});

describe('WorkspaceGroupsPage', () => {
  it('renders groups after loading', async () => {
    render(<WorkspaceGroupsPage />);
    await waitFor(() => {
      expect(screen.getByText('Test Group')).toBeInTheDocument();
    });
  });

  it('shows member count', async () => {
    render(<WorkspaceGroupsPage />);
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
  });

  it('expands to show members on click', async () => {
    render(<WorkspaceGroupsPage />);
    await waitFor(() => expect(screen.getByText('Test Group')).toBeInTheDocument());
    const expandBtn = screen.getByTestId('icon-chevron-right').closest('button');
    fireEvent.click(expandBtn);
    await waitFor(() => {
      expect(screen.getByText('User 1')).toBeInTheDocument();
      expect(screen.getByText('User 2')).toBeInTheDocument();
    });
  });
});
```

**Step 2: Run tests**

Run: `cd frontend && yarn test -- --testPathPattern=WorkspaceGroupsPage --watchAll=false`
Expected: 3 tests pass

**Step 3: Commit**

```bash
git add frontend/src/pages/WorkspaceGroupsPage.test.js
git commit -m "test(workspace): add Groups page tests"
```

---

### Task 10: Verify All Tests Pass + Final Commit

**Step 1: Run all frontend tests**

Run: `cd frontend && yarn test -- --watchAll=false`
Expected: All tests pass

**Step 2: Run backend import check**

Run: `cd backend && python -c "from routes.workspace_routes import workspace_router; print('Routes:', len(workspace_router.routes))"`
Expected: `Routes: 6`

**Step 3: Final verification commit (if any fixes needed)**

```bash
git add -A
git commit -m "feat(workspace): complete workspace data browser with 4 pages"
```
