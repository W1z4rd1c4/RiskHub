# Concerns & Technical Debt

## Security Status

### Critical Issues (from Penetration Test 2026-01-08)

| Issue | Risk | Current Status |
|-------|------|----------------|
| Webhook signature bypass | `/directory/webhook` skips verify when `WEBHOOK_SECRET` empty | ✅ Fixed (158-10) - fails closed in production |
| Admin assignable as entity owner | `/users/lookup` returns admins, no validation on risk/control owner_id | 🔴 Open |
| Default SECRET_KEY | Production MUST override | ⚠️ Startup check added |
| OpenAPI docs exposed | `/docs`, `/openapi.json` public | 🔴 Open |
| DB port exposed | 5432 in docker-compose | ⚠️ Dev only |
| Rate limiting bypass | Disabled when `DEBUG=true` | ⚠️ Dev only |
| Demo login endpoint | `/auth/demo-login/{id}` works in debug | ⚠️ Dev only |

### Low Severity Issues

| Issue | Description |
|-------|-------------|
| Null byte DoS | Email with null byte → 500 error |
| Excel formula injection | Cells starting with `=+@-` not sanitized |
| Verbose Pydantic errors | Reveal field names, types, constraints |
| JWT in localStorage | No httpOnly cookie option (156-08 deferred) |
| No token refresh | Tokens expire → re-login required |
| Mixed timezone datetimes | Backend has inconsistent tz-aware/naive handling (156-08 deferred) |

### Verified Secure ✅

| Control | Status |
|---------|--------|
| Production SECRET_KEY check | Startup fails if not set + `DEBUG=false` |
| Mock auth blocked in production | `MOCK_AUTH_ENABLED` rejected |
| All endpoints require JWT | Verified |
| SQL injection prevention | SQLAlchemy parameterized queries |
| JWT `alg: none` blocked | Verified |
| Path traversal blocked | Verified |
| Security headers | CSP, X-Frame-Options, HSTS, XSS |
| Approval race conditions | Partial unique index |
| XSS prevention | React escapes by default |
| IDOR blocked | Cross-department access denied |
| Privilege escalation blocked | Cannot modify own role |

## Reliability Concerns

| Concern | Impact | Mitigation |
|---------|--------|------------|
| APScheduler in-process | Multi-worker → double-run jobs | Single worker mode |
| No external log aggregation | Only file-based rotation | SIEM-ready JSON format |
| No health check alerting | Manual monitoring required | `/health` endpoint |
| Database connection pooling | Connection limits under load | asyncpg pool tuning |

## Deployment Notes

| Item | Note |
|------|------|
| `.env.example` | All required vars documented |
| Apple Silicon builds | Slow arm64 compilation |
| AD Emulator init | Needs separate database |
| Migration ordering | Enum values case-sensitive |

## Code Quality (Resolved) ✅

| Issue | Resolution |
|-------|------------|
| Large page components | Extracted to hooks + subcomponents (Phase 250-251) |
| Complex permission logic | Moved to services (Phase 250) |
| Duplicate approval code | Consolidated to `approval_helpers.py` |
| `Record<string, unknown>` types | Replaced with explicit interfaces |
| Hardcoded strings | i18n wired (Phase 20-16) |

## Data Integrity ✅

| Control | Implementation |
|---------|----------------|
| Activity log atomicity | Same transaction as business changes |
| NOT NULL constraints | `name` column on Risk/Control enforced |
| Historical snapshots | Quarterly metric accuracy preserved |
| KRI history | All submitted values preserved |
| Soft deletes | `status='archived'` pattern |

## Known Feature Gaps

| Gap | Notes |
|-----|-------|
| Azure AD/Entra ID integration | AD Emulator is placeholder |
| Real-time updates | Polling only (no WebSocket) |
| PDF chart exports | Text/table only |
| Email notifications | In-app only |
| Mobile app | Web responsive only |

## E2E Test Coverage (Phase 180)

44 Playwright specs covering:

- ✅ Authentication and authorization
- ✅ CRUD operations (controls, risks, KRIs)
- ✅ Activity logging and change tracking
- ✅ Approval workflows (tiered, self-approval, status-flow)
- ✅ Cross-department access scenarios
- ✅ Entity ownership rules
- ✅ Sensitive field protection
- ✅ Settings isolation (theme/language per user)

## Historical Audit Findings (Phase 153)

### Critical (Previously Found)

| Issue | Location | Resolution |
|-------|----------|------------|
| DB enum case mismatch | Migration L21 | ✅ Fixed |
| Notification enum drift | APPROVAL_CANCELLED | ✅ Added to DB |
| Logging config kwargs | main.py L95-98 | ✅ Fixed |
| datetime.utcnow() | Various | ✅ Using `datetime.now(UTC)` |

### High Priority (Previously Found)

| Issue | Resolution |
|-------|------------|
| KRI delete missing reason | ✅ Added `reason` query param |
| KRI pagination mismatch | ✅ Unified to page/size |
| Dashboard KRI dept filter | ✅ Added parameter |
| Approvals cancel button | ✅ Added `pending_privileged` |
| KRI permission mismatch | ✅ Aligned to `kri:submit` |
| 202 response typing | ✅ `parseUpdateResult()` helper |

## Remediation History

### Phase 151-152

- ✅ Risk ID generation → atomic retry
- ✅ Approval duplication → partial unique index
- ✅ Sensitive field None handling
- ✅ Approval edge cases

### Phase 154+

- ✅ Cross-department access (control/KRI owners)
- ✅ Link management access via ownership
- ✅ 202 approval UX helper
- ✅ Control frequency "continuous"
- ✅ Czech localization

### Phase 250-251 (Code Simplification)

- ✅ Extracted 8 data-fetching hooks
- ✅ Consolidated approval patterns
- ✅ Simplified service layer (helpers)
- ✅ Extracted schemas to modules
- ✅ Created reusable UI components
- ✅ Theme-aware charting
- ✅ Removed ~1000+ lines of duplication

## Open Action Items

| Priority | Action | Owner |
|----------|--------|-------|
| High | Secure OpenAPI docs in production | DevOps |
| High | Add webhook signature validation | Backend |
| Medium | Add httpOnly cookie option for JWT | Security |
| Medium | Implement token refresh | Backend |
| Low | Sanitize Excel formula injection | Backend |
| Low | Add real-time updates (WebSocket) | Future |

## Risk Hub Config Integration Issues (Phase 156 Audit)

| Issue | Severity | Description |
|-------|----------|-------------|
| Dashboard static thresholds | Medium | `dashboard.py` uses `ConfigDefaults` at module load; changing Risk Hub thresholds requires app restart |
| ApprovalScenario unused | Medium | 6 approval scenarios seeded but never queried — approvals are hardcoded in endpoints |
| Approval toggles orphaned | Medium | `require_edit_approval_priority`, `require_delete_approval`, `secondary_approval_priority` — 0 references |
| KRI timing key mismatch | Low | Seeded `kri_reminder_days_before` but service looks for `advance_reminder_days` |
| Missing KRI config seeds | Low | `near_breach_threshold`, `duplicate_lookback_days`, `reporting_grace_days` not seeded |
| `get_risk_thresholds()` unused | Low | Function exists in `global_config.py` but not called outside tests |

### What DOES Work ✅

- `high_risk_min_net_score` — Used by `is_high_risk_for_approval_async()` in `approval_helpers.py`, `controls.py`

---
*Updated: 2026-01-22*
