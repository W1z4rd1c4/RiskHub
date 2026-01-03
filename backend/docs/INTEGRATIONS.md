# Platform Integrations

## Databases
- RiskHub: PostgreSQL via docker-compose (`riskhub` DB, Postgres 16).
- AD Emulator: separate Postgres database (`ad_emulator_db`) configured in emulator settings.

## Internal Services
- AD Emulator API: RiskHub uses `ADEmulatorClient` (httpx) to fetch directory users.
- Report exports: PDF/Excel generation in `report_service` (reportlab, openpyxl).

## Auth/Identity
- Local JWT auth (`python-jose`) with RBAC permissions.
- Mock auth via `X-Mock-User-Id` when enabled in settings.

## Frontend-to-Backend
- REST JSON API using Bearer tokens; `apiClient` handles auth and error parsing.
