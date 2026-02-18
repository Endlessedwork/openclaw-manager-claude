from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timezone
from bson import ObjectId

from auth import hash_password, get_current_user, require_role

user_router = APIRouter(prefix="/users", tags=["users"])

VALID_ROLES = {"admin", "editor", "viewer"}


class CreateUserRequest(BaseModel):
    email: EmailStr
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
    db = request.app.state.db
    users = await db.users.find({}, {"hashed_password": 0}).to_list(200)
    return [
        {
            "id": str(u["_id"]),
            "email": u["email"],
            "name": u["name"],
            "role": u["role"],
            "is_active": u.get("is_active", True),
            "created_at": u.get("created_at"),
            "last_login": u.get("last_login"),
        }
        for u in users
    ]


@user_router.post("")
async def create_user(body: CreateUserRequest, request: Request, user=Depends(require_role("admin"))):
    db = request.app.state.db
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if body.role not in VALID_ROLES:
        raise HTTPException(400, f"Role must be one of: {', '.join(VALID_ROLES)}")
    existing = await db.users.find_one({"email": body.email})
    if existing:
        raise HTTPException(409, "Email already registered")
    now = datetime.now(timezone.utc)
    result = await db.users.insert_one({
        "email": body.email,
        "hashed_password": hash_password(body.password),
        "name": body.name,
        "role": body.role,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
        "last_login": None,
    })
    return {"id": str(result.inserted_id), "email": body.email, "role": body.role}


@user_router.put("/{user_id}")
async def update_user(user_id: str, body: UpdateUserRequest, request: Request, user=Depends(require_role("admin"))):
    db = request.app.state.db
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(400, "Invalid user ID")

    target = await db.users.find_one({"_id": oid})
    if not target:
        raise HTTPException(404, "User not found")

    # Prevent admin from locking themselves out
    if user_id == user["id"]:
        if body.role is not None and body.role != "admin":
            raise HTTPException(400, "Cannot demote your own admin account")
        if body.is_active is not None and not body.is_active:
            raise HTTPException(400, "Cannot deactivate your own account")

    updates = {"updated_at": datetime.now(timezone.utc)}
    if body.name is not None:
        updates["name"] = body.name
    if body.role is not None:
        if body.role not in VALID_ROLES:
            raise HTTPException(400, f"Role must be one of: {', '.join(VALID_ROLES)}")
        updates["role"] = body.role
    if body.is_active is not None:
        updates["is_active"] = body.is_active
    if body.password is not None:
        updates["hashed_password"] = hash_password(body.password)

    await db.users.update_one({"_id": oid}, {"$set": updates})
    return {"status": "ok", "id": user_id}


@user_router.delete("/{user_id}")
async def delete_user(user_id: str, request: Request, user=Depends(require_role("admin"))):
    db = request.app.state.db
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(400, "Invalid user ID")

    if user_id == user["id"]:
        raise HTTPException(400, "Cannot delete your own account")

    result = await db.users.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(404, "User not found")
    return {"status": "ok"}
