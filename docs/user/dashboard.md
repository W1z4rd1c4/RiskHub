# Dashboard & Reports

> **Who uses this**: All users with dashboard access

---

## Table of Contents

1. [Executive Dashboard](#executive-dashboard)
2. [Department View](#department-view)
3. [Risk Matrix Navigation](#risk-matrix-navigation)
4. [Quarterly Comparison](#quarterly-comparison)
5. [Exporting Reports](#exporting-reports)

---

## Executive Dashboard

The Dashboard is your home screen, providing organization-wide visibility into risk status.

### Accessing the Dashboard

Click **Dashboard** in the sidebar—it's the first item and your default landing page.

### Dashboard Sections

| Section | What It Shows |
|---------|---------------|
| **Risk Summary** | Total active risks, by category and severity |
| **Risk Heatmap** | Visual 5×5 matrix of risk distribution |
| **Top Risks** | Highest net score risks requiring attention |
| **KRI Status** | Key indicators with breach alerts |
| **Control Status** | Control execution summary |
| **Pending Actions** | Your workflow items |

### Understanding Widgets

Each widget is interactive:
- **Click** on numbers to see the underlying list
- **Hover** over chart elements for details
- **Click through** heatmap cells to filter risks

---

## Department View

Department Heads and Employees see a department-focused dashboard.

### Department Filter

If you have department-scoped access:
1. Your dashboard automatically shows your department's data
2. Use the department dropdown to see other departments (if privileged)

### Department Metrics

| Metric | Description |
|--------|-------------|
| **Department Risks** | Count of risks owned by department |
| **Open Issues** | Risks requiring action |
| **KRI Status** | Department KRIs and breaches |
| **Pending Approvals** | Items awaiting department head approval |

### Department Cards

Click a department card to:
- View department detail page
- See all risks/controls/KRIs for that department
- View department head and team

---

## Risk Matrix Navigation

The risk heatmap is a powerful navigation tool.

### Reading the Matrix

```
          IMPACT →
    ┌─────────────────────────────────────┐
  P │  5 │ 10 │ 15 │ 20 │ 25 │  Critical
  R │  4 │  8 │ 12 │ 16 │ 20 │  High
  O │  3 │  6 │  9 │ 12 │ 15 │  Medium
  B │  2 │  4 │  6 │  8 │ 10 │  Low
    │  1 │  2 │  3 │  4 │  5 │  Low
    └─────────────────────────────────────┘
        1    2    3    4    5
```

Each cell shows:
- **Number**: Count of risks in that score
- **Color**: Severity (green → yellow → red)

### Interacting with the Matrix

1. **Click a cell** to see risks with that specific score
2. **View filtered list** showing all risks in that cell
3. **Click a risk** to open its detail page

### Gross vs Net View

Toggle between:
- **Gross Risk**: Inherent risk before controls
- **Net Risk**: Residual risk after controls

---

## Quarterly Comparison

Track how your risk profile changes over time.

### Accessing Quarterly View

1. From Dashboard, look for the **Quarterly Comparison** widget
2. Or navigate to **Governance** for detailed historical analysis

### What's Compared

| Metric | Description |
|--------|-------------|
| **Total Risks** | Count this quarter vs. previous |
| **High-Risk Count** | Number of high/critical risks |
| **Mean Net Score** | Average risk severity |
| **KRI Breaches** | Breach events per quarter |
| **Mitigated Risks** | Risks successfully reduced |

### Understanding Trends

| Trend | Indicator | Meaning |
|-------|-----------|---------|
| 📈 Increasing | Red arrow up | More risks or higher scores |
| 📉 Decreasing | Green arrow down | Fewer risks or lower scores |
| ➡️ Stable | Gray | No significant change |

---

## Exporting Reports

Generate downloadable reports from your data.

### Available Export Formats

| Format | Use Case |
|--------|----------|
| **Excel** | Structured reporting and further processing |
| **CSV** | Lightweight export for quick sharing/import |

### Exporting from Dashboard

1. Click the **Export** button (top right of dashboard)
2. Dashboard summary downloads as **Excel**

### Exporting from List Pages

Each list page (Risks, Controls, KRIs) has export:

1. Apply any filters you want
2. Click **Export** button
3. Choose **Excel** or **CSV**
4. Filtered data is exported

### What's Included in Exports

**Excel Reports:**
- Raw data with all columns
- Summary sheet
- Metadata (filters applied, date, user)

### Export Tips

1. **Filter first**: Export only what you need
2. **Check access**: You can only export data you can see
3. **Note date**: Reports are snapshots of current data
4. **Mark confidential**: Risk data should be handled securely

---

## Quick Reference

### Dashboard Widgets at a Glance

| Widget | Click Action |
|--------|--------------|
| Risk count | Opens risk list filtered by status |
| Heatmap cell | Opens risks in that score range |
| Top Risks list | Opens risk detail page |
| KRI Status | Opens Risk Appetite page |
| Pending Actions | Opens Workflow page |

### Export Locations

| Data | Where to Export |
|------|-----------------|
| Full dashboard | Dashboard → Export |
| Risk register | Risks → Export |
| Control inventory | Controls → Export |
| KRI report | Risk Appetite → Export |
| Activity log | Activity Log → Export |

---

## Next Steps

- [Notifications & Approvals](./notifications.md) - Handle pending actions
- [FAQ](./faq.md) - Common questions answered

---

*For executive risk committee reports, contact your CRO or Risk Manager.*
