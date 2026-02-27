import uuid
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlmodel import select
from sqlalchemy import desc

from auth import get_current_user, require_role
from database import async_session
from utils import utcnow
from models.notification import NotificationRule
from models.bot_group import BotGroup
from gateway_cli import gateway

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
async def create_rule(body: dict = Body(...), user=Depends(require_role("superadmin", "admin"))):
    event_type = body.get("event_type", "").strip()
    channel = body.get("channel", "telegram").strip()
    target = body.get("target", "").strip()
    if not event_type or not target:
        raise HTTPException(400, "event_type and target are required")

    rule = NotificationRule(
        event_type=event_type,
        channel=channel,
        target=target,
        target_name=body.get("target_name", ""),
        enabled=body.get("enabled", True),
        cooldown_minutes=body.get("cooldown_minutes", 30),
    )
    async with async_session() as session:
        session.add(rule)
        await session.commit()
        await session.refresh(rule)
    return _rule_to_dict(rule)


@notification_router.put("/rules/{rule_id}")
async def update_rule(rule_id: str, body: dict = Body(...), user=Depends(require_role("superadmin", "admin"))):
    async with async_session() as session:
        rule = await session.get(NotificationRule, uuid.UUID(rule_id))
        if not rule:
            raise HTTPException(404, "Rule not found")
        for field in ("event_type", "channel", "target", "target_name", "enabled", "cooldown_minutes"):
            if field in body:
                setattr(rule, field, body[field])
        rule.updated_at = utcnow()
        await session.commit()
        await session.refresh(rule)
    return _rule_to_dict(rule)


@notification_router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: str, user=Depends(require_role("superadmin", "admin"))):
    async with async_session() as session:
        rule = await session.get(NotificationRule, uuid.UUID(rule_id))
        if not rule:
            raise HTTPException(404, "Rule not found")
        await session.delete(rule)
        await session.commit()
    return {"status": "ok"}


@notification_router.post("/test")
async def test_notification(body: dict = Body(...), user=Depends(require_role("superadmin", "admin"))):
    """Send a test notification to verify the target is reachable."""
    channel = body.get("channel", "telegram")
    target = body.get("target", "")
    if not target:
        raise HTTPException(400, "target is required")
    message = "🔔 Test notification from OpenClaw Manager"
    try:
        await gateway.send_message(channel, target, message)
        return {"ok": True, "message": "Test notification sent"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


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
