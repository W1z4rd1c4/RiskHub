# RiskHub Deployment Guide

> **Version**: 1.0  
> **Last Updated**: 2026-02-15  
> **Audience**: IT / DevOps / Platform Engineering

---

## Overview

RiskHub is deployed as a containerized application:

- **backend**: FastAPI (Python) API server
- **frontend**: nginx serving the SPA and reverse-proxying `/api` to the backend
- **db**: PostgreSQL (system of record)
- **redis**: required in production for rate limiting + account lockout

The backend enforces strict production guardrails when `DEBUG=false` (secrets, CORS, auth mode, Redis reachability, webhook secret requirements).

## Quick Links

| Doc | Purpose |
|-----|---------|
| [Docker Compose (prod)](./docker-compose-prod.md) | Recommended on-prem single-host deployment |
| [Kubernetes](./kubernetes.md) | Cluster deployment guidance (no manifests in repo) |
| [Migrations](./migrations.md) | Alembic strategy, when/how to run, rollback posture |
| [Security Checklist](./security-checklist.md) | Pre-flight and ongoing hardening checklist |

## Configuration Source of Truth

- `.env.example` — complete production environment template
- `docker-compose.yml` + `docker-compose.prod.yml` — container wiring
- `backend/app/main.py` — production startup guards and invariants

## Operational Notes (Production)

- **SSO-only**: when `DEBUG=false`, `AUTH_MODE` must be `microsoft_sso`.
- **Redis required**: production startup fails if `REDIS_URL` is unset/unreachable.
- **Scheduler**: disabled unless `ENABLE_SCHEDULER=true`. Run it in exactly one backend *process* to avoid duplicate jobs (see Compose/K8s docs).
- **Docs/OpenAPI disabled**: `/docs` and `/openapi.json` are not served in production (`DEBUG=false`).

