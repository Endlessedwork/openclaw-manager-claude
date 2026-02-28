import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel
from sqlmodel import select
from sqlalchemy import desc

from auth import get_current_user, require_role
from database import async_session
from utils import utcnow
from models.notification import NotificationRule
from models.bot_group import BotGroup
from gateway_cli import gateway

logger = logging.getLogger(__name__)


class CreateRuleRequest(BaseModel):
    event_type: str
    channel: str = "telegram"
    target: str
    target_name: str = ""
    enabled: bool = True
    cooldown_minutes: int = 30


class UpdateRuleRequest(BaseModel):
    event_type: str | None = None
    channel: str | None = None
    target: str | None = None
    target_name: str | None = None
    enabled: bool | None = None
    cooldown_minutes: int | None = None


class TestNotificationRequest(BaseModel):
    channel: str = "telegram"
    target: str

notification_router = APIRouter(prefix="/notifications", tags=["notifications"])

# Available event types (extensible)
EVENT_TYPES = [
    {
        "value": "model_fallback",
        "label": "Model Fallback",
        "description": "When sessions fall back to non-primary models",
    },
]


def _rule_to_dict(r: NotificationRule) -> dict:
    return {
        "id": str(r.id),
        "event_type": r.event_type,
        "channel": r.channel,
        "target": r.target,
        "target_name": r.target_name,
        "enabled": r.enabled,
        "cooldown_minutes": r.cooldown_minutes,
        "last_notified_at": r.last_notified_at.isoformat() if r.last_notified_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


@notification_router.get("/event-types")
async def list_event_types(user=Depends(get_current_user)):
    return EVENT_TYPES


@notification_router.get("/rules")
async def list_rules(user=Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(NotificationRule).order_by(desc(NotificationRule.created_at))
        )
        rules = result.scalars().all()
    return [_rule_to_dict(r) for r in rules]


@notification_router.post("/rules")
async def create_rule(body: CreateRuleRequest, user=Depends(require_role("superadmin", "admin"))):
    if not body.event_type.strip() or not body.target.strip():
        raise HTTPException(400, "event_type and target are required")

    rule = NotificationRule(
        event_type=body.event_type.strip(),
        channel=body.channel.strip(),
        target=body.target.strip(),
        target_name=body.target_name,
        enabled=body.enabled,
        cooldown_minutes=body.cooldown_minutes,
    )
    async with async_session() as session:
        session.add(rule)
        await session.commit()
        await session.refresh(rule)
    return _rule_to_dict(rule)


@notification_router.put("/rules/{rule_id}")
async def update_rule(rule_id: str, body: UpdateRuleRequest, user=Depends(require_role("superadmin", "admin"))):
    try:
        rid = uuid.UUID(rule_id)
    except ValueError:
        raise HTTPException(400, "Invalid rule ID")

    async with async_session() as session:
        rule = await session.get(NotificationRule, rid)
        if not rule:
            raise HTTPException(404, "Rule not found")
        for field in ("event_type", "channel", "target", "target_name", "enabled", "cooldown_minutes"):
            value = getattr(body, field)
            if value is not None:
                setattr(rule, field, value)
        rule.updated_at = utcnow()
        await session.commit()
        await session.refresh(rule)
    return _rule_to_dict(rule)


@notification_router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: str, user=Depends(require_role("superadmin", "admin"))):
    try:
        rid = uuid.UUID(rule_id)
    except ValueError:
        raise HTTPException(400, "Invalid rule ID")

    async with async_session() as session:
        rule = await session.get(NotificationRule, rid)
        if not rule:
            raise HTTPException(404, "Rule not found")
        await session.delete(rule)
        await session.commit()
    return {"status": "ok"}


@notification_router.post("/test")
async def test_notification(body: TestNotificationRequest, user=Depends(require_role("superadmin", "admin"))):
    """Send a test notification to verify the target is reachable."""
    if not body.target.strip():
        raise HTTPException(400, "target is required")
    message = "🔔 Test notification from OpenClaw Manager"
    try:
        await gateway.send_message(body.channel, body.target.strip(), message)
        return {"ok": True, "message": "Test notification sent"}
    except Exception as e:
        logger.warning(f"Test notification failed: {e}")
        return {"ok": False, "error": "Failed to send notification. Check server logs."}


@notification_router.get("/groups")
async def list_notification_groups(user=Depends(get_current_user)):
    """Return available Telegram groups from bot_groups table."""
    async with async_session() as session:
        result = await session.execute(
            select(BotGroup).where(BotGroup.platform == "telegram")
        )
        groups = [
            {
                "id": g.platform_group_id.split("_", 1)[1] if "_" in g.platform_group_id else g.platform_group_id,
                "name": g.name or g.platform_group_id,
                "platform": g.platform,
            }
            for g in result.scalars().all()
        ]
    return groups
