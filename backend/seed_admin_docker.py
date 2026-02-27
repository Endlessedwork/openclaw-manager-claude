#!/usr/bin/env python3
"""Non-interactive superadmin seed for Docker. Reads ADMIN_USER, ADMIN_PASSWORD from env."""
import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

sys.path.insert(0, str(Path(__file__).parent))
from auth import hash_password
from database import async_session, init_db
from models.user import User
from sqlmodel import select


async def seed():
    await init_db()

    async with async_session() as session:
        existing = (
            await session.execute(select(User).where(User.role == "superadmin"))
        ).scalar_one_or_none()
        if existing:
            print(f"  Superadmin already exists: {existing.username}")
            return

    username = os.environ.get("ADMIN_USER", "admin")
    password = os.environ.get("ADMIN_PASSWORD", "")
    name = os.environ.get("ADMIN_NAME", username)

    if not password:
        print("  ADMIN_PASSWORD not set, skipping admin seed")
        return

    async with async_session() as session:
        session.add(
            User(
                username=username,
                hashed_password=hash_password(password),
                name=name,
                role="superadmin",
            )
        )
        await session.commit()
    print(f"  Superadmin user created: {username}")


if __name__ == "__main__":
    asyncio.run(seed())
