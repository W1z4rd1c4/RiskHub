# Reports & Exports

> **Audience**: CRO, Risk Manager, Compliance, Department Heads

## Overview

RiskHub reporting exports are now standardized to **Excel** and **CSV** formats.

Core rules:
- Exports are scoped to the requesting user's permissions.
- List exports (Risks, Controls, KRIs, Vendors) use the same export modal.
- Dashboard summary and Audit Trail exports are Excel-only.
- Vendor annual and DORA exports are Excel-only.

## Export Surfaces

### List Pages (Risks, Controls, KRIs, Vendors)

1. Open the list page.
2. Apply filters (status, search, type, etc.).
3. Click **Export**.
4. Choose **Excel (.xlsx)** or **CSV (.csv)**.
5. Choose **As of date**.
6. Export downloads immediately.

These exports call unified endpoints:
- `/api/v1/reports/risks/export`
- `/api/v1/reports/controls/export`
- `/api/v1/reports/kris/export`
- `/api/v1/reports/vendors/export`

Required query:
- `format=xlsx|csv`

Optional query:
- `as_of_date=YYYY-MM-DD`
- page-specific filters (`status`, `search`, etc.)

### Dashboard Summary

- Endpoint: `/api/v1/reports/summary/excel`
- Format: Excel only
- Scope: same department/RBAC scope as dashboard data

### Audit Trail

- Endpoint: `/api/v1/reports/audit-trail/excel`
- Format: Excel only
- Scope: same department/RBAC scope as audit views

### Vendor Reports

- Annual report: `/api/v1/vendor-reports/annual?year=YYYY&format=xlsx`
- DORA register: `/api/v1/vendor-reports/dora-register?format=xlsx`

## Access Control

Export authorization follows backend RBAC and scope rules:
- Non-privileged users are restricted to in-scope departments/entities.
- Privileged users can export across allowed global scopes.
- Ownership/reporting-owner exceptions apply where implemented in list/detail access.

## Operational Notes

- Exports are point-in-time snapshots based on selected `as_of_date` (where supported).
- Archived/inactive visibility follows status filters.
- CSV should be used for lightweight integrations; Excel for operational analysis/review packs.

## Troubleshooting

### Empty export

Check:
1. Current filters are not over-restrictive.
2. You have access to matching entities.
3. `as_of_date` does not exclude target records.

### Export denied

- Verify role permissions include `reports:read`.
- Verify department scope/access for requested filters.

### Format rejected

- Supported formats are only `xlsx` and `csv` for list exports.
