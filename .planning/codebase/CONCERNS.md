# Concerns & Technical Debt

## Security
- Default `secret_key` values are hardcoded in `backend/app/core/config.py` and `AD Emulator/backend/app/config.py`; production depends on env overrides.
- JWT auth has no refresh token flow; frontend stores tokens in localStorage.
- No rate limiting on auth endpoints (noted in `.planning/STATE.md`).

## Reliability
- APScheduler runs in-process; multi-worker deployments can double-run jobs without a shared scheduler/lock.
- AD Emulator database/service is not defined in `docker-compose.yml`, so local setup is manual.

## Maintainability
- `backend/risk_management.db` exists alongside Postgres setup (likely legacy), which can confuse local devs.
- `frontend/src/pages/DashboardPage.tsx` is large (400+ lines) and may need refactoring as it grows.
