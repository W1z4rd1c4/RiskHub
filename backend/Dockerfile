# RiskHub Backend Dockerfile
# Multi-stage Alpine build for reduced runtime attack surface.

# =============================================================================
# Stage 1: Build dependencies
# =============================================================================
FROM python:3.13-alpine@sha256:7415fbc3c9e4979cc717d92377ab2bc7b2b4a2af1ac03cc52b5f3f88efedaf3a AS builder-base

COPY security/apply_cpython_backport.py /tmp/apply_cpython_backport.py
RUN python /tmp/apply_cpython_backport.py && rm /tmp/apply_cpython_backport.py

WORKDIR /app

# Build deps for cffi/bcrypt/psycopg2 and other native wheels.
RUN apk add --no-cache \
    build-base \
    libffi-dev \
    openssl-dev \
    postgresql-dev

# Fixed upstream zlib while Alpine's package still carries the vulnerable version.
FROM builder-base AS builder-security
ADD --checksum=sha256:405ac4ad42a57eef1beab57536fc77367f08a5008a5d8ce652148c5dc4d9fe76 https://codeload.github.com/madler/zlib/tar.gz/d81c2d7eb705c62294ba03299255672078e89115 /tmp/zlib-fixed.tar.gz
RUN mkdir /tmp/zlib-fixed /fixed && \
    tar -xzf /tmp/zlib-fixed.tar.gz -C /tmp/zlib-fixed --strip-components=1 && \
    cd /tmp/zlib-fixed && ./configure --shared && make -j2 && make check && \
    cp libz.so.1.3.2.1-motley /fixed/libz.so.1.3.2 && \
    cp LICENSE /fixed/ZLIB-LICENSE

FROM builder-base AS builder-runtime

COPY requirements-runtime.txt ./requirements-runtime.txt
RUN pip install --no-cache-dir --upgrade pip==26.2.1 && \
    pip install --no-cache-dir --user -r requirements-runtime.txt

FROM builder-base AS builder-dbtasks

COPY requirements-runtime.txt ./requirements-runtime.txt
COPY requirements-db.txt ./requirements-db.txt
RUN pip install --no-cache-dir --upgrade pip==26.2.1 && \
    pip install --no-cache-dir --user -r requirements-db.txt

# =============================================================================
# Stage 2: Production runtime
# =============================================================================
FROM python:3.13-alpine@sha256:7415fbc3c9e4979cc717d92377ab2bc7b2b4a2af1ac03cc52b5f3f88efedaf3a AS runtime

WORKDIR /app

RUN python -m pip uninstall --yes pip && \
    rm -rf /usr/local/lib/python3.13/ensurepip
RUN apk upgrade --no-cache && apk add --no-cache su-exec

COPY --from=builder-base /usr/local/lib/python3.13/tarfile.py /usr/local/lib/python3.13/tarfile.py
COPY --from=builder-security /fixed/libz.so.1.3.2 /usr/lib/libz.so.1.3.2
COPY --from=builder-security /fixed/ZLIB-LICENSE /usr/local/share/licenses/zlib-backport/LICENSE
COPY security/verify_runtime_backports.py /tmp/verify_runtime_backports.py
RUN python /tmp/verify_runtime_backports.py && rm /tmp/verify_runtime_backports.py

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
FROM python:3.13-alpine@sha256:7415fbc3c9e4979cc717d92377ab2bc7b2b4a2af1ac03cc52b5f3f88efedaf3a AS dbtasks

WORKDIR /app

RUN python -m pip uninstall --yes pip && \
    rm -rf /usr/local/lib/python3.13/ensurepip
RUN apk upgrade --no-cache && apk add --no-cache \
    libpq \
    su-exec

COPY --from=builder-base /usr/local/lib/python3.13/tarfile.py /usr/local/lib/python3.13/tarfile.py
COPY --from=builder-security /fixed/libz.so.1.3.2 /usr/lib/libz.so.1.3.2
COPY --from=builder-security /fixed/ZLIB-LICENSE /usr/local/share/licenses/zlib-backport/LICENSE
COPY security/verify_runtime_backports.py /tmp/verify_runtime_backports.py
RUN python /tmp/verify_runtime_backports.py && rm /tmp/verify_runtime_backports.py

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
