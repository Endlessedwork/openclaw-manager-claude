from fastapi import FastAPI, APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import logging
import asyncio
from pathlib import Path
import uuid
from datetime import datetime, timezone
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
import ssl

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from gateway_cli import gateway
from auth import get_current_user, require_role
from routes.auth_routes import auth_router
from routes.user_routes import user_router
from routes.file_routes import file_router

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()


@app.on_event("startup")
async def set_db():
    app.state.db = db
    async def _warmup():
        await gateway.warmup()
        # Pre-build dashboard after CLI cache is warm
        try:
            await _build_dashboard()
        except Exception:
            pass
    asyncio.create_task(_warmup())

api_router = APIRouter(prefix="/api")
api_router.include_router(auth_router)
api_router.include_router(user_router)
api_router.include_router(file_router)


# ===== HELPER =====
async def log_activity(action: str, entity_type: str, entity_id: str = "", details: str = ""):
    log = {
        "id": str(uuid.uuid4()),
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "details": details,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await db.activity_logs.insert_one(log)


# ===== DASHBOARD =====
async def _build_dashboard():
    """Build dashboard data from CLI calls."""
    results = await asyncio.gather(
        gateway.health(),
        gateway.skills(),
        gateway.cron_jobs(),
        gateway.config_read(),
        return_exceptions=True,
    )
    health = results[0] if not isinstance(results[0], Exception) else {}
    skills = results[1] if not isinstance(results[1], Exception) else {}
    cron = results[2] if not isinstance(results[2], Exception) else {}
    config = results[3] if not isinstance(results[3], Exception) else {}
    skill_list = skills.get("skills", [])
    active_skills = [s for s in skill_list if s.get("eligible") and not s.get("disabled")]
    channel_list = health.get("channels", {})
    active_channels = [k for k, v in channel_list.items() if v.get("configured")]
    session_data = health.get("sessions", {})
    return {
        "agents": len(health.get("agents", [])),
        "skills": {"total": len(skill_list), "active": len(active_skills)},
        "channels": {"total": len(channel_list), "active": len(active_channels)},
        "sessions": session_data.get("count", 0) if isinstance(session_data, dict) else 0,
        "cron_jobs": len(cron.get("jobs", [])),
        "model_providers": len(config.get("models", {}).get("providers", {})),
        "gateway_status": "running" if health.get("ok") else "offline",
        "recent_activity": [],
    }


@api_router.get("/dashboard")
async def get_dashboard(user=Depends(get_current_user)):
    return await gateway.cache.get("dashboard", _build_dashboard, 30, stale_ok=True)


# ===== AGENTS (read-only from CLI) =====
@api_router.get("/agents")
async def list_agents(user=Depends(get_current_user)):
    raw = await gateway.agents()
    return [
        {
            "id": a.get("id"),
            "name": a.get("id"),
            "description": a.get("identityName", a.get("name", "")),
            "workspace": a.get("workspace", ""),
            "model_primary": a.get("model", ""),
            "tools_profile": "full",
            "status": "active",
            "sandbox_mode": "off",
            "identity_emoji": a.get("identityEmoji", ""),
        }
        for a in raw
    ]


@api_router.get("/agents/{agent_id}")
async def get_agent(agent_id: str, user=Depends(get_current_user)):
    raw = await gateway.agents()
    for a in raw:
        if a.get("id") == agent_id:
            workspace = a.get("workspace", "")
            md_files = {}
            if workspace:
                wp = Path(workspace)
                for fname in ("SOUL.md", "AGENTS.md", "IDENTITY.md"):
                    fpath = wp / fname
                    if fpath.is_file():
                        try:
                            md_files[fname] = fpath.read_text(encoding="utf-8")
                        except Exception:
                            md_files[fname] = ""
            return {
                "id": a.get("id"),
                "name": a.get("id"),
                "description": a.get("identityName", a.get("name", "")),
                "workspace": workspace,
                "model_primary": a.get("model", ""),
                "tools_profile": "full",
                "status": "active",
                "sandbox_mode": "off",
                "identity_emoji": a.get("identityEmoji", ""),
                "soul_md": md_files.get("SOUL.md", ""),
                "agents_md": md_files.get("AGENTS.md", ""),
                "identity_md": md_files.get("IDENTITY.md", ""),
            }
    raise HTTPException(404, "Agent not found")


@api_router.put("/agents/{agent_id}/md")
async def update_agent_md(agent_id: str, body: dict, user=Depends(require_role("admin", "editor"))):
    raw = await gateway.agents()
    agent = None
    for a in raw:
        if a.get("id") == agent_id:
            agent = a
            break
    if not agent:
        raise HTTPException(404, "Agent not found")
    workspace = agent.get("workspace", "")
    if not workspace:
        raise HTTPException(400, "Agent has no workspace")
    wp = Path(workspace)
    wp.mkdir(parents=True, exist_ok=True)
    for fname, key in [("SOUL.md", "soul_md"), ("AGENTS.md", "agents_md"), ("IDENTITY.md", "identity_md")]:
        if key in body:
            (wp / fname).write_text(body[key], encoding="utf-8")
    return {"status": "ok"}


# ===== SKILLS (read-only from CLI) =====
@api_router.get("/skills")
async def list_skills(user=Depends(get_current_user)):
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


@api_router.get("/skills/{skill_id}")
async def get_skill(skill_id: str, user=Depends(get_current_user)):
    raw = await gateway.skills()
    for s in raw.get("skills", []):
        if s["name"] == skill_id:
            return {
                "id": s["name"],
                "name": s["name"],
                "description": s.get("description", ""),
                "enabled": s.get("eligible", False) and not s.get("disabled", False),
                "location": s.get("source", "unknown"),
                "env_keys": s.get("missing", {}).get("env", []),
                "emoji": s.get("emoji", ""),
            }
    raise HTTPException(404, "Skill not found")


# ===== TOOLS (from config) =====
@api_router.get("/tools")
async def list_tools(user=Depends(get_current_user)):
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


# ===== MODELS (from CLI - includes env-based providers) =====
@api_router.get("/models")
async def list_models(user=Depends(get_current_user)):
    raw = await gateway.models()
    return [
        {
            "id": m["key"],
            "name": m.get("name", m["key"]),
            "key": m["key"],
            "provider_id": m["key"].split("/")[0] if "/" in m["key"] else "",
            "enabled": m.get("available", False) and not m.get("missing", True),
            "is_primary": "default" in m.get("tags", []),
            "input": m.get("input", ""),
            "context_window": m.get("contextWindow"),
            "tags": m.get("tags", []),
        }
        for m in raw.get("models", [])
    ]


@api_router.get("/models/providers")
async def list_providers(user=Depends(get_current_user)):
    raw_models, config = await asyncio.gather(gateway.models(), gateway.config_read())
    custom_providers = config.get("models", {}).get("providers", {})

    # Group CLI models by provider_id to discover all providers (built-in + custom)
    cli_by_provider = {}
    for m in raw_models.get("models", []):
        pid = m["key"].split("/")[0] if "/" in m["key"] else ""
        if not pid:
            continue
        if pid not in cli_by_provider:
            cli_by_provider[pid] = []
        cli_by_provider[pid].append({
            "id": m["key"].split("/", 1)[1] if "/" in m["key"] else m["key"],
            "name": m.get("name", ""),
            "contextWindow": m.get("contextWindow"),
            "enabled": m.get("available", False) and not m.get("missing", True),
            "input": m.get("input", ""),
        })

    # Merge: custom providers get their config data, built-in get CLI data
    all_pids = set(list(cli_by_provider.keys()) + list(custom_providers.keys()))
    result = []
    for pid in sorted(all_pids):
        is_custom = pid in custom_providers
        if is_custom:
            pdata = custom_providers[pid]
            entry = {
                "id": pid,
                "name": pid,
                "base_url": pdata.get("baseUrl", ""),
                "api": pdata.get("api", ""),
                "models": pdata.get("models", []),
                "source": "custom",
            }
            # Enrich custom provider models with live status from CLI
            if pid in cli_by_provider:
                cli_map = {m["id"]: m for m in cli_by_provider[pid]}
                for cm in entry["models"]:
                    live = cli_map.get(cm["id"])
                    if live:
                        cm["enabled"] = live["enabled"]
                        cm["input"] = live.get("input", "")
                        if not cm.get("name") and live.get("name"):
                            cm["name"] = live["name"]
        else:
            models_list = cli_by_provider.get(pid, [])
            entry = {
                "id": pid,
                "name": pid,
                "base_url": "",
                "api": "",
                "models": models_list,
                "source": "builtin",
            }
        # Count active models
        entry["active_count"] = sum(1 for m in entry.get("models", []) if m.get("enabled"))
        entry["total_count"] = len(entry.get("models", []))
        result.append(entry)

    # Sort: custom first, then built-in, alphabetical within each group
    result.sort(key=lambda p: (0 if p["source"] == "custom" else 1, p["id"]))
    return result


@api_router.post("/models/providers")
async def create_provider(body: dict, user=Depends(require_role("admin", "editor"))):
    config = await gateway.config_read()
    if "models" not in config:
        config["models"] = {"mode": "merge", "providers": {}}
    if "providers" not in config["models"]:
        config["models"]["providers"] = {}
    pid = body.get("id", "").strip()
    if not pid:
        raise HTTPException(400, "Provider ID is required")
    if pid in config["models"]["providers"]:
        raise HTTPException(409, f"Provider '{pid}' already exists")
    config["models"]["providers"][pid] = {
        "baseUrl": body.get("base_url", ""),
        "api": body.get("api", "openai-completions"),
        "models": body.get("models", []),
    }
    await gateway.config_write(config)
    gateway.cache.invalidate("models")
    await log_activity("create", "provider", pid, f"Created provider {pid}")
    return {"status": "ok", "id": pid}


@api_router.put("/models/providers/{provider_id}")
async def update_provider(provider_id: str, body: dict, user=Depends(require_role("admin", "editor"))):
    config = await gateway.config_read()
    if "models" not in config:
        config["models"] = {"mode": "merge", "providers": {}}
    if "providers" not in config["models"]:
        config["models"]["providers"] = {}
    providers = config["models"]["providers"]
    existing = providers.get(provider_id, {})
    providers[provider_id] = {
        "baseUrl": body.get("base_url", existing.get("baseUrl", "")),
        "api": body.get("api", existing.get("api", "")),
        "models": body.get("models", existing.get("models", [])),
    }
    await gateway.config_write(config)
    gateway.cache.invalidate("models")
    await log_activity("update", "provider", provider_id, f"Updated provider {provider_id}")
    return {"status": "ok"}


@api_router.delete("/models/providers/{provider_id}")
async def delete_provider(provider_id: str, user=Depends(require_role("admin", "editor"))):
    config = await gateway.config_read()
    providers = config.get("models", {}).get("providers", {})
    if provider_id not in providers:
        raise HTTPException(404, f"Provider '{provider_id}' not found")
    del providers[provider_id]
    await gateway.config_write(config)
    gateway.cache.invalidate("models")
    await log_activity("delete", "provider", provider_id, f"Deleted provider {provider_id}")
    return {"status": "ok"}


@api_router.post("/models/providers/{provider_id}/test")
async def test_provider_connection(provider_id: str, user=Depends(require_role("admin", "editor"))):
    config = await gateway.config_read()
    providers = config.get("models", {}).get("providers", {})
    if provider_id not in providers:
        raise HTTPException(404, f"Provider '{provider_id}' not found")
    pdata = providers[provider_id]
    base_url = pdata.get("baseUrl", "").rstrip("/")
    if not base_url:
        return {"ok": False, "error": "No base URL configured", "latency_ms": 0}

    # Probe the /models endpoint (standard for OpenAI-compatible APIs)
    test_url = f"{base_url}/models"
    ctx = ssl.create_default_context()

    def _probe():
        import time
        start = time.monotonic()
        try:
            req = Request(test_url, method="GET")
            req.add_header("User-Agent", "openclaw-manager/1.0")
            with urlopen(req, timeout=10, context=ctx) as resp:
                latency = int((time.monotonic() - start) * 1000)
                return {"ok": True, "status": resp.status, "latency_ms": latency}
        except HTTPError as e:
            latency = int((time.monotonic() - start) * 1000)
            # 401/403 means the server is reachable but needs auth — that's a success for connectivity
            if e.code in (401, 403):
                return {"ok": True, "status": e.code, "latency_ms": latency, "note": "Reachable (auth required)"}
            return {"ok": False, "error": f"HTTP {e.code}: {e.reason}", "latency_ms": latency}
        except URLError as e:
            latency = int((time.monotonic() - start) * 1000)
            return {"ok": False, "error": str(e.reason), "latency_ms": latency}
        except Exception as e:
            latency = int((time.monotonic() - start) * 1000)
            return {"ok": False, "error": str(e), "latency_ms": latency}

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _probe)
    return result


