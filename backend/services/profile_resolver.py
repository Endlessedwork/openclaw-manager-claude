"""Profile resolver with DB / disk / API fallback chain.

Resolves platform IDs to display names using a 3-step strategy:
1. PostgreSQL batch lookup (bot_users / bot_groups)
2. Disk profile files (~/.openclaw/workspace/shared/{users,groups}/profiles/)
3. Platform API calls (LINE Messaging API / Telegram Bot API)

Any names discovered in steps 2 or 3 are cached back to PostgreSQL so
subsequent lookups hit step 1 directly.
"""

import asyncio
import json
import logging
import uuid
from pathlib import Path

from sqlalchemy import func, text as sa_text
from sqlmodel import select

from database import async_session
from models.bot_user import BotUser
from models.bot_group import BotGroup
from services import line_api, telegram_api
from utils import utcnow

logger = logging.getLogger(__name__)

PROFILES_BASE = Path.home() / ".openclaw" / "workspace" / "shared"


async def resolve_display_names(
    direct_ids: dict[str, str],
    group_ids: dict[str, str],
    config: dict,
) -> tuple[dict[str, str], dict[str, str]]:
    """Resolve platform IDs to display names via DB -> disk -> API fallback.

    Args:
        direct_ids: ``{platform_id: platform_name}`` for direct/user sessions.
        group_ids: ``{platform_id: platform_name}`` for group sessions.
        config: The openclaw.json configuration dict (used to extract API tokens).

    Returns:
        A tuple ``(user_names, group_names)`` where each is
        ``{lowercase_platform_id: display_name}``.
    """
    if not direct_ids and not group_ids:
        return {}, {}

    user_names: dict[str, str] = {}
    group_names: dict[str, str] = {}

    # Track which IDs were resolved by step 1 (DB) so we know what to cache later
    db_resolved_users: set[str] = set()
    db_resolved_groups: set[str] = set()

    async with async_session() as db:
        # ── Step 1: PostgreSQL batch lookup ──────────────────────────────
        if direct_ids:
            res = await db.execute(
                select(BotUser.platform_user_id, BotUser.display_name).where(
                    func.lower(BotUser.platform_user_id).in_(
                        [x.lower() for x in direct_ids]
                    )
                )
            )
            for row in res.all():
                if row[1]:
                    user_names[row[0].lower()] = row[1]
                    db_resolved_users.add(row[0].lower())

        if group_ids:
            res = await db.execute(
                select(BotGroup.platform_group_id, BotGroup.name).where(
                    func.lower(BotGroup.platform_group_id).in_(
                        [x.lower() for x in group_ids]
                    )
                )
            )
            for row in res.all():
                if row[1]:
                    group_names[row[0].lower()] = row[1]
                    db_resolved_groups.add(row[0].lower())

        # ── Step 2: Disk profile backfill ────────────────────────────────
        missing_users = {
            pid: pl for pid, pl in direct_ids.items() if pid.lower() not in user_names
        }
        missing_groups = {
            pid: pl for pid, pl in group_ids.items() if pid.lower() not in group_names
        }

        disk_resolved_users: dict[str, tuple[str, str, str]] = {}  # lpid -> (raw_id, platform, name)
        disk_resolved_groups: dict[str, tuple[str, str, str, int, dict | None]] = {}

        if missing_users:
            disk_resolved_users = _backfill_from_disk_users(missing_users)
            for lpid, (raw_id, platform, name) in disk_resolved_users.items():
                user_names[lpid] = name

        if missing_groups:
            disk_resolved_groups = _backfill_from_disk_groups(missing_groups)
            for lpid, (raw_id, platform, name, _mc, _members) in disk_resolved_groups.items():
                group_names[lpid] = name

        # ── Step 3: Platform API fallback ────────────────────────────────
        still_missing_users = {
            pid: pl for pid, pl in direct_ids.items() if pid.lower() not in user_names
        }
        still_missing_groups = {
            pid: pl for pid, pl in group_ids.items() if pid.lower() not in group_names
        }

        api_resolved_users: dict[str, tuple[str, str, str]] = {}  # lpid -> (raw_id, platform, name)
        api_resolved_groups: dict[str, tuple[str, str, str]] = {}

        if still_missing_users:
            api_resolved_users = await _fetch_from_api_users(still_missing_users, config)
            for lpid, (raw_id, platform, name) in api_resolved_users.items():
                user_names[lpid] = name

        if still_missing_groups:
            api_resolved_groups = await _fetch_from_api_groups(still_missing_groups, config)
            for lpid, (raw_id, platform, name) in api_resolved_groups.items():
                group_names[lpid] = name

        # ── Step 4: Cache newly discovered names to DB ───────────────────
        needs_commit = False

        for lpid, (raw_id, platform, name) in {**disk_resolved_users, **api_resolved_users}.items():
            if lpid in db_resolved_users:
                continue
            await db.execute(
                sa_text("""
                    INSERT INTO bot_users
                        (id, platform_user_id, platform, display_name,
                         role, status, created_at, updated_at)
                    VALUES (:id, :pid, :platform, :name, '', '', :now, :now)
                    ON CONFLICT (platform_user_id) DO UPDATE SET
                        display_name = EXCLUDED.display_name,
                        updated_at = EXCLUDED.updated_at
                """),
                {
                    "id": str(uuid.uuid4()),
                    "pid": raw_id,
                    "platform": platform,
                    "name": name,
                    "now": utcnow(),
                },
            )
            needs_commit = True

        for lpid, entry in {**disk_resolved_groups, **api_resolved_groups}.items():
            if lpid in db_resolved_groups:
                continue
            # disk entries have 5 elements, API entries have 3
            if len(entry) == 5:
                raw_id, platform, name, member_count, members = entry
            else:
                raw_id, platform, name = entry
                member_count = 0
                members = None
            await db.execute(
                sa_text("""
                    INSERT INTO bot_groups
                        (id, platform_group_id, platform, name, status,
                         member_count, members, created_at, updated_at)
                    VALUES (:id, :pid, :platform, :name, 'active',
                            :member_count, :members, :now, :now)
                    ON CONFLICT (platform_group_id) DO UPDATE SET
                        name = EXCLUDED.name,
                        member_count = EXCLUDED.member_count,
                        members = EXCLUDED.members,
                        updated_at = EXCLUDED.updated_at
                """),
                {
                    "id": str(uuid.uuid4()),
                    "pid": raw_id,
                    "platform": platform,
                    "name": name,
                    "member_count": member_count,
                    "members": json.dumps(members) if members else None,
                    "now": utcnow(),
                },
            )
            needs_commit = True

        if needs_commit:
            await db.commit()

    return user_names, group_names


