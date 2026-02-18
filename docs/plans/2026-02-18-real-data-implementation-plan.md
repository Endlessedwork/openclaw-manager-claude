# Real Data Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all mock/seed/generated data in openclaw-manager backend with real data from the running OpenClaw gateway via CLI commands.

**Architecture:** Backend calls `openclaw` CLI with `--json` flag for structured data. An in-memory cache reduces subprocess calls. WebSocket logs pipe from `openclaw logs --follow --json`. Config edits write to `~/.openclaw/openclaw.json` and trigger gateway reload.

**Tech Stack:** FastAPI, asyncio subprocess, openclaw CLI, MongoDB (cache only), aiofiles

---

### Task 1: Create GatewayCLI and CLICache classes

**Files:**
- Create: `backend/gateway_cli.py`

**Step 1: Write the GatewayCLI class**

```python
import asyncio
import json
import time
import os
from pathlib import Path

OPENCLAW_CONFIG = Path.home() / ".openclaw" / "openclaw.json"

class CLICache:
    def __init__(self):
        self._cache = {}

    async def get(self, key: str, fetcher, ttl_seconds: float):
        if key in self._cache:
            entry = self._cache[key]
            if time.time() - entry["ts"] < ttl_seconds:
                return entry["data"]
        data = await fetcher()
        self._cache[key] = {"data": data, "ts": time.time()}
        return data

    def invalidate(self, key: str = None):
        if key:
            self._cache.pop(key, None)
        else:
            self._cache.clear()


class GatewayCLI:
    def __init__(self):
        self.cache = CLICache()

    async def _run(self, *args, json_output=True, timeout=30) -> dict | str:
        cmd = ["openclaw"] + list(args)
        if json_output:
            cmd.append("--json")
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ, "NO_COLOR": "1"}
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            raise RuntimeError(f"CLI timeout: {' '.join(cmd)}")
        if proc.returncode != 0:
            raise RuntimeError(f"CLI error ({proc.returncode}): {stderr.decode()[:500]}")
        raw = stdout.decode()
        if json_output:
            return json.loads(raw)
        return raw

    async def agents(self):
        return await self.cache.get("agents", lambda: self._run("agents", "list"), 30)

    async def sessions(self):
        return await self.cache.get("sessions", lambda: self._run("sessions", "list"), 15)

    async def skills(self):
        return await self.cache.get("skills", lambda: self._run("skills", "list"), 60)

    async def health(self):
        return await self.cache.get("health", lambda: self._run("health"), 10)

    async def cron_jobs(self):
        return await self.cache.get("cron", lambda: self._run("cron", "list"), 30)

    async def config_read(self):
        async def _read():
            import aiofiles
            async with aiofiles.open(OPENCLAW_CONFIG, 'r') as f:
                content = await f.read()
            return json.loads(content)
        return await self.cache.get("config", _read, 5)

    async def config_write(self, data: dict):
        import aiofiles
        async with aiofiles.open(OPENCLAW_CONFIG, 'w') as f:
            await f.write(json.dumps(data, indent=2, ensure_ascii=False))
        self.cache.invalidate("config")
        await self._run("gateway", "reload", json_output=False, timeout=10)

    async def gateway_restart(self):
        self.cache.invalidate()
        return await self._run("gateway", "restart", json_output=False, timeout=15)

    async def logs_stream(self):
        proc = await asyncio.create_subprocess_exec(
            "openclaw", "logs", "--follow", "--json",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ, "NO_COLOR": "1"}
        )
        return proc

gateway = GatewayCLI()
```

**Step 2: Install aiofiles dependency**

Run: `cd /home/ubuntu/openclaw-manager && source venv/bin/activate && pip install aiofiles`

**Step 3: Commit**

```bash
git add backend/gateway_cli.py
git commit -m "feat: add GatewayCLI and CLICache for real data"
```

---

### Task 2: Rewrite backend API endpoints - Agents, Skills, Dashboard

**Files:**
- Modify: `backend/server.py`

**Step 1: Replace imports and remove seed-related code**

At the top of `server.py`, add the gateway import and remove MongoDB seed functions. Keep the FastAPI app, router, and MongoDB connection (for activity logging).

Replace ALL existing route handlers for `/agents`, `/skills`, and `/dashboard` with versions that call `gateway.agents()`, `gateway.skills()`, and combine `gateway.health()` + `gateway.agents()` + `gateway.sessions()`.