# Provider ID → env var mapping (matches openclaw's auth resolution)
PROVIDER_API_KEY_ENV = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "google": "GEMINI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "groq": "GROQ_API_KEY",
    "mistral": "MISTRAL_API_KEY",
    "xai": "XAI_API_KEY",
    "cerebras": "CEREBRAS_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "moonshot": "MOONSHOT_API_KEY",
    "minimax": "MINIMAX_API_KEY",
    "venice": "VENICE_API_KEY",
    "chutes": "CHUTES_API_KEY",
    "ollama": "OLLAMA_API_KEY",
    "qianfan": "QIANFAN_API_KEY",
    "zai": "ZAI_API_KEY",
    "voyage": "VOYAGE_API_KEY",
}


def _resolve_api_key(provider_id: str) -> str:
    """Resolve API key: auth-profiles → own env → .env → gateway process env."""
    # 1. Read from openclaw auth-profiles (primary key store)
    try:
        import json as _json
        auth_path = os.path.expanduser("~/.openclaw/agents/main/agent/auth-profiles.json")
        with open(auth_path, "r") as f:
            profiles = _json.load(f).get("profiles", {})
        profile = profiles.get(f"{provider_id}:default", {})
        key = profile.get("key", "")
        if key:
            return key
    except Exception:
        pass
    # 2. Check env var
    env_var = PROVIDER_API_KEY_ENV.get(provider_id, "")
    if env_var:
        key = os.environ.get(env_var, "")
        if key:
            return key
    # 3. Read from openclaw's .env file
    if env_var:
        try:
            env_path = os.path.expanduser("~/.openclaw/.env")
            with open(env_path, "r") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith(f"{env_var}="):
                        return line.split("=", 1)[1].strip().strip('"').strip("'")
        except (FileNotFoundError, PermissionError):
            pass
    # 4. Fallback: read from openclaw gateway process environment
    if env_var:
        try:
            import subprocess
            result = subprocess.run(
                ["pgrep", "-f", "openclaw.*gateway"],
                capture_output=True, text=True, timeout=5
            )
            for pid in result.stdout.strip().split("\n"):
                pid = pid.strip()
                if not pid:
                    continue
                try:
                    with open(f"/proc/{pid}/environ", "r") as f:
                        for entry in f.read().split("\0"):
                            if entry.startswith(f"{env_var}="):
                                return entry.split("=", 1)[1]
                except (PermissionError, FileNotFoundError):
                    continue
        except Exception:
            pass
    return ""


