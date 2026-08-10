# Asset register query contract

Issue #78 migrates Assets to the shared ICT register listing contract. The backend is the authority for filtering, visibility, facets, grouping, pagination, lookups, and export.

## Collection endpoint

`GET /api/v1/assets`

- Default state: `view=all`, active records only, page 1, page size 50, ascending `name` order.
- Views: `all`, `department`, `business_owner`, `type`, `criticality`, `process`, `vendor`.
- Sort fields: `name`, `asset_type`, `asset_level`, `business_owner`, `ict_owner`, `department`, `criticality`, `cif`, `lifecycle_state`, and `created_at`. Other values, including `updated_at`, are rejected.
- Repeated values within one dimension use OR; different dimensions use AND.
- Direct query parameters and JSON `filters` can be combined for compatibility. For a field present in both forms, the JSON `filters` value replaces the direct-query value; repeated values are not merged across forms.
- `items`, `groups`, `facets`, `total`, `offset`, `limit`, `skip`, and collection `capabilities` are returned. `skip` equals `offset`; the response does not expose `page` or `page_size`. Process and Vendor groups are multi-membership groups.

### Search

`search` matches Asset name, alternative names, asset type, business owner, ICT owner, owning Department, and physical location. Search and all filter evaluation occur after caller visibility has been applied.

### Filters

Repeated identifiers:

- `department_ids`
- `business_owner_ids`
- `ict_owner_ids`
- `linked_process_ids`
- `linked_asset_ids`
- `linked_vendor_ids`
- `linked_risk_ids`

Repeated stable codes:

- `lifecycle`: `active`, `archived`
- `asset_types`
- `asset_levels`
- `deployment_models`
- `criticality`
- `lifecycle_states`
- `gdpr_relevance`
- `ai_relevance`
- `data_classification`

Optional Boolean filters use `true`, `false`, or absence for Yes, No, or Any:

- `cif`
- `legacy`
- `spof`
- `external_dependency`
- `internet_exposed`
- `is_complete`
- `has_process_link` (compatibility quick filter)

`include_archived=true` is retained as a compatibility input. New clients use repeated `lifecycle` values. Without either input, the collection contains active records only.

Facet counts use the caller-visible universe and omit their own dimension while retaining all other active criteria. Zero-count controlled codes remain in the response with `disabled=true`. No facet or relationship filter exposes a label, count, or raw identifier for a counterpart the caller cannot read.

## Lookup endpoints

The following endpoints accept `search`, repeated `selected_ids`, and `limit`:

- `GET /api/v1/assets/lookups/business-owners`
- `GET /api/v1/assets/lookups/ict-owners`
- `GET /api/v1/assets/lookups/departments`
- `GET /api/v1/assets/lookups/processes`
- `GET /api/v1/assets/lookups/assets`
- `GET /api/v1/assets/lookups/vendors`
- `GET /api/v1/assets/lookups/risks`

Lookups are permission-scoped. Authorized selected values remain in the response even when they are outside the normal result limit; unauthorized selected identifiers are not echoed.

## Export endpoint

`GET /api/v1/assets/export?format=csv&locale=en|cs`

- Requires `reports:read`; the collection advertises this as `capabilities.can_export`.
- Applies the same visibility, search, filters, and sort as the listing endpoint.
- Exports every matching visible row, independent of collection pagination.
- Returns both stable codes and locale-specific labels. Boolean/lifecycle/completeness values use stable machine values where a separate localized label is not required.
- Uses the canonical tabular CSV generator, including spreadsheet-formula neutralization.

The stable header order is:

`name`, `alternative_names`, `asset_type_code`, `asset_type_label`, `asset_level_code`, `asset_level_label`, `deployment_model_code`, `deployment_model_label`, `business_owner`, `ict_owner`, `owning_department`, `physical_location`, `criticality_code`, `criticality_label`, `cif_code`, `cif_label`, `lifecycle_state_code`, `lifecycle_state_label`, `legacy_code`, `legacy_label`, `spof_code`, `spof_label`, `external_dependency_code`, `external_dependency_label`, `gdpr_relevance_code`, `gdpr_relevance_label`, `ai_relevance_code`, `ai_relevance_label`, `internet_exposed_code`, `internet_exposed_label`, `data_classification_code`, `data_classification_label`, `is_complete`, `lifecycle`.

## Verification

`tests/backend/pytest/test_asset_register_framework.py` covers the shared filters, search fields, own-dimension facets, multi-membership groups, lifecycle default and switch, scoped relationship lookups/filters, collection/export capabilities, all-visible localized export, and cross-department non-leakage.
