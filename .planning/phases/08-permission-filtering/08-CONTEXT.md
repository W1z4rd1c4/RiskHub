# Phase 8 Context: Permission-Based Data Filtering

## Vision Summary

Implement approval workflow for sensitive operations:
1. **Deletions** - All delete requests require Risk Manager approval (already implemented)
2. **Edits to critical risk items** - Controls/KRIs linked to high-risk items require approval
3. **Edits to sensitive fields** - Changing owner, department, category requires approval

## Approval Scope

### 1. Deletions (Implemented in 08-01 to 08-03)
- Delete risk/control/KRI → requires approval for non-privileged users
- Privileged users can delete immediately

### 2. Edits to Critical Risk Items (NEW - needs 08-06)
**When a Risk is "critical":**
- `is_priority = True`, OR
- `net_score >= 15` (high net risk)

**What requires approval:**
- Editing Controls linked to that critical Risk
- Editing KRIs linked to that critical Risk
- Non-privileged users only

**Flow:**
1. User edits control/KRI tied to critical risk
2. Clicks Save → message "Change requires approval"
3. Change stored as pending in ApprovalRequest
4. Risk Manager approves → changes auto-applied
5. Risk Manager rejects → changes discarded

### 3. Edits to Sensitive Fields (NEW - needs 08-07)
**Sensitive fields on all resources:**
- `owner_id` / `owner`
- `department_id` / `department`
- `category`
- `is_priority` (on Risk) - **cannot change from true→false without approval**

**Applies to:** Risks, Controls, KRIs (for non-privileged users)

**Same flow as #2:**
- User tries to change sensitive field → "Change requires approval"
- Pending until approved → auto-applied on approval

---

## How It Works

### User Experience (Requester)
1. User clicks "Delete" OR edits sensitive item → triggers approval
2. Dialog shows reason (mandatory)
3. Confirmation: "Request submitted for approval"
4. **Item remains visible** with "🔒 Under Review" flag
5. User sees pending requests in Workflow tab

### User Experience (Approver - Risk Manager, CRO, Admin)
1. See **"Workflow"** tab with badge count
2. View: My Submissions + Pending Review
3. Each request shows: resource, change type, reason, date
4. Approve/Reject with mandatory commentary
5. On approval → changes auto-applied immediately

### Visual Indicators
- "Under Review" badge on items with pending changes
- Banner on detail pages showing pending request
- Workflow tab visible to ALL users

## What's Essential

1. Items stay visible until approval
2. Visual flag on pending items
3. Mandatory reason/commentary
4. Lightweight one-click approve/reject
5. Auto-apply on approval

## What's Out of Scope

- Email/push notifications (Phase 9)
- Audit trail history (Phase 10)
- Approval delegation

## Roles

| Role | Can Request | Can Approve | Immediate Access |
|------|-------------|-------------|------------------|
| Employee | ✅ | ❌ | ❌ |
| Dept Head | ✅ | ❌ | ❌ |
| Risk Manager | ✅ | ✅ | ✅ |
| CRO | ✅ | ✅ | ✅ |
| Admin | ✅ | ✅ | ✅ |

## Implementation Plan

| Plan | Status | Scope |
|------|--------|-------|
| 08-01 | ✅ Complete | ApprovalRequest model & schemas |
| 08-02 | ✅ Complete | Approval API endpoints |
| 08-03 | ✅ Complete | Delete endpoint integration |
| 08-04 | Planned | Frontend Workflow UI |
| 08-05 | Planned | Integration testing |
| **08-06** | **NEW** | Edit approval for critical risk items |
| **08-07** | **NEW** | Edit approval for sensitive fields |

---
*Updated: 2025-12-27*

