# Reports & Exports

> **Audience**: CRO, Risk Manager, Compliance, Department Heads  
> **Location**: Various pages (export buttons)

---

## Table of Contents

1. [Available Reports](#1-available-reports)
2. [PDF Exports](#2-pdf-exports)
3. [Excel Exports](#3-excel-exports)
4. [Audit Trail Exports](#4-audit-trail-exports)
5. [Risk Committee Reports](#5-risk-committee-reports)
6. [Report Access Control](#6-report-access-control)
7. [Best Practices](#7-best-practices)

---

## 1. Available Reports

RiskHub provides comprehensive reporting across all entity types and activities.

### Report Categories

| Category | Reports | Primary Audience |
|----------|---------|------------------|
| **Risk Reports** | Risk Register, Risk Heatmap | CRO, Risk Manager |
| **Control Reports** | Control Inventory, Execution Log | Risk Manager, Department Heads |
| **KRI Reports** | KRI Status, Breach History | CRO, Risk Manager |
| **Audit Reports** | Activity Log, Audit Trail | Compliance, Internal Audit |
| **Governance Reports** | Approval History, Risk Committee | CRO, Board |

### Report Formats

All reports support multiple export formats:

| Format | Use Case | Features |
|--------|----------|----------|
| **PDF** | Formal documentation, printing, Board presentations | Styled, paginated, includes headers/footers |
| **Excel** | Data analysis, further processing | Raw data, multiple sheets, formulas-compatible |

---

## 2. PDF Exports

PDF exports are designed for formal reporting and documentation.

### Generating PDF Reports

#### Risk Register PDF

1. Navigate to **Risks** page
2. Apply desired filters (department, status, risk type)
3. Click **Export → PDF**
4. PDF generates with:
   - Cover page with date and filter criteria
   - Risk table with all visible columns
   - Summary statistics
   - Page numbers and timestamp

#### Control Inventory PDF

1. Navigate to **Controls** page
2. Apply filters as needed
3. Click **Export → PDF**
4. Includes:
   - Control details
   - Linked risks summary
   - Execution status

#### KRI Report PDF

1. Navigate to **Risk Appetite**
2. Click **Export → PDF**
3. Includes:
   - KRI values and thresholds
   - Breach indicators
   - Trend visualization (if applicable)

### PDF Styling

All PDFs include:
- RiskHub logo and branding
- Generation date and time
- User who generated the report
- Applied filter criteria
- Page X of Y footer
- Color-coded severity indicators

---

## 3. Excel Exports

Excel exports provide raw data for analysis and integration.

### Generating Excel Reports

1. Navigate to the desired page (Risks, Controls, KRIs)
2. Apply filters
3. Click **Export → Excel**
4. Download the `.xlsx` file

### Excel Structure

#### Risk Register Excel

| Sheet | Contents |
|-------|----------|
| **Risks** | All risk fields including IDs |
| **Summary** | Count by status, department, risk type |
| **Metadata** | Export date, filters applied, user |

Columns include:
- Risk ID, Name, Description
- Department, Owner, Status
- Probability, Impact, Gross Score, Net Score
- Category, Risk Type
- Is Priority, Created Date, Updated Date

#### Control Inventory Excel

| Sheet | Contents |
|-------|----------|
| **Controls** | All control fields |
| **Linked Risks** | Control-to-risk relationships |
| **Executions** | Recent execution log |
| **Metadata** | Export parameters |

#### KRI Export Excel

| Sheet | Contents |
|-------|----------|
| **KRIs** | KRI definitions and current values |
| **Values** | Historical value submissions |
| **Breaches** | Breach events with dates |
| **Metadata** | Export parameters |

### Working with Excel Data

Excel exports support:
- Filtering and sorting
- Pivot tables for analysis
- Charts from raw data
- Import into other systems

---

## 4. Audit Trail Exports

Audit trail exports provide compliance evidence and investigation data.

### Accessing Audit Trail Exports

1. Navigate to **Audit Trail** (Admin) or **Activity Log** (Risk Manager, Compliance)
2. Apply filters:
   - Date range
   - Action type (CREATE, UPDATE, DELETE, APPROVE, etc.)
   - Entity type (RISK, CONTROL, KRI, APPROVAL)
   - User
   - Department
3. Click **Export**
4. Choose **PDF** or **Excel**

### Audit Trail PDF

Formatted for compliance documentation:
- Chronological event list
- User names and timestamps
- Action descriptions
- Change details (for UPDATE actions)
- Digital signature information

### Audit Trail Excel

Raw data for analysis:
- All log fields
- JSON change data expanded
- Filterable columns
- Suitable for SIEM import

### Audit Data Fields

| Field | Description |
|-------|-------------|
| `timestamp` | ISO 8601 format datetime |
| `user_id` | Numeric user ID |
| `user_name` | Display name |
| `action` | CREATE, UPDATE, ARCHIVE, APPROVE, REJECT, CANCEL |
| `entity_type` | RISK, CONTROL, KRI, KRI_VALUE, APPROVAL |
| `entity_id` | Numeric entity ID |
| `entity_name` | Display name at time of action |
| `description` | Human-readable description |
| `changes` | JSON diff (for UPDATE actions) |
| `client_ip` | Source IP address |

### Change Tracking Format

For UPDATE actions, changes are stored as:

```json
{
  "field_name": {
    "old": "previous_value",
    "new": "new_value"
  },
  "another_field": {
    "old": 5,
    "new": 10
  }
}
```

---

## 5. Risk Committee Reports

### Risk Committee Dashboard

The Governance section provides executive-ready reports for Risk Committee meetings.

### Accessing Risk Committee

1. Navigate to **Governance** in the sidebar
2. Available to: CRO, Risk Manager, Compliance, Executives

### Dashboard Components

| Component | Description |
|-----------|-------------|
| **Executive Summary** | High-level risk metrics |
| **Risk Heatmap** | Visual 5×5 matrix distribution |
| **Top 10 Risks** | Highest net score risks |
| **Trend Analysis** | Quarter-over-quarter changes |
| **KRI Breach Summary** | Current breaches and patterns |
| **Pending Actions** | Outstanding approvals and items |

### Meeting Mode

The Risk Committee dashboard includes a **Meeting Mode** for presentations:

1. Click **Meeting Mode** toggle
2. Dashboard expands to full screen
3. Optimized for projector/screen sharing
4. Click through sections for presentation

### Exporting Risk Committee Report

1. From Governance dashboard
2. Click **Export Report**
3. Choose format:
   - **Board Pack PDF**: Formatted for board distribution
   - **Excel Data**: Raw data supporting the dashboard
4. Report includes:
   - Current quarter metrics
   - Year-over-year comparison
   - Key risk changes since last meeting
   - Recommendations (if entered)

---

## 6. Report Access Control

Reports respect RiskHub's role-based access control.

### Access Matrix

| Role | Risk Reports | Control Reports | Audit Trail | Risk Committee |
|------|--------------|-----------------|-------------|----------------|
| CRO | ✅ All | ✅ All | ✅ All | ✅ Full |
| Risk Manager | ✅ All | ✅ All | ✅ All | ✅ Full |
| Compliance | ✅ Read | ✅ Read | ✅ All | ✅ Read |
| Internal Audit | ✅ Read | ✅ Read | ✅ All | ✅ Read |
| Department Head | ✅ Department | ✅ Department | ❌ | ❌ |
| Employee | ✅ Department | ✅ Department | ❌ | ❌ |
| Admin | ❌ | ❌ | ✅ Technical | ❌ |

### Data Scoping in Reports

- **Global scope users**: Reports include all data
- **Department scope users**: Reports limited to their department data
- **Cross-department owners**: Include owned items even if different department

### Sensitive Data Handling

Reports automatically:
- Exclude archived/deleted items (unless filtered to include)
- Respect field-level permissions
- Include generation metadata for audit

---

## 7. Best Practices

### Report Generation

1. **Apply filters first**: Generate focused reports rather than everything
2. **Use date ranges**: Especially for audit trails and trend analysis
3. **Document purpose**: Note why the report was generated (for audit)

### Report Distribution

1. **Mark as confidential**: Risk reports contain sensitive data
2. **Secure transmission**: Use encrypted email or secure file sharing
3. **Limit distribution**: Only share with those who need access
4. **Track distribution**: Log who received which reports

### Report Retention

| Report Type | Recommended Retention |
|-------------|----------------------|
| Risk Register snapshots | 7 years |
| Audit Trail exports | 7+ years (regulatory requirement) |
| Risk Committee packs | Life of company + 5 years |
| Operational reports | 3 years |

### Scheduled Reports (Future Enhancement)

> [!NOTE]
> Scheduled report generation is planned for a future release. Currently, all reports are generated on-demand.

### Common Report Use Cases

| Use Case | Report | Format | Frequency |
|----------|--------|--------|-----------|
| Board Meeting | Risk Committee Dashboard | PDF | Quarterly |
| Regulatory Filing | Risk Register + Audit Trail | Excel | Annual |
| Internal Audit | Activity Log + Approvals | Excel | As needed |
| Department Review | Department Risks/Controls | PDF | Monthly |
| Incident Investigation | Audit Trail (filtered) | Excel | As needed |

---

## Quick Reference

### Export Locations

| Data | Page | Export Button |
|------|------|---------------|
| Risk Register | Risks | Top right |
| Control Inventory | Controls | Top right |
| KRI Report | Risk Appetite | Top right |
| Activity Log | Activity Log | Top right |
| Audit Trail | Audit Trail | Top right |
| Risk Committee | Governance | Export Report |

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Export to PDF | `Ctrl/Cmd + P` (some browsers) |
| Download Excel | Click Export → Excel |
| Print Preview | `Ctrl/Cmd + Shift + P` |

---

## Troubleshooting

### Report Won't Generate

1. **Check filters**: Too narrow filters may return no data
2. **Check permissions**: Ensure you have access to the data
3. **Check browser**: Pop-up blockers may prevent download
4. **Check size**: Very large reports may timeout → use filters

### Data Mismatch

1. **Check filter criteria**: Ensure expected items match filters
2. **Check date range**: Historical data may be outside range
3. **Check status**: Archived items excluded by default
4. **Check scope**: Department-scoped users see limited data

### PDF Formatting Issues

1. **Check data length**: Very long text may be truncated
2. **Check special characters**: Some characters may not render
3. **Check page size**: Default is A4; adjust if needed

---

## Next Steps

- [Getting Started](./getting-started.md)
- [Configure Risk Hub](./riskhub-config.md)
- [Manage Users](./user-management.md)

---

*Reports are generated with current data. For historical snapshots, use date filters or scheduled exports.*
