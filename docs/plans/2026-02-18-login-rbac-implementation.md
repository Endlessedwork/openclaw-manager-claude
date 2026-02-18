# Login + RBAC Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add JWT authentication and 3-tier RBAC (Admin/Editor/Viewer) to the OpenClaw Manager dashboard.

**Architecture:** Monolithic auth added directly to the existing FastAPI backend. JWT access tokens (30min) + refresh tokens (7d httpOnly cookie). Frontend uses React Context for auth state, ProtectedRoute for route guards, and Axios interceptors for token handling.

**Tech Stack:** FastAPI, PyJWT, bcrypt, passlib, MongoDB (Motor), React 19, React Router 7, Axios, TailwindCSS, Radix UI

**Agent Team:** 3 parallel agents — backend-auth + frontend-auth run in parallel, frontend-update runs after frontend-auth completes.

---

## Agent 1: backend-auth

### Task 1: Create auth utilities module

**Files:**
- Create: `backend/auth.py`

**Step 1: Create `backend/auth.py` with password hashing, JWT creation/verification, and FastAPI dependencies**

```python
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends, HTTPException, status, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext
import jwt
import os

# Config
SECRET_KEY = os.environ.get("JWT_SECRET", "change-me-in-production-use-openssl-rand-hex-32")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# Dependency: get db from app state (set in server.py)
def _get_db(request: Request):
    return request.app.state.db


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")
    db = _get_db(request)
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(payload["sub"]), "is_active": True})
    if not user:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
    }


def require_role(*allowed_roles):
    async def role_checker(user=Depends(get_current_user)):
        if user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return role_checker
```

**Step 2: Add `JWT_SECRET` to `backend/.env`**

Add to `backend/.env`:
```
JWT_SECRET=change-me-in-production-use-openssl-rand-hex-32
```

**Step 3: Commit**

```bash
git add backend/auth.py backend/.env
git commit -m "feat(auth): add auth utilities - password hashing, JWT, FastAPI deps"
```

---

### Task 2: Create auth routes (login, refresh, me)

**Files:**
- Create: `backend/routes/__init__.py`
- Create: `backend/routes/auth_routes.py`

**Step 1: Create `backend/routes/__init__.py`** (empty file)

**Step 2: Create `backend/routes/auth_routes.py`**

```python
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone
from bson import ObjectId

from auth import (
    verify_password, create_access_token, create_refresh_token,
    decode_token, get_current_user,
)

auth_router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


@auth_router.post("/login")
async def login(body: LoginRequest, request: Request, response: Response):
    db = request.app.state.db
    user = await db.users.find_one({"email": body.email})
    if not user or not verify_password(body.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is disabled")

    user_id = str(user["_id"])
    access_token = create_access_token(user_id, user["email"], user["role"])
    refresh_token = create_refresh_token(user_id)

    # Set refresh token as httpOnly cookie
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,  # Set True in production with HTTPS
        samesite="lax",
        max_age=7 * 24 * 3600,
        path="/api/auth",
    )

    # Update last_login
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login": datetime.now(timezone.utc)}}
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "email": user["email"],
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
    new_access = create_access_token(user_id, user["email"], user["role"])
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
            "email": user["email"],
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
```

**Step 3: Commit**

```bash
git add backend/routes/
git commit -m "feat(auth): add login, refresh, logout, me endpoints"
```

---

### Task 3: Create user management routes (Admin only)

**Files:**
- Create: `backend/routes/user_routes.py`

**Step 1: Create `backend/routes/user_routes.py`**

```python
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
    password: str
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

    # Prevent self-deletion
    if user_id == user["id"]:
        raise HTTPException(400, "Cannot delete your own account")

    result = await db.users.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(404, "User not found")
    return {"status": "ok"}
```

**Step 2: Commit**

```bash
git add backend/routes/user_routes.py
git commit -m "feat(auth): add user CRUD routes (admin only)"
```

---

