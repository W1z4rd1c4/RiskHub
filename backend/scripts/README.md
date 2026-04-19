# backend/scripts

## Purpose

Operational and migration entrypoints for backend-only maintenance tasks.

## Contents

- `__init__.py`
- `__pycache__/`
- `add_granular_permissions.py`
- `bootstrap_sso_user.py`
- `check_positions.py`
- `e2e_mappings.py`
- `import_contracts.py`
- `migrate_controls.py`
- `migrate_kris.py`
- `migrate_risk_names.py`
- `migrate_risks.py`
- `report_pending_kri_approval_preflight.py`
- `revoke_refresh_sessions.py`
- `runtime/`
- `seed_all.py`
- `seed_controls.py`
- `seed_demo.py`
- `seed_departments.py`
- `...`

## Notes

- The workbook migration scripts now use a shared safety contract:
  - `--input <path>` is required
  - default mode is dry-run
  - `--apply` is required to persist changes
  - `--allow-reset` is required for destructive wipe-and-reload behavior
  - `--report <path>` writes a JSON reconciliation report
- `migrate_risks.py` uses two modes:
  - non-reset apply matches existing risks by normalized `(process, subprocess, name)`, preserves their existing `risk_id_code`, and creates only unmatched rows
  - reset apply (`--allow-reset`) rebuilds the full risk table and dependent KRI/control-link rows
- The canonical risk workbook mapping is:
  - column `F` -> risk `name`
  - column `G` -> risk `description`
- In non-reset risk import mode, changing `process`, `subprocess`, or `name` is treated as a new identity. Use `--allow-reset` if the workbook is intentionally redefining those identity fields.
- `report_pending_kri_approval_preflight.py` generates a JSON preflight report for pending KRI value approvals that would auto-reject under apply-time validation.
- Keep this README updated when responsibilities or structure in this folder change.
