# Frequently Asked Questions

> **Quick answers to common questions about RiskHub**

---

## General Questions

### How do I change my password?

RiskHub uses your organization's single sign-on (SSO). Contact your IT department or Administrator to reset your password.

### Why can't I see certain risks/controls?

Your access is scoped by your role:
- **Department users**: See only your department's data
- **Privileged users**: See all data

If you need access to something outside your scope, contact your Administrator or CRO.

### How do I change my department assignment?

Department assignments are managed by Administrators. Contact your system administrator to request a change.

---

## Risk Management

### What's the difference between Gross and Net score?

| Score | What It Represents |
|-------|-------------------|
| **Gross** | Inherent risk before any controls or mitigation |
| **Net** | Residual risk after controls are applied |

### Why can't I edit this risk?

Common reasons:
1. **Not the owner**: You may not have edit permission
2. **Different department**: It's in another department
3. **Pending approval**: A change is already pending
4. **Priority risk**: All edits require approval

### What makes a risk "priority"?

A risk is marked as priority (⭐) by the Risk Owner or Risk Manager. Priority risks have extra governance:
- All edits require approval
- CRO/Risk Manager are notified of changes

### How do I delete a risk?

1. Open the risk detail page
2. Click **Archive** (soft delete)
3. If you're non-privileged, this creates an approval request
4. Once approved, the risk is archived

---

## Controls

### Who can log control executions?

You can log executions if you have `controls:execute` permission:
- Control Owner (can log their own controls)
- Department members (for department controls)
- Risk Managers (for any control)

### Why is my control marked as "overdue"?

The control hasn't been executed within its defined frequency period. Log an execution to clear the overdue status.

### How do I link a control to a risk?

1. Open either the risk or control detail page
2. Find the **Linked Controls** or **Linked Risks** section
3. Click **Link**
4. Search and select the item
5. Click **Confirm**

---

## Key Risk Indicators (KRIs)

### When should I submit my KRI value?

Check your KRI's reporting period:
| Period | Submit by... |
|--------|-------------|
| Daily | End of next business day |
| Weekly | Monday of following week |
| Monthly | 5th of following month |
| Quarterly | 10th of following quarter |

### What if I submitted the wrong value?

1. Open the KRI detail page
2. Navigate to History
3. Click **Correct Value** on the entry
4. Enter the correct value and reason
5. Submit (requires approval)

### What happens when a KRI breaches?

1. The KRI shows red status on dashboards
2. You (as Reporting Owner) receive a notification
3. Risk Owner and CRO are alerted
4. The breach is logged for audit purposes

### I'm not the Reporting Owner—can I still submit?

- If you're the Risk Owner of the linked risk: Yes
- If you're a privileged user: Yes
- Otherwise: Contact the Reporting Owner or Risk Manager

---

## Approvals

### My request has been pending for days. What should I do?

1. Check **Workflow → My Requests** for status
2. See who the approver is
3. Follow up with them directly
4. If urgent, contact your CRO or Risk Manager

### Why was my request rejected?

The rejection reason is shown in the request detail:
1. Go to **Workflow → My Requests**
2. Click on the rejected request
3. Read the rejection reason
4. Address the concern and resubmit if appropriate

### Can I approve my own requests?

No. This is prevented by design (separation of duties). Your requests automatically escalate to the next appropriate approver.

### Who approves what?

| Request Type | Primary Approver | Escalation |
|--------------|------------------|------------|
| Risk changes | Risk Owner | Dept Head → CRO |
| Control changes | Risk Owner of linked risk | Dept Head → CRO |
| KRI changes | Risk Owner of linked risk | Dept Head → CRO |
| High-risk/Priority | Dept Head | CRO/Risk Manager |

---

## Notifications

### I'm not receiving notifications. What's wrong?

1. Check Settings → Notifications (ensure enabled)
2. Check your email spam folder (if using email notifications)
3. Verify you have the correct role/permissions
4. Contact your Administrator if issues persist

### How do I clear all notifications?

1. Click the bell icon 🔔
2. Click **Mark All Read** at the bottom of the panel

### Can I turn off certain notifications?

Yes, if notification preferences are enabled:
1. Go to **Settings → Notifications**
2. Toggle off the types you don't want
3. Save changes

---

## Reports & Exports

### Why is my export empty?

Check if:
1. Your filters are too restrictive
2. You don't have access to any matching data
3. The date range excludes all items

### Can I schedule automatic reports?

Currently, reports are generated on-demand. Scheduled reporting is planned for a future release.

### Why does exported Excel/CSV look different than the screen?

This is expected. Exports are structured for reporting and data processing, not visual parity with cards/charts. The underlying values should match your filtered view and access scope.

---

## Technical Issues

### The page isn't loading correctly

Try these steps:
1. **Refresh the page** (Ctrl/Cmd + R)
2. **Clear your browser cache**
3. **Try a different browser** (Chrome, Firefox, Edge)
4. **Check your internet connection**
5. **Contact your Administrator** if issues persist

### I got an error message

1. Note the error message (or take a screenshot)
2. Try the action again
3. If it persists, report to your Administrator with:
   - What you were trying to do
   - The exact error message
   - Time it occurred

### The system is slow

1. Check your internet connection
2. Try during off-peak hours
3. Report to your Administrator if consistently slow

---

## Getting Help

### Who should I contact?

| Issue | Contact |
|-------|---------|
| Password/Login | IT Helpdesk |
| Role/Permission changes | Administrator |
| Risk methodology questions | Risk Manager or CRO |
| Feature requests | Administrator or CRO |
| Technical problems | Administrator |

### Is there in-app help?

Yes:
1. Go to **Settings → Help & Docs**
2. Browse guides for your role
3. Click any guide to read inline

### Where can I learn more?

- This user guide (docs/user/)
- Administrator guide (docs/admin/) - for advanced topics
- Business Logic reference (docs/BUSINESS_LOGIC.md) - for technical details

---

## Quick Reference Card

| To do this... | Go here... |
|---------------|-----------|
| Submit KRI value | Risk Appetite → Select KRI → Submit |
| Log control execution | Controls → Select Control → Log Execution |
| Create a risk | Risks → Create Risk |
| Check my pending tasks | Workflow |
| See my notifications | Bell icon 🔔 |
| Export data | Any list page → Export button |
| Change settings | Settings |

---

*Can't find your answer? Contact your Risk Manager or system Administrator.*
