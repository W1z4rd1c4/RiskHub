# Notifications & Approvals

> **Who uses this**: All users

---

## Table of Contents

1. [Notification Types](#notification-types)
2. [Taking Action on Notifications](#taking-action-on-notifications)
3. [Requesting Approvals](#requesting-approvals)
4. [Understanding Approval Status](#understanding-approval-status)
5. [Managing Your Workflow](#managing-your-workflow)

---

## Notification Types

RiskHub keeps you informed with timely notifications.

### Accessing Notifications

Click the **bell icon** 🔔 in the header to see your notifications.
- **Red badge**: Shows count of unread notifications
- **Click** to open notification panel

### Types of Notifications

| Notification | When You Receive It |
|--------------|-------------------|
| **Approval Request** | Someone needs your approval |
| **Approval Decision** | Your request was approved or rejected |
| **KRI Due** | KRI value submission deadline approaching |
| **KRI Overdue** | KRI value past due date |
| **Breach Alert** | KRI exceeded threshold |
| **Ownership Assigned** | You've been assigned as owner |

### Notification Settings

Control what notifications you receive:
1. Go to **Settings → Notifications** (if available)
2. Toggle notification types on/off
3. Choose email vs. in-app delivery

---

## Taking Action on Notifications

### Quick Actions

From the notification panel:
1. **Click the notification** to navigate directly to the relevant item
2. **Mark as read** by clicking the check mark
3. **Clear all** to dismiss read notifications

### Common Actions by Type

| Notification | What to Do |
|--------------|------------|
| Approval Request | Click → Review → Approve or Reject |
| Approval Decision | Click → See what was decided |
| KRI Due | Click → Submit your KRI value |
| Breach Alert | Click → Investigate the KRI breach |
| Ownership Assigned | Click → Review your new responsibility |

---

## Requesting Approvals

Some actions automatically create approval requests.

### Actions That Request Approval

| Action | When Approval is Required |
|--------|--------------------------|
| Delete a risk | Always (for non-privileged users) |
| Delete a control | Always (for non-privileged users) |
| Delete a KRI | Always (for non-privileged users) |
| Change owner | Always |
| Change department | Always |
| Edit priority risk | Always (any field) |
| Correct KRI value | Always |

### What Happens When You Request Approval

1. You make the change as normal
2. System creates an approval request
3. Your change shows **"Pending Approval"**
4. Primary approver is notified:
   - Risk Owner (for risks they own)
   - Department Head (fallback)
5. Once approved, your change takes effect

### Tracking Your Requests

1. Navigate to **Workflow**
2. Click **My Requests** tab
3. View status of all your pending requests

---

## Understanding Approval Status

### Status Meanings

| Status | What It Means | Your Action |
|--------|---------------|-------------|
| **Pending** | Awaiting primary approver | Wait |
| **Pending Privileged** | Primary approved; needs CRO/RM | Wait |
| **Approved** | Change executed ✅ | Done |
| **Rejected** | Change denied ❌ | Review reason |
| **Cancelled** | Request withdrawn | None |

### Approval Flow

```
You submit → PENDING → Approver reviews
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
       CANCELLED      REJECTED       APPROVED
      (by you)       (denied)       (executed)
```

For high-risk items, there's an additional tier:

```
Primary approves → PENDING_PRIVILEGED → CRO/RM reviews
                                             │
                          ┌──────────────────┼──────────────────┐
                          ▼                  ▼                  ▼
                     CANCELLED          REJECTED            APPROVED
```

### If Your Request is Rejected

1. Check the rejection reason (visible in request detail)
2. Understand what was wrong
3. Modify your approach
4. Submit a new request if appropriate

### Cancelling Your Request

While a request is pending, you can cancel it:
1. Go to **Workflow → My Requests**
2. Find the pending request
3. Click **Cancel**
4. Confirm cancellation

---

## Managing Your Workflow

### The Workflow Page

**Workflow** in the sidebar shows all your pending actions:

| Tab | What It Shows |
|-----|---------------|
| **My Approvals** | Requests waiting for YOUR approval |
| **My Requests** | Requests YOU submitted |
| **All Pending** | All pending requests (privileged users) |

### Approving Requests (If You're an Approver)

As a Department Head or privileged user, you may need to approve requests:

1. Go to **Workflow → My Approvals**
2. Click on a pending request
3. Review the details:
   - Who requested it
   - What change is proposed
   - Impact assessment
4. Choose:
   - **Approve**: Execute the change
   - **Reject**: Deny with reason (required)

### Self-Approval Prevention

> [!NOTE]
> You cannot approve your own requests. If you're the designated approver for your own request, it automatically escalates to the next level.

### Best Practices

1. **Check Workflow daily**: Don't let requests pile up
2. **Approve promptly**: Others are waiting on your decision
3. **Provide reasons**: When rejecting, explain clearly
4. **Follow up**: If your request is rejected, address the concern

---

## Quick Reference

### Where to Find Things

| I want to... | Go to... |
|--------------|----------|
| See my pending tasks | Workflow |
| View my unread alerts | Bell icon 🔔 |
| Check my request status | Workflow → My Requests |
| Approve someone's request | Workflow → My Approvals |

### Approval Timeline

| Request Type | Typical Response Time |
|--------------|----------------------|
| Standard deletion | 1-2 business days |
| Ownership change | 1-2 business days |
| Priority risk edit | Same day (escalated) |
| KRI correction | Same day to 2 days |

---

## Next Steps

- [FAQ](./faq.md) - Common questions answered
- [Getting Started](./getting-started.md) - Review the basics

---

*Not receiving notifications? Check your Settings or contact your Administrator.*