# ── Private helpers ──────────────────────────────────────────────────────────


def _backfill_from_disk_users(
    missing: dict[str, str],
) -> dict[str, tuple[str, str, str]]:
    """Scan user profile JSON files on disk for missing user names.

    Args:
        missing: ``{platform_id: platform_name}`` for IDs not yet resolved.

    Returns:
        ``{lowercase_pid: (raw_id, platform, display_name)}``
    """
    result: dict[str, tuple[str, str, str]] = {}
    udir = PROFILES_BASE / "users" / "profiles"
    if not udir.is_dir():
        return result

    file_map: dict[str, Path] = {}
    for f in udir.glob("*.json"):
        parts = f.stem.split("_", 1)
        if len(parts) == 2:
            file_map[parts[1].lower()] = f

    for pid, platform in missing.items():
        fpath = file_map.get(pid.lower())
        if not fpath:
            continue
        try:
            data = json.loads(fpath.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        name = data.get("display_name", "")
        if not name:
            continue
        raw_id = data.get("user_id", "") or pid
        result[pid.lower()] = (raw_id, platform, name)

    return result


def _backfill_from_disk_groups(
    missing: dict[str, str],
) -> dict[str, tuple[str, str, str, int, dict | None]]:
    """Scan group profile JSON files on disk for missing group names.

    Args:
        missing: ``{platform_id: platform_name}`` for IDs not yet resolved.

    Returns:
        ``{lowercase_pid: (raw_id, platform, name, member_count, members)}``
    """
    result: dict[str, tuple[str, str, str, int, dict | None]] = {}
    gdir = PROFILES_BASE / "groups" / "profiles"
    if not gdir.is_dir():
        return result

    file_map: dict[str, Path] = {}
    for f in gdir.glob("*.json"):
        parts = f.stem.split("_", 1)
        if len(parts) == 2:
            file_map[parts[1].lower()] = f

    for pid, platform in missing.items():
        fpath = file_map.get(pid.lower())
        if not fpath:
            continue
        try:
            data = json.loads(fpath.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        name = data.get("group_name", "")
        if not name:
            continue
        raw_id = data.get("group_id", "") or pid
        members = data.get("members", {})
        member_count = len(members) if isinstance(members, dict) else 0
        result[pid.lower()] = (raw_id, platform, name, member_count, members if members else None)

    return result


async def _fetch_from_api_users(
    missing: dict[str, str],
    config: dict,
) -> dict[str, tuple[str, str, str]]:
    """Fetch missing user profiles from platform APIs (LINE / Telegram).

    Args:
        missing: ``{platform_id: platform_name}`` for IDs not yet resolved.
        config: The openclaw.json config dict.

    Returns:
        ``{lowercase_pid: (raw_id, platform, display_name)}``
    """
    result: dict[str, tuple[str, str, str]] = {}
    channels = config.get("channels", {})
    line_token = channels.get("line", {}).get("channelAccessToken", "")
    telegram_token = channels.get("telegram", {}).get("botToken", "")
    loop = asyncio.get_running_loop()

    for pid, platform in missing.items():
        profile = None
        if platform == "line" and line_token:
            profile = await loop.run_in_executor(
                None, line_api.fetch_user_profile, pid, line_token
            )
        elif platform == "telegram" and telegram_token:
            profile = await loop.run_in_executor(
                None, telegram_api.fetch_user_profile, pid, telegram_token
            )

        if profile and profile.get("display_name"):
            result[pid.lower()] = (pid, platform, profile["display_name"])

    return result


async def _fetch_from_api_groups(
    missing: dict[str, str],
    config: dict,
) -> dict[str, tuple[str, str, str]]:
    """Fetch missing group profiles from platform APIs (LINE / Telegram).

    Args:
        missing: ``{platform_id: platform_name}`` for IDs not yet resolved.
        config: The openclaw.json config dict.

    Returns:
        ``{lowercase_pid: (raw_id, platform, name)}``
    """
    result: dict[str, tuple[str, str, str]] = {}
    channels = config.get("channels", {})
    line_token = channels.get("line", {}).get("channelAccessToken", "")
    telegram_token = channels.get("telegram", {}).get("botToken", "")
    loop = asyncio.get_running_loop()

    for pid, platform in missing.items():
        info = None
        if platform == "line" and line_token:
            info = await loop.run_in_executor(
                None, line_api.fetch_group_summary, pid, line_token
            )
        elif platform == "telegram" and telegram_token:
            info = await loop.run_in_executor(
                None, telegram_api.fetch_group_info, pid, telegram_token
            )

        if info and info.get("name"):
            result[pid.lower()] = (pid, platform, info["name"])

    return result
