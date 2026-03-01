"""
LINE Messaging API client for fetching user/group profiles.

Pure synchronous functions — call via ``run_in_executor`` from async code.
"""

import json
import logging
import ssl
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

_ssl_ctx = ssl.create_default_context()

LINE_API_BASE = "https://api.line.me/v2/bot"


def fetch_user_profile(user_id: str, access_token: str) -> dict | None:
    """Fetch a LINE user profile by user ID.

    Calls GET https://api.line.me/v2/bot/profile/{userId}

    Returns ``{"display_name": ..., "avatar_url": ...}`` or None on failure.
    """
    url = f"{LINE_API_BASE}/profile/{user_id}"
    req = Request(url, method="GET")
    req.add_header("Authorization", f"Bearer {access_token}")

    try:
        with urlopen(req, timeout=5, context=_ssl_ctx) as resp:
            data = json.loads(resp.read().decode())
            return {
                "display_name": data.get("displayName"),
                "avatar_url": data.get("pictureUrl"),
            }
    except HTTPError as e:
        logger.debug("LINE fetch_user_profile HTTP %s for user %s: %s", e.code, user_id, e.reason)
    except URLError as e:
        logger.debug("LINE fetch_user_profile URL error for user %s: %s", user_id, e.reason)
    except Exception as e:
        logger.debug("LINE fetch_user_profile error for user %s: %s", user_id, e)

    return None


def fetch_group_summary(group_id: str, access_token: str) -> dict | None:
    """Fetch a LINE group summary by group ID.

    Calls GET https://api.line.me/v2/bot/group/{groupId}/summary

    Returns ``{"name": ..., "picture_url": ...}`` or None on failure.
    """
    url = f"{LINE_API_BASE}/group/{group_id}/summary"
    req = Request(url, method="GET")
    req.add_header("Authorization", f"Bearer {access_token}")

    try:
        with urlopen(req, timeout=5, context=_ssl_ctx) as resp:
            data = json.loads(resp.read().decode())
            return {
                "name": data.get("groupName"),
                "picture_url": data.get("pictureUrl"),
            }
    except HTTPError as e:
        logger.debug("LINE fetch_group_summary HTTP %s for group %s: %s", e.code, group_id, e.reason)
    except URLError as e:
        logger.debug("LINE fetch_group_summary URL error for group %s: %s", group_id, e.reason)
    except Exception as e:
        logger.debug("LINE fetch_group_summary error for group %s: %s", group_id, e)

    return None
