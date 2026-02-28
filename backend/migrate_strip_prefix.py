"""One-time migration: strip platform prefix from bot_users.platform_user_id
and bot_groups.platform_group_id.

Before: "line_Ubc9c7dda..." / "telegram_90988085"
After:  "Ubc9c7dda..." / "90988085"

The `platform` column already stores "line"/"telegram" separately,
so the prefix was redundant and caused lookup mismatches with
conversations.sender_platform_id (which stores raw IDs).
"""

import asyncio
import os

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is required")

engine = create_async_engine(DATABASE_URL, echo=False)
async_session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def main():
    async with async_session_factory() as session:
        # -- bot_users --
        result = await session.execute(text(
            "SELECT count(*) FROM bot_users "
            "WHERE platform != '' AND platform_user_id LIKE platform || '_%'"
        ))
        prefixed_users = result.scalar()

        # -- bot_groups --
        result = await session.execute(text(
            "SELECT count(*) FROM bot_groups "
            "WHERE platform != '' AND platform_group_id LIKE platform || '_%'"
        ))
        prefixed_groups = result.scalar()

        print(f"Found: {prefixed_users} prefixed users, {prefixed_groups} prefixed groups")

        if prefixed_users == 0 and prefixed_groups == 0:
            print("Nothing to migrate.")
            await engine.dispose()
            return

        # Strip prefix: "line_Uxxx" -> "Uxxx"
        result = await session.execute(text(
            "UPDATE bot_users "
            "SET platform_user_id = SUBSTRING(platform_user_id FROM LENGTH(platform) + 2) "
            "WHERE platform != '' "
            "  AND platform_user_id LIKE platform || '_%' "
            "RETURNING id"
        ))
        updated_users = len(result.all())

        result = await session.execute(text(
            "UPDATE bot_groups "
            "SET platform_group_id = SUBSTRING(platform_group_id FROM LENGTH(platform) + 2) "
            "WHERE platform != '' "
            "  AND platform_group_id LIKE platform || '_%' "
            "RETURNING id"
        ))
        updated_groups = len(result.all())

        await session.commit()
        print(f"Migrated: {updated_users} users, {updated_groups} groups")

        # Verify
        result = await session.execute(text(
            "SELECT platform_user_id, platform, display_name FROM bot_users LIMIT 5"
        ))
        print("\nSample bot_users after migration:")
        for r in result.all():
            print(f"  {r[0]} ({r[1]}) - {r[2]}")

    await engine.dispose()
    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
