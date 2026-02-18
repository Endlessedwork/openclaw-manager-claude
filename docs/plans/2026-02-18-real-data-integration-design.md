# Real Data Integration Design

## Goal
Replace all mock/seed/generated data in openclaw-manager with real data from the running OpenClaw gateway, using `openclaw` CLI commands with `--json` output.

## Architecture

```
Frontend (React SPA)
    |
    v
Backend (FastAPI on port 8001)
    |
    +---> GatewayCLI class (subprocess calls to `openclaw` CLI)
    |         |
    |         +---> openclaw agents list --json
    |         +---> openclaw sessions list --json
    |         +---> openclaw skills list --json
    |         +---> openclaw health --json
    |         +---> openclaw logs --follow (streaming)
    |
    +---> Config file (~/.openclaw/openclaw.json) direct read/write
    |
    +---> MongoDB (cache layer only, no primary data)
```

## Data Sources

| Data Type | CLI Command | Cache TTL | Notes |
|-----------|-------------|-----------|-------|
| Agents | `openclaw agents list --json` | 30s | 5 real agents |
| Skills | `openclaw skills list --json` | 60s | 108 skills (71 ready) |
| Channels | `openclaw health --json` | 30s | Telegram + LINE real |
| Sessions | `openclaw sessions list --json` | 15s | 54 real sessions |
| Config | Read `~/.openclaw/openclaw.json` | 5s | Direct file I/O |
| Models | Parse from `openclaw.json` providers | 30s | From config |
| Gateway Status | `openclaw health --json` | 10s | Real health check |
| Logs | `openclaw logs --follow` pipe | Real-time | Subprocess stream |
| Cron | Parse from `openclaw.json` cron section | 30s | From config |

## What Gets Removed

1. `POST /api/seed` - seed endpoint
2. `POST /api/activities/simulate` - fake activity generator
3. `POST /api/system-logs/generate` - fake log generator
4. `POST /api/clawhub/seed` - marketplace seed
5. `_generate_logs_batch()` - WebSocket fake log generation
6. `_generate_activities_batch()` - WebSocket fake activity generation
7. All hardcoded seed data arrays

## What Gets Added

### GatewayCLI Class
```python
class GatewayCLI:
    async def run(self, *args, json_output=True) -> dict:
        """Run openclaw CLI command and return parsed JSON"""
        cmd = ["openclaw"] + list(args)
        if json_output:
            cmd.append("--json")
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=PIPE, stderr=PIPE)
        stdout, stderr = await proc.communicate()
        return json.loads(stdout) if json_output else stdout.decode()

    async def agents(self): return await self.run("agents", "list")
    async def sessions(self): return await self.run("sessions", "list")
    async def skills(self): return await self.run("skills", "list")
    async def health(self): return await self.run("health")
    async def config_get(self): # read openclaw.json directly
    async def config_set(self, data): # write openclaw.json + reload
```

### Cache Layer
```python
class CLICache:
    def __init__(self):
        self._cache = {}

    async def get(self, key, fetcher, ttl_seconds):
        if key in self._cache:
            entry = self._cache[key]
            if time.time() - entry["ts"] < ttl_seconds:
                return entry["data"]
        data = await fetcher()
        self._cache[key] = {"data": data, "ts": time.time()}
        return data
```

### Real Log Streaming
```python
async def stream_real_logs():
    proc = await asyncio.create_subprocess_exec(
        "openclaw", "logs", "--follow",
        stdout=PIPE, stderr=PIPE)
    async for line in proc.stdout:
        parsed = parse_log_line(line.decode())
        yield parsed
```

## Config Editing Flow

1. User edits config in UI
2. Backend validates JSON
3. Backend writes to `~/.openclaw/openclaw.json`
4. Backend calls `openclaw gateway reload`
5. Backend returns success/error

## Frontend Changes

Minimal frontend changes needed:
- Dashboard: map real CLI JSON fields to existing UI components
- Activities page: may need field mapping for real activity format
- Logs page: parse real log format instead of generated format
- ClawHub: connect to real skill registry or keep as informational

## Endpoint Mapping (Current -> New)

| Endpoint | Current | New |
|----------|---------|-----|
| GET /api/dashboard | MongoDB aggregation | CLI health + sessions + agents combined |
| GET /api/agents | MongoDB find | `openclaw agents list --json` |
| GET /api/skills | MongoDB find | `openclaw skills list --json` |
| GET /api/channels | MongoDB find | `openclaw health --json` channels section |
| GET /api/sessions | MongoDB find | `openclaw sessions list --json` |
| GET /api/config | MongoDB find | Read `~/.openclaw/openclaw.json` |
| PUT /api/config | MongoDB update | Write file + `openclaw gateway reload` |
| GET /api/gateway/status | MongoDB find | `openclaw health --json` |
| POST /api/gateway/restart | Log activity | `openclaw gateway restart` |
| GET /api/models | MongoDB find | Parse from `openclaw.json` models section |
| GET /api/cron | MongoDB find | Parse from `openclaw.json` cron section |
| GET /api/tools | MongoDB find | Parse from config tools section |
| WS /api/ws/logs | Generate fake | Pipe from `openclaw logs --follow` |
| WS /api/ws/activities | Generate fake | Parse from real log stream |

## CRUD Operations

For entities managed via config file (agents, channels, models, cron, tools):
- **Create/Update/Delete**: Modify `openclaw.json` + trigger gateway reload
- **Read**: CLI command or parse config file

For runtime-only entities (sessions):
- **Read**: CLI command
- **Delete**: `openclaw sessions delete <key>` if supported

## Tech Stack
- Same: FastAPI, MongoDB (cache only), React frontend
- New: `asyncio.create_subprocess_exec` for CLI calls
- New: `aiofiles` for async config file I/O
