# Key Risk Indicators (KRIs)

> **Who uses this**: Risk Managers, Reporting Owners, Risk Owners, Employees

---

## Table of Contents

1. [Understanding KRIs](#understanding-kris)
2. [Viewing KRI Status](#viewing-kri-status)
3. [Submitting KRI Values](#submitting-kri-values)
4. [Understanding Breach Alerts](#understanding-breach-alerts)
5. [KRI History and Trends](#kri-history-and-trends)
6. [Correcting KRI Values](#correcting-kri-values)
7. [Exporting KRIs](#exporting-kris)

---

## Understanding KRIs

### What is a KRI?

A **Key Risk Indicator (KRI)** is a measurable metric that tracks a risk over time. KRIs help you:
- Monitor risk levels proactively
- Identify emerging issues before they become problems
- Demonstrate risk management to auditors

### KRI Structure

Each KRI has:

| Component | Description |
|-----------|-------------|
| **Name** | What is being measured |
| **Linked Risk** | The risk this KRI monitors |
| **Reporting Period** | How often values are submitted (daily, weekly, monthly, etc.) |
| **Unit** | Measurement type (%, count, currency, etc.) |
| **Thresholds** | Limits that define normal vs. concerning values |
| **Reporting Owner** | Person responsible for submitting values |

### Thresholds and Limits

KRIs typically have three zones:

| Zone | Meaning | Action |
|------|---------|--------|
| **Green** | Within acceptable limits | Continue monitoring |
| **Amber** | Approaching threshold | Review and prepare response |
| **Red** | Breach - exceeds limits | Immediate attention required |

---

## Viewing KRI Status

### Accessing Risk Appetite

1. Click **Risk Appetite** in the sidebar
2. View KRIs organized by linked risk

### KRI Dashboard

The Risk Appetite page shows:

| Column | Description |
|--------|-------------|
| **KRI Name** | Indicator name and description |
| **Current Value** | Most recently submitted value |
| **Status** | Green/Amber/Red indicator |
| **Last Updated** | When value was submitted |
| **Due Date** | Next submission deadline |
| **Reporting Owner** | Who should submit |

### Filtering KRIs

Filter by:
- **Status**: All, Within, Breach, Overdue, or Archived
- **Reporting Period**: Daily, Weekly, Monthly, etc.
- **Department**: Your area or all
- **Owner**: Your KRIs only

### Finding Your KRIs

To see KRIs assigned to you:
1. Click the filter icon
2. Select "My KRIs" or filter by your name as Reporting Owner
3. View your submission responsibilities

---

## Submitting KRI Values

### Who Can Submit

You need **kri:submit** permission:
- **Reporting Owner**: Primary submitter
- **Risk Owner** (fallback): If no Reporting Owner assigned
- **Privileged Users**: Can submit for any KRI

### How to Submit a Value

1. Navigate to **Risk Appetite**
2. Find your KRI
3. Click **Submit Value** (or click the KRI to open detail page)
4. Enter the value and supporting information:

| Field | Required | Description |
|-------|----------|-------------|
| **Value** | Yes | The measured value |
| **Measurement Date** | Yes | Date of measurement |
| **Notes** | No | Context or explanation |
| **Evidence** | No | Supporting documentation |

5. Click **Submit**

### Submission Approval

Most submissions are immediate, but:

> [!IMPORTANT]  
> If the KRI is linked to a **high-risk or priority risk**, your submission may require approval before the value is recorded.

Check your Workflow page for pending approvals.

### Submission Reminders

As deadlines approach:
1. You'll receive an in-app notification
2. The KRI will show "Due Soon" status
3. If overdue, escalation to Risk Owner and CRO

---

## Understanding Breach Alerts

### What Triggers a Breach?

A breach occurs when a submitted value exceeds defined thresholds:

| Threshold Type | Description |
|----------------|-------------|
| **Upper Limit** | Value is too high (e.g., error rate > 5%) |
| **Lower Limit** | Value is too low (e.g., coverage < 80%) |

### Breach Severity

| Severity | When It Occurs |
|----------|---------------|
| **Warning** | Approaching threshold (amber zone) |
| **Breach** | Exceeds threshold (red zone) |

### What Happens on Breach

1. **Notification**: Reporting Owner and Risk Owner alerted
2. **Dashboard Update**: KRI shows red status
3. **Escalation**: CRO and relevant stakeholders notified
4. **Audit Log**: Breach event recorded

### Responding to Breaches

When you see a breached KRI:

1. **Investigate** the cause
2. **Document** in the notes field
3. **Take action** per your risk response plan
4. **Monitor** subsequent values for improvement
5. **Report** to management as required

---

## KRI History and Trends

### Viewing Historical Values

1. Open the KRI detail page
2. Scroll to **History** or **Trend** section
3. View:
   - Chronological list of all submissions
   - Trend chart showing values over time
   - Threshold lines for context

### Understanding Trends

| Trend | Meaning |
|-------|---------|
| **Stable within limits** | Good - continue monitoring |
| **Trending toward threshold** | Caution - investigate |
| **Consistent breaches** | Action required - escalate |
| **Improving trend** | Positive - document success |

### Comparing Periods

For periodic KRIs (monthly, quarterly):
- Use the period selector to compare similar periods
- View quarter-over-quarter changes
- Identify seasonal patterns

---

## Correcting KRI Values

### When to Correct

You may need to correct a value if:
- Data entry error was made
- Source data was revised
- Calculation methodology changed

### How to Submit a Correction

1. Open the KRI detail page
2. Navigate to **History**
3. Click **Correct Value** on the entry to fix
4. Enter:
   - Corrected value
   - Reason for correction
5. Click **Submit Correction**

### Correction Approval

> [!IMPORTANT]  
> All KRI corrections require approval, typically from the CRO or Risk Manager.

This ensures audit trail integrity.

### After Correction

- Original value remains in history (marked as corrected)
- New value appears with correction timestamp
- Dashboard reflects corrected value
- Full audit trail preserved

---

## Exporting KRIs

Use the **Export** button on the Risk Appetite list page.

### Export Workflow

1. Open **Risk Appetite**
2. Click **Export**
3. Choose:
   - **Format**: Excel (`.xlsx`), PDF (`.pdf`), CSV (`.csv`)
   - **As of date**: defaults to today
4. Click **Export**

### Export Behavior

- Export follows current filters (status + search).
- Archived KRIs are exported only when **Status = Archived**.
- Output includes only KRIs you are allowed to view.

---

## Quick Reference

### KRI Actions Summary

| Action | Who Can Do It | Approval Needed? |
|--------|---------------|------------------|
| View KRIs | All (scoped by department/ownership) | No |
| Submit value | Reporting Owner, Risk Owner | Only for high-risk KRIs |
| View history | All with access | No |
| Correct value | Reporting Owner, Risk Owner | Yes (always) |

### Submission Deadlines by Reporting Period

| Period | Submission Deadline |
|--------|-------------------|
| Daily | By end of next business day |
| Weekly | By end of following Monday |
| Monthly | By 5th of following month |
| Quarterly | By 10th of following quarter |
| Annually | As defined by organization |

---

## Tips for Success

1. **Submit on time**: Late submissions may trigger escalations
2. **Include context**: Notes help others understand the value
3. **Watch for trends**: Don't wait for breaches—monitor patterns
4. **Keep evidence**: Documentation helps during audits
5. **Ask questions**: If unsure about methodology, consult Risk Manager

---

## Next Steps

- [Dashboard & Reports](./dashboard.md) - See KRI status on dashboards
- [Notifications & Approvals](./notifications.md) - Handle KRI alerts

---

*Questions about KRIs? Contact your Risk Manager or the KRI's Reporting Owner.*
