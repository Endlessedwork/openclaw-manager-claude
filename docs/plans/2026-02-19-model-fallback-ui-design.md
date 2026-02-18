# Model Fallback Management UI Design

**Date**: 2026-02-19
**Approach**: Config-based (read/write `openclaw.json` directly)

## Backend API

### GET /api/models/fallbacks
Returns current fallback config from `openclaw.json`.

```json
{
  "model": { "primary": "openai/gpt-5.1-codex", "fallbacks": ["anthropic/claude-sonnet-4-5-20250929", ...] },
  "imageModel": { "primary": "google/gemini-2.5-flash", "fallbacks": [...] },
  "agents": [
    { "id": "main", "model": "anthropic/claude-sonnet-4-5-20250929", "fallbacks": [] },
    ...
  ]
}
```

### PUT /api/models/fallbacks
Updates default text + image model fallback config. Writes to `agents.defaults.model` / `agents.defaults.imageModel`, then reloads gateway.

### PUT /api/models/fallbacks/agent/{agent_id}
Updates per-agent model + fallbacks. Writes to `agents.list[i]`, then reloads gateway.

All write endpoints require `admin` or `editor` role.

## Frontend UI

New section in ModelsPage between "Active Models" and "Config Providers" titled "Fallback Priority".

- 2 tabs: "Text Model" / "Image Model"
- Each tab: primary model dropdown + drag-and-drop ordered fallback list
- Per-agent section: collapsible accordion showing each agent's model override
- Drag & drop via `@dnd-kit/core` + `@dnd-kit/sortable`
- Save button triggers PUT, toast feedback, 2s delay re-fetch

## Data Flow

User reorders → local state → Save → PUT /api/models/fallbacks → write openclaw.json → gateway reload → toast → re-fetch
