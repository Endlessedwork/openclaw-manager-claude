from fastapi import FastAPI, APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any, Set
import uuid
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ===== MODELS =====

class AgentBase(BaseModel):
    name: str
    description: str = ""
    workspace: str = "~/.openclaw/workspace"
    model_primary: str = "anthropic/claude-sonnet-4-5"
    model_fallbacks: List[str] = []
    tools_profile: str = "full"
    tools_allow: List[str] = []
    tools_deny: List[str] = []
    is_default: bool = False
    soul_md: str = ""
    agents_md: str = ""
    identity_md: str = ""
    status: str = "active"
    heartbeat_every: str = "30m"
    heartbeat_target: str = "last"
    sandbox_mode: str = "off"
    subagents: List[str] = []
    group_mention_patterns: List[str] = []

class Agent(AgentBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class SkillBase(BaseModel):
    name: str
    description: str = ""
    location: str = "bundled"
    enabled: bool = True
    api_key: str = ""
    env_vars: Dict[str, str] = {}
    config: Dict[str, Any] = {}
    requires_bins: List[str] = []
    requires_env: List[str] = []
    requires_config: List[str] = []
    primary_env: str = ""
    homepage: str = ""
    user_invocable: bool = True
    command_dispatch: str = ""

class Skill(SkillBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ToolConfigBase(BaseModel):
    tool_name: str
    description: str = ""
    category: str = "core"
    enabled: bool = True
    agent_id: str = ""
    allow: List[str] = []
    deny: List[str] = []
    profile: str = "full"
    settings: Dict[str, Any] = {}

class ToolConfig(ToolConfigBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ModelProviderBase(BaseModel):
    provider_name: str
    display_name: str = ""
    api_key: str = ""
    base_url: str = ""
    models: List[Dict[str, Any]] = []
    enabled: bool = True
    is_primary: bool = False
    settings: Dict[str, Any] = {}

class ModelProvider(ModelProviderBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ChannelBase(BaseModel):
    channel_type: str
    display_name: str = ""
    enabled: bool = False
    dm_policy: str = "pairing"
    allow_from: List[str] = []
    group_policy: str = "mention"
    group_allow_from: List[str] = []
    settings: Dict[str, Any] = {}
    status: str = "disconnected"

class Channel(ChannelBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class SessionBase(BaseModel):
    session_key: str
    agent_id: str = "main"
    channel: str = ""
    peer: str = ""
    status: str = "active"
    message_count: int = 0
    last_message_at: str = ""
    metadata: Dict[str, Any] = {}

class Session(SessionBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class CronJobBase(BaseModel):
    name: str
    schedule: str
    agent_id: str = "main"
    task: str = ""
    enabled: bool = True
    max_concurrent: int = 1
    timeout_seconds: int = 300
    last_run: str = ""
    next_run: str = ""
    run_count: int = 0
    status: str = "idle"

class CronJob(CronJobBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class GatewayConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "gateway_config"
    raw_config: str = "{}"
    port: int = 18789
    bind_host: str = "127.0.0.1"
    auth_token: str = ""
    reload_mode: str = "hybrid"
    tls_enabled: bool = False
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ActivityLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    action: str
    entity_type: str
    entity_id: str = ""
    details: str = ""
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# ===== CLAWHUB MODELS =====
class ClawHubSkillBase(BaseModel):
    slug: str
    name: str
    description: str = ""
    author: str = ""
    version: str = "1.0.0"
    tags: List[str] = []
    downloads: int = 0
    stars: int = 0
    homepage: str = ""
    installed: bool = False
    installed_version: str = ""
    skill_md: str = ""
    requires_env: List[str] = []
    requires_bins: List[str] = []
    category: str = "general"

class ClawHubSkill(ClawHubSkillBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# ===== HOOKS MODELS =====
class HookMappingBase(BaseModel):
    name: str
    path: str
    action: str = "agent"
    agent_id: str = "main"
    session_key: str = ""
    message_template: str = ""
    wake_mode: str = "now"
    deliver: bool = False
    channel: str = "last"
    model: str = ""
    enabled: bool = True

class HookMapping(HookMappingBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class HooksConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "hooks_config"
    enabled: bool = True
    token: str = ""
    path: str = "/hooks"
    max_body_bytes: int = 262144
    default_session_key: str = "hook:ingress"
    presets: List[str] = []
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# ===== SESSION MESSAGES =====
class SessionMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    role: str = "user"
    content: str = ""
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    metadata: Dict[str, Any] = {}

# ===== AGENT ACTIVITIES =====
class AgentActivityBase(BaseModel):
    agent_id: str = "main"
    agent_name: str = ""
    event_type: str = "tool_call"
    tool_name: str = ""
    tool_input: str = ""
    tool_output: str = ""
    verbose: str = ""
    status: str = "running"
    duration_ms: int = 0
    session_key: str = ""
    channel: str = ""
    peer: str = ""
    model_used: str = ""
    tokens_in: int = 0
    tokens_out: int = 0
    error: str = ""

class AgentActivity(AgentActivityBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# ===== HELPER =====
async def log_activity(action: str, entity_type: str, entity_id: str = "", details: str = ""):
    log = ActivityLog(action=action, entity_type=entity_type, entity_id=entity_id, details=details)
    await db.activity_logs.insert_one(log.model_dump())

# ===== DASHBOARD =====
@api_router.get("/dashboard")
async def get_dashboard():
    agents_count = await db.agents.count_documents({})
    skills_count = await db.skills.count_documents({})
    active_skills = await db.skills.count_documents({"enabled": True})
    channels_count = await db.channels.count_documents({})
    active_channels = await db.channels.count_documents({"enabled": True})
    sessions_count = await db.sessions.count_documents({})
    cron_count = await db.cron_jobs.count_documents({})
    providers_count = await db.model_providers.count_documents({})
    logs = await db.activity_logs.find({}, {"_id": 0}).sort("timestamp", -1).limit(10).to_list(10)
    return {
        "agents": agents_count,
        "skills": {"total": skills_count, "active": active_skills},
        "channels": {"total": channels_count, "active": active_channels},
        "sessions": sessions_count,
        "cron_jobs": cron_count,
        "model_providers": providers_count,
        "gateway_status": "running",
        "recent_activity": logs
    }

# ===== AGENTS CRUD =====
@api_router.get("/agents", response_model=List[Agent])
async def list_agents():
    return await db.agents.find({}, {"_id": 0}).to_list(100)

@api_router.get("/agents/{agent_id}", response_model=Agent)
async def get_agent(agent_id: str):
    agent = await db.agents.find_one({"id": agent_id}, {"_id": 0})
    if not agent:
        raise HTTPException(404, "Agent not found")
    return agent

@api_router.post("/agents", response_model=Agent)
async def create_agent(data: AgentBase):
    agent = Agent(**data.model_dump())
    await db.agents.insert_one(agent.model_dump())
    await log_activity("create", "agent", agent.id, f"Created agent: {agent.name}")
    return agent

@api_router.put("/agents/{agent_id}", response_model=Agent)
async def update_agent(agent_id: str, data: AgentBase):
    existing = await db.agents.find_one({"id": agent_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Agent not found")
    update = data.model_dump()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.agents.update_one({"id": agent_id}, {"$set": update})
    await log_activity("update", "agent", agent_id, f"Updated agent: {data.name}")
    updated = await db.agents.find_one({"id": agent_id}, {"_id": 0})
    return updated

@api_router.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str):
    result = await db.agents.delete_one({"id": agent_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Agent not found")
    await log_activity("delete", "agent", agent_id, "Deleted agent")
    return {"status": "deleted"}

# ===== SKILLS CRUD =====
@api_router.get("/skills", response_model=List[Skill])
async def list_skills():
    return await db.skills.find({}, {"_id": 0}).to_list(200)

@api_router.get("/skills/{skill_id}", response_model=Skill)
async def get_skill(skill_id: str):
    skill = await db.skills.find_one({"id": skill_id}, {"_id": 0})
    if not skill:
        raise HTTPException(404, "Skill not found")
    return skill

@api_router.post("/skills", response_model=Skill)
async def create_skill(data: SkillBase):
    skill = Skill(**data.model_dump())
    await db.skills.insert_one(skill.model_dump())
    await log_activity("create", "skill", skill.id, f"Created skill: {skill.name}")
    return skill

@api_router.put("/skills/{skill_id}", response_model=Skill)
async def update_skill(skill_id: str, data: SkillBase):
    existing = await db.skills.find_one({"id": skill_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Skill not found")
    update = data.model_dump()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.skills.update_one({"id": skill_id}, {"$set": update})
    await log_activity("update", "skill", skill_id, f"Updated skill: {data.name}")
    return await db.skills.find_one({"id": skill_id}, {"_id": 0})

@api_router.delete("/skills/{skill_id}")
async def delete_skill(skill_id: str):
    result = await db.skills.delete_one({"id": skill_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Skill not found")
    await log_activity("delete", "skill", skill_id, "Deleted skill")
    return {"status": "deleted"}

# ===== TOOLS CONFIG =====
@api_router.get("/tools", response_model=List[ToolConfig])
async def list_tools():
    return await db.tools_config.find({}, {"_id": 0}).to_list(200)

@api_router.post("/tools", response_model=ToolConfig)
async def create_tool(data: ToolConfigBase):
    tool = ToolConfig(**data.model_dump())
    await db.tools_config.insert_one(tool.model_dump())
    await log_activity("create", "tool", tool.id, f"Created tool config: {tool.tool_name}")
    return tool

@api_router.put("/tools/{tool_id}", response_model=ToolConfig)
async def update_tool(tool_id: str, data: ToolConfigBase):
    existing = await db.tools_config.find_one({"id": tool_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Tool config not found")
    update = data.model_dump()
    await db.tools_config.update_one({"id": tool_id}, {"$set": update})
    return await db.tools_config.find_one({"id": tool_id}, {"_id": 0})

@api_router.delete("/tools/{tool_id}")
async def delete_tool(tool_id: str):
    result = await db.tools_config.delete_one({"id": tool_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Tool not found")
    await log_activity("delete", "tool", tool_id, "Deleted tool config")
    return {"status": "deleted"}

# ===== MODEL PROVIDERS =====
@api_router.get("/models", response_model=List[ModelProvider])
async def list_models():
    return await db.model_providers.find({}, {"_id": 0}).to_list(100)

@api_router.post("/models", response_model=ModelProvider)
async def create_model(data: ModelProviderBase):
    model = ModelProvider(**data.model_dump())
    await db.model_providers.insert_one(model.model_dump())
    await log_activity("create", "model", model.id, f"Created provider: {model.provider_name}")
    return model

@api_router.put("/models/{model_id}", response_model=ModelProvider)
async def update_model(model_id: str, data: ModelProviderBase):
    existing = await db.model_providers.find_one({"id": model_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Model provider not found")
    update = data.model_dump()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.model_providers.update_one({"id": model_id}, {"$set": update})
    return await db.model_providers.find_one({"id": model_id}, {"_id": 0})

@api_router.delete("/models/{model_id}")
async def delete_model(model_id: str):
    result = await db.model_providers.delete_one({"id": model_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Model provider not found")
    await log_activity("delete", "model", model_id, "Deleted model provider")
    return {"status": "deleted"}

# ===== CHANNELS =====
@api_router.get("/channels", response_model=List[Channel])
async def list_channels():
    return await db.channels.find({}, {"_id": 0}).to_list(100)

@api_router.post("/channels", response_model=Channel)
async def create_channel(data: ChannelBase):
    channel = Channel(**data.model_dump())
    await db.channels.insert_one(channel.model_dump())
    await log_activity("create", "channel", channel.id, f"Created channel: {channel.channel_type}")
    return channel

@api_router.put("/channels/{channel_id}", response_model=Channel)
async def update_channel(channel_id: str, data: ChannelBase):
    existing = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Channel not found")
    update = data.model_dump()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.channels.update_one({"id": channel_id}, {"$set": update})
    return await db.channels.find_one({"id": channel_id}, {"_id": 0})

@api_router.delete("/channels/{channel_id}")
async def delete_channel(channel_id: str):
    result = await db.channels.delete_one({"id": channel_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Channel not found")
    await log_activity("delete", "channel", channel_id, "Deleted channel")
    return {"status": "deleted"}

# ===== SESSIONS =====
@api_router.get("/sessions", response_model=List[Session])
async def list_sessions(limit: int = Query(50, le=200)):
    return await db.sessions.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)

@api_router.post("/sessions", response_model=Session)
async def create_session(data: SessionBase):
    session = Session(**data.model_dump())
    await db.sessions.insert_one(session.model_dump())
    return session

@api_router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    result = await db.sessions.delete_one({"id": session_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Session not found")
    return {"status": "deleted"}

# ===== CRON JOBS =====
@api_router.get("/cron", response_model=List[CronJob])
async def list_cron_jobs():
    return await db.cron_jobs.find({}, {"_id": 0}).to_list(100)

@api_router.post("/cron", response_model=CronJob)
async def create_cron_job(data: CronJobBase):
    job = CronJob(**data.model_dump())
    await db.cron_jobs.insert_one(job.model_dump())
    await log_activity("create", "cron", job.id, f"Created cron: {job.name}")
    return job

@api_router.put("/cron/{job_id}", response_model=CronJob)
async def update_cron_job(job_id: str, data: CronJobBase):
    existing = await db.cron_jobs.find_one({"id": job_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Cron job not found")
    update = data.model_dump()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.cron_jobs.update_one({"id": job_id}, {"$set": update})
    return await db.cron_jobs.find_one({"id": job_id}, {"_id": 0})

@api_router.delete("/cron/{job_id}")
async def delete_cron_job(job_id: str):
    result = await db.cron_jobs.delete_one({"id": job_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Cron job not found")
    await log_activity("delete", "cron", job_id, "Deleted cron job")
    return {"status": "deleted"}

# ===== GATEWAY CONFIG =====
@api_router.get("/config")
async def get_config():
    config = await db.gateway_config.find_one({"id": "gateway_config"}, {"_id": 0})
    if not config:
        default = GatewayConfig()
        await db.gateway_config.insert_one(default.model_dump())
        return default.model_dump()
    return config

@api_router.put("/config")
async def update_config(data: GatewayConfig):
    data.updated_at = datetime.now(timezone.utc).isoformat()
    await db.gateway_config.update_one(
        {"id": "gateway_config"},
        {"$set": data.model_dump()},
        upsert=True
    )
    await log_activity("update", "config", "gateway_config", "Updated gateway config")
    return await db.gateway_config.find_one({"id": "gateway_config"}, {"_id": 0})

# ===== GATEWAY STATUS =====
@api_router.get("/gateway/status")
async def gateway_status():
    config = await db.gateway_config.find_one({"id": "gateway_config"}, {"_id": 0})
    return {
        "status": "running",
        "port": config.get("port", 18789) if config else 18789,
        "bind_host": config.get("bind_host", "127.0.0.1") if config else "127.0.0.1",
        "uptime": "running",
        "version": "1.0.0",
        "reload_mode": config.get("reload_mode", "hybrid") if config else "hybrid"
    }

@api_router.post("/gateway/restart")
async def gateway_restart():
    await log_activity("restart", "gateway", "", "Gateway restart requested")
    return {"status": "restart_initiated", "message": "Gateway restart signal sent"}

# ===== ACTIVITY LOGS =====
@api_router.get("/logs")
async def get_logs(limit: int = Query(50, le=500)):
    return await db.activity_logs.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)

# ===== SEED DATA =====
@api_router.post("/seed")
async def seed_data():
    agents_count = await db.agents.count_documents({})
    if agents_count > 0:
        return {"status": "already_seeded"}

    # Seed default agents
    default_agents = [
        AgentBase(name="main", description="Default primary agent", workspace="~/.openclaw/workspace", model_primary="anthropic/claude-sonnet-4-5", is_default=True, status="active"),
        AgentBase(name="support", description="Customer support agent", workspace="~/.openclaw/workspace-support", model_primary="openai/gpt-5.2", tools_profile="messaging", status="active"),
        AgentBase(name="coder", description="Coding assistant agent", workspace="~/.openclaw/workspace-coder", model_primary="anthropic/claude-opus-4-6", tools_profile="coding", status="inactive"),
    ]
    for a in default_agents:
        agent = Agent(**a.model_dump())
        await db.agents.insert_one(agent.model_dump())

    # Seed skills
    default_skills = [
        SkillBase(name="web-search", description="Search the web using Brave Search API", location="bundled", enabled=True, requires_env=["BRAVE_API_KEY"], primary_env="BRAVE_API_KEY"),
        SkillBase(name="nano-banana-pro", description="Generate or edit images via Gemini 3 Pro Image", location="bundled", enabled=True, requires_env=["GEMINI_API_KEY"], primary_env="GEMINI_API_KEY"),
        SkillBase(name="summarize", description="Summarize long documents or transcripts", location="bundled", enabled=True, requires_bins=["summarize"]),
        SkillBase(name="peekaboo", description="Camera snapshot and analysis", location="bundled", enabled=True),
        SkillBase(name="voice-call", description="Voice calling with Twilio", location="managed", enabled=False, requires_env=["TWILIO_SID", "TWILIO_TOKEN"]),
        SkillBase(name="gemini-cli", description="Use Gemini CLI for coding assistance", location="workspace", enabled=True, requires_bins=["gemini"], homepage="https://github.com/google-gemini/gemini-cli"),
    ]
    for s in default_skills:
        skill = Skill(**s.model_dump())
        await db.skills.insert_one(skill.model_dump())

    # Seed tools
    default_tools = [
        ToolConfigBase(tool_name="exec", description="Run shell commands in the workspace", category="runtime"),
        ToolConfigBase(tool_name="browser", description="Control the OpenClaw-managed browser", category="ui"),
        ToolConfigBase(tool_name="canvas", description="Drive the node Canvas (present, eval, snapshot)", category="ui"),
        ToolConfigBase(tool_name="web_search", description="Search the web using Brave Search API", category="web"),
        ToolConfigBase(tool_name="web_fetch", description="Fetch and extract readable content from a URL", category="web"),
        ToolConfigBase(tool_name="message", description="Send messages across channels", category="messaging"),
        ToolConfigBase(tool_name="cron", description="Manage Gateway cron jobs and wakeups", category="automation"),
        ToolConfigBase(tool_name="image", description="Analyze an image with the configured image model", category="core"),
        ToolConfigBase(tool_name="nodes", description="Discover and target paired nodes", category="nodes"),
        ToolConfigBase(tool_name="process", description="Manage background exec sessions", category="runtime"),
        ToolConfigBase(tool_name="apply_patch", description="Apply structured patches across files", category="fs"),
        ToolConfigBase(tool_name="gateway", description="Restart or apply updates to the Gateway", category="automation"),
        ToolConfigBase(tool_name="sessions_list", description="List sessions", category="sessions"),
        ToolConfigBase(tool_name="sessions_history", description="Inspect transcript history", category="sessions"),
        ToolConfigBase(tool_name="sessions_send", description="Send to another session", category="sessions"),
        ToolConfigBase(tool_name="sessions_spawn", description="Spawn a sub-agent run", category="sessions"),
    ]
    for t in default_tools:
        tool = ToolConfig(**t.model_dump())
        await db.tools_config.insert_one(tool.model_dump())

    # Seed model providers
    default_providers = [
        ModelProviderBase(provider_name="anthropic", display_name="Anthropic", models=[{"id": "claude-sonnet-4-5", "alias": "Sonnet"}, {"id": "claude-opus-4-6", "alias": "Opus"}], enabled=True, is_primary=True),
        ModelProviderBase(provider_name="openai", display_name="OpenAI", models=[{"id": "gpt-5.2", "alias": "GPT-5.2"}, {"id": "gpt-4o", "alias": "GPT-4o"}], enabled=True),
        ModelProviderBase(provider_name="google", display_name="Google", models=[{"id": "gemini-3-flash", "alias": "Flash"}, {"id": "gemini-3-pro", "alias": "Pro"}], enabled=False),
        ModelProviderBase(provider_name="openrouter", display_name="OpenRouter", models=[], enabled=False),
        ModelProviderBase(provider_name="ollama", display_name="Ollama (Local)", base_url="http://localhost:11434", models=[{"id": "llama3", "alias": "Llama 3"}], enabled=False),
        ModelProviderBase(provider_name="venice", display_name="Venice AI", models=[{"id": "llama-3.3-70b", "alias": "Llama 70B"}, {"id": "claude-opus-45", "alias": "Opus"}], enabled=False),
    ]
    for p in default_providers:
        provider = ModelProvider(**p.model_dump())
        await db.model_providers.insert_one(provider.model_dump())

    # Seed channels
    default_channels = [
        ChannelBase(channel_type="whatsapp", display_name="WhatsApp", dm_policy="pairing", status="disconnected"),
        ChannelBase(channel_type="telegram", display_name="Telegram", dm_policy="pairing", status="disconnected"),
        ChannelBase(channel_type="discord", display_name="Discord", dm_policy="pairing", status="disconnected"),
        ChannelBase(channel_type="slack", display_name="Slack", dm_policy="allowlist", status="disconnected"),
        ChannelBase(channel_type="signal", display_name="Signal", dm_policy="pairing", status="disconnected"),
        ChannelBase(channel_type="imessage", display_name="iMessage (BlueBubbles)", dm_policy="allowlist", status="disconnected"),
        ChannelBase(channel_type="googlechat", display_name="Google Chat", dm_policy="open", status="disconnected"),
        ChannelBase(channel_type="webchat", display_name="WebChat", enabled=True, dm_policy="open", status="connected"),
        ChannelBase(channel_type="irc", display_name="IRC", dm_policy="pairing", status="disconnected"),
        ChannelBase(channel_type="matrix", display_name="Matrix", dm_policy="pairing", status="disconnected"),
    ]
    for c in default_channels:
        channel = Channel(**c.model_dump())
        await db.channels.insert_one(channel.model_dump())

    # Seed sessions
    default_sessions = [
        SessionBase(session_key="agent:main:whatsapp:dm:+15551234567", agent_id="main", channel="whatsapp", peer="+15551234567", status="active", message_count=42, last_message_at=datetime.now(timezone.utc).isoformat()),
        SessionBase(session_key="agent:main:telegram:dm:tg:12345", agent_id="main", channel="telegram", peer="tg:12345", status="active", message_count=18, last_message_at=datetime.now(timezone.utc).isoformat()),
        SessionBase(session_key="agent:main:webchat:main", agent_id="main", channel="webchat", peer="local", status="active", message_count=7, last_message_at=datetime.now(timezone.utc).isoformat()),
    ]
    for s in default_sessions:
        session = Session(**s.model_dump())
        await db.sessions.insert_one(session.model_dump())

    # Seed cron jobs
    default_crons = [
        CronJobBase(name="daily-summary", schedule="0 9 * * *", task="Generate daily activity summary", enabled=True, status="idle"),
        CronJobBase(name="health-check", schedule="*/15 * * * *", task="Check gateway health and report", enabled=True, status="idle"),
    ]
    for cr in default_crons:
        job = CronJob(**cr.model_dump())
        await db.cron_jobs.insert_one(job.model_dump())

    # Seed default gateway config
    default_config = GatewayConfig(raw_config='{\n  agents: { defaults: { workspace: "~/.openclaw/workspace" } },\n  channels: { whatsapp: { allowFrom: ["+15555550123"] } },\n}')
    await db.gateway_config.update_one(
        {"id": "gateway_config"},
        {"$set": default_config.model_dump()},
        upsert=True
    )

    await log_activity("seed", "system", "", "Seeded initial data")

    # Also seed clawhub and hooks
    await seed_clawhub()
    # Seed hooks config
    hooks_conf = HooksConfig(token="openclaw-hook-secret", presets=["gmail"])
    await db.hooks_config.update_one({"id": "hooks_config"}, {"$set": hooks_conf.model_dump()}, upsert=True)
    # Seed hook mappings
    mappings = [
        HookMappingBase(name="Gmail Notifications", path="gmail", action="agent", agent_id="main", session_key="hook:gmail:{{messages[0].id}}", message_template="From: {{messages[0].from}}\nSubject: {{messages[0].subject}}", wake_mode="now", deliver=True, channel="last", enabled=True),
        HookMappingBase(name="GitHub Webhook", path="github", action="agent", agent_id="coder", session_key="hook:github", message_template="{{action}}: {{repository.full_name}}", wake_mode="now", enabled=False),
    ]
    for m in mappings:
        mapping = HookMapping(**m.model_dump())
        await db.hook_mappings.insert_one(mapping.model_dump())

    # Seed session messages for demo transcripts
    sessions_list = await db.sessions.find({}, {"_id": 0}).to_list(10)
    if sessions_list:
        demo_messages = [
            {"role": "user", "content": "Hey, can you check the weather for me?"},
            {"role": "assistant", "content": "I'll check the weather for you. Let me use the web search tool to find current conditions."},
            {"role": "tool", "content": "[web_search] Searching for current weather..."},
            {"role": "assistant", "content": "The current weather in your area is 24C with partly cloudy skies. Expected high of 28C today with a 15% chance of rain this afternoon."},
            {"role": "user", "content": "Thanks! Can you also remind me about my meeting at 3pm?"},
            {"role": "assistant", "content": "I've noted your meeting at 3pm. I'll set up a cron reminder 15 minutes before. Is there anything specific you'd like me to prepare for the meeting?"},
        ]
        for s in sessions_list[:2]:
            for dm in demo_messages:
                msg = SessionMessage(session_id=s["id"], role=dm["role"], content=dm["content"])
                await db.session_messages.insert_one(msg.model_dump())
            await db.sessions.update_one({"id": s["id"]}, {"$set": {"message_count": len(demo_messages)}})

    return {"status": "seeded"}

# ===== CLAWHUB MARKETPLACE =====
@api_router.get("/clawhub", response_model=List[ClawHubSkill])
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
    # Also create a local skill entry
    existing = await db.skills.find_one({"name": skill["slug"]})
    if not existing:
        local_skill = Skill(name=skill["slug"], description=skill["description"], location="managed", enabled=True, requires_env=skill.get("requires_env", []), requires_bins=skill.get("requires_bins", []), homepage=skill.get("homepage", ""))
        await db.skills.insert_one(local_skill.model_dump())
    await log_activity("install", "clawhub", skill_id, f"Installed skill: {skill['slug']}")
    return {"status": "installed", "slug": skill["slug"]}

@api_router.post("/clawhub/uninstall/{skill_id}")
async def uninstall_clawhub_skill(skill_id: str):
    skill = await db.clawhub_skills.find_one({"id": skill_id}, {"_id": 0})
    if not skill:
        raise HTTPException(404, "Skill not found")
    await db.clawhub_skills.update_one({"id": skill_id}, {"$set": {"installed": False, "installed_version": ""}})
    await db.skills.delete_one({"name": skill["slug"]})
    await log_activity("uninstall", "clawhub", skill_id, f"Uninstalled skill: {skill['slug']}")
    return {"status": "uninstalled"}

@api_router.post("/clawhub/seed")
async def seed_clawhub():
    count = await db.clawhub_skills.count_documents({})
    if count > 0:
        return {"status": "already_seeded"}
    hub_skills = [
        ClawHubSkillBase(slug="web-search", name="Web Search", description="Search the web using Brave Search API", author="openclaw", version="2.1.0", tags=["search", "web", "brave"], downloads=12450, stars=89, homepage="https://clawhub.ai/skill/web-search", category="web", requires_env=["BRAVE_API_KEY"]),
        ClawHubSkillBase(slug="nano-banana-pro", name="Nano Banana Pro", description="Generate or edit images via Gemini 3 Pro Image generation", author="openclaw", version="3.0.1", tags=["image", "gemini", "generation"], downloads=8920, stars=67, homepage="https://clawhub.ai/skill/nano-banana-pro", category="media", requires_env=["GEMINI_API_KEY"]),
        ClawHubSkillBase(slug="summarize", name="Summarize", description="Summarize long documents, articles, or transcripts", author="openclaw", version="1.4.2", tags=["summarize", "text", "document"], downloads=6340, stars=45, homepage="https://clawhub.ai/skill/summarize", category="text"),
        ClawHubSkillBase(slug="peekaboo", name="Peekaboo", description="Camera snapshot and image analysis for macOS/iOS nodes", author="openclaw", version="1.2.0", tags=["camera", "image", "vision"], downloads=4210, stars=38, homepage="https://clawhub.ai/skill/peekaboo", category="media"),
        ClawHubSkillBase(slug="voice-call", name="Voice Call", description="Make and receive voice calls via Twilio integration", author="openclaw", version="2.0.0", tags=["voice", "call", "twilio"], downloads=3150, stars=28, homepage="https://clawhub.ai/skill/voice-call", category="communication", requires_env=["TWILIO_SID", "TWILIO_TOKEN"]),
        ClawHubSkillBase(slug="gemini-cli", name="Gemini CLI", description="Use Gemini CLI for coding assistance and code review", author="community", version="1.1.0", tags=["coding", "gemini", "cli"], downloads=5670, stars=52, homepage="https://github.com/google-gemini/gemini-cli", category="coding", requires_bins=["gemini"]),
        ClawHubSkillBase(slug="postgres-backup", name="Postgres Backup", description="Automated PostgreSQL backup and restore management", author="community", version="1.0.3", tags=["postgres", "backup", "database"], downloads=2890, stars=22, category="devops", requires_bins=["pg_dump"]),
        ClawHubSkillBase(slug="git-assistant", name="Git Assistant", description="Advanced git operations - rebase, cherry-pick, conflict resolution", author="community", version="2.3.0", tags=["git", "version-control", "coding"], downloads=7820, stars=61, category="coding", requires_bins=["git"]),
        ClawHubSkillBase(slug="calendar-sync", name="Calendar Sync", description="Sync and manage Google Calendar events", author="community", version="1.5.1", tags=["calendar", "google", "scheduling"], downloads=4560, stars=35, category="productivity", requires_env=["GOOGLE_CALENDAR_KEY"]),
        ClawHubSkillBase(slug="slack-digest", name="Slack Digest", description="Generate daily digests from Slack channels", author="community", version="1.2.0", tags=["slack", "digest", "summary"], downloads=3240, stars=24, category="communication", requires_env=["SLACK_TOKEN"]),
        ClawHubSkillBase(slug="code-review", name="Code Review", description="Automated code review with security analysis", author="openclaw", version="2.0.1", tags=["code", "review", "security"], downloads=9100, stars=73, category="coding"),
        ClawHubSkillBase(slug="weather-forecast", name="Weather Forecast", description="Get weather forecasts and alerts for any location", author="community", version="1.0.0", tags=["weather", "forecast", "api"], downloads=1950, stars=15, category="general", requires_env=["WEATHER_API_KEY"]),
        ClawHubSkillBase(slug="docker-manager", name="Docker Manager", description="Manage Docker containers, images, and compose stacks", author="community", version="1.3.0", tags=["docker", "container", "devops"], downloads=4120, stars=33, category="devops", requires_bins=["docker"]),
        ClawHubSkillBase(slug="markdown-render", name="Markdown Render", description="Render and export markdown to PDF, HTML, or images", author="community", version="1.1.2", tags=["markdown", "render", "export"], downloads=2670, stars=19, category="text"),
        ClawHubSkillBase(slug="email-compose", name="Email Compose", description="Draft and send emails with AI-powered writing", author="openclaw", version="1.4.0", tags=["email", "compose", "gmail"], downloads=5430, stars=41, category="communication", requires_env=["GMAIL_TOKEN"]),
        ClawHubSkillBase(slug="screenshot-ocr", name="Screenshot OCR", description="Take screenshots and extract text with OCR", author="community", version="1.0.1", tags=["screenshot", "ocr", "text"], downloads=3780, stars=29, category="media"),
    ]
    for s in hub_skills:
        skill = ClawHubSkill(**s.model_dump())
        await db.clawhub_skills.insert_one(skill.model_dump())
    return {"status": "seeded", "count": len(hub_skills)}

# ===== HOOKS/WEBHOOKS =====
@api_router.get("/hooks/config")
async def get_hooks_config():
    config = await db.hooks_config.find_one({"id": "hooks_config"}, {"_id": 0})
    if not config:
        default = HooksConfig()
        await db.hooks_config.insert_one(default.model_dump())
        return default.model_dump()
    return config

@api_router.put("/hooks/config")
async def update_hooks_config(data: HooksConfig):
    data.updated_at = datetime.now(timezone.utc).isoformat()
    await db.hooks_config.update_one({"id": "hooks_config"}, {"$set": data.model_dump()}, upsert=True)
    await log_activity("update", "hooks", "hooks_config", "Updated hooks config")
    return await db.hooks_config.find_one({"id": "hooks_config"}, {"_id": 0})

@api_router.get("/hooks/mappings", response_model=List[HookMapping])
async def list_hook_mappings():
    return await db.hook_mappings.find({}, {"_id": 0}).to_list(100)

@api_router.post("/hooks/mappings", response_model=HookMapping)
async def create_hook_mapping(data: HookMappingBase):
    mapping = HookMapping(**data.model_dump())
    await db.hook_mappings.insert_one(mapping.model_dump())
    await log_activity("create", "hook", mapping.id, f"Created hook: {mapping.name}")
    return mapping

@api_router.put("/hooks/mappings/{mapping_id}", response_model=HookMapping)
async def update_hook_mapping(mapping_id: str, data: HookMappingBase):
    existing = await db.hook_mappings.find_one({"id": mapping_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Hook mapping not found")
    update = data.model_dump()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.hook_mappings.update_one({"id": mapping_id}, {"$set": update})
    return await db.hook_mappings.find_one({"id": mapping_id}, {"_id": 0})

@api_router.delete("/hooks/mappings/{mapping_id}")
async def delete_hook_mapping(mapping_id: str):
    result = await db.hook_mappings.delete_one({"id": mapping_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Hook mapping not found")
    await log_activity("delete", "hook", mapping_id, "Deleted hook mapping")
    return {"status": "deleted"}

# ===== SESSION MESSAGES (TRANSCRIPT) =====
@api_router.get("/sessions/{session_id}/messages")
async def get_session_messages(session_id: str):
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(404, "Session not found")
    messages = await db.session_messages.find({"session_id": session_id}, {"_id": 0}).sort("timestamp", 1).to_list(500)
    return {"session": session, "messages": messages}

@api_router.post("/sessions/{session_id}/messages")
async def add_session_message(session_id: str, role: str = "user", content: str = ""):
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(404, "Session not found")
    msg = SessionMessage(session_id=session_id, role=role, content=content)
    await db.session_messages.insert_one(msg.model_dump())
    await db.sessions.update_one({"id": session_id}, {"$inc": {"message_count": 1}, "$set": {"last_message_at": datetime.now(timezone.utc).isoformat()}})
    return msg.model_dump()

# ===== CONFIG VALIDATION =====
@api_router.post("/config/validate")
async def validate_config(data: dict):
    raw = data.get("raw_config", "")
    errors = []
    warnings = []
    try:
        import json
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            errors.append("Config must be a JSON object")
        else:
            valid_top = ["agents", "channels", "tools", "session", "messages", "gateway", "hooks", "cron", "skills", "plugins", "browser", "ui", "models", "env", "logging", "commands", "talk", "discovery", "canvasHost", "auth", "wizard", "identity"]
            for k in parsed.keys():
                if k not in valid_top and not k.startswith("$"):
                    warnings.append(f"Unknown top-level key: '{k}'")
    except json.JSONDecodeError as e:
        errors.append(f"JSON parse error: {str(e)}")
    return {"valid": len(errors) == 0, "errors": errors, "warnings": warnings}

# ===== AGENT ACTIVITIES =====
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

@api_router.post("/activities/simulate")
async def simulate_activities():
    """Generate a batch of simulated real-time agent activities for demo"""
    import random
    agents_list = await db.agents.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(10)
    if not agents_list:
        return {"generated": 0}

    tools_catalog = [
        ("exec", "runtime", ["ls -la workspace/", "cat README.md", "python3 script.py", "git status", "npm run build", "grep -r 'TODO' .", "docker ps", "pip install requests"]),
        ("web_search", "web", ["latest news about AI agents", "python fastapi middleware guide", "kubernetes deployment best practices", "react server components 2026", "openclaw agent tutorial"]),
        ("web_fetch", "web", ["https://docs.openclaw.ai/tools", "https://github.com/trending", "https://news.ycombinator.com", "https://api.weather.gov/forecasts"]),
        ("browser", "ui", ["navigate to dashboard", "click submit button", "fill form fields", "take screenshot", "scroll to bottom"]),
        ("canvas", "ui", ["snapshot current state", "render markdown", "present slide 3", "eval expression"]),
        ("message", "messaging", ["Sent reply to user on WhatsApp", "Posted update in Discord #general", "Forwarded email summary to Telegram"]),
        ("image", "core", ["Analyzing uploaded screenshot", "Processing document scan", "Identifying objects in photo"]),
        ("apply_patch", "fs", ["Modified server.py +15 -3 lines", "Updated package.json dependencies", "Patched config.yaml"]),
        ("cron", "automation", ["Scheduled daily-summary for 09:00", "Triggered health-check run", "Updated cron next-run time"]),
        ("sessions_spawn", "sessions", ["Spawned sub-agent 'coder' for code review", "Spawned sub-agent 'support' for ticket #234"]),
    ]

    event_types = [
        ("tool_call", 55),
        ("llm_request", 20),
        ("message_received", 10),
        ("message_sent", 8),
        ("session_start", 3),
        ("session_end", 2),
        ("heartbeat", 2),
    ]

    models = ["anthropic/claude-sonnet-4-5", "openai/gpt-5.2", "anthropic/claude-opus-4-6", "google/gemini-3-flash"]
    channels = ["whatsapp", "telegram", "discord", "webchat", "slack"]
    statuses_w = [("completed", 78), ("running", 10), ("error", 7), ("cancelled", 5)]

    now = datetime.now(timezone.utc)
    generated = []

    for i in range(random.randint(3, 8)):
        agent = random.choice(agents_list)
        et_choice = random.choices([e[0] for e in event_types], weights=[e[1] for e in event_types])[0]
        st_choice = random.choices([s[0] for s in statuses_w], weights=[s[1] for s in statuses_w])[0]

        tool_name = ""
        tool_input = ""
        tool_output = ""
        verbose = ""
        dur = 0
        model_used = ""
        tokens_in = 0
        tokens_out = 0
        error_msg = ""
        ch = random.choice(channels)
        peer = f"{ch}:user_{random.randint(100,999)}"

        if et_choice == "tool_call":
            tool_info = random.choice(tools_catalog)
            tool_name = tool_info[0]
            tool_input = random.choice(tool_info[2])
            dur = random.randint(50, 15000)
            if st_choice == "completed":
                tool_output = f"[{tool_name}] Completed successfully"
                verbose = f"$ {tool_input}\n> Processing...\n> Done in {dur}ms\n> Exit code: 0"
            elif st_choice == "error":
                tool_output = f"[{tool_name}] Error"
                error_msg = random.choice(["Command timed out after 30s", "Permission denied", "Network unreachable", "Rate limit exceeded", "File not found"])
                verbose = f"$ {tool_input}\n> ERROR: {error_msg}\n> Exit code: 1"
            elif st_choice == "running":
                verbose = f"$ {tool_input}\n> Running..."
            else:
                tool_output = f"[{tool_name}] Cancelled by user"
                verbose = f"$ {tool_input}\n> Cancelled"

        elif et_choice == "llm_request":
            model_used = random.choice(models)
            tokens_in = random.randint(200, 8000)
            tokens_out = random.randint(50, 4000)
            dur = random.randint(500, 12000)
            verbose = f"Model: {model_used}\nTokens: {tokens_in} in / {tokens_out} out\nLatency: {dur}ms"
            if st_choice == "error":
                error_msg = random.choice(["API rate limit", "Context length exceeded", "Invalid API key", "Server overloaded"])
                verbose += f"\nERROR: {error_msg}"

        elif et_choice in ("message_received", "message_sent"):
            verbose = f"Channel: {ch}\nPeer: {peer}\nContent length: {random.randint(10, 2000)} chars"

        elif et_choice == "session_start":
            verbose = f"New session started\nChannel: {ch}\nPeer: {peer}\nAgent: {agent['name']}"

        elif et_choice == "heartbeat":
            st_choice = "completed"
            dur = random.randint(10, 100)
            verbose = f"Heartbeat OK\nUptime: {random.randint(1,72)}h\nMemory: {random.randint(50,800)}MB"

        from datetime import timedelta
        ts = now - timedelta(seconds=random.randint(0, 30))

        act = AgentActivity(
            agent_id=agent["id"],
            agent_name=agent["name"],
            event_type=et_choice,
            tool_name=tool_name,
            tool_input=tool_input,
            tool_output=tool_output,
            verbose=verbose,
            status=st_choice,
            duration_ms=dur,
            session_key=f"agent:{agent['name']}:{ch}:dm:{peer}",
            channel=ch,
            peer=peer,
            model_used=model_used,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            error=error_msg,
            timestamp=ts.isoformat(),
        )
        await db.agent_activities.insert_one(act.model_dump())
        generated.append(act.model_dump())

    return {"generated": len(generated)}

@api_router.delete("/activities")
async def clear_activities():
    result = await db.agent_activities.delete_many({})
    return {"deleted": result.deleted_count}

# ===== SYSTEM LOGS (openclaw logs --follow style) =====
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

@api_router.post("/system-logs/generate")
async def generate_system_logs():
    """Generate realistic OpenClaw gateway log entries"""
    import random
    now = datetime.now(timezone.utc)
    from datetime import timedelta

    agents_list = await db.agents.find({}, {"_id": 0, "name": 1}).to_list(10)
    agent_names = [a["name"] for a in agents_list] if agents_list else ["main"]

    templates = [
        # Gateway logs
        ("INFO", "gateway", "Gateway listening on {host}:{port}"),
        ("INFO", "gateway", "Config reloaded (hybrid mode) - {n} changes detected"),
        ("DEBUG", "gateway", "Health check OK - uptime {h}h {m}m, mem {mem}MB"),
        ("INFO", "gateway", "TLS certificate valid until 2026-12-31"),
        ("WARN", "gateway", "Config reload: unknown key '{key}' ignored"),
        ("DEBUG", "gateway", "Heartbeat timer fired for agent:{agent}"),
        # Agent logs
        ("INFO", "agent:{agent}", "Agent loop started - model {model}"),
        ("INFO", "agent:{agent}", "Processing message from {channel}:{peer}"),
        ("DEBUG", "agent:{agent}", "Tool call: {tool}({input})"),
        ("INFO", "agent:{agent}", "Tool {tool} completed in {ms}ms"),
        ("WARN", "agent:{agent}", "Tool {tool} timed out after {timeout}s, retrying..."),
        ("ERROR", "agent:{agent}", "Tool {tool} failed: {error}"),
        ("DEBUG", "agent:{agent}", "LLM request to {model} - {tokens_in} tokens in"),
        ("INFO", "agent:{agent}", "LLM response received - {tokens_out} tokens, {ms}ms"),
        ("WARN", "agent:{agent}", "LLM rate limit hit, backing off {s}s"),
        ("INFO", "agent:{agent}", "Session context compacted: {old}k -> {new}k tokens"),
        ("DEBUG", "agent:{agent}", "Workspace sync: {n} files updated"),
        # Channel logs
        ("INFO", "channel:{channel}", "Connected to {channel} gateway"),
        ("INFO", "channel:{channel}", "DM received from {peer} ({len} chars)"),
        ("INFO", "channel:{channel}", "Message sent to {peer}"),
        ("WARN", "channel:{channel}", "Connection lost, reconnecting in {s}s..."),
        ("ERROR", "channel:{channel}", "Authentication failed for {channel}: invalid token"),
        ("DEBUG", "channel:{channel}", "Group message in {group} - mention detected"),
        ("INFO", "channel:{channel}", "Pairing request from {peer} - auto-approved"),
        # Session logs
        ("INFO", "session", "New session: agent:{agent}:{channel}:dm:{peer}"),
        ("DEBUG", "session", "Session reset (daily mode) for {agent}:{channel}"),
        ("INFO", "session", "Session ended: {reason}"),
        ("DEBUG", "session", "DM scope: per-peer, isolating {peer}"),
        # Tool logs
        ("DEBUG", "tool:exec", "$ {cmd}"),
        ("INFO", "tool:exec", "Exit code: {code} ({ms}ms)"),
        ("DEBUG", "tool:browser", "Navigating to {url}"),
        ("INFO", "tool:browser", "Page loaded ({ms}ms) - title: {title}"),
        ("DEBUG", "tool:web_search", "Searching: {query}"),
        ("INFO", "tool:web_search", "Found {n} results from Brave Search"),
        ("DEBUG", "tool:web_fetch", "Fetching {url}"),
        ("INFO", "tool:web_fetch", "Fetched {bytes} bytes, extracted {chars} chars"),
        ("INFO", "tool:canvas", "Canvas snapshot captured ({w}x{h})"),
        ("DEBUG", "tool:apply_patch", "Patching {file}: +{add} -{del} lines"),
        ("INFO", "tool:image", "Image analyzed: {desc}"),
        # Skill logs
        ("INFO", "skill:web-search", "Brave Search API call: {query}"),
        ("INFO", "skill:nano-banana-pro", "Image generation request: {prompt}"),
        ("WARN", "skill:nano-banana-pro", "GEMINI_API_KEY not set, skill disabled"),
        ("DEBUG", "skill:summarize", "Summarizing {chars} chars -> target {target} chars"),
        # Cron logs
        ("INFO", "cron", "Job '{job}' triggered ({schedule})"),
        ("INFO", "cron", "Job '{job}' completed in {ms}ms"),
        ("ERROR", "cron", "Job '{job}' failed: {error}"),
        ("DEBUG", "cron", "Next run for '{job}': {next}"),
        # Hooks logs
        ("INFO", "hooks", "Webhook received: POST /hooks/{path}"),
        ("DEBUG", "hooks", "Hook '{name}' dispatched to agent:{agent}"),
        ("WARN", "hooks", "Hook auth failed: invalid token"),
    ]

    tools = ["exec", "browser", "web_search", "web_fetch", "canvas", "apply_patch", "image", "message", "cron"]
    models = ["anthropic/claude-sonnet-4-5", "openai/gpt-5.2", "anthropic/claude-opus-4-6", "google/gemini-3-flash"]
    channels = ["whatsapp", "telegram", "discord", "slack", "webchat", "signal"]
    cmds = ["ls -la", "git status", "npm run build", "python3 app.py", "docker ps", "cat README.md", "grep -r TODO .", "pip install requests"]
    urls = ["https://docs.openclaw.ai", "https://github.com/trending", "https://news.ycombinator.com", "https://api.weather.gov"]
    errors = ["ECONNRESET", "ETIMEDOUT", "rate limit exceeded", "permission denied", "file not found", "out of memory", "context length exceeded"]
    jobs = ["daily-summary", "health-check", "backup-db", "sync-contacts"]
    groups = ["#general", "#engineering", "#support", "#random"]

    generated = []
    count = random.randint(5, 12)

    for i in range(count):
        tmpl = random.choice(templates)
        level, source_tmpl, msg_tmpl = tmpl
        agent = random.choice(agent_names)
        channel = random.choice(channels)
        peer = f"{channel}:user_{random.randint(100,999)}"
        source = source_tmpl.format(agent=agent, channel=channel)

        replacements = {
            "host": "127.0.0.1", "port": "18789",
            "n": str(random.randint(1, 20)),
            "h": str(random.randint(0, 72)), "m": str(random.randint(0, 59)),
            "mem": str(random.randint(80, 900)),
            "agent": agent, "model": random.choice(models),
            "channel": channel, "peer": peer,
            "tool": random.choice(tools),
            "input": random.choice(cmds)[:30],
            "ms": str(random.randint(5, 15000)),
            "timeout": str(random.randint(10, 60)),
            "error": random.choice(errors),
            "tokens_in": str(random.randint(100, 8000)),
            "tokens_out": str(random.randint(50, 4000)),
            "s": str(random.randint(1, 30)),
            "old": str(random.randint(50, 200)),
            "new": str(random.randint(10, 50)),
            "len": str(random.randint(10, 2000)),
            "group": random.choice(groups),
            "reason": random.choice(["user idle", "daily reset", "manual close", "peer disconnect"]),
            "cmd": random.choice(cmds),
            "code": str(random.choice([0, 0, 0, 1, 127])),
            "url": random.choice(urls),
            "title": random.choice(["OpenClaw Docs", "GitHub Trending", "Hacker News", "Weather API"]),
            "query": random.choice(["latest AI news", "python tutorial", "kubernetes guide", "react hooks"]),
            "bytes": str(random.randint(1000, 500000)),
            "chars": str(random.randint(500, 50000)),
            "w": str(random.choice([1920, 1280, 800])),
            "file": random.choice(["server.py", "config.yaml", "README.md", "package.json"]),
            "add": str(random.randint(1, 50)),
            "del": str(random.randint(0, 20)),
            "desc": random.choice(["screenshot of dashboard", "photo of whiteboard", "document scan", "chart image"]),
            "prompt": random.choice(["a lobster mascot", "abstract background", "icon set", "data visualization"]),
            "target": str(random.randint(200, 1000)),
            "job": random.choice(jobs),
            "schedule": random.choice(["0 9 * * *", "*/15 * * * *", "0 0 * * 0"]),
            "next": (now + timedelta(minutes=random.randint(1, 60))).strftime("%H:%M"),
            "path": random.choice(["gmail", "github", "stripe", "custom"]),
            "name": random.choice(["Gmail Notifications", "GitHub Webhook", "Stripe Payments"]),
            "key": random.choice(["customField", "unknownOption", "legacySetting"]),
        }

        try:
            message = msg_tmpl.format(**replacements)
        except KeyError:
            message = msg_tmpl

        ts = now - timedelta(seconds=random.randint(0, 20), milliseconds=random.randint(0, 999))

        log_entry = {
            "id": str(uuid.uuid4()),
            "timestamp": ts.isoformat(),
            "level": level,
            "source": source,
            "message": message,
            "agent": agent if "agent" in source else "",
            "channel": channel if "channel" in source else "",
            "raw": f"[{ts.strftime('%H:%M:%S.%f')[:-3]}] [{level:5}] [{source}] {message}",
        }
        await db.system_logs.insert_one(log_entry)
        generated.append({k: v for k, v in log_entry.items() if k != "_id"})

    return {"generated": len(generated)}

@api_router.delete("/system-logs")
async def clear_system_logs():
    result = await db.system_logs.delete_many({})
    return {"deleted": result.deleted_count}

app.include_router(api_router)

# ===== WEBSOCKET MANAGER =====
class ConnectionManager:
    def __init__(self):
        self.log_connections: Set[WebSocket] = set()
        self.activity_connections: Set[WebSocket] = set()

    async def connect_logs(self, ws: WebSocket):
        await ws.accept()
        self.log_connections.add(ws)

    async def connect_activities(self, ws: WebSocket):
        await ws.accept()
        self.activity_connections.add(ws)

    def disconnect_logs(self, ws: WebSocket):
        self.log_connections.discard(ws)

    def disconnect_activities(self, ws: WebSocket):
        self.activity_connections.discard(ws)

    async def broadcast_logs(self, data: list):
        dead = set()
        for ws in self.log_connections:
            try:
                await ws.send_json({"type": "logs", "data": data})
            except Exception:
                dead.add(ws)
        self.log_connections -= dead

    async def broadcast_activities(self, data: list):
        dead = set()
        for ws in self.activity_connections:
            try:
                await ws.send_json({"type": "activities", "data": data})
            except Exception:
                dead.add(ws)
        self.activity_connections -= dead

ws_manager = ConnectionManager()

async def _generate_logs_batch():
    """Internal: generate logs and return them"""
    import random
    now = datetime.now(timezone.utc)
    from datetime import timedelta
    agents_list = await db.agents.find({}, {"_id": 0, "name": 1}).to_list(10)
    agent_names = [a["name"] for a in agents_list] if agents_list else ["main"]
    templates = [
        ("INFO", "gateway", "Config reloaded (hybrid mode) - {n} changes detected"),
        ("DEBUG", "gateway", "Health check OK - uptime {h}h {m}m, mem {mem}MB"),
        ("WARN", "gateway", "Config reload: unknown key '{key}' ignored"),
        ("DEBUG", "gateway", "Heartbeat timer fired for agent:{agent}"),
        ("INFO", "agent:{agent}", "Processing message from {channel}:{peer}"),
        ("DEBUG", "agent:{agent}", "Tool call: {tool}({input})"),
        ("INFO", "agent:{agent}", "Tool {tool} completed in {ms}ms"),
        ("WARN", "agent:{agent}", "Tool {tool} timed out after {timeout}s, retrying..."),
        ("ERROR", "agent:{agent}", "Tool {tool} failed: {error}"),
        ("DEBUG", "agent:{agent}", "LLM request to {model} - {tokens_in} tokens in"),
        ("INFO", "agent:{agent}", "LLM response received - {tokens_out} tokens, {ms}ms"),
        ("INFO", "agent:{agent}", "Session context compacted: {old}k -> {new}k tokens"),
        ("INFO", "channel:{channel}", "DM received from {peer} ({len} chars)"),
        ("INFO", "channel:{channel}", "Message sent to {peer}"),
        ("WARN", "channel:{channel}", "Connection lost, reconnecting in {s}s..."),
        ("DEBUG", "channel:{channel}", "Group message in {group} - mention detected"),
        ("INFO", "session", "New session: agent:{agent}:{channel}:dm:{peer}"),
        ("DEBUG", "session", "Session reset (daily mode) for {agent}:{channel}"),
        ("DEBUG", "tool:exec", "$ {cmd}"),
        ("INFO", "tool:exec", "Exit code: {code} ({ms}ms)"),
        ("DEBUG", "tool:web_search", "Searching: {query}"),
        ("INFO", "tool:web_fetch", "Fetched {bytes} bytes, extracted {chars} chars"),
        ("INFO", "skill:web-search", "Brave Search API call: {query}"),
        ("INFO", "cron", "Job '{job}' triggered ({schedule})"),
        ("DEBUG", "hooks", "Hook '{name}' dispatched to agent:{agent}"),
    ]
    tools = ["exec", "browser", "web_search", "web_fetch", "canvas", "apply_patch", "image", "message"]
    models = ["anthropic/claude-sonnet-4-5", "openai/gpt-5.2", "google/gemini-3-flash"]
    channels = ["whatsapp", "telegram", "discord", "slack", "webchat"]
    cmds = ["ls -la", "git status", "npm run build", "python3 app.py", "docker ps"]
    errors = ["ECONNRESET", "ETIMEDOUT", "rate limit exceeded", "permission denied"]
    jobs = ["daily-summary", "health-check"]
    groups = ["#general", "#engineering"]
    generated = []
    count = random.randint(2, 5)
    for _ in range(count):
        tmpl = random.choice(templates)
        level, source_tmpl, msg_tmpl = tmpl
        agent = random.choice(agent_names)
        channel = random.choice(channels)
        peer = f"{channel}:user_{random.randint(100,999)}"
        source = source_tmpl.format(agent=agent, channel=channel)
        r = {"host": "127.0.0.1", "port": "18789", "n": str(random.randint(1,20)), "h": str(random.randint(0,72)), "m": str(random.randint(0,59)), "mem": str(random.randint(80,900)), "agent": agent, "model": random.choice(models), "channel": channel, "peer": peer, "tool": random.choice(tools), "input": random.choice(cmds)[:30], "ms": str(random.randint(5,15000)), "timeout": str(random.randint(10,60)), "error": random.choice(errors), "tokens_in": str(random.randint(100,8000)), "tokens_out": str(random.randint(50,4000)), "s": str(random.randint(1,30)), "old": str(random.randint(50,200)), "new": str(random.randint(10,50)), "len": str(random.randint(10,2000)), "group": random.choice(groups), "cmd": random.choice(cmds), "code": str(random.choice([0,0,0,1])), "query": random.choice(["latest AI news","python tutorial","kubernetes guide"]), "bytes": str(random.randint(1000,500000)), "chars": str(random.randint(500,50000)), "job": random.choice(jobs), "schedule": "*/15 * * * *", "name": random.choice(["Gmail Notifications","GitHub Webhook"]), "key": random.choice(["customField","unknownOption"])}
        try:
            message = msg_tmpl.format(**r)
        except KeyError:
            message = msg_tmpl
        ts = now - timedelta(seconds=random.randint(0,3), milliseconds=random.randint(0,999))
        log_entry = {"id": str(uuid.uuid4()), "timestamp": ts.isoformat(), "level": level, "source": source, "message": message, "agent": agent if "agent" in source else "", "channel": channel if "channel" in source else "", "raw": f"[{ts.strftime('%H:%M:%S.%f')[:-3]}] [{level:5}] [{source}] {message}"}
        await db.system_logs.insert_one(log_entry)
        generated.append({k: v for k, v in log_entry.items() if k != "_id"})
    return generated

async def _generate_activities_batch():
    """Internal: generate activities and return them"""
    import random
    now = datetime.now(timezone.utc)
    from datetime import timedelta
    agents_list = await db.agents.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(10)
    if not agents_list:
        return []
    tools_catalog = [("exec", ["ls -la", "git status", "npm run build"]), ("web_search", ["latest AI news", "python guide"]), ("browser", ["navigate to dashboard"]), ("canvas", ["snapshot current state"]), ("message", ["Sent reply to user"]), ("image", ["Analyzing uploaded screenshot"]), ("apply_patch", ["Modified server.py"])]
    models = ["anthropic/claude-sonnet-4-5", "openai/gpt-5.2", "google/gemini-3-flash"]
    channels = ["whatsapp", "telegram", "discord", "webchat"]
    event_types = [("tool_call", 55), ("llm_request", 25), ("message_received", 10), ("message_sent", 10)]
    statuses = [("completed", 80), ("running", 10), ("error", 5), ("cancelled", 5)]
    generated = []
    for _ in range(random.randint(1, 3)):
        agent = random.choice(agents_list)
        et = random.choices([e[0] for e in event_types], weights=[e[1] for e in event_types])[0]
        st = random.choices([s[0] for s in statuses], weights=[s[1] for s in statuses])[0]
        tool_name, tool_input, tool_output, verbose, dur, model_used, tok_in, tok_out, error = "", "", "", "", 0, "", 0, 0, ""
        ch = random.choice(channels)
        if et == "tool_call":
            t = random.choice(tools_catalog)
            tool_name, tool_input = t[0], random.choice(t[1])
            dur = random.randint(50, 15000)
            verbose = f"$ {tool_input}\n> Done in {dur}ms"
            tool_output = f"[{tool_name}] Completed" if st == "completed" else f"[{tool_name}] {st}"
            if st == "error":
                error = random.choice(["timeout", "permission denied", "rate limit"])
                verbose += f"\n> ERROR: {error}"
        elif et == "llm_request":
            model_used = random.choice(models)
            tok_in, tok_out = random.randint(200, 8000), random.randint(50, 4000)
            dur = random.randint(500, 12000)
            verbose = f"Model: {model_used}\nTokens: {tok_in}/{tok_out}\nLatency: {dur}ms"
        ts = now - timedelta(seconds=random.randint(0, 5))
        act = AgentActivity(agent_id=agent["id"], agent_name=agent["name"], event_type=et, tool_name=tool_name, tool_input=tool_input, tool_output=tool_output, verbose=verbose, status=st, duration_ms=dur, session_key=f"agent:{agent['name']}:{ch}:dm:{ch}:user_{random.randint(100,999)}", channel=ch, peer=f"{ch}:user_{random.randint(100,999)}", model_used=model_used, tokens_in=tok_in, tokens_out=tok_out, error=error, timestamp=ts.isoformat())
        await db.agent_activities.insert_one(act.model_dump())
        generated.append(act.model_dump())
    return generated

@app.websocket("/api/ws/logs")
async def ws_logs(websocket: WebSocket):
    await ws_manager.connect_logs(websocket)
    try:
        # Send initial batch of recent logs
        recent = await db.system_logs.find({}, {"_id": 0}).sort("timestamp", -1).limit(100).to_list(100)
        recent.reverse()
        await websocket.send_json({"type": "init", "data": recent})

        while True:
            # Wait for client messages (keepalive) or generate new logs
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=3.0)
                # Client can send "ping" or filter changes
                if msg == "ping":
                    await websocket.send_json({"type": "pong"})
            except asyncio.TimeoutError:
                pass
            # Generate and broadcast new logs
            new_logs = await _generate_logs_batch()
            if new_logs:
                await websocket.send_json({"type": "logs", "data": new_logs})
    except WebSocketDisconnect:
        ws_manager.disconnect_logs(websocket)
    except Exception:
        ws_manager.disconnect_logs(websocket)

@app.websocket("/api/ws/activities")
async def ws_activities(websocket: WebSocket):
    await ws_manager.connect_activities(websocket)
    try:
        recent = await db.agent_activities.find({}, {"_id": 0}).sort("timestamp", -1).limit(50).to_list(50)
        recent.reverse()
        await websocket.send_json({"type": "init", "data": recent})

        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=4.0)
                if msg == "ping":
                    await websocket.send_json({"type": "pong"})
            except asyncio.TimeoutError:
                pass
            new_acts = await _generate_activities_batch()
            if new_acts:
                await websocket.send_json({"type": "activities", "data": new_acts})
    except WebSocketDisconnect:
        ws_manager.disconnect_activities(websocket)
    except Exception:
        ws_manager.disconnect_activities(websocket)

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
