import re
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel

from auth import get_current_user, require_role

file_router = APIRouter(prefix="/files", tags=["files"])

OPENCLAW_ROOT = Path.home() / ".openclaw"
MAX_FILE_SIZE = 1 * 1024 * 1024  # 1MB

TEXT_EXTENSIONS = {
    ".json", ".env", ".yaml", ".yml", ".toml", ".ini", ".cfg",
    ".txt", ".md", ".markdown", ".rst",
    ".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs",
    ".py", ".sh", ".bash", ".zsh",
    ".html", ".htm", ".css", ".scss", ".less",
    ".xml", ".svg", ".csv", ".log",
    ".conf", ".config", ".properties",
    ".gitignore", ".dockerignore", ".editorconfig",
    ".sql", ".graphql", ".gql",
}

# Sentinel path for the Config category (root-level config files)
_ROOT_CONFIGS = "__root_configs__"

CATEGORIES = [
    {"id": "config", "name": "Config", "description": "Root configuration files", "icon": "settings", "path": _ROOT_CONFIGS},
    {"id": "skills", "name": "Skills", "description": "Installed skills", "icon": "zap", "path": "skills"},
    {"id": "workspaces", "name": "Workspaces", "description": "Agent workspaces", "icon": "folder", "path": "workspaces"},
    {"id": "logs", "name": "Logs", "description": "Gateway log files", "icon": "file-text", "path": "logs"},
    {"id": "data", "name": "Data", "description": "Data and state files", "icon": "database", "path": "data"},
]

# Credentials pattern: 20+ alphanumeric chars
_CREDENTIAL_RE = re.compile(r"[A-Za-z0-9]{20,}")


def _safe_path(relative_path: str) -> Path:
    """Resolve a relative path within OPENCLAW_ROOT. Raises 403 if traversal detected."""
    if not relative_path:
        raise HTTPException(400, "Path is required")
    resolved = (OPENCLAW_ROOT / relative_path).resolve()
    root_resolved = OPENCLAW_ROOT.resolve()
    if not str(resolved).startswith(str(root_resolved)):
        raise HTTPException(403, "Access denied: path outside allowed directory")
    return resolved


def _is_text_file(path: Path) -> bool:
    """Check if file is a text file based on extension allowlist."""
    suffix = path.suffix.lower()
    # Files with no extension but known names
    if not suffix and path.name in (".env", ".gitignore", ".dockerignore", ".editorconfig", "Makefile", "Dockerfile"):
        return True
    return suffix in TEXT_EXTENSIONS


def _mask_credentials(content: str) -> str:
    """Mask sequences of 20+ alphanumeric characters, keeping first 6 and last 4."""
    def _replace(match):
        val = match.group(0)
        if len(val) < 20:
            return val
        return val[:6] + "*" * (len(val) - 10) + val[-4:]
    return _CREDENTIAL_RE.sub(_replace, content)


def _walk_dir(dir_path: Path):
    """Walk a directory and return (file_count, total_size)."""
    file_count = 0
    total_size = 0
    if not dir_path.is_dir():
        return 0, 0
    try:
        for item in dir_path.rglob("*"):
            if item.is_file():
                file_count += 1
                try:
                    total_size += item.stat().st_size
                except OSError:
                    pass
    except PermissionError:
        pass
    return file_count, total_size


def _root_config_stats():
    """Count .json and .env files in the root dir only."""
    file_count = 0
    total_size = 0
    if not OPENCLAW_ROOT.is_dir():
        return 0, 0
    try:
        for item in OPENCLAW_ROOT.iterdir():
            if item.is_file() and item.suffix in (".json", ".env"):
                file_count += 1
                try:
                    total_size += item.stat().st_size
                except OSError:
                    pass
    except PermissionError:
        pass
    return file_count, total_size


@file_router.get("/categories")
async def list_categories(user=Depends(get_current_user)):
    """Return file categories with file counts and total sizes."""
    result = []
    for cat in CATEGORIES:
        if cat["path"] == _ROOT_CONFIGS:
            fc, ts = _root_config_stats()
        else:
            fc, ts = _walk_dir(OPENCLAW_ROOT / cat["path"])
        result.append({
            "id": cat["id"],
            "name": cat["name"],
            "description": cat["description"],
            "icon": cat["icon"],
            "path": cat["path"],
            "fileCount": fc,
            "totalSize": ts,
        })
    return result


