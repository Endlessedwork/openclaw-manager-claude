# Code Review: สาขา `feat/session-chat-profiles`

**วันที่:** 28 กุมภาพันธ์ 2026
**ขอบเขต:** 69 ไฟล์, +8,283 / -524 บรรทัด (18 commits)
**ฟีเจอร์หลัก:** ย้าย MongoDB → PostgreSQL, เปลี่ยนชื่อ RBAC roles, Session Chat Viewer, Notifications, Bindings, Docker Compose

---

## สิ่งที่ทำได้ดี

- ย้ายจาก MongoDB ไป PostgreSQL ได้สะอาด ใช้ async SQLAlchemy/SQLModel อย่างถูกต้อง
- ทุก endpoint มี auth guard (`Depends(get_current_user)` / `Depends(require_role(...))`)
- ตรวจสอบ UUID ที่ input boundary (ส่วนใหญ่)
- ไม่มีช่องโหว่ XSS (ไม่ใช้ `dangerouslySetInnerHTML`)
- ป้องกัน path traversal ใน file routes ด้วย `.resolve()` + `.is_relative_to()`
- มี credential masking ใน file viewer
- ป้องกัน superadmin ลดสิทธิ์ตัวเอง

---

## ปัญหาวิกฤต (Critical) — ต้องแก้

### C1. รหัสผ่าน DB ฝังอยู่ในไฟล์ที่ commit

**ไฟล์:**
- `.env.example` — `POSTGRES_PASSWORD=oc_pg_s3cur3_2026`
- `backend/alembic.ini` — URL มีรหัสผ่านฝังอยู่
- `backend/migrate_strip_prefix.py` — default URL มีรหัสผ่าน
- `docker-compose.yml` — fallback มีรหัสผ่านจริง

**วิธีแก้:** เปลี่ยน `.env.example` เป็น `POSTGRES_PASSWORD=changeme`, ลบ URL ที่ฝังใน `alembic.ini` และ `migrate_strip_prefix.py`

### C2. LIKE Wildcard Injection ใน search

**ไฟล์:** `backend/server.py:1558`

```python
filters.append(SystemLog.message.ilike(f"%{search}%"))
```

ผู้ใช้สามารถใส่ `%` หรือ `_` เพื่อ match ข้อมูลที่ไม่ควรเห็นได้

**วิธีแก้:** escape wildcard characters ก่อนใช้:
```python
escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
filters.append(SystemLog.message.ilike(f"%{escaped}%", escape="\\"))
```

### C3. `int(binding_id)` ไม่มี error handling — ทำให้ server crash 500

**ไฟล์:** `backend/server.py:1482, 1508`

ถ้าส่ง binding_id ที่ไม่ใช่ตัวเลข (เช่น `abc`) จะเกิด `ValueError` แล้ว return 500 พร้อม traceback

**วิธีแก้:**
```python
try:
    idx = int(binding_id)
except ValueError:
    raise HTTPException(400, "Invalid binding ID")
```

### C4. CORS อนุญาต wildcard origin พร้อม credentials

**ไฟล์:** `backend/server.py:2109-2115`, `.env.example`

ตั้ง `allow_credentials=True` กับ `allow_origins=["*"]` ทำให้เว็บไหนก็ได้สามารถส่ง request พร้อม cookie ของผู้ใช้มาที่ API ได้

**วิธีแก้:** เปลี่ยน default เป็น domain จริง เช่น `CORS_ORIGINS=https://control.winecore.work` หรืออย่างน้อย `http://localhost:3000` สำหรับ dev

### C5. Refresh token cookie ตั้ง `secure=False` ตายตัว

**ไฟล์:** `backend/routes/auth_routes.py:42, 93`

Cookie จะถูกส่งผ่าน HTTP ธรรมดา (ไม่เข้ารหัส) ทำให้ถูกดักจับได้

**วิธีแก้:** ทำให้ตั้งค่าได้ผ่าน environment variable:
```python
secure=os.environ.get("COOKIE_SECURE", "false").lower() == "true"
```

---

## ปัญหาสำคัญ (Important) — ควรแก้

### I1. ฟังก์ชัน `utcnow` คืนค่าเวลากรุงเทพ ไม่ใช่ UTC

**ไฟล์:** `backend/utils.py`

ชื่อฟังก์ชัน `utcnow` แต่จริง ๆ คืนเวลา UTC+7 — ทำให้สับสนและอาจเกิดปัญหาเมื่อเปรียบเทียบเวลาข้ามระบบ

**วิธีแก้:** เปลี่ยนชื่อเป็น `now_bkk` ทั้งโปรเจกต์ หรือใช้ UTC จริงแล้วแปลงตอนแสดงผล

