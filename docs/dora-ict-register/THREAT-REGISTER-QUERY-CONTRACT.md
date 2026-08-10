# Threat register query contract

Issue #79 migrates Threats to the shared ICT register collection contract. A
Threat is a global CISO-stewarded catalog record. Linked-Risk context is a
separate permission boundary: only Risks independently readable by the caller
may affect a label, count, facet, lookup, group membership, item summary, or
export cell.

## Collection endpoint

`GET /api/v1/threats` accepts explicit query parameters and the shared JSON
`filters` object. JSON values replace the same explicit dimension when both are
present. Search is ANDed with every filter; different dimensions use AND and
repeated values inside one dimension use OR.

The default is active records, `view=all`, offset 0, limit 50, and deterministic
name ordering. Supported sort fields are `name`, `category`,
`threat_steward`, `relevant_subject`, `linked_risk_count`, and `created_at`.
The response contains `items`, `groups`, `facets`, `total`, `offset`, `limit`,
`skip`, and collection `capabilities`. `skip` equals `offset`.

### Search and filters

Search covers Threat name, description, typical weaknesses, relevant subject,
and Steward name. Filters are:

- repeated `lifecycle=active|archived`;
- repeated canonical `categories`;
- repeated `steward_ids` and `relevant_subjects`;
- optional `has_linked_risk=true|false`;
- repeated permission-scoped `linked_risk_ids`, `linked_risk_types`, and
  `linked_risk_department_ids`.

`include_archived=true` remains a compatibility input. With no lifecycle input,
only active Threats are returned. Facets are computed from the caller-visible
universe while omitting their own dimension and retaining the other active
criteria. Controlled zero-result values remain stable and disabled.

### Views and grouping

Views and `group_by` values are `all`, `category`, `threat_steward`,
`relevant_subject`, and `linked_risk`; `all` has no group. Group values are
opaque identifiers returned by the API. `linked_risk` is multi-membership: one
Threat appears in every group for a linked Risk the caller can independently
read. A hidden Risk cannot contribute a label, identifier, count, or group.
`visible_linked_risk_count` counts only readable links.

## Remote lookups

These endpoints accept `search`, repeated `selected_ids`, and `limit`:

- `GET /api/v1/threats/lookups/stewards`;
- `GET /api/v1/threats/lookups/risks`;
- `GET /api/v1/threats/lookups/risk-departments`.

Ordinary Steward discovery contains only assigned Users who are currently
eligible active CISOs. An explicitly selected historical steward remains
resolvable when that User is still assigned to a caller-visible Threat, even
after deactivation or CISO role loss; arbitrary selected User identifiers are
not echoed. Risk and Department choices come only from independently readable
linked-Risk context. Authorized selected values remain resolvable across
paging; unauthorized identifiers are not echoed and raw IDs are never used as
display fallbacks.

## Standard export

`GET /api/v1/threats/export?format=csv&locale=en|cs` requires `threats:read`
and `reports:read`. It applies the same visibility, search, filters, sort, view,
and selected group as the list, but exports every matching row independent of
`offset` and `limit`. Category codes and localized labels are separate columns;
linked-Risk labels and their count include readable links only. All cells use
the shared spreadsheet-formula neutralization.

The stable header order is:

`name`, `category_code`, `category_label`, `description`,
`typical_weaknesses`, `relevant_subject`, `threat_steward`,
`visible_linked_risk_count`, `linked_risks`, `lifecycle`.

## Verification

`tests/backend/pytest/test_threat_register_framework.py` covers the shared
filters, search fields, lifecycle, facets, every group, readable-Risk
multi-membership and non-leakage, scoped lookups, collection/export
capabilities, CSV localization, sanitization, and pagination independence.
`tests/frontend/e2e/threat-register-framework.spec.ts` provides the public URL,
keyboard, export, CISO, retry, and access-denial browser contract.