@api_router.post("/models/providers/{provider_id}/fetch-models")
async def fetch_provider_models(provider_id: str, body: dict = None, user=Depends(require_role("admin", "editor"))):
    """Fetch available models from a provider's /models endpoint."""
    # Allow passing base_url/api_key directly or read from config
    base_url = (body or {}).get("base_url", "").rstrip("/") if body else ""
    body_api_key = (body or {}).get("api_key", "") if body else ""
    config = await gateway.config_read()
    providers = config.get("models", {}).get("providers", {})
    prov_cfg = providers.get(provider_id, {})
    if not base_url:
        base_url = prov_cfg.get("baseUrl", "").rstrip("/")
    if not base_url:
        return {"ok": False, "error": "No base URL configured", "models": []}

    # Resolve API key: request body → config → env/.env → gateway process
    api_key = body_api_key or prov_cfg.get("apiKey", "") or _resolve_api_key(provider_id)
    env_var = PROVIDER_API_KEY_ENV.get(provider_id, "")

    ctx = ssl.create_default_context()

    # Provider-specific URL and auth handling
    if provider_id == "google":
        fetch_url = f"{base_url}/models" + (f"?key={api_key}" if api_key else "")
    elif provider_id == "anthropic":
        fetch_url = "https://api.anthropic.com/v1/models"
    else:
        fetch_url = f"{base_url}/models"

    def _fetch():
        import json as _json
        try:
            req = Request(fetch_url, method="GET")
            req.add_header("User-Agent", "openclaw-manager/1.0")
            if api_key and provider_id == "anthropic":
                req.add_header("x-api-key", api_key)
                req.add_header("anthropic-version", "2023-06-01")
            elif api_key and provider_id != "google":
                req.add_header("Authorization", f"Bearer {api_key}")
            with urlopen(req, timeout=15, context=ctx) as resp:
                data = _json.loads(resp.read().decode())
                models = []
                # Google returns {models: [{name: "models/gemini-..."}]}
                if provider_id == "google":
                    for m in data.get("models", []):
                        mid = m.get("name", "").replace("models/", "")
                        models.append({
                            "id": mid,
                            "name": m.get("displayName", mid),
                            "owned_by": "google",
                        })
                else:
                    for m in data.get("data", []):
                        models.append({
                            "id": m.get("id", ""),
                            "name": m.get("name", m.get("id", "")),
                            "owned_by": m.get("owned_by", m.get("created_by", "")),
                        })
                models.sort(key=lambda x: x["id"])
                return {"ok": True, "models": models}
        except HTTPError as e:
            if e.code in (401, 403):
                hint = f" ({env_var} not found)" if env_var and not api_key else ""
                return {"ok": False, "error": f"Auth failed — API key missing or invalid{hint}", "models": []}
            return {"ok": False, "error": f"HTTP {e.code}: {e.reason}", "models": []}
        except URLError as e:
            return {"ok": False, "error": str(e.reason), "models": []}
        except Exception as e:
            return {"ok": False, "error": str(e), "models": []}

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _fetch)


