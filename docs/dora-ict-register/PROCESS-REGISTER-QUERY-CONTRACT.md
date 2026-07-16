# Process register query contract

The Process register is the tracer implementation for the normalized register
list contract. Its list and standard CSV export use the same permission-scoped
candidate set and filter plan; export deliberately ignores list pagination.

## List

`GET /api/v1/processes` accepts the shared `sort` and `filters` JSON query
parameters as well as explicit query parameters for compatibility. Filters use
AND between dimensions and OR within repeated values:

- `lifecycle=active|archived`, `department_ids`, `owner_ids`, `l0_areas`;
- derived `criticality`, `cif`, and `is_complete`;
- `licensed_activity`, `bcm_link`, and `dr_test_result` canonical codes;
- inclusive `mtpd_min` and `mtpd_max`;
- permission-safe `linked_asset_ids`, `linked_vendor_ids`, and
  `linked_risk_ids`.

Search covers F-code, L0/L1/L2 names, Process Owner name, and Owning Department
name. Views are `all`, `department`, `owner`, `l0`, `criticality`, and `vendor`.
Every non-All view maps to the corresponding `group_by` value. Group values are
opaque stable drill-down identifiers returned by the API.

The response preserves `items`, `total`, `offset`, `limit`, `skip`, and
collection `capabilities`, and adds:

- `groups`: permission-scoped count summaries for the selected view;
- `facets`: permission-scoped values and counts. Controlled-code facets retain
  disabled zero-result values so the filter vocabulary is stable.

## Remote lookups

`GET /api/v1/processes/lookups/{owners|departments|assets|vendors|risks}`
supports `search`, repeated `selected_ids`, and `limit`. It returns only labels
reachable from Processes and linked records independently visible to the
caller. Hidden labels, counts, and raw-ID fallbacks are not returned.

## Standard export

`GET /api/v1/processes/export?format=csv&locale=en|cs` accepts the same filters,
sort, view, and group drill-down state as the list. It returns every matching
visible Process regardless of `offset` or `limit`, with canonical controlled
codes and localized labels in separate columns. The endpoint requires
`reports:read`.

The browser URL serializer preserves unrelated navigation parameters, but the
Process request builder forwards only the explicit contract above. Unrelated
parameters cannot change lifecycle, enter the list filter plan, or broaden the
standard export. Committee population belongs to a separate governance
projection and is not defined by this contract.
