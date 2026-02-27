"""Shared utilities for the backend."""
from datetime import datetime, timezone, timedelta

BKK = timezone(timedelta(hours=7))


def now_bkk() -> datetime:
    """Return current Bangkok time as a naive datetime (no tzinfo).

    asyncpg requires naive datetimes for TIMESTAMP WITHOUT TIME ZONE columns.
    """
    return datetime.now(BKK).replace(tzinfo=None)


# Keep backward-compat alias used by model defaults & routes
utcnow = now_bkk
