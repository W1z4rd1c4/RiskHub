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
- `sub_outsourcing_lifecycle.py`
- `sub_outsourcing_policy.py`
- `sub_outsourcing_projection.py`

The `contract_*` modules own the ICT Register Contracts inside the Vendor
domain (issue #44): `contract_lifecycle` owns commits via
`commit_service_boundary` and audit facts, `contract_policy` asserts
visibility/mutation rules (including the strict archived-Vendor 409 stance),
and `contract_projection` serializes reads with per-row capabilities.

The `sub_outsourcing_*` modules own the ICT Register Sub-outsourcing chains
under a Vendor (issue #45), split the same way. `sub_outsourcing_policy`
additionally asserts write-time chain integrity — the Contract belongs to the
Vendor, the predecessor stays in the same Vendor + Contract, and
self-references/cycles are rejected 422 — the invariant the #49 Rank
recursion relies on. Authorization reuses the `vendor_contracts` resource
(the same governed surface: the fourth-party contract chain).

## Notes

Keep this README updated when responsibilities or structure in this folder change.
