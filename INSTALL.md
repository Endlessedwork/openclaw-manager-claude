# OpenClaw Manager — Installation Guide

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Docker & Docker Compose | Latest | Required for all deployment modes |
| Node.js | 20.x LTS | Required on the **host** to install and run the `openclaw` CLI |
| npm | Any | Comes with Node.js |
| `openclaw` CLI | Latest | `npm install -g openclaw` — must be configured before starting |

### Install the `openclaw` CLI

```bash
npm install -g openclaw
```

After installation, initialize and configure your bot:

```bash
openclaw init
```

This creates `~/.openclaw/openclaw.json` and related files. The dashboard reads and writes this directory at runtime.

---

## Deployment Option 1: Docker Compose (Recommended)

The simplest way to deploy. Runs PostgreSQL, backend, and frontend (nginx) in containers.

### Architecture

```
Internet (:80)
    |
    v
+-----------------------+      +---------------------+
| openclaw-frontend     | ---> | openclaw-backend    |
| nginx:alpine          |      | Python 3.12 + Node  |
| Port 80               |      | Port 8001 (internal)|
+-----------------------+      +-----+---------------+
                                     |
                                     v
                               +-----+---------------+
                               | openclaw-postgres    |
                               | PostgreSQL 16        |
                               | Port 5432 (internal) |
                               +---------------------+
```

### Step 1: Clone the Repository

```bash
git clone <your-repo-url> openclaw-manager
cd openclaw-manager
```

### Step 2: Create Environment File

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# PostgreSQL
POSTGRES_PASSWORD=your_secure_password_here

# Backend
JWT_SECRET=<generate with: openssl rand -hex 32>
CORS_ORIGINS=https://yourdomain.com
OPENCLAW_DIR=~/.openclaw

# Admin user (auto-created on first startup)
ADMIN_USER=admin
ADMIN_PASSWORD=your_admin_password
ADMIN_NAME=Admin

# Frontend
HTTP_PORT=80
```

> **Important:** Always generate a new `JWT_SECRET` for each deployment:
> ```bash
> openssl rand -hex 32
> ```

### Step 3: Start All Services

```bash
docker compose up -d
```

This will:
1. Start PostgreSQL and wait for it to be healthy
2. Build and start the backend (installs `openclaw` CLI inside the container)
3. Run database migrations automatically (`alembic upgrade head`)
4. Create the initial superadmin user (if `ADMIN_PASSWORD` is set)
5. Build and start the frontend (nginx)

### Step 4: Verify

```bash
# Check all containers are running
docker compose ps

# Check backend logs
docker compose logs backend

# Check frontend
curl http://localhost
```

Open `http://your-server-ip` (or your domain) in a browser. Log in with the admin credentials you set in `.env`.

### Updating

```bash
git pull
docker compose up -d --build
```

Migrations run automatically on each backend container start.

---

## Deployment Option 2: Host Backend + Docker Nginx

This is the setup used at `control.winecore.work`. The backend runs directly on the host, while nginx runs inside a Docker container.

### Architecture

```
Internet (:80)
    |
    v
+---------------------------+
| nginx Docker container    |
| serves static frontend    |
| proxies /api/ to host     |
+---------------------------+
    |
    v (http://172.18.0.1:8001)
+---------------------------+
| Host machine              |
| uvicorn (backend)         |
| Port 8001                 |
+---------------------------+
    |
    v
+---------------------------+
| openclaw-postgres         |
| Docker container          |
| Port 5433 -> 5432         |
+---------------------------+
```

### Step 1: Start PostgreSQL

```bash
cd backend
docker compose -f docker-compose.db.yml up -d
```

This starts PostgreSQL on `127.0.0.1:5433`.

### Step 2: Set Up Python Environment

