# Code Conventions

## Backend (Python)

### File Organization

- Routers: `backend/app/api/v1/endpoints/*.py` (21 modules)
- Dependencies: `backend/app/api/deps.py`, `backend/app/core/security.py`
- Models: `backend/app/models/*.py` (19 SQLAlchemy models)
- Schemas: `backend/app/schemas/*.py` (18 Pydantic modules)
- Services: `backend/app/services/*.py` (10 domain services)

### Naming

- **Functions/Variables**: `snake_case`
- **Classes**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **API Endpoints**: kebab-case URLs, snake_case JSON fields

### Patterns

- Async DB access via `get_db` dependency + `async_sessionmaker`
- Permission checks via `check_permission(current_user, "permission:action")`
- Activity logging in same transaction as business changes
- Structured logging via `structlog` with context injection
- Atomic operations with `db.begin_nested()` for retries
- Service helpers for repeated patterns (`_helper()` naming)
- Approval helper: `create_approval_request_with_audit()` for consistency

## Frontend (TypeScript/React)

### File Organization

- Pages: `frontend/src/pages/*.tsx` (28 route-level)
- Components: `frontend/src/components/<category>/*.tsx` (90+ total)
- Hooks: `frontend/src/hooks/*.ts` (8 custom hooks)
- Services: `frontend/src/services/*Api.ts` (20 API clients)
- Types: `frontend/src/types/*.ts` (12 modules)
- i18n: `frontend/src/i18n/locales/{en,cs}/*.json` (10 namespaces each)
- Tests: `frontend/src/**/__tests__/*.test.tsx`

### Naming

- **Files/Components**: `PascalCase.tsx`
- **Hooks**: `useCamelCase.ts`
- **Services**: `camelCaseApi.ts`
- **Types**: `PascalCase` for interfaces, `snake_case` for API response fields
- **i18n Keys**: `namespace.section.key` (e.g., `common.loading.generic`)

### Patterns

- Functional components with TypeScript props
- `apiClient` wrapper handles auth tokens + error parsing
- Global state via React Contexts (`AuthContext`, `DashboardFilterContext`, `ThemeContext`)
- Tailwind utility classes directly in JSX
- Permission gating via `<PermissionGate>` component
- i18n via `useTranslation()` hook with namespace imports
- Approval UX helper: `handleApprovalResponse()` for async 202 detection
- Theme-aware chart colors via `useChartTheme()` hook

## Shared Conventions

- API routes versioned under `/api/v1`
- Import alias `@` → `frontend/src` (Vite config)
- ISO 8601 dates in API, `date-fns` for formatting
- Consistent error response format: `{ detail: string }`

## Simplification Patterns (Phase 250-251)

### Frontend Patterns

| Pattern | Description | Examples |
|---------|-------------|----------|
| **Data-fetching hooks** | Extract multi-endpoint loading logic | `useDepartmentDetail`, `useActivityLogPageState` |
| **Shared list-page hooks** | Reusable pagination/pending state | `useDebouncedValue`, `usePendingApprovalIds` |
| **Local panelling** | Extract tab JSX to local render functions | `renderRisksTab()`, `renderUsersTab()` |
| **Page orchestrator** | Main page owns state, subcomponents present | `LinkManagementDialog` + panels |
| **Presentational subcomponents** | Extract complex sections to subfolders | `linking/LinkSearchPanel`, `risks/RiskDetailOverviewTab` |
| **Reusable UI primitives** | Extract duplicated wizard components | `StepIndicator.tsx`, `ThemedSelect` |
| **Explicit local types** | Replace `Record<string, unknown>` with explicit interfaces | `SearchResultItem`, `ExistingLinkItem` |
| **Theme-aware charting** | Dynamic colors based on theme context | `useChartTheme` hook |

### Backend Patterns

| Pattern | Description | Examples |
|---------|-------------|----------|
| **Service helpers** | Extract repeated patterns to `_helper()` functions | `_already_flagged`, `_create_orphan`, `_get_item_details` |
| **Sentinel patterns** | Module-scope sentinels for None vs unset | `_NOT_PROVIDED = object()` |
| **Inline Pydantic → modules** | Move inline schemas to `schemas/*.py` | `schemas/riskhub.py`, `schemas/admin.py` |
| **Consolidated approval helper** | Unified approval creation logic | `create_approval_request_with_audit()` |
| **Resource assertion helper** | Scope-aware resource access assertion | `_assert_department_in_scope()` |
| **Query builder extraction** | Extract complex query setup to helpers | `_build_controls_query()`, `_build_risks_query()` |
| **Streaming response helpers** | Unified PDF/Excel streaming | `_stream_pdf()`, `_stream_excel()` |
| **Report translations** | Locale-aware report generation | `report_translations.py` module |

*Updated: 2026-01-14*
