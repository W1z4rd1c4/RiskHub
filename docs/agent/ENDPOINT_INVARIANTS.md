# Endpoint Invariants

Canonical maintainability invariants for endpoint packaging and related schema caveats.

## Endpoint Package Splits (Maintainability)

- These endpoints are packages (not single files): `controls/`, `risks/`, `kris/`, `dashboard/`, `issues/`, `reports/`, `riskhub/`, `approvals/`, `departments/`, `users/`, `vendors/`, `admin/`, `risk_questionnaires/`.
- Invariant: `app.api.v1.endpoints.<name>.router` must remain the exported router object (see `backend/app/api/v1/endpoints/<name>/__init__.py`).
- FastAPI gotcha: if a subrouter defines routes at path `""` (for example `@router.get("")`), that router must be the exported base router (do not include it under an extra wrapper `APIRouter()`).

Required re-exports (stable import paths):
- `app.api.v1.endpoints.risks.generate_risk_id_code` (tests depend on it)
- `app.api.v1.endpoints.riskhub.get_cro_user` (used by `backend/app/api/v1/endpoints/riskhub_questionnaires.py`)
- `app.api.v1.endpoints.users.get_password_hash` (tests depend on it)

Risk ID generation re-export pin:
- Keep `app.api.v1.endpoints.risks.generate_risk_id_code` available from the
  risks package facade. `tests/backend/pytest/test_risks.py` and
  `tests/backend/pytest/test_risk_id_generation.py` intentionally import this
  stable path.

## Load-Bearing Single-File Endpoints

`backend/app/api/v1/endpoints/riskhub_questionnaires.py` is intentionally a
single-file endpoint module and must not be deleted during package-split
cleanup. It owns the live `POST /api/v1/riskhub/questionnaires/batch-send`
route.

Frontend caller chain verified on 2026-05-09:
- `frontend/src/components/riskhub/RiskQuestionnairesPanel.tsx:257` invokes `handleBatchSend`.
- `frontend/src/components/riskhub/riskQuestionnairePanelState.ts:170` calls `riskHubApi.batchSendQuestionnaires`.
- `frontend/src/services/riskHubApi.ts:308` posts to `/riskhub/questionnaires/batch-send`.
- `backend/app/api/v1/endpoints/riskhub_questionnaires.py:37` serves the batch-send route.

Presence lock:
- `tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py`

## SQLAlchemy FK Cycles (SQLite Tests)

- SQLite `Base.metadata.drop_all()` can warn if a foreign-key cycle exists.
- `Department.manager_id -> users.id` is marked with `use_alter=True` to break the `departments`/`users` cycle.

Verification date:
- 2026-05-09
