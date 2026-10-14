# tests/backend/pytest/architecture

## Purpose

Pytest backend coverage for `architecture`.

## Contents

- `__init__.py`
- `__pycache__/`
- `_archive_allowlist.toml`
- `_auth_idiom_baseline.toml`
- `_bounded_context_adapters.toml`
- `_bounded_context_cross_cutting.toml`
- `_bounded_context_read_shape.toml`
- `_bounded_context_workflow_pairs.toml`
- `_bounded_context_write_side.toml`
- `_capabilities_all_allowlist.toml`
- `_endpoint_commit_allowlist.toml`
- `_naming_allowlist.toml`
- `_riskhub_config_service_commit_allowlist.toml`
- `_vendor_governance_service_commit_allowlist.toml`
- `test_adr_007_amendment_present_red.py`
- `...`

## Notes

Keep this README updated when responsibilities or structure in this folder change.

### Exception review — 2026-09-06

Next review: **2026-12-05** (90 days); owner: RiskHub Maintainer.

- Removed all four raw-commit exceptions for RiskHub configuration and Vendor
  archive/restore. Those service boundaries now use `commit_service_boundary`;
  failure-injection tests verify automatic rollback and unchanged stored state.
- Retained the four auth helper modules under ADR-011's non-increasing baseline:
  `vendor_reports.py` adds the vendor-report role policy, `directory.py` restricts
  directory administration, `access.py` separates privileged reads from user
  administration, and `orphaned_items.py` restricts governance operations. Replacing
  these with a generic permission dependency would not preserve those policies.
  The renewal permits no additional modules or weaker authorization.
- Retained the 27 capability exports as the current public API compatibility
  surface. The ordered export contract remains exact; the schema test now also
  enforces expiry. This renewal changes neither exports nor capability decisions.

### Registry lifetime policy — 2026-10-14

The five `_bounded_context_*` files are ADR-007 architecture declarations. The
four exact `_archive_allowlist.toml` paths are permanent ADR-005 schema/ORM
owners and forward-only migrations. Their consumers pin the policy and scope;
no calendar expiry applies to these accepted decisions.

`_endpoint_commit_allowlist.toml` and `_naming_allowlist.toml` are empty temporary
exception registries. Each future exception table requires an owner, rationale,
and per-entry `expires_at` (valid through that calendar day). Top-level expiry
is rejected. Both current zero-exception invariants remain enforced; metadata
alone cannot authorize new exceptions. Naming entries additionally require a
repository `path` under the persistence naming contract in
`test_w8a_persistence_contracts_red.py`.

`_registry_policy.py` validates the explicitly selected policy and schema.
`test_registry_policy.py` freezes day-before/day-of/day-after behavior and
checks that missing metadata or policy substitution cannot disable debt expiry.
Other registries retain their existing policies; this change does not renew
capability/auth exceptions or silently forgive remaining raw service commits.
