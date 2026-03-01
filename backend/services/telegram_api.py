"""Telegram Bot API client for fetching user/group profiles."""

import json
import logging
import ssl
import urllib.request

logger = logging.getLogger(__name__)

_ssl_ctx = ssl.create_default_context()


def fetch_user_profile(user_id: str, bot_token: str) -> dict | None:
    """Fetch a Telegram user profile via the Bot API.

    Calls getChat and extracts display name and username.

    Returns:
        {"display_name": ..., "username": ...} or None on failure.
    """
    url = f"https://api.telegram.org/bot{bot_token}/getChat?chat_id={user_id}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5, context=_ssl_ctx) as resp:
            data = json.loads(resp.read().decode())
    except Exception:
        logger.debug("Failed to fetch Telegram user profile for %s", user_id)
        return None

    if not data.get("ok"):
        logger.debug(
            "Telegram API returned ok=false for user %s: %s",
            user_id,
            data.get("description", ""),
        )
        return None

    result = data.get("result", {})
    first_name = result.get("first_name", "")
    last_name = result.get("last_name", "")
    display_name = f"{first_name} {last_name}".strip() or None
    username = result.get("username")

    return {"display_name": display_name, "username": username}


def fetch_group_info(group_id: str, bot_token: str) -> dict | None:
    """Fetch a Telegram group/chat title via the Bot API.

    Calls getChat and extracts the group title.

    Returns:
        {"name": ...} or None on failure.
    """
    url = f"https://api.telegram.org/bot{bot_token}/getChat?chat_id={group_id}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5, context=_ssl_ctx) as resp:
            data = json.loads(resp.read().decode())
    except Exception:
        logger.debug("Failed to fetch Telegram group info for %s", group_id)
        return None

    if not data.get("ok"):
        logger.debug(
            "Telegram API returned ok=false for group %s: %s",
            group_id,
            data.get("description", ""),
        )
        return None

    result = data.get("result", {})
    name = result.get("title")
    if not name:
        logger.debug("Telegram group %s has no title", group_id)
        return None

    return {"name": name}