**Key mapping for agents (CLI → API response):**
```python
@api_router.get("/agents")
async def list_agents():
    raw = await gateway.agents()
    return [
        {
            "id": a.get("id"),
            "name": a.get("id"),
            "description": a.get("identityName", a.get("name", "")),
            "workspace": a.get("workspace", ""),
            "model_primary": a.get("model", ""),
            "tools_profile": "full",
            "status": "active" if a.get("isDefault") else "active",
            "sandbox_mode": "off",
            "identity_emoji": a.get("identityEmoji", ""),
        }
        for a in raw
    ]
```

**Key mapping for skills (CLI → API response):**
```python
@api_router.get("/skills")
async def list_skills():
    raw = await gateway.skills()
    return [
        {
            "id": s["name"],
            "name": s["name"],
            "description": s.get("description", ""),
            "enabled": s.get("eligible", False) and not s.get("disabled", False),
            "location": s.get("source", "unknown"),
            "env_keys": s.get("missing", {}).get("env", []),
            "emoji": s.get("emoji", ""),
        }
        for s in raw.get("skills", [])
    ]
```

**Key mapping for dashboard:**
```python
@api_router.get("/dashboard")
async def get_dashboard():
    health = await gateway.health()
    agents = await gateway.agents()
    sessions = await gateway.sessions()
    skills = await gateway.skills()
    cron = await gateway.cron_jobs()
    skill_list = skills.get("skills", [])
    active_skills = [s for s in skill_list if s.get("eligible") and not s.get("disabled")]
    channel_list = health.get("channels", {})
    active_channels = [k for k, v in channel_list.items() if v.get("configured")]
    return {
        "agents": len(agents),
        "skills": {"total": len(skill_list), "active": len(active_skills)},
        "channels": {"total": len(channel_list), "active": len(active_channels)},
        "sessions": sessions.get("count", 0),
        "cron_jobs": len(cron.get("jobs", [])),
        "model_providers": len((await gateway.config_read()).get("models", {}).get("providers", {})),
        "gateway_status": "running" if health.get("ok") else "offline",
        "recent_activity": [],
    }
```

**Step 2: Remove agent/skill CRUD (create/update/delete)**

Since agents and skills are managed via config file and CLI, remove the POST/PUT/DELETE endpoints for agents and skills. Keep only GET endpoints.

**Step 3: Commit**

```bash
git add backend/server.py
git commit -m "feat: agents, skills, dashboard from real gateway CLI"
```

---

### Task 3: Rewrite Channels, Models, Gateway Status, Sessions

**Files:**
- Modify: `backend/server.py`

**Step 1: Rewrite channels endpoint**

```python
@api_router.get("/channels")
async def list_channels():
    health = await gateway.health()
    channels = health.get("channels", {})
    result = []
    for ch_type, ch_data in channels.items():
        probe = ch_data.get("probe", {})
        bot = probe.get("bot", {})
        result.append({
            "id": ch_type,
            "channel_type": ch_type,
            "display_name": ch_type.title(),
            "enabled": ch_data.get("configured", False),
            "status": "connected" if probe.get("ok") else "off",
            "dm_policy": "pairing",
            "group_policy": "mention",
            "bot_username": bot.get("username") or bot.get("displayName", ""),
        })
    return result
```

**Step 2: Rewrite models endpoint**

```python
@api_router.get("/models")
async def list_models():
    config = await gateway.config_read()
    providers = config.get("models", {}).get("providers", {})
    result = []
    for name, prov in providers.items():
        models = prov.get("models", [])
        result.append({
            "id": name,
            "name": name.title(),
            "provider_id": name,
            "enabled": True,
            "is_primary": False,
            "api_base": prov.get("baseUrl", ""),
            "models": [
                {"id": m.get("id", ""), "alias": m.get("name", "")}
                for m in models
            ],
        })
    return result
```

**Step 3: Rewrite gateway status and sessions**

```python
@api_router.get("/gateway/status")
async def get_gateway_status():
    health = await gateway.health()
    config = await gateway.config_read()
    gw = config.get("gateway", {})
    return {
        "status": "running" if health.get("ok") else "offline",
        "port": gw.get("port", 18789),
        "bind_host": gw.get("bind", "loopback"),
        "reload_mode": gw.get("mode", "local"),
        "uptime_ms": health.get("durationMs", 0),
    }

@api_router.get("/sessions")
async def list_sessions():
    raw = await gateway.sessions()
    return [
        {
            "id": s.get("sessionId", s.get("key")),
            "session_key": s["key"],
            "kind": s.get("kind", "direct"),
            "agent": s["key"].split(":")[1] if ":" in s["key"] else "main",
            "channel": s["key"].split(":")[2] if s["key"].count(":") >= 2 else "",
            "model": s.get("model", ""),
            "total_tokens": s.get("totalTokens", 0),
            "context_tokens": s.get("contextTokens", 0),
            "updated_at": s.get("updatedAt"),
            "age_ms": s.get("ageMs", 0),
            "message_count": (s.get("inputTokens", 0) + s.get("outputTokens", 0)) // 100,
        }
        for s in raw.get("sessions", [])
    ]
```

