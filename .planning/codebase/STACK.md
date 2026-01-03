# Technology Stack

## Core Technologies
- Languages: Python (backend), TypeScript (frontend)
- Backend Framework: FastAPI (async)
- Frontend Framework: React + Vite
- Database: PostgreSQL (docker-compose uses 16)
- ORM: SQLAlchemy 2 (async)
- AD Emulator: Separate FastAPI + React app for directory sync testing

## Frontend (RiskHub UI)
- React 19.2, React Router 7.11
- Vite 7.2, TypeScript 5.9
- Styling: Tailwind CSS 3.4 + tailwindcss-animate
- UI Utilities: Radix UI, class-variance-authority, clsx, tailwind-merge
- Data/Charts: Axios, Recharts, date-fns
- Motion/Icons: Framer Motion, lucide-react

## Backend (RiskHub API)
- FastAPI 0.109+, Pydantic 2, Uvicorn
- SQLAlchemy async + asyncpg, Alembic migrations
- Auth: python-jose (JWT), passlib + bcrypt
- Scheduling: APScheduler
- Reporting: reportlab (PDF), openpyxl (Excel)
- Testing: pytest, pytest-asyncio, httpx, pytest-cov

## AD Emulator
- Backend: FastAPI + SQLAlchemy async + Alembic
- Frontend: React 19.2 + Vite 7.2 + Tailwind CSS 4.1
- Purpose: stand-in directory service for RiskHub sync flows

## Tooling
- Lint/Typecheck: ESLint 9, TypeScript 5.9
- Testing: Vitest + Testing Library, Playwright
- Build: Vite, PostCSS + Autoprefixer
