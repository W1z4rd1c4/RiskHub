# backend/app/core/_snapshot_metrics

## Purpose

Shared metric builders for dashboard and aggregate snapshot surfaces.

## Contents

- `approvals.py` - approval snapshot metrics.
- `kri.py` - KRI snapshot metrics.
- `orphaned.py` - orphaned-item snapshot metrics.
- `risk_control.py` - risk and control snapshot metrics.
- `vendors.py` - vendor snapshot metrics.

## Notes

Keep snapshot calculations side-effect free. API modules should call these helpers rather than duplicating aggregate metric logic.
