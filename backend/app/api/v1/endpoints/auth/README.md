# backend/app/api/v1/endpoints/auth

## Purpose

API endpoint package for `auth` domain.

## Contents

- `__init__.py`
- `__pycache__/`
- `_request_protection.py`
- `_shared.py`
- `config.py`
- `csrf.py`
- `demo.py`
- `logout.py`
- `me.py`
- `password.py`
- `refresh.py`
- `sso.py`

## Notes

Keep this README updated when responsibilities or structure in this folder change.

Security invariants:
- bearer auth accepts only RiskHub access tokens (`type=access`, `iss=riskhub`, `aud=riskhub-api`)
- refresh tokens remain cookie-only and must not authenticate API bearer requests
- `GET /auth/csrf` is the only explicit CSRF-seeding endpoint; refresh-session issuance also reissues the readable CSRF cookie
- cookie-authenticated `POST /auth/refresh` requires allowed Origin/Referer plus matching double-submit CSRF
- normal `POST /auth/logout` invalidates the full app session family for the resolved user, not only the current refresh row
