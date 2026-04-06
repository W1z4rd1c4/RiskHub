# Lint Ratchet Status

## Required Sections

- Current hard-gate scope: `backend/app`
- Informational scope: `backend`
- Last updated: `2026-04-06`

## Ratchet Classes

| date | rule class | total hits | hard-gate scope | informational scope | status |
| --- | --- | ---: | --- | --- | --- |
| 2026-02-15 | E712 | 0 | backend/app | backend | green |
| 2026-02-15 | E402 | 0 | backend/app | backend | green |
| 2026-02-15 | E501 | 0 | backend/app | backend | green |
| 2026-04-06 | UP | 0 | phase-252 touched backend files | n/a | green |
| 2026-04-06 | SIM | 0 | phase-252 touched backend files | n/a | green |

## Notes

- `E712`, `E402`, and `E501` are enforced in hard-gate scope with zero counts.
- Phase 252 adds a touched-file-only `UP`/`SIM` hard gate for `app/core/activity_logger.py`, `app/core/activity_redaction.py`, `app/bootstrap_runtime.py`, `app/bootstrap_validation.py`, and any Python files under `app/core/settings/`.
- `B` is intentionally excluded from the Phase 252 ratchet because FastAPI dependency signatures currently make `B008` too noisy for a repo-wide hard gate.
- `E501` baseline was captured pre-ratchet and fully remediated in Sweep 6.
- Baseline evidence files:
  - `docs/quality/baseline/e712-app.txt`
  - `docs/quality/baseline/e402-app.txt`
  - `docs/quality/baseline/e501-app.txt`
