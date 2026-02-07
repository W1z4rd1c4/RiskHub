# Managing Controls

> **Who uses this**: Risk Managers, Department Heads, Control Owners, Employees

---

## Table of Contents

1. [Viewing Controls](#viewing-controls)
2. [Creating a Control](#creating-a-control)
3. [Editing Control Details](#editing-control-details)
4. [Logging Control Executions](#logging-control-executions)
5. [Control Frequency and Scheduling](#control-frequency-and-scheduling)
6. [Linking Controls to Risks](#linking-controls-to-risks)
7. [Archiving and Restoring Controls](#archiving-and-restoring-controls)

---

## Viewing Controls

### Accessing the Control Catalog

1. Click **Controls** in the sidebar
2. The control list shows all controls you have access to

### Understanding the Control Table

| Column | Description |
|--------|-------------|
| **Name** | Control title (click to open detail page) |
| **Department** | Which department owns this control |
| **Owner** | Person responsible for execution |
| **Status** | Active, Draft, or Archived |
| **Frequency** | How often the control should be executed |
| **Last Execution** | When it was last logged |
| **Linked Risks** | Number of risks this control mitigates |

### Filtering Controls

Use the filter bar:
- **Search**: Find by name or description
- **Department**: Filter by organizational unit
- **Status**: Show Active, Draft, or All
- **Include Archived**: Off by default; enable to include archived controls
- **Frequency**: Daily, Weekly, Monthly, etc.

---

## Creating a Control

### Who Can Create Controls

You need **controls:write** permission, typically granted to:
- Risk Managers
- CRO
- Department Heads

### Step-by-Step: Create a Control

1. Navigate to **Controls**
2. Click **Create Control** (top right)
3. Complete the creation form:

| Field | Required | Description |
|-------|----------|-------------|
| **Name** | Yes | Clear, descriptive title |
| **Description** | No | What this control does |
| **Control Type** | Yes | Preventive, Detective, Corrective |
| **Control Class** | No | Manual, Automated, Hybrid |
| **Frequency** | Yes | How often to execute |
| **Department** | Yes | Which department owns it |
| **Control Owner** | Yes | Person responsible |

4. Click **Create Control**

### Control Types

| Type | Purpose | Example |
|------|---------|---------|
| **Preventive** | Stop issues before they occur | Access controls, approval workflows |
| **Detective** | Identify issues when they occur | Monitoring, audits, reconciliations |
| **Corrective** | Fix issues after they occur | Incident response, remediation |

---

## Editing Control Details

### Opening a Control for Editing

1. Navigate to **Controls**
2. Click on the control name to open detail page
3. Click **Edit** to modify

### Sensitive Field Changes

Some changes require approval:

| Field | Requires Approval? |
|-------|-------------------|
| Name, Description | No |
| Control Type, Class | No |
| Frequency | No |
| **Control Owner** | Yes ⚠️ |
| **Department** | Yes ⚠️ |

### Linked to High-Risk?

> [!IMPORTANT]
> If your control is linked to a **high-risk or priority risk**, all edits require privileged approval (CRO or Risk Manager).

---

## Logging Control Executions

Control execution logging records when controls are performed.

### Who Can Log Executions

You need **controls:execute** permission:
- **Control Owner**: Can log their own controls (even cross-department)
- **Department Members**: Can log department controls
- **Privileged Users**: Can log any control

### How to Log an Execution

1. Open the control detail page
2. Click **Log Execution** button
3. Complete the form:

| Field | Required | Description |
|-------|----------|-------------|
| **Execution Date** | Yes | When the control was performed |
| **Performed By** | Auto | Your user (auto-filled) |
| **Notes** | No | Description of what was done |
| **Evidence** | No | Attach supporting documentation |
| **Status** | Yes | Completed, Partial, Failed |

4. Click **Submit**

### Execution Status

| Status | Meaning |
|--------|---------|
| **Completed** | Control fully executed as designed |
| **Partial** | Control partially completed |
| **Failed** | Control could not be executed |

### Viewing Execution History

1. Open the control detail page
2. Scroll to **Execution Log** section
3. View chronological history of all executions

---

## Control Frequency and Scheduling

### Understanding Frequency

Frequency indicates how often a control should be executed:

| Frequency | Meaning | Example |
|-----------|---------|---------|
| **Daily** | Every business day | Daily reconciliation |
| **Weekly** | Once per week | Weekly review meeting |
| **Monthly** | Once per month | Monthly audit |
| **Quarterly** | Once per quarter | Quarterly risk assessment |
| **Annually** | Once per year | Annual policy review |
| **Ad-hoc** | As needed | Incident response |

### Overdue Controls

If a control hasn't been executed within its frequency period:
- It may appear as "Overdue" on dashboards
- Control Owner receives reminders
- Risk Managers can see overdue controls in reports

### Best Practices

1. **Set realistic frequencies**: Don't set daily if weekly is sufficient
2. **Log promptly**: Record executions soon after completion
3. **Include details**: Notes and evidence help during audits
4. **Review periodically**: Adjust frequency if circumstances change

---

## Linking Controls to Risks

Controls mitigate risks. Linking shows the relationship.

### Linking from Control to Risk

1. Open the control detail page
2. Scroll to **Linked Risks** section
3. Click **Link Risk**
4. Search for and select the risk
5. Click **Link**

### Linking from Risk to Control

1. Open the risk detail page
2. Scroll to **Linked Controls** section
3. Click **Link Control**
4. Search for and select the control
5. Click **Link**

### Impact of Linking

When a control is linked to risks:
- The control appears on the risk's detail page
- If linked to a high-risk/priority risk, control edits require privileged approval
- Provides audit trail of risk mitigation

---

## Archiving and Restoring Controls

### Archiving

- Archiving is a soft-delete and preserves control history.
- Archived controls are hidden from default list/search views.
- Users with `controls:delete` can archive immediately; non-privileged users create approval requests.

### Restoring (Unarchive)

Users with **`controls:delete`** can restore archived controls from:
- Control detail page (Unarchive action)
- Control list/search rows when archived items are visible

Restoring sets control status back to **Active**.

---

## Quick Reference

### Control Actions Summary

| Action | Who Can Do It | Approval Needed? |
|--------|---------------|------------------|
| View controls | All (scoped by department) | No |
| Create control | Users with controls:write | No |
| Edit control (basic fields) | Owner or Risk Manager | No |
| Edit sensitive fields (owner/dept) | Anyone with access | Yes |
| Edit control linked to high-risk | Anyone with access | Yes (privileged) |
| Log execution | Owner or department member | No |
| Link/unlink to risk | Users with write access | No |
| Archive control | Users with `controls:delete` | Non-privileged: Yes |
| Restore archived control | Users with `controls:delete` | No |

---

## Next Steps

- [Key Risk Indicators](./kris.md) - Monitor risks with measurable indicators
- [Dashboard & Reports](./dashboard.md) - View control status in reports

---

*Questions about control execution? Contact your Control Owner or Risk Manager.*
