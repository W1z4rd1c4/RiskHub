# Concerns & Technical Debt

## Security - Critical (Penetration Test 2026-01-08)

| Issue | Risk | Status |
|-------|------|--------|
| Webhook user injection | `/directory/webhook` skips sig verify when `WEBHOOK_SECRET` empty | 🔴 Open |
| Default SECRET_KEY | Production MUST override via environment | ⚠️ Config check at startup |
| OpenAPI docs exposed | `/docs` and `/openapi.json` publicly accessible | 🔴 Open |
| DB port exposed | Port 5432 in docker-compose.yml | ⚠️ Dev only |
| Rate limiting bypass | Disabled when `DEBUG=true` | ⚠️ Dev only |
| Demo login endpoint | Works in debug mode (`/auth/demo-login/{id}`) | ⚠️ Dev only |

## Security - Low Severity

| Issue | Description |
|-------|-------------|
| Null byte DoS | Email with null byte causes 500 error |
| Excel formula injection | Cell values starting with `=+@-` not sanitized |
| Verbose Pydantic errors | Reveal field names, types, constraints |
| JWT in localStorage | No httpOnly cookie option |
| No token refresh | Tokens expire, require re-login |

## Security - Verified Secure ✅

- Production startup fails if `SECRET_KEY` not set and `DEBUG=false`
- `MOCK_AUTH_ENABLED` blocked in production
- All API endpoints require valid JWT
- SQL injection prevented (SQLAlchemy parameterized queries)
- JWT `alg: none` attack blocked
- Path traversal blocked
- Security headers (CSP, X-Frame-Options, HSTS, XSS protection)
- Race conditions on approvals blocked
- XSS payloads safely rendered (React escapes)
- IDOR blocked (cross-department access denied)
- Privilege escalation blocked (cannot modify own role)

## Reliability

| Concern | Impact |
|---------|--------|
| APScheduler in-process | Multi-worker deployments can double-run jobs |
| No external log aggregation | Only file-based rotation |
| No health check alerting | Manual monitoring required |

## Deployment

| Item | Note |
|------|------|
| `.env.example` | All required vars documented, manual copy needed |
| Docker builds | Slow on Apple Silicon (arm64 compilation) |
| AD Emulator | Needs separate database initialization |

## Code Quality ✅

| Item | Status |
|------|--------|
| Large page components | ✅ Addressed via hooks + subcomponents (Phase 250-251) |
| Complex permission logic | ✅ Moved to services (Phase 250) |
| Duplicate approval code | ✅ Consolidated to `approval_helpers.py` (Phase 250) |
| `Record<string, unknown>` types | ✅ Replaced with explicit types (Phase 251) |
| Hardcoded strings | ✅ i18n wired (Phase 20-16) |

## Data Integrity ✅

- Activity log writes in same transaction as business changes
- `name` column on Risk/Control enforces NOT NULL
- Historical snapshots for quarterly metric accuracy
- KRI history preserves all submitted values

## Known Feature Gaps

| Gap | Status |
|-----|--------|
| Azure AD/Entra ID integration | AD Emulator is placeholder |
| Real-time updates (WebSocket) | Polling only |
| PDF chart exports | Text/table only |

## E2E Test Coverage (Phase 180)

31 Playwright specs covering:

- ✅ Authentication and authorization
- ✅ CRUD operations for controls, risks, KRIs
- ✅ Activity logging and change tracking
- ✅ Approval workflows (tiered, self-approval, status-flow)
- ✅ Cross-department access scenarios
- ✅ Entity ownership rules
- ✅ Sensitive field protection
- ✅ Settings isolation (theme/language per user)

## Phase 153 Audit Findings (2026-01-11)

### Critical (Data Integrity / Production Breaking)

| Issue | Location | Impact |
|-------|----------|--------|
| DB enum case mismatch (ApprovalStatus) | `a9b8c7d6e5f4_add_pending_privileged` L21 adds `'pending_privileged'` (lowercase), indexes use uppercase | Query failures, status mismatches |
| Notification enum drift (APPROVAL_CANCELLED) | DB enum missing, model defines it, service emits it | 500 on cancellation notifications |
| Logging config kwargs mismatch | `main.py` L95-98 passes `app_rotation_size_mb`, function expects `rotation_size_mb` | Silent config failure |
| datetime.utcnow() inconsistency | `approvals.py`, `approval_execution_service.py` | Timezone-naive vs aware comparison issues |

