# Phase 179 Expansion Context: Comprehensive E2E Test Data

## Vision

Expand Phase 179 to seed all data required for the 204 currently-skipped E2E tests. After execution, the E2E suite should achieve near-100% pass rate with minimal skips.

---

## How It Works

Extend the existing `seed_e2e_data.py` script with additional seeding functions that create:

1. **Activity Log History** — CRUD operations for each entity type so activity-logging tests find entries
2. **Resolved Approvals** — APPROVED, REJECTED, CANCELLED approval requests for workflow tests
3. **Sensitive Field Approvals** — Pending approvals for owner_id, department_id, category changes
4. **Permission-Gated Actions** — Delete approvals, control execution logs, KRI value corrections
5. **Deterministic Cross-Department Data** — Known ownership patterns for predictable access tests

---

## What's Essential

- **Use existing demo accounts only** — No new users
- **Activity Logging**: CREATE/UPDATE/ARCHIVE entries for RISK, CONTROL, KRI, APPROVAL
- **Approval Workflows**: Approvals in all terminal states (APPROVED, REJECTED, CANCELLED)
- **Sensitive Fields**: Pending approvals for specific field changes
- **Permissions**: Delete approvals, control executions, KRI corrections

---

## What's Out of Scope

- Quarterly comparison snapshots (time-dependent)
- KRI breach detection scenarios (threshold configuration)
- KRI value history trends (time-series data)
- Settings isolation data (test structure issue, not data)
- Dashboard drill-down data (already covered)

---

## New Plans

| Plan | Focus |
|------|-------|
| **179-07** | Activity Log Data Seeding |
| **179-08** | Resolved Approval Data |
| **179-09** | Sensitive Field Approval Data |
| **179-10** | Permission-Gated Action Data |
| **179-11** | Deterministic Cross-Department Scenarios |

---

*Created: 2026-01-13*
