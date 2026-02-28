import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from sqlmodel import select

from auth import require_role
from database import async_session
from utils import utcnow
from models.app_setting import AppSetting

logger = logging.getLogger(__name__)

SETTING_KEYS = ("app_name", "app_subtitle", "app_version")
DEFAULTS = {"app_name": "W.I.N.E", "app_subtitle": "Operation Control", "app_version": "3.0"}

settings_router = APIRouter(prefix="/settings", tags=["settings"])


class UpdateSettingsRequest(BaseModel):
    app_name: Optional[str] = None
    app_subtitle: Optional[str] = None
    app_version: Optional[str] = None


async def _get_all_settings() -> dict:
    """Read all branding settings, filling defaults for missing keys."""
    result = dict(DEFAULTS)
    async with async_session() as session:
        rows = (await session.execute(
            select(AppSetting).where(AppSetting.key.in_(SETTING_KEYS))
        )).scalars().all()
        for row in rows:
            result[row.key] = row.value
    return result


@settings_router.get("")
async def get_settings():
    """Public endpoint — returns branding settings (no auth required)."""
    return await _get_all_settings()


@settings_router.put("")
async def update_settings(
    body: UpdateSettingsRequest,
    user=Depends(require_role("superadmin", "admin")),
):
    """Admin+ — upsert provided branding fields."""
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return await _get_all_settings()

    now = utcnow()
    async with async_session() as session:
        for key, value in updates.items():
            existing = (await session.execute(
                select(AppSetting).where(AppSetting.key == key)
            )).scalar_one_or_none()
            if existing:
                existing.value = value
                existing.updated_at = now
            else:
                session.add(AppSetting(key=key, value=value))
        await session.commit()

    return await _get_all_settings()
