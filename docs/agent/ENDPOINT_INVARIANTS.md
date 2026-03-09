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

## SQLAlchemy FK Cycles (SQLite Tests)

- SQLite `Base.metadata.drop_all()` can warn if a foreign-key cycle exists.
- `Department.manager_id -> users.id` is marked with `use_alter=True` to break the `departments`/`users` cycle.

Verification date:
- 2026-02-16