# ===== MODEL FALLBACKS (from config) =====
@api_router.get("/models/fallbacks")
async def get_fallbacks(user=Depends(get_current_user)):
    config = await gateway.config_read()
    defaults = config.get("agents", {}).get("defaults", {})
    model_cfg = defaults.get("model", {})
    image_cfg = defaults.get("imageModel", {})
    agents_list = config.get("agents", {}).get("list", [])

    # Load agent-specific fallbacks from MongoDB
    agent_fb_docs = await db.agent_fallbacks.find().to_list(length=100)
    agent_fb_map = {d["agent_id"]: d.get("fallbacks", []) for d in agent_fb_docs}

    return {
        "model": {
            "primary": model_cfg.get("primary", ""),
            "fallbacks": model_cfg.get("fallbacks", []),
        },
        "imageModel": {
            "primary": image_cfg.get("primary", ""),
            "fallbacks": image_cfg.get("fallbacks", []),
        },
        "agents": [
            {
                "id": a["id"],
                "name": a.get("name", a["id"]),
                "model": a.get("model", ""),
                "fallbacks": agent_fb_map.get(a["id"], []),
            }
            for a in agents_list
        ],
    }


@api_router.put("/models/fallbacks")
async def update_fallbacks(body: dict, user=Depends(require_role("admin", "editor"))):
    config = json.loads(json.dumps(await gateway.config_read()))
    if "agents" not in config:
        config["agents"] = {}
    if "defaults" not in config["agents"]:
        config["agents"]["defaults"] = {}

    if "model" in body:
        config["agents"]["defaults"]["model"] = {
            **config["agents"]["defaults"].get("model", {}),
            "primary": body["model"].get("primary", ""),
            "fallbacks": body["model"].get("fallbacks", []),
        }
    if "imageModel" in body:
        config["agents"]["defaults"]["imageModel"] = {
            **config["agents"]["defaults"].get("imageModel", {}),
            "primary": body["imageModel"].get("primary", ""),
            "fallbacks": body["imageModel"].get("fallbacks", []),
        }

    await gateway.config_write(config)
    await log_activity("update", "fallbacks", "defaults", "Updated default model fallbacks")
    return {"status": "ok"}


