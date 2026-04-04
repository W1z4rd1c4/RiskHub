# backend/app/api/v1/endpoints/auth

## Purpose

API endpoint package for `auth` domain.

## Contents

- `__init__.py`
- `__pycache__/`
- `_shared.py`
- `config.py`
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