**Step 4: Commit**

```bash
git add backend/server.py
git commit -m "feat: channels, models, gateway, sessions from real data"
```

---

### Task 4: Rewrite Config, Cron, Tools, Hooks endpoints

**Files:**
- Modify: `backend/server.py`

**Step 1: Rewrite config endpoints**

```python
@api_router.get("/config")
async def get_config():
    config = await gateway.config_read()
    gw = config.get("gateway", {})
    return {
        "port": gw.get("port", 18789),
        "bind_host": gw.get("bind", "loopback"),
        "reload_mode": gw.get("mode", "local"),
        "tls": False,
        "raw": json.dumps(config, indent=2, ensure_ascii=False),
    }

@api_router.put("/config")
async def update_config(body: dict):
    try:
        new_config = json.loads(body.get("raw", "{}"))
        await gateway.config_write(new_config)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(400, str(e))

@api_router.post("/config/validate")
async def validate_config(body: dict):
    try:
        json.loads(body.get("raw", "{}"))
        return {"valid": True, "errors": [], "warnings": []}
    except json.JSONDecodeError as e:
        return {"valid": False, "errors": [str(e)], "warnings": []}
```

**Step 2: Rewrite cron endpoint**

```python
@api_router.get("/cron")
async def list_cron():
    raw = await gateway.cron_jobs()
    return [
        {
            "id": j["id"],
            "name": j.get("name", ""),
            "schedule": j.get("schedule", {}).get("expr", ""),
            "timezone": j.get("schedule", {}).get("tz", "UTC"),
            "agent_id": j.get("agentId", "main"),
            "enabled": j.get("enabled", False),
            "message": j.get("payload", {}).get("message", ""),
            "timeout_seconds": j.get("payload", {}).get("timeoutSeconds", 300),
            "status": j.get("state", {}).get("lastStatus", "idle"),
            "last_run_at": j.get("state", {}).get("lastRunAtMs"),
            "next_run_at": j.get("state", {}).get("nextRunAtMs"),
            "run_count": 0,
        }
        for j in raw.get("jobs", [])
    ]
```

**Step 3: Rewrite tools endpoint**

```python
@api_router.get("/tools")
async def list_tools():
    config = await gateway.config_read()
    tools_config = config.get("tools", {})
    sandbox = tools_config.get("sandbox", {}).get("tools", {})
    allowed = sandbox.get("allow", [])
    builtin = [
        {"name": "exec", "category": "runtime", "description": "Run shell commands"},
        {"name": "process", "category": "runtime", "description": "Manage background processes"},
        {"name": "browser", "category": "ui", "description": "Control the browser"},
        {"name": "canvas", "category": "ui", "description": "Drive the node Canvas"},
        {"name": "web_search", "category": "web", "description": "Search the web"},
        {"name": "web_fetch", "category": "web", "description": "Fetch URL content"},
        {"name": "message", "category": "messaging", "description": "Send messages"},
        {"name": "cron", "category": "automation", "description": "Manage cron jobs"},
        {"name": "gateway", "category": "automation", "description": "Gateway control"},
        {"name": "image", "category": "core", "description": "Analyze images"},
        {"name": "nodes", "category": "nodes", "description": "Discover paired nodes"},
        {"name": "apply_patch", "category": "fs", "description": "Apply file patches"},
        {"name": "sessions_list", "category": "sessions", "description": "List sessions"},
        {"name": "sessions_history", "category": "sessions", "description": "Inspect transcripts"},
        {"name": "sessions_send", "category": "sessions", "description": "Send to session"},
        {"name": "sessions_spawn", "category": "sessions", "description": "Spawn sub-agent"},
    ]
    return [
        {
            "id": t["name"],
            "name": t["name"],
            "category": t["category"],
            "description": t["description"],
            "enabled": True if not allowed else t["name"] in allowed,
        }
        for t in builtin
    ]
```

