# Directory Structure

## Repository Layout
```
/
├── backend/                # RiskHub FastAPI API
│   ├── alembic/            # Migrations
│   ├── app/
│   │   ├── api/v1/endpoints/  # REST endpoints
│   │   ├── core/              # Config, auth, scheduler
│   │   ├── db/                # Async DB session/base
│   │   ├── integrations/      # AD Emulator client
│   │   ├── models/            # SQLAlchemy models
│   │   ├── schemas/           # Pydantic schemas
│   │   ├── services/          # Domain services
│   │   └── main.py            # App entry
│   ├── scripts/            # Seed/migration utilities
│   ├── tests/              # Pytest suite
│   └── requirements.txt
├── frontend/               # RiskHub React SPA
│   ├── src/
│   │   ├── components/     # UI and domain components
│   │   ├── contexts/       # Auth, dashboard filters
│   │   ├── hooks/          # Custom hooks
│   │   ├── pages/          # Route-level pages
│   │   ├── services/       # API client modules
│   │   ├── types/          # Shared TS types
│   │   ├── App.tsx         # Routes/layout
│   │   └── main.tsx        # Entry
│   ├── tests/              # Playwright E2E
│   └── package.json
├── AD Emulator/            # Directory emulator (separate app)
│   ├── backend/
│   │   ├── app/             # FastAPI API
│   │   ├── alembic/         # Migrations
│   │   └── requirements.txt
│   └── frontend/
│       ├── src/             # React UI
│       └── package.json
├── .planning/              # Plans, state, codebase map
├── docker-compose.yml      # Postgres service
├── scripts/                # Misc tooling
└── generate_pdf.py         # One-off reporting script
```

## Notable Files
- `docker-compose.yml` runs PostgreSQL for RiskHub.
- `generate_pdf.py` and `generate_pdf.js` are standalone export utilities.
- `verify_sync_integration.py` and `backend/scripts/` contain data migration checks.
