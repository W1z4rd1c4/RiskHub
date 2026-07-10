# backend/scripts

## Purpose

Operational and migration entrypoints for backend-only maintenance tasks.

## Contents

- `__init__.py`
- `__pycache__/`
- `_ict_register_import_helpers.py`
- `add_granular_permissions.py`
- `bootstrap_sso_user.py`
- `check_positions.py`
- `e2e_mappings.py`
- `import_contracts.py`
- `import_ict_register_workbook.py`
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
- `import_ict_register_workbook.py` is the ONE-TIME ICT Register cutover import (issue #53): out-of-runtime, requires an explicit `DATABASE_URL`, reads the external workbook BUILDER's data module (`--source <dir>`, never the xlsx, openpyxl never imported), pushes every row through the service layer as the seeded risk manager, upserts by natural key (re-run converges, created=0), and `--verify` runs the read-only fidelity characterization against `build_expected.json`. Pure mapping/scaling helpers live in `_ict_register_import_helpers.py` (CI-safe tests: `tests/backend/pytest/test_ict_register_import_helpers.py`); the cutover evidence lives in `docs/dora-ict-register/cutover-record.md`.
- Keep this README updated when responsibilities or structure in this folder change.
