# backend/app/services/_vendor_governance

## Purpose

Business/service-layer logic for `_vendor_governance`.

## Contents

- `__init__.py`
- `__pycache__/`
- `contract_lifecycle.py`
- `contract_policy.py`
- `contract_projection.py`
- `lifecycle.py`
- `links.py`
- `policy.py`
- `projection.py`
- `reports.py`

The `contract_*` modules own the ICT Register Contracts inside the Vendor
domain (issue #44): `contract_lifecycle` owns commits via
`commit_service_boundary` and audit facts, `contract_policy` asserts
visibility/mutation rules (including the strict archived-Vendor 409 stance),
and `contract_projection` serializes reads with per-row capabilities.

## Notes

Keep this README updated when responsibilities or structure in this folder change.
