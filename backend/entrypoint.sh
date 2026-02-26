#!/bin/bash
set -e

echo "⏳ Waiting for PostgreSQL..."
while ! python -c "
import socket, sys, os
s = socket.socket()
try:
    s.connect(('postgres', 5432))
    s.close()
    sys.exit(0)
except:
    sys.exit(1)
" 2>/dev/null; do
    sleep 1
done
echo "✅ PostgreSQL is ready"

cd /app/backend

echo "📦 Running database migrations..."
alembic upgrade head

if [ -n "$ADMIN_PASSWORD" ]; then
    echo "👤 Checking admin user..."
    python seed_admin_docker.py
fi

echo "🚀 Starting backend server..."
exec uvicorn server:app --host 0.0.0.0 --port 8001
