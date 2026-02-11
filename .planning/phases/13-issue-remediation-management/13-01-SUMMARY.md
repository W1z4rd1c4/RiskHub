# 13-01 Summary - Findings and Issues Backend Foundation

## Delivered

### Data Model and Migrations

- Added issue domain models in `backend/app/models/issue.py`:
  - `Issue`
  - `IssueLink`
  - `IssueRemediationPlan`
  - `IssueException`
- Added non-native enums and constraints:
  - Issue severity/status/source enums
  - Remediation status enum
  - Exception status enum
  - `IssueLink` exactly-one-target check constraint
  - remediation progress range check
- Added indexing for list/report query patterns (status/severity, department/status, owner/status, due/status).
- Added migration `backend/alembic/versions/13a1b2c3d4e5_add_issue_management_tables.py`:
  - Creates issue tables and indexes
  - Extends activity entity type support for `issue`, `issue_remediation`, `issue_exception`
- Added model exports in `backend/app/models/__init__.py`.

### API and Schemas

- Added issue schemas in `backend/app/schemas/issue.py` and exports in `backend/app/schemas/__init__.py`.
- Added issue endpoints in `backend/app/api/v1/endpoints/issues.py` and router registration in `backend/app/api/v1/router.py`:
  - `GET /issues`
  - `POST /issues`
  - `GET /issues/{id}`
  - `PATCH /issues/{id}`
  - `POST /issues/{id}/links`
  - `DELETE /issues/{id}/links/{link_id}`
- Added backend scope enforcement and non-leaky `404` behavior for out-of-scope reads.

### RBAC Contract

- Added canonical issue permissions in `backend/app/db/rbac_seed_contract.py`:
  - `issues:read`
  - `issues:write`
  - `issues:approve`
- Preserved platform-admin data isolation (no business-data widening for `admin`).

### Regression Tests

- Added/updated backend regression tests in `backend/tests/api/v1/test_issues_api.py`:
  - CRUD and list coverage
  - scope behavior and non-leaky `404`
  - permission deny behavior
  - control-owner cross-department access path
  - link payload validation and constraints

## Verification Evidence

- `cd backend && pytest -q tests/api/v1/test_issues_api.py` → pass
- `cd backend && python3 -m compileall app` → pass

## Notes

- `python` executable was unavailable in this environment; compile verification was executed with `python3`.
