# Plan 252-12 Summary: Deterministic Migration Script Safety

## Completed

- Replaced `backend/scripts/migrate_risks.py` with a deterministic import command that:
  - requires `--input`
  - defaults to dry-run
  - parses column `F` as `name` and column `G` as `description`
  - matches non-reset apply rows by normalized `(process, subprocess, name)` instead of workbook-generated `risk_id_code`
  - preserves the existing `risk_id_code` for matched risks
  - creates unmatched non-reset rows using the canonical `generate_risk_id_code(...)` helper
  - only wipes existing risks/KRIs/control-risk links when `--allow-reset` is passed
- Replaced `backend/scripts/migrate_controls.py` with a deterministic import command that:
  - requires `--input`
  - defaults to dry-run
  - upserts by normalized control name
  - rebuilds control-risk links deterministically per imported control instead of clearing the full table by default
- Replaced `backend/scripts/migrate_kris.py` with a deterministic import command that:
  - requires `--input`
  - defaults to dry-run
  - upserts by `(risk_id, metric_name)`
  - removes the random fallback and fails closed on unmatched rows
- Added `backend/scripts/import_contracts.py` for shared JSON reporting across the migration scripts.
- Added focused backend regression coverage for:
  - dry-run non-destructiveness with identity-mode reporting
  - risk row reordering without ID/code corruption
  - inserted earlier workbook rows without renumbering existing risks
  - ambiguous DB matches failing the full run
  - duplicate workbook identities failing the full run
  - unmatched-KRI fail-closed behavior
- Updated `backend/scripts/README.md` to document the new migration-script safety contract.

## Verification

- `python3 -m py_compile backend/scripts/import_contracts.py backend/scripts/migrate_risks.py backend/scripts/migrate_controls.py backend/scripts/migrate_kris.py`
- `cd backend && pytest -q ../tests/backend/pytest/test_import_migration_contracts.py`
- `cd backend && pytest -q ../tests/backend/pytest/test_repo_hygiene_contracts.py`
- `uvx ruff check backend/scripts/import_contracts.py backend/scripts/migrate_risks.py backend/scripts/migrate_controls.py backend/scripts/migrate_kris.py tests/backend/pytest/test_import_migration_contracts.py`

## Notes

- The new import commands preserve a manual reset path for bulk replacement, but destructive behavior is no longer the default path.
- Non-reset risk import now treats `(process, subprocess, name)` as workbook identity; if an operator renames those fields, the importer treats that workbook row as a new risk unless `--allow-reset` is used.
- The KRI importer now treats unresolved matches as a hard error and emits them in the JSON report instead of assigning them to arbitrary risks.
