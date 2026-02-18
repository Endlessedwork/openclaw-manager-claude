from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel
from datetime import datetime, timezone
from bson import ObjectId

from auth import (
    verify_password, create_access_token, create_refresh_token,
    decode_token, get_current_user,
)

auth_router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


@auth_router.post("/login")
async def login(body: LoginRequest, request: Request, response: Response):
    db = request.app.state.db
    user = await db.users.find_one({"username": body.username})
    if not user or not verify_password(body.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is disabled")

    user_id = str(user["_id"])
    access_token = create_access_token(user_id, user["username"], user["role"])
    refresh_token = create_refresh_token(user_id)

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=7 * 24 * 3600,
        path="/api/auth",
    )

    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login": datetime.now(timezone.utc)}}
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "username": user["username"],
            "name": user["name"],
            "role": user["role"],
        },
    }


@auth_router.post("/refresh")
async def refresh(request: Request, response: Response):
    db = request.app.state.db
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")

    payload = decode_token(refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user = await db.users.find_one({"_id": ObjectId(payload["sub"]), "is_active": True})
    if not user:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    user_id = str(user["_id"])
    new_access = create_access_token(user_id, user["username"], user["role"])
    new_refresh = create_refresh_token(user_id)

    response.set_cookie(
        key="refresh_token",
        value=new_refresh,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=7 * 24 * 3600,
        path="/api/auth",
    )

    return {
        "access_token": new_access,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "username": user["username"],
            "name": user["name"],
            "role": user["role"],
        },
    }


@auth_router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("refresh_token", path="/api/auth")
    return {"status": "ok"}


@auth_router.get("/me")
async def me(user=Depends(get_current_user)):
    return user
