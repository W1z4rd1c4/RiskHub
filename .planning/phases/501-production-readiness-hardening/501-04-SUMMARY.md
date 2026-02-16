# Plan 501-04 Summary: JWT/Auth Refactor to Remove `ecdsa` Chain

## Completed: 2026-02-16

### Scope Delivered

- Replaced `python-jose` usage with `PyJWT[crypto]` for backend token encode/decode and Entra RS256 verification.
- Preserved existing app-token claim contract (`sub`, `user_id`, `exp`) and auth behavior.
- Preserved SSO verification invariants: issuer/audience validation, tenant/domain checks, JWKS refresh-on-`kid` miss, and retry path.
- Removed runtime dependency path that pulled in vulnerable `ecdsa` via `python-jose`.

### Files Changed

| File | Change |
|------|--------|
| `backend/requirements.txt` | MODIFY |
| `backend/app/core/security.py` | MODIFY |
| `backend/app/api/deps.py` | MODIFY |
| `backend/app/middleware/logging_context.py` | MODIFY |
| `backend/app/services/sso_token_service.py` | MODIFY |
| `backend/tests/test_sso_token_service.py` | MODIFY |

### Verification

- `cd backend && ./venv/bin/pytest -q tests/test_sso_token_service.py tests/test_sso_exchange.py tests/test_users.py` → passed
- `cd backend && ./venv/bin/python -m pip_audit -r requirements.txt` → passed (`No known vulnerabilities found`)

### Outcome

Backend JWT and SSO verification internals were hardened without functional contract regressions and without `python-jose` runtime exposure.
