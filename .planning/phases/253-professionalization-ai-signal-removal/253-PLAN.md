# Phase 253: Professionalization & AI-Signal Removal

## Objective

Make the public engineering surface read like deliberate senior-engineer work by simplifying PR CI, collapsing backend indirection, unifying frontend route/auth conventions, and removing boilerplate repo noise without weakening RBAC, approval workflows, timezone handling, or Postgres-sensitive verification.

## Workstreams

1. Protected-path CI simplification and governance demotion.
2. Public repo-surface cleanup and planning registration.
3. Backend bootstrap collapse into `backend/app/main.py`.
4. Approval execution boundary cleanup and explicit runtime log-config application.
5. Frontend route/export unification and wrapper-page removal.
6. Frontend session/auth package consolidation and shared transport runtime.
7. Benchmark isolation and testing-doc updates.

## Required Verification

- `cd backend && venv/bin/pytest -q ../tests/backend/pytest/test_workflow_pin_validator.py ../tests/backend/pytest/test_app_factory_contracts.py ../tests/backend/pytest/test_production_contract_docs.py ../tests/backend/pytest/test_security_cidr.py ../tests/backend/pytest/test_log_rotation_config.py ../tests/backend/pytest/test_admin_logs.py ../tests/backend/pytest/test_approval_field_whitelist.py ../tests/backend/pytest/test_approval_edit_apply.py ../tests/backend/pytest/test_approvals.py ../tests/backend/pytest/test_approval_workflow.py`
- `cd frontend && npm run test:run`
- `cd frontend && npm run lint`
- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm run build`
- `make -f scripts/Makefile quality-repo-contracts`
- `make -f scripts/Makefile test`
- `TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub_test make -f scripts/Makefile test-postgres-ci`
