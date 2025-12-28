# Integrations

## Database (PostgreSQL)
- **Connection**: `postgresql+asyncpg://localhost:5432/riskhub`
- **Config**: `backend/app/core/config.py`
- **Session**: Async SQLAlchemy engine in `backend/app/db/session.py`
- **Docker**: PostgreSQL 16 via `docker-compose.yml` (user/db: `riskhub`)
- **Migrations**: Alembic in `backend/alembic/`

## Authentication
- **Method**: JWT-based (HS256) via `python-jose`
- **Token Expiry**: Configurable via `access_token_expire_minutes` (default: 60)
- **Password Hashing**: `passlib` + `bcrypt`
- **Mock Auth**: Dev-only via `MOCK_AUTH_ENABLED` + `X-Mock-User-Id` header
- **Frontend Storage**: JWT in `localStorage`, sent as `Authorization: Bearer`

## Internal APIs
- **Base URL**: `VITE_API_URL` (default: `http://localhost:8000`)
- **API Prefix**: `/api/v1`
- **Auth Endpoint**: `/api/v1/auth`

## Third-Party Services
- **None detected** - No external SaaS integrations
- **Report Export**: Local libraries (ReportLab for PDF, OpenPyXL for Excel)

## API Services (Frontend)
| Service | Endpoint Prefix | File |
|---------|-----------------|------|
| Auth | `/api/v1/auth` | `authApi.ts` |
| Risks | `/api/v1/risks` | `riskApi.ts` |
| Controls | `/api/v1/controls` | `controlApi.ts` |
| KRIs | `/api/v1/kris` | `kriApi.ts` |
| Approvals | `/api/v1/approvals` | `approvalsApi.ts` |
| Dashboard | `/api/v1/dashboard` | `dashboardApi.ts` |
| Departments | `/api/v1/departments` | `departmentApi.ts` |
| Reports | `/api/v1/reports` | `reportApi.ts` |
| Users | `/api/v1/users` | `userApi.ts` |

---
*Last updated: 2025-12-28*