### I2. ไม่มี case-insensitive matching ใน conversation profile lookup

**ไฟล์:** `backend/routes/conversation_routes.py:96-99`

ผิดกฎที่ CLAUDE.md กำหนดไว้ — ต้องใช้ `func.lower()` เมื่อ match session key กับ bot_users/bot_groups ไม่งั้นจะหา display name ของผู้ใช้ LINE ไม่เจอ

**วิธีแก้:**
```python
result = await session.execute(
    select(BotUser).where(
        func.lower(BotUser.platform_user_id).in_([pid.lower() for pid in platform_ids])
    )
)
```

### I3. Notification rules รับ `dict` แทน Pydantic model

**ไฟล์:** `backend/routes/notification_routes.py:56, 79`

ไม่มีการตรวจสอบ type, ความยาว, หรือ required fields — อาจส่งข้อมูลผิด type เข้า database ได้

**วิธีแก้:** สร้าง Pydantic model สำหรับ request body

### I4. `uuid.UUID(rule_id)` ไม่มี try/except

**ไฟล์:** `backend/routes/notification_routes.py:81, 96`

ถ้า rule_id ไม่ใช่ UUID ที่ถูกต้อง จะ crash 500 พร้อม stack trace

**วิธีแก้:** ครอบด้วย try/except เหมือน route อื่น ๆ ในโปรเจกต์

### I5. Global cache `_gateway_env_cache` มี race condition

**ไฟล์:** `backend/server.py:699`

หลาย request อาจตัดสินใจว่า cache หมดอายุพร้อมกันแล้วอ่าน `/proc/PID/environ` ซ้ำ

**วิธีแก้:** ใช้ `asyncio.Lock()` ป้องกัน

### I6. Error message ใน notification test รั่วข้อมูลภายใน

**ไฟล์:** `backend/routes/notification_routes.py:116`

`return {"ok": False, "error": str(e)}` — อาจเปิดเผย path ภายใน, คำสั่ง subprocess, หรือข้อมูลอื่น

**วิธีแก้:** return ข้อความทั่วไป แล้ว log รายละเอียดฝั่ง server

### I7. Docker Compose JWT_SECRET มี fallback ที่เดาได้

**ไฟล์:** `docker-compose.yml:31`

ถ้าไม่ตั้ง env var จะใช้ `changeme_generate_a_real_secret` ทำให้ใครก็ปลอม token ได้

**วิธีแก้:** เปลี่ยนเป็น `${JWT_SECRET:?JWT_SECRET must be set}` ให้ fail ทันทีถ้าไม่ตั้ง

### I8. SQL Injection ผ่าน f-string table name ใน import scripts

**ไฟล์:** `backend/import_memory.py:194,199` และ `backend/import_file_data.py:494`

ใช้ f-string สำหรับชื่อตารางใน SQL query — ถึงจะมาจาก hardcoded list แต่เป็น pattern ที่ไม่ดี

**วิธีแก้:** validate ชื่อตารางด้วย regex `[a-zA-Z0-9_]+` ก่อนใช้

---

## ข้อเสนอแนะ (Suggestions) — ทำได้ถ้ามีเวลา

| # | เรื่อง | รายละเอียด |
|---|--------|-----------|
| S1 | ย้าย role migration ออกจาก startup | ควรเป็น Alembic data migration ครั้งเดียว ไม่ใช่รันทุกครั้งที่ server เริ่ม |
| S2 | Session injection ไม่สม่ำเสมอ | บาง route import `async_session` ตรง บาง route ใช้ `request.app.state` — ควรใช้วิธีเดียวกัน |
| S3 | `server.py` ยาว 2,124 บรรทัด | ควรแยกเป็น route modules (เช่น `binding_routes.py`, `model_routes.py`) |
| S4 | ใช้ `@app.on_event` ที่ deprecated | ควรเปลี่ยนเป็น `lifespan` context manager |
| S5 | ไม่มี pagination ใน workspace list endpoints | ข้อมูลมากขึ้นจะช้า |
| S6 | ไม่มี test สำหรับหน้าใหม่ | NotificationsPage, BindingsPage, SessionChatSheet ยังไม่มี test |

---

## สรุป

| ระดับ | จำนวน |
|-------|-------|
| วิกฤต (Critical) | 5 |
| สำคัญ (Important) | 9 |
| ข้อเสนอแนะ (Suggestions) | 6 |

**ลำดับความสำคัญในการแก้:** C1 (รหัสผ่านรั่ว) → C4 (CORS) → C5 (cookie ไม่ secure) → C3 (crash 500) → C2 (wildcard injection) → I2 (case matching) → ที่เหลือ
