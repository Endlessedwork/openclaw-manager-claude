"""Tool definitions and executor for AI Chat assistant."""
import json
from sqlmodel import select
from sqlalchemy import func, desc

from database import async_session
from gateway_cli import gateway
from models.bot_user import BotUser
from models.bot_group import BotGroup
from models.conversation import Conversation

TOOLS = [
    {
        "name": "query_sessions",
        "description": "Get active gateway sessions. Returns list of sessions with agent, channel, model, token usage, and age.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "query_agents",
        "description": "Get list of configured agents with their details (model, skills, channels).",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "query_skills",
        "description": "Get list of all skills available to agents.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "query_models",
        "description": "Get list of model providers and models configured in the gateway.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "query_channels",
        "description": "Get list of channels (LINE, Telegram, etc.) and their status.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "query_health",
        "description": "Get gateway health status including uptime, agent status, and channel connectivity.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "query_cron",
        "description": "Get list of cron jobs configured in the gateway.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "query_bot_users",
        "description": "Search bot users. Can filter by name or platform.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {"type": "string", "description": "Filter by display name."},
                "platform": {"type": "string", "description": "Filter by platform (line, telegram)."},
                "limit": {"type": "integer", "description": "Max results. Default 50."},
            },
            "required": [],
        },
    },
    {
        "name": "query_bot_groups",
        "description": "Search bot groups. Can filter by name or platform.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {"type": "string", "description": "Filter by group name."},
                "platform": {"type": "string", "description": "Filter by platform."},
                "limit": {"type": "integer", "description": "Max results. Default 50."},
            },
            "required": [],
        },
    },
    {
        "name": "query_conversations",
        "description": "Search conversations/messages. Filter by platform, text search.",
        "input_schema": {
            "type": "object",
            "properties": {
                "platform": {"type": "string", "description": "Filter by platform."},
                "search": {"type": "string", "description": "Search in message text."},
                "limit": {"type": "integer", "description": "Max results. Default 30."},
            },
            "required": [],
        },
    },
    {
        "name": "query_usage",
        "description": "Get token usage and cost data. Specify days to look back.",
        "input_schema": {
            "type": "object",
            "properties": {
                "days": {"type": "integer", "description": "Days to look back. Default 7."},
            },
            "required": [],
        },
    },
    {
        "name": "query_dashboard",
        "description": "Get dashboard summary: counts of agents, skills, sessions, gateway status.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
]


async def execute_tool(name: str, input_data: dict) -> str:
    """Execute a tool and return result as JSON string."""
    try:
        result = await _EXECUTORS[name](input_data)
        return json.dumps(result, ensure_ascii=False, default=str)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


async def _query_sessions(_input):
    return await gateway.sessions()


async def _query_agents(_input):
    return await gateway.agents()


async def _query_skills(_input):
    return await gateway.skills()


async def _query_models(_input):
    return await gateway.models()


async def _query_channels(_input):
    config = await gateway.config_read()
    return {"channels": config.get("channels", {})}


async def _query_health(_input):
    return await gateway.health()


async def _query_cron(_input):
    return await gateway.cron_jobs()


async def _query_bot_users(input_data):
    search = input_data.get("search", "")
    platform = input_data.get("platform", "")
    limit = input_data.get("limit", 50)
    async with async_session() as session:
        stmt = select(BotUser)
        if search:
            stmt = stmt.where(func.lower(BotUser.display_name).contains(search.lower()))
        if platform:
            stmt = stmt.where(func.lower(BotUser.platform) == platform.lower())
        stmt = stmt.limit(limit)
        result = await session.execute(stmt)
        rows = result.scalars().all()
    return {
        "users": [
            {
                "id": str(u.id),
                "display_name": u.display_name,
                "platform": u.platform,
                "platform_user_id": u.platform_user_id,
            }
            for u in rows
        ],
        "count": len(rows),
    }


async def _query_bot_groups(input_data):
    search = input_data.get("search", "")
    platform = input_data.get("platform", "")
    limit = input_data.get("limit", 50)
    async with async_session() as session:
        stmt = select(BotGroup)
        if search:
            stmt = stmt.where(func.lower(BotGroup.name).contains(search.lower()))
        if platform:
            stmt = stmt.where(func.lower(BotGroup.platform) == platform.lower())
        stmt = stmt.limit(limit)
        result = await session.execute(stmt)
        rows = result.scalars().all()
    return {
        "groups": [
            {
                "id": str(g.id),
                "name": g.name,
                "platform": g.platform,
                "platform_group_id": g.platform_group_id,
            }
            for g in rows
        ],
        "count": len(rows),
    }


async def _query_conversations(input_data):
    platform = input_data.get("platform", "")
    search = input_data.get("search", "")
    limit = input_data.get("limit", 30)
    async with async_session() as session:
        stmt = select(Conversation).order_by(desc(Conversation.timestamp))
        if platform:
            stmt = stmt.where(func.lower(Conversation.platform) == platform.lower())
        if search:
            stmt = stmt.where(Conversation.message.ilike(f"%{search}%"))
        stmt = stmt.limit(limit)
        result = await session.execute(stmt)
        rows = result.scalars().all()
    return {
        "conversations": [
            {
                "sender_type": c.sender_type,
                "sender_name": c.sender_name,
                "platform": c.platform,
                "message": c.message[:500],
                "timestamp": c.timestamp.isoformat() if c.timestamp else None,
            }
            for c in rows
        ],
        "count": len(rows),
    }


async def _query_usage(input_data):
    days = input_data.get("days", 7)
    return await gateway.usage_cost(days=days)


async def _query_dashboard(_input):
    try:
        agents = await gateway.agents()
        sessions = await gateway.sessions()
        skills = await gateway.skills()
        health = await gateway.health()
        return {
            "agents_count": len(agents.get("agents", [])),
            "sessions_count": len(sessions.get("sessions", [])),
            "skills_count": len(skills.get("skills", [])),
            "gateway_ok": health.get("ok", False),
        }
    except Exception as e:
        return {"error": str(e)}


_EXECUTORS = {
    "query_sessions": _query_sessions,
    "query_agents": _query_agents,
    "query_skills": _query_skills,
    "query_models": _query_models,
    "query_channels": _query_channels,
    "query_health": _query_health,
    "query_cron": _query_cron,
    "query_bot_users": _query_bot_users,
    "query_bot_groups": _query_bot_groups,
    "query_conversations": _query_conversations,
    "query_usage": _query_usage,
    "query_dashboard": _query_dashboard,
}
