# Integrations

## Databases

### RiskHub Database
- **Type**: PostgreSQL 16
- **Connection**: Via docker-compose (`riskhub` database)
- **Driver**: asyncpg (async) + psycopg2-binary (migrations)
- **Migrations**: Alembic in `backend/alembic/`

### AD Emulator Database
- **Type**: PostgreSQL 16
- **Database**: `ad_emulator_db` (separate from RiskHub)
- **Purpose**: Directory user storage for sync testing

## Internal Services

### AD Emulator API
- **Client**: `ADEmulatorClient` in `backend/app/integrations/ad_emulator.py`
- **Transport**: HTTP (httpx)
- **Purpose**: Fetch directory users for sync to RiskHub
- **Webhook**: `/api/v1/directory/webhook` for push updates

### Report Export Service
- **Module**: `backend/app/services/report_service.py`
- **PDF**: reportlab library
- **Excel**: openpyxl library
- **Exports**: Controls, Risks, Audit Trail, Activity Log

### Notification Service
- **Module**: `backend/app/services/notification_service.py`
- **Scheduler**: APScheduler (in-process)
- **Types**: KRI deadlines, approval requests, overdue alerts

## Auth & Identity

### JWT Authentication
- **Library**: python-jose (HS256)
- **Flow**: Login → JWT → Bearer token in headers
- **Expiry**: Configurable (no refresh token flow)

### Mock Auth (Development)
- **Header**: `X-Mock-User-Id`
- **Config**: `MOCK_AUTH_ENABLED=true` (blocked in production)
- **Purpose**: Testing without login

### RBAC Permissions
- **Implementation**: `backend/app/core/permissions.py`
- **Permissions**: 11+ granular (`risks:read`, `controls:write`, `kri:submit`, etc.)
- **Access Scope**: Global, Department, Manager levels

## Frontend-to-Backend

### API Client
- **Location**: `frontend/src/services/apiClient.ts`
- **Transport**: Axios with interceptors
- **Auth**: Bearer token from localStorage
- **Error Handling**: Centralized error parsing

### API Services (19 modules)
| Service | Endpoints |
|---------|-----------|
| authApi | Login, demo |
| riskApi | Risk CRUD |
| controlApi | Control CRUD |
| kriApi | KRI values + history |
| dashboardApi | Stats + widgets |
| userApi | User management |
| accessApi | Permission matrix |
| adminApi | System health, logs |
| approvalsApi | Workflow |
| departmentApi | Org structure |
| reportApi | PDF/Excel exports |
| riskHubApi | Config + risk types |
| activityLogApi | Audit trail |
| ... | (and more) |

## Logging & Monitoring

### Structured Logging
- **Library**: structlog + python-json-logger
- **Format**: JSON (SIEM-ready)
- **Context**: request_id, user_id, client_ip

### Audit Trail
- **Table**: `activity_log`
- **Integrity**: SHA-256 hash chain
- **Admin Access**: `/admin/logs/audit`

*Updated: 2026-01-10*
