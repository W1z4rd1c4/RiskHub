# Plan 252-08 Summary: Narrow Backend Cleanup and Polish

## Completed

- Deduplicated the default database URL constant by moving the shared production-default check onto `app.core.settings.database.DEFAULT_DATABASE_URL`.
- Updated `bootstrap_validation.py` to consume that canonical constant instead of carrying a duplicate value.
- Replaced the Redis connectivity `except BaseException:` path in `bootstrap_runtime.py` with `except Exception:` while preserving close-and-reraise behavior.
- Replaced the placeholder `backend/app/core/README.md` with a specific ownership guide for the backend core package.
- Gave `frontend/package.json` a real package identity: `riskhub-frontend@1.0.0`.
- Clarified at the top of `docker-compose.yml` that it is the local demo/dev topology and not the production deployment contract.
- Added README coverage for `tests/frontend/unit/src/pages/dashboard/` so docs-topology enforcement stays green after the dashboard split.

## Verification

- `cd backend && pytest -q ../tests/backend/pytest/test_log_rotation_config.py ../tests/backend/pytest/test_production_hardening.py ../tests/backend/pytest/test_bootstrap_split_contracts.py` -> `23 passed`
- `cd frontend && npm run lint && npx tsc --noEmit` -> passed
- `python3 scripts/check_docs_contract.py` -> passed
- `make -f scripts/Makefile docs-topology-consistency` -> passed

## Notes

- This wave deliberately stayed narrow and polish-focused; it did not widen backend architecture scope beyond the explicit Phase 252 cleanup list.
