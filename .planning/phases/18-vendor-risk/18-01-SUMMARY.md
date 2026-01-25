---
phase: 18-vendor-risk
plan: 18-01
subsystem: api
tags: [vendors, rbac, alembic, fastapi, react]

requires:
  - phase: 18-vendor-risk
    provides: notifications + seed parity (18-00)
provides:
  - Vendor catalog entity (outsourcing owner + manual classification)
  - Vendors CRUD API with RBAC + department scoping (incl. cross-dept owner visibility)
  - Vendors UI (list/detail/create/edit) with i18n + navigation
affects: [18-vendor-risk, permissions, activity-log]

tech-stack:
  added: []
  patterns:
    - "Vendor read endpoints require vendors:read (admin has no business data)"
    - "Dept-scoped list includes cross-department owned vendors"

key-files:
  created:
    - backend/app/models/vendor.py
    - backend/app/schemas/vendor.py
    - backend/app/api/v1/endpoints/vendors.py
    - backend/tests/test_vendors.py
    - frontend/src/pages/VendorsPage.tsx
    - frontend/src/pages/VendorDetailPage.tsx
    - frontend/src/components/VendorForm.tsx
    - frontend/src/services/vendorApi.ts
    - frontend/src/types/vendor.ts
  modified:
    - backend/app/db/seed.py
    - backend/app/models/activity_log.py
    - backend/app/api/v1/router.py
    - frontend/src/App.tsx
    - frontend/src/components/layout/Sidebar.tsx
    - frontend/src/i18n/index.ts

key-decisions:
  - "Vendor status is active/inactive (soft archive via status=inactive)"
  - "Owner edit path supported without vendors:write, but governance fields (department/owner/status) require vendors:write"

duration: 60m
completed: 2026-01-25
---

# Phase 18: Vendor Risk Management — Plan 18-01 Summary

**Vendor catalog with outsourcing owner + manual classification, backed by RBAC-scoped CRUD and a new Vendors UI module.**

## Accomplishments
- Added `Vendor` model + migrations (fields for ownership, classification flags, and future concentration inputs like replaceability/alternatives).
- Implemented `/api/v1/vendors` CRUD with strict `vendors:read` gating, department scoping, and cross-department owner visibility.
- Added vendor activity logging via `ActivityEntityType.VENDOR` (+ vendor-related entity type placeholders for later Phase 18 plans).
- Shipped Vendors UI (list/detail/create/edit) with i18n and sidebar navigation entry.

## Scoping Rules (API)
- `GET /vendors` and `GET /vendors/{id}` require `vendors:read`.
- Dept-scoped users see vendors in their department **or** vendors where they are `outsourcing_owner_user_id`.
- `GET /vendors/{id}` returns **404** when the user cannot read the vendor (no existence leakage).
- Create requires `vendors:write` + `check_department_access`.
- Update requires `vendors:write` **or** outsourcing owner; governance fields require `vendors:write`.
- Archive requires `vendors:delete` and performs soft delete via `status=inactive`.

## Default Permissions (Seed)
- Added `vendors:read|write|delete` permissions.
- Defaults:
  - `risk_manager`: `vendors:*`
  - `department_head`: `vendors:read`, `vendors:write`
  - `employee`, `viewer`, `actuarial`, `internal_audit`, `compliance`: `vendors:read`

## Task Commits
1. **Task 1: Backend data model — Vendor + criticality/materiality fields** - `1e11e07` (feat)
2. **Task 2: Permissions — introduce vendor resources** - `11a1e85` (feat)
3. **Task 3: Backend API — CRUD + filtering + department scoping** - `5cf3a93` (feat)
   - Follow-up fix: `db16877` (fix) — handle explicit null updates safely
4. **Task 4: Frontend UI — vendor list + detail + edit** - `7a57e26` (feat)

**Plan metadata:** (this summary) - pending commit

## Verification
- `cd backend && alembic upgrade head` runs clean (vendors table + activity_entity_type extension).
- `cd backend && pytest -q tests/test_vendors.py` passes.
- `cd frontend && npx tsc --noEmit` passes.

