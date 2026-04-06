# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build
# Output lands in /app/frontend/dist (vite.config.js outDir: 'dist')


# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM python:3.11-slim

# Install git — required for gitpython if re-added; harmless if not
# Keeps the image useful for future local-git scenarios
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    libpango-1.0-0 libpangoft2-1.0-0 libpangocairo-1.0-0 \
    libcairo2 libcairo-gobject2 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Bake build timestamp into image
RUN echo "{\"built_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > ./build_info.json

# Copy application source
COPY app/ ./app/

# Copy built frontend from stage 1
COPY --from=frontend-builder /app/frontend/dist ./static/

# Copy supporting files
COPY Procfile ./

# Default env vars — override at runtime
ENV GIT_CLONE_BASE_DIR=/tmp/cqa \
    GIT_COMMIT_AUTHOR_NAME="Code Quality Advisor" \
    GIT_COMMIT_AUTHOR_EMAIL="cqa@noreply.local" \
    LOG_LEVEL=INFO \
    PORT=8000

EXPOSE 8000

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
