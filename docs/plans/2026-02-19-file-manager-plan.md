# Files Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Files page that lets users browse and edit files within `~/.openclaw/` using a hybrid category-cards + tree-browser UI.

**Architecture:** Backend adds a new `file_routes.py` router with 4 endpoints for categories, tree listing, file read, and file write — all sandboxed to `~/.openclaw/`. Frontend adds a single `FilesPage.js` with two modes: category grid overview and split-pane tree browser with file viewer/editor. Route and sidebar integration follows existing patterns exactly.

**Tech Stack:** Python/FastAPI (backend), React 19 + Tailwind + shadcn/ui + lucide-react (frontend)

---

### Task 1: Backend — File Routes

**Files:**
- Create: `backend/routes/file_routes.py`
- Modify: `backend/server.py:19` (add import) and `backend/server.py:42` (include router)

**Step 1: Create `backend/routes/file_routes.py`**

This file implements all 4 file API endpoints. Key details:

- `OPENCLAW_ROOT` = `Path.home() / ".openclaw"`
- `_safe_path(relative_path)` helper: resolves path, checks it's within OPENCLAW_ROOT, raises 403 if not
- Categories are hardcoded with their directory paths; file counts and sizes are computed by walking the directory
- "Config" category is special — it lists `*.json` and `*.env` files in the root directory only (not recursive)
- Text file detection: check extension against allowlist (`.md`, `.txt`, `.json`, `.yaml`, `.yml`, `.env`, `.js`, `.py`, `.sh`, `.toml`, `.cfg`, `.ini`, `.log`, `.csv`)
- Credentials directory: when reading files under `credentials/`, mask values that look like API keys (regex replace sequences of 20+ alphanumeric chars, keeping first 6 and last 4)
- Max file size for content read: 1MB. Return `"type": "binary"` with metadata only for larger or non-text files

