# Skills Page Revamp — Design

**Date**: 2026-03-03
**Status**: Approved

## Goal

Revamp the Skills page to support enable/disable toggles, tabbed filtering (Active/Inactive/All), source filtering, and clear display of missing requirements. Hide the non-functional ClawHub page from the sidebar.

## Decisions

- **Enable/disable mechanism**: Per-skill toggle via `openclaw.json` → `skills.entries.<name>.enabled`
- **Ineligible skills display**: Separate tab (Active / Inactive / All)
- **ClawHub page**: Hide from sidebar (keep code, don't delete)

## API Changes

### Modified: `GET /api/skills`

Add fields to the response:

```json
{
  "id": "github",
  "name": "github",
  "description": "...",
  "emoji": "",
  "enabled": true,
  "eligible": true,
  "disabled": false,
  "source": "bundled",
  "missing": { "bins": [], "env": [], "os": [] }
}
```

- `enabled` = `eligible && !disabled` (existing, unchanged)
- `eligible` = has all requirements (NEW)
- `disabled` = explicitly disabled in config (NEW)
- `source` = normalized: "bundled" / "managed" / "workspace" / "unknown"
- `missing` = object with bins/env/os arrays (NEW, replaces `env_keys`)

### New: `POST /api/skills/{skill_name}/toggle`

- Auth: superadmin/admin only
- Body: `{ "enabled": true | false }`
- Reads `~/.openclaw/openclaw.json`
- Adds/updates `skills.entries.<name>.enabled`
- When re-enabling: removes the entry (clean config — only disabled skills stored)
- Writes config back
- Runs `openclaw gateway reload`
- Invalidates CLI cache ("skills" key)
- Returns updated skill list
- Errors: 404 if skill not found, 500 if config read/write fails

### Config format

```json
{
  "skills": {
    "entries": {
      "github": { "enabled": false }
    }
  }
}
```

Only disabled skills have entries. Re-enabling removes the entry.

## Frontend Changes

### Skills Page (`SkillsPage.js`)

**Tab bar** (under header):
- Active (count) — `eligible && !disabled`
- Inactive (count) — `!eligible || disabled`
- All (count)

**Filter row**:
- Search input (existing)
- Source dropdown: All Sources / Bundled / Managed / Workspace

**Skill row** (enhanced from current list):
```
[emoji] skill-name  [BUNDLED] [ACTIVE]     [toggle switch]
        description text...
        Missing: op CLI, macOS only          ← only for inactive
```

- Toggle switch: visible to admin/superadmin only
- Disabled state: if skill not eligible (missing requirements), toggle is disabled with tooltip
- Missing requirements shown as small yellow text under description

**States**:
- Optimistic update on toggle
- Toast on success/error
- Loading spinner (existing)

### Sidebar (`Sidebar.js`)

- Comment out ClawHub menu item (keep code for later)

## Out of Scope

- ClawHub page redesign (deferred)
- Card grid layout (possible future enhancement)
- Allowlist-based bundled skill management
- Skill installation from ClawHub registry
