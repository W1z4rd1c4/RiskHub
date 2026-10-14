# RiskHub Backend Dockerfile
# Multi-stage Alpine build for reduced runtime attack surface.

# =============================================================================
# Stage 1: Build dependencies
# =============================================================================
FROM python:3.13.16-alpine3.24@sha256:2d9aefe2fef018a7eb2c13064c89c71929800fd2e5dccdbf52ea5da5bb8d929a AS builder-base

WORKDIR /app

# Build deps for cffi/bcrypt/psycopg2 and other native wheels.
RUN apk upgrade --no-cache && apk add --no-cache \
    "zlib>=1.3.2-r1" \
    build-base \
    libffi-dev \
    openssl-dev \
    postgresql-dev

FROM builder-base AS builder-runtime

COPY locks/cpython313-alpine324-x86_64/requirements-pip.lock ./requirements-pip.lock
COPY locks/cpython313-alpine324-x86_64/requirements-runtime.lock ./requirements-runtime.lock
RUN python -m pip install --force-reinstall --no-cache-dir --require-hashes --only-binary=:all: -r requirements-pip.lock && \
    python -m pip install --force-reinstall --no-cache-dir --user --require-hashes --only-binary=:all: -r requirements-runtime.lock && \
    python -m pip check

FROM builder-base AS builder-dbtasks

COPY locks/cpython313-alpine324-x86_64/requirements-pip.lock ./requirements-pip.lock
COPY locks/cpython313-alpine324-x86_64/requirements-dbtasks.lock ./requirements-dbtasks.lock
RUN python -m pip install --force-reinstall --no-cache-dir --require-hashes --only-binary=:all: -r requirements-pip.lock && \
    python -m pip install --force-reinstall --no-cache-dir --user --require-hashes --only-binary=:all: -r requirements-dbtasks.lock && \
    python -m pip check

# =============================================================================
# Stage 2: Production runtime
# =============================================================================
FROM python:3.13.16-alpine3.24@sha256:2d9aefe2fef018a7eb2c13064c89c71929800fd2e5dccdbf52ea5da5bb8d929a AS runtime

WORKDIR /app

RUN python -m pip uninstall --yes pip && \
    rm -rf /usr/local/lib/python3.13/ensurepip
RUN apk upgrade --no-cache && apk add --no-cache "zlib>=1.3.2-r1" su-exec

COPY security/verify_runtime_security.py /tmp/verify_runtime_security.py
RUN python /tmp/verify_runtime_security.py && rm /tmp/verify_runtime_security.py

# Create non-root user with a stable uid/gid for host-mounted secret readability.
RUN addgroup -S -g 10001 riskhub && adduser -S -D -u 10001 -G riskhub riskhub

# Copy Python packages from builder
COPY --from=builder-runtime /root/.local /home/riskhub/.local
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Copy runtime application files and schema-guard assets.
COPY --chown=riskhub:riskhub app ./app
COPY --chown=riskhub:riskhub alembic ./alembic
COPY --chown=riskhub:riskhub alembic.ini ./alembic.ini

# Create logs directory
RUN find /app -name '.DS_Store' -delete && mkdir -p /app/logs && chown -R riskhub:riskhub /app/logs

# Repair bind-mounted log permissions before dropping to the non-root user.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Add local bin to PATH
ENV PATH=/home/riskhub/.local/bin:$PATH

# Environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    APP_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import sys; from urllib.request import urlopen; sys.exit(0 if urlopen('http://localhost:8000/api/v1/livez', timeout=5).status == 200 else 1)"

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]

# =============================================================================
# Stage 3: DB tasks runtime
# =============================================================================
FROM python:3.13.16-alpine3.24@sha256:2d9aefe2fef018a7eb2c13064c89c71929800fd2e5dccdbf52ea5da5bb8d929a AS dbtasks

WORKDIR /app

RUN python -m pip uninstall --yes pip && \
    rm -rf /usr/local/lib/python3.13/ensurepip
RUN apk upgrade --no-cache && apk add --no-cache \
    "zlib>=1.3.2-r1" \
    libpq \
    postgresql16-client \
    su-exec

COPY security/verify_runtime_security.py /tmp/verify_runtime_security.py
RUN python /tmp/verify_runtime_security.py && rm /tmp/verify_runtime_security.py

RUN addgroup -S -g 10001 riskhub && adduser -S -D -u 10001 -G riskhub riskhub

COPY --from=builder-dbtasks /root/.local /home/riskhub/.local
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

COPY --chown=riskhub:riskhub app ./app
COPY --chown=riskhub:riskhub alembic ./alembic
COPY --chown=riskhub:riskhub alembic.ini ./alembic.ini
COPY --chown=riskhub:riskhub scripts/__init__.py ./scripts/__init__.py
COPY --chown=riskhub:riskhub scripts/seed_roles_permissions.py ./scripts/seed_roles_permissions.py
COPY --chown=riskhub:riskhub scripts/seed_departments.py ./scripts/seed_departments.py
COPY --chown=riskhub:riskhub scripts/bootstrap_sso_user.py ./scripts/bootstrap_sso_user.py
COPY --chown=riskhub:riskhub scripts/bootstrap_local_users.py ./scripts/bootstrap_local_users.py
COPY --chown=riskhub:riskhub scripts/identity_preflight.py ./scripts/identity_preflight.py
COPY --chown=riskhub:riskhub scripts/identity_restore.py ./scripts/identity_restore.py
COPY --chown=riskhub:riskhub scripts/identity_installation.py ./scripts/identity_installation.py
COPY --chown=riskhub:riskhub scripts/local_recovery.py ./scripts/local_recovery.py
COPY --chown=riskhub:riskhub scripts/local_auth_keys.py ./scripts/local_auth_keys.py
COPY --chown=riskhub:riskhub scripts/revoke_refresh_sessions.py ./scripts/revoke_refresh_sessions.py

RUN find /app -name '.DS_Store' -delete && mkdir -p /app/logs && chown -R riskhub:riskhub /app/logs

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

ENV PATH=/home/riskhub/.local/bin:$PATH

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    APP_ENV=production

CMD ["python", "-V"]

# Keep the default build output aligned with the long-running runtime lane.
FROM runtime AS final
