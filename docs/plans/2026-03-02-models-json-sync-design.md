# Models.json Dual-Write Sync

## Problem

OpenClaw has two separate model registries:
- `~/.openclaw/openclaw.json` — config file the dashboard writes to
- `~/.openclaw/agents/main/agent/models.json` — catalog the gateway actually reads

The gateway only loads models from `models.json` into its catalog. When the dashboard saves providers/models to `openclaw.json`, the gateway doesn't see them.

## Solution

Dual-write: every provider CRUD operation writes to both files.

## Implementation

### New helper: `_sync_provider_to_models_json(provider_id, provider_data=None, delete=False)`

Location: `backend/server.py`

1. Read `models.json` from `~/.openclaw/agents/main/agent/models.json`
2. If `delete=True`: remove provider from `models.json`
3. Else: upsert provider with adapted format:
   - Copy `baseUrl`, `api` from provider config
   - Copy `apiKey` from resolved API key (env/config)
   - For each model: copy all fields + add `api` from provider level
4. Write back to `models.json`

### Format adaptation (openclaw.json → models.json)

```
openclaw.json provider:          models.json provider:
{                                {
  "baseUrl": "...",                "baseUrl": "...",
  "api": "openai-completions",    "api": "openai-completions",
  "models": [{                    "apiKey": "...",        ← added
    "id": "...",                   "models": [{
    "name": "...",                   "id": "...",
    "contextWindow": ...             "name": "...",
  }]                                 "contextWindow": ...,
}                                    "api": "openai-completions" ← added
                                   }]
                                 }
```

### Hook into existing endpoints

- `POST /models/providers` → call `_sync_provider_to_models_json(pid, provider_data)` after `config_write`
- `PUT /models/providers/{id}` → call `_sync_provider_to_models_json(pid, provider_data)` after `config_write`
- `DELETE /models/providers/{id}` → call `_sync_provider_to_models_json(pid, delete=True)` after `config_write`

### No frontend changes

Backend handles sync transparently. Existing restart-needed banner still applies.

## Decisions

- **Reload**: keep existing restart-needed banner (no auto-reload)
- **Delete**: remove from both files
- **Scope**: only sync providers managed by dashboard; built-in providers untouched
