# Phase 500 Config (Split Env Files)

This directory contains templates for the Phase 500 production install scripts:

- `backend.env.example` -> `backend.env` (backend + DB + SSO + redis + bootstrap config)
- `frontend.env.example` -> `frontend.env` (frontend published port config)

Recommended host paths:

- `/etc/riskhub/backend.env`
- `/etc/riskhub/frontend.env`

Key rules:

- PostgreSQL is external. Do not use the compose `db` hostname in `DATABASE_URL`.
- Redis is required when `DEBUG=false`. Phase 500 scripts install a redis container and use the docker network alias `redis`.
- Backend is not published on the host by default. Frontend proxies `/api/*` to backend via docker network alias `backend`.
- Docker `--env-file` does not expand `${VARS}`. The scripts compute `REDIS_URL` from `REDIS_PASSWORD` if `REDIS_URL` is empty.

Example dry-run:

```bash
scripts/prod/deploy.sh --backend-env /etc/riskhub/backend.env --frontend-env /etc/riskhub/frontend.env --tag dev --dry-run --yes
```
