# Technology Stack

## Core Technologies

| Layer | Technology | Version |
|-------|------------|---------|
| Languages | Python 3.12+ (backend), TypeScript 5.9 (frontend) | |
| Backend | FastAPI (async) | ≥0.109 |
| Frontend | React + Vite | 19.2 / 7.2 |
| Database | PostgreSQL | 16 |
| ORM | SQLAlchemy 2 (async with asyncpg) | ≥2.0.25 |
| AD Emulator | Standalone FastAPI + React app | |

## Backend (RiskHub API)

### Core Framework

- **FastAPI** ≥0.109, **Pydantic 2**, **Uvicorn**
- Async-first architecture with `asyncpg` driver

### Database & ORM

- **SQLAlchemy 2** async with `async_sessionmaker`
- **asyncpg** ≥0.29 for PostgreSQL connections
- **psycopg2-binary** for Alembic migrations (sync driver)
- **Alembic** ≥1.13 with 39 migration files

### Authentication & Security

- **python-jose** (JWT HS256) with configurable expiry
- **passlib** + **bcrypt** 4.1.3 (pinned for compatibility)
- Security headers middleware: CSP, HSTS, X-Frame-Options, XSS protection
- Rate limiting middleware (disabled in debug mode)

### Scheduling & Background Jobs

- **APScheduler** 3.11 (in-process scheduler)
- KRI deadline notifications, reminder jobs

### Logging & Observability

- **structlog** ≥24.1.0 (JSON SIEM-ready)
- **python-json-logger** ≥2.0.0
- Request context injection: request_id, user_id, client_ip
- Rotating file handlers with configurable size/count

### Reporting & Export

- **reportlab** ≥4.0.0 (PDF generation)
- **openpyxl** ≥3.1.0 (Excel generation)
- Locale-aware report translations

### Testing

- **pytest** ≥8.0.0, **pytest-asyncio** ≥0.23.0
- **httpx** ≥0.27.0 (async HTTP client for tests)
- **pytest-cov** ≥4.1.0
- 41 test files in `backend/tests/`

### Security Scanning

- **bandit** ≥1.7.8 (Python SAST)
- **pip-audit** ≥2.7.0 (dependency vulnerabilities)
- **pre-commit** ≥3.7.0

## Frontend (RiskHub UI)

### Core Framework

- **React** 19.2, **React Router** 7.11
- **Vite** 7.2, **TypeScript** 5.9
- ES Modules (`"type": "module"`)

### Build & Tooling

- **PostCSS** + **Autoprefixer**
- **ESLint** 9 + **typescript-eslint** 8
- Import alias: `@` → `src/`

### Styling

- **Tailwind CSS** 3.4 + **tailwindcss-animate**
- **class-variance-authority**, **clsx**, **tailwind-merge**

### UI Components

- **Radix UI**: Label, Select, Slot, Tabs
- **lucide-react** 0.562 (icons)
- **Framer Motion** 12 (animations)
- **shadcn/ui** patterns

### Data Fetching & State

- **@tanstack/react-query** 5 (data caching)
- **Axios** 1.13 (HTTP client)
- React Contexts: AuthContext, DashboardFilterContext, ThemeContext

### Charts & Visualization

- **Recharts** 3.6
- **date-fns** 4 (date formatting)

### Internationalization

- **i18next** 25.7 + **react-i18next** 16.5
- **i18next-browser-languagedetector** 8.2
- 2 locales (en, cs) × 10 namespace files each

### Markdown Rendering

- **react-markdown** 10.1 + **remark-gfm** 4.0

### Testing

- **Vitest** 4 (unit tests, jsdom)
- **Testing Library** (React 16, jest-dom 6, user-event 14)
- **MSW** 2.12 (API mocking)
- **Playwright** 1.57 (E2E tests)

## AD Emulator

### Backend

- **FastAPI** + **SQLAlchemy** async + **Alembic**
- Port 8001, separate `ad_emulator_db` database

### Frontend

- **React** 19.2 + **Vite** 7.2
- **Tailwind CSS** 4.1 (purple branding)
- Port 5174

### Purpose

- Stand-in Active Directory for RiskHub sync testing
- Simulates user directory with department mappings

## DevOps & Infrastructure

| Tool | Purpose |
|------|---------|
| **docker-compose** | PostgreSQL + full stack orchestration |
| **docker-compose.prod.yml** | Production configuration |
| **Makefile** | Dev command shortcuts |
| **GitHub Actions** | CI/CD workflows |
| **pre-commit** | gitleaks, bandit, pip-audit hooks |
| **gitleaks** | Secrets detection |

## Configuration

### Environment Variables

- Documented in `.env.example` (3.7KB)
- Required: `DATABASE_URL`, `SECRET_KEY`
- Optional: `MOCK_AUTH_ENABLED`, `DEBUG`, `CORS_ORIGINS`

### Global Config (Database)

- Runtime configuration via `global_config` table
- TTL-cached with 60s expiry
- Categories: risk_thresholds, notifications, approvals

---
*Updated: 2026-01-17*
