# Files Page Design — Category Dashboard + Inline Tree

**Date**: 2026-02-19
**Status**: Approved

## Goal

Add a Files page to OpenClaw Manager that lets users browse and edit files within `~/.openclaw/`. The page uses a hybrid approach: category cards overview on landing, with drill-down into a split-pane tree browser + file viewer/editor.

## Scope

- **Root**: `~/.openclaw/` directory only
- **Operations**: Read all files, edit text/markdown/config files
- **Roles**: Viewers read-only, editors/admins can edit

## UI Design

### Mode 1: Overview (Category Grid)

Cards grid showing smart categories auto-mapped from `~/.openclaw/` subdirectories:

| Category | Icon | Path | Description |
|----------|------|------|-------------|
| Agents | Bot | `agents/` | Agent workspaces & configs |
| Skills | Sparkles | `skills/` | Installed skill files |
| Config | Settings | `*.json`, `*.env` (root) | Config files |
| Media | Image | `media/` | Images, audio, uploads |
| Memory | Brain | `memory/` | Context & memory storage |
| Credentials | Key | `credentials/` | API keys (masked display) |
| Scripts | FileCode | `scripts/` | User scripts |
| Browser | Globe | `browser/` | Browser automation data |
| Canvas | Layout | `canvas/` | Canvas node data |
| Workspace | FolderOpen | `workspace/` | Default agent workspace |

Each card shows: icon, name, file count, total size.

### Mode 2: Browse (Split View)

When a category is selected:
- **Left panel**: Directory tree with expand/collapse, file/folder icons
- **Right panel**: File viewer/editor
  - Text files: syntax-highlighted view with edit button
  - Binary files: metadata display (size, type, modified date)
- **Top**: Breadcrumb navigation (Overview > Category > path...)
- **Back**: Click breadcrumb or back button to return to overview

## Backend API

All endpoints under `/api/files`, require authentication.

### `GET /api/files/categories`

Returns category list with aggregated stats.

```json
[
  { "name": "Agents", "icon": "bot", "path": "agents/", "fileCount": 12, "totalSize": 45000 }
]
```

### `GET /api/files/tree?path=<relative_path>`

Returns directory listing for a path within `~/.openclaw/`.

```json
{
  "path": "agents/",
  "entries": [
    { "name": "bot1", "type": "directory", "children_count": 5 },
    { "name": "config.json", "type": "file", "size": 1234, "modified": "2026-02-18T10:00:00Z" }
  ]
}
```

### `GET /api/files/content?path=<relative_path>`

Returns file content (text) or metadata (binary).

```json
{
  "path": "agents/bot1/SOUL.md",
  "type": "text",
  "content": "# Soul\n...",
  "size": 456,
  "modified": "2026-02-18T10:00:00Z",
  "editable": true
}
```

### `PUT /api/files/content?path=<relative_path>`

Save edited file content. Body: `{ "content": "new content..." }`
Requires editor/admin role.

## Security

- **Path traversal protection**: Resolve path and verify it stays within `~/.openclaw/`
- **Credentials masking**: Mask sensitive values when displaying credential files
- **Role enforcement**: Viewer = read-only, editor/admin = read + write
- **File type limits**: Only serve text files for content; binary files get metadata only
- **No delete/create**: Only browse and edit existing text files

## Frontend Components

```
FilesPage.js
├── FilesCategoryGrid
│   └── CategoryCard (icon, name, count, size)
├── FilesBrowser (shown when category selected)
│   ├── Breadcrumb
│   ├── FileTree (recursive, expand/collapse)
│   │   └── TreeNode (file/folder with icon)
│   └── FileViewer
│       ├── TextViewer (syntax highlighted)
│       ├── TextEditor (edit mode for md/json/txt)
│       └── FileInfo (binary metadata)
```

## Data Flow

1. Page load → `GET /api/files/categories` → render category cards
2. Click category → `GET /api/files/tree?path=agents/` → render tree
3. Expand folder → `GET /api/files/tree?path=agents/bot1/` → lazy load children
4. Click file → `GET /api/files/content?path=agents/bot1/SOUL.md` → show content
5. Edit & save → `PUT /api/files/content` → save, show success toast

## Route & Navigation

- Route: `/files`
- Sidebar: Add "Files" nav item with FolderOpen icon, between existing items
- Available to all authenticated roles
