# Phase 72 Plan 08: Full-Modality Cleanup Summary

**Closed RBAC bypasses for KRI value recording and control execution logging, and aligned planning/docs for the granular-permissions “full modality” model.**

## Accomplishments

- Enforced `controls:execute` at the legacy `/controls/{id}/executions` endpoints so the UI can’t bypass the new granular permission.
- Prevented KRI value changes via `PUT /kris/{id}` (value recording must go through `POST /kris/{id}/values` to preserve `kri:submit` independence).
- Updated planning docs and ignore rules for Phase 72 continuity (restored 72-09/10/11 plan files; updated ROADMAP/STATE; ignored local artifacts).

## Files Created/Modified

- `.gitignore` - Ignore runtime logs and local debug artifacts.
- `.planning/ROADMAP.md` - Phase 72 plan descriptions updated; removed stray Phase 19 entry.
- `.planning/STATE.md` - Phase 72 plan description updated for 72-08.
- `.planning/phases/72-risk-hub-resolution/72-09-PLAN.md` - Restored.
- `.planning/phases/72-risk-hub-resolution/72-10-PLAN.md` - Restored.
- `.planning/phases/72-risk-hub-resolution/72-11-PLAN.md` - Restored.
- `backend/app/api/v1/endpoints/controls.py` - Require `controls:execute` for execution logging + enforce department access.
- `backend/app/api/v1/endpoints/kris.py` - Reject `current_value` updates via `PUT /kris/{id}` to avoid bypassing `kri:submit`.
- `frontend/src/components/kri/KRIModal.tsx` - Disable/omit `current_value` on edit (use “Record Value” flow).
- `backend/tests/conftest.py` - Ensure test env sets `DEBUG`/`SECRET_KEY` early so imports don’t fail.
- `backend/tests/test_kris_history_api.py` - Added regression for `PUT /kris/{id}` current_value rejection + history creation via `/values`.
- `backend/scripts/add_granular_permissions.py` - Added `--database-url` override and clearer operator guidance.

## Decisions Made

- KRI value recording is only via `POST /kris/{id}/values` (not `PUT /kris/{id}`), preserving `kri:submit` independence from `risks:write`.
- Control execution logging requires `controls:execute` on both `/executions` and `/controls/{id}/executions`.

## Issues Encountered

- Running `backend/scripts/add_granular_permissions.py` requires a configured `DATABASE_URL`; the default local URL fails auth in this environment.
- Repo still contains tracked rotated log files under `backend/logs/` that need to be removed from git tracking (requires git index write access).

## Next Step

- Complete the manual UI verification checkpoint in `./.planning/phases/72-risk-hub-resolution/72-08-PLAN.md`, then proceed with final git cleanup + commit.

