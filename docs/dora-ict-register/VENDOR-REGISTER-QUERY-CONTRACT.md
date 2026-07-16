# Vendor register query contract

Issue #80 migrates Vendors to the shared ICT register listing contract while
preserving the mature Vendor ownership, lifecycle, grouping, and link
semantics. The backend is authoritative for visibility, filtering, facets,
groups, lookups, capabilities, pagination, and the standard CSV export.

## Collection endpoint

`GET /api/v1/vendors`

- Default state: `view=all`, active Vendors only, page 1, page size 50.
- Views: `all`, `department`, `process`, `type`, `risk`, and `flag`.
- Sort fields: `name`, `legal_name`, `registration_id`, `department`,
  `outsourcing_owner`, `vendor_type`, `risk_score`, `tier`, `cif`,
  `process`, `country`, and `created_at`.
- Repeated values within one dimension use OR; different dimensions and
  `search` use AND.
- Direct query parameters and JSON `filters` can be combined for compatibility.
  For a field present in both forms, JSON `filters` is authoritative.
- The response carries `items`, `groups`, `facets`, `total`, `offset`,
  `limit`, `skip`, and collection `capabilities`.

An assigned Outsourcing Owner without `vendors:read` receives only directly
assigned Vendor rows. That record-specific exception does not expose derived
graph data, Contracts, Sub-outsourcing, linked registers, export, create,
archive/restore, or accountability-management authority.

### Search

`search` matches trading name, legal name, registration identifier,
Outsourcing Owner name or email, Owning Department, Process, and subprocess.
Search is evaluated only after canonical Vendor visibility has been applied.

### Filters

Repeated identifiers:

- `department_ids`
- `outsourcing_owner_ids`
- `linked_process_ids`
- `linked_asset_ids`
- `linked_risk_ids`
- `linked_control_ids`
- `linked_kri_ids`

Repeated stable values:

- `lifecycle`: `active`, `archived`
- `vendor_types`
- `risk_scores`: 1 through 5
- `tiers`: `critical`, `significant`, `standard`
- `substitutability`
- `countries`
- `country_categories`: `domestic`, `eu`, `non_eu`, `unknown`

Optional Boolean filters use `true`, `false`, or absence for Yes, No, or Any:

- `dora_relevant`
- `cif`
- `is_significant_vendor`
- `has_roi_contract`
- `has_sub_outsourcing`
- `has_direct_process_link`

`include_archived=true` remains a compatibility input. New clients use
repeated `lifecycle` values. Without either input, only active Vendors are
returned.

Facet counts use the caller-visible universe and omit their own dimension while
retaining every other criterion. Controlled zero-result options remain visible
with `disabled=true`. Contract, Sub-outsourcing, derived, Process, and
linked-entity dimensions are unavailable unless the caller may read the
underlying context; unavailable filters never widen scope.

## Grouping and non-leakage

The six UI views map to `group_by=department|process|type|risk|flag`; `all`
has no group. Group values are opaque identifiers returned by the API and are
submitted back as `group_value` for drill-down.

Process, Risk, and flag groups are multi-membership:

- one Vendor appears in every readable linked-Process group;
- one Vendor appears in every independently readable linked-Risk group;
- one Vendor appears in every applicable DORA/CIF/significant flag group.

By Risk is advertised only when
`capabilities.can_view_risk_contexts=true`. Hidden Risk identifiers, names,
memberships, counts, lookup choices, filter matches, and export values never
enter the collection plan.

## Lookup endpoints

These endpoints accept `search`, repeated `selected_ids`, and `limit`:

- `GET /api/v1/vendors/lookups/outsourcing-owners`
- `GET /api/v1/vendors/lookups/departments`
- `GET /api/v1/vendors/lookups/processes`
- `GET /api/v1/vendors/lookups/assets`
- `GET /api/v1/vendors/lookups/risks`
- `GET /api/v1/vendors/lookups/controls`
- `GET /api/v1/vendors/lookups/kris`

Lookups are permission-scoped to the same visible Vendor universe and
independently readable linked records. Authorized selected values remain
resolvable outside the ordinary result limit; unauthorized selected IDs are not
echoed. These filter lookups are distinct from the purpose-scoped Vendor
assignment directories.

## Standard export

`GET /api/v1/vendors/export?format=csv&locale=en|cs`

- Requires `reports:read`; collection
  `capabilities.can_export` is the frontend authority.
- Applies the same visible candidate set, search, filters, sort, view, and group
  drill-down as the list.
- Exports every matching visible Vendor independent of `offset` and `limit`.
- Emits stable controlled codes and localized labels in separate columns.
- Uses the canonical tabular CSV generator, including spreadsheet-formula
  neutralization.
- Is separate from the formal DORA Register of Information export.

The stable header order is:

`name`, `legal_name`, `registration_id`, `outsourcing_owner`,
`department`, `process`, `vendor_type_code`, `vendor_type_label`,
`risk_score`, `tier_code`, `tier_label`, `cif_code`, `cif_label`,
`dora_relevant`, `significant_vendor`, `substitutability_code`,
`substitutability_label`, `country_code`, `country_label`,
`country_category_code`, `country_category_label`, `lifecycle`.

## Browser state

The frontend stores `q`, `view`, `sort`, one JSON `filters` value, and
`group` in the URL while preserving unrelated navigation parameters. Search,
view, filter, group, or sort changes reset pagination to page 1; page itself is
not persisted. Browser Back, Forward, reload, and copied links restore the
register state.

## Verification

- `tests/backend/pytest/test_vendor_register_framework.py`
- `tests/frontend/unit/src/pages/vendors/__tests__/VendorRegisterFilterBar.test.tsx`
- `tests/frontend/unit/src/pages/vendors/__tests__/useVendorsPageState.sharedState.test.tsx`
- `tests/frontend/unit/src/pages/vendors/__tests__/vendorRegisterConfig.test.ts`
- `tests/frontend/unit/src/services/vendorApi.collection.test.ts`
- `tests/frontend/e2e/vendor-register-framework.spec.ts`