```bash
python3.12 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

### Step 3: Configure Backend Environment

Create `backend/.env`:

```env
DATABASE_URL=postgresql+asyncpg://openclaw:your_password@127.0.0.1:5433/openclaw_manager
JWT_SECRET=<generate with: openssl rand -hex 32>
CORS_ORIGINS=https://yourdomain.com
OPENCLAW_BIN=/usr/local/bin/openclaw
```

> Adjust `OPENCLAW_BIN` to match the actual path. Find it with: `which openclaw`

### Step 4: Run Database Migrations

```bash
cd backend
alembic upgrade head
```

### Step 5: Create Initial Superadmin User

```bash
cd backend
python seed_admin.py
```

This prompts for username, display name, and password interactively.

### Step 6: Start the Backend

```bash
cd backend
python -m uvicorn server:app --host 0.0.0.0 --port 8001
```

For production, use a process manager like `systemd`:

```ini
# /etc/systemd/system/openclaw-manager.service
[Unit]
Description=OpenClaw Manager Backend
After=network.target docker.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/openclaw-manager/backend
Environment=PATH=/home/ubuntu/openclaw-manager/venv/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/home/ubuntu/openclaw-manager/venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8001
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable openclaw-manager
sudo systemctl start openclaw-manager
```

### Step 7: Build and Deploy Frontend

```bash
cd frontend
yarn install
yarn build
```

Copy the build output **into the nginx Docker container**:

```bash
docker cp frontend/build/. <nginx-container>:/usr/share/nginx/openclaw-manager/
```

### Step 8: Configure Nginx

Copy the nginx config into the container:

```bash
docker cp nginx-control.conf <nginx-container>:/etc/nginx/conf.d/control.conf
docker exec <nginx-container> nginx -s reload
```

Edit `nginx-control.conf` before copying — change these values:

```nginx
server_name yourdomain.com;                    # your domain
proxy_pass http://172.18.0.1:8001/api/;        # Docker bridge gateway IP
```

> Find your Docker bridge gateway IP with:
> ```bash
> docker network inspect bridge | grep Gateway
> ```

---

## Environment Variables Reference

### Docker Compose Mode (`.env` at project root)

| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTGRES_PASSWORD` | Yes | `oc_pg_s3cur3_2026` | PostgreSQL password |
| `JWT_SECRET` | Yes | `changeme...` | JWT signing secret (generate a random hex string) |
| `CORS_ORIGINS` | Yes | `*` | Comma-separated allowed origins for CORS |
| `OPENCLAW_DIR` | No | `~/.openclaw` | Host path to openclaw config directory |
| `ADMIN_USER` | No | `admin` | Username for auto-created superadmin |
| `ADMIN_PASSWORD` | No | _(empty)_ | Password for superadmin (if empty, seeding is skipped) |
| `ADMIN_NAME` | No | `Admin` | Display name for superadmin |
| `HTTP_PORT` | No | `80` | Host port for the frontend |

### Host Mode (`backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | Full PostgreSQL async connection string |
| `JWT_SECRET` | Yes | — | JWT signing secret |
| `CORS_ORIGINS` | Yes | — | Allowed CORS origins |
| `OPENCLAW_BIN` | No | Auto-detected | Path to the `openclaw` binary |

---

## RBAC Roles

The dashboard has three roles:

| Role | Access Level | Capabilities |
|---|---|---|
| `superadmin` | Full | Manage dashboard users, restart gateway, all CRUD operations |
| `admin` | Write | Edit agents, models, config, channels, bindings, notifications — cannot manage users |
| `user` | Read-only | View all pages, no edit/delete capabilities |

The first user created via `seed_admin.py` or `ADMIN_PASSWORD` env var is always `superadmin`.

---

## Database Migrations

Migrations are managed with Alembic.

```bash
# Run all pending migrations
cd backend && alembic upgrade head

# Check current migration state
cd backend && alembic current

# Create a new migration (after model changes)
cd backend && alembic revision --autogenerate -m "description"
```

In Docker Compose mode, `alembic upgrade head` runs automatically on every container start via `entrypoint.sh`.

---

## Troubleshooting

### Backend won't start — "JWT_SECRET environment variable must be set"

Set `JWT_SECRET` in your `.env` file:
```bash
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
```

### Frontend shows blank page

Check that the frontend build was deployed correctly:
```bash
# Docker Compose mode
docker compose logs frontend

# Host mode — verify files exist in the nginx container
docker exec <nginx-container> ls /usr/share/nginx/openclaw-manager/
```

### "openclaw" command not found in container

The backend Dockerfile installs `openclaw` via npm. Rebuild:
```bash
docker compose build --no-cache backend
```

### Cannot connect to PostgreSQL

```bash
# Docker Compose mode
docker compose logs postgres

# Host mode — check the container is running
docker ps | grep openclaw-postgres

# Test connection
docker exec openclaw-postgres pg_isready -U openclaw -d openclaw_manager
```

### WebSocket connection fails (real-time logs not updating)

Verify nginx is proxying WebSocket correctly. The `/api/ws/` location block must include:
```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "Upgrade";
```

### Permission denied on `~/.openclaw`

Ensure the directory is readable by the backend process (or container):
```bash
# Docker Compose — check volume mount
docker compose exec backend ls -la /root/.openclaw/

# Host mode
ls -la ~/.openclaw/
```
