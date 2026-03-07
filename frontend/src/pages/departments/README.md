# frontend/src/pages/departments

## Purpose

Department page support modules extracted for maintainability.

## Contents

- `departmentDetailColumns.tsx`

## Notes

Keep table column/result-icon helpers here to keep `DepartmentDetailPage.tsx` focused on page orchestration.

`departmentDetailColumns.tsx` must use the shared KRI monitoring-status metadata so
department KRI badges stay aligned with `/kris`, KRI detail, and risk detail.

The department KRI tab consumes the paginated department-KRI API response and uses
the filtered `total` for pagination when a canonical monitoring-status filter is active.
