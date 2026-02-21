# RiskHub Backend Dockerfile
# Multi-stage Alpine build for reduced runtime attack surface.

# =============================================================================
# Stage 1: Build dependencies
# =============================================================================
FROM python:3.13-alpine AS builder

WORKDIR /app

# Build deps for cffi/bcrypt/psycopg2 and other native wheels.
RUN apk add --no-cache \
    build-base \
    libffi-dev \
    openssl-dev \
    postgresql-dev

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --user -r requirements.txt

# =============================================================================
# Stage 2: Production runtime
# =============================================================================
FROM python:3.13-alpine AS runtime

WORKDIR /app

RUN apk add --no-cache \
    libpq \
    curl

# Create non-root user for security
RUN addgroup -S riskhub && adduser -S riskhub -G riskhub

# Copy Python packages from builder
COPY --from=builder /root/.local /home/riskhub/.local

# Copy runtime application files and operational scripts used by prod bootstrap flows
COPY --chown=riskhub:riskhub app ./app
COPY --chown=riskhub:riskhub alembic ./alembic
COPY --chown=riskhub:riskhub alembic.ini ./alembic.ini
COPY --chown=riskhub:riskhub scripts ./scripts

# Create logs directory
RUN mkdir -p /app/logs && chown -R riskhub:riskhub /app/logs

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
    CMD curl -f http://localhost:8000/api/v1/health || exit 1

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