@file_router.get("/tree")
async def list_tree(path: str = Query(""), user=Depends(get_current_user)):
    """Directory listing. Sorts dirs first, skips dotfiles."""
    if path == _ROOT_CONFIGS:
        # Special case: list .json and .env files in root dir
        items = []
        if OPENCLAW_ROOT.is_dir():
            for item in sorted(OPENCLAW_ROOT.iterdir(), key=lambda p: p.name.lower()):
                if item.name.startswith(".") and item.name != ".env":
                    continue
                if item.is_file() and item.suffix in (".json", ".env"):
                    try:
                        stat = item.stat()
                        items.append({
                            "name": item.name,
                            "path": item.name,
                            "isDir": False,
                            "size": stat.st_size,
                            "modified": stat.st_mtime,
                            "isText": True,
                        })
                    except OSError:
                        pass
        return items

    if not path:
        # Return top-level: list category directories
        items = []
        for cat in CATEGORIES:
            if cat["path"] == _ROOT_CONFIGS:
                continue
            dir_path = OPENCLAW_ROOT / cat["path"]
            if dir_path.is_dir():
                items.append({
                    "name": cat["name"],
                    "path": cat["path"],
                    "isDir": True,
                    "size": 0,
                    "modified": 0,
                    "isText": False,
                })
        return items

    target = _safe_path(path)
    if not target.is_dir():
        raise HTTPException(404, "Directory not found")

    dirs = []
    files = []
    try:
        for item in sorted(target.iterdir(), key=lambda p: p.name.lower()):
            # Skip dotfiles
            if item.name.startswith("."):
                continue
            try:
                stat = item.stat()
            except OSError:
                continue
            rel = str(item.relative_to(OPENCLAW_ROOT))
            if item.is_dir():
                dirs.append({
                    "name": item.name,
                    "path": rel,
                    "isDir": True,
                    "size": 0,
                    "modified": stat.st_mtime,
                    "isText": False,
                })
            elif item.is_file():
                files.append({
                    "name": item.name,
                    "path": rel,
                    "isDir": False,
                    "size": stat.st_size,
                    "modified": stat.st_mtime,
                    "isText": _is_text_file(item),
                })
    except PermissionError:
        raise HTTPException(403, "Permission denied")

    return dirs + files


@file_router.get("/content")
async def get_file_content(path: str = Query(...), user=Depends(get_current_user)):
    """Return file content for text files, metadata for binary."""
    target = _safe_path(path)
    if not target.is_file():
        raise HTTPException(404, "File not found")

    try:
        stat = target.stat()
    except OSError:
        raise HTTPException(500, "Cannot read file metadata")

    meta = {
        "name": target.name,
        "path": path,
        "size": stat.st_size,
        "modified": stat.st_mtime,
        "isText": _is_text_file(target),
    }

    if not _is_text_file(target):
        return {**meta, "content": None, "message": "Binary file — content not displayed"}

    if stat.st_size > MAX_FILE_SIZE:
        return {**meta, "content": None, "message": f"File too large ({stat.st_size} bytes, max {MAX_FILE_SIZE})"}

    try:
        content = target.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return {**meta, "isText": False, "content": None, "message": "Binary file — content not displayed"}
    except OSError as e:
        raise HTTPException(500, f"Cannot read file: {e}")

    # Mask credentials in .env files and other sensitive files
    if target.suffix in (".env",) or target.name == ".env":
        content = _mask_credentials(content)

    return {**meta, "content": content}


class SaveFileRequest(BaseModel):
    content: str


@file_router.put("/content")
async def save_file_content(
    body: SaveFileRequest,
    path: str = Query(...),
    user=Depends(require_role("admin", "editor")),
):
    """Save text file content. Blocks editing credential files."""
    target = _safe_path(path)

    # Block direct editing of credential/env files
    if target.suffix == ".env" or target.name == ".env":
        raise HTTPException(403, "Editing credential files is not allowed through this interface")

    if not target.is_file():
        raise HTTPException(404, "File not found")

    if not _is_text_file(target):
        raise HTTPException(400, "Cannot edit binary files")

    if len(body.content.encode("utf-8")) > MAX_FILE_SIZE:
        raise HTTPException(400, f"Content too large (max {MAX_FILE_SIZE} bytes)")

    try:
        target.write_text(body.content, encoding="utf-8")
    except OSError as e:
        raise HTTPException(500, f"Cannot write file: {e}")

    return {"status": "ok", "path": path}