```python
from fastapi import APIRouter, HTTPException, Query, Depends
from pathlib import Path
from datetime import datetime, timezone
import os
import re

from auth import get_current_user, require_role

file_router = APIRouter(prefix="/files", tags=["files"])

OPENCLAW_ROOT = Path.home() / ".openclaw"

TEXT_EXTENSIONS = {
    ".md", ".txt", ".json", ".yaml", ".yml", ".env", ".js", ".py", ".sh",
    ".toml", ".cfg", ".ini", ".log", ".csv", ".ts", ".html", ".css",
    ".xml", ".conf", ".bat", ".ps1", ".rb", ".go", ".rs",
}

MAX_TEXT_SIZE = 1 * 1024 * 1024  # 1MB

CATEGORIES = [
    {"name": "Agents", "icon": "bot", "path": "agents/", "description": "Agent workspaces & configs"},
    {"name": "Skills", "icon": "sparkles", "path": "skills/", "description": "Installed skill files"},
    {"name": "Config", "icon": "settings", "path": "__root_configs__", "description": "Config files"},
    {"name": "Media", "icon": "image", "path": "media/", "description": "Images, audio, uploads"},
    {"name": "Memory", "icon": "brain", "path": "memory/", "description": "Context & memory storage"},
    {"name": "Credentials", "icon": "key", "path": "credentials/", "description": "API keys & secrets"},
    {"name": "Scripts", "icon": "file-code", "path": "scripts/", "description": "User scripts"},
    {"name": "Browser", "icon": "globe", "path": "browser/", "description": "Browser automation data"},
    {"name": "Canvas", "icon": "layout", "path": "canvas/", "description": "Canvas node data"},
    {"name": "Workspace", "icon": "folder-open", "path": "workspace/", "description": "Default agent workspace"},
]


def _safe_path(relative: str) -> Path:
    """Resolve relative path within OPENCLAW_ROOT; raise 403 on traversal."""
    clean = relative.strip("/").replace("\\", "/")
    resolved = (OPENCLAW_ROOT / clean).resolve()
    if not str(resolved).startswith(str(OPENCLAW_ROOT.resolve())):
        raise HTTPException(403, "Path traversal not allowed")
    return resolved


def _is_text_file(path: Path) -> bool:
    return path.suffix.lower() in TEXT_EXTENSIONS


def _mask_credentials(content: str) -> str:
    """Mask long alphanumeric sequences that look like API keys."""
    def replacer(m):
        val = m.group(0)
        if len(val) >= 20:
            return val[:6] + "..." + val[-4:]
        return val
    return re.sub(r'[A-Za-z0-9_\-]{20,}', replacer, content)


def _dir_stats(dir_path: Path):
    """Count files and total size recursively."""
    file_count = 0
    total_size = 0
    if not dir_path.exists():
        return 0, 0
    try:
        for item in dir_path.rglob("*"):
            if item.is_file():
                file_count += 1
                try:
                    total_size += item.stat().st_size
                except OSError:
                    pass
    except PermissionError:
        pass
    return file_count, total_size


def _root_config_stats():
    """Stats for root-level config files (*.json, *.env)."""
    file_count = 0
    total_size = 0
    if not OPENCLAW_ROOT.exists():
        return 0, 0
    for item in OPENCLAW_ROOT.iterdir():
        if item.is_file() and item.suffix.lower() in (".json", ".env"):
            file_count += 1
            try:
                total_size += item.stat().st_size
            except OSError:
                pass
    return file_count, total_size


@file_router.get("/categories")
async def list_categories(user=Depends(get_current_user)):
    result = []
    for cat in CATEGORIES:
        if cat["path"] == "__root_configs__":
            fc, ts = _root_config_stats()
        else:
            fc, ts = _dir_stats(OPENCLAW_ROOT / cat["path"])
        result.append({
            "name": cat["name"],
            "icon": cat["icon"],
            "path": cat["path"],
            "description": cat["description"],
            "fileCount": fc,
            "totalSize": ts,
        })
    return result


@file_router.get("/tree")
async def list_tree(path: str = Query(..., min_length=1), user=Depends(get_current_user)):
    if path == "__root_configs__":
        entries = []
        for item in sorted(OPENCLAW_ROOT.iterdir(), key=lambda x: x.name):
            if item.is_file() and item.suffix.lower() in (".json", ".env"):
                st = item.stat()
                entries.append({
                    "name": item.name,
                    "type": "file",
                    "size": st.st_size,
                    "modified": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
                })
        return {"path": path, "entries": entries}

    resolved = _safe_path(path)
    if not resolved.is_dir():
        raise HTTPException(404, "Directory not found")

    entries = []
    try:
        for item in sorted(resolved.iterdir(), key=lambda x: (x.is_file(), x.name)):
            if item.name.startswith("."):
                continue
            if item.is_dir():
                children = sum(1 for _ in item.iterdir()) if item.exists() else 0
                entries.append({
                    "name": item.name,
                    "type": "directory",
                    "children_count": children,
                })
            elif item.is_file():
                st = item.stat()
                entries.append({
                    "name": item.name,
                    "type": "file",
                    "size": st.st_size,
                    "modified": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
                })
    except PermissionError:
        raise HTTPException(403, "Permission denied")

    return {"path": path, "entries": entries}


@file_router.get("/content")
async def get_file_content(path: str = Query(..., min_length=1), user=Depends(get_current_user)):
    if path == "__root_configs__":
        raise HTTPException(400, "Cannot read directory as file")

    resolved = _safe_path(path)
    if not resolved.is_file():
        raise HTTPException(404, "File not found")

    st = resolved.stat()
    modified = datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat()
    is_text = _is_text_file(resolved)

    if not is_text or st.st_size > MAX_TEXT_SIZE:
        return {
            "path": path,
            "type": "binary",
            "content": None,
            "size": st.st_size,
            "modified": modified,
            "editable": False,
        }

    try:
        content = resolved.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return {
            "path": path,
            "type": "binary",
            "content": None,
            "size": st.st_size,
            "modified": modified,
            "editable": False,
        }

    # Mask credentials
    rel = str(resolved.relative_to(OPENCLAW_ROOT.resolve()))
    if rel.startswith("credentials"):
        content = _mask_credentials(content)

    return {
        "path": path,
        "type": "text",
        "content": content,
        "size": st.st_size,
        "modified": modified,
        "editable": not rel.startswith("credentials"),
    }


@file_router.put("/content")
async def update_file_content(
    path: str = Query(..., min_length=1),
    body: dict = None,
    user=Depends(require_role("admin", "editor")),
):
    if not body or "content" not in body:
        raise HTTPException(400, "Missing 'content' field")

    resolved = _safe_path(path)
    if not resolved.is_file():
        raise HTTPException(404, "File not found")

    # Block editing credentials
    rel = str(resolved.relative_to(OPENCLAW_ROOT.resolve()))
    if rel.startswith("credentials"):
        raise HTTPException(403, "Cannot edit credential files through the UI")

    if not _is_text_file(resolved):
        raise HTTPException(400, "Cannot edit non-text files")

    resolved.write_text(body["content"], encoding="utf-8")
    return {"status": "ok", "path": path}
```