**Step 4: Rewrite hooks endpoints (read from config)**

```python
@api_router.get("/hooks/config")
async def get_hooks_config():
    config = await gateway.config_read()
    hooks = config.get("hooks", {})
    gw = config.get("gateway", {})
    return {
        "enabled": hooks.get("enabled", False),
        "path": "/hooks",
        "token": gw.get("auth", {}).get("token", "")[:6] + "...",
        "presets": list(hooks.get("presets", {}).keys()),
    }

@api_router.get("/hooks/mappings")
async def get_hook_mappings():
    config = await gateway.config_read()
    mappings = config.get("hooks", {}).get("mappings", [])
    return [
        {
            "id": str(i),
            "name": m.get("name", f"hook-{i}"),
            "path": m.get("path", ""),
            "mode": m.get("mode", "agent"),
            "agent_id": m.get("agentId", "main"),
            "enabled": m.get("enabled", True),
            "wake_mode": m.get("wakeMode", "now"),
            "message_template": m.get("messageTemplate", ""),
        }
        for i, m in enumerate(mappings)
    ]
```

**Step 5: Commit**

```bash
git add backend/server.py
git commit -m "feat: config, cron, tools, hooks from real data"
```

---

### Task 5: Rewrite WebSocket handlers for real log streaming

**Files:**
- Modify: `backend/server.py`

**Step 1: Replace WebSocket logs handler**

```python
@app.websocket("/api/ws/logs")
async def ws_logs(websocket: WebSocket):
    await websocket.accept()
    proc = None
    try:
        proc = await gateway.logs_stream()
        await websocket.send_json({"type": "init", "data": []})
        buffer = []
        async def read_logs():
            async for line in proc.stdout:
                text = line.decode().strip()
                if not text:
                    continue
                try:
                    entry = json.loads(text)
                    if entry.get("type") == "log":
                        log = {
                            "id": str(uuid.uuid4()),
                            "timestamp": entry.get("time", ""),
                            "level": entry.get("level", "info").upper(),
                            "source": entry.get("subsystem", ""),
                            "message": entry.get("message", ""),
                            "raw": text,
                        }
                        buffer.append(log)
                except json.JSONDecodeError:
                    buffer.append({
                        "id": str(uuid.uuid4()),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "level": "INFO",
                        "source": "gateway",
                        "message": text,
                        "raw": text,
                    })

        log_task = asyncio.create_task(read_logs())
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=2.0)
                if msg == "ping":
                    await websocket.send_json({"type": "pong"})
            except asyncio.TimeoutError:
                pass
            if buffer:
                batch = buffer.copy()
                buffer.clear()
                await websocket.send_json({"type": "logs", "data": batch})
    except WebSocketDisconnect:
        pass
    finally:
        if proc:
            proc.kill()
```

**Step 2: Replace WebSocket activities handler**

Activities will be derived from the same log stream by filtering tool_call and agent events:

```python
@app.websocket("/api/ws/activities")
async def ws_activities(websocket: WebSocket):
    await websocket.accept()
    proc = None
    try:
        proc = await gateway.logs_stream()
        await websocket.send_json({"type": "init", "data": []})
        buffer = []
        async def read_activities():
            async for line in proc.stdout:
                text = line.decode().strip()
                if not text:
                    continue
                try:
                    entry = json.loads(text)
                    if entry.get("type") != "log":
                        continue
                    msg = entry.get("message", "")
                    sub = entry.get("subsystem", "")
                    if any(k in msg.lower() for k in ["tool", "llm", "message", "session", "heartbeat"]):
                        activity = {
                            "id": str(uuid.uuid4()),
                            "agent_name": sub.split("/")[-1] if "/" in sub else "main",
                            "event_type": "tool_call" if "tool" in msg.lower() else "llm_request" if "llm" in msg.lower() else "message_received",
                            "tool_name": "",
                            "status": "completed",
                            "duration_ms": 0,
                            "channel": "",
                            "timestamp": entry.get("time", ""),
                            "message": msg,
                        }
                        buffer.append(activity)
                except json.JSONDecodeError:
                    pass

        act_task = asyncio.create_task(read_activities())
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=3.0)
                if msg == "ping":
                    await websocket.send_json({"type": "pong"})
            except asyncio.TimeoutError:
                pass
            if buffer:
                batch = buffer.copy()
                buffer.clear()
                await websocket.send_json({"type": "activities", "data": batch})
    except WebSocketDisconnect:
        pass
    finally:
        if proc:
            proc.kill()
```