### Task 4: Create seed admin script

**Files:**
- Create: `backend/seed_admin.py`

**Step 1: Create `backend/seed_admin.py`**

```python
#!/usr/bin/env python3
"""Create the first admin user for OpenClaw Manager."""
import asyncio
import os
import sys
from pathlib import Path
from datetime import datetime, timezone

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / ".env")

# Add backend to path for auth import
sys.path.insert(0, str(Path(__file__).parent))
from auth import hash_password


async def seed():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    # Check if any admin exists
    existing = await db.users.find_one({"role": "admin"})
    if existing:
        print(f"Admin already exists: {existing['email']}")
        client.close()
        return

    email = input("Admin email: ").strip()
    name = input("Admin name: ").strip() or "Admin"
    password = input("Admin password: ").strip()

    if not email or not password:
        print("Email and password are required")
        client.close()
        sys.exit(1)

    now = datetime.now(timezone.utc)
    await db.users.insert_one({
        "email": email,
        "hashed_password": hash_password(password),
        "name": name,
        "role": "admin",
        "is_active": True,
        "created_at": now,
        "updated_at": now,
        "last_login": None,
    })

    # Create unique index on email
    await db.users.create_index("email", unique=True)

    print(f"Admin user created: {email}")
    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
```

**Step 2: Commit**

```bash
git add backend/seed_admin.py
git commit -m "feat(auth): add seed_admin.py script for first admin user"
```

---

### Task 5: Integrate auth into server.py - wire routes and protect endpoints

**Files:**
- Modify: `backend/server.py`

**Step 1: Add imports and register auth routes at top of server.py**

After existing imports, add:
```python
from auth import get_current_user, require_role
from routes.auth_routes import auth_router
from routes.user_routes import user_router
```

After `api_router = APIRouter(prefix="/api")`, add:
```python
api_router.include_router(auth_router)
api_router.include_router(user_router)
```

**Step 2: Set `app.state.db` for auth dependencies**

After `db = client[os.environ['DB_NAME']]`, add:
```python
# Make db accessible via request.app.state for auth dependencies
@app.on_event("startup")
async def set_db():
    app.state.db = db
```

**Step 3: Add auth dependencies to ALL existing endpoints**

Apply role-based protection to every endpoint. The pattern:

- **All GET endpoints** (view): `user=Depends(get_current_user)` — any authenticated user
- **Write endpoints** (POST/PUT/DELETE except auth): `user=Depends(require_role("admin", "editor"))`
- **Gateway restart**: `user=Depends(require_role("admin"))`

Specific changes — add dependency parameter to each endpoint function:

```python
# Read endpoints - any authenticated user:
async def get_dashboard(user=Depends(get_current_user)):
async def list_agents(user=Depends(get_current_user)):
async def get_agent(agent_id: str, user=Depends(get_current_user)):
async def list_skills(user=Depends(get_current_user)):
async def get_skill(skill_id: str, user=Depends(get_current_user)):
async def list_tools(user=Depends(get_current_user)):
async def list_models(user=Depends(get_current_user)):
async def list_providers(user=Depends(get_current_user)):
async def list_channels(user=Depends(get_current_user)):
async def list_sessions(limit: int = Query(50, le=200), user=Depends(get_current_user)):
async def list_cron_jobs(user=Depends(get_current_user)):
async def get_config(user=Depends(get_current_user)):
async def get_gateway_status(user=Depends(get_current_user)):
async def get_hooks_config(user=Depends(get_current_user)):
async def get_hook_mappings(user=Depends(get_current_user)):
async def get_logs(limit: int = Query(50, le=500), user=Depends(get_current_user)):
async def list_system_logs(..., user=Depends(get_current_user)):
async def system_logs_stats(user=Depends(get_current_user)):
async def list_activities(..., user=Depends(get_current_user)):
async def activities_stats(user=Depends(get_current_user)):
async def get_activity(activity_id: str, user=Depends(get_current_user)):
async def list_clawhub_skills(..., user=Depends(get_current_user)):

# Write endpoints - admin + editor:
async def create_provider(body: dict, user=Depends(require_role("admin", "editor"))):
async def update_provider(provider_id: str, body: dict, user=Depends(require_role("admin", "editor"))):
async def delete_provider(provider_id: str, user=Depends(require_role("admin", "editor"))):
async def update_config(body: dict, user=Depends(require_role("admin", "editor"))):
async def validate_config(body: dict, user=Depends(require_role("admin", "editor"))):
async def install_clawhub_skill(skill_id: str, user=Depends(require_role("admin", "editor"))):
async def uninstall_clawhub_skill(skill_id: str, user=Depends(require_role("admin", "editor"))):

# Admin only:
async def gateway_restart_endpoint(user=Depends(require_role("admin"))):
```

