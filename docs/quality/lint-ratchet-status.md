# Lint Ratchet Status

## Required Sections

- Current hard-gate scope: `backend/app`
- Informational scope: `backend`
- Last updated: `2026-04-07`

## Ratchet Classes

| date | rule class | total hits | hard-gate scope | informational scope | status |
| --- | --- | ---: | --- | --- | --- |
| 2026-02-15 | E712 | 0 | backend/app | backend | green |
| 2026-02-15 | E402 | 0 | backend/app | backend | green |
| 2026-02-15 | E501 | 0 | backend/app | backend | green |
| 2026-04-07 | UP | 0 | changed backend/app Python files | backend/app | green |
| 2026-04-07 | SIM | 0 | changed backend/app Python files | backend/app | green |

## Notes

- `E712`, `E402`, and `E501` are enforced in hard-gate scope with zero counts.
- `UP` and `SIM` now run as a changed-file ratchet for backend/app Python files resolved from git diff, with a full-tree fallback when the diff base cannot be determined.
- Blocking mypy now follows the same changed backend/app Python-file target set instead of a named remediation slice.
- A separate informational mypy lane tracks the full `backend/app` tree so broader typing debt stays visible without weakening changed-code enforcement.
- `B` is intentionally excluded from the Phase 252 ratchet because FastAPI dependency signatures currently make `B008` too noisy for a repo-wide hard gate.
- `E501` baseline was captured pre-ratchet and fully remediated in Sweep 6.
- Baseline evidence files:
  - `docs/quality/baseline/e712-app.txt`
  - `docs/quality/baseline/e402-app.txt`
  - `docs/quality/baseline/e501-app.txt`
