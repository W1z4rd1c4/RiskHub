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
| Large page components | Addressed via hooks + local panels (Phase 250) |
| Complex permission logic | Moved to services (Phase 250) |
| Duplicate approval code | Consolidated to `approval_helpers.py` (Phase 250) |


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
| Multi-language support | English default, Czech planned |
| **KRI period visibility** | Users should see which period they're submitting for |

## Recent Remediation (Phase 151)

- ✅ Risk ID generation - atomic retry pattern
- ✅ Approval request duplication - partial unique index
- ✅ Sensitive field detection - None value handling
- ✅ Approval workflow edge cases - cancel, tiered fields

## Recent Remediation (Phase 152)

- ✅ KRI period semantics - non-privileged now submit for closed periods only

## Recent Remediation (Phase 250 - Code Simplification)

- ✅ Extracted data-fetching hooks (`useDepartmentDetail`, `useUsersPageFilters`)
- ✅ Consolidated approval patterns (`create_approval_request_with_audit` helper)
- ✅ Simplified service layer (`_already_flagged`, `_create_orphan`, `_get_item_details`)
- ✅ Extracted schemas from endpoint files to `schemas/riskhub.py`
- ✅ Created reusable `StepIndicator` component
- ✅ Removed duplicate code across 10 plans (~300+ lines eliminated)

*Updated: 2026-01-10*

