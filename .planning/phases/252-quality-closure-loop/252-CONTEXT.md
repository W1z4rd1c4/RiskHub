# Phase 252 Context: Quality Closure Loop

## Objective

Close the remaining current quality issues without reopening the backend architecture work that was substantially completed on 2026-04-05 and 2026-04-06.

## Surviving Relevant Items

1. Audit log redaction remains too permissive in `backend/app/core/activity_logger.py`.
2. `frontend/src/components/KRIForm.tsx` remains a large mixed-responsibility form component.
3. `frontend/src/components/VendorForm.tsx` remains a large mixed-responsibility form component.
4. `frontend/src/pages/IssueDetailPage.tsx` still mixes route state, fetch logic, history loading, and rendering.
5. `frontend/src/pages/DashboardPage.tsx` still owns too much route orchestration.
6. `frontend/src/services/apiClient.ts` still combines request building, auth headers, error parsing, retry behavior, and blob downloads.
7. `frontend/src/services/adminApi.ts` is still an all-admin aggregate export instead of bounded modules behind a stable facade.
8. Frontend TypeScript safety rules remain intentionally softened and need to become blocking.
9. Backend static typing does not yet have a blocking gate.
10. Backend/frontend coverage thresholds are not yet blocking.
11. `backend/app/bootstrap_validation.py` and `backend/app/core/settings/database.py` duplicate the default database URL.
12. `backend/app/bootstrap_runtime.py` still catches `BaseException` around Redis ping.
13. `backend/app/core/README.md` remains a generic placeholder.
14. `frontend/package.json` and `docker-compose.yml` still expose low-priority polish residue.

## Explicitly Out Of Scope

- `frontend/src/contexts/AuthContext.tsx`
- `frontend/src/contexts/auth/*`
- `frontend/src/services/session*`
- `frontend/src/services/ssoSession.ts`
- `backend/app/core/config.py`
- Broad backend bootstrap reshaping
- Repo-wide backend Ruff class expansion (`B`, repo-wide `UP`, repo-wide `SIM`)

## Local Structural Exemplars

- `frontend/src/components/control-form/*`
- `frontend/src/components/risk-form/*`
- `frontend/src/pages/VendorDetailPage.tsx`
- `frontend/src/pages/vendors/useVendorDetailState.ts`

## Execution Rules

- Run waves serially.
- Do not start the next wave until the current wave is green and summarized.
- Preserve public routes/imports unless a wave explicitly changes them.
- Keep top-level hotspot files as facades or orchestration layers only.
- Use typed hooks, selectors, helpers, and leaf components for extracted logic.
