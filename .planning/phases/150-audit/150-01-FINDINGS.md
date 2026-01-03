# Phase 150-01 Findings - Backend Auth & Permissions Audit

## Scope
- **Auth/config:** `backend/app/core/config.py`, `backend/app/core/security.py`, `backend/app/api/deps.py`, `backend/app/api/v1/endpoints/auth.py`
- **Endpoints:** `backend/app/api/v1/endpoints/users.py`, `backend/app/api/v1/endpoints/admin.py`, `backend/app/api/v1/endpoints/approvals.py`, `backend/app/api/v1/endpoints/directory.py`, `backend/app/api/v1/endpoints/reports.py`
- **RBAC data:** `backend/app/db/seed.py`, `backend/app/models/role.py`, `backend/app/schemas/user.py`
- **Out of scope:** AD Emulator

## Summary
- **Critical:** 2
- **High:** 1
- **Medium:** 2
- **Low:** 0

## Regression Check (from `PERMISSIONAUDIT.MD` / `DEEP_CHECK_FINDINGS.md`)
- `deps.get_current_user` now gates mock auth by `debug` + `mock_auth_enabled`; no regression in the main auth dependency.
- `users.list_roles` and `users.get_user_subordinates` now require authentication (previously flagged as unprotected).
- Known gaps still present: default JWT secret, empty `WEBHOOK_SECRET`, `approvals:write` seed mismatch, and missing KRI department checks (documented below).

---

## Auth & Config Findings

### `backend/app/core/config.py` / `backend/app/core/security.py`
- **Critical — Default JWT secret enables token forgery** (`config.py:17`, `security.py:41-44`)
  - **Impact:** If `SECRET_KEY` is not set, tokens are signed with a public placeholder, allowing attackers to mint valid JWTs and bypass auth/RBAC.
  - **Fix:** Require a non-default secret at startup; fail fast if missing/placeholder and document required env vars.
  - **Status:** Known

- **Medium — Mock auth path only gated by env var in legacy helper** (`security.py:63-76`, `users.py:278-290`)
  - **Impact:** If `MOCK_AUTH_ENABLED` is accidentally set in production, `/users/mock-login` is publicly reachable and the legacy helper can accept `X-Mock-User-Id` without a debug guard (even though current endpoints use `deps.get_current_user`).
  - **Fix:** Gate mock login on `settings.debug` (or remove the route in non-dev), and delete or hard-disable `core.security.get_current_user` to avoid accidental use.
  - **Status:** Known (partial fix applied in `deps.get_current_user`)

---

## Directory Webhook Findings

### `backend/app/api/v1/endpoints/directory.py`
- **Critical — Webhook signature verification is skipped when `WEBHOOK_SECRET` is empty** (`directory.py:45-48`, `config.py:27`)
  - **Impact:** The `/directory/webhook` endpoint accepts unsigned payloads by default, allowing unauthenticated creation/update/deactivation of users.
  - **Fix:** Treat missing `WEBHOOK_SECRET` as a hard failure outside debug; fail startup or reject requests until configured.
  - **Status:** Known

---

## Approval Workflow Findings

### `backend/app/api/v1/endpoints/approvals.py`
- **Medium — KRI approval requests skip department access checks** (`approvals.py:81-88`)
  - **Impact:** Users can create approval requests for KRIs outside their department by referencing the KRI ID.
  - **Fix:** Resolve the KRI's linked risk and apply `check_department_access(risk.department_id, current_user)` before creating the request.
  - **Status:** Known

---

## RBAC Seed/Permission Findings

### `backend/app/db/seed.py`
- **High — `approvals:write` is granted but never defined** (`seed.py:26-47`)
  - **Impact:** `risk_manager` is granted `approvals:write`, but the permission is not seeded, so JWT permission lists omit it and UI gating can hide approval actions.
  - **Fix:** Add `approvals:write` to PERMISSIONS (and seed it) or remove it and standardize on `can_resolve_approvals`.
  - **Status:** Known

---

## Endpoints With No Issues Found

### `backend/app/api/v1/endpoints/auth.py`
- **No issues found.** Login and `/me` use JWT auth, and demo login is gated by `debug` + `mock_auth_enabled`.

### `backend/app/api/v1/endpoints/users.py`
- **No issues found.** User CRUD and subordinate lookup require authentication and admin/self checks (mock-login caveat documented above).

### `backend/app/api/v1/endpoints/admin.py`
- **No issues found.** Admin-only maintenance endpoints are gated by role check.

### `backend/app/api/v1/endpoints/reports.py`
- **No issues found.** Report exports require `reports:read` permission and enforce department scoping.
