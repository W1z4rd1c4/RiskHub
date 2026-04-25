# backend/app/services/_access_workflow

## Purpose

Shared service-layer policy for access-user lifecycle and editable access fields.

## Contents

- `__init__.py`
- `policy.py`

## Notes

Keep endpoint-local access checks thin. User/admin routes should delegate target capability and editable-field decisions here.
