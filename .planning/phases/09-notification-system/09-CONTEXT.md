# Phase 9 Context: Notification System

## Vision Summary

Implement an in-app notification system for:
1. **Approval Workflow Events** - New approvals, approved/rejected notifications
2. **KRI Deadline Reminders** - Due soon, overdue, near-breach alerts
3. **Assignment Notifications** - When assigned as owner/responsible party

## Notification Categories

### 1. Approval Workflow Notifications
| Event | Recipient | Message |
|-------|-----------|---------|
| New approval request created | Privileged users (approvers) | "New {action} request for {resource}" |
| Request approved | Requester | "Your {action} request for {resource} was approved" |
| Request rejected | Requester | "Your {action} request for {resource} was rejected" |

### 2. KRI Deadline Notifications
| Event | Recipient | Message |
|-------|-----------|---------|
| KRI due in 7 days | KRI owner | "KRI '{name}' is due for reporting in 7 days" |
| KRI due in 1 day | KRI owner | "KRI '{name}' is due tomorrow" |
| KRI overdue | KRI owner + Risk Manager | "KRI '{name}' is overdue" |
| KRI near breach | KRI owner + Risk Manager | "KRI '{name}' is approaching limit threshold" |

### 3. Assignment Notifications (Deferred)
Assignment notifications will be handled in a future phase when user assignment is redesigned.

---

## Technical Approach

### Notification Model
```python
Notification:
  - id: int
  - user_id: int (FK → User, recipient)
  - type: NotificationType (enum)
  - title: str
  - message: str
  - resource_type: str | None (risk, control, kri, approval)
  - resource_id: int | None
  - is_read: bool (default false)
  - created_at: datetime
  - expires_at: datetime | None (optional auto-dismiss)
```

### Notification Types (Enum)
- `APPROVAL_PENDING` - New request for approvers
- `APPROVAL_RESOLVED` - Approved/rejected for requester
- `KRI_DUE_SOON` - 7 days before deadline
- `KRI_DUE_TOMORROW` - 1 day before deadline
- `KRI_OVERDUE` - Past deadline
- `KRI_NEAR_BREACH` - Value approaching limit

### Generation Triggers
1. **Approval Events**: Real-time on approve/reject/create
2. **KRI Deadlines**: Background scheduler (daily check)

---

## Phase 8 Dependencies

Leverages work completed in Phase 8:
- ✅ ApprovalRequest model with `action_type`, status tracking
- ✅ Approval API endpoints (create, approve, reject)
- ✅ Privileged user detection (`can_resolve_approvals`)
- ✅ Pydantic V2 patterns and timezone-aware datetimes
- ✅ Frontend sidebar with badge count pattern (reusable for notifications)

---

## Implementation Plan

| Plan | Scope | Estimate |
|------|-------|----------|
| 09-01 | Notification model, schemas, migration | 2-3 tasks |
| 09-02 | Generation logic (approval events, helpers) | 2-3 tasks |
| 09-03 | Notification API endpoints (list, mark read, unread count) | 2-3 tasks |
| 09-04 | Frontend UI (bell icon, dropdown, notification center) | 3-4 tasks |
| 09-05 | Background scheduler for KRI deadlines | 2-3 tasks |

## Out of Scope

- Email/SMS notifications (future enhancement)
- Push notifications (future enhancement)
- Assignment change notifications (future phase)
- Notification preferences/settings (future enhancement)

---
*Created: 2025-12-28*
