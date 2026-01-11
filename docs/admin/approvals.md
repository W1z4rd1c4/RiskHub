# Approvals & Governance

> **Audience**: CRO, Risk Manager, Department Heads  
> **Location**: Sidebar → Workflow

---

## Table of Contents

1. [Understanding Approval Workflows](#1-understanding-approval-workflows)
2. [Approval Status Flow](#2-approval-status-flow)
3. [Tiered Approval Model](#3-tiered-approval-model)
4. [Reviewing Pending Requests](#4-reviewing-pending-requests)
5. [Approval Thresholds](#5-approval-thresholds)
6. [Self-Approval Prevention](#6-self-approval-prevention)
7. [Cancellation Rules](#7-cancellation-rules)
8. [Audit Trail Review](#8-audit-trail-review)
9. [Best Practices](#9-best-practices)

---

## 1. Understanding Approval Workflows

RiskHub implements a governance-first approach where certain actions require approval before execution.

### Why Approval Workflows?

| Benefit | Description |
|---------|-------------|
| **Risk Management** | Prevent unauthorized changes to critical risk data |
| **Compliance** | Maintain audit trails for regulatory requirements |
| **Separation of Duties** | Ensure oversight of sensitive changes |
| **Quality Control** | Catch errors before they affect production data |

### Actions Requiring Approval

For **non-privileged users** (Department Head, Employee):

| Action | Always Requires Approval |
|--------|-------------------------|
| **Delete Risk** | ✅ Yes |
| **Delete Control** | ✅ Yes |
| **Delete KRI** | ✅ Yes |
| **Edit Sensitive Fields** | ✅ Yes (owner, department, category, priority) |
| **Any Edit on Priority Risk** | ✅ Yes |
| **KRI Value Correction** | ✅ Yes (post-deadline changes) |

### Actions NOT Requiring Approval

| Action | Approval Status |
|--------|-----------------|
| **Create Risk/Control/KRI** | Immediate (if user has write permission) |
| **Edit non-sensitive fields** | Immediate (for owned/department entities) |
| **Submit KRI Values** | Immediate (unless linked to high-risk) |
| **Log Control Execution** | Immediate |
| **Link/Unlink Controls to Risks** | Immediate (if user has write permission) |

---

## 2. Approval Status Flow

Every approval request moves through defined statuses:

```
                    User submits request
                           │
                           ▼
                    ┌─────────────┐
                    │   PENDING   │
                    │ (awaiting   │
                    │  primary)   │
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │  CANCELLED  │ │  REJECTED   │ │  Primary    │
    │ (by user)   │ │(by approver)│ │  Approved   │
    └─────────────┘ └─────────────┘ └──────┬──────┘
                                           │
                           ┌───────────────┴───────────────┐
                           │ Requires privileged approval? │
                           └───────────────┬───────────────┘
                                   │               │
                               Yes ▼               ▼ No
                    ┌─────────────────────┐ ┌─────────────┐
                    │ PENDING_PRIVILEGED  │ │  APPROVED   │
                    │ (awaiting CRO/RM)   │ │  (executed) │
                    └──────────┬──────────┘ └─────────────┘
                               │
               ┌───────────────┼───────────────┐
               ▼               ▼               ▼
        ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
        │  CANCELLED  │ │  REJECTED   │ │  APPROVED   │
        │             │ │             │ │  (executed) │
        └─────────────┘ └─────────────┘ └─────────────┘
```

### Status Descriptions

| Status | Description | Actions Available |
|--------|-------------|-------------------|
| **PENDING** | Awaiting primary approver (owner/dept head) | Approve, Reject, Cancel |
| **PENDING_PRIVILEGED** | Primary approved; awaiting CRO/Risk Manager | Approve, Reject, Cancel |
| **APPROVED** | Fully approved; change executed | None (terminal) |
| **REJECTED** | Denied by approver; change not made | None (terminal) |
| **CANCELLED** | Withdrawn by requester | None (terminal) |

---

## 3. Tiered Approval Model

RiskHub uses a two-tier approval model for comprehensive governance.

### Tier 1: Primary Approval

The first level of approval, handled by entity stakeholders:

| Approver Priority | Entity Type | Fallback |
|-------------------|-------------|----------|
| 1. Risk Owner | Risk | Department Head |
| 2. Department Head | Risk, Control | Privileged escalation |
| 1. Risk Owner of linked risk | Control | Department Head |
| 1. Risk Owner of linked risk | KRI | Department Head |

### Tier 2: Privileged Approval

Required for high-impact changes, handled by governance roles:

| Approver | Role |
|----------|------|
| CRO | Chief Risk Officer |
| Risk Manager | Risk Manager role |
| Other privileged | Any user with Global access scope |

### When Privileged Approval is Required

| Trigger | Condition |
|---------|-----------|
| **Priority Risk** | Risk has `is_priority = true` |
| **High Net Score** | Risk net score ≥ High Risk threshold (default: 10) |
| **Linked Control** | Control is linked to any high-risk or priority risk |
| **KRI Linked** | KRI is linked to a high-risk or priority risk |

---

## 4. Reviewing Pending Requests

### Accessing the Approval Queue

1. Navigate to **Workflow** in the sidebar
2. View the **Pending Approvals** section
3. Filter by:
   - **My Approvals**: Requests where you are the designated approver
   - **All Pending**: All pending requests (privileged users only)
   - **My Requests**: Requests you submitted

### Approval Queue Interface

| Column | Description |
|--------|-------------|
| **Entity** | Risk/Control/KRI name and type |
| **Action** | DELETE or EDIT with field details |
| **Requested By** | User who submitted the request |
| **Date** | When request was created |
| **Status** | Current approval status |
| **Priority** | High/Normal based on entity priority |

### Reviewing a Request

1. Click on a request to open the detail view
2. Review the **proposed changes**:
   - For DELETE: View the entity that would be archived
   - For EDIT: View before/after comparison of changed fields
3. Check the **requester** and their justification
4. Verify **impact** on linked entities
5. Choose **Approve** or **Reject**

### Approval Decision

When approving:
1. Click **Approve**
2. Optionally add a comment
3. Confirm the action

The system will:
- Mark request as APPROVED (or PENDING_PRIVILEGED if escalation needed)
- Execute the change (on final approval)
- Notify the requester
- Log to activity trail

When rejecting:
1. Click **Reject**
2. **Add a reason** (required)
3. Confirm the action

The system will:
- Mark request as REJECTED
- Notify the requester with your reason
- Log to activity trail
- No changes made to entity

---

## 5. Approval Thresholds

### Configurable Thresholds (CRO Only)

These thresholds determine when privileged approval is required:

| Threshold | Default | Effect |
|-----------|---------|--------|
| **High Risk Minimum Net Score** | 10 | Net score ≥ this triggers privileged approval |
| **Critical Risk Minimum Net Score** | 20 | Highest severity classification |

### Threshold Examples

For a 5×5 risk matrix (Probability × Impact):

| Net Score | Risk Level | Privileged Required? |
|-----------|-----------|---------------------|
| 1-4 | Low | No |
| 5-9 | Medium | No |
| 10-14 | High | **Yes** |
| 15-20 | High | **Yes** |
| 21-25 | Critical | **Yes** |

### Configuring Thresholds

See [Risk Hub Configuration](./riskhub-config.md#2-risk-scoring-thresholds) for detailed instructions.

---

## 6. Self-Approval Prevention

RiskHub prevents users from approving their own requests to maintain separation of duties.

### How It Works

```
User submits request
        │
        ▼
Is user the primary approver (owner)?
        │
   Yes ─┴── No ─────────────────────────┐
    │                                    │
    ▼                                    ▼
Escalate to Department Head         Normal approval
        │                            to owner
        ▼
Is Department Head also the requester?
        │
   Yes ─┴── No ─────────────────────────┐
    │                                    │
    ▼                                    ▼
Escalate directly to Privileged     Department Head
(CRO / Risk Manager)                can approve
```

### Scenarios

| Scenario | Result |
|----------|--------|
| Employee requests, Risk Owner approves | Normal flow |
| Risk Owner requests deletion of their own risk | Escalates to Department Head |
| Department Head requests, they are also Risk Owner | Escalates to Privileged |
| CRO requests change | Can self-approve (privileged) |

---

## 7. Cancellation Rules

### Who Can Cancel

| Request Status | Who Can Cancel |
|----------------|----------------|
| PENDING | Requester OR any privileged user |
| PENDING_PRIVILEGED | Requester OR any privileged user |
| APPROVED | No one (terminal state) |
| REJECTED | No one (terminal state) |
| CANCELLED | No one (already cancelled) |

### Cancelling a Request

1. Find your request in **Workflow → My Requests**
2. Click on the pending request
3. Click **Cancel Request**
4. Confirm cancellation

### Effects of Cancellation

- Request status → CANCELLED
- No changes made to the entity
- Logged in activity trail with action "CANCEL"
- Approvers notified of cancellation

---

## 8. Audit Trail Review

Every approval action is logged for compliance and auditing.

### Approval Activity Logs

| Action | When Logged |
|--------|-------------|
| CREATE | Approval request created |
| APPROVE | Request approved (per tier) |
| REJECT | Request rejected |
| CANCEL | Request cancelled |

### Viewing Approval History

**For a specific approval:**
1. Open the approval request
2. View the **History** tab
3. See all actions with timestamps and actors

**For all approvals:**
1. Navigate to **Activity Log** (Risk Manager, Compliance, Admin)
2. Filter by **Action**: APPROVE, REJECT, CANCEL
3. Filter by **Entity Type**: APPROVAL
4. Review chronological log entries

### What's Logged

| Field | Description |
|-------|-------------|
| `timestamp` | When action occurred |
| `user_id` | Who performed action |
| `action` | APPROVE, REJECT, CANCEL |
| `entity_type` | APPROVAL |
| `entity_id` | Approval request ID |
| `description` | Details of the decision |
| `changes` | JSON diff (for EDIT approvals) |

---

## 9. Best Practices

### For Approvers

1. **Review promptly**: Don't let requests queue up
2. **Read the details**: Understand what change is being requested
3. **Consider impact**: Check linked entities and downstream effects
4. **Document rejections**: Always provide clear reasons when rejecting
5. **Be consistent**: Apply the same standards across similar requests

### For Requesters

1. **Provide context**: Add justification when submitting sensitive changes
2. **Check before submitting**: Verify your changes are correct
3. **Follow up**: Monitor your pending requests
4. **Cancel if wrong**: If you made a mistake, cancel before approval

### For Administrators

1. **Monitor queue age**: Escalate stale requests
2. **Review approval patterns**: Identify bottlenecks
3. **Audit regularly**: Check that separation of duties is maintained
4. **Train users**: Ensure approvers understand their responsibility

### Approval Workflow Metrics

| Metric | Target | How to Check |
|--------|--------|--------------|
| Average approval time | < 24 hours | Activity Log analysis |
| Pending queue size | < 10 | Workflow dashboard |
| Rejection rate | < 20% | Activity Log filter |
| Self-approval attempts | 0 | System prevents |

---

## Quick Reference: Approval Decision Tree

```
Is user privileged (CRO, Risk Manager, etc.)?
    │
   Yes ─► Immediate execution (no approval needed)
    │
   No ─► Create approval request
          │
          ▼
    Who is primary approver?
          │
    Risk Owner exists? ─Yes─► Risk Owner
          │
         No ─► Department Head
          │
          ▼
    Is self-approval? ─Yes─► Escalate
          │
         No ─► Await primary approval
          │
          ▼
    Requires privileged? ─Yes─► PENDING_PRIVILEGED
          │                      (CRO/RM approves)
         No ─► APPROVED (execute)
```

---

## Next Steps

- [Generate Reports](./reports.md)
- [Configure Thresholds](./riskhub-config.md)

---

*Approval workflows ensure governance compliance. Contact your CRO for threshold adjustments.*