**Step 2: Register the router in `backend/server.py`**

Add import at line 19 (after user_routes import):
```python
from routes.file_routes import file_router
```

Add router inclusion at line 42 (after `api_router.include_router(user_router)`):
```python
api_router.include_router(file_router)
```

**Step 3: Verify backend starts**

Run: `cd /home/ubuntu/openclaw-manager/backend && python -c "from routes.file_routes import file_router; print('OK')"`
Expected: `OK`

**Step 4: Commit**

```bash
git add backend/routes/file_routes.py backend/server.py
git commit -m "feat(api): add file browsing and editing endpoints for ~/.openclaw/"
```

---

### Task 2: Frontend — API Functions

**Files:**
- Modify: `frontend/src/lib/api.js` (add 4 new API functions)

**Step 1: Add file API functions to `frontend/src/lib/api.js`**

Add after the System Health section (before Hooks):

```javascript
// Files
export const getFileCategories = () => api.get('/files/categories');
export const getFileTree = (path) => api.get(`/files/tree?path=${encodeURIComponent(path)}`);
export const getFileContent = (path) => api.get(`/files/content?path=${encodeURIComponent(path)}`);
export const updateFileContent = (path, content) => api.put(`/files/content?path=${encodeURIComponent(path)}`, { content });
```

**Step 2: Commit**

```bash
git add frontend/src/lib/api.js
git commit -m "feat(api): add file browser API functions"
```

---

### Task 3: Frontend — FilesPage Component

**Files:**
- Create: `frontend/src/pages/FilesPage.js`

**Step 1: Create `frontend/src/pages/FilesPage.js`**

This is the main page with both modes. Key implementation details:

