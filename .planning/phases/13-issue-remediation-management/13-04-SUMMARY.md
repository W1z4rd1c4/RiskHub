# 13-04 Summary - Backend Contextual Creation + Vendor Linking

## Delivered

### Data Model + Migration

- Extended `IssueLink` with direct vendor support:
  - Added `vendor_id` FK and relationship in `backend/app/models/issue.py`.
  - Expanded exactly-one-target check constraint from 4 targets to 5 (risk/control/execution/kri/vendor).
- Added migration:
  - `backend/alembic/versions/13e6f7a8b9c0_extend_issue_links_with_vendor_context.py`
  - Adds `issue_links.vendor_id`, FK/index, and updated check constraint.

### API + Schema Contract

- Added `vendor_id` support across issue link schemas in `backend/app/schemas/issue.py`.
- Added contextual create request schema:
  - `IssueContextEntityTypeEnum`
  - `IssueContextualCreate`
- Added endpoint:
  - `POST /api/v1/issues/contextual`
- Added list filter:
  - `GET /api/v1/issues?linked_vendor_id=...`

### Context Resolution Rules

- Contextual source support: `risk`, `control`, `execution`, `kri`, `vendor`.
- Vendor department resolution behavior:
  - primary: `vendor.department_id`
  - fallback: vendor owner department
  - unresolved: `409` with explicit validation detail.
- Scope behavior remains non-leaky (`404` for inaccessible contextual sources).

### Serialization + Visibility

- Extended issue link serialization to include vendor-linked display behavior.
- Included vendor relation in issue eager-loading to avoid incomplete link display.

### Regression Coverage

- Added backend tests in `backend/tests/api/v1/test_issues_api.py` for:
  - contextual create success across all entity types
  - vendor department fallback path
  - unresolved vendor department failure (`409`)
  - scope-denied contextual source (`404`)
  - `linked_vendor_id` filtering
  - exactly-one-link validation including vendor dimension

## Verification Evidence

- `cd backend && alembic upgrade head` -> pass
- `cd backend && pytest -q tests/api/v1/test_issues_api.py` -> pass (24 tests)
- `cd backend && python3 -m compileall app` -> pass

## Notes

- Existing workflow state-machine behavior was preserved; this plan was backend-contract additive.