### High (Major Feature Bugs)

| Issue | Location | Impact |
|-------|----------|--------|
| KRI delete missing reason param | FE `kriApi.ts` L36, BE requires `reason` query | 422 on all KRI deletes |
| KRI pagination mismatch (skip vs page) | FE sends `skip`, BE expects `page/size` | Wrong pagination results |
| Dashboard KRI dept filter ignored | FE passes `department_id`, BE signature doesn't accept it | Filter silently ignored |
| Approvals cancel button missing `pending_privileged` | `ApprovalsPage.tsx` L307 only checks `'pending'` | Can't cancel tiered approvals |
| Sidebar duplicate activity log routes | `/audit-trail` (L47) + `/activity-log` (L103) | Duplicate nav items or dead pages |
| KRI permission mismatch | FE checks `kri:record`, BE enforces `kri:submit` | Permission denied unexpectedly |
| Activity Log risk picker truncated | FE requests 200, BE caps at 100 | Truncated picker options |
| Edit/delete 202 response typed as entity | `riskApi.ts`, `kriApi.ts`, `controlApi.ts` | Runtime type mismatches |
| KRI PENDING_PRIVILEGED missing in checks | `kris.py` delete/update only check PENDING | Duplicate approvals possible |

### Medium (Correctness / Performance)

| Issue | Location | Impact |
|-------|----------|--------|
| Migration nullable=False without default | `597c3ba51f80_add_tiered_approval_fields.py` L26 | Fails on non-empty DB |
| Risk ID generator limit(10) | `risks.py` L64 | Can miss higher numbers if >10 risks |
| Approval cancel logged as DELETE | `approvals.py` L489 | Wrong activity type in audit trail |
| Cross-department owner update blocked | `risks.py` update_risk | Risk owners can't edit cross-dept risks |

### Low (Polish / Dev Ergonomics)

| Issue | Location | Impact |
|-------|----------|--------|
| Report downloads broken if VITE_API_URL missing | `reportApi.ts` L51 | Dev-only issue |

## Recent Remediation (Phase 151-152)

- ✅ Risk ID generation - atomic retry pattern
- ✅ Approval request duplication - partial unique index
- ✅ Sensitive field detection - None value handling
- ✅ Approval workflow edge cases - cancel, tiered fields
- ✅ KRI period semantics - non-privileged submit for closed periods only

## Recent Remediation (Phase 154+)

- ✅ Cross-department access for control owners, KRI owners
- ✅ Link management access via entity ownership
- ✅ Approval-queued UX with 202 detection helper
- ✅ Control frequency "continuous" support
- ✅ i18n wiring for Czech localization

## Recent Remediation (Phase 250 - Code Simplification)

- ✅ Extracted data-fetching hooks (`useDepartmentDetail`, `useUsersPageFilters`)
- ✅ Consolidated approval patterns (`create_approval_request_with_audit` helper)
- ✅ Simplified service layer (`_already_flagged`, `_create_orphan`, `_get_item_details`)
- ✅ Extracted schemas from endpoint files to `schemas/riskhub.py`, `schemas/admin.py`
- ✅ Created reusable `StepIndicator` component
- ✅ Removed duplicate code across 10 plans

## Recent Remediation (Phase 251 - Code Simplification 2)

- ✅ Extracted `useActivityLogPageState` hook for Activity Log page
- ✅ Created `ActivityLogFilterBar` presentational component
- ✅ Simplified reports endpoints with streaming helpers
- ✅ Refactored admin endpoints with extracted schemas
- ✅ Simplified departments endpoint with scope/pagination helpers
- ✅ Extracted KRI detail tabs (`KRIDetailOverviewTab`, `KRIDetailHistoryTab`)
- ✅ Simplified `LinkManagementDialog` with `LinkSearchPanel` and `ExistingLinksPanel`
- ✅ Replaced `Record<string, unknown>` with explicit `SearchResultItem`, `ExistingLinkItem`
- ✅ Added shared hooks: `useDebouncedValue`, `usePendingApprovalIds`
- ✅ Added theme-aware charting: `useChartTheme` hook
- ✅ Removed ~1000+ lines of duplicated/complex code across 10 plans

*Updated: 2026-01-14*
