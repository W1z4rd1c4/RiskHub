# Phase 156: Audit Remediation (2026-01-15)

This phase remediates audit findings reported in chat on 2026-01-15, focusing on correctness, RBAC consistency, and production hardening without changing core business semantics.

## Findings To Fix (from audit)

1. **RBAC bypass**: `/api/v1/kris/overdue` and `/api/v1/kris/due-soon` apply `department_id` filter before RBAC, enabling cross-department data access.
2. **Risk ID generation bug**: `generate_risk_id_code()` relies on lexicographic sorting + limited sample, breaks at `R100+` and under concurrency.
3. **RiskHub audit logging bug**: `riskhub.py` writes `ActivityLog` after `db.commit()` but doesn’t commit afterward, so logs are dropped.
4. **Webhook hardening gap**: `/api/v1/directory/webhook` skips signature verification when `WEBHOOK_SECRET` is unset (production footgun).
5. **Frontend/backend mismatch**:
   - UI shows “Record Value” for `risks:write` / `approvals:write`, but backend enforces `kri:submit` OR reporting-owner.
   - Demo login redirects to `/dashboard` which is not a defined route.
   - Tailwind purge misses dynamic class strings in `LoginPage.tsx`.
6. **Security headers/logging hardening**:
   - CSP includes `'unsafe-eval'` and wide `connect-src` in production.
   - File logging is forced to DEBUG regardless of `LOG_LEVEL`.
7. **Data integrity hardening**:
   - Potential duplicate `control_risk_links` without DB-level uniqueness on `(control_id, risk_id)`.
8. **Risk mitigation work (larger scope)**:
   - JWT stored in `localStorage` (XSS token theft impact).
   - Mixed timezone-aware vs naive datetimes.

## Guardrails (must not change)

- Keep existing RBAC business rules (global vs department vs manager scope).
- Preserve approval workflows and status semantics.
- Prefer “deny/empty” for unauthorized filter parameters to reduce information leakage (match existing patterns, e.g. breaches filter behavior).
- Add/extend tests for every remediation (backend pytest, frontend vitest/build; E2E where relevant).

