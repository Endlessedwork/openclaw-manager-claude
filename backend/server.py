from fastapi import FastAPI, APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, Depends, Body
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import json
import logging
import asyncio
from pathlib import Path
import uuid
from datetime import datetime, timedelta, timezone
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
import ssl
import datetime as dt

from sqlmodel import select
from sqlalchemy import func, or_, desc, case

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from database import engine, async_session
from utils import utcnow
from models.usage import DailyUsage
from models.activity import ActivityLog, AgentActivity, SystemLog
from models.fallback import AgentFallback
from models.clawhub import ClawHubSkill
from gateway_cli import gateway
from auth import get_current_user, require_role
from routes.auth_routes import auth_router
from routes.user_routes import user_router
from routes.file_routes import file_router
from routes.workspace_routes import workspace_router
from routes.conversation_routes import conversation_router
from routes.session_routes import session_router
from routes.memory_routes import memory_router
from routes.notification_routes import notification_router
from routes.settings_routes import settings_router
from routes.ai_chat_routes import ai_chat_router

app = FastAPI()


@app.on_event("startup")
async def set_db():
    app.state.async_session = async_session
    # Migrate old role names to new names (one-time, idempotent)
    async with async_session() as session:
        from sqlmodel import update
        from models.user import User
        # Order matters: admin→superadmin first, then editor→admin
        await session.execute(update(User).where(User.role == "admin").values(role="superadmin"))
        await session.execute(update(User).where(User.role == "editor").values(role="admin"))
        await session.execute(update(User).where(User.role == "viewer").values(role="user"))
        await session.commit()
    async def _warmup():
        await gateway.warmup()
        # Pre-build dashboard after CLI cache is warm
        try:
            await _build_dashboard()
        except Exception:
            pass
    asyncio.create_task(_warmup())
    asyncio.create_task(_usage_collector())
    asyncio.create_task(_notification_checker())
    # Auto-sync file-based data (documents, knowledge, sessions) from disk to DB
    from auto_sync import run_auto_sync
    asyncio.create_task(run_auto_sync())


async def _upsert_daily_usage(daily: list):
    """Upsert a list of daily usage records into PostgreSQL."""
    async with async_session() as session:
        for d in daily:
            if not d.get("date"):
                continue
            date_val = dt.date.fromisoformat(d["date"])
            existing = (await session.execute(
                select(DailyUsage).where(DailyUsage.date == date_val)
            )).scalar_one_or_none()
            cost_breakdown = {k: v for k, v in d.items() if k not in ("date", "totalTokens", "totalCost")}
            if existing:
                existing.total_tokens = d.get("totalTokens", 0)
                existing.total_cost = d.get("totalCost", 0.0)
                existing.cost_breakdown = cost_breakdown or None
                existing.updated_at = utcnow()
            else:
                session.add(DailyUsage(
                    date=date_val,
                    total_tokens=d.get("totalTokens", 0),
                    total_cost=d.get("totalCost", 0.0),
                    cost_breakdown=cost_breakdown or None,
                ))
        await session.commit()


async def _usage_collector():
    """Background task: backfill 90d on start, then upsert hourly."""
    logger = logging.getLogger("usage_collector")

    # Backfill on startup
    try:
        data = await gateway.usage_cost_raw(days=90)
        daily = data.get("daily", []) if isinstance(data, dict) else []
        await _upsert_daily_usage(daily)
        logger.info(f"Backfilled {len(daily)} daily usage records")
    except Exception as e:
        logger.warning(f"Usage backfill failed: {e}")

    # Hourly loop
    while True:
        await asyncio.sleep(3600)
        try:
            data = await gateway.usage_cost_raw(days=1)
            daily = data.get("daily", []) if isinstance(data, dict) else []
            await _upsert_daily_usage(daily)
        except Exception as e:
            logger.warning(f"Usage hourly sync failed: {e}")


api_router = APIRouter(prefix="/api")
api_router.include_router(auth_router)
api_router.include_router(user_router)
api_router.include_router(file_router)
api_router.include_router(workspace_router)
api_router.include_router(conversation_router)
api_router.include_router(session_router)
api_router.include_router(memory_router)
api_router.include_router(notification_router)
api_router.include_router(settings_router)
api_router.include_router(ai_chat_router)


# ===== HELPER =====
async def log_activity(action: str, entity_type: str, entity_id: str = "", details: str = ""):
    async with async_session() as session:
        session.add(ActivityLog(
            action=action, entity_type=entity_type,
            entity_id=entity_id, details=details,
        ))
        await session.commit()


def _model_str(val) -> str:
    """Normalize a model config value to a plain string.
    Config may store model as a string or as {primary, fallbacks} object."""
    if isinstance(val, dict):
        return val.get("primary", "")
    return val if isinstance(val, str) else ""


# ===== FALLBACK DETECTION HELPER =====
def _detect_fallback_sessions(sessions_raw: dict, config: dict) -> list[dict]:
    """Detect sessions running on fallback models.
    Returns list of dicts: key, agent, expected, actual.
    """
    primary = config.get("agents", {}).get("defaults", {}).get("model", {}).get("primary", "")
    agent_overrides = {
        a["id"]: _model_str(a["model"])
        for a in config.get("agents", {}).get("list", [])
        if a.get("model") and _model_str(a["model"])
    }
    fallbacks = []
    for s in sessions_raw.get("sessions", []):
        key = s.get("key", "")
        agent = key.split(":")[1] if ":" in key else "main"
        expected = agent_overrides.get(agent, primary)
        actual = s.get("model", "")
        actual_short = actual.split("/")[-1] if actual else ""
        expected_short = expected.split("/")[-1] if expected else ""
        if actual_short and actual_short != expected_short:
            fallbacks.append({
                "key": key, "agent": agent,
                "expected": expected_short, "actual": actual_short,
            })
    return fallbacks


# ===== NOTIFICATION CHECKER =====
async def _notification_checker():
    """Background task: check notification conditions every 5 minutes."""
    logger = logging.getLogger("notification_checker")
    await asyncio.sleep(60)  # Wait for caches to warm up
    while True:
        try:
            await _check_and_send_notifications()
        except Exception as e:
            logger.warning(f"Notification check failed: {e}")
        await asyncio.sleep(300)


async def _check_and_send_notifications():
    from models.notification import NotificationRule
    async with async_session() as session:
        result = await session.execute(
            select(NotificationRule).where(NotificationRule.enabled == True)
        )
        rules = result.scalars().all()
    if not rules:
        return
    for rule in rules:
        if rule.last_notified_at:
            elapsed = (utcnow() - rule.last_notified_at).total_seconds() / 60
            if elapsed < rule.cooldown_minutes:
                continue
        if rule.event_type == "model_fallback":
            await _check_fallback_notification(rule)


