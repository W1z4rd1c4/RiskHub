# backend/app/api/v1/endpoints/users

## Purpose

API endpoint package for `users` domain.

## Contents

- `__init__.py`
- `__pycache__/`
- `_lifecycle.py`
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
- `_lifecycle.py` contains the Admin-only guard shared by lifecycle/detail helpers under `/users`.
- `directory.py` is the explicit paginated directory contract for `/users` directory mode.
- `_visibility.py` contains shared scope filtering used by both lookup and directory list flows.
- `lookup.py` keeps `/users/lookup` as the picker/search primitive, while `/users/roles` is now an Admin-only lifecycle helper.
- `crud.py` and `detail.py` remain user-lifecycle/admin-detail surfaces and should not absorb directory responsibilities.
- Active access-management role selection belongs to `/access/roles`, not to the lifecycle helpers in this package.
