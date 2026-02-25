# OpenClaw Manager — Setup Guide

คู่มือการติดตั้งและ deploy OpenClaw Manager dashboard บนเครื่อง server

## สิ่งที่ต้องมี

| ซอฟต์แวร์ | เวอร์ชันขั้นต่ำ | หมายเหตุ |
|-----------|----------------|---------|
| Python | 3.12+ | สำหรับ backend |
| Node.js | 18+ | สำหรับ build frontend |
| Yarn | 1.22+ | package manager ของ frontend |
| MongoDB | 7.x | เก็บข้อมูล users, logs, activities |
| Docker | 24+ | สำหรับ nginx reverse proxy |
| OpenClaw CLI | ล่าสุด | `npm install -g openclaw` |

## 1. Clone โปรเจค

```bash
git clone https://github.com/Endlessedwork/openclaw-manager-claude.git
cd openclaw-manager-claude
```

## 2. ตั้งค่า Backend

### 2.1 สร้าง Virtual Environment

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

### 2.2 สร้างไฟล์ Environment

```bash
cp backend/.env.example backend/.env   # ถ้ามี template
# หรือสร้างเอง:
```

สร้างไฟล์ `backend/.env` ด้วยค่าเหล่านี้:

```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=openclaw_manager
JWT_SECRET=<สร้าง random string ด้วย: openssl rand -hex 32>
```

> **สำคัญ**: ห้ามใช้ค่า JWT_SECRET เดียวกับตัวอย่าง ต้อง generate ใหม่ทุกครั้ง

### 2.3 ตั้งค่า OpenClaw CLI Path (ถ้าจำเป็น)

Backend จะหา `openclaw` binary ตามลำดับนี้:

1. **Environment variable `OPENCLAW_BIN`** — ถ้าตั้งไว้จะใช้ path นี้เลย
2. **`PATH` ของระบบ** — หาอัตโนมัติผ่าน `which openclaw`
3. **`~/.npm-global/bin/openclaw`** — fallback สุดท้าย

ถ้า `openclaw` อยู่ใน PATH อยู่แล้ว ไม่ต้องตั้งค่าอะไรเพิ่ม แต่ถ้าอยู่ที่ path อื่น ให้ set env var:

```bash
# ตัวอย่าง: ใน .env หรือ systemd service
OPENCLAW_BIN=/usr/bin/openclaw
```

### 2.4 สร้าง Admin User

```bash
source venv/bin/activate
cd backend && python seed_admin.py
```

ระบบจะถาม username, display name, และ password

### 2.5 รัน Backend Server

```bash
source venv/bin/activate
cd backend && python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

ตรวจสอบว่าทำงานได้:

```bash
curl http://localhost:8001/api/health
```

## 3. ตั้งค่า Frontend

### 3.1 Install Dependencies

```bash
cd frontend
yarn install
```

### 3.2 Build สำหรับ Production

```bash
cd frontend
yarn build
```

ไฟล์ที่ build แล้วจะอยู่ใน `frontend/build/`

### 3.3 (Dev) รันแบบ Development

```bash
cd frontend
REACT_APP_BACKEND_URL=http://localhost:8001 yarn start
```

## 4. Deploy ด้วย Docker + Nginx

### 4.1 โครงสร้าง Infrastructure

```
Internet (HTTP :80)
    │
    ▼
┌──────────────────────────────┐
│  nginx container (Docker)    │
│  Port 80 → reverse proxy     │
└──┬───────────────────────────┘
   │
   ├── Static files → /usr/share/nginx/openclaw-manager/
   │                   (frontend build)
   │
   ├── /api/*       → http://<host-ip>:8001
   │                   (backend บน host)
   │
   └── /api/ws/*    → WebSocket proxy → :8001
```

### 4.2 ตั้งค่า Nginx Config

ใช้ไฟล์ `nginx-control.conf` เป็น template แก้ไขค่าตามเครื่อง:

```nginx
server {
    listen 80;
    server_name your-domain.com;        # ← แก้เป็น domain ของคุณ
    root /usr/share/nginx/openclaw-manager;
    index index.html;

    # React SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy — แก้ IP เป็น host gateway ของ Docker network
    location /api/ {
        proxy_pass http://172.18.0.1:8001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket proxy
    location /api/ws/ {
        proxy_pass http://172.18.0.1:8001/api/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_read_timeout 86400s;
    }
}
```

> **หมายเหตุ**: `172.18.0.1` คือ host gateway ของ Docker network ตรวจสอบด้วย:
> ```bash
> docker network inspect <network-name> | grep Gateway
> ```

### 4.3 Copy Nginx Config เข้า Container

```bash
docker cp nginx-control.conf <nginx-container>:/etc/nginx/conf.d/control.conf
docker exec <nginx-container> nginx -s reload
```

### 4.4 Deploy Frontend เข้า Container

```bash
# Build frontend
cd frontend && yarn build

# Copy ไฟล์เข้า nginx container
docker cp frontend/build/. <nginx-container>:/usr/share/nginx/openclaw-manager/

# Reload nginx
docker exec <nginx-container> nginx -s reload
```

> **ข้อผิดพลาดที่พบบ่อย**: อย่า copy ไปที่ path `/usr/share/nginx/openclaw-manager/` บน host — path นี้อยู่ **ภายใน Docker container เท่านั้น**

## 5. รัน Backend เป็น Systemd Service (แนะนำ)

สร้างไฟล์ `/etc/systemd/system/openclaw-manager.service`:

```ini
[Unit]
Description=OpenClaw Manager Backend
After=network.target

[Service]
Type=simple
User=<your-user>
WorkingDirectory=/path/to/openclaw-manager/backend
Environment=OPENCLAW_BIN=/usr/bin/openclaw
ExecStart=/path/to/openclaw-manager/venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now openclaw-manager
sudo systemctl status openclaw-manager
```

## 6. ตรวจสอบว่าทุกอย่างทำงาน

| ตรวจสอบ | คำสั่ง | ผลที่ควรได้ |
|---------|--------|------------|
| MongoDB | `mongosh --eval "db.runCommand({ping:1})"` | `{ ok: 1 }` |
| Backend | `curl http://localhost:8001/api/health` | JSON health data |
| OpenClaw CLI | `openclaw --version` | เวอร์ชันปัจจุบัน |
| Frontend | เปิด browser ไปที่ domain ที่ตั้งไว้ | หน้า login |

## Troubleshooting

### Backend หา openclaw ไม่เจอ

```
RuntimeError: CLI error: openclaw: command not found
```

**แก้ไข**: ตั้ง `OPENCLAW_BIN` ให้ชี้ไป path ที่ถูกต้อง:

```bash
which openclaw                          # หา path จริง
export OPENCLAW_BIN=/usr/bin/openclaw   # set ให้ backend
```

### Frontend โหลดแล้วขึ้นหน้าขาว

ตรวจสอบว่า:
1. Build files ถูก copy เข้า Docker container แล้ว (ไม่ใช่ host)
2. Nginx config ชี้ root ไปที่ `/usr/share/nginx/openclaw-manager`
3. `try_files` มี fallback ไป `/index.html` สำหรับ SPA routing

### API calls return 502

ตรวจสอบว่า:
1. Backend กำลังรันอยู่ที่ port 8001
2. Docker host gateway IP ถูกต้องใน nginx config
3. Firewall ไม่ block port 8001
