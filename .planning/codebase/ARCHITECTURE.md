# Architecture

> Last updated: 2025-12-26 (Post Phase 7: User Management & RBAC)

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    React SPA (Vite)                         │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │ Pages   │  │Components│  │ Services │  │  Contexts   │  │
│  │         │  │          │  │          │  │ (AuthContext)│  │
│  └────┬────┘  └────┬─────┘  └────┬─────┘  └──────┬──────┘  │
└───────┼────────────┼─────────────┼───────────────┼──────────┘
        │            │             │               │
        └────────────┴─────────────┴───────────────┘
                           │
                    HTTP (REST API)
                    JWT Bearer Token
                           │
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Backend                          │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │Endpoints│  │ Schemas  │  │  Models  │  │Dependencies │  │
│  │         │  │          │  │          │  │ (JWT Auth)  │  │
│  └────┬────┘  └────┬─────┘  └────┬─────┘  └──────┬──────┘  │
└───────┼────────────┼─────────────┼───────────────┼──────────┘
        │            │             │               │
        └────────────┴─────────────┴───────────────┘
                           │
                      PostgreSQL
```

## Backend Architecture

### Entry Point
- `backend/app/main.py` - FastAPI app with CORS, mounts router

### Router Structure
- `backend/app/api/v1/router.py` - Combines all resource routers
- Resources: health, **auth**, users, controls, risks, dashboard, departments, reports, executions, kris

### Layers
| Layer | Path | Purpose |
|-------|------|---------|
| Endpoints | `app/api/v1/endpoints/` | HTTP handlers with permission checks |
| Schemas | `app/schemas/` | Pydantic DTOs |
| Models | `app/models/` | SQLAlchemy ORM (User, Role, Permission, etc.) |
| Services | `app/services/` | Business logic (reports) |
| Core | `app/core/` | Config, security (JWT, password hashing) |
| Core | `app/core/permissions.py` | Permission utilities (RBAC) |
| DB | `app/db/` | Session management |
| API | `app/api/deps.py` | Dependency injection (JWT auth) |
| Scripts | `backend/scripts/` | Seed scripts for test data |

## Frontend Architecture

### Entry Point
- `frontend/src/main.tsx` → `App.tsx` with React Router
- Protected routes with authentication checks

### Layers
| Layer | Path | Purpose |
|-------|------|---------|
| Pages | `src/pages/` | Route-level views (LoginPage, Dashboard, etc.) |
| Components | `src/components/` | Reusable UI (Header with logout) |
| Services | `src/services/` | API clients (authApi, risksApi, etc.) |
| Types | `src/types/` | TypeScript DTOs |
| Contexts | `src/contexts/` | Global state (AuthContext with JWT) |

## Authentication & Authorization

### Authentication Flow
1. User submits email/password to `/api/v1/auth/login`
2. Backend validates credentials, returns JWT access token
3. Frontend stores token in localStorage
4. Frontend includes token in `Authorization: Bearer <token>` header
5. Backend validates JWT on each request via `deps.get_current_user`

### Authorization (RBAC)
- **Roles**: 13 roles (Admin, CEO, CFO, CRO, COO, Risk Manager, Compliance, Legal, Audit, Actuarial, Dept Head, Employee, Viewer)
- **Permissions**: Resource:action pairs (e.g., `risks:write`, `users:read`)
- **Role-Permission Mapping**: Stored in `role_permissions` junction table
- **Permission Checking**: `app/core/permissions.py` utilities

### Data Filtering
- **Privileged Users** (CRO, CEO, CFO, Risk Manager, etc.): See ALL data
- **Department-Scoped Users** (COO, Dept Heads, Employees): See only their department's data
- **Implementation**: `get_user_department_ids()` returns empty list for privileged, `[dept_id]` for scoped

## Key Patterns

### Authentication
- **JWT Tokens**: 60-minute expiration, Bearer scheme
- **Password Hashing**: bcrypt via passlib
- **Token Storage**: localStorage (frontend)
- **Protected Routes**: `ProtectedRoute` component checks `isAuthenticated`

### Authorization
- **Permission Filtering**: Applied at query level (e.g., `WHERE department_id IN (user_dept_ids)`)
- **Endpoint Protection**: `Depends(deps.get_current_user)` on all authenticated endpoints
- **Permission Checks**: `has_permission(user, resource, action)` for specific actions

### Async DB
- All endpoints use `AsyncSession` with `select()` queries
- Eager loading with `selectinload()` to prevent N+1 queries
- Connection pooling via asyncpg

### Pagination
- Standard response format: `{items, total, skip, limit}`
- Default limit: 50, max: 100

### State Management
- **Frontend**: React Context + useState (no Redux/Zustand)
- **AuthContext**: Manages user, token, login, logout, permissions
- **DashboardFilterContext**: Manages dashboard filters

## Database Schema

### Core Models
- **User**: Authentication, role assignment, department assignment, manager hierarchy
- **Role**: Role definitions with display names
- **Permission**: Resource:action permissions
- **RolePermission**: Junction table for role-permission mapping
- **Department**: Organizational structure
- **Risk**: Risk register entries
- **Control**: Control catalog
- **ControlExecution**: Control execution history
- **KeyRiskIndicator**: KRI definitions and values
- **ControlRiskLink**: Many-to-many risk-control relationships

### Relationships
- User → Role (many-to-one)
- User → Department (many-to-one)
- User → User (manager, many-to-one)
- Role → Permission (many-to-many via RolePermission)
- Risk → Department (many-to-one)
- Control → Department (many-to-one)
- Risk ↔ Control (many-to-many via ControlRiskLink)

## API Endpoints

### Authentication
- `POST /api/v1/auth/login` - Login with email/password, returns JWT
- `GET /api/v1/auth/me` - Get current user info (requires JWT)
- `POST /api/v1/auth/logout` - Logout (client-side token removal)

### User Management
- `GET /api/v1/users` - List users (admin only)
- `POST /api/v1/users` - Create user (admin only)
- `GET /api/v1/users/{id}` - Get user details
- `PUT /api/v1/users/{id}` - Update user
- `DELETE /api/v1/users/{id}` - Delete user (soft delete)
- `GET /api/v1/users/{id}/subordinates` - Get user's direct reports

### Risk Management (Permission-Filtered)
- `GET /api/v1/risks` - List risks (filtered by department access)
- `POST /api/v1/risks` - Create risk (requires `risks:write`)
- `GET /api/v1/risks/{id}` - Get risk details
- `PUT /api/v1/risks/{id}` - Update risk
- `DELETE /api/v1/risks/{id}` - Delete risk (requires `risks:delete`)

### Control Management (Permission-Filtered)
- `GET /api/v1/controls` - List controls (filtered by department access)
- `POST /api/v1/controls` - Create control (requires `controls:write`)
- `GET /api/v1/controls/{id}` - Get control details
- `PUT /api/v1/controls/{id}` - Update control
- `DELETE /api/v1/controls/{id}` - Delete control

### Other Resources
- `/api/v1/kris` - KRI management (needs permission filtering)
- `/api/v1/departments` - Department management (needs permission filtering)
- `/api/v1/dashboard` - Dashboard aggregations (needs permission filtering)
- `/api/v1/reports` - Report generation

## Seed Scripts

### Data Generation
- `backend/scripts/seed_roles_permissions.py` - Creates 13 roles and 12 permissions
- `backend/scripts/seed_users.py` - Creates 120 test users with realistic structure
- `backend/scripts/seed_all.py` - Master script to run all seeds in order

### Demo Accounts (password: test123)
- `cro@riskhub.test` - CRO with full access
- `coo@riskhub.test` - COO with Operations department access only
- `ops.employee@riskhub.test` - Employee under COO

## Security Considerations

### Implemented
- ✅ JWT token authentication
- ✅ Password hashing with bcrypt
- ✅ Permission-based authorization
- ✅ Department-scoped data filtering
- ✅ SQL injection prevention (SQLAlchemy ORM)
- ✅ Input validation (Pydantic)

### Pending
- ⚠️ Token refresh mechanism
- ⚠️ Rate limiting
- ⚠️ CSRF protection
- ⚠️ Entra ID/M365 integration (planned)

## Performance Optimizations

### Backend
- Async database queries
- Connection pooling
- Eager loading (`selectinload`) to prevent N+1 queries
- Pagination for large datasets
- Department filtering at query level (not in-memory)

### Frontend
- Code splitting (Vite)
- Lazy loading routes
- Optimized re-renders (React)
- Token stored in localStorage (no repeated auth calls)

## Deployment

### Local Development
- Backend: `uvicorn app.main:app --reload` (port 8000)
- Frontend: `npm run dev` (port 5173)
- Database: PostgreSQL via Docker Compose

### Production (Planned)
- Docker containers for backend and frontend
- Kubernetes orchestration
- Environment-based configuration
- Secrets management for JWT secret, DB credentials
