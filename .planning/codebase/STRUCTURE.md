# Directory Structure

## Repository Layout
```
/
├── backend/                     # RiskHub FastAPI API
│   ├── alembic/                 # Database migrations
│   ├── app/
│   │   ├── api/v1/endpoints/    # 20 REST endpoint modules
│   │   ├── core/                # Config, auth, scheduler, security
│   │   ├── db/                  # Async session, base
│   │   ├── integrations/        # AD Emulator HTTP client
│   │   ├── middleware/          # Logging, rate limiting
│   │   ├── models/              # 19 SQLAlchemy models
│   │   ├── schemas/             # 17 Pydantic schema modules
│   │   ├── services/            # 9 domain services
│   │   └── main.py              # App entry, middleware, lifespan
│   ├── scripts/                 # Seed, migration, audit utilities
│   ├── tests/                   # 40 pytest test files
│   └── requirements.txt
├── frontend/                    # RiskHub React SPA
│   ├── src/
│   │   ├── components/          # 78 UI components (18 categories)
│   │   ├── contexts/            # Auth, DashboardFilter contexts
│   │   ├── hooks/               # 7 custom hooks (data-fetching, filters)
│   │   ├── pages/               # 30 route-level pages
│   │   ├── services/            # 21 API client modules
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
| access/ | 4 permission matrix components |
| activity-log/ | 1 activity log filter bar |
| controls/ | 1 control detail tab |
| dashboard/ | 13 dashboard widgets |
| executions/ | 2 execution log components |
| governance/ | 4 governance views |
| history/ | 5 history visualizations |
| kri/ | 4 KRI components |
| kris/ | 2 KRI tab components |
| layout/ | 4 layout components |
| linking/ | 2 link management subcomponents (NEW) |
| notifications/ | 1 notification UI |
| riskhub/ | 6 Risk Hub config components |
| risks/ | 2 risk tab components |
| settings/ | 5 settings tabs |
| tables/ | 7 reusable table components |
| ui/ | 9 base UI primitives |

## Custom Hooks (Frontend)
| Hook | Purpose |
|------|---------|
| useActivityLogPageState | Activity log data fetching, filters, search |
| useDebouncedValue | Generic debounce for search inputs |
| useDepartmentDetail | Department page data fetching |
| usePendingApprovalIds | Fetch pending approval IDs for lists |
| usePermissions | Permission checking hook |
| useRiskHubConfig | Risk Hub config data hook |
| useUsersPageFilters | Users page filter state + logic |

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