@api_router.put("/models/fallbacks/agent/{agent_id}")
async def update_agent_fallbacks(agent_id: str, body: dict, user=Depends(require_role("admin", "editor"))):
    config = json.loads(json.dumps(await gateway.config_read()))
    agents_list = config.get("agents", {}).get("list", [])
    agent = next((a for a in agents_list if a["id"] == agent_id), None)
    if not agent:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    need_config_write = False
    if "model" in body:
        agent["model"] = body["model"]
        need_config_write = True

    # Strip invalid "fallbacks" key from agent config if present
    if "fallbacks" in agent:
        del agent["fallbacks"]
        need_config_write = True

    if need_config_write:
        await gateway.config_write(config)

    # Store agent-specific fallbacks in MongoDB (not in openclaw.json)
    if "fallbacks" in body:
        fallbacks = body["fallbacks"]
        if fallbacks:
            await db.agent_fallbacks.update_one(
                {"agent_id": agent_id},
                {"$set": {"agent_id": agent_id, "fallbacks": fallbacks}},
                upsert=True,
            )
        else:
            await db.agent_fallbacks.delete_one({"agent_id": agent_id})

    await log_activity("update", "fallbacks", agent_id, f"Updated fallbacks for agent {agent_id}")
    return {"status": "ok"}


# ===== CHANNELS (from health probe) =====
@api_router.get("/channels")
async def list_channels(user=Depends(get_current_user)):
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


# ===== SESSIONS (from CLI) =====
@api_router.get("/sessions")
async def list_sessions(limit: int = Query(50, le=200), user=Depends(get_current_user)):
    raw = await gateway.sessions()
    sessions = raw.get("sessions", [])[:limit]
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
        for s in sessions
    ]


# ===== CRON JOBS (from CLI) =====
@api_router.get("/cron")
async def list_cron_jobs(user=Depends(get_current_user)):
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


# ===== GATEWAY CONFIG =====
@api_router.get("/config")
async def get_config(user=Depends(get_current_user)):
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
async def update_config(body: dict, user=Depends(require_role("admin", "editor"))):
    try:
        new_config = json.loads(body.get("raw", "{}"))
        await gateway.config_write(new_config)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(400, str(e))


@api_router.post("/config/validate")
async def validate_config(body: dict, user=Depends(require_role("admin", "editor"))):
    try:
        json.loads(body.get("raw", "{}"))
        return {"valid": True, "errors": [], "warnings": []}
    except json.JSONDecodeError as e:
        return {"valid": False, "errors": [str(e)], "warnings": []}


