# Models.json Dual-Write Sync — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When dashboard creates/updates/deletes a provider, sync changes to `models.json` (gateway catalog) in addition to `openclaw.json` (config).

**Architecture:** Add a `_sync_models_json()` helper in `server.py` that reads/writes `~/.openclaw/agents/main/agent/models.json`. Hook it into the 3 existing provider CRUD endpoints after `config_write`. No frontend changes.

**Tech Stack:** Python, JSON file I/O, FastAPI

---

### Task 1: Add `_sync_models_json` helper function

**Files:**
- Modify: `backend/server.py` (insert after `_save_api_key` function, around line 842)

**Step 1: Add the MODELS_JSON path constant**

Add near the top of the file where other path constants are, or near `PROVIDER_BASE_URLS` (line ~610):

```python
MODELS_JSON = Path.home() / ".openclaw" / "agents" / "main" / "agent" / "models.json"
```

**Step 2: Add the helper function**

Insert after `_save_api_key` (after line 842):

```python
def _sync_models_json(provider_id: str, provider_data: dict = None, *, delete: bool = False):
    """Sync a provider to models.json (gateway catalog).
    If delete=True, remove the provider. Otherwise upsert it."""
    try:
        data = json.loads(MODELS_JSON.read_text()) if MODELS_JSON.exists() else {"providers": {}}
    except (json.JSONDecodeError, OSError):
        data = {"providers": {}}
    if "providers" not in data:
        data["providers"] = {}

    if delete:
        data["providers"].pop(provider_id, None)
    else:
        if not provider_data:
            return
        api_type = provider_data.get("api", "openai-completions")
        api_key = _resolve_api_key(provider_id)
        models = []
        for m in provider_data.get("models", []):
            entry = dict(m)
            if "api" not in entry:
                entry["api"] = api_type
            models.append(entry)
        catalog_entry = {
            "baseUrl": provider_data.get("baseUrl", ""),
            "api": api_type,
            "models": models,
        }
        if api_key:
            catalog_entry["apiKey"] = api_key
        data["providers"][provider_id] = catalog_entry

    MODELS_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False))
```

**Step 3: Verify no syntax errors**

Run: `cd backend && python -c "import server"`
Expected: no errors

**Step 4: Commit**

```bash
git add backend/server.py
git commit -m "feat: add _sync_models_json helper for dual-write to gateway catalog"
```

---

### Task 2: Hook sync into create_provider endpoint

**Files:**
- Modify: `backend/server.py:565-571` (create_provider function)

**Step 1: Add sync call after config_write in create_provider**

After the `_save_api_key` call (line 568) and before `gateway.cache.invalidate`, add:

```python
    _sync_models_json(pid, config["models"]["providers"][pid])
```

The block should look like:

```python
    await gateway.config_write(config)
    if body.get("api_key", "").strip():
        _save_api_key(pid, body["api_key"].strip())
    _sync_models_json(pid, config["models"]["providers"][pid])
    gateway.cache.invalidate("models")
```

**Step 2: Verify no syntax errors**

Run: `cd backend && python -c "import server"`

**Step 3: Commit**

```bash
git add backend/server.py
git commit -m "feat: sync models.json on provider create"
```

---

### Task 3: Hook sync into update_provider endpoint

**Files:**
- Modify: `backend/server.py:588-594` (update_provider function)

**Step 1: Add sync call after config_write in update_provider**

After the `_save_api_key` call (line 591) and before `gateway.cache.invalidate`, add:

```python
    _sync_models_json(provider_id, providers[provider_id])
```

The block should look like:

```python
    await gateway.config_write(config)
    if body.get("api_key", "").strip():
        _save_api_key(provider_id, body["api_key"].strip())
    _sync_models_json(provider_id, providers[provider_id])
    gateway.cache.invalidate("models")
```

**Step 2: Verify no syntax errors**

Run: `cd backend && python -c "import server"`

**Step 3: Commit**

```bash
git add backend/server.py
git commit -m "feat: sync models.json on provider update"
```

---

### Task 4: Hook sync into delete_provider endpoint

**Files:**
- Modify: `backend/server.py:597-607` (delete_provider function)

**Step 1: Add sync call after config_write in delete_provider**

After `config_write` (line 604) and before `gateway.cache.invalidate`, add:

```python
    _sync_models_json(provider_id, delete=True)
```

The block should look like:

```python
    del providers[provider_id]
    await gateway.config_write(config)
    _sync_models_json(provider_id, delete=True)
    gateway.cache.invalidate("models")
```

**Step 2: Verify no syntax errors**

Run: `cd backend && python -c "import server"`

**Step 3: Commit**

```bash
git add backend/server.py
git commit -m "feat: sync models.json on provider delete"
```

---

### Task 5: Manual integration test

**Step 1: Verify current state**

```bash
python3 -c "
import json
with open('$HOME/.openclaw/agents/main/agent/models.json') as f:
    d = json.load(f)
print('Before:', list(d['providers'].keys()))
"
```

Expected: `['moonshot', 'zai', 'openai']`

**Step 2: Test via running server**

Start the backend server and use the dashboard to update an existing provider (e.g. edit moonshot, save). Then verify models.json was updated.

**Step 3: Verify models.json was synced**

```bash
python3 -c "
import json
with open('$HOME/.openclaw/agents/main/agent/models.json') as f:
    d = json.load(f)
print('After:', list(d['providers'].keys()))
for name, p in d['providers'].items():
    print(f'  {name}: {len(p.get(\"models\",[]))} models, has apiKey: {bool(p.get(\"apiKey\"))}')
"
```

**Step 4: Commit final state**

```bash
git add -A
git commit -m "test: verify models.json dual-write sync works"
```
