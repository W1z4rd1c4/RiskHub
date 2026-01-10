# Directory Structure

## Repository Layout
```
/
├── backend/                     # RiskHub FastAPI API
│   ├── alembic/                 # Database migrations
│   ├── app/
│   │   ├── api/v1/endpoints/    # 19 REST endpoint modules
│   │   ├── core/                # Config, auth, scheduler, security
│   │   ├── db/                  # Async session, base
│   │   ├── integrations/        # AD Emulator HTTP client
│   │   ├── middleware/          # Logging, rate limiting
│   │   ├── models/              # 19 SQLAlchemy models
│   │   ├── schemas/             # 16 Pydantic schema modules
│   │   ├── services/            # 7 domain services
│   │   └── main.py              # App entry, middleware, lifespan
│   ├── scripts/                 # Seed, migration, audit utilities
│   ├── tests/                   # 38 pytest test files
│   └── requirements.txt
├── frontend/                    # RiskHub React SPA
│   ├── src/
│   │   ├── components/          # 73+ UI components (14 categories)
│   │   ├── contexts/            # Auth, DashboardFilter contexts
│   │   ├── hooks/               # 4 custom hooks (data-fetching, filters)
│   │   ├── pages/               # 30 route-level pages
│   │   ├── services/            # 19 API client modules
│   │   ├── types/               # 12 shared TypeScript types
│   │   ├── test/                # Vitest setup + mocks
│   │   ├── App.tsx              # Routes + layout
│   │   └── main.tsx             # Entry
│   ├── tests/                   # 3 Playwright E2E specs
│   └── package.json

├── AD Emulator/                 # Standalone directory emulator
│   ├── backend/
│   │   ├── app/                 # FastAPI API
│   │   ├── alembic/             # Migrations
│   │   └── requirements.txt
│   └── frontend/
│       ├── src/                 # React UI (purple branding)
│       └── package.json
├── docs/                        # Project documentation
│   ├── BUSINESS_LOGIC.md        # Domain rules reference
│   └── PERFORMANCE_BASELINE.md  # Load testing results
├── scripts/                     # Dev utilities
│   └── dev.sh                   # Development workflow script
├── .planning/                   # Plans, state, codebase map
│   ├── codebase/                # This folder (7 docs)
│   ├── phases/                  # Phase-specific plans
│   ├── STATE.md                 # Current project state
│   └── ROADMAP.md               # Project roadmap
├── docker-compose.yml           # Postgres + full stack option
├── docker-compose.prod.yml      # Production compose
├── Makefile                     # Dev command shortcuts
└── SECURITY.md                  # Security practices doc
```

## Component Categories (Frontend)
| Folder | Contents |
|--------|----------|
| access/ | Permission matrix |
| controls/ | Control-specific UI |
| dashboard/ | 13 dashboard widgets |
| executions/ | Execution log components |
| governance/ | Governance views |
| history/ | 5 history visualizations |
| kri/ | 4 KRI components |
| layout/ | 4 layout components |
| notifications/ | Notification UI |
| riskhub/ | 6 Risk Hub config components |
| settings/ | 5 settings tabs |
| tables/ | 7 reusable table components |
| ui/ | 7 base UI primitives |

## Backend Model Summary
| Model | Description |
|-------|-------------|
| User, Role | Auth + RBAC |
| Department | Org structure |
| Risk, Control, KeyRiskIndicator | Core domains |
| KRIHistory | Value historization |
| ApprovalRequest, ApprovalScenario | Workflow approvals |
| ActivityLog | Audit trail |
| Notification | Alerts |
| ControlExecution | Control execution log |
| GlobalConfig, RiskType | System configuration |
| QuarterlyMetricSnapshot | Historical metrics |
| DirectoryUser, DirectorySyncLog | AD integration |
| OrphanedItem | Governance orphans |

*Updated: 2026-01-10*
