# Phase 8 Context: Permission-Based Data Filtering

## Vision Summary

Implement approval workflow for sensitive delete operations where non-privileged users must request Risk Manager approval before deletion is executed.

## How It Works

### User Experience (Requester)
1. User clicks "Delete" on a risk/control/KRI
2. Dialog asks for reason (mandatory)
3. Confirmation: "Deletion request submitted for approval"
4. **The item remains visible** with a visual flag: "🔒 Under Review by Risk Manager"
5. User can see their pending requests and cancel if needed

### User Experience (Approver - Risk Manager, CRO, Admin)
1. Log in → see **"Workflow"** tab in sidebar with badge count (pending to review)
2. Click to see:
   - **My Submissions**: their own deletion requests (if any)
   - **Pending Review**: all pending requests awaiting their approval
3. Each request shows: resource, requestor, reason, date
4. One-click **Approve** or **Reject** with **mandatory commentary**
5. Upon approval → item gets archived/deleted automatically
6. Upon rejection → flag removed, item back to normal state

### Visual Indicators
- Items with pending deletion show "Under Review" badge in lists and detail views
- Risk/Control/KRI detail pages show banner: "Pending deletion request by [user] on [date]"
- Badge count on Workflow tab:
  - For approvers: count of pending items to review
  - For others: count of their pending submissions
- **Workflow tab visible to ALL users** (not just approvers)

## What's Essential

1. **Items stay visible** until approval (not hidden or pre-archived)
2. **Visual flag** clearly indicates pending state
3. **Mandatory reason** when requesting deletion
4. **Mandatory commentary** when approving/rejecting
5. **Lightweight UX** - one-click approve/reject from list
6. **Auto-execute** on approval (no separate execution step)

## What's Out of Scope

- Edit/update approvals (only deletes need approval)
- Email/push notifications (Phase 9)
- Audit trail of approval history (Phase 10)
- Delegation of approval authority

## Roles

| Role | Can Request | Can Approve | Can Delete Immediately |
|------|-------------|-------------|------------------------|
| Employee | ✅ | ❌ | ❌ |
| Dept Head | ✅ | ❌ | ❌ |
| Risk Manager | ✅ | ✅ | ✅ |
| CRO | ✅ | ✅ | ✅ |
| Admin | ✅ | ✅ | ✅ |

---
*Captured: 2025-12-27*