**Step 4: Protect WebSocket endpoints**

For WebSocket endpoints, add token verification in the connection handler. After `await websocket.accept()`, add:

```python
# Verify auth from query param: ws://host/api/ws/logs?token=xxx
token = websocket.query_params.get("token")
if not token:
    await websocket.close(code=1008, reason="Missing token")
    return
try:
    from auth import decode_token
    payload = decode_token(token)
    if payload.get("type") != "access":
        await websocket.close(code=1008, reason="Invalid token")
        return
except Exception:
    await websocket.close(code=1008, reason="Invalid token")
    return
```

**Step 5: Commit**

```bash
git add backend/server.py
git commit -m "feat(auth): protect all API endpoints with JWT auth + RBAC"
```

---

## Agent 2: frontend-auth (parallel with Agent 1)

### Task 6: Create AuthContext

**Files:**
- Create: `frontend/src/contexts/AuthContext.js`

**Step 1: Create `frontend/src/contexts/AuthContext.js`**

```jsx
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Set up axios interceptor for auth header
  useEffect(() => {
    const requestInterceptor = api.interceptors.request.use((config) => {
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    const responseInterceptor = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          try {
            const res = await api.post('/auth/refresh', {}, { withCredentials: true });
            const newToken = res.data.access_token;
            setToken(newToken);
            setUser(res.data.user);
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          } catch {
            // Refresh failed, logout
            setToken(null);
            setUser(null);
            return Promise.reject(error);
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      api.interceptors.request.eject(requestInterceptor);
      api.interceptors.response.eject(responseInterceptor);
    };
  }, [token]);

  // Try to refresh on mount (check if refresh cookie exists)
  useEffect(() => {
    const tryRefresh = async () => {
      try {
        const res = await api.post('/auth/refresh', {}, { withCredentials: true });
        setToken(res.data.access_token);
        setUser(res.data.user);
      } catch {
        // No valid refresh token, user needs to login
      } finally {
        setLoading(false);
      }
    };
    tryRefresh();
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password }, { withCredentials: true });
    setToken(res.data.access_token);
    setUser(res.data.user);
    return res.data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', {}, { withCredentials: true });
    } catch {
      // Ignore logout errors
    }
    setToken(null);
    setUser(null);
  }, []);

  const hasRole = useCallback((...roles) => {
    return user && roles.includes(user.role);
  }, [user]);

  const canEdit = useCallback(() => {
    return user && (user.role === 'admin' || user.role === 'editor');
  }, [user]);

  const isAdmin = useCallback(() => {
    return user && user.role === 'admin';
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, hasRole, canEdit, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

**Step 2: Commit**

```bash
git add frontend/src/contexts/AuthContext.js
git commit -m "feat(auth): add AuthContext with JWT handling and role helpers"
```

---

### Task 7: Create ProtectedRoute component

**Files:**
- Create: `frontend/src/components/ProtectedRoute.js`

**Step 1: Create `frontend/src/components/ProtectedRoute.js`**

```jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090b]">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090b]">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-200 mb-2">Access Denied</h1>
          <p className="text-zinc-500">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return children;
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/ProtectedRoute.js
git commit -m "feat(auth): add ProtectedRoute component with role checking"
```

---

### Task 8: Create LoginPage

**Files:**
- Create: `frontend/src/pages/LoginPage.js`

**Step 1: Create `frontend/src/pages/LoginPage.js`**

```jsx
import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Activity } from 'lucide-react';

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect to dashboard
  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b]">
      <div className="w-full max-w-sm mx-4">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-orange-600 flex items-center justify-center shadow-[0_0_20px_rgba(249,115,22,0.4)]">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-semibold tracking-tight text-zinc-100" style={{ fontFamily: 'Manrope, sans-serif' }}>
            OpenClaw
          </span>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="bg-[#0c0c0e] border border-white/5 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-medium text-zinc-200 text-center">Sign in to your account</h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2 bg-[#09090b] border border-white/10 rounded-lg text-zinc-200 text-sm placeholder-zinc-600 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 bg-[#09090b] border border-white/10 rounded-lg text-zinc-200 text-sm placeholder-zinc-600 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/pages/LoginPage.js
git commit -m "feat(auth): add LoginPage with email/password form"
```

---

### Task 9: Create UserManagementPage (Admin only)

**Files:**
- Create: `frontend/src/pages/UsersPage.js`

**Step 1: Add API functions to `frontend/src/lib/api.js`**

Append to the end of api.js (before `export default api`):
```javascript
// Auth
export const loginUser = (data) => api.post('/auth/login', data, { withCredentials: true });
export const refreshToken = () => api.post('/auth/refresh', {}, { withCredentials: true });
export const logoutUser = () => api.post('/auth/logout', {}, { withCredentials: true });
export const getMe = () => api.get('/auth/me');

// Users (Admin)
export const getUsers = () => api.get('/users');
export const createUser = (data) => api.post('/users', data);
export const updateUser = (id, data) => api.put(`/users/${id}`, data);
export const deleteUser = (id) => api.delete(`/users/${id}`);
```

**Step 2: Create `frontend/src/pages/UsersPage.js`**

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { getUsers, createUser, updateUser, deleteUser } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Users, Plus, Pencil, Trash2, Shield, Eye, Edit3 } from 'lucide-react';

const ROLE_CONFIG = {
  admin: { label: 'Admin', icon: Shield, color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  editor: { label: 'Editor', icon: Edit3, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  viewer: { label: 'Viewer', icon: Eye, color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20' },
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ email: '', password: '', name: '', role: 'viewer' });

  const fetchUsers = useCallback(async () => {
    try {
      const res = await getUsers();
      setUsers(res.data);
    } catch (err) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await createUser(form);
      toast.success('User created');
      setShowCreate(false);
      setForm({ email: '', password: '', name: '', role: 'viewer' });
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create user');
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      const updates = {};
      if (form.name) updates.name = form.name;
      if (form.role) updates.role = form.role;
      if (form.password) updates.password = form.password;
      await updateUser(editUser.id, updates);
      toast.success('User updated');
      setEditUser(null);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update user');
    }
  };

  const handleDelete = async (id, email) => {
    if (!window.confirm(`Delete user ${email}?`)) return;
    try {
      await deleteUser(id);
      toast.success('User deleted');
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete user');
    }
  };

  const handleToggleActive = async (u) => {
    try {
      await updateUser(u.id, { is_active: !u.is_active });
      toast.success(`User ${u.is_active ? 'disabled' : 'enabled'}`);
      fetchUsers();
    } catch (err) {
      toast.error('Failed to update user');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Users className="w-6 h-6 text-orange-500" /> User Management
          </h1>
          <p className="text-sm text-zinc-500 mt-1">{users.length} users</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setEditUser(null); setForm({ email: '', password: '', name: '', role: 'viewer' }); }}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg text-sm font-medium text-white transition-colors"
        >
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      {/* Create/Edit Modal */}
      {(showCreate || editUser) && (
        <div className="bg-[#0c0c0e] border border-white/5 rounded-xl p-6">
          <h3 className="text-lg font-medium text-zinc-200 mb-4">
            {editUser ? 'Edit User' : 'Create User'}
          </h3>
          <form onSubmit={editUser ? handleUpdate : handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!editUser && (
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  className="w-full px-3 py-2 bg-[#09090b] border border-white/10 rounded-lg text-zinc-200 text-sm focus:outline-none focus:border-orange-500/50"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required={!editUser}
                className="w-full px-3 py-2 bg-[#09090b] border border-white/10 rounded-lg text-zinc-200 text-sm focus:outline-none focus:border-orange-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Password {editUser && <span className="text-zinc-600">(leave empty to keep)</span>}
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!editUser}
                className="w-full px-3 py-2 bg-[#09090b] border border-white/10 rounded-lg text-zinc-200 text-sm focus:outline-none focus:border-orange-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 py-2 bg-[#09090b] border border-white/10 rounded-lg text-zinc-200 text-sm focus:outline-none focus:border-orange-500/50"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <button type="submit" className="px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg text-sm font-medium text-white transition-colors">
                {editUser ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setEditUser(null); }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium text-zinc-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-[#0c0c0e] border border-white/5 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-4 py-3 text-zinc-500 font-medium">User</th>
              <th className="text-left px-4 py-3 text-zinc-500 font-medium">Role</th>
              <th className="text-left px-4 py-3 text-zinc-500 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-zinc-500 font-medium">Last Login</th>
              <th className="text-right px-4 py-3 text-zinc-500 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const roleConfig = ROLE_CONFIG[u.role] || ROLE_CONFIG.viewer;
              const RoleIcon = roleConfig.icon;
              return (
                <tr key={u.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="text-zinc-200 font-medium">{u.name}</div>
                    <div className="text-zinc-500 text-xs">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${roleConfig.color}`}>
                      <RoleIcon className="w-3 h-3" /> {roleConfig.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleActive(u)}
                      className={`text-xs px-2 py-1 rounded ${u.is_active ? 'text-green-400 bg-green-500/10' : 'text-zinc-500 bg-zinc-500/10'}`}
                    >
                      {u.is_active ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">
                    {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => { setEditUser(u); setShowCreate(false); setForm({ name: u.name, role: u.role, password: '' }); }}
                        className="p-1.5 hover:bg-white/5 rounded text-zinc-500 hover:text-zinc-300"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {u.id !== currentUser?.id && (
                        <button
                          onClick={() => handleDelete(u.id, u.email)}
                          className="p-1.5 hover:bg-red-500/10 rounded text-zinc-500 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add frontend/src/pages/UsersPage.js frontend/src/lib/api.js
git commit -m "feat(auth): add UsersPage and auth API functions"
```

---

### Task 10: Wire auth into App.js routing

**Files:**
- Modify: `frontend/src/App.js`

**Step 1: Update `frontend/src/App.js`**

Replace the entire App.js content:

```jsx
import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import MainLayout from "./layout/MainLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import AgentsPage from "./pages/AgentsPage";
import SkillsPage from "./pages/SkillsPage";
import ToolsPage from "./pages/ToolsPage";
import ModelsPage from "./pages/ModelsPage";
import ChannelsPage from "./pages/ChannelsPage";
import SessionsPage from "./pages/SessionsPage";
import CronPage from "./pages/CronPage";
import ConfigPage from "./pages/ConfigPage";
import GatewayPage from "./pages/GatewayPage";
import ClawHubPage from "./pages/ClawHubPage";
import HooksPage from "./pages/HooksPage";
import ActivitiesPage from "./pages/ActivitiesPage";
import LogsPage from "./pages/LogsPage";
import UsersPage from "./pages/UsersPage";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
              <Route index element={<DashboardPage />} />
              <Route path="/agents" element={<AgentsPage />} />
              <Route path="/skills" element={<SkillsPage />} />
              <Route path="/tools" element={<ToolsPage />} />
              <Route path="/models" element={<ModelsPage />} />
              <Route path="/channels" element={<ChannelsPage />} />
              <Route path="/sessions" element={<SessionsPage />} />
              <Route path="/cron" element={<CronPage />} />
              <Route path="/config" element={<ConfigPage />} />
              <Route path="/gateway" element={<GatewayPage />} />
              <Route path="/activities" element={<ActivitiesPage />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="/clawhub" element={<ClawHubPage />} />
              <Route path="/hooks" element={<HooksPage />} />
              <Route path="/users" element={<ProtectedRoute roles={["admin"]}><UsersPage /></ProtectedRoute>} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
      <Toaster position="bottom-right" theme="dark" />
    </div>
  );
}

export default App;
```

**Step 2: Commit**

```bash
git add frontend/src/App.js
git commit -m "feat(auth): wire AuthProvider, ProtectedRoute, and LoginPage into routing"
```

---

## Agent 3: frontend-update (after Agent 2 completes)

### Task 11: Update Sidebar with role-based menu + user profile + logout

**Files:**
- Modify: `frontend/src/layout/Sidebar.js`

**Step 1: Update Sidebar.js**

Changes needed:
1. Import `useAuth` from AuthContext
2. Add "Users" nav item (conditionally shown for admin)
3. Add user profile section + logout button at bottom

Add to imports:
```javascript
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Users } from 'lucide-react';
```

Update the component to use auth:
```javascript
export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { user, logout, isAdmin } = useAuth();
```

Filter navItems based on role — add Users item conditionally:
```javascript
  const allNavItems = [
    ...navItems,
    ...(isAdmin() ? [{ path: '/users', label: 'Users', icon: Users }] : []),
  ];
```

Use `allNavItems` instead of `navItems` in the map.

Add user profile + logout section before the collapse toggle:
```jsx
{/* User Profile */}
{user && (
  <div className={`px-3 py-3 border-t border-white/5 ${collapsed ? 'text-center' : ''}`}>
    {!collapsed && (
      <div className="mb-2">
        <div className="text-sm font-medium text-zinc-300 truncate">{user.name}</div>
        <div className="text-xs text-zinc-500 truncate">{user.role}</div>
      </div>
    )}
    <button
      onClick={logout}
      className={`flex items-center gap-2 text-sm text-zinc-500 hover:text-red-400 transition-colors ${collapsed ? 'justify-center w-full' : ''}`}
    >
      <LogOut className="w-4 h-4" />
      {!collapsed && <span>Sign out</span>}
    </button>
  </div>
)}
```

**Step 2: Commit**

```bash
git add frontend/src/layout/Sidebar.js
git commit -m "feat(auth): add role-based menu, user profile, and logout to Sidebar"
```

---

### Task 12: Update Axios to send credentials + update WebSocket connections

**Files:**
- Modify: `frontend/src/lib/api.js`

**Step 1: Update axios instance to include credentials**

Change the axios create call:
```javascript
const api = axios.create({
  baseURL: API,
  withCredentials: true,
});
```

**Step 2: Update `getWsUrl` to include token**

Replace the helper:
```javascript
export const getWsUrl = (path, token) => {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = BACKEND_URL ? new URL(BACKEND_URL).host : window.location.host;
  const tokenParam = token ? `?token=${token}` : '';
  return `${proto}//${host}/api/ws/${path}${tokenParam}`;
};
```

**Step 3: Commit**

```bash
git add frontend/src/lib/api.js
git commit -m "feat(auth): add withCredentials to axios and token to WebSocket URLs"
```

---

### Task 13: Update pages that use WebSocket to pass auth token

**Files:**
- Modify: `frontend/src/pages/LogsPage.js`
- Modify: `frontend/src/pages/ActivitiesPage.js`

**Step 1: In pages that call `getWsUrl()`, import `useAuth` and pass token**

In both LogsPage.js and ActivitiesPage.js, add:
```javascript
import { useAuth } from '../contexts/AuthContext';
```

Inside the component:
```javascript
const { token } = useAuth();
```

Update WebSocket URL calls from `getWsUrl('logs')` to `getWsUrl('logs', token)` and `getWsUrl('activities')` to `getWsUrl('activities', token)`.

**Step 2: Commit**

```bash
git add frontend/src/pages/LogsPage.js frontend/src/pages/ActivitiesPage.js
git commit -m "feat(auth): pass JWT token to WebSocket connections"
```

---

### Task 14: Hide write actions for Viewer role in existing pages

**Files:**
- Modify: `frontend/src/pages/ConfigPage.js`
- Modify: `frontend/src/pages/GatewayPage.js`
- Modify: `frontend/src/pages/ClawHubPage.js`
- Modify: `frontend/src/pages/ModelsPage.js` (if it has provider CRUD UI)

**Step 1: In each page with write actions, import `useAuth` and conditionally render**

Pattern for each page:
```javascript
import { useAuth } from '../contexts/AuthContext';

// Inside component:
const { canEdit, isAdmin } = useAuth();
```

Then wrap write-action buttons/forms:
- **ConfigPage**: wrap "Save" button with `{canEdit() && <button>Save</button>}`
- **GatewayPage**: wrap "Restart" button with `{isAdmin() && <button>Restart</button>}`
- **ClawHubPage**: wrap "Install/Uninstall" buttons with `{canEdit() && ...}`
- **ModelsPage**: wrap provider CRUD buttons with `{canEdit() && ...}`

**Step 2: Commit**

```bash
git add frontend/src/pages/ConfigPage.js frontend/src/pages/GatewayPage.js frontend/src/pages/ClawHubPage.js frontend/src/pages/ModelsPage.js
git commit -m "feat(auth): hide write actions for viewer role across pages"
```

---

### Task 15: Final integration test

**Step 1: Run backend**

```bash
cd /home/ubuntu/openclaw-manager/backend
python seed_admin.py  # Create admin user
uvicorn server:app --port 8001 --reload
```

**Step 2: Run frontend**

```bash
cd /home/ubuntu/openclaw-manager/frontend
yarn start
```

**Step 3: Manual verification checklist**

- [ ] `/login` page renders correctly
- [ ] Login with admin credentials works, redirects to dashboard
- [ ] All pages load with auth token
- [ ] Sidebar shows "Users" only for admin
- [ ] `/users` page: create editor user, create viewer user
- [ ] Login as viewer: write buttons hidden, cannot access `/users`
- [ ] Login as editor: write buttons visible, cannot access `/users`, cannot restart gateway
- [ ] Logout works, redirect to `/login`
- [ ] Refresh token works (wait 30+ min or manually expire access token)
- [ ] WebSocket connections work with token

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete login + RBAC system implementation"
```

---

## Agent Dependency Graph

```
Agent 1 (backend-auth)     Agent 2 (frontend-auth)
  Task 1: auth.py            Task 6: AuthContext
  Task 2: auth routes         Task 7: ProtectedRoute
  Task 3: user routes         Task 8: LoginPage
  Task 4: seed script         Task 9: UsersPage + API
  Task 5: protect server.py   Task 10: Wire App.js
         │                           │
         │                           ▼
         │                    Agent 3 (frontend-update)
         │                      Task 11: Sidebar
         │                      Task 12: Axios/WS
         │                      Task 13: WS pages
         │                      Task 14: Hide actions
         └──────────┬───────────┘
                    ▼
              Task 15: Integration test
```

Agent 1 and Agent 2 run **fully in parallel**. Agent 3 starts after Agent 2 completes (needs AuthContext). Task 15 runs after all agents complete.
