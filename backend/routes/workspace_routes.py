import uuid as _uuid
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlmodel import select
from sqlalchemy import desc

from auth import get_current_user, require_role
from database import async_session
from models.bot_user import BotUser
from models.bot_group import BotGroup
from models.knowledge import KnowledgeArticle
from models.document import WorkspaceDocument

workspace_router = APIRouter(prefix="/workspace", tags=["workspace"])


@workspace_router.get("/users")
async def list_workspace_users(user=Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(select(BotUser))
        users = result.scalars().all()
    return [
        {
            "id": str(u.id),
            "_file": str(u.id),
            "user_id": u.platform_user_id,
            "platform_user_id": u.platform_user_id,
            "platform": u.platform,
            "display_name": u.display_name,
            "avatar_url": u.avatar_url,
            "role": u.role,
            "status": u.status,
            "notes": u.notes,
            "metadata": u.meta,
            "first_seen_at": u.first_seen_at.isoformat() if u.first_seen_at else None,
            "last_seen_at": u.last_seen_at.isoformat() if u.last_seen_at else None,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "updated_at": u.updated_at.isoformat() if u.updated_at else None,
        }
        for u in users
    ]


@workspace_router.patch("/users/{user_id}")
async def patch_workspace_user(
    user_id: str,
    updates: dict = Body(...),
    user=Depends(require_role("superadmin", "admin")),
):
    allowed = {"role", "status", "notes"}
    invalid = set(updates.keys()) - allowed
    if invalid:
        raise HTTPException(400, f"Cannot update fields: {', '.join(invalid)}")

    try:
        uid = _uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(400, "Invalid user ID")

    async with async_session() as session:
        bot_user = await session.get(BotUser, uid)
        if not bot_user:
            raise HTTPException(404, "User profile not found")
        for field, value in updates.items():
            setattr(bot_user, field, value)
        await session.commit()
        await session.refresh(bot_user)
    return {
        "id": str(bot_user.id),
        "_file": str(bot_user.id),
        "user_id": bot_user.platform_user_id,
        "platform_user_id": bot_user.platform_user_id,
        "platform": bot_user.platform,
        "display_name": bot_user.display_name,
        "avatar_url": bot_user.avatar_url,
        "role": bot_user.role,
        "status": bot_user.status,
        "notes": bot_user.notes,
        "metadata": bot_user.meta,
        "first_seen_at": bot_user.first_seen_at.isoformat() if bot_user.first_seen_at else None,
        "last_seen_at": bot_user.last_seen_at.isoformat() if bot_user.last_seen_at else None,
        "created_at": bot_user.created_at.isoformat() if bot_user.created_at else None,
        "updated_at": bot_user.updated_at.isoformat() if bot_user.updated_at else None,
    }


@workspace_router.get("/groups")
async def list_workspace_groups(user=Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(select(BotGroup))
        groups = result.scalars().all()
    return [
        {
            "id": str(g.id),
            "_file": str(g.id),
            "group_id": g.platform_group_id,
            "platform_group_id": g.platform_group_id,
            "group_name": g.name,
            "name": g.name,
            "platform": g.platform,
            "status": g.status,
            "member_count": g.member_count,
            "members": g.members,
            "assigned_agent_id": g.assigned_agent_id,
            "metadata": g.meta,
            "created_at": g.created_at.isoformat() if g.created_at else None,
            "updated_at": g.updated_at.isoformat() if g.updated_at else None,
        }
        for g in groups
    ]


@workspace_router.patch("/groups/{group_id}")
async def patch_workspace_group(
    group_id: str,
    updates: dict = Body(...),
    user=Depends(require_role("superadmin", "admin")),
):
    allowed = {"status"}
    invalid = set(updates.keys()) - allowed
    if invalid:
        raise HTTPException(400, f"Cannot update fields: {', '.join(invalid)}")

    try:
        gid = _uuid.UUID(group_id)
    except ValueError:
        raise HTTPException(400, "Invalid group ID")

    async with async_session() as session:
        group = await session.get(BotGroup, gid)
        if not group:
            raise HTTPException(404, "Group profile not found")
        for field, value in updates.items():
            setattr(group, field, value)
        await session.commit()
        await session.refresh(group)
    return {
        "id": str(group.id),
        "_file": str(group.id),
        "group_id": group.platform_group_id,
        "platform_group_id": group.platform_group_id,
        "group_name": group.name,
        "name": group.name,
        "platform": group.platform,
        "status": group.status,
        "member_count": group.member_count,
        "members": group.members,
        "assigned_agent_id": group.assigned_agent_id,
        "metadata": group.meta,
        "created_at": group.created_at.isoformat() if group.created_at else None,
        "updated_at": group.updated_at.isoformat() if group.updated_at else None,
    }


@workspace_router.get("/knowledge")
async def list_knowledge_base(user=Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(select(KnowledgeArticle))
        articles = result.scalars().all()
    return [
        {
            "id": str(a.id),
            "name": a.title,
            "domain": a.domain,
            "tags": a.tags or [],
            "status": a.status,
            "created_by": a.created_by,
            "updated_by": a.updated_by,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "updated_at": a.updated_at.isoformat() if a.updated_at else None,
        }
        for a in articles
    ]


@workspace_router.get("/knowledge/content")
async def get_knowledge_content(
    id: str = Query(..., alias="id"),
    user=Depends(get_current_user),
):
    try:
        article_id = _uuid.UUID(id)
    except ValueError:
        raise HTTPException(400, "Invalid article ID")

    async with async_session() as session:
        article = await session.get(KnowledgeArticle, article_id)
    if not article:
        raise HTTPException(404, "Article not found")
    return {"content": article.content, "id": str(article.id), "title": article.title}


@workspace_router.get("/documents")
async def list_workspace_documents(user=Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(select(WorkspaceDocument))
        docs = result.scalars().all()
    return [
        {
            "id": str(d.id),
            "name": d.filename,
            "domain": d.domain,
            "path": d.file_path,
            "size": d.file_size,
            "type": d.file_type or "unknown",
            "sensitivity": d.sensitivity,
            "uploaded_by": d.uploaded_by,
            "approved_by": d.approved_by,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "updated_at": d.updated_at.isoformat() if d.updated_at else None,
        }
        for d in docs
    ]