async def _check_fallback_notification(rule):
    from models.notification import NotificationRule
    logger = logging.getLogger("notification_checker")
    try:
        sessions_raw, config = await asyncio.gather(
            gateway.sessions(), gateway.config_read()
        )
    except Exception:
        return
    fallbacks = _detect_fallback_sessions(sessions_raw, config)
    if not fallbacks:
        return
    primary = config.get("agents", {}).get("defaults", {}).get("model", {}).get("primary", "")
    count = len(fallbacks)
    models_used = ", ".join(sorted(set(f["actual"] for f in fallbacks)))
    message = (
        f"⚠️ Model Fallback Alert\n"
        f"{count} session{'s' if count > 1 else ''} using fallback models.\n"
        f"Models in use: {models_used}\n"
        f"Expected primary: {primary.split('/')[-1] if primary else 'unknown'}\n"
        f"Time: {utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC"
    )
    try:
        await gateway.send_message(rule.channel, rule.target, message)
        async with async_session() as session:
            db_rule = await session.get(NotificationRule, rule.id)
            if db_rule:
                db_rule.last_notified_at = utcnow()
                await session.commit()
    except Exception as e:
        logger.warning(f"Failed to send notification to {rule.target}: {e}")


# ===== DASHBOARD =====
async def _build_dashboard():
    """Build dashboard data from CLI calls.

    Splits into two phases to reduce CPU contention on low-core machines:
    Phase 1 (critical): health + config — enough to render the dashboard
    Phase 2 (parallel): skills + cron — secondary stats
    Sessions/fallback detection is deferred to avoid blocking the dashboard.
    """
    # Phase 1: health is slowest and most important, config is instant (file read)
    health_result, config = await asyncio.gather(
        gateway.health(),
        gateway.config_read(),
        return_exceptions=True,
    )
    health = health_result if not isinstance(health_result, Exception) else {}
    config = config if not isinstance(config, Exception) else {}

    # Phase 2: skills + cron (run after health frees a semaphore slot)
    skills_result, cron_result = await asyncio.gather(
        gateway.skills(),
        gateway.cron_jobs(),
        return_exceptions=True,
    )
    skills = skills_result if not isinstance(skills_result, Exception) else {}
    cron = cron_result if not isinstance(cron_result, Exception) else {}

    skill_list = skills.get("skills", [])
    active_skills = [s for s in skill_list if s.get("eligible") and not s.get("disabled")]
    channel_list = health.get("channels", {})
    active_channels = [k for k, v in channel_list.items() if v.get("configured")]
    session_data = health.get("sessions", {})

    # Fallback detection: use cached sessions if available, don't block for it
    try:
        sessions_raw = gateway.cache._cache.get("sessions", {}).get("data", {})
    except Exception:
        sessions_raw = {}
    fallback_count = len(_detect_fallback_sessions(sessions_raw, config)) if sessions_raw else 0

    return {
        "agents": len(health.get("agents", [])),
        "skills": {"total": len(skill_list), "active": len(active_skills)},
        "channels": {"total": len(channel_list), "active": len(active_channels)},
        "sessions": session_data.get("count", 0) if isinstance(session_data, dict) else 0,
        "cron_jobs": len(cron.get("jobs", [])),
        "model_providers": len(config.get("models", {}).get("providers", {})),
        "gateway_status": "running" if health.get("ok") else "offline",
        "fallback_sessions": fallback_count,
        "recent_activity": [],
    }


@api_router.get("/dashboard")
async def get_dashboard(user=Depends(get_current_user)):
    return await gateway.cache.get("dashboard", _build_dashboard, 30, stale_ok=True)


# ===== AGENTS (read-only from CLI) =====
@api_router.get("/agents")
async def list_agents(user=Depends(get_current_user)):
    raw, config = await asyncio.gather(gateway.agents(), gateway.config_read())
    # Build lookup from config for per-agent model overrides
    agents_cfg = config.get("agents", {})
    default_model = agents_cfg.get("defaults", {}).get("model", {}).get("primary", "")
    cfg_by_id = {a["id"]: a for a in agents_cfg.get("list", []) if "id" in a}
    return [
        {
            "id": a.get("id"),
            "name": a.get("id"),
            "description": a.get("identityName", a.get("name", "")),
            "workspace": a.get("workspace", ""),
            "model_primary": _model_str(cfg_by_id.get(a.get("id"), {}).get("model", "")) or default_model,
            "tools_profile": "full",
            "status": "active",
            "sandbox_mode": "off",
            "identity_emoji": a.get("identityEmoji", ""),
        }
        for a in raw
    ]


