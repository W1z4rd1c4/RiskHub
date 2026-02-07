# Managing Risks

> **Who uses this**: Risk Managers, Department Heads, Employees with risk access

---

## Table of Contents

1. [Viewing Risks](#viewing-risks)
2. [Creating a New Risk](#creating-a-new-risk)
3. [Editing Risk Details](#editing-risk-details)
4. [Risk Scoring](#risk-scoring)
5. [Linking Controls to Risks](#linking-controls-to-risks)
6. [Archiving Risks](#archiving-risks)

---

## Viewing Risks

### Accessing the Risk Register

1. Click **Risks** in the sidebar
2. The risk list shows all risks you have access to

### Understanding the Risk Table

| Column | Description |
|--------|-------------|
| **Name** | Risk title (click to open detail page) |
| **Department** | Which department owns this risk |
| **Owner** | Person responsible for this risk |
| **Status** | Active, Mitigated, or Archived |
| **Gross Score** | Risk score before controls |
| **Net Score** | Risk score after controls |
| **Priority** | ⭐ indicates priority risks |

### Filtering Risks

Use the filter bar to narrow your view:
- **Search**: Type to find by name or description
- **Department**: Filter by organizational unit
- **Status**: Show Active, Mitigated, or All
- **Include Archived**: Off by default; enable to include archived risks
- **Priority**: Show only priority risks
- **Risk Type**: Filter by category

### Grouped Views

Switch between views using the view toggle:
- **List**: Standard table view
- **By Department**: Grouped by department
- **By Status**: Grouped by status
- **Heatmap**: Visual matrix view

---

## Creating a New Risk

### Who Can Create Risks

You need **risks:write** permission, typically granted to:
- Risk Managers
- CRO
- Some Department Heads

### Step-by-Step: Create a Risk

1. Navigate to **Risks**
2. Click **Create Risk** (top right)
3. The creation wizard opens with 4 steps:

#### Step 1: Basic Information
| Field | Required | Description |
|-------|----------|-------------|
| **Name** | Yes | Clear, descriptive title |
| **Description** | No | Detailed explanation |
| **Risk Type** | Yes | Category (Strategic, Operational, etc.) |
| **Process** | No | Related business process |

#### Step 2: Assessment
| Field | Description |
|-------|-------------|
| **Probability** | Likelihood of occurrence (1-5) |
| **Impact** | Severity of consequences (1-5) |
| **Existing Controls** | Description of current mitigations |

The **Gross Score** is calculated automatically: Probability × Impact

#### Step 3: Mitigation
| Field | Description |
|-------|-------------|
| **Mitigation Strategy** | Planned actions to reduce risk |
| **Residual Probability** | Expected probability after mitigation |
| **Residual Impact** | Expected impact after mitigation |

The **Net Score** is calculated: Residual Probability × Residual Impact

#### Step 4: Ownership
| Field | Required | Description |
|-------|----------|-------------|
| **Department** | Yes | Which department owns this |
| **Risk Owner** | Yes | Person responsible |
| **Is Priority** | No | Mark as priority for escalated governance |

4. Review the summary and click **Create Risk**

### After Creation

Your new risk appears in the list immediately. You can:
- Edit to add more details
- Link controls to it
- Create KRIs for monitoring

---

## Editing Risk Details

### Opening a Risk for Editing

1. Navigate to **Risks**
2. Click on the risk name to open the detail page
3. Click **Edit** to modify

### Editing in the Wizard

The edit wizard works like creation, but with existing data pre-filled. Navigate between steps to modify different aspects.

### Sensitive Field Changes

Some changes require approval:

| Field | Requires Approval? |
|-------|-------------------|
| Name, Description | No |
| Probability, Impact | No (unless priority risk) |
| **Owner** | Yes ⚠️ |
| **Department** | Yes ⚠️ |
| **Category/Type** | Yes ⚠️ |
| **Is Priority (downgrade)** | Yes ⚠️ |
| Is Priority (upgrade) | No |

When you edit a sensitive field:
1. Your change creates an **approval request**
2. The change shows as "Pending"
3. An approver must approve before it takes effect

### Priority Risk Editing

> [!IMPORTANT]
> **Any edit** to a priority risk (marked with ⭐) requires approval, even non-sensitive fields.

This ensures extra governance for your organization's most important risks.

---

## Risk Scoring

### Understanding the 5×5 Matrix

RiskHub uses a standard 5×5 risk matrix:

**Probability Scale:**
| Level | Rating | Description |
|-------|--------|-------------|
| 5 | Almost Certain | Expected to occur in most circumstances |
| 4 | Likely | Will probably occur |
| 3 | Possible | Might occur at some time |
| 2 | Unlikely | Not expected but possible |
| 1 | Rare | Exceptional circumstances only |

**Impact Scale:**
| Level | Rating | Description |
|-------|--------|-------------|
| 5 | Catastrophic | Severe, potentially existential impact |
| 4 | Major | Significant impact on objectives |
| 3 | Moderate | Noticeable impact requiring response |
| 2 | Minor | Limited impact, easily managed |
| 1 | Insignificant | Minimal impact |

### Gross vs Net Score

| Score Type | What It Measures |
|------------|------------------|
| **Gross Score** | Inherent risk before any controls or mitigation |
| **Net Score** | Residual risk after considering controls and mitigation |

**Example:**
- Gross: Probability 4 × Impact 5 = 20 (Critical)
- After mitigation: Probability 2 × Impact 3 = 6 (Medium)
- Net Score = 6

### Score Thresholds

| Net Score | Risk Level | Color |
|-----------|-----------|-------|
| 1-4 | Low | Green |
| 5-9 | Medium | Yellow/Amber |
| 10-14 | High | Orange |
| 15-25 | Critical | Red |

> [!NOTE]
> Your organization's CRO may have configured different thresholds. Check with your Risk Manager for exact values.

---

## Linking Controls to Risks

Controls are measures that mitigate risks. Link relevant controls to show how risks are being managed.

### Why Link Controls?

- Shows risk mitigation strategy
- Affects approval requirements (controls linked to high-risk require privileged approval)
- Provides traceability for audits

### How to Link Controls

1. Open the risk detail page
2. Scroll to **Linked Controls** section
3. Click **Link Control**
4. Search for the control by name
5. Select the control and click **Link**

### Unlinking Controls

1. In the Linked Controls section
2. Click the **unlink icon** (🔗) next to the control
3. Confirm removal

> [!TIP]
> Linking and unlinking controls doesn't require approval—but you need edit permission on the risk.

---

## Archiving Risks

Archiving removes a risk from active views while preserving its history for audit purposes.

### When to Archive

- Risk no longer exists
- Risk has been fully mitigated and closed
- Duplicate risk identified

### How to Archive

1. Open the risk detail page
2. Click **Archive** (or select from the menu)
3. **If you're a privileged user**: Archive happens immediately
4. **If you're non-privileged**: An approval request is created

### After Archiving

- Risk moves to "Archived" status
- Hidden from default views (enable **Include Archived** to see)
- All history preserved
- Linked controls remain linked (for audit trail)

### Restoring Archived Risks

Users with **`risks:delete`** permission can restore from:
- Risk detail page (Unarchive action)
- Risk list/search rows when archived items are visible

Restoring sets status back to **Active**.

---

## Quick Reference

### Risk Actions Summary

| Action | Who Can Do It | Approval Needed? |
|--------|---------------|------------------|
| View risks | All (scoped by department) | No |
| Create risk | Users with risks:write | No |
| Edit risk (basic fields) | Owner or Risk Manager | No |
| Edit sensitive fields | Anyone with access | Yes |
| Edit any field on priority risk | Anyone with access | Yes |
| Archive risk | Privileged: immediate; Others: approval | Yes (non-privileged) |

---

## Next Steps

- [Managing Controls](./controls.md) - Create controls to mitigate risks
- [Key Risk Indicators](./kris.md) - Monitor risks with KRIs

---

*Questions about risk scoring? Contact your Risk Manager or CRO.*
