from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
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
    return {"status": "seeded"}

app.include_router(api_router)

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
