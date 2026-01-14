# Technology Stack

## Core Technologies

| Layer | Technology |
|-------|------------|
| Languages | Python 3.12+ (backend), TypeScript 5.9 (frontend) |
| Backend | FastAPI (async) |
| Frontend | React 19.2 + Vite 7.2 |
| Database | PostgreSQL 16 (docker-compose) |
| ORM | SQLAlchemy 2 (async with asyncpg) |
| AD Emulator | Standalone FastAPI + React app for directory sync |

## Backend (RiskHub API)

- **Framework**: FastAPI ≥0.109, Pydantic 2, Uvicorn
- **Database**: SQLAlchemy async + asyncpg, Alembic migrations
- **Auth**: python-jose (JWT HS256), passlib + bcrypt (4.1.3)
- **Scheduling**: APScheduler 3.11 (in-process)
- **Logging**: structlog (JSON SIEM-ready), python-json-logger
- **Reporting**: reportlab (PDF), openpyxl (Excel)
- **Testing**: pytest, pytest-asyncio, httpx, pytest-cov
- **Security**: bandit, pip-audit, pre-commit, gitleaks

## Frontend (RiskHub UI)

- **Core**: React 19.2, React Router 7.11
- **Build**: Vite 7.2, TypeScript 5.9, PostCSS + Autoprefixer
- **Styling**: Tailwind CSS 3.4, tailwindcss-animate
- **UI Utilities**: Radix UI (Label, Select, Slot, Tabs), class-variance-authority, clsx, tailwind-merge
- **Data/Charts**: Axios 1.13, Recharts 3.6, date-fns 4, @tanstack/react-query 5
- **Motion/Icons**: Framer Motion 12, lucide-react 0.562
- **i18n**: i18next 25.7, react-i18next 16.5 (English + Czech)
- **Markdown**: react-markdown 10.1, remark-gfm 4.0
- **Testing**: Vitest 4, Testing Library (React 16, jest-dom 6), Playwright 1.57

## AD Emulator

- **Backend**: FastAPI + SQLAlchemy async + Alembic (port 8001)
- **Frontend**: React 19.2 + Vite 7.2 + Tailwind CSS 4.1 (port 5174)
- **Purpose**: Stand-in Active Directory for RiskHub sync testing

## DevOps & Tooling

- **Containers**: docker-compose (Postgres, optional full stack)
- **Lint/Type**: ESLint 9 + typescript-eslint 8
- **Pre-commit**: gitleaks, bandit, pip-audit
- **CI**: GitHub Actions (`.github/workflows`)

*Updated: 2026-01-14*