**Step 3: Commit**

```bash
git add backend/server.py
git commit -m "feat: real WebSocket log and activity streaming"
```

---

### Task 6: Remove all mock/seed code and unused endpoints

**Files:**
- Modify: `backend/server.py`

**Step 1: Remove these functions and endpoints:**

- `seed_data()` and `POST /seed`
- `seed_clawhub()` and `POST /clawhub/seed`
- `simulate_activities()` and `POST /activities/simulate`
- `generate_system_logs()` and `POST /system-logs/generate`
- `_generate_logs_batch()`
- `_generate_activities_batch()`
- `WebSocketManager` class (replaced by subprocess streaming)
- All Pydantic models for seed data (AgentBase, SkillBase, etc.) that are no longer used
- Remove unused MongoDB collection operations
- Remove the `POST /agents`, `PUT /agents/{id}`, `DELETE /agents/{id}` (managed via config)
- Remove the `POST /skills`, `PUT /skills/{id}`, `DELETE /skills/{id}` (managed via CLI)

**Step 2: Keep these MongoDB uses:**

- Activity logging (`db.activity_logs`) for tracking UI actions (optional)
- ClawHub data if marketplace browsing is desired (or remove entirely)

**Step 3: Clean up imports**

Remove unused imports: `random`, `timedelta` (if unused), unused Pydantic models.

**Step 4: Commit**

```bash
git add backend/server.py
git commit -m "refactor: remove all mock/seed/generate code"
```

---

### Task 7: Update frontend to handle new data shapes

**Files:**
- Modify: `frontend/src/pages/SessionsPage.js`
- Modify: `frontend/src/pages/ActivitiesPage.js`
- Modify: `frontend/src/pages/LogsPage.js`
- Modify: `frontend/src/lib/api.js`

**Step 1: Update SessionsPage field mappings**

Sessions now have `session_key`, `kind`, `age_ms`, `total_tokens`, `context_tokens` instead of `message_count`. Update display to show token usage and age.

**Step 2: Remove simulate/seed/generate API calls from api.js**

Remove: `simulateActivities()`, `clearActivities()`, `generateSystemLogs()`, `clearSystemLogs()`, `seedClawHub()`

**Step 3: Update ActivitiesPage**

Remove "Simulate" and "Clear" buttons since data is now real. Keep the Live toggle and filters.

**Step 4: Rebuild frontend**

Run: `cd /home/ubuntu/openclaw-manager/frontend && REACT_APP_BACKEND_URL="" npm run build`

**Step 5: Redeploy to nginx**

Run: `docker exec repo-frontend-1 rm -rf /usr/share/nginx/openclaw-manager && docker cp /home/ubuntu/openclaw-manager/frontend/build repo-frontend-1:/usr/share/nginx/openclaw-manager && docker exec repo-frontend-1 nginx -s reload`

**Step 6: Commit**

```bash
git add frontend/src/
git commit -m "feat: update frontend for real data shapes"
```

---

### Task 8: Restart backend and end-to-end test

**Step 1: Restart the backend service**

Run: `sudo systemctl restart openclaw-manager`

**Step 2: Test all API endpoints return real data**

```bash
curl -s http://localhost:8001/api/dashboard | python3 -m json.tool
curl -s http://localhost:8001/api/agents | python3 -m json.tool
curl -s http://localhost:8001/api/skills | python3 -m json.tool | head -30
curl -s http://localhost:8001/api/channels | python3 -m json.tool
curl -s http://localhost:8001/api/sessions | python3 -m json.tool | head -30
curl -s http://localhost:8001/api/models | python3 -m json.tool
curl -s http://localhost:8001/api/config | python3 -m json.tool
curl -s http://localhost:8001/api/gateway/status | python3 -m json.tool
curl -s http://localhost:8001/api/cron | python3 -m json.tool
curl -s http://localhost:8001/api/tools | python3 -m json.tool
curl -s http://localhost:8001/api/hooks/config | python3 -m json.tool
```

**Step 3: Test in browser**

Navigate to `https://control.winecore.work/?nocache=1` and verify:
- Dashboard shows real counts (5 agents, 108 skills, 2 channels, 54 sessions)
- Agents page shows main, coder, reviewer, ops, elon
- Skills page shows 108 real skills
- Channels shows Telegram + LINE
- Sessions shows 54 real sessions with token usage
- Logs shows real gateway log stream
- Config shows real openclaw.json content

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete real data integration - all mock data removed"
```
