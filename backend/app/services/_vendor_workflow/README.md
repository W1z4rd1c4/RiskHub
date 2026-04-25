# backend/app/services/_vendor_workflow

## Purpose

Shared service-layer policy for vendor visibility, ownership exceptions, lifecycle authority, and report scoping.

## Contents

- `__init__.py`
- `policy.py`

## Notes

Vendor CRUD, vendor links, and vendor report exports should use this package for consistent department filtering and capability decisions.
