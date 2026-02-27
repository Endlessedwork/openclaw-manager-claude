FROM python:3.12-slim

# System dependencies + Node.js for openclaw CLI
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl gnupg build-essential && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install openclaw CLI globally
RUN npm install -g openclaw

# Python dependencies
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ .

# Entrypoint
COPY backend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8001

ENTRYPOINT ["/entrypoint.sh"]
