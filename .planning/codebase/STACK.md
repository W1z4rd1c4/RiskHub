# Stack

> Last updated: 2025-12-26 (Post Phase 7: User Management & RBAC)

## Languages

| Layer | Language | Version |
|-------|----------|---------|
| Backend | Python | 3.11+ |
| Frontend | TypeScript | 5.x |

## Frameworks

| Component | Framework | Notes |
|-----------|-----------|-------|
| API | FastAPI + Uvicorn | Async REST API with JWT auth |
| ORM | SQLAlchemy 2.0 | Async with asyncpg |
| Migrations | Alembic | Sync driver psycopg2 |
| Frontend | React 19 + Vite | SPA with React Router |
| Styling | Tailwind CSS | With tailwind-merge/animate |
| UI Components | Radix UI | Accessible primitives |
| Charts | Recharts | Dashboard visualizations |
| Animations | Framer Motion | Page transitions |

## Database

- **Production**: PostgreSQL via `asyncpg`
- **Testing**: SQLite in-memory via `aiosqlite`
- **Migrations**: Alembic with sync `psycopg2` driver

## Authentication & Security (New in Phase 7)

| Component | Library | Purpose |
|-----------|---------|---------|
| JWT Tokens | python-jose[cryptography] | Token generation and validation |
| Password Hashing | passlib[bcrypt] | Secure password storage |
| Token Validation | FastAPI Depends | Dependency injection for auth |

## Key Dependencies

### Backend (`requirements.txt`)
```
# Core Framework
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
sqlalchemy[asyncio]>=2.0.0
asyncpg>=0.29.0

# Data Validation
pydantic>=2.0.0
pydantic-settings
email-validator

# Database & Migrations
alembic>=1.12.0
psycopg2-binary  # For Alembic migrations

# Authentication & Security (Phase 7)
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.4
python-multipart

# Document Generation
reportlab
openpyxl

# Testing
pytest>=7.4.0
pytest-asyncio>=0.21.0
httpx>=0.25.0
aiosqlite  # For test database
```

### Frontend (`package.json`)
```
# Core Framework
react@^18.2.0
react-dom@^18.2.0
react-router-dom@^6.20.0

# Styling
tailwindcss@^3.3.0
@radix-ui/*  # UI primitives
lucide-react@^0.294.0  # Icons

# Data Visualization
recharts@^2.10.0

# Animations
framer-motion

# Utilities
class-variance-authority
clsx
tailwind-merge

# Testing
vitest
@testing-library/react
msw  # Mock Service Worker
```

## New Models (Phase 7)

### Database Models
- **User** - Authentication, role assignment, department, manager hierarchy
- **Role** - Role definitions (13 roles: Admin, CEO, CFO, CRO, COO, etc.)
- **Permission** - Resource:action permissions (12 permissions)
- **RolePermission** - Junction table for role-permission mapping

### Existing Models (Enhanced)
- **Department** - Now linked to users
- **Risk** - Now has permission filtering by department
- **Control** - Now has permission filtering by department
- **KeyRiskIndicator** - Needs permission filtering
- **ControlExecution** - Control execution history

## API Endpoints (New in Phase 7)

### Authentication
- `POST /api/v1/auth/login` - JWT login
- `GET /api/v1/auth/me` - Get current user
- `POST /api/v1/auth/logout` - Logout (client-side)

### User Management
- `GET /api/v1/users` - List users (admin only)
- `POST /api/v1/users` - Create user (admin only)
- `GET /api/v1/users/{id}` - Get user details
- `PUT /api/v1/users/{id}` - Update user
- `DELETE /api/v1/users/{id}` - Delete user
- `GET /api/v1/users/{id}/subordinates` - Get direct reports

### Enhanced Endpoints (Permission Filtering)
- `GET /api/v1/risks` - Now filtered by department access
- `GET /api/v1/controls` - Now filtered by department access

## Seed Scripts (New in Phase 7)

### Data Generation
- `backend/scripts/seed_roles_permissions.py` - 13 roles, 12 permissions
- `backend/scripts/seed_users.py` - 120 test users
- `backend/scripts/seed_all.py` - Master seed script

### Demo Accounts
- `cro@riskhub.test` / `test123` - Full access
- `coo@riskhub.test` / `test123` - Operations only
- `ops.employee@riskhub.test` / `test123` - Employee

## Frontend Services (New in Phase 7)

### API Clients
- `frontend/src/services/authApi.ts` - Authentication API client
- `frontend/src/services/risksApi.ts` - Risks API client (existing)
- `frontend/src/services/controlsApi.ts` - Controls API client (existing)

### Contexts
- `frontend/src/contexts/AuthContext.tsx` - JWT authentication state
- `frontend/src/contexts/DashboardFilterContext.tsx` - Dashboard filters (existing)

### Pages
- `frontend/src/pages/LoginPage.tsx` - Login with glassmorphism design
- `frontend/src/pages/DashboardPage.tsx` - Protected dashboard (existing)
- Other protected pages (Risks, Controls, KRIs, etc.)

## Development Tools

### Backend
- **pytest** - Testing framework
- **pytest-asyncio** - Async test support
- **httpx** - Async HTTP client for testing
- **black** - Code formatting (optional)
- **mypy** - Static type checking (optional)

### Frontend
- **ESLint** - Linting
- **TypeScript Compiler** - Type checking
- **Vite HMR** - Hot module replacement

## Deployment

### Local Development
- Backend: `uvicorn app.main:app --reload` (port 8000)
- Frontend: `npm run dev` (port 5173)
- Database: PostgreSQL via Docker Compose

### Production (Planned)
- Docker containers
- Kubernetes orchestration
- Environment-based configuration
- Secrets management (JWT secret, DB credentials)

## Architecture Patterns

### Backend
- **Async/Await** - Full async support
- **Dependency Injection** - FastAPI DI for DB sessions, JWT auth
- **Repository Pattern** - SQLAlchemy models
- **Permission Filtering** - Query-level department filtering
- **JWT Authentication** - Bearer token scheme

### Frontend
- **Component-Based** - Reusable React components
- **Context Providers** - AuthContext for global auth state
- **Protected Routes** - Authentication checks on all routes
- **API Services** - Centralized API communication
- **Type Safety** - Full TypeScript coverage

## Security Features (Phase 7)

### Implemented
- ✅ JWT token authentication (60-minute expiration)
- ✅ Password hashing with bcrypt
- ✅ Role-based access control (RBAC)
- ✅ Permission-based authorization
- ✅ Department-scoped data filtering
- ✅ Protected API endpoints
- ✅ Protected frontend routes

### Pending
- ⚠️ Token refresh mechanism
- ⚠️ Rate limiting
- ⚠️ CSRF protection
- ⚠️ Entra ID/M365 integration

## Testing Strategy

### Backend
- Unit tests with pytest
- Async test support
- Test database (SQLite in-memory)
- API endpoint testing with httpx

### Frontend
- Component testing (planned)
- E2E testing (planned)
- Manual testing (current)

## Performance Considerations

### Backend
- Async database queries
- Connection pooling
- Eager loading (`selectinload`) to prevent N+1 queries
- Pagination (default: 50, max: 100)
- Department filtering at query level

### Frontend
- Code splitting (Vite)
- Lazy loading routes
- Optimized re-renders
- Token caching in localStorage
