from fastapi import FastAPI, APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
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

from backend.gateway_cli import gateway

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")


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


# ===== AGENTS (read-only from CLI) =====
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
            "status": "active",
            "sandbox_mode": "off",
            "identity_emoji": a.get("identityEmoji", ""),
        }
        for a in raw
    ]


@api_router.get("/agents/{agent_id}")
async def get_agent(agent_id: str):
    raw = await gateway.agents()
    for a in raw:
        if a.get("id") == agent_id:
            return {
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
    raise HTTPException(404, "Agent not found")


# ===== SKILLS (read-only from CLI) =====
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


@api_router.get("/skills/{skill_id}")
async def get_skill(skill_id: str):
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


# ===== MODEL PROVIDERS (from config) =====
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


# ===== CHANNELS (from health probe) =====
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


# ===== SESSIONS (from CLI) =====
@api_router.get("/sessions")
async def list_sessions(limit: int = Query(50, le=200)):
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
async def list_cron_jobs():
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


# ===== GATEWAY STATUS =====
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


@api_router.post("/gateway/restart")
async def gateway_restart_endpoint():
    await gateway.gateway_restart()
    await log_activity("restart", "gateway", "", "Gateway restart requested")
    return {"status": "restart_initiated", "message": "Gateway restart signal sent"}


# ===== HOOKS (from config) =====
@api_router.get("/hooks/config")
async def get_hooks_config():
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


# ===== ACTIVITY LOGS =====
@api_router.get("/logs")
async def get_logs(limit: int = Query(50, le=500)):
    return await db.activity_logs.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)


# ===== SYSTEM LOGS (from DB, populated by WebSocket) =====
@api_router.get("/system-logs")
async def list_system_logs(
    level: str = Query("", max_length=20),
    source: str = Query("", max_length=50),
    search: str = Query("", max_length=200),
    limit: int = Query(200, le=1000),
    since_id: str = Query("", max_length=100),
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
async def system_logs_stats():
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
async def activities_stats():
    pipeline_agent = [
        {"$group": {"_id": "$agent_id", "count": {"$sum": 1}, "errors": {"$sum": {"$cond": [{"$eq": ["$status", "error"]}, 1, 0]}}}},
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
async def get_activity(activity_id: str):
    act = await db.agent_activities.find_one({"id": activity_id}, {"_id": 0})
    if not act:
        raise HTTPException(404, "Activity not found")
    return act


# ===== CLAWHUB MARKETPLACE (kept with MongoDB) =====
@api_router.get("/clawhub")
async def list_clawhub_skills(search: str = Query("", max_length=100), category: str = Query("all")):
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
async def install_clawhub_skill(skill_id: str):
    skill = await db.clawhub_skills.find_one({"id": skill_id}, {"_id": 0})
    if not skill:
        raise HTTPException(404, "Skill not found")
    await db.clawhub_skills.update_one({"id": skill_id}, {"$set": {"installed": True, "installed_version": skill["version"]}})
    await log_activity("install", "clawhub", skill_id, f"Installed skill: {skill['slug']}")
    return {"status": "installed", "slug": skill["slug"]}


@api_router.post("/clawhub/uninstall/{skill_id}")
async def uninstall_clawhub_skill(skill_id: str):
    skill = await db.clawhub_skills.find_one({"id": skill_id}, {"_id": 0})
    if not skill:
        raise HTTPException(404, "Skill not found")
    await db.clawhub_skills.update_one({"id": skill_id}, {"$set": {"installed": False, "installed_version": ""}})
    await log_activity("uninstall", "clawhub", skill_id, f"Uninstalled skill: {skill['slug']}")
    return {"status": "uninstalled"}


app.include_router(api_router)


# ===== WEBSOCKET: REAL LOG STREAMING =====
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


# ===== WEBSOCKET: REAL ACTIVITY STREAMING =====
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
