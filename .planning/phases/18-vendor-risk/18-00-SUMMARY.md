---
phase: 18-vendor-risk
plan: 18-00
subsystem: infra
tags: [rbac, notifications, alembic, react, typescript]

requires:
  - phase: 17-production-deploy
    provides: RBAC + notifications foundation
provides:
  - Seed parity for Phase 18 contract governance via vendor_contracts permissions
  - Single-source-of-truth notification type keys (backend enum + API schema + frontend unions)
affects: [18-vendor-risk, notifications, settings, seed]

tech-stack:
  added: []
  patterns:
    - "Notification types must be declared in backend model enum, backend API schema enum, and frontend TS unions together"

key-files:
  created:
    - backend/alembic/versions/d18e00a1b2c3_extend_notification_type_enum_for_vendor_types.py
  modified:
    - backend/app/db/seed.py
    - backend/app/models/notification.py
    - backend/app/schemas/notification.py
    - frontend/src/types/notification.ts
    - frontend/src/components/notifications/NotificationBell.tsx
    - frontend/src/components/settings/NotificationSettings.tsx
    - frontend/src/i18n/locales/en/settings.json
    - frontend/src/i18n/locales/cs/settings.json
    - docs/BUSINESS_LOGIC.md

key-decisions:
  - "No separate legal role required: contract governance modeled as vendor_contracts:* permission (typically granted to compliance)"
  - "Phase 18 vendor notification keys are defined once here and treated as stable across later plans"

patterns-established:
  - "Deep-link notifications by resource_type/resource_id; Phase 18 uses resource_type=vendor"

duration: 20m
completed: 2026-01-25
---

# Phase 18: Vendor Risk Management — Plan 18-00 Summary

**RBAC seed parity for vendor contract governance plus end-to-end notification type alignment (including vendor VRM keys).**

## Accomplishments
- Added `vendor_contracts:*` permissions to seed and granted by default to `compliance` (no separate `legal` role required).
- Aligned notification types across backend model, backend API schema, and frontend TypeScript unions; fixed missing `questionnaire_clarification_requested`.
- Introduced stable Phase 18 vendor notification keys and exposed them in Settings UI with i18n.

## Task Commits
1. **Task 1: Seed parity — vendor_contracts permissions** - `d998c45` (feat)
2. **Task 2: Notifications schema alignment + vendor types** - `888eda0` (fix)
3. **Task 3: BUSINESS_LOGIC update — vendor placeholders** - `b134c74` (docs)

**Plan metadata:** (this summary) - pending commit

## Notes / Verification
- `cd frontend && npx tsc --noEmit` passes.
- Full backend test suite currently fails during collection due to pre-existing test issues (unrelated to notifications changes).

