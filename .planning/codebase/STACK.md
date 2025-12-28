# Stack

## Primary Languages
- **Backend**: Python 3.13+ (FastAPI stack)
- **Frontend**: TypeScript/React 19

## Frameworks & Core Libraries

### Backend
| Package | Version | Purpose |
|---------|---------|---------|
| FastAPI | ≥0.109.0 | Web framework |
| Uvicorn | ≥0.27.0 | ASGI server |
| SQLAlchemy | ≥2.0.25 | Async ORM |
| asyncpg | ≥0.29.0 | PostgreSQL driver |
| Alembic | ≥1.13.0 | Migrations |
| Pydantic | ≥2.5.0 | Data validation |
| python-jose | ≥3.3.0 | JWT handling |
| passlib + bcrypt | ≥1.7.4 | Password hashing |

### Frontend
| Package | Version | Purpose |
|---------|---------|---------|
| React | ^19.2.0 | UI framework |
| React Router | ^7.11.0 | Client routing |
| Vite | ^7.2.4 | Build tool |
| Tailwind CSS | ^3.4.19 | Styling |
| Framer Motion | ^12.23.26 | Animations |
| Recharts | ^3.6.0 | Data visualization |
| Radix UI | various | Accessible components |

## Build Tools & Tooling
- **Frontend**: Vite, TypeScript ~5.9.3, ESLint ^9.39.1, Vitest ^4.0.16
- **Backend**: pytest ≥8.0.0, pytest-asyncio ≥0.23.0

## Package Managers
- **Frontend**: npm (`frontend/package-lock.json`)
- **Backend**: pip (`backend/requirements.txt`)

## Runtime Versions
- **PostgreSQL**: 16 (from `docker-compose.yml`)
- **Node/Python**: Not pinned (no `.nvmrc`, `.python-version`)

---
*Last updated: 2025-12-28*