@api_router.get("/agents/{agent_id}")
async def get_agent(agent_id: str, user=Depends(get_current_user)):
    raw, config = await asyncio.gather(gateway.agents(), gateway.config_read())
    agents_cfg = config.get("agents", {})
    default_model = agents_cfg.get("defaults", {}).get("model", {}).get("primary", "")
    cfg_by_id = {a["id"]: a for a in agents_cfg.get("list", []) if "id" in a}
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
            agent_model = _model_str(cfg_by_id.get(agent_id, {}).get("model", "")) or default_model
            return {
                "id": a.get("id"),
                "name": a.get("id"),
                "description": a.get("identityName", a.get("name", "")),
                "workspace": workspace,
                "model_primary": agent_model,
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
async def update_agent_md(agent_id: str, body: dict, user=Depends(require_role("superadmin", "admin"))):
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

def _normalize_source(raw_source: str) -> str:
    """Map a raw CLI source string to a clean category name."""
    s = raw_source.lower()
    if "bundled" in s:
        return "bundled"
    if "workspace" in s:
        return "workspace"
    if "personal" in s or "managed" in s or "agents-skills" in s:
        return "managed"
    return "unknown"


def _transform_skill(raw: dict) -> dict:
    """Transform a raw CLI skill dict into the API response format."""
    name = raw["name"]
    eligible = raw.get("eligible", False)
    disabled = raw.get("disabled", False)
    missing_raw = raw.get("missing", {})
    bins = list(missing_raw.get("bins", []))
    bins.extend(missing_raw.get("anyBins", []))
    return {
        "id": name,
        "name": name,
        "description": raw.get("description", ""),
        "emoji": raw.get("emoji", ""),
        "eligible": eligible,
        "disabled": disabled,
        "enabled": eligible and not disabled,
        "source": _normalize_source(raw.get("source", "")),
        "missing": {
            "bins": bins,
            "env": list(missing_raw.get("env", [])),
            "os": list(missing_raw.get("os", [])),
        },
    }


def _toggle_skill_in_config(config: dict, skill_name: str, enabled: bool) -> dict:
    """Toggle a skill's enabled state in the config dict.

    Convention: only *disabled* skills are stored in config.skills.entries.
    Enabled skills have no entry (clean config).
    """
    if "skills" not in config:
        config["skills"] = {}
    if "entries" not in config["skills"]:
        config["skills"]["entries"] = {}

    if enabled:
        # Remove the disabled entry (clean config — only disabled skills stored)
        config["skills"]["entries"].pop(skill_name, None)
    else:
        config["skills"]["entries"][skill_name] = {"enabled": False}

    return config


@api_router.get("/skills")
async def list_skills(user=Depends(get_current_user)):
    raw = await gateway.skills()
    return [_transform_skill(s) for s in raw.get("skills", [])]


@api_router.get("/skills/{skill_id}")
async def get_skill(skill_id: str, user=Depends(get_current_user)):
    raw = await gateway.skills()
    for s in raw.get("skills", []):
        if s["name"] == skill_id:
            return _transform_skill(s)
    raise HTTPException(404, "Skill not found")


@api_router.post("/skills/{skill_name}/toggle")
async def toggle_skill(skill_name: str, body: dict, user=Depends(require_role("superadmin", "admin"))):
    # Validate body
    if "enabled" not in body or not isinstance(body["enabled"], bool):
        raise HTTPException(400, "Body must include 'enabled' (boolean)")

    enabled = body["enabled"]

    # Validate skill exists
    raw = await gateway.skills()
    skill_names = [s["name"] for s in raw.get("skills", [])]
    if skill_name not in skill_names:
        raise HTTPException(404, f"Skill '{skill_name}' not found")

    # Read config, apply toggle, write back
    config = await gateway.config_read()
    _toggle_skill_in_config(config, skill_name, enabled)
    await gateway.config_write(config)

    # Restart gateway (non-fatal)
    try:
        await gateway.gateway_restart()
    except Exception:
        pass

    # Invalidate skills cache so next GET reflects the change
    gateway.cache.invalidate("skills")

    return {"ok": True, "skill": skill_name, "enabled": enabled}


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
        is_in_cli = pid in cli_by_provider
        if is_custom:
            pdata = custom_providers[pid]
            entry = {
                "id": pid,
                "name": pid,
                "base_url": pdata.get("baseUrl", ""),
                "api": pdata.get("api", ""),
                "models": pdata.get("models", []),
                # If also in CLI, it's a built-in that was overridden
                "source": "builtin" if is_in_cli else "custom",
            }
            # Enrich custom provider models with live status from CLI
            if is_in_cli:
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

    # Batch resolve API keys (single pgrep + file reads for all providers)
    all_keys = _resolve_all_api_keys()
    for entry in result:
        entry["has_api_key"] = bool(all_keys.get(entry["id"], ""))

    # Sort: custom first, then built-in, alphabetical within each group
    result.sort(key=lambda p: (0 if p["source"] == "custom" else 1, p["id"]))
    return result


@api_router.post("/models/providers")
async def create_provider(body: dict, user=Depends(require_role("superadmin", "admin"))):
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
    # Save API key to ~/.openclaw/.env if provided
    if body.get("api_key", "").strip():
        _save_api_key(pid, body["api_key"].strip())
    _sync_models_json(pid, config["models"]["providers"][pid])
    gateway.cache.invalidate("models")
    await log_activity("create", "provider", pid, f"Created provider {pid}")
    return {"status": "ok", "id": pid, "restart_needed": True}


@api_router.put("/models/providers/{provider_id}")
async def update_provider(provider_id: str, body: dict, user=Depends(require_role("superadmin", "admin"))):
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
    # Save API key to ~/.openclaw/.env if provided
    if body.get("api_key", "").strip():
        _save_api_key(provider_id, body["api_key"].strip())
    _sync_models_json(provider_id, providers[provider_id])
    gateway.cache.invalidate("models")
    await log_activity("update", "provider", provider_id, f"Updated provider {provider_id}")
    return {"status": "ok", "restart_needed": True}


@api_router.delete("/models/providers/{provider_id}")
async def delete_provider(provider_id: str, user=Depends(require_role("superadmin", "admin"))):
    config = await gateway.config_read()
    providers = config.get("models", {}).get("providers", {})
    if provider_id not in providers:
        raise HTTPException(404, f"Provider '{provider_id}' not found")
    del providers[provider_id]
    await gateway.config_write(config)
    _sync_models_json(provider_id, delete=True)
    gateway.cache.invalidate("models")
    await log_activity("delete", "provider", provider_id, f"Deleted provider {provider_id}")
    return {"status": "ok", "restart_needed": True}


MODELS_JSON = Path.home() / ".openclaw" / "agents" / "main" / "agent" / "models.json"

# Well-known base URLs for built-in providers
PROVIDER_BASE_URLS = {
    "openai": "https://api.openai.com/v1",
    "anthropic": "https://api.anthropic.com/v1",
    "google": "https://generativelanguage.googleapis.com/v1beta",
    "openrouter": "https://openrouter.ai/api/v1",
    "groq": "https://api.groq.com/openai/v1",
    "mistral": "https://api.mistral.ai/v1",
    "xai": "https://api.x.ai/v1",
    "cerebras": "https://api.cerebras.ai/v1",
    "deepseek": "https://api.deepseek.com/v1",
    "moonshot": "https://api.moonshot.ai/v1",
    "minimax": "https://api.minimax.chat/v1",
    "venice": "https://api.venice.ai/api/v1",
    "chutes": "https://api.chutes.ai/v1",
    "ollama": "http://127.0.0.1:11434/v1",
    "qianfan": "https://qianfan.baidubce.com/v2",
    "zai": "https://open.bigmodel.cn/api/paas/v4",
}


@api_router.post("/models/providers/{provider_id}/test")
async def test_provider_connection(provider_id: str, user=Depends(require_role("superadmin", "admin"))):
    config = await gateway.config_read()
    providers = config.get("models", {}).get("providers", {})
    pdata = providers.get(provider_id, {})
    base_url = pdata.get("baseUrl", "").rstrip("/")
    # Fallback to well-known URL for built-in providers
    if not base_url:
        base_url = PROVIDER_BASE_URLS.get(provider_id, "")
    if not base_url:
        return {"ok": False, "error": "No base URL configured", "latency_ms": 0}

    api_key = _resolve_api_key(provider_id)

    # Probe the /models endpoint (standard for OpenAI-compatible APIs)
    # Anthropic base URL doesn't include /v1, so we need to add it
    if provider_id == "anthropic":
        test_url = f"{base_url}/v1/models"
    else:
        test_url = f"{base_url}/models"
    # Google Gemini uses ?key= query param instead of Bearer token
    if provider_id == "google" and api_key:
        test_url = f"{test_url}?key={api_key}"
    ctx = ssl.create_default_context()

    def _probe():
        import time
        start = time.monotonic()
        try:
            req = Request(test_url, method="GET")
            req.add_header("User-Agent", "openclaw-manager/1.0")
            if api_key and provider_id == "anthropic":
                req.add_header("x-api-key", api_key)
                req.add_header("anthropic-version", "2023-06-01")
            elif api_key and provider_id != "google":
                req.add_header("Authorization", f"Bearer {api_key}")
            with urlopen(req, timeout=10, context=ctx) as resp:
                latency = int((time.monotonic() - start) * 1000)
                return {"ok": True, "status": resp.status, "latency_ms": latency}
        except HTTPError as e:
            latency = int((time.monotonic() - start) * 1000)
            # 401/403 means the server is reachable but needs auth
            if e.code in (401, 403):
                return {"ok": True, "status": e.code, "latency_ms": latency, "note": "Reachable (auth required)"}
            # Try to extract a meaningful message from the error body
            if e.code == 400:
                try:
                    err_body = json.loads(e.read().decode())
                    err_obj = err_body.get("error", {})
                    msg = err_obj.get("message", "")
                    # Google Gemini puts reason in details[0].reason
                    details = err_obj.get("details", [])
                    reason = details[0].get("reason", "") if details else ""
                    if reason == "API_KEY_INVALID" or "API key" in msg:
                        return {"ok": False, "error": f"Invalid API key — {msg}", "latency_ms": latency}
                    if msg:
                        return {"ok": False, "error": msg, "latency_ms": latency}
                except Exception:
                    pass
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
    """Resolve API key for a single provider."""
    return _resolve_all_api_keys().get(provider_id, "")


# Cache gateway process env to avoid repeated pgrep + /proc reads.
# Note: concurrent requests may redundantly refresh the cache (benign race);
# the GIL protects dict mutations and worst case is duplicate /proc reads.
_gateway_env_cache = {"data": {}, "ts": 0}


def _resolve_all_api_keys() -> dict:
    """Resolve API keys for ALL providers at once (efficient batch).
    Returns dict of provider_id → api_key."""
    import time as _time

    result = {}

    # 1. Read auth-profiles (single file read for all providers)
    profiles = {}
    try:
        auth_path = os.path.expanduser("~/.openclaw/agents/main/agent/auth-profiles.json")
        with open(auth_path, "r") as f:
            profiles = json.loads(f.read()).get("profiles", {})
    except Exception:
        pass

    # 2. Read openclaw .env file (single file read)
    dotenv_keys = {}
    try:
        env_path = os.path.expanduser("~/.openclaw/.env")
        with open(env_path, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    dotenv_keys[k.strip()] = v.strip().strip('"').strip("'")
    except (FileNotFoundError, PermissionError):
        pass

    # 3. Read gateway process env (cached for 60s to avoid repeated pgrep)
    now = _time.monotonic()
    if now - _gateway_env_cache["ts"] > 60:
        gw_env = {}
        try:
            import subprocess
            proc_result = subprocess.run(
                ["pgrep", "-f", "openclaw.*gateway"],
                capture_output=True, text=True, timeout=5
            )
            for pid in proc_result.stdout.strip().split("\n"):
                pid = pid.strip()
                if not pid:
                    continue
                try:
                    with open(f"/proc/{pid}/environ", "r") as f:
                        for entry in f.read().split("\0"):
                            if "=" in entry:
                                k, v = entry.split("=", 1)
                                gw_env[k] = v
                    break  # Only need first matching process
                except (PermissionError, FileNotFoundError):
                    continue
        except Exception:
            pass
        _gateway_env_cache["data"] = gw_env
        _gateway_env_cache["ts"] = now
    gw_env = _gateway_env_cache["data"]

    # 4. Resolve each provider: .env → process env → gateway env → auth-profiles
    #    .env first because it's what the UI writes to (user-managed)
    for pid, env_var in PROVIDER_API_KEY_ENV.items():
        # .env file (written by UI — highest priority)
        key = dotenv_keys.get(env_var, "")
        if key:
            result[pid] = key
            continue
        # process env
        key = os.environ.get(env_var, "")
        if key:
            result[pid] = key
            continue
        # gateway process env
        key = gw_env.get(env_var, "")
        if key:
            result[pid] = key
            continue
        # auth-profiles (fallback)
        profile = profiles.get(f"{pid}:default", {})
        key = profile.get("key", "")
        if key:
            result[pid] = key

    return result


def _save_api_key(provider_id: str, api_key: str):
    """Save API key to ~/.openclaw/.env (same place openclaw CLI reads from)."""
    env_var = PROVIDER_API_KEY_ENV.get(provider_id, "")
    if not env_var or not api_key:
        return
    env_path = Path.home() / ".openclaw" / ".env"
    lines = []
    replaced = False
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            stripped = line.strip()
            if stripped and not stripped.startswith("#") and "=" in stripped:
                k = stripped.split("=", 1)[0].strip()
                if k == env_var:
                    lines.append(f"{env_var}={api_key}")
                    replaced = True
                    continue
            lines.append(line)
    if not replaced:
        lines.append(f"{env_var}={api_key}")
    env_path.write_text("\n".join(lines) + "\n")


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


@api_router.post("/models/providers/{provider_id}/fetch-models")
async def fetch_provider_models(provider_id: str, body: dict = None, user=Depends(require_role("superadmin", "admin"))):
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
                        entry = {
                            "id": mid,
                            "name": m.get("displayName", mid),
                            "owned_by": "google",
                        }
                        # Google returns inputTokenLimit
                        itl = m.get("inputTokenLimit")
                        if itl:
                            entry["context_window"] = itl
                        models.append(entry)
                else:
                    for m in data.get("data", []):
                        entry = {
                            "id": m.get("id", ""),
                            "name": m.get("name", m.get("id", "")),
                            "owned_by": m.get("owned_by", m.get("created_by", "")),
                        }
                        # OpenRouter returns context_length; others may use context_window
                        cw = m.get("context_length") or m.get("context_window") or m.get("max_model_len")
                        if cw:
                            entry["context_window"] = cw
                        models.append(entry)
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

    # Load agent-specific fallbacks from PostgreSQL
    async with async_session() as session:
        result = await session.execute(select(AgentFallback))
        agent_fb_rows = result.scalars().all()
    agent_fb_map = {row.agent_id: row.fallbacks for row in agent_fb_rows}

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
async def update_fallbacks(body: dict, user=Depends(require_role("superadmin", "admin"))):
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
    return {"status": "ok", "restart_needed": True}


@api_router.put("/models/fallbacks/agent/{agent_id}")
async def update_agent_fallbacks(agent_id: str, body: dict, user=Depends(require_role("superadmin", "admin"))):
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

    # Store agent-specific fallbacks in PostgreSQL (not in openclaw.json)
    if "fallbacks" in body:
        fallbacks = body["fallbacks"]
        async with async_session() as session:
            existing = (await session.execute(
                select(AgentFallback).where(AgentFallback.agent_id == agent_id)
            )).scalar_one_or_none()
            if fallbacks:
                if existing:
                    existing.fallbacks = fallbacks
                else:
                    session.add(AgentFallback(agent_id=agent_id, fallbacks=fallbacks))
            else:
                if existing:
                    await session.delete(existing)
            await session.commit()

    await log_activity("update", "fallbacks", agent_id, f"Updated fallbacks for agent {agent_id}")
    return {"status": "ok", "restart_needed": need_config_write}


# ===== CHANNELS (from health probe + config) =====
@api_router.get("/channels")
async def list_channels(user=Depends(get_current_user)):
    health = await gateway.health()
    channels = health.get("channels", {})
    config = await gateway.config_read()
    config_channels = config.get("channels", {})
    result = []
    for ch_type, ch_data in channels.items():
        probe = ch_data.get("probe", {})
        bot = probe.get("bot", {})
        ch_config = config_channels.get(ch_type, {})
        result.append({
            "id": ch_type,
            "channel_type": ch_type,
            "display_name": ch_type.title(),
            "enabled": ch_data.get("configured", False),
            "status": "connected" if probe.get("ok") else "off",
            "dm_policy": ch_config.get("dmPolicy", "open"),
            "group_policy": ch_config.get("groupPolicy", "mention"),
            "allow_from": ch_config.get("allowFrom", []),
            "streaming": ch_config.get("streaming", "off"),
            "group_allow_from": ch_config.get("groupAllowFrom", []),
            "bot_username": bot.get("username") or bot.get("displayName", ""),
        })
    return result


CHANNEL_FIELDS = {"dmPolicy", "groupPolicy", "allowFrom", "streaming", "groupAllowFrom"}


@api_router.put("/channels/{channel_id}")
async def update_channel(channel_id: str, body: dict, user=Depends(require_role("superadmin", "admin"))):
    config = await gateway.config_read()
    if "channels" not in config:
        config["channels"] = {}
    if channel_id not in config["channels"]:
        raise HTTPException(404, f"Channel '{channel_id}' not found in config")
    ch = config["channels"][channel_id]
    for key in CHANNEL_FIELDS:
        if key in body:
            ch[key] = body[key]
    await gateway.config_write(config)
    gateway.cache.invalidate("health")
    await log_activity("update", "channel", channel_id, f"Updated channel {channel_id}")
    return {"status": "ok", "restart_needed": True}


# ===== SESSIONS (from CLI) =====
@api_router.get("/sessions")
async def list_sessions(limit: int = Query(50, le=200), user=Depends(get_current_user)):
    raw, cfg = await asyncio.gather(gateway.sessions(), gateway.config_read())
    sessions = raw.get("sessions", [])[:limit]
    fallback_keys = {f["key"] for f in _detect_fallback_sessions(raw, cfg)}

    # Resolve expected model per agent for primary_model field
    primary = cfg.get("agents", {}).get("defaults", {}).get("model", {}).get("primary", "")
    agent_overrides = {
        a["id"]: _model_str(a["model"])
        for a in cfg.get("agents", {}).get("list", [])
        if a.get("model") and _model_str(a["model"])
    }

    # Extract platform IDs from session keys to resolve display names
    # Key format: agent:<agent>:<channel>:<kind>:<id>
    direct_ids = {}  # pid -> platform
    group_ids = {}   # pid -> platform
    for s in sessions:
        key = s.get("key", "")
        parts = key.split(":")
        if len(parts) >= 5:
            platform = parts[2]
            kind = parts[3]
            pid = parts[-1]
            if kind == "direct":
                direct_ids[pid] = platform
            elif kind == "group":
                group_ids[pid] = platform

    # Resolve display names: DB → disk → platform API → cache to DB
    from services.profile_resolver import resolve_display_names
    user_names, group_names = await resolve_display_names(
        direct_ids, group_ids, cfg
    )

    result = []
    for s in sessions:
        key = s.get("key", "")
        agent = key.split(":")[1] if ":" in key else "main"
        expected = agent_overrides.get(agent, primary)
        parts = key.split(":")
        kind = parts[3] if len(parts) >= 4 else s.get("kind", "direct")
        pid = parts[-1] if len(parts) >= 5 else ""
        display_name = ""
        if kind == "direct":
            display_name = user_names.get(pid.lower(), "")
        elif kind == "group":
            display_name = group_names.get(pid.lower(), "")
        result.append({
            "id": s.get("sessionId", s.get("key")),
            "session_key": key,
            "kind": s.get("kind", "direct"),
            "agent": agent,
            "channel": key.split(":")[2] if key.count(":") >= 2 else "",
            "model": s.get("model", ""),
            "is_fallback": key in fallback_keys,
            "primary_model": expected,
            "total_tokens": s.get("totalTokens", 0),
            "context_tokens": s.get("contextTokens", 0),
            "updated_at": s.get("updatedAt"),
            "age_ms": s.get("ageMs", 0),
            "message_count": (s.get("inputTokens", 0) + s.get("outputTokens", 0)) // 100,
            "display_name": display_name,
        })
    return result


# ===== USAGE ANALYTICS =====
@api_router.get("/usage/cost")
async def get_usage_cost(
    days: int = Query(None, ge=1, le=90),
    start: str = Query(None),
    end: str = Query(None),
    user=Depends(get_current_user),
):
    # Determine date range
    if start and end:
        date_start, date_end = start, end
    else:
        d = days or 30
        date_end = utcnow().strftime("%Y-%m-%d")
        date_start = (utcnow() - timedelta(days=d - 1)).strftime("%Y-%m-%d")

    # Read from PostgreSQL
    start_date = dt.date.fromisoformat(date_start)
    end_date = dt.date.fromisoformat(date_end)
    async with async_session() as session:
        result = await session.execute(
            select(DailyUsage)
            .where(DailyUsage.date >= start_date, DailyUsage.date <= end_date)
            .order_by(DailyUsage.date)
        )
        rows = result.scalars().all()

    if rows:
        records = []
        for r in rows:
            rec = {
                "date": r.date.isoformat(),
                "totalTokens": r.total_tokens,
                "totalCost": r.total_cost,
            }
            if r.cost_breakdown:
                rec.update(r.cost_breakdown)
            records.append(rec)
        totals = {
            "totalTokens": sum(r.total_tokens for r in rows),
            "totalCost": sum(r.total_cost for r in rows),
        }
        return {"daily": records, "totals": totals}

    # Fallback to CLI if PostgreSQL is empty
    if not start:
        try:
            return await gateway.usage_cost(days or 30)
        except Exception:
            pass

    return {"daily": [], "totals": {"totalTokens": 0, "totalCost": 0}}


@api_router.get("/usage/breakdown")
async def get_usage_breakdown(
    days: int = Query(None, ge=1, le=90),
    start: str = Query(None),
    end: str = Query(None),
    user=Depends(get_current_user),
):
    # Build base filter
    base_filter = [AgentActivity.event_type == "llm_request"]
    if start and end:
        base_filter.append(AgentActivity.timestamp >= start)
        base_filter.append(AgentActivity.timestamp <= end)
    else:
        d = days or 30
        cutoff = utcnow() - timedelta(days=d)
        base_filter.append(AgentActivity.timestamp >= cutoff)

    async with async_session() as session:
        # By agent
        q_agent = (
            select(
                AgentActivity.agent_name.label("_id"),
                func.coalesce(func.sum(AgentActivity.tokens_in), 0).label("tokens_in"),
                func.coalesce(func.sum(AgentActivity.tokens_out), 0).label("tokens_out"),
                func.count().label("count"),
            )
            .where(*base_filter)
            .group_by(AgentActivity.agent_name)
            .order_by(desc(func.coalesce(func.sum(AgentActivity.tokens_out), 0)))
            .limit(20)
        )
        by_agent = [dict(r._mapping) for r in (await session.execute(q_agent)).all()]

        # By model
        q_model = (
            select(
                AgentActivity.model_used.label("_id"),
                func.coalesce(func.sum(AgentActivity.tokens_in), 0).label("tokens_in"),
                func.coalesce(func.sum(AgentActivity.tokens_out), 0).label("tokens_out"),
                func.count().label("count"),
                func.avg(AgentActivity.duration_ms).label("avg_ms"),
            )
            .where(*base_filter)
            .group_by(AgentActivity.model_used)
            .order_by(desc(func.coalesce(func.sum(AgentActivity.tokens_out), 0)))
            .limit(20)
        )
        by_model = [dict(r._mapping) for r in (await session.execute(q_model)).all()]

        # By channel
        q_channel = (
            select(
                AgentActivity.channel.label("_id"),
                func.coalesce(func.sum(AgentActivity.tokens_in), 0).label("tokens_in"),
                func.coalesce(func.sum(AgentActivity.tokens_out), 0).label("tokens_out"),
                func.count().label("count"),
            )
            .where(*base_filter)
            .group_by(AgentActivity.channel)
            .order_by(desc(func.coalesce(func.sum(AgentActivity.tokens_out), 0)))
            .limit(20)
        )
        by_channel = [dict(r._mapping) for r in (await session.execute(q_channel)).all()]

    return {"by_agent": by_agent, "by_model": by_model, "by_channel": by_channel}


# ===== CRON JOBS (from CLI) =====
@api_router.get("/cron")
async def list_cron_jobs(user=Depends(get_current_user)):
    import json as _json
    # Read jobs.json directly — CLI only returns enabled jobs, file has all
    jobs_path = Path.home() / ".openclaw" / "cron" / "jobs.json"
    try:
        raw = _json.loads(jobs_path.read_text())
    except Exception:
        return []
    return [
        {
            "id": j["id"],
            "name": j.get("name", ""),
            "schedule": j.get("schedule", {}).get("expr", "")
                        or (f"every {j.get('schedule', {}).get('everyMs', 0) // 1000}s"
                            if j.get("schedule", {}).get("kind") == "every" else ""),
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
async def update_config(body: dict, user=Depends(require_role("superadmin", "admin"))):
    try:
        new_config = json.loads(body.get("raw", "{}"))
        await gateway.config_write(new_config)
        return {"status": "ok", "restart_needed": True}
    except Exception as e:
        raise HTTPException(400, str(e))


@api_router.post("/config/validate")
async def validate_config(body: dict, user=Depends(require_role("superadmin", "admin"))):
    try:
        json.loads(body.get("raw", "{}"))
        return {"valid": True, "errors": [], "warnings": []}
    except json.JSONDecodeError as e:
        return {"valid": False, "errors": [str(e)], "warnings": []}


# ===== GATEWAY STATUS =====
def _check_restart_needed(health: dict) -> bool:
    """Compare config file mtime against gateway start time."""
    try:
        from gateway_cli import OPENCLAW_CONFIG
        mtime = OPENCLAW_CONFIG.stat().st_mtime
        duration_ms = health.get("durationMs", 0)
        if not duration_ms:
            return False
        import time
        gateway_start = time.time() - (duration_ms / 1000)
        return mtime > gateway_start
    except Exception:
        return False


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
        "restart_needed": _check_restart_needed(health),
    }


@api_router.post("/gateway/restart")
async def gateway_restart_endpoint(user=Depends(require_role("superadmin"))):
    await gateway.gateway_restart()
    await log_activity("restart", "gateway", "", "Gateway restart requested")
    return {"status": "restart_initiated", "message": "Gateway restart signal sent", "restart_needed": False}


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


# ===== BINDINGS (agent-group routing in openclaw.json) =====
@api_router.get("/bindings")
async def get_bindings(user=Depends(get_current_user)):
    config = await gateway.config_read()
    bindings = config.get("bindings", [])

    # Resolve group names from DB
    # DB stores as "line_C0e9b8fa..." but bindings use just "C0e9b8fa..."
    group_names = {}
    async with async_session() as session:
        from models.bot_group import BotGroup
        result = await session.execute(select(BotGroup))
        for g in result.scalars().all():
            group_names[g.platform_group_id] = g.name
            # Also map without platform prefix (e.g. "line_Cxxx" → map "Cxxx" too)
            if "_" in g.platform_group_id:
                short_id = g.platform_group_id.split("_", 1)[1]
                group_names[short_id] = g.name

    # Also build agents list for display
    agents_list = config.get("agents", {}).get("list", [])
    agent_names = {}
    for a in agents_list:
        aid = a.get("id", "")
        identity = a.get("identity", {})
        agent_names[aid] = identity.get("name", aid)

    results = []
    for i, b in enumerate(bindings):
        match = b.get("match", {})
        peer = match.get("peer", {})
        raw_id = peer.get("id", "")
        # bindings use "group:C0e9b8fa..." format, strip prefix
        group_id = raw_id.replace("group:", "") if raw_id.startswith("group:") else raw_id
        agent_id = b.get("agentId", "main")
        results.append({
            "id": str(i),
            "agent_id": agent_id,
            "agent_name": agent_names.get(agent_id, agent_id),
            "channel": match.get("channel", ""),
            "group_id": group_id,
            "group_name": group_names.get(group_id, group_id[:12] + "..."),
        })
    return results


@api_router.get("/bindings/options")
async def get_binding_options(user=Depends(get_current_user)):
    """Return available groups and agents for binding dropdowns."""
    config = await gateway.config_read()
    agents_list = config.get("agents", {}).get("list", [])
    agents = []
    for a in agents_list:
        aid = a.get("id", "")
        identity = a.get("identity", {})
        agents.append({"id": aid, "name": identity.get("name", aid), "emoji": identity.get("emoji", "")})

    async with async_session() as session:
        from models.bot_group import BotGroup
        result = await session.execute(select(BotGroup))
        groups = [
            {
                "id": g.platform_group_id.split("_", 1)[1] if "_" in g.platform_group_id else g.platform_group_id,
                "name": g.name or g.platform_group_id,
                "platform": g.platform,
            }
            for g in result.scalars().all()
        ]
    return {"agents": agents, "groups": groups}


@api_router.post("/bindings")
async def create_binding(body: dict = Body(...), user=Depends(require_role("superadmin", "admin"))):
    agent_id = body.get("agent_id", "").strip()
    group_id = body.get("group_id", "").strip()
    channel = body.get("channel", "line").strip()
    if not agent_id or not group_id:
        raise HTTPException(400, "agent_id and group_id are required")

    config = await gateway.config_read()
    if "bindings" not in config:
        config["bindings"] = []
    config["bindings"].append({
        "agentId": agent_id,
        "match": {
            "channel": channel,
            "peer": {"kind": "group", "id": f"group:{group_id}"}
        }
    })
    await gateway.config_write(config)
    await log_activity("create", "binding", group_id, f"Bound group {group_id} to agent {agent_id}")
    return {"status": "ok", "restart_needed": True}


@api_router.put("/bindings/{binding_id}")
async def update_binding(binding_id: str, body: dict = Body(...), user=Depends(require_role("superadmin", "admin"))):
    try:
        idx = int(binding_id)
    except ValueError:
        raise HTTPException(400, "Invalid binding ID")
    config = await gateway.config_read()
    bindings = config.get("bindings", [])
    if idx < 0 or idx >= len(bindings):
        raise HTTPException(404, "Binding not found")

    agent_id = body.get("agent_id", "").strip()
    group_id = body.get("group_id", "").strip()
    channel = body.get("channel", "line").strip()
    if not agent_id or not group_id:
        raise HTTPException(400, "agent_id and group_id are required")

    bindings[idx] = {
        "agentId": agent_id,
        "match": {
            "channel": channel,
            "peer": {"kind": "group", "id": f"group:{group_id}"}
        }
    }
    await gateway.config_write(config)
    await log_activity("update", "binding", group_id, f"Updated binding: group {group_id} → agent {agent_id}")
    return {"status": "ok", "restart_needed": True}


@api_router.delete("/bindings/{binding_id}")
async def delete_binding(binding_id: str, user=Depends(require_role("superadmin", "admin"))):
    try:
        idx = int(binding_id)
    except ValueError:
        raise HTTPException(400, "Invalid binding ID")
    config = await gateway.config_read()
    bindings = config.get("bindings", [])
    if idx < 0 or idx >= len(bindings):
        raise HTTPException(404, "Binding not found")

    removed = bindings.pop(idx)
    await gateway.config_write(config)
    gid = removed.get("match", {}).get("peer", {}).get("id", "")
    await log_activity("delete", "binding", gid, f"Removed binding for {gid}")
    return {"status": "ok", "restart_needed": True}


# ===== ACTIVITY LOGS =====
@api_router.get("/logs")
async def get_logs(limit: int = Query(50, le=500), user=Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(ActivityLog).order_by(desc(ActivityLog.timestamp)).limit(limit)
        )
        logs = result.scalars().all()
    return [
        {
            "id": str(l.id),
            "action": l.action,
            "entity_type": l.entity_type,
            "entity_id": l.entity_id,
            "details": l.details,
            "timestamp": l.timestamp.isoformat() if l.timestamp else None,
        }
        for l in logs
    ]


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
    filters = []
    if level:
        filters.append(SystemLog.level == level)
    if source:
        filters.append(SystemLog.source == source)
    if search:
        escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        filters.append(SystemLog.message.ilike(f"%{escaped}%", escape="\\"))
    if since_id:
        async with async_session() as session:
            ref = (await session.execute(
                select(SystemLog).where(SystemLog.id == uuid.UUID(since_id))
            )).scalar_one_or_none()
            if ref:
                filters.append(SystemLog.timestamp > ref.timestamp)

    async with async_session() as session:
        result = await session.execute(
            select(SystemLog).where(*filters).order_by(desc(SystemLog.timestamp)).limit(limit)
        )
        logs = result.scalars().all()
    return [
        {
            "id": str(l.id),
            "timestamp": l.timestamp.isoformat() if l.timestamp else None,
            "level": l.level,
            "source": l.source,
            "message": l.message,
            "raw": l.raw,
        }
        for l in logs
    ]


@api_router.get("/system-logs/stats")
async def system_logs_stats(user=Depends(get_current_user)):
    async with async_session() as session:
        total = (await session.execute(select(func.count()).select_from(SystemLog))).scalar() or 0
        errors = (await session.execute(
            select(func.count()).select_from(SystemLog).where(SystemLog.level == "ERROR")
        )).scalar() or 0
        warns = (await session.execute(
            select(func.count()).select_from(SystemLog).where(SystemLog.level == "WARN")
        )).scalar() or 0

        by_source_result = await session.execute(
            select(SystemLog.source.label("_id"), func.count().label("count"))
            .group_by(SystemLog.source)
            .order_by(desc(func.count()))
            .limit(20)
        )
        by_source = [dict(r._mapping) for r in by_source_result.all()]

        by_level_result = await session.execute(
            select(SystemLog.level.label("_id"), func.count().label("count"))
            .group_by(SystemLog.level)
            .order_by(desc(func.count()))
            .limit(10)
        )
        by_level = [dict(r._mapping) for r in by_level_result.all()]

    return {"total": total, "errors": errors, "warnings": warns, "by_source": by_source, "by_level": by_level}


# ===== AGENT ACTIVITIES (from DB, populated by WebSocket) =====
def _activity_to_dict(a: AgentActivity) -> dict:
    return {
        "id": str(a.id),
        "agent_id": a.agent_id,
        "agent_name": a.agent_name,
        "event_type": a.event_type,
        "tool_name": a.tool_name or "",
        "status": a.status,
        "duration_ms": a.duration_ms or 0,
        "tokens_in": a.tokens_in or 0,
        "tokens_out": a.tokens_out or 0,
        "channel": a.channel or "",
        "model_used": a.model_used or "",
        "message": a.message,
        "timestamp": a.timestamp.isoformat() if a.timestamp else None,
    }


@api_router.get("/activities")
async def list_activities(
    agent_id: str = Query("", max_length=100),
    event_type: str = Query("", max_length=50),
    status: str = Query("", max_length=20),
    limit: int = Query(100, le=500),
    since_id: str = Query("", max_length=100),
    user=Depends(get_current_user),
):
    filters = []
    if agent_id:
        filters.append(AgentActivity.agent_id == agent_id)
    if event_type:
        filters.append(AgentActivity.event_type == event_type)
    if status:
        filters.append(AgentActivity.status == status)
    if since_id:
        async with async_session() as session:
            ref = (await session.execute(
                select(AgentActivity).where(AgentActivity.id == uuid.UUID(since_id))
            )).scalar_one_or_none()
            if ref:
                filters.append(AgentActivity.timestamp > ref.timestamp)

    async with async_session() as session:
        result = await session.execute(
            select(AgentActivity).where(*filters).order_by(desc(AgentActivity.timestamp)).limit(limit)
        )
        activities = result.scalars().all()
    return [_activity_to_dict(a) for a in activities]


@api_router.get("/activities/stats")
async def activities_stats(user=Depends(get_current_user)):
    async with async_session() as session:
        # By agent: count + errors
        q_agent = (
            select(
                AgentActivity.agent_name.label("_id"),
                func.count().label("count"),
                func.sum(case((AgentActivity.status == "error", 1), else_=0)).label("errors"),
            )
            .group_by(AgentActivity.agent_name)
            .order_by(desc(func.count()))
            .limit(50)
        )
        agent_stats = [dict(r._mapping) for r in (await session.execute(q_agent)).all()]

        # By tool
        q_tools = (
            select(
                AgentActivity.tool_name.label("_id"),
                func.count().label("count"),
                func.avg(AgentActivity.duration_ms).label("avg_ms"),
            )
            .where(AgentActivity.event_type == "tool_call")
            .group_by(AgentActivity.tool_name)
            .order_by(desc(func.count()))
            .limit(15)
        )
        tool_stats = [dict(r._mapping) for r in (await session.execute(q_tools)).all()]

        # By type
        q_types = (
            select(
                AgentActivity.event_type.label("_id"),
                func.count().label("count"),
            )
            .group_by(AgentActivity.event_type)
            .order_by(desc(func.count()))
            .limit(20)
        )
        type_stats = [dict(r._mapping) for r in (await session.execute(q_types)).all()]

        total = (await session.execute(select(func.count()).select_from(AgentActivity))).scalar() or 0
        running = (await session.execute(
            select(func.count()).select_from(AgentActivity).where(AgentActivity.status == "running")
        )).scalar() or 0
        errors = (await session.execute(
            select(func.count()).select_from(AgentActivity).where(AgentActivity.status == "error")
        )).scalar() or 0

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
    async with async_session() as session:
        act = (await session.execute(
            select(AgentActivity).where(AgentActivity.id == uuid.UUID(activity_id))
        )).scalar_one_or_none()
    if not act:
        raise HTTPException(404, "Activity not found")
    return _activity_to_dict(act)


# ===== CLAWHUB MARKETPLACE =====
def _clawhub_to_dict(s: ClawHubSkill) -> dict:
    return {
        "id": s.id,
        "slug": s.slug,
        "name": s.name,
        "description": s.description,
        "category": s.category,
        "tags": s.tags or [],
        "downloads": s.downloads,
        "version": s.version,
        "installed": s.installed,
        "installed_version": s.installed_version,
    }


@api_router.get("/clawhub")
async def list_clawhub_skills(search: str = Query("", max_length=100), category: str = Query("all"), user=Depends(get_current_user)):
    filters = []
    if search:
        pattern = f"%{search}%"
        filters.append(or_(
            ClawHubSkill.name.ilike(pattern),
            ClawHubSkill.slug.ilike(pattern),
            ClawHubSkill.description.ilike(pattern),
        ))
    if category != "all":
        filters.append(ClawHubSkill.category == category)

    async with async_session() as session:
        result = await session.execute(
            select(ClawHubSkill).where(*filters).order_by(desc(ClawHubSkill.downloads)).limit(200)
        )
        skills = result.scalars().all()
    return [_clawhub_to_dict(s) for s in skills]


@api_router.post("/clawhub/install/{skill_id}")
async def install_clawhub_skill(skill_id: str, body: dict = None, user=Depends(require_role("superadmin", "admin"))):
    async with async_session() as session:
        skill = await session.get(ClawHubSkill, skill_id)
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
        skill.installed = True
        skill.installed_version = skill.version
        await session.commit()
    await log_activity("install", "clawhub", skill_id, f"Installed skill: {skill.slug}")
    return {"status": "installed", "slug": skill.slug}


@api_router.post("/clawhub/uninstall/{skill_id}")
async def uninstall_clawhub_skill(skill_id: str, user=Depends(require_role("superadmin", "admin"))):
    async with async_session() as session:
        skill = await session.get(ClawHubSkill, skill_id)
        if not skill:
            raise HTTPException(404, "Skill not found")
        skill.installed = False
        skill.installed_version = ""
        await session.commit()
    await log_activity("uninstall", "clawhub", skill_id, f"Uninstalled skill: {skill.slug}")
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
    boot_time_iso = datetime.fromtimestamp(boot_time_ts).isoformat()

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
                        "timestamp": utcnow().isoformat(),
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
        async with async_session() as session:
            result = await session.execute(
                select(AgentActivity).order_by(desc(AgentActivity.timestamp)).limit(100)
            )
            recent_rows = result.scalars().all()
        recent = [_activity_to_dict(a) for a in recent_rows]
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
                        async with async_session() as sess:
                            sess.add(AgentActivity(
                                id=uuid.UUID(activity["id"]),
                                agent_id=activity["agent_id"],
                                agent_name=activity["agent_name"],
                                event_type=activity["event_type"],
                                tool_name=activity["tool_name"] or None,
                                status=activity["status"],
                                duration_ms=activity["duration_ms"] or None,
                                channel=activity["channel"] or None,
                                message=activity["message"],
                            ))
                            await sess.commit()
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


cors_origins = os.environ.get('CORS_ORIGINS', '')
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origins=[o.strip() for o in cors_origins.split(',')],
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    # No explicit origins — reflect any requesting origin (safe behind reverse proxy)
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origin_regex=r".*",
        allow_methods=["*"],
        allow_headers=["*"],
    )

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    await engine.dispose()