# ===== GATEWAY STATUS =====
@api_router.get("/gateway/status")
async def get_gateway_status(user=Depends(get_current_user)):
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


@api_router.post("/gateway/restart")
async def gateway_restart_endpoint(user=Depends(require_role("admin"))):
    await gateway.gateway_restart()
    await log_activity("restart", "gateway", "", "Gateway restart requested")
    return {"status": "restart_initiated", "message": "Gateway restart signal sent"}


# ===== HOOKS (from config) =====
@api_router.get("/hooks/config")
async def get_hooks_config(user=Depends(get_current_user)):
    config = await gateway.config_read()
    hooks = config.get("hooks", {})
    gw = config.get("gateway", {})
    token = gw.get("auth", {}).get("token", "")
    return {
        "enabled": hooks.get("enabled", False),
        "path": "/hooks",
        "token": (token[:6] + "...") if token else "",
        "presets": list(hooks.get("presets", {}).keys()),
    }


@api_router.get("/hooks/mappings")
async def get_hook_mappings(user=Depends(get_current_user)):
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


# ===== ACTIVITY LOGS =====
@api_router.get("/logs")
async def get_logs(limit: int = Query(50, le=500), user=Depends(get_current_user)):
    return await db.activity_logs.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)


# ===== SYSTEM LOGS (from DB, populated by WebSocket) =====
@api_router.get("/system-logs")
async def list_system_logs(
    level: str = Query("", max_length=20),
    source: str = Query("", max_length=50),
    search: str = Query("", max_length=200),
    limit: int = Query(200, le=1000),
    since_id: str = Query("", max_length=100),
    user=Depends(get_current_user),
):
    query = {}
    if level:
        query["level"] = level
    if source:
        query["source"] = source
    if search:
        query["message"] = {"$regex": search, "$options": "i"}
    if since_id:
        ref = await db.system_logs.find_one({"id": since_id}, {"_id": 0})
        if ref:
            query["timestamp"] = {"$gt": ref["timestamp"]}
    logs = await db.system_logs.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return logs


