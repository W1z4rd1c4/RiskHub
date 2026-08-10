# backend/app/services/_register_listings

## Purpose

Canonical permission-scoped list planning for the Process, Asset, Threat,
Vendor, Risk, Control, KRI, and Issue registers.

## Contents

- `__init__.py`
- `assets.py` — permission-scoped Asset filter, facet, grouping, lookup,
  pagination, and standard-export query plan.
- `controls.py` — Control scope, filters, facets, grouping, deterministic
  ordering, and list/export plan.
- `issues.py` — Issue scope, filters, facets, grouping, deterministic ordering,
  and list/export plan.
- `kris.py` — KRI scope, filters, facets, grouping, deterministic ordering, and
  list/export plan.
- `lifecycle.py` — shared SQL plan execution and in-memory response assembly.
- `processes.py` — permission-scoped Process filter, facet, grouping, lookup,
  pagination, and standard-export query plan.
- `risks.py` — Risk scope, filters, facets, grouping, deterministic ordering,
  and list/export plan.
- `threats.py` — global Threat filter, permission-scoped linked-Risk context,
  facet, multi-membership grouping, lookup, pagination, and standard-export
  query plan.
- `vendors.py` — permission-scoped Vendor filter, facet, multi-membership
  grouping, lookup, pagination, derived/linked-context, and standard-export
  query plan.

## Notes

Every planner starts from one caller-readable candidate set. Facets, groups,
lookups, counts, pages, and current-view exports must derive from that same set;
hidden relationship context must not affect labels or quantities.

SQL-backed Risk, Control, KRI, and Issue planners execute a
`RegisterListingPlan`. Vendor uses `list_vendor_governance`, which executes
through the same lifecycle. Derived in-memory Process, Asset, and Threat
planners assemble their normalized list response through
`build_in_memory_register_response` after applying scope, filters, ordering,
grouping, and pagination.

The public query boundary remains
`app.api.v1.endpoints._collection.build_list_context`. Keep list and export
criteria aligned, remove pagination only for current-view export, and keep
stable entity-ID tie-breakers in every default order.

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
