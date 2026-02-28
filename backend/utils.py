"""Shared utilities for the backend."""
from datetime import datetime, timezone, timedelta

BKK = timezone(timedelta(hours=7))


def now_bkk() -> datetime:
    """Return current Bangkok time (UTC+7) as a naive datetime (no tzinfo).

    NOTE: This is NOT UTC — it returns Asia/Bangkok local time.
    asyncpg requires naive datetimes for TIMESTAMP WITHOUT TIME ZONE columns.
    All timestamps in the database are stored in Bangkok time.
    """
    return datetime.now(BKK).replace(tzinfo=None)


# Alias: named for legacy reasons but returns Bangkok time, NOT UTC.
# See now_bkk() docstring for details.
utcnow = now_bkk