- **State management**: `mode` ("overview" | "browse"), `selectedCategory`, `treePath`, `treeData`, `selectedFile`, `fileContent`, `editing`, `editBuffer`
- **Category Grid**: Uses same card pattern as dashboard (bg-[#0c0c0e] border border-zinc-800/60 rounded-lg)
- **Tree Browser**: Left panel (w-72) with recursive tree, right panel (flex-1) with file viewer
- **File size formatting**: Helper to display bytes as KB/MB
- **Icons**: Map category icon strings to lucide-react components
- **Breadcrumb**: Shows Overview > Category Name > folder path segments, each clickable

The full component (single file, ~400 lines):

```jsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  getFileCategories, getFileTree, getFileContent, updateFileContent
} from '../lib/api';
import {
  FolderOpen, Bot, Sparkles, Settings, Image, Brain, Key, FileCode,
  Globe, Layout, ChevronRight, ChevronDown, File, Folder, ArrowLeft,
  Pencil, Save, X, Loader2, HardDrive
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

const ICON_MAP = {
  'bot': Bot, 'sparkles': Sparkles, 'settings': Settings, 'image': Image,
  'brain': Brain, 'key': Key, 'file-code': FileCode, 'globe': Globe,
  'layout': Layout, 'folder-open': FolderOpen,
};

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function TreeNode({ entry, basePath, onSelect, selectedPath, expandedDirs, onToggleDir }) {
  const fullPath = `${basePath}${entry.name}${entry.type === 'directory' ? '/' : ''}`;
  const isExpanded = expandedDirs[fullPath];
  const isSelected = selectedPath === fullPath;

  if (entry.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => onToggleDir(fullPath)}
          className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-white/5 transition-colors ${
            isSelected ? 'bg-orange-500/10 text-orange-400' : 'text-zinc-300'
          }`}
        >
          {isExpanded ? <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" /> : <ChevronRight className="w-3 h-3 text-zinc-500 shrink-0" />}
          <Folder className="w-4 h-4 text-orange-400/70 shrink-0" />
          <span className="truncate font-mono text-xs">{entry.name}</span>
          <span className="ml-auto text-[10px] text-zinc-600">{entry.children_count}</span>
        </button>
        {isExpanded && entry.children && (
          <div className="ml-4 border-l border-zinc-800/50 pl-1">
            {entry.children.map(child => (
              <TreeNode
                key={child.name}
                entry={child}
                basePath={fullPath}
                onSelect={onSelect}
                selectedPath={selectedPath}
                expandedDirs={expandedDirs}
                onToggleDir={onToggleDir}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(fullPath)}
      className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-white/5 transition-colors ${
        isSelected ? 'bg-orange-500/10 text-orange-400' : 'text-zinc-400'
      }`}
    >
      <span className="w-3 shrink-0" />
      <File className="w-4 h-4 text-zinc-500 shrink-0" />
      <span className="truncate font-mono text-xs">{entry.name}</span>
      {entry.size != null && <span className="ml-auto text-[10px] text-zinc-600 shrink-0">{formatSize(entry.size)}</span>}
    </button>
  );
}

export default function FilesPage() {
  const { user } = useAuth();
  const canEdit = user && (user.role === 'admin' || user.role === 'editor');

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('overview'); // 'overview' | 'browse'
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [treeData, setTreeData] = useState([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBuffer, setEditBuffer] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await getFileCategories();
        setCategories(res.data);
      } catch {
        toast.error('Failed to load file categories');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadTree = useCallback(async (path) => {
    setTreeLoading(true);
    try {
      const res = await getFileTree(path);
      return res.data.entries || [];
    } catch {
      toast.error('Failed to load directory');
      return [];
    } finally {
      setTreeLoading(false);
    }
  }, []);

  const openCategory = async (cat) => {
    setSelectedCategory(cat);
    setMode('browse');
    setSelectedFile(null);
    setFileContent(null);
    setEditing(false);
    setExpandedDirs({});
    const entries = await loadTree(cat.path);
    setTreeData(entries);
  };

  const backToOverview = () => {
    setMode('overview');
    setSelectedCategory(null);
    setTreeData([]);
    setSelectedFile(null);
    setFileContent(null);
    setEditing(false);
    setExpandedDirs({});
  };

  const handleToggleDir = async (dirPath) => {
    if (expandedDirs[dirPath]) {
      setExpandedDirs(prev => ({ ...prev, [dirPath]: false }));
      return;
    }
    const entries = await loadTree(dirPath);
    setTreeData(prev => {
      const updateChildren = (nodes, targetPath, basePath) => {
        return nodes.map(node => {
          const nodePath = `${basePath}${node.name}${node.type === 'directory' ? '/' : ''}`;
          if (nodePath === targetPath) {
            return { ...node, children: entries };
          }
          if (node.children) {
            return { ...node, children: updateChildren(node.children, targetPath, nodePath) };
          }
          return node;
        });
      };
      return updateChildren(prev, dirPath, selectedCategory.path);
    });
    setExpandedDirs(prev => ({ ...prev, [dirPath]: true }));
  };

  const handleSelectFile = async (filePath) => {
    setSelectedFile(filePath);
    setEditing(false);
    setFileLoading(true);
    try {
      const res = await getFileContent(filePath);
      setFileContent(res.data);
      setEditBuffer(res.data.content || '');
    } catch {
      toast.error('Failed to load file');
      setFileContent(null);
    } finally {
      setFileLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await updateFileContent(selectedFile, editBuffer);
      toast.success('File saved');
      setEditing(false);
      setFileContent(prev => ({ ...prev, content: editBuffer }));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save file');
    } finally {
      setSaving(false);
    }
  };

  // ===== OVERVIEW MODE =====
  if (mode === 'overview') {
    return (
      <div data-testid="files-page" className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Files</h1>
          <p className="text-sm text-zinc-500 mt-1">Browse and manage files in ~/.openclaw</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {categories.map(cat => {
              const Icon = ICON_MAP[cat.icon] || FolderOpen;
              return (
                <button
                  key={cat.name}
                  data-testid={`category-${cat.name.toLowerCase()}`}
                  onClick={() => openCategory(cat)}
                  className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg p-5 text-left hover:border-orange-500/30 hover:bg-orange-500/[0.02] transition-all duration-200 group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-orange-500" />
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-700 group-hover:text-orange-500/50 transition-colors" />
                  </div>
                  <h3 className="text-sm font-semibold text-zinc-200 mb-0.5" style={{ fontFamily: 'Manrope, sans-serif' }}>{cat.name}</h3>
                  <p className="text-xs text-zinc-500 mb-3">{cat.description}</p>
                  <div className="flex items-center gap-3 text-[11px] text-zinc-600 font-mono">
                    <span>{cat.fileCount} files</span>
                    <span className="text-zinc-800">|</span>
                    <span>{formatSize(cat.totalSize)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ===== BROWSE MODE =====
  const fileName = selectedFile ? selectedFile.split('/').pop() : null;

  return (
    <div data-testid="files-page" className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button onClick={backToOverview} className="flex items-center gap-1.5 text-zinc-500 hover:text-orange-400 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Files</span>
        </button>
        <ChevronRight className="w-3 h-3 text-zinc-700" />
        <span className="text-zinc-300 font-medium">{selectedCategory?.name}</span>
        {selectedFile && (
          <>
            <ChevronRight className="w-3 h-3 text-zinc-700" />
            <span className="text-orange-400 font-mono text-xs">{fileName}</span>
          </>
        )}
      </div>

      {/* Split View */}
      <div className="flex gap-4" style={{ height: 'calc(100vh - 180px)' }}>
        {/* Left: Tree */}
        <div className="w-72 shrink-0 bg-[#0c0c0e] border border-zinc-800/60 rounded-lg overflow-hidden flex flex-col">
          <div className="px-3 py-2.5 border-b border-zinc-800/40 flex items-center gap-2">
            <Folder className="w-4 h-4 text-orange-500/70" />
            <span className="text-xs font-medium text-zinc-400 tracking-wide uppercase">{selectedCategory?.name}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {treeLoading && treeData.length === 0 ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
              </div>
            ) : treeData.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-600">Empty directory</div>
            ) : (
              treeData.map(entry => (
                <TreeNode
                  key={entry.name}
                  entry={entry}
                  basePath={selectedCategory.path}
                  onSelect={handleSelectFile}
                  selectedPath={selectedFile}
                  expandedDirs={expandedDirs}
                  onToggleDir={handleToggleDir}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: File Viewer */}
        <div className="flex-1 bg-[#0c0c0e] border border-zinc-800/60 rounded-lg overflow-hidden flex flex-col">
          {!selectedFile ? (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-600">
              <File className="w-12 h-12 mb-3 text-zinc-700" />
              <p className="text-sm">Select a file to view</p>
            </div>
          ) : fileLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
            </div>
          ) : fileContent?.type === 'binary' ? (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
              <HardDrive className="w-12 h-12 mb-3 text-zinc-700" />
              <p className="text-sm font-medium text-zinc-400">{fileName}</p>
              <p className="text-xs mt-1">Binary file — {formatSize(fileContent.size)}</p>
              <p className="text-xs text-zinc-600 mt-0.5">Modified: {new Date(fileContent.modified).toLocaleString()}</p>
            </div>
          ) : (
            <>
              {/* File header */}
              <div className="px-4 py-2.5 border-b border-zinc-800/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <File className="w-4 h-4 text-zinc-500" />
                  <span className="text-xs font-mono text-zinc-400">{fileName}</span>
                  <span className="text-[10px] text-zinc-600">{formatSize(fileContent.size)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {editing ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setEditing(false); setEditBuffer(fileContent.content); }}
                        className="text-zinc-500 hover:text-zinc-300 h-7 text-xs"
                      >
                        <X className="w-3 h-3 mr-1" /> Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-orange-600 hover:bg-orange-700 text-white h-7 text-xs"
                      >
                        {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                        Save
                      </Button>
                    </>
                  ) : (
                    canEdit && fileContent.editable && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(true)}
                        className="text-zinc-500 hover:text-orange-400 hover:bg-orange-500/10 h-7 text-xs"
                      >
                        <Pencil className="w-3 h-3 mr-1" /> Edit
                      </Button>
                    )
                  )}
                </div>
              </div>
              {/* File content */}
              <div className="flex-1 overflow-auto">
                {editing ? (
                  <textarea
                    data-testid="file-editor"
                    value={editBuffer}
                    onChange={e => setEditBuffer(e.target.value)}
                    className="w-full h-full bg-transparent text-zinc-300 font-mono text-sm p-4 resize-none outline-none"
                    spellCheck={false}
                  />
                ) : (
                  <pre className="text-sm text-zinc-300 font-mono p-4 whitespace-pre-wrap break-words">
                    {fileContent.content}
                  </pre>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/pages/FilesPage.js
git commit -m "feat(ui): add FilesPage with category grid and tree browser"
```

---

### Task 4: Frontend — Route and Sidebar Integration

**Files:**
- Modify: `frontend/src/App.js` (add import + route)
- Modify: `frontend/src/layout/Sidebar.js` (add nav item)

**Step 1: Add route to `frontend/src/App.js`**

Add import after line 24 (after HealthPage import):
```javascript
import FilesPage from "./pages/FilesPage";
```

Add route after the `/health` route (line 45):
```jsx
<Route path="/files" element={<FilesPage />} />
```

**Step 2: Add nav item to `frontend/src/layout/Sidebar.js`**

Add `FolderOpen` to the lucide imports on line 3 (it's already imported).

Add the Files nav item to the `navItems` array after the `Config` entry (after line 26):
```javascript
{ path: '/files', label: 'Files', icon: FolderOpen },
```

**Step 3: Verify frontend compiles**

Run: `cd /home/ubuntu/openclaw-manager/frontend && yarn build 2>&1 | tail -20`
Expected: Build succeeds with "Compiled successfully."

**Step 4: Commit**

```bash
git add frontend/src/App.js frontend/src/layout/Sidebar.js
git commit -m "feat(nav): add Files page route and sidebar navigation"
```

---

### Task 5: Manual Testing and Polish

**Step 1: Start backend and frontend**

Terminal 1: `cd /home/ubuntu/openclaw-manager/backend && source ../venv/bin/activate && python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload`
Terminal 2: `cd /home/ubuntu/openclaw-manager/frontend && yarn start`

**Step 2: Test checklist**

1. Navigate to `/files` — category grid shows with correct counts
2. Click "Agents" category — tree loads with agent directories
3. Expand a directory — children load lazily
4. Click a `.md` file — content displays in viewer
5. Click "Edit" — textarea appears with content
6. Modify and "Save" — toast shows success, content updates
7. Click breadcrumb "Files" — returns to overview
8. Click "Credentials" — files display with masked values
9. Try path traversal via API: `GET /api/files/tree?path=../../etc/` — should return 403

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: polish file manager based on manual testing"
```
