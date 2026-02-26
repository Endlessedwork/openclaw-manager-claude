from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid as _uuid

from sqlmodel import select

from auth import hash_password, get_current_user, require_role
from models.user import User

user_router = APIRouter(prefix="/users", tags=["users"])

VALID_ROLES = {"admin", "editor", "viewer"}


class CreateUserRequest(BaseModel):
    username: str
    password: str  # min 8 chars enforced below
    name: str
    role: str = "viewer"


class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


@user_router.get("")
async def list_users(request: Request, user=Depends(require_role("admin"))):
    session_factory = request.app.state.async_session
    async with session_factory() as session:
        result = await session.execute(select(User))
        users = result.scalars().all()
    return [
        {
            "id": str(u.id),
            "username": u.username,
            "name": u.name,
            "role": u.role,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "last_login": u.last_login.isoformat() if u.last_login else None,
        }
        for u in users
    ]


@user_router.post("")
async def create_user(body: CreateUserRequest, request: Request, user=Depends(require_role("admin"))):
    session_factory = request.app.state.async_session
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if body.role not in VALID_ROLES:
        raise HTTPException(400, f"Role must be one of: {', '.join(VALID_ROLES)}")

    async with session_factory() as session:
        existing = (await session.execute(
            select(User).where(User.username == body.username)
        )).scalar_one_or_none()
        if existing:
            raise HTTPException(409, "Username already taken")
        new_user = User(
            username=body.username,
            hashed_password=hash_password(body.password),
            name=body.name,
            role=body.role,
        )
        session.add(new_user)
        await session.commit()
        await session.refresh(new_user)
    return {"id": str(new_user.id), "username": new_user.username, "role": new_user.role}


@user_router.put("/{user_id}")
async def update_user(user_id: str, body: UpdateUserRequest, request: Request, user=Depends(require_role("admin"))):
    session_factory = request.app.state.async_session
    try:
        user_uuid = _uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(400, "Invalid user ID")

    async with session_factory() as session:
        target = await session.get(User, user_uuid)
        if not target:
            raise HTTPException(404, "User not found")

        # Prevent admin from locking themselves out
        if user_id == user["id"]:
            if body.role is not None and body.role != "admin":
                raise HTTPException(400, "Cannot demote your own admin account")
            if body.is_active is not None and not body.is_active:
                raise HTTPException(400, "Cannot deactivate your own account")

        if body.name is not None:
            target.name = body.name
        if body.role is not None:
            if body.role not in VALID_ROLES:
                raise HTTPException(400, f"Role must be one of: {', '.join(VALID_ROLES)}")
            target.role = body.role
        if body.is_active is not None:
            target.is_active = body.is_active
        if body.password is not None:
            target.hashed_password = hash_password(body.password)
        target.updated_at = datetime.now(timezone.utc)
        await session.commit()

    return {"status": "ok", "id": user_id}


@user_router.delete("/{user_id}")
async def delete_user(user_id: str, request: Request, user=Depends(require_role("admin"))):
    session_factory = request.app.state.async_session
    try:
        user_uuid = _uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(400, "Invalid user ID")

    if user_id == user["id"]:
        raise HTTPException(400, "Cannot delete your own account")

    async with session_factory() as session:
        target = await session.get(User, user_uuid)
        if not target:
            raise HTTPException(404, "User not found")
        await session.delete(target)
        await session.commit()
    return {"status": "ok"}
