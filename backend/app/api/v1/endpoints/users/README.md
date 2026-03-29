# backend/app/api/v1/endpoints/users

## Purpose

API endpoint package for `users` domain.

## Contents

- `__init__.py`
- `__pycache__/`
- `_visibility.py`
- `crud.py`
- `detail.py`
- `directory.py`
- `lookup.py`
- `mock_auth.py`
- `org.py`
- `summary.py`

## Notes

Keep this README updated when responsibilities or structure in this folder change.

- `lookup.py` is the authenticated picker/search primitive used by forms and filters.
- `directory.py` is the explicit paginated directory contract for `/users` directory mode.
- `_visibility.py` contains shared scope filtering used by both lookup and directory list flows.
- `crud.py` and `detail.py` remain user-lifecycle/admin-detail surfaces and should not absorb directory responsibilities.
