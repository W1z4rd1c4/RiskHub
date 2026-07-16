# backend/app/services/_register_listings

## Purpose

Business/service-layer logic for `_register_listings`.

## Contents

- `__init__.py`
- `__pycache__/`
- `assets.py` — permission-scoped Asset filter, facet, grouping, lookup,
  pagination, and standard-export query plan.
- `controls.py`
- `issues.py`
- `kris.py`
- `lifecycle.py`
- `processes.py` — permission-scoped Process filter, facet, grouping, lookup,
  pagination, and standard-export query plan.
- `risks.py`
- `threats.py` — global Threat filter, permission-scoped linked-Risk context,
  facet, multi-membership grouping, lookup, pagination, and standard-export
  query plan.
- `vendors.py` — permission-scoped Vendor filter, facet, multi-membership
  grouping, lookup, pagination, derived/linked-context, and standard-export
  query plan.

## Notes

Keep this README updated when responsibilities or structure in this folder change.

Threat list dimensions use AND across fields and OR within repeated values.
Views are `all`, `category`, `threat_steward`, `relevant_subject`, and
`linked_risk`; the Risk view places one Threat into every caller-readable
linked-Risk group. Lookups are `stewards`, `risks`, and `risk-departments`.
Ordinary Steward discovery includes only assigned active Users holding the
active canonical CISO role. Explicitly selected historical Stewards remain
resolvable only while still assigned to a Threat; unrelated identities are not
echoed.
Hidden Risk identifiers, labels, memberships, and counts never enter the
collection plan or its CSV export.

Vendor dimensions use AND across fields and OR within repeated values. Views
are `all`, `department`, `process`, `type`, `risk`, and `flag`.
Process, Risk, and flag groupings are multi-membership. Derived, Contract,
Sub-outsourcing, Process, Asset, Risk, Control, and KRI context enters filters,
facets, groups, lookups, and export only when the caller may independently
read it. Record-only Outsourcing Owners receive their assigned Vendor rows but
no linked or derived context, register-wide actions, or standard export.
