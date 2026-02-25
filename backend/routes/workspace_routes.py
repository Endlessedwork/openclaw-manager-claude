import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from auth import get_current_user, require_role

workspace_router = APIRouter(prefix="/workspace", tags=["workspace"])
SHARED_DIR = Path.home() / ".openclaw" / "workspace" / "shared"


def _read_json_profiles(subdir: str) -> list[dict]:
    """Read all JSON profile files from a subdirectory."""
    profiles_dir = SHARED_DIR / subdir / "profiles"
    if not profiles_dir.is_dir():
        return []
    results = []
    for f in sorted(profiles_dir.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            data["_file"] = f.name
            results.append(data)
        except (json.JSONDecodeError, OSError):
            continue
    return results


@workspace_router.get("/users")
async def list_workspace_users(user=Depends(get_current_user)):
    return _read_json_profiles("users")


@workspace_router.patch("/users/{filename}")
async def patch_workspace_user(
    filename: str,
    updates: dict = Body(...),
    user=Depends(require_role("admin", "editor")),
):
    allowed = {"role", "status", "notes"}
    invalid = set(updates.keys()) - allowed
    if invalid:
        raise HTTPException(400, f"Cannot update fields: {', '.join(invalid)}")
    filepath = (SHARED_DIR / "users" / "profiles" / filename).resolve()
    if not filepath.is_relative_to(SHARED_DIR.resolve()) or not filepath.is_file():
        raise HTTPException(404, "User profile not found")
    data = json.loads(filepath.read_text(encoding="utf-8"))
    data.update(updates)
    filepath.write_text(json.dumps(data, indent=4, ensure_ascii=False), encoding="utf-8")
    return data


@workspace_router.get("/groups")
async def list_workspace_groups(user=Depends(get_current_user)):
    groups = _read_json_profiles("groups")
    for g in groups:
        members = g.get("members", {})
        g["member_count"] = len(members)
    return groups


@workspace_router.patch("/groups/{filename}")
async def patch_workspace_group(
    filename: str,
    updates: dict = Body(...),
    user=Depends(require_role("admin", "editor")),
):
    allowed = {"status"}
    invalid = set(updates.keys()) - allowed
    if invalid:
        raise HTTPException(400, f"Cannot update fields: {', '.join(invalid)}")
    filepath = (SHARED_DIR / "groups" / "profiles" / filename).resolve()
    if not filepath.is_relative_to(SHARED_DIR.resolve()) or not filepath.is_file():
        raise HTTPException(404, "Group profile not found")
    data = json.loads(filepath.read_text(encoding="utf-8"))
    data.update(updates)
    filepath.write_text(json.dumps(data, indent=4, ensure_ascii=False), encoding="utf-8")
    return data


@workspace_router.get("/knowledge")
async def list_knowledge_base(user=Depends(get_current_user)):
    kb_dir = SHARED_DIR / "knowledge_base"
    if not kb_dir.is_dir():
        return []
    results = []
    for domain_dir in sorted(kb_dir.iterdir()):
        if not domain_dir.is_dir():
            continue
        domain = domain_dir.name
        for f in sorted(domain_dir.rglob("*.md")):
            stat = f.stat()
            results.append({
                "name": f.stem,
                "filename": f.name,
                "domain": domain,
                "path": str(f.relative_to(SHARED_DIR)),
                "size": stat.st_size,
                "modified": stat.st_mtime,
            })
    return results


@workspace_router.get("/knowledge/content")
async def get_knowledge_content(
    path: str = Query(...),
    user=Depends(get_current_user),
):
    resolved = (SHARED_DIR / path).resolve()
    if not resolved.is_relative_to(SHARED_DIR.resolve()):
        raise HTTPException(403, "Access denied")
    if not resolved.is_file() or resolved.suffix != ".md":
        raise HTTPException(404, "Article not found")
    return {"content": resolved.read_text(encoding="utf-8"), "path": path}


@workspace_router.get("/documents")
async def list_workspace_documents(user=Depends(get_current_user)):
    docs_dir = SHARED_DIR / "documents"
    if not docs_dir.is_dir():
        return []
    results = []
    for domain_dir in sorted(docs_dir.iterdir()):
        if not domain_dir.is_dir():
            continue
        domain = domain_dir.name
        for f in sorted(domain_dir.iterdir()):
            if f.name.startswith(".") or f.name.endswith(".metadata.json"):
                continue
            if not f.is_file():
                continue
            meta_file = f.parent / f"{f.name}.metadata.json"
            meta = {}
            if meta_file.is_file():
                try:
                    meta = json.loads(meta_file.read_text(encoding="utf-8"))
                except (json.JSONDecodeError, OSError):
                    pass
            stat = f.stat()
            results.append({
                "name": f.name,
                "domain": domain,
                "path": str(f.relative_to(SHARED_DIR)),
                "size": stat.st_size,
                "modified": stat.st_mtime,
                "type": f.suffix.lstrip(".") or "unknown",
                "sensitivity": meta.get("sensitivity", ""),
                "uploaded_by": meta.get("source", {}).get("uploaded_by", ""),
                "approved_by": meta.get("approved_by", ""),
            })
    return results
