# Phase 501 Research: Hardening Findings and Execution Strategy

## Evidence Summary

1. Frontend build failed with strict TS errors centered on generic table constraints and related type surfaces.
2. Frontend had a high-severity `axios` advisory path.
3. Backend auth stack used `python-jose`, retaining an `ecdsa` vulnerability chain.
4. `backend/app/tests/test_role_restrictions.py` was stale and syntactically broken.
5. `backend/app/services/report_translations.py` was unreferenced dead code.
6. Backend lint enforcement was narrower than target scope (`app` only).
7. Security workflow used non-blocking scan behavior (`continue-on-error` + tolerant scan commands).

## Technical Approach

### Frontend compile restoration

- Fix generic table utilities to support `T extends object` with object-safe field access.
- Resolve strict TS issues in chart typing, markdown heading typing, frequency union handling, KRI modal callback compatibility, API params typing, i18n hook typing, and MSAL config typing.

### Vulnerability remediation

- Upgrade `axios` to non-vulnerable version and lock via `package-lock.json`.

### JWT/Auth refactor

- Replace `python-jose` encode/decode/verify with `PyJWT` APIs.
- Preserve HS256 app token behavior and RS256 Entra ID verification invariants (issuer/audience/tenant/domain + JWKS refresh on `kid` miss).
- Update tests to generate JWKs via `PyJWT`/`cryptography` compatibility APIs.

### Dead code cleanup

- Remove stale legacy test artifact and unreferenced report translation module.
- Re-run full backend suite to confirm no hidden references/regressions.

### Lint debt cleanup

- Apply automated Ruff fixes, then manual residual cleanup until zero findings in `tests` and `scripts`.

### CI gate hardening

- Add frontend `tsc --noEmit` and `npm run build` to lint workflow.
- Expand backend hard gate from `app` to `app tests scripts`.
- Make security scans blocking for actionable findings:
  - Bandit high-severity gate.
  - `pip-audit` gate using explicit allowlist file.
  - `npm audit --audit-level=high` gate.

## Verification Matrix

- Frontend:
  - `npm run lint -- --max-warnings=0`
  - `npx tsc --noEmit`
  - `npm run build`
  - `npm run test:run`
  - `npm audit --audit-level=high`
- Backend:
  - `./venv/bin/python -m ruff check app tests scripts`
  - `./venv/bin/pytest -q`
  - `./venv/bin/pytest -q tests/test_sso_token_service.py tests/test_sso_exchange.py tests/test_users.py tests/test_production_hardening.py`
  - `./venv/bin/bandit --ini .bandit -r app -f txt`
  - `./venv/bin/python -m pip_audit -r requirements.txt`
