# Risk Hub Configuration

> **Audience**: CRO (Chief Risk Officer) only  
> **Location**: Sidebar → Risk Hub

---

## Table of Contents

1. [Accessing Risk Hub Configuration](#1-accessing-risk-hub-configuration)
2. [Risk Scoring Thresholds](#2-risk-scoring-thresholds)
3. [Risk Types Management](#3-risk-types-management)
4. [Approval Rules Setup](#4-approval-rules-setup)
5. [Notification Settings](#5-notification-settings)
6. [Log Rotation Settings](#6-log-rotation-settings)
7. [Total Asset Value Configuration](#7-total-asset-value-configuration)

---

## 1. Accessing Risk Hub Configuration

> [!IMPORTANT]
> The Risk Hub configuration area is **exclusively available to the CRO role**. No other user, including Administrators, can access or modify these settings.

To access Risk Hub:
1. Log in as a user with the CRO role
2. Click **Risk Hub** in the sidebar (visible only to CRO)
3. You will see configuration tabs for different settings areas

---

## 2. Risk Scoring Thresholds

Risk scoring thresholds determine how risks are categorized and when privileged approval is required.

### Understanding Risk Scores

RiskHub uses a **5×5 risk matrix** combining:
- **Probability** (1-5): Likelihood of risk occurrence
- **Impact** (1-5): Severity of consequences

**Net Score** = Probability × Impact (range: 1-25)

### Configurable Thresholds

| Threshold | Default | Description | Impact |
|-----------|---------|-------------|--------|
| **High Risk Minimum Net Score** | 10 | Risks at or above this score require privileged approval for changes | Approval workflow, dashboard highlighting |
| **Medium Risk Minimum Net Score** | 5 | Threshold for medium risk classification | Reporting categorization |
| **Critical Risk Minimum Net Score** | 20 | Highest severity risks | Executive alerts, priority treatment |

### How Thresholds Affect Approvals

When a risk has a net score ≥ High Risk Minimum:
- **Any edit by non-privileged users** → Creates approval request
- **Approval requires CRO or Risk Manager** (privileged approval tier)
- **Control edits linked to this risk** → Also require privileged approval

### Configuring Thresholds

1. Navigate to **Risk Hub → Thresholds**
2. Adjust the slider or enter values for each threshold
3. Click **Save Changes**
4. Changes take effect immediately for all new requests

> [!WARNING]
> Lowering thresholds increases the number of items requiring privileged approval. Consider operational impact before making changes.

---

## 3. Risk Types Management

Risk types categorize risks for reporting and analysis.

### Default Risk Types

RiskHub includes standard risk categories:
- Strategic Risk
- Operational Risk
- Financial Risk
- Compliance Risk
- Reputational Risk

### Adding Custom Risk Types

1. Navigate to **Risk Hub → Risk Types**
2. Click **Add Risk Type**
3. Enter:
   - **Name**: Display name (e.g., "Technology Risk")
   - **Description**: Explanation of this category
   - **Color**: Visual indicator for dashboards
4. Click **Save**

### Risk Type Best Practices

- Align with your organization's risk taxonomy
- Keep categories mutually exclusive and collectively exhaustive (MECE)
- Consider regulatory reporting requirements when defining types
- Limit to 8-12 types for usability

---

## 4. Approval Rules Setup

Approval rules determine who can approve what actions and when privileged approval is required.

### Approval Tiers

RiskHub implements a two-tier approval model:

```
             User submits change request
                        │
                        ▼
              ┌─────────────────┐
              │ PRIMARY APPROVAL │
              │  Risk Owner OR   │
              │  Department Head │
              └────────┬────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │ Is risk high-priority OR    │
         │ net_score ≥ high threshold? │
         └─────────────┬───────────────┘
                       │
            Yes ───────┴──────── No
            │                     │
            ▼                     ▼
   ┌─────────────────┐    ┌─────────────┐
   │ PRIVILEGED      │    │  APPROVED   │
   │ APPROVAL (CRO/  │    │  (Action    │
   │ Risk Manager)   │    │  executes)  │
   └─────────────────┘    └─────────────┘
```

### Privileged Approval Triggers

The following conditions automatically require privileged (CRO/Risk Manager) approval:

| Trigger | Description |
|---------|-------------|
| **Priority Risk** | Risk has `is_priority = true` |
| **High Net Score** | Risk net_score ≥ configured threshold |
| **Linked High-Risk Control** | Control is linked to any high-risk or priority risk |

### Self-Approval Prevention

The system automatically prevents users from approving their own requests:
- If the primary approver (owner) submitted the request → escalates to Department Head
- If Department Head submitted → escalates directly to privileged tier

### Configuring Approval Behavior

1. Navigate to **Risk Hub → Approvals**
2. Configure:
   - **Auto-escalation timeout** (optional): Days before unapproved requests escalate
   - **Notification preferences**: Who receives alerts for pending approvals
3. Click **Save Changes**

---

## 5. Notification Settings

Configure how RiskHub sends notifications to users.

### Notification Types

| Notification | Recipients | Trigger |
|--------------|-----------|---------|
| Approval Request | Primary approver | New approval request created |
| Approval Escalation | Privileged users | Request requires privileged approval |
| Approval Decision | Requester | Request approved or rejected |
| KRI Due Reminder | Reporting owner | KRI value submission deadline approaching |
| KRI Overdue Alert | Risk owner, CRO | KRI value not submitted by deadline |
| Breach Alert | Risk owner, CRO, Dept Head | KRI value exceeds limits |

### Configuring Notifications

1. Navigate to **Risk Hub → Notifications**
2. For each notification type:
   - Toggle **Enabled/Disabled**
   - Set **Email notifications** (if email is configured)
   - Set **In-app notifications** (always available)
3. Configure KRI reminder settings:
   - **Days before deadline** for reminder (default: 3)
   - **Overdue escalation** recipients
4. Click **Save Changes**

### In-App Notification Center

Users access notifications via the **bell icon** in the header:
- Unread count badge shows pending notifications
- Click to view notification list
- Click individual notification to navigate to relevant item

---

## 6. Log Rotation Settings

Configure how audit and application logs are managed.

### Dual Log System

RiskHub maintains two separate log streams:

| Log Type | Purpose | Location |
|----------|---------|----------|
| **Application Logs** | Technical operations, debugging | `backend/logs/app.json.log` |
| **Audit Logs** | Business actions, compliance | `backend/logs/audit.json.log` |

### Log Rotation Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| **Rotation Size** | 50 MB | File size at which logs rotate |
| **Retention Count** | 10 | Number of rotated files to keep |

### Configuring Log Rotation

1. Navigate to **Risk Hub → Logs** or **Admin Console → Log Configuration**
2. Set **Application Log Rotation Size** (MB)
3. Set **Application Log Retention Count**
4. Set **Audit Log Rotation Size** (MB)
5. Set **Audit Log Retention Count**
6. Click **Save Changes**

> [!NOTE]
> Audit logs should have higher retention for compliance. Consider your organization's data retention policies.

### SIEM Integration

Audit logs are formatted as structured JSON for SIEM integration:
- Each line is a valid JSON object
- Includes: timestamp, event, user_id, entity_type, entity_id, changes, client_ip
- Forward to Splunk, Elastic, or Azure Sentinel using Filebeat or similar agent

---

## 7. Total Asset Value Configuration

Configure the organization's total asset value for impact calculation.

### Purpose

The total asset value is used to calculate financial loss thresholds for the risk impact scale:
- **Medium Impact**: 3-10% of total assets
- **Low Impact**: < 3% of total assets

### Configuring Total Asset Value

1. Navigate to **Risk Hub → Risk Matrix**
2. Enter **Total Asset Value** in your organization's currency
3. Click **Save**

The system will automatically calculate and display:
- Medium impact threshold range
- Low impact threshold range

### Impact Scale Reference

| Level | Rating | Description | Financial Threshold |
|-------|--------|-------------|---------------------|
| Catastrophic | 5 | > 10 million | Fixed amount |
| Major | 4 | 5-10 million | Fixed amount |
| Moderate | 3 | 10%+ of assets OR 2-5 million | Dynamic + fixed |
| Minor | 2 | 3-10% of assets OR 0.5-2 million | Dynamic + fixed |
| Insignificant | 1 | < 3% of assets OR < 0.5 million | Dynamic + fixed |

---

## Configuration Best Practices

1. **Document changes**: Keep a log of threshold and configuration changes with justification
2. **Test in staging**: If available, test configuration changes in a staging environment first
3. **Communicate changes**: Notify users when approval thresholds change
4. **Regular review**: Review thresholds quarterly to ensure they remain appropriate
5. **Align with policy**: Ensure thresholds match your organization's risk appetite statement

---

## Next Steps

- [Manage Users](./user-management.md)
- [Configure Departments](./departments.md)
- [Understand Approvals](./approvals.md)

---

*Only the CRO can modify these settings. For platform administration (users, logs), see the Admin Console.*
