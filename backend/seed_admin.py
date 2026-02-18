#!/usr/bin/env python3
"""Create the first admin user for OpenClaw Manager."""
import asyncio
import getpass
import os
import sys
from pathlib import Path
from datetime import datetime, timezone

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / ".env")

sys.path.insert(0, str(Path(__file__).parent))
from auth import hash_password


async def seed():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    existing = await db.users.find_one({"role": "admin"})
    if existing:
        print(f"Admin already exists: {existing['username']}")
        client.close()
        return

    username = input("Admin username: ").strip()
    name = input("Admin display name: ").strip() or username
    password = getpass.getpass("Admin password: ").strip()

    if not username or not password:
        print("Username and password are required")
        client.close()
        sys.exit(1)

    now = datetime.now(timezone.utc)
    await db.users.insert_one({
        "username": username,
        "hashed_password": hash_password(password),
        "name": name,
        "role": "admin",
        "is_active": True,
        "created_at": now,
        "updated_at": now,
        "last_login": None,
    })

    await db.users.create_index("username", unique=True)

    print(f"Admin user created: {username}")
    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
