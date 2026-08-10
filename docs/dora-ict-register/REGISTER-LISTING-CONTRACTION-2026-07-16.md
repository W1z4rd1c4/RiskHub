# Eight-register backend listing contraction (#83)

## Decision

The operational Risk, Control, KRI, Issue, Vendor, Process, Asset, and Threat
registers keep one normalized collection-query boundary:
`app.api.v1.endpoints._collection.build_list_context`. It accepts the shared
`sort`, `filters`, `group_by`, and `group_value` contract while retaining the
existing explicit query parameters as compatibility inputs. JSON filter values
remain authoritative when both forms are supplied.

The canonical execution seam is
`app.services._register_listings.lifecycle`. SQL-backed registers execute a
`RegisterListingPlan`; the derived in-memory Process, Asset, and Threat
registers assemble their response through `build_in_memory_register_response`
after producing one permission-scoped candidate/result set. Vendor listing
continues through `list_vendor_governance`, whose plan is executed by the same
lifecycle module. No wire keys, URLs, capability fields, filters, grouping
semantics, or export scope changed in this contraction.

## Removed legacy paths

`app.api.v1.endpoints._collection_execution` was a pure internal re-export of
`app.services._collection_contracts`. Repository search found no production
caller; its only imports were tests of the underlying service contract. Those
tests now import the canonical service module directly, so the superseded
endpoint-layer execution facade was removed.

The unused frontend collection loader, register-page controller/workflow,
collection-view/table presentation helpers, legacy Risk filter, and legacy
Vendor table were also removed after repository search confirmed no production
callers. Their behavior already lives in entity register configs/page state and
`RegisterListShell`; tests now target those live seams.

The `_collection` input normalizer is intentionally retained because every one
of the eight production endpoints calls it. The explicit query parameters are
also retained because they are part of the external API and are used by current
clients; they are compatibility inputs to the shared normalizer, not a second
listing implementation.

## Evidence and regression locks

- `test_ict_gov_11_register_listing_contraction.py` inventories all eight
  production endpoints and their service modules.
- The architecture lock requires every endpoint to use `build_list_context`,
  every register to use the shared listing lifecycle, and every default order
  to include a stable entity-ID tie-breaker.
- The same lock verifies that each facet builder is anchored to a readable
  actor scope and points to runtime non-leakage coverage for all eight
  registers.
- Existing register framework tests retain filter, facet, zero-count disabled
  options, grouping, lifecycle/archive, pagination, and unpaged filtered export
  behavior.

Evidence commands used for the contraction:

```text
rg -n "_collection_execution" backend tests docs
rg -n "build_list_context" backend/app/api/v1/endpoints/{risks,controls,kris,issues,vendors,processes,assets,threats}
rg -n "execute_register_listing_plan|build_.*_listing|list_vendor_governance" backend/app/api/v1/endpoints/{risks,controls,kris,issues,vendors,processes,assets,threats}
```