@api_router.get("/system-logs/stats")
async def system_logs_stats(user=Depends(get_current_user)):
    total = await db.system_logs.count_documents({})
    errors = await db.system_logs.count_documents({"level": "ERROR"})
    warns = await db.system_logs.count_documents({"level": "WARN"})
    by_source = await db.system_logs.aggregate([
        {"$group": {"_id": "$source", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]).to_list(20)
    by_level = await db.system_logs.aggregate([
        {"$group": {"_id": "$level", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]).to_list(10)
    return {"total": total, "errors": errors, "warnings": warns, "by_source": by_source, "by_level": by_level}


# ===== AGENT ACTIVITIES (from DB, populated by WebSocket) =====
@api_router.get("/activities")
async def list_activities(
    agent_id: str = Query("", max_length=100),
    event_type: str = Query("", max_length=50),
    status: str = Query("", max_length=20),
    limit: int = Query(100, le=500),
    since_id: str = Query("", max_length=100),
    user=Depends(get_current_user),
):
    query = {}
    if agent_id:
        query["agent_id"] = agent_id
    if event_type:
        query["event_type"] = event_type
    if status:
        query["status"] = status
    if since_id:
        ref = await db.agent_activities.find_one({"id": since_id}, {"_id": 0})
        if ref:
            query["timestamp"] = {"$gt": ref["timestamp"]}
    activities = await db.agent_activities.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return activities


@api_router.get("/activities/stats")
async def activities_stats(user=Depends(get_current_user)):
    pipeline_agent = [
        {"$group": {"_id": "$agent_name", "count": {"$sum": 1}, "errors": {"$sum": {"$cond": [{"$eq": ["$status", "error"]}, 1, 0]}}}},
        {"$sort": {"count": -1}}
    ]
    pipeline_tools = [
        {"$match": {"event_type": "tool_call"}},
        {"$group": {"_id": "$tool_name", "count": {"$sum": 1}, "avg_ms": {"$avg": "$duration_ms"}}},
        {"$sort": {"count": -1}},
        {"$limit": 15}
    ]
    pipeline_types = [
        {"$group": {"_id": "$event_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    agent_stats = await db.agent_activities.aggregate(pipeline_agent).to_list(50)
    tool_stats = await db.agent_activities.aggregate(pipeline_tools).to_list(15)
    type_stats = await db.agent_activities.aggregate(pipeline_types).to_list(20)
    total = await db.agent_activities.count_documents({})
    running = await db.agent_activities.count_documents({"status": "running"})
    errors = await db.agent_activities.count_documents({"status": "error"})
    return {
        "total": total,
        "running": running,
        "errors": errors,
        "by_agent": agent_stats,
        "by_tool": tool_stats,
        "by_type": type_stats,
    }


@api_router.get("/activities/{activity_id}")
async def get_activity(activity_id: str, user=Depends(get_current_user)):
    act = await db.agent_activities.find_one({"id": activity_id}, {"_id": 0})
    if not act:
        raise HTTPException(404, "Activity not found")
    return act


# ===== CLAWHUB MARKETPLACE (kept with MongoDB) =====
@api_router.get("/clawhub")
async def list_clawhub_skills(search: str = Query("", max_length=100), category: str = Query("all"), user=Depends(get_current_user)):
    query = {}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"slug": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
            {"tags": {"$regex": search, "$options": "i"}},
        ]
    if category != "all":
        query["category"] = category
    return await db.clawhub_skills.find(query, {"_id": 0}).sort("downloads", -1).to_list(200)


@api_router.post("/clawhub/install/{skill_id}")
async def install_clawhub_skill(skill_id: str, body: dict = None, user=Depends(require_role("admin", "editor"))):
    skill = await db.clawhub_skills.find_one({"id": skill_id}, {"_id": 0})
    if not skill:
        raise HTTPException(404, "Skill not found")
    # Save env vars to openclaw .env file if provided
    env_vars = (body or {}).get("env_vars", {})
    if env_vars:
        import aiofiles
        env_file = Path.home() / ".openclaw" / ".env"
        existing = {}
        if env_file.exists():
            async with aiofiles.open(env_file, "r") as f:
                for line in (await f.read()).splitlines():
                    if "=" in line and not line.startswith("#"):
                        k, v = line.split("=", 1)
                        existing[k.strip()] = v.strip()
        existing.update(env_vars)
        async with aiofiles.open(env_file, "w") as f:
            await f.write("\n".join(f"{k}={v}" for k, v in existing.items()) + "\n")
    await db.clawhub_skills.update_one({"id": skill_id}, {"$set": {"installed": True, "installed_version": skill["version"]}})
    await log_activity("install", "clawhub", skill_id, f"Installed skill: {skill['slug']}")
    return {"status": "installed", "slug": skill["slug"]}


@api_router.post("/clawhub/uninstall/{skill_id}")
async def uninstall_clawhub_skill(skill_id: str, user=Depends(require_role("admin", "editor"))):
    skill = await db.clawhub_skills.find_one({"id": skill_id}, {"_id": 0})
    if not skill:
        raise HTTPException(404, "Skill not found")
    await db.clawhub_skills.update_one({"id": skill_id}, {"$set": {"installed": False, "installed_version": ""}})
    await log_activity("uninstall", "clawhub", skill_id, f"Uninstalled skill: {skill['slug']}")
    return {"status": "uninstalled"}


# ===== SYSTEM HEALTH (psutil) =====
def _collect_system_health():
    import psutil
    import time

    # CPU
    cpu_percent_per_core = psutil.cpu_percent(interval=0.1, percpu=True)
    cpu_freq = psutil.cpu_freq()
    try:
        load_avg = list(os.getloadavg())
    except (OSError, AttributeError):
        load_avg = [0.0, 0.0, 0.0]

    cpu = {
        "percent_total": sum(cpu_percent_per_core) / len(cpu_percent_per_core) if cpu_percent_per_core else 0,
        "percent_per_core": cpu_percent_per_core,
        "count_logical": psutil.cpu_count(logical=True),
        "count_physical": psutil.cpu_count(logical=False),
        "frequency_mhz": {
            "current": round(cpu_freq.current, 1) if cpu_freq else 0,
            "min": round(cpu_freq.min, 1) if cpu_freq else 0,
            "max": round(cpu_freq.max, 1) if cpu_freq else 0,
        },
        "load_avg": [round(x, 2) for x in load_avg],
    }

    # Memory
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()
    memory = {
        "total_bytes": mem.total,
        "available_bytes": mem.available,
        "used_bytes": mem.used,
        "percent": mem.percent,
        "swap_total_bytes": swap.total,
        "swap_used_bytes": swap.used,
        "swap_percent": swap.percent,
    }

    # Disk — filter out virtual/snap partitions
    skip_fstypes = {"squashfs", "tmpfs", "devtmpfs", "overlay", "aufs"}
    skip_mountpoint_prefixes = ("/snap", "/sys", "/proc", "/dev", "/run")
    partitions = []
    for p in psutil.disk_partitions(all=False):
        if p.fstype in skip_fstypes:
            continue
        if any(p.mountpoint.startswith(prefix) for prefix in skip_mountpoint_prefixes):
            continue
        try:
            usage = psutil.disk_usage(p.mountpoint)
            partitions.append({
                "device": p.device,
                "mountpoint": p.mountpoint,
                "fstype": p.fstype,
                "total_bytes": usage.total,
                "used_bytes": usage.used,
                "free_bytes": usage.free,
                "percent": usage.percent,
            })
        except PermissionError:
            continue
    disk = {"partitions": partitions}

    # Network
    net_io = psutil.net_io_counters()
    net_per_nic = psutil.net_io_counters(pernic=True)
    interfaces = {}
    for name, counters in net_per_nic.items():
        if name == "lo":
            continue
        interfaces[name] = {
            "bytes_sent": counters.bytes_sent,
            "bytes_recv": counters.bytes_recv,
        }
    network = {
        "bytes_sent": net_io.bytes_sent,
        "bytes_recv": net_io.bytes_recv,
        "packets_sent": net_io.packets_sent,
        "packets_recv": net_io.packets_recv,
        "interfaces": interfaces,
    }

    # Processes
    proc_statuses = {"total": 0, "running": 0, "sleeping": 0, "zombie": 0}
    for proc in psutil.process_iter(["status"]):
        proc_statuses["total"] += 1
        st = proc.info["status"]
        if st == psutil.STATUS_RUNNING:
            proc_statuses["running"] += 1
        elif st == psutil.STATUS_SLEEPING:
            proc_statuses["sleeping"] += 1
        elif st == psutil.STATUS_ZOMBIE:
            proc_statuses["zombie"] += 1
    processes = proc_statuses

    # Uptime & boot time
    boot_time_ts = psutil.boot_time()
    uptime_seconds = round(time.time() - boot_time_ts)
    boot_time_iso = datetime.fromtimestamp(boot_time_ts, tz=timezone.utc).isoformat()

    # Temperatures (not available on all systems)
    temperatures = None
    try:
        temps = psutil.sensors_temperatures()
        if temps:
            temperatures = {}
            for chip, entries in temps.items():
                temperatures[chip] = [
                    {"label": e.label or "unknown", "current": e.current, "high": e.high, "critical": e.critical}
                    for e in entries
                ]
    except (AttributeError, NotImplementedError):
        pass

    return {
        "cpu": cpu,
        "memory": memory,
        "disk": disk,
        "network": network,
        "processes": processes,
        "uptime_seconds": uptime_seconds,
        "boot_time": boot_time_iso,
        "temperatures": temperatures,
    }


@api_router.get("/health/system")
async def get_system_health(user=Depends(get_current_user)):
    return await asyncio.to_thread(_collect_system_health)


app.include_router(api_router)


# ===== WEBSOCKET: REAL LOG STREAMING =====
@app.websocket("/api/ws/logs")
async def ws_logs(websocket: WebSocket):
    await websocket.accept()
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008, reason="Missing token")
        return
    try:
        from auth import decode_token
        payload = decode_token(token)
        if payload.get("type") != "access":
            await websocket.close(code=1008, reason="Invalid token")
            return
    except Exception:
        await websocket.close(code=1008, reason="Invalid token")
        return
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


# ===== WEBSOCKET: REAL ACTIVITY STREAMING =====
@app.websocket("/api/ws/activities")
async def ws_activities(websocket: WebSocket):
    await websocket.accept()
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008, reason="Missing token")
        return
    try:
        from auth import decode_token
        payload = decode_token(token)
        if payload.get("type") != "access":
            await websocket.close(code=1008, reason="Invalid token")
            return
    except Exception:
        await websocket.close(code=1008, reason="Invalid token")
        return
    proc = None
    try:
        proc = await gateway.logs_stream()
        # Send recent activities from DB on init
        recent = await db.agent_activities.find({}, {"_id": 0}).sort("timestamp", -1).limit(100).to_list(100)
        await websocket.send_json({"type": "init", "data": recent})
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
                        agent_name = sub.split("/")[-1] if "/" in sub else "main"
                        activity = {
                            "id": str(uuid.uuid4()),
                            "agent_id": agent_name,
                            "agent_name": agent_name,
                            "event_type": "tool_call" if "tool" in msg.lower() else "llm_request" if "llm" in msg.lower() else "message_received",
                            "tool_name": "",
                            "status": "completed",
                            "duration_ms": 0,
                            "channel": "",
                            "timestamp": entry.get("time", ""),
                            "message": msg,
                        }
                        buffer.append(activity)
                        await db.agent_activities.insert_one({**activity})
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


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
