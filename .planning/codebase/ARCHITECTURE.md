# Architecture

## System Design Pattern
**Layered Architecture** with clear separation:
- FastAPI backend (API router → dependencies/auth → ORM models → DB)
- React SPA frontend with router + contexts for state

## Architecture Diagram
```
[React UI]
  ├─ pages/components
  ├─ contexts (Auth, DashboardFilter)
  └─ services (apiClient + resource APIs)
        |
        |  HTTP JSON + JWT
        v
[FastAPI app]
  ├─ /api/v1/router → endpoints/*
  ├─ deps (auth, permissions)
  ├─ db.session (AsyncSession)
  └─ models (SQLAlchemy ORM)
        |
        v
[PostgreSQL Database]
```

## Data Flow
1. HTTP request → FastAPI endpoint
2. Dependency injection (`get_db`, `get_current_user`)
3. SQLAlchemy ORM operations
4. Response mapped to Pydantic schema
5. JSON back to client

## Key Abstractions

### Backend
| Layer | Location | Purpose |
|-------|----------|---------|
| Models | `backend/app/models/` | SQLAlchemy ORM entities |
| Schemas | `backend/app/schemas/` | Pydantic request/response DTOs |
| Endpoints | `backend/app/api/v1/endpoints/` | REST resources by domain |
| Dependencies | `backend/app/api/deps.py` | Auth + DB injection |
| Security | `backend/app/core/security.py` | JWT + permissions |
| Services | `backend/app/services/` | Business logic (reports) |

### Frontend
| Layer | Location | Purpose |
|-------|----------|---------|
| Pages | `frontend/src/pages/` | Route-level screens |
| Components | `frontend/src/components/` | Reusable UI |
| Contexts | `frontend/src/contexts/` | Auth + filter state |
| Services | `frontend/src/services/` | API client wrappers |
| Types | `frontend/src/types/` | TypeScript definitions |
| Hooks | `frontend/src/hooks/` | Custom hooks |

## Frontend/Backend Communication
- **Protocol**: REST JSON over HTTP
- **Auth**: `Authorization: Bearer <token>`
- **Base URL**: `VITE_API_URL` → `/api/v1`

---
*Last updated: 2025-12-28*
