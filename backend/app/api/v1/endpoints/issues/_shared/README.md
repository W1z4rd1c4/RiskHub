# backend/app/api/v1/endpoints/issues/_shared

## Purpose

API endpoint package for `issues` domain.

## Contents

- `__init__.py`
- `__pycache__/`
- `constants.py`
- `links.py`
- `loading.py`
- `serialization.py`
- `source.py`
- `validation.py`

## Notes

Keep this README updated when responsibilities or structure in this folder change. Issue notifications are outbox-only; endpoint shared helpers must not emit `NotificationService` side effects directly.
