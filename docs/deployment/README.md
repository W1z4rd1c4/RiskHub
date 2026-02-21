# RiskHub Deployment Guide

> **Version**: 1.1  
> **Last Updated**: 2026-02-20  
> **Audience**: IT / DevOps / Platform Engineering

Back to tree: [`/Users/stefanlesnak/Antigravity/Risk App 2/docs/DOCUMENTATION_TREE.md`](../DOCUMENTATION_TREE.md)

---

## Overview

RiskHub is deployed as a containerized application:

- **backend**: FastAPI (Python) API server
- **frontend**: nginx serving the SPA and reverse-proxying `/api` to the backend
- **db**: PostgreSQL (system of record; either external/managed or containerized depending on deployment path)
- **redis**: required in production for rate limiting + account lockout

The backend enforces strict production guardrails when `DEBUG=false` (secrets, CORS, auth mode, Redis reachability, webhook secret requirements).

## Quick Links

| Doc | Purpose |
|-----|---------|
| [Installation Manual](./installation-manual.md) | Recommended starting point (single-host install; external PostgreSQL) |
| [Component Runtime Entrypoints](./component-runtime-entrypoints.md) | Frontend/backend/database component-scoped dev/test/prod scripts |
| [Install Scripts (external PostgreSQL)](./external-postgres-install-scripts.md) | Single-host deployment when PostgreSQL is managed outside Docker |
| [Docker Compose (prod)](./docker-compose-prod.md) | Single-host deployment using dockerized PostgreSQL + Redis |
| [Kubernetes](./kubernetes.md) | Cluster deployment guidance (no manifests in repo) |
| [Migrations](./migrations.md) | Alembic strategy, when/how to run, rollback posture |
| [Security Checklist](./security-checklist.md) | Pre-flight and ongoing hardening checklist |

## Configuration Source of Truth

- Install scripts path (external PostgreSQL):
  - `scripts/prod/config/backend.env.example` + `scripts/prod/config/frontend.env.example`
  - `scripts/prod/` (deploy/upgrade/rollback entrypoints)
- Docker Compose path (dockerized PostgreSQL/Redis):
  - `.env.example`
  - `docker-compose.yml` + `docker-compose.prod.yml`
- Production startup guards and invariants:
  - `backend/app/main.py`

## Operational Notes (Production)

- **SSO-only**: when `DEBUG=false`, `AUTH_MODE` must be `microsoft_sso`.
- **Redis required**: production startup fails if `REDIS_URL` is unset/unreachable.
- **Scheduler**: disabled unless `ENABLE_SCHEDULER=true`. Run it in exactly one backend *process* to avoid duplicate jobs (see Compose/K8s docs).
- **Docs/OpenAPI disabled**: `/docs` and `/openapi.json` are not served in production (`DEBUG=false`).
