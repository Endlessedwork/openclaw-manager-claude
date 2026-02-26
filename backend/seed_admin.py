#!/usr/bin/env python3
"""Create the first admin user for OpenClaw Manager."""
import asyncio
import getpass
import os
import sys
from pathlib import Path
from datetime import datetime, timezone

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

sys.path.insert(0, str(Path(__file__).parent))
from auth import hash_password
from database import async_session, init_db
from models.user import User
from sqlmodel import select


async def seed():
    # Ensure tables exist
    await init_db()

    async with async_session() as session:
        existing = (await session.execute(
            select(User).where(User.role == "admin")
        )).scalar_one_or_none()
        if existing:
            print(f"Admin already exists: {existing.username}")
            return

    username = input("Admin username: ").strip()
    name = input("Admin display name: ").strip() or username
    password = getpass.getpass("Admin password: ").strip()

    if not username or not password:
        print("Username and password are required")
        sys.exit(1)

    async with async_session() as session:
        session.add(User(
            username=username,
            hashed_password=hash_password(password),
            name=name,
            role="admin",
        ))
        await session.commit()

    print(f"Admin user created: {username}")


if __name__ == "__main__":
    asyncio.run(seed())
