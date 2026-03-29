# RiskHub Backend Dockerfile
# Multi-stage Alpine build for reduced runtime attack surface.

# =============================================================================
# Stage 1: Build dependencies
# =============================================================================
FROM python:3.13-alpine AS builder-base

WORKDIR /app

# Build deps for cffi/bcrypt/psycopg2 and other native wheels.
RUN apk add --no-cache \
    build-base \
    libffi-dev \
    openssl-dev \
    postgresql-dev

FROM builder-base AS builder-runtime

COPY requirements-runtime.txt ./requirements-runtime.txt
COPY requirements-db.txt ./requirements-db.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --user -r requirements-db.txt

# =============================================================================
# Stage 2: Production runtime
# =============================================================================
FROM python:3.13-alpine AS runtime

WORKDIR /app

RUN apk add --no-cache \
    libpq

# Create non-root user with a stable uid/gid for host-mounted secret readability.
RUN addgroup -S -g 10001 riskhub && adduser -S -D -u 10001 -G riskhub riskhub

# Copy Python packages from builder
COPY --from=builder-runtime /root/.local /home/riskhub/.local

# Copy runtime application files, schema-guard assets, and DB lifecycle helpers.
COPY --chown=riskhub:riskhub app ./app
COPY --chown=riskhub:riskhub alembic ./alembic
COPY --chown=riskhub:riskhub alembic.ini ./alembic.ini
COPY --chown=riskhub:riskhub scripts/__init__.py ./scripts/__init__.py
COPY --chown=riskhub:riskhub scripts/seed_roles_permissions.py ./scripts/seed_roles_permissions.py
COPY --chown=riskhub:riskhub scripts/seed_departments.py ./scripts/seed_departments.py
COPY --chown=riskhub:riskhub scripts/bootstrap_sso_user.py ./scripts/bootstrap_sso_user.py

# Create logs directory
RUN find /app -name '.DS_Store' -delete && mkdir -p /app/logs && chown -R riskhub:riskhub /app/logs

# Switch to non-root user
USER riskhub

# Add local bin to PATH
ENV PATH=/home/riskhub/.local/bin:$PATH

# Environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    APP_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import sys; from urllib.request import urlopen; sys.exit(0 if urlopen('http://localhost:8000/api/v1/health', timeout=5).status == 200 else 1)"

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]

# Keep the default build output aligned with the long-running runtime lane.
FROM runtime AS final
