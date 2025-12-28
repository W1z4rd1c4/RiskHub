# Structure

## Backend (`backend/app/`)
```
backend/app/
├── main.py                 # FastAPI app setup, CORS, /api/v1 mount
├── api/
│   ├── deps.py             # Auth + DB dependency helpers
│   └── v1/
│       ├── router.py       # Registers endpoint modules
│       └── endpoints/
│           ├── approvals.py
│           ├── auth.py
│           ├── controls.py
│           ├── dashboard.py
│           ├── departments.py
│           ├── executions.py
│           ├── health.py
│           ├── kris.py
│           ├── reports.py
│           ├── risks.py
│           └── users.py
├── core/
│   ├── config.py           # Settings via BaseSettings
│   ├── security.py         # JWT, password hashing, permissions
│   └── permissions.py      # Role/department access helpers
├── db/
│   ├── base.py             # SQLAlchemy DeclarativeBase
│   ├── session.py          # Async engine/session factory
│   └── seed.py             # Seed data
├── models/
│   ├── approval_request.py
│   ├── control.py
│   ├── control_execution.py
│   ├── department.py
│   ├── key_risk_indicator.py
│   ├── risk.py
│   ├── role.py
│   └── user.py
├── schemas/
│   ├── approval_request.py
│   ├── auth.py
│   ├── control.py
│   ├── dashboard.py
│   ├── department.py
│   ├── execution.py
│   ├── kri.py
│   ├── risk.py
│   └── user.py
└── services/
    └── report_service.py   # PDF/Excel generation
```

## Frontend (`frontend/src/`)
```
frontend/src/
├── App.tsx                 # Router + protected layout
├── main.tsx                # App bootstrap
├── pages/                  # Route-level screens
├── components/             # Shared UI + feature components
├── contexts/               # Auth + dashboard filter state
├── services/               # apiClient + resource APIs
├── types/                  # Domain types mirroring backend schemas
├── hooks/                  # Custom hooks (permissions)
└── lib/                    # Utilities
```

## Module Organization

### Models
- snake_case file names per entity
- `__init__.py` exports common ORM types for easy imports

### Schemas
- Mirror model naming
- Include Create/Update/Read variants
- Enums for domain states (e.g., `RiskTypeEnum`)

### Endpoints
- Resource-based modules with router instances
- RESTful naming (`list_*`, `get_*`, `create_*`, `update_*`, `delete_*`)

---
*Last updated: 2025-12-28*
