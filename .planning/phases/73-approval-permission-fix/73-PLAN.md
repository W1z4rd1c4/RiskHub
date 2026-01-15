# Phase 73: Approval Permission System Fix

> **Created**: 2026-01-15
> **Status**: Planning
> **Priority**: High - Blocks Risk Manager approval workflow
> **Total Scope**: ~5.5 hours (all plans)

---

## Problem Summary

The Risk Manager role cannot see or resolve pending approvals in the Workflow page despite:

1. Having `access_scope = global` (privileged user status)
2. Being configured as an approver in Risk Hub → Approval Rules UI

**Root Cause**: Two separate permission systems that are not connected:

| System | Location | Purpose | Current State |
|--------|----------|---------|---------------|
| **RBAC Permissions** | `role_permissions` table | Controls `can_resolve_approvals()` | Risk Manager missing `approvals:write` |
| **Risk Hub Config** | `approval_scenarios.approver_roles` | Display-only UI config | Shows "Risk Manager" but has no effect |

---

## Plans Overview

| Plan | Name | Scope | Dependencies |
|------|------|-------|--------------|
| [73-01](./73-01-PLAN.md) | **Permission Infrastructure Fix** | 45 min | None |
| [73-02](./73-02-PLAN.md) | **Config-Driven Permission Logic** | 2 hours | 73-01 |
| [73-03](./73-03-PLAN.md) | **Risk Hub UI Validation & Warnings** | 1.5 hours | 73-01 |
| [73-04](./73-04-PLAN.md) | **Documentation & Business Logic Update** | 30 min | 73-01 |
| [73-05](./73-05-PLAN.md) | **E2E Verification & Regression Testing** | 1 hour | 73-01, 73-03, 73-04 |

---

## Execution Options

### Option A: Minimal Fix (Recommended Start)

Execute: **73-01** + **73-04** + **73-05**

- Fixes the immediate issue
- Documents the system
- Adds regression tests
- **~2.25 hours**

### Option B: Full Config-Driven Solution

Execute: **73-01** → **73-02** → **73-03** → **73-04** → **73-05**

- Complete solution with single source of truth
- CRO can dynamically configure approvers
- **~5.5 hours**

### Option C: Fix + Validation UI

Execute: **73-01** + **73-03** + **73-04** + **73-05**

- Fixes issue with visible validation
- Shows warning if config/permissions mismatch
- **~3.75 hours**

---

## Affected Systems

### Backend (12+ endpoints)

| File | Functions Using `can_resolve_approvals()` |
|------|------------------------------------------|
| `endpoints/approvals.py` | `list_approval_requests`, `get_approval_request`, `reject_request`, `get_pending_count` |
| `endpoints/risks.py` | `update_risk`, `delete_risk` |
| `endpoints/controls.py` | `update_control`, `delete_control` |
| `endpoints/kris.py` | 10+ functions |
| `endpoints/notifications.py` | `send_reminder` |
| `services/approval_execution_service.py` | `assert_can_approve` |

### Frontend

| Component | Impact |
|-----------|--------|
| `ApprovalsPage.tsx` | Risk Manager sees empty "Pending Queue" |
| `NotificationBell.tsx` | Badge shows 0 approvals |
| `ApprovalScenariosPanel.tsx` | Config UI is misleading |

---

## Verification Strategy

See [73-05-PLAN.md](./73-05-PLAN.md) for complete test plan including:

- Backend unit tests
- E2E Playwright tests
- Manual verification steps

---

## Next Steps

1. User approves execution option (A, B, or C)
2. Execute plans in dependency order
3. Run verification suite
4. Update ROADMAP.md progress
