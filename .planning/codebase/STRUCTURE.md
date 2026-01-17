# Directory Structure

## Repository Layout

```
/
├── backend/                     # RiskHub FastAPI API (~350KB endpoints)
│   ├── alembic/                 # 39 database migrations
│   │   └── versions/            # Sequential migration files
│   ├── app/
│   │   ├── api/v1/endpoints/    # 21 REST endpoint modules
│   │   ├── core/                # 11 core modules
│   │   │   ├── permissions.py   # 446 lines, RBAC logic
│   │   │   ├── security.py      # JWT, password hashing
│   │   │   ├── activity_logger.py # Audit trail helper
│   │   │   ├── approval_helpers.py # Tiered approval logic
│   │   │   ├── scheduler.py     # APScheduler jobs
│   │   │   ├── config.py        # Settings + env loading
│   │   │   └── logging.py       # structlog configuration
│   │   ├── db/                  # 4 files: session, base, init
│   │   ├── integrations/        # 2 files: AD Emulator client
│   │   ├── middleware/          # 4 files: security, logging, rate limit, language
│   │   ├── models/              # 19 SQLAlchemy models
│   │   ├── schemas/             # 18 Pydantic schema modules
│   │   ├── services/            # 10 domain services (~160KB)
│   │   ├── i18n/                # Backend translations
│   │   └── main.py              # 157 lines, app entry
│   ├── scripts/                 # 29 utility scripts
│   │   ├── seed_*.py            # Data seeding scripts
│   │   ├── migrate_*.py         # Migration helpers
│   │   └── verify_*.py          # Verification scripts
│   ├── tests/                   # 43 pytest test files
│   ├── requirements.txt         # 31 dependencies
│   ├── Dockerfile               # Production container
│   └── pytest.ini               # Test configuration
│
├── frontend/                    # RiskHub React SPA (~500KB src)
│   ├── e2e/                     # 44 Playwright E2E test files
│   │   ├── activity-logging/    # 3 specs
│   │   ├── approval-workflows/  # 3 specs
│   │   ├── cross-department/    # 4 specs
│   │   ├── entity-ownership/    # 3 specs
│   │   ├── permissions/         # 4 specs
│   │   ├── sensitive-fields/    # 4 specs
│   │   ├── fixtures/            # Test data fixtures
│   │   ├── helpers/             # Test utilities
│   │   ├── pages/               # Page object models (7)
│   │   └── *.spec.ts            # 11 root-level specs
│   ├── src/
│   │   ├── components/          # 90+ UI components
│   │   │   ├── access/          # 4 permission components
│   │   │   ├── activity-log/    # 1 filter bar
│   │   │   ├── controls/        # 1 detail tab
│   │   │   ├── dashboard/       # 13 widgets
│   │   │   ├── executions/      # 2 execution log components
│   │   │   ├── governance/      # 4 governance views
│   │   │   ├── history/         # 5 history visualizations
│   │   │   ├── kri/             # 4 KRI components
│   │   │   ├── kris/            # 2 KRI tab components
│   │   │   ├── layout/          # 4 layout components
│   │   │   ├── linking/         # 2 link management components
│   │   │   ├── notifications/   # 1 notification UI
│   │   │   ├── riskhub/         # 6 config components
│   │   │   ├── risks/           # 2 risk tab components
│   │   │   ├── settings/        # 6 settings tabs
│   │   │   ├── tables/          # 7 table utilities
│   │   │   ├── ui/              # 9 base UI primitives
│   │   │   └── *.tsx            # 10 root-level components
│   │   ├── contexts/            # 4 React contexts
│   │   │   ├── AuthContext.tsx
│   │   │   ├── DashboardFilterContext.tsx
│   │   │   └── ThemeContext.tsx
│   │   ├── hooks/               # 8 custom hooks
│   │   ├── i18n/                # Internationalization
│   │   │   └── locales/         # 2 locales × 10 files
│   │   │       ├── en/          # English (10 JSON files)
│   │   │       └── cs/          # Czech (10 JSON files)
│   │   ├── pages/               # 28 route-level pages
│   │   ├── services/            # 20 API client modules
│   │   ├── types/               # 12 TypeScript type definitions
│   │   ├── test/                # 3 Vitest setup files
│   │   ├── utils/               # 1 utility module
│   │   ├── App.tsx              # Routes + layout
│   │   └── main.tsx             # Entry point
│   ├── public/                  # 7 static assets
│   ├── tests/                   # 3 legacy Playwright specs
│   ├── package.json             # 2.2KB, 45+ dependencies
│   ├── playwright.config.ts     # E2E configuration
│   ├── vite.config.ts           # Build configuration
│   └── Dockerfile               # Production container
│
├── AD Emulator/                 # 41 files, standalone directory emulator
│   ├── backend/
│   │   ├── app/                 # FastAPI API (port 8001)
│   │   ├── alembic/             # Migrations
│   │   └── requirements.txt
│   └── frontend/
│       ├── src/                 # React UI (purple branding, port 5174)
│       └── package.json
│
├── docs/                        # 36 documentation files
│   ├── BUSINESS_LOGIC.md        # 537 lines, domain rules reference
│   ├── TESTING.md               # Testing strategy
│   ├── E2E_TESTING.md           # E2E test guide
│   ├── LOCALIZATION.md          # i18n documentation
│   ├── GLOSSARY.md              # Term definitions
│   ├── PERFORMANCE_BASELINE.md  # Load testing results
│   ├── admin/                   # 7 admin guides (EN)
│   ├── admin-cs/                # 7 admin guides (CS)
│   ├── user/                    # 8 user guides (EN)
│   └── user-cs/                 # 8 user guides (CS)
│
├── .planning/                   # GSD project management
│   ├── codebase/                # 7 codebase documentation files
│   ├── phases/                  # 180+ phase-specific plans
│   ├── PROJECT.md               # Vision, scope, decisions
│   ├── ROADMAP.md               # Phase roadmap
│   ├── STATE.md                 # Current project state
│   └── config.json              # GSD configuration
│
├── .agent/                      # Antigravity orchestration (gitignored)
│   ├── skills/                  # 28 skill directories
│   ├── workflows/               # 24 workflow files
│   └── rules/                   # Agent rules
│
├── scripts/                     # 4 root-level dev scripts
│   └── dev.sh                   # Development workflow script
│
├── docker-compose.yml           # Development stack (126 lines)
├── docker-compose.prod.yml      # Production stack
├── Makefile                     # 3.6KB dev commands
├── SECURITY.md                  # Security practices (131 lines)
├── AUDIT.md                     # Audit report (223 lines)
└── *.xlsx, *.pdf                # Reference documents
```

## Size Metrics

| Category | Files | Total Size |
|----------|-------|------------|
| Backend endpoints | 21 | ~350KB |
| Backend services | 10 | ~160KB |
| Backend models | 19 | ~75KB |
| Frontend pages | 28 | ~400KB |
| Frontend components | 90+ | ~300KB |
| E2E tests | 44 | ~100KB |
| i18n translations | 20 | ~50KB |

## Key File Locations

### Business Logic

- `docs/BUSINESS_LOGIC.md` — Domain rules reference
- `backend/app/core/permissions.py` — RBAC logic (446 lines)
- `backend/app/core/approval_helpers.py` — Tiered approval logic

### Configuration

- `.env.example` — Environment template
- `backend/app/core/config.py` — Settings loader
- `global_config` table — Runtime configuration

### Entry Points

- `backend/app/main.py` — API entry (157 lines)
- `frontend/src/main.tsx` — SPA entry
- `frontend/src/App.tsx` — Routes + layout

---
*Updated: 2026-01-17*
