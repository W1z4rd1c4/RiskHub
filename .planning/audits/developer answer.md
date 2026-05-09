# Developer Answer to Deepening Architecture Audit

Source audit: `.planning/audits/2026-05-09-deepening-audit.md`, sections `6.1`, `6.2`, and `6.3`.

This response covers only the 74 numbered opportunities in those sections. It does not respond item-by-item to process gaps, section 7 summaries, or out-of-scope/rejected audit material.

## Methodology

I reviewed each audit claim against the current repository using targeted `rg`, `sed`, `nl -ba`, and caller/import searches. Dead-code claims were checked through importer searches. Duplicate-implementation claims were checked by comparing the referenced modules and live call sites. Policy, authorization, migration, and ADR claims were checked against the relevant docs, tests, architecture locks, and business/security contracts.

Verdicts are one of `Accept`, `Accept with modification`, `Reject`, `Defer`, or `Needs investigation`. Priorities are response priorities for scheduling this cleanup, not production incident severity: `P1` means correctness or contract drift should be addressed early; `P2` means low-risk cleanup; `P3` means medium refactor with meaningful fan-out; `P4` means defer to a dedicated design, ADR, or migration window.

## Summary Table

| # | Audit ID | Title | Verdict | Priority | Recommended disposition |
|---:|---|---|---|---|---|
| 1 | A-N1 | `validate_risk_type` re-export drop | Accept | P2 | Remove unused crud package re-export only. |
| 2 | B-N1 | Underscored alias cleanup in source-validation | Accept | P2 | Delete private aliases and keep canonical names. |
| 3 | S3.11 | Frontend `kriFormWorkflow.ts` delete | Accept | P2 | Delete file and tautological test, then update lock. |
| 4 | FE-deadcode-1 | Frontend `controlFormWorkflow.ts` delete | Accept | P2 | Delete unused file and test-only references. |
| 5 | FE-deadcode-2 | Frontend `orphanResolutionPresentation.ts` delete | Accept | P2 | Delete unused presentation re-export. |
| 6 | FE-deadcode-3 | Frontend `resourcePath.ts` delete | Accept | P2 | Delete unused notification helper re-export. |
| 7 | C-N1 | Approvals `_get_approval_department_id` shim delete | Accept | P2 | Delete endpoint helper and keep service helper. |
| 8 | B-N2 | Duplicate source-validation impls delete | Accept with modification | P2 | Consolidate, but do not delete live service callers until repointed. |
| 9 | S6.5 | Approvals `can_user_view_approval_resource` duplicate delete | Accept with modification | P2 | Repoint notification helper to scenario policy; audit file-layer wording is off. |
| 10 | S8.5 | Questionnaires endpoint module delete | Reject | P1 | Keep module; it exposes a mounted batch-send route. |
| 11 | S2.7 | Risk-execution `risk.process` truth-in-naming fix | Accept | P1 | Change to `risk.name` and update regression coverage. |
| 12 | D-N3 | Users-summary blanket-except narrowing | Accept with modification | P1 | Narrow exception handling and route governance through canonical capabilities. |
| 13 | S5.1 / C-N2 | Vendor-link helpers shim delete + contract sync | Accept | P1 | Delete dead shim and update capability contract citations. |
| 14 | S4.4 | Issues outbox-only notification cleanup | Accept | P1 | Delete direct-send helpers and assert outbox enqueue behavior. |
| 15 | D-N2 | `access_user` capability catalog gap | Accept | P1 | Add access-user capability surface to catalog and tests. |
| 16 | S8.10 | Reports legacy-excel tombstone removal | Accept with modification | P2 | Remove 410 tombstones plus tests/OpenAPI expectations. |
| 17 | S2.1 | `_monitoring_response` shim consolidation | Accept | P2 | Rewrite endpoint imports to service module and delete shim. |
| 18 | S6.2 | Approvals `_build_approval_read` consolidation | Accept | P2 | Repoint callers to service projection and delete endpoint duplicate. |
| 19 | S1.4 | Risk-type validation policy unification | Accept with modification | P1 | Use service policy after verifying HTTP 400 parity. |
| 20 | S1.6 | Risk ID generation co-location | Accept with modification | P2 | Move implementation to service but preserve required endpoint re-export. |
| 21 | S2.6 | Control-Risk link loader unification | Accept | P2 | Collapse duplicate loaders into a keyword-only helper. |
| 22 | S2.8 | ControlForm shim deletion | Accept with modification | P2 | Rewrite production and test imports before deleting shim. |
| 23 | S2.9 | `controlFormUtils` inlining | Accept | P2 | Inline helpers into narrow consumers. |
| 24 | S3.4 | KRI linked-vendors barrel removal | Accept with modification | P2 | Remove barrel with contract/doc citation updates. |
| 25 | S3.7 | KRI department-scope helper extraction | Accept | P2 | Extract shared scope helper and type deadline rows. |
| 26 | S3.9 | KRIForm shim deletion | Accept with modification | P2 | Rewrite page and test mocks before deleting shim. |
| 27 | S4.2 | Issue loading duplicate deletion | Accept | P2 | Keep service loader and repoint endpoint callers. |
| 28 | S4.3 | Issue source-mutation triplicate collapse | Accept with modification | P2 | Consolidate around service-owned canonical helper after #8/#27. |
| 29 | S4.6 | Source-type vocabulary canonicalization | Accept with modification | P2 | Add canonical helper covering enum and string inputs. |
| 30 | S4.10 | Issue `_shared/__init__.py` underscore re-export pruning | Accept with modification | P2 | Prune after loading/source-mutation consolidation. |
| 31 | S5.5 | Vendor reporting service extraction | Accept with modification | P3 | Extract row/export formatting; domain service already exists. |
| 32 | S5.8 | Vendor linked-entity tab generic | Accept | P3 | Extract generic component/hook with typed entity config. |
| 33 | S6.4 | Approval queued banner unification | Accept | P2 | Replace KRI-specific banner with generic banner. |
| 34 | S6.6 | Privileged-tier resolve authorization helper | Accept with modification | P3 | Centralize checks with approve/reject regression coverage. |
| 35 | S7.3 | `usePermissions` hook removal | Accept with modification | P2 | Replace Sidebar usage and update test mocks. |
| 36 | S7.4 | BusinessRouteGuards parametric refactor | Accept | P3 | Use typed guard factory without weakening invariant tests. |
| 37 | S7.10 | Governance capability read from canonical builder | Accept | P1 | Delete local mirror and consume `build_me_capabilities`. |
| 38 | S8.6 | Endpoint-layer Pydantic model eviction | Accept with modification | P2 | Move schemas but keep live questionnaire endpoint. |
| 39 | S8.7 | AdminConsoleCapabilities real builder | Accept with modification | P3 | Move capability construction into authorization service with tests. |
| 40 | S8.11 | Admin sub-router re-clustering | Defer | P4 | Revisit after capability builder lands. |
| 41 | B-N3 | Issue workflow serialization alias removal | Accept | P2 | Delete bidirectional underscore aliases. |
| 42 | BE-N2 | ActorPayloadModel outbox boilerplate reduction | Accept | P3 | Add shared actor payload base without changing idempotency contract. |
| 43 | BE-N4 | Audit adapter-emitter helper | Accept with modification | P3 | Extract only repeated boilerplate and preserve audit matrix. |
| 44 | BE-N6 | API surface path-prefix registry | Accept | P3 | Centralize guarded prefixes with invariant coverage. |
| 45 | BE-N8 | Ownership resolver factory | Defer | P4 | Defer until row-level authz characterization tests exist. |
| 46 | FE-N1 | Frontend query-keys factory | Accept | P3 | Promote resource query key factories in a broad but mechanical refactor. |
| 47 | FE-N4 | RetryPolicy extraction | Accept with modification | P3 | Extract session-refresh retry policy, not generic retry alone. |
| 48 | FE-N6 | Error-key module consolidation | Accept | P2 | Merge map and lookup function. |
| 49 | S2.2 | Control execution monitoring wrapper inline | Accept | P2 | Inline wrapper and update architecture lock. |
| 50 | S3.2 | KRI submission alias deletion | Accept | P2 | Delete alias and update architecture lock. |
| 51 | S3.3 | KRI value-application shim deletion | Accept with modification | P2 | Rewrite callers and docs/contracts with #24. |
| 52 | S3.5 | KRI correction-plans fake seam deletion | Accept | P2 | Delete shim and update architecture lock. |
| 53 | S4.1 | Issue workflow service collapse | Accept | P2 | Import lifecycle functions directly and update lock. |
| 54 | S6.3 | Approval queue aggregator deletion | Accept | P2 | Move imports to package exports and delete aggregator. |
| 55 | S7.5 | Access user service facade deletion | Accept with modification | P2 | Rewrite imports and contract validator references. |
| 56 | S7.6 | Directory identity service shim deletion | Accept with modification | P3 | Rewrite fan-out imports and contract references. |
| 57 | S8.1 | Quarterly comparison facade deletion | Reject | P2 | Keep facade because package README and lock explicitly require it. |
| 58 | S8.3 | Orphaned item facade + static-method class deletion | Accept with modification | P3 | Rewrite callers to functions directly, then delete wrappers. |
| 59 | S2.10 | Control monitoring package consolidation | Accept with modification | P3 | Consolidate after shim/wrapper cleanup. |
| 60 | S6.6 | PrivilegeContext request-scoped object | Defer | P4 | Defer until authorization helper and KRI shim cleanup are stable. |
| 61 | S7.7 | `graph_directory` adapter package move | Accept with modification | P3 | Move package and update docs/tests/imports with #56. |
| 62 | S5.9 | KRI vendor assignment consolidation | Defer | P4 | Defer until vendor-link migration/mixin direction is settled. |
| 63 | BE-N7 | Outbox dispatch SchedulerJobRun instrumentation | Accept with modification | P3 | Use tracked job without losing admin outbox runtime state. |
| 64 | FE-N2 | QueryClient defaults centralization | Accept | P2 | Extract defaults to API query client module. |
| 65 | FE-N3 | CRUD capability schema reuse | Accept | P3 | Add shared schema and snapshot against capability catalog. |
| 66 | FE-N5 | AuthContext provider split | Defer | P4 | Defer until auth capability builder/session ADR work is complete. |
| 67 | FE-N7 | `useResourcePanelQuery` generic hook | Accept | P3 | Extract typed generic hook after query-key work. |
| 68 | FE-N8 | WidgetShell + dashboard scoped query | Defer | P4 | Defer to dedicated dashboard UX/state refactor. |
| 69 | S5.2 | Vendor link tables to mixin/polymorphic merge | Defer | P4 | Dedicated forward-only migration window required. |
| 70 | S5.7 | Vendor.status enum drop | Defer | P4 | Bundle with vendor-link migration window. |
| 71 | S7.8 | Frontend session module merge | Defer | P4 | Defer until ADR-011 and provider split settle. |
| 72 | S7.9 | ADR-011 Auth scheme and session model | Accept | P1 | Write ADR before session/auth refactors. |
| 73 | S3.12 | ADR-012 KRI time-series period algebra | Accept | P2 | Write ADR before KRI period/deadline cleanup. |
| 74 | ADR-007 | ADR-007 amendment - three context categories | Accept | P2 | Amend bounded-context taxonomy before related package moves. |

## Per-Finding Responses

### 1. `validate_risk_type` re-export drop (A-N1)

- **Audit claim:** Remove the unused `validate_risk_type` re-export from `backend/app/api/v1/endpoints/risks/crud/__init__.py`.
- **Developer statement:** The claim is valid for the package-level re-export. The underlying validator still exists and remains relevant until the policy unification in finding 19.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1669`; code `backend/app/api/v1/endpoints/risks/crud/__init__.py:2,15-23`, `backend/app/api/v1/endpoints/risks/crud/_shared.py:8-20`, `backend/app/services/_entity_mutation_lifecycle/policy.py:29-39`.
- **Reasoning:** The crud package advertises a symbol that callers do not need. Removing only the re-export reduces the public surface without changing endpoint behavior.
- **Recommended action:** Remove `validate_risk_type` from the crud package `__all__`/import list, then handle implementation unification separately in finding 19.
- **Verification:** `rg -n "validate_risk_type" backend tests`

### 2. Underscored alias cleanup in source-validation (B-N1)

- **Audit claim:** Delete private alias lines in `services/_issue_workflow/source_validation.py`.
- **Developer statement:** The aliases are redundant because the module already exports canonical public names.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1678`; code `backend/app/services/_issue_workflow/source_validation.py:117-130`.
- **Reasoning:** The aliases add naming ambiguity with no functional value. Keeping only canonical names aligns imports and makes later consolidation safer.
- **Recommended action:** Delete `_ensure_owner_assignable`, `_issue_link_department_ids`, `_resolve_vendor_department_and_access`, and `_validate_user_exists` alias assignments.
- **Verification:** `rg -n "_ensure_owner_assignable|_issue_link_department_ids|_resolve_vendor_department_and_access|_validate_user_exists" backend tests`

### 3. Frontend `kriFormWorkflow.ts` delete (S3.11)

- **Audit claim:** Delete the KRI form workflow file and its tautological test.
- **Developer statement:** The file is not part of the production workflow. It only wraps `buildVendorContextWarning` and is referenced by its own unit test.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1687`; code `frontend/src/components/kri-form/kriFormWorkflow.ts:1-14`, `tests/frontend/unit/src/components/__tests__/EntityFormWorkflow.test.ts:8`.
- **Reasoning:** A production-unused helper plus a test-only consumer is not useful coverage. Deleting both removes a false architectural signal.
- **Recommended action:** Delete the file and corresponding test, then update any architecture ratchet that explicitly expects it.
- **Verification:** `rg -n "kriFormWorkflow|buildVendorContextWarning" frontend tests`

### 4. Frontend `controlFormWorkflow.ts` delete (FE-deadcode-1)

- **Audit claim:** Delete the control form workflow helper.
- **Developer statement:** The file only defines a small label helper and has no live importers in the current tree.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1696`; code `frontend/src/components/control-form/controlFormWorkflow.ts:1-2`.
- **Reasoning:** No production caller depends on this module. If the label logic is needed later, it should live beside the actual form control that renders it.
- **Recommended action:** Delete the file and remove any test-only references.
- **Verification:** `rg -n "controlFormWorkflow|buildControlOwnerOptionLabel" frontend tests`

### 5. Frontend `orphanResolutionPresentation.ts` delete (FE-deadcode-2)

- **Audit claim:** Delete the orphan resolution presentation helper.
- **Developer statement:** The module is an unused re-export of `buildOrphanResolutionLabel`.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1705`; code `frontend/src/components/governance/orphanResolutionPresentation.ts:1`.
- **Reasoning:** Keeping an unused presentation indirection makes governance rendering harder to trace.
- **Recommended action:** Delete the file after confirming no importers remain.
- **Verification:** `rg -n "orphanResolutionPresentation|buildOrphanResolutionLabel" frontend tests`

### 6. Frontend `resourcePath.ts` delete (FE-deadcode-3)

- **Audit claim:** Delete the notification `resourcePath.ts` helper.
- **Developer statement:** The file re-exports notification presentation helpers and has no live importers.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1714`; code `frontend/src/components/notifications/resourcePath.ts:1-4`.
- **Reasoning:** A dead re-export in notifications advertises a second path for resource URL logic without adding behavior.
- **Recommended action:** Delete the file and rely on the canonical notification presentation module.
- **Verification:** `rg -n "components/notifications/resourcePath|resourcePath" frontend tests`

### 7. Approvals `_get_approval_department_id` shim delete (C-N1)

- **Audit claim:** Delete endpoint-local `_get_approval_department_id`; use the service-side version.
- **Developer statement:** The endpoint helper has no live callers, while the service helper is used by approval execution.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1723`; code `backend/app/api/v1/endpoints/approvals/_shared.py:17-31`, `backend/app/services/_approval_execution/loading.py:31-46`, `backend/app/services/approval_execution_service.py:25,84,128,193`, `backend/app/services/_approval_execution/logging.py:6,16`.
- **Reasoning:** Department resolution belongs to the approval execution service, not an endpoint helper with no callers.
- **Recommended action:** Delete the endpoint helper and import the service helper for any future need.
- **Verification:** `rg -n "_get_approval_department_id|get_approval_department_id" backend tests`

### 8. Duplicate source-validation impls delete (B-N2)

- **Audit claim:** Delete the service-side source-validation implementations because they have zero production importers.
- **Developer statement:** The duplication exists, but the zero-importer claim is inaccurate. Service workflow modules import and call these functions today.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1732`; code `backend/app/services/_issue_workflow/source_validation.py:9-114`, `backend/app/services/_issue_workflow/update_plans.py:9-14,34,44,55,89`, `backend/app/services/_issue_workflow/execution.py:41-47`, `backend/app/api/v1/endpoints/issues/_shared/validation.py:11-36`, `backend/app/api/v1/endpoints/issues/_shared/links.py:11-80`, `backend/app/services/_issue_register/source_mutation.py:24-97`.
- **Reasoning:** The direction should be consolidation, but deletion is unsafe until live service callers are repointed. This overlaps with findings 27, 28, and 30.
- **Recommended action:** Choose a service-owned canonical implementation, repoint workflow and endpoint callers, then delete duplicates and aliases in one small sequence.
- **Verification:** `rg -n "ensure_owner_assignable|issue_link_department_ids|resolve_vendor_department_and_access|validate_user_exists" backend tests`

### 9. Approvals `can_user_view_approval_resource` duplicate delete (S6.5)

- **Audit claim:** Delete a duplicate `can_user_view_approval_resource` implementation and point callers at `approval_scenario_policy`.
- **Developer statement:** The duplicate is real, but it is service-side rather than endpoint-side. The notification helper should delegate to the scenario policy.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1741`; code `backend/app/services/_notification_approval_helpers.py:72-79,98`, `backend/app/services/approval_scenario_policy.py:134-142`.
- **Reasoning:** Visibility policy should have one owner. Reusing `approval_scenario_policy` avoids drift between notifications and approval queue/resource checks.
- **Recommended action:** Import `can_user_view_approval_resource` from `approval_scenario_policy` in `_notification_approval_helpers.py`, then delete the local duplicate.
- **Verification:** `rg -n "def can_user_view_approval_resource|can_user_view_approval_resource" backend tests`

### 10. Questionnaires endpoint module delete (S8.5)

- **Audit claim:** Delete `riskhub_questionnaires.py` because it exposes zero routes.
- **Developer statement:** The claim is false in the current repository. The module defines a mounted `POST /batch-send` route and is referenced by the router and AGENTS invariants.
- **Verdict:** Reject
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1750`; code `backend/app/api/v1/endpoints/riskhub_questionnaires.py:14,37-42`, `backend/app/api/v1/router.py:24,58`; docs `AGENTS.md:162`, `docs/agent/ENDPOINT_INVARIANTS.md:12-14`.
- **Reasoning:** Removing this file would remove a live API route and violate documented endpoint invariants.
- **Recommended action:** Keep the module. If later cleanup is desired, move inline schemas per finding 38 without deleting the endpoint.
- **Verification:** `rg -n "riskhub_questionnaires|batch_send_questionnaires|batch-send" backend tests docs`

### 11. Risk-execution `risk.process` truth-in-naming fix (S2.7)

- **Audit claim:** Change control execution affected-risk naming from `risk.process` to `risk.name`.
- **Developer statement:** The bug is valid. The helper builds a list named for affected risk names but currently appends the process field.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1759`; code `backend/app/services/_control_execution/workflow.py:145-155`, `backend/app/services/_control_execution/projection.py:25,160`, `tests/backend/pytest/test_executions.py:325`.
- **Reasoning:** Consumers and projection naming imply a user-visible risk name. Returning the process string creates misleading notifications/audit display.
- **Recommended action:** Return `risk.name`, update the existing test expectation, and add a regression case that distinguishes `name` from `process`.
- **Verification:** `pytest tests/backend/pytest/test_executions.py -q`

### 12. Users-summary blanket-except narrowing (D-N3)

- **Audit claim:** Replace broad `except Exception:` blocks in users summary with narrow exceptions.
- **Developer statement:** The broad catches should be narrowed, and the governance access branch should also reuse the canonical `me_capabilities` builder rather than duplicate local capability logic.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1768`; code `backend/app/api/v1/endpoints/users/summary.py:45-50,59-63`, `backend/app/services/_authorization_capabilities/me.py:33-74`.
- **Reasoning:** Silent conversion of unexpected failures to zeros hides defects. Capability decisions should come from the same builder used by the authenticated user summary.
- **Recommended action:** Narrow intentional fallback exceptions, remove the local governance mirror via finding 37, and let unexpected errors propagate through normal API error handling.
- **Verification:** `rg -n "except Exception" backend/app/api/v1/endpoints/users/summary.py && pytest tests/backend/pytest -q -k "users or capabilities"`

### 13. Vendor-link helpers shim delete + contract sync (S5.1 + C-N2)

- **Audit claim:** Delete `vendor_link_helpers.py` and update stale capability contract citations.
- **Developer statement:** The endpoint shim is unused by code but still referenced by security contract artifacts, so deletion must be paired with contract sync.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1777`; code `backend/app/api/v1/endpoints/vendor_link_helpers.py`, `backend/app/services/_vendor_links/workflow.py:265-333`; docs `docs/security/authorization-capability-contract.md:121-122`, `docs/security/authorization-capability-contract.json:55,479,502`, `AGENTS.md:205`.
- **Reasoning:** The current docs point to a dead module, which weakens the authorization capability contract as an evidence source.
- **Recommended action:** Delete the shim, update `.md` and `.json` contract pointers to canonical vendor-link workflow/governance modules, and run the validator.
- **Verification:** `python3 scripts/security/validate_authz_capability_contract.py && rg -n "vendor_link_helpers" backend docs tests`

### 14. Issues outbox-only notification cleanup (S4.4)

- **Audit claim:** Delete direct issue notification helpers because the outbox is the live transport.
- **Developer statement:** The direct-send helpers are test-only from the current call graph. Production issue workflow enqueues outbox work.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1786`; code `backend/app/api/v1/endpoints/issues/_shared/notifications.py:24-40,43-77,80-103`, `backend/app/services/_issue_workflow/outbox.py`, `backend/app/services/_issue_workflow/execution.py:127,208,244`, `tests/backend/pytest/api/v1/test_issue_workflow.py:10,679,685`.
- **Reasoning:** Two notification delivery paths invite transaction-ordering drift. The outbox path should be the only tested delivery mechanism.
- **Recommended action:** Delete the direct helpers and rewrite tests to assert outbox enqueue records.
- **Verification:** `rg -n "_notify_issue_assigned|_notify_exception" backend tests && pytest tests/backend/pytest/api/v1/test_issue_workflow.py -q`

### 15. `access_user` capability catalog gap (D-N2)

- **Audit claim:** Add the missing `access_user` capability surface to `capability-catalog.json`.
- **Developer statement:** The catalog omits a schema-backed capability surface that the API returns.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1795`; docs `docs/security/capability-catalog.json`; code `backend/app/schemas/access.py:58,63-72`, `backend/app/services/_access_workflow/policy.py:26,43`; docs `AGENTS.md:211-214`.
- **Reasoning:** Capability catalogs are only useful if all returned capability shapes are represented. The omission creates a contract blind spot for access-user authorization.
- **Recommended action:** Add `access_user` with the `AccessUserCapabilities` fields and extend catalog/validator tests.
- **Verification:** `python3 scripts/security/validate_authz_capability_contract.py && rg -n "access_user|AccessUserCapabilities" docs/security tests backend/app/schemas/access.py`

### 16. Reports legacy-excel tombstone removal (S8.10)

- **Audit claim:** Remove 410 legacy Excel tombstone routes.
- **Developer statement:** The tombstones are real, but removal must include tests and OpenAPI/contract expectations that intentionally assert the 410 behavior.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1804`; code `backend/app/api/v1/endpoints/reports/legacy_excel.py:14-29`, `backend/app/api/v1/endpoints/reports/summary_excel.py:97-103`, `backend/app/api/v1/endpoints/reports/audit_trail_excel.py:133-139`, `backend/app/api/v1/endpoints/reports/__init__.py:10-19`, `tests/backend/pytest/api/v1/test_reports_audit.py:270`.
- **Reasoning:** Removing deprecated routes is reasonable, but tests that check the tombstone must be updated in the same change.
- **Recommended action:** Delete the legacy routes, unmount them, remove or rewrite tombstone assertions, and check endpoint architecture allowlists.
- **Verification:** `rg -n "legacy_excel|/excel|HTTP_410_GONE" backend tests && pytest tests/backend/pytest/api/v1/test_reports_audit.py -q`

### 17. `_monitoring_response` shim consolidation (S2.1)

- **Audit claim:** Delete the endpoint `_monitoring_response` shim and import the service module directly.
- **Developer statement:** The shim is a pure re-export; monitoring response shaping already lives in the service module.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1813`; code `backend/app/api/v1/endpoints/_monitoring_response.py:3-19`, `backend/app/services/_monitoring_response.py:26-47,115-128,148`, endpoint imports in `departments/kris.py:8`, `departments/controls.py:10`, `kris/crud/*`, `controls/crud/*`, `risks/crud/*`, `controls/linking.py`, `risks/control_links.py`.
- **Reasoning:** Endpoint-local re-export obscures service ownership and adds unnecessary import churn.
- **Recommended action:** Rewrite endpoint imports to `app.services._monitoring_response`, delete the shim, then update any architecture lock.
- **Verification:** `rg -n "_monitoring_response" backend/app tests/backend/pytest`

### 18. Approvals `_build_approval_read` consolidation (S6.2)

- **Audit claim:** Delete endpoint `_build_approval_read` and use service projection `build_approval_read`.
- **Developer statement:** The endpoint helper duplicates the service projection and has active endpoint callers that can be repointed.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1821`; code `backend/app/api/v1/endpoints/approvals/_shared.py:34-61`, `backend/app/services/_approval_queue/projection.py:13-39`, `backend/app/api/v1/endpoints/approvals/detail.py:15,56`, `backend/app/api/v1/endpoints/approvals/resolve.py:18,61,85,102`.
- **Reasoning:** Approval read projection is domain/service behavior and should not be duplicated in endpoint orchestration.
- **Recommended action:** Repoint endpoint callers to `build_approval_read`, delete the endpoint helper, and run approval API tests.
- **Verification:** `rg -n "_build_approval_read|build_approval_read" backend tests && pytest tests/backend/pytest -q -k "approval"`

### 19. Risk-type validation policy unification (S1.4)

- **Audit claim:** Delete endpoint `validate_risk_type` and use the service policy validator.
- **Developer statement:** The duplicate policy is real, but the change must verify API error parity because the two implementations raise different exception types.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1830`; code `backend/app/api/v1/endpoints/risks/crud/_shared.py:8-20`, `backend/app/api/v1/endpoints/risks/crud/create.py:20,35`, `backend/app/services/_entity_mutation_lifecycle/policy.py:29-39,62-64`.
- **Reasoning:** Service policy should own risk-type validation. The endpoint currently raises `HTTPException`, while the service raises `ValidationError`, so the global error mapper must preserve the expected 400 response.
- **Recommended action:** Import the service validator in create/update paths, delete the endpoint duplicate, and add invalid-risk-type API regression coverage.
- **Verification:** `pytest tests/backend/pytest/test_risks.py -q -k "risk_type or create"`

### 20. Risk ID generation co-location (S1.6)

- **Audit claim:** Move risk ID generation from endpoint package to entity mutation lifecycle service package.
- **Developer statement:** The implementation belongs in service code, but a stable endpoint re-export is documented and test/script callers depend on it.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1843`; code `backend/app/api/v1/endpoints/risks/id_generation.py:7-42`, `backend/app/api/v1/endpoints/risks/__init__.py:3,8`, `backend/app/api/v1/endpoints/risks/crud/create.py:19,50`, `backend/scripts/migrate_risks.py:16,365,391`, `tests/backend/pytest/test_risks.py:556,582`, `tests/backend/pytest/test_risk_id_generation.py:13,62,80,91,111,123-126`; docs `AGENTS.md:161`, `docs/agent/ENDPOINT_INVARIANTS.md:12-14`.
- **Reasoning:** Moving the implementation is appropriate, but breaking the documented import path would violate repository invariants.
- **Recommended action:** Move implementation into service code and leave `app.api.v1.endpoints.risks.generate_risk_id_code` as a compatibility re-export.
- **Verification:** `pytest tests/backend/pytest/test_risk_id_generation.py tests/backend/pytest/test_risks.py -q`

### 21. Control-Risk link loader unification (S2.6)

- **Audit claim:** Collapse duplicate control-risk link loaders into one keyword-only helper.
- **Developer statement:** The two helpers perform the same query with reversed argument order.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1849`; code `backend/app/services/_control_execution/link_policy.py:22-45`, `backend/app/services/_control_execution/link_governance.py:22-23,102,181`, `tests/backend/pytest/test_architecture_deepening_contracts.py:213-216`.
- **Reasoning:** A keyword-only `load_link` removes duplication while preventing accidental argument swaps.
- **Recommended action:** Add `load_link(db, *, control_id, risk_id)`, update callers, and adjust the architecture lock.
- **Verification:** `rg -n "load_link_for_control|load_link_for_risk|load_link\\(" backend tests && pytest tests/backend/pytest -q -k "control and link"`

### 22. ControlForm shim deletion (S2.8)

- **Audit claim:** Delete `frontend/src/components/ControlForm.tsx` and update its importers.
- **Developer statement:** The shim is a one-line re-export, but it has production and test imports that must be rewritten together.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1855`; code `frontend/src/components/ControlForm.tsx:1`, `frontend/src/pages/ControlEditPage.tsx:6`, `frontend/src/pages/ControlNewPage.tsx:6`, `frontend/src/components/ControlCreateDialog.tsx:5`, `tests/frontend/unit/src/__tests__/approval_ui_rendering.spec.tsx:14`.
- **Reasoning:** Deleting a compatibility shim is safe only after all production and test import paths are updated.
- **Recommended action:** Rewrite imports to `control-form/ControlFormContainer`, update mocks, then delete the shim.
- **Verification:** `rg -n "components/ControlForm|ControlForm.tsx" frontend tests && cd frontend && npm run test:run -- --runInBand`

### 23. `controlFormUtils` inlining (S2.9)

- **Audit claim:** Delete `controlFormUtils.ts` and inline its helpers into consumers.
- **Developer statement:** The module groups unrelated narrow helpers used by specific control-form pieces.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1861`; code `frontend/src/components/control-form/controlFormUtils.ts:1-12`, `frontend/src/components/control-form/useControlFormLookups.ts:9`, `frontend/src/components/control-form/useControlFormWorkflow.ts:14`, `frontend/src/components/control-form/ControlFormExecutionStep.tsx:5`.
- **Reasoning:** Localizing each helper with its sole behavioral consumer improves readability and removes a low-cohesion utility file.
- **Recommended action:** Inline each helper into its consumer or a narrower module, then delete `controlFormUtils.ts`.
- **Verification:** `rg -n "controlFormUtils|getExecutionFrequencyOptions|formatControlOwner" frontend tests`

### 24. KRI linked-vendors barrel removal (S3.4)

- **Audit claim:** Delete the endpoint barrel `kris/linked_vendors.py` and import service functions directly.
- **Developer statement:** The barrel is thin, but docs and capability-contract citations must move with the code.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1867`; code `backend/app/api/v1/endpoints/kris/linked_vendors.py:1-5`, `backend/app/api/v1/endpoints/kris/crud/restore.py:17,85`, `backend/app/api/v1/endpoints/kris/crud/detail.py:15,50`, `backend/app/api/v1/endpoints/kris/crud/breaches.py:18,68`, `backend/app/api/v1/endpoints/kris/crud/create.py:22,99`, `backend/app/services/_kri_history/value_application.py:1-7`, `backend/app/services/_kri_history/direct_application.py:30-43`; docs `docs/security/authorization-capability-contract.md:116-118`, `docs/security/authorization-capability-contract.json:389,411`.
- **Reasoning:** Endpoint packages should not be service-function barrels. Because the barrel is cited as authorization evidence, code and docs must change atomically.
- **Recommended action:** Repoint KRI endpoints to the canonical service function, update contract citations, and coordinate with finding 51.
- **Verification:** `python3 scripts/security/validate_authz_capability_contract.py && rg -n "kris/linked_vendors|linked_vendors" backend docs tests`

### 25. KRI department-scope helper extraction (S3.7)

- **Audit claim:** Extract duplicated department-scope filtering from KRI deadline endpoints.
- **Developer statement:** The duplicate blocks are present in overdue and due-soon flows.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1873`; code `backend/app/api/v1/endpoints/kris/crud/overdue.py:29-50`, `backend/app/api/v1/endpoints/kris/crud/due_soon.py:30-51`.
- **Reasoning:** Shared filtering should be expressed once to avoid future differences in department-scoped KRI visibility.
- **Recommended action:** Extract a shared helper and, where feasible, push filtering into the query instead of filtering response rows late.
- **Verification:** `pytest tests/backend/pytest -q -k "kri and (overdue or due_soon or department)"`

### 26. KRIForm shim deletion (S3.9)

- **Audit claim:** Delete `frontend/src/components/KRIForm.tsx`.
- **Developer statement:** The shim is narrow, but production page imports and tests/mocks should be rewritten first.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1879`; code `frontend/src/components/KRIForm.tsx:1-2`, `frontend/src/pages/KRINewPage.tsx:5`.
- **Reasoning:** Removing the shim is worthwhile, but test mocks often rely on the old import path.
- **Recommended action:** Rewrite page and test imports to `kri-form/KRIFormContainer`, then delete the shim.
- **Verification:** `rg -n "components/KRIForm|KRIForm.tsx" frontend tests && cd frontend && npm run test:run`

### 27. Issue loading duplicate deletion (S4.2)

- **Audit claim:** Delete endpoint issue loading helpers and keep the service issue workflow loader.
- **Developer statement:** Endpoint and service loaders are duplicate enough to consolidate around the service module.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1884`; code `backend/app/api/v1/endpoints/issues/_shared/loading.py:22-65`, `backend/app/services/_issue_workflow/loading.py:22-70`.
- **Reasoning:** Issue loading is workflow/service behavior. Endpoint helpers should orchestrate, not duplicate load policy.
- **Recommended action:** Repoint endpoint callers to `_issue_workflow.loading`, delete endpoint duplicate, and update `_shared` exports.
- **Verification:** `rg -n "load_issue|load_issue_for_update|issues/_shared/loading" backend tests && pytest tests/backend/pytest -q -k "issue"`

### 28. Issue source-mutation triplicate collapse (S4.3)

- **Audit claim:** Keep `_issue_register/source_mutation.py` as canonical and delete the other source-mutation copies.
- **Developer statement:** Consolidation is correct, but it should be sequenced after source-validation and loading call sites are repointed.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1890`; code `backend/app/api/v1/endpoints/issues/_shared/links.py:11-80`, `backend/app/services/_issue_register/source_mutation.py:24-97`, `backend/app/services/_issue_workflow/source_validation.py:45-114`.
- **Reasoning:** Three copies create policy drift risk. The safe direction is service ownership with endpoint callers importing service functions.
- **Recommended action:** Consolidate after findings 8 and 27, then remove endpoint `_shared` exports made obsolete by the move.
- **Verification:** `rg -n "issue_link_department_ids|resolve_vendor_department_and_access|source_type_value" backend tests`

### 29. Source-type vocabulary canonicalization (S4.6)

- **Audit claim:** Add a canonical source-type helper and remove local definitions.
- **Developer statement:** The duplication is real, but the helper should normalize all current input shapes, not just strings.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1896`; code `backend/app/services/_issue_workflow/update_plans.py:16-20`, `backend/app/services/_issue_register/linked_context.py:103-104`, `backend/app/services/_issue_register/source_mutation.py:24-25`, `backend/app/services/_issue_workflow/transitions.py:15-17`.
- **Reasoning:** Source type values cross endpoint/service boundaries and may arrive as enum-like objects or raw strings. A too-narrow helper would recreate local conversion logic.
- **Recommended action:** Add a canonical helper in the issue register/workflow service package that handles `IssueSourceType`, enum-like values, and strings.
- **Verification:** `rg -n "source_type_value|IssueSourceType|source_type\\.value" backend tests`

### 30. Issue `_shared/__init__.py` underscore re-export pruning (S4.10)

- **Audit claim:** Prune unused underscored re-exports from `issues/_shared/__init__.py`.
- **Developer statement:** The barrel is too broad, but pruning should follow the issue loading/source-mutation consolidation to avoid repeated churn.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1902`; code `backend/app/api/v1/endpoints/issues/_shared/__init__.py:1-79`.
- **Reasoning:** A large private-symbol barrel makes endpoint ownership unclear. Sequencing it after findings 27 and 28 prevents a partial cleanup that immediately changes again.
- **Recommended action:** First move live helpers to service modules, then keep only explicit public endpoint-local exports.
- **Verification:** `rg -n "from app\\.api\\.v1\\.endpoints\\.issues\\._shared|issues\\._shared import" backend tests`

### 31. Vendor reporting service extraction (S5.5)

- **Audit claim:** Move vendor reporting row-shaping logic from `vendor_reports.py` to `vendor_reporting_service.py`.
- **Developer statement:** The endpoint still owns CSV/export row formatting, but a domain report service already exists. The target should be an export/presentation helper or an extension of the existing service, not a brand-new service assumption.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1908`; code `backend/app/services/vendor_reporting_service.py:19-113`, `backend/app/api/v1/endpoints/vendor_reports.py:26,36-119,140-146,165-170`.
- **Reasoning:** The current domain builder is already service-owned. What remains in the endpoint is output row formatting and should be moved without duplicating the service layer.
- **Recommended action:** Extract `_annual_report_rows` and `_dora_register_rows` to a reporting/export serializer owned by the vendor reporting service area.
- **Verification:** `pytest tests/backend/pytest -q -k "vendor and report"`

### 32. Vendor linked-entity tab generic (S5.8)

- **Audit claim:** Replace three near-identical vendor linked entity tabs with a generic component/hook.
- **Developer statement:** The three tabs share the same state, load, link, and unlink shape.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1914`; code `frontend/src/pages/vendors/VendorLinkedRisksTab.tsx:23-77`, `frontend/src/pages/vendors/VendorLinkedControlsTab.tsx:23-77`, `frontend/src/pages/vendors/VendorLinkedKRIsTab.tsx:23-77`, `frontend/src/pages/vendors/VendorOverviewTab.tsx:17-19,297,307,317`.
- **Reasoning:** A typed generic tab can reduce repeated UI workflow code while keeping resource-specific labels and API calls explicit.
- **Recommended action:** Build `VendorLinkedEntityTab` with resource-specific config and migrate the three tabs behind it.
- **Verification:** `cd frontend && npm run test:run -- --runInBand && npx tsc --noEmit`

### 33. Approval queued banner unification (S6.4)

- **Audit claim:** Replace the KRI-specific approval queued banner with the generic banner.
- **Developer statement:** The generic and KRI-specific banners are near duplicates.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1920`; code `frontend/src/components/forms/ApprovalQueuedBanner.tsx:4-44`, `frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx:6-50`, `frontend/src/components/kri-form/KRIFormContainer.tsx:7,159`.
- **Reasoning:** The banner behavior is not KRI-specific. A shared component avoids divergent copy, link, and close behavior.
- **Recommended action:** Let the generic banner accept required props and use it in KRI form, then delete the KRI variant.
- **Verification:** `rg -n "ApprovalQueuedBanner|KriApprovalQueuedBanner" frontend tests && cd frontend && npm run test:run`

### 34. Privileged-tier resolve authorization helper (S6.6)

- **Audit claim:** Centralize approval approve/reject privileged-tier authorization into one helper.
- **Developer statement:** The duplication is real and security-sensitive. The helper should be read-only and must preserve approve/reject distinctions.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1926`; code `backend/app/services/_approval_execution/authorization.py:16-57`, `backend/app/services/approval_execution_service.py:215-238`, `backend/app/services/approval_scenario_policy.py:134-142`.
- **Reasoning:** Approval resolve authorization is load-bearing. Centralizing it is useful, but tests must cover both approve and reject paths, privileged tier behavior, and denied-resource visibility.
- **Recommended action:** Add `assert_can_resolve(..., intent="approve"|"reject")`, keep transaction ownership in callers, and add adversarial authorization tests.
- **Verification:** `pytest tests/backend/pytest -q -k "approval and (approve or reject or authorization)"`

### 35. `usePermissions` hook removal (S7.3)

- **Audit claim:** Delete `usePermissions` and replace the single production consumer.
- **Developer statement:** The hook has one production caller, but many unit tests mock it and must be updated.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1932`; code `frontend/src/hooks/usePermissions.ts:1-20`, `frontend/src/components/layout/Sidebar.tsx:12,25`.
- **Reasoning:** Permission checks should flow through the current auth/authz hooks. Keeping a one-consumer wrapper creates another compatibility surface.
- **Recommended action:** Replace Sidebar usage with `useAuth`/`useAuthz`, delete the hook, and update test mocks.
- **Verification:** `rg -n "usePermissions" frontend tests && cd frontend && npm run test:run`

### 36. BusinessRouteGuards parametric refactor (S7.4)

- **Audit claim:** Replace four near-identical business route guards with a parametric guard.
- **Developer statement:** The duplication is mechanical, but the closed capability enumeration test should remain intact.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1938`; code `frontend/src/authz/BusinessRouteGuards.tsx:18-36`, `tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.test.tsx`, `tests/frontend/unit/src/authz/__tests__/UserRouteGuards.test.tsx`; docs `docs/security/authorization-capability-contract.md`.
- **Reasoning:** A typed factory can preserve named exported guards while removing repeated implementation.
- **Recommended action:** Implement a typed route guard factory and retain public guard names expected by route code and tests.
- **Verification:** `cd frontend && npm run test:run -- src/authz && npx tsc --noEmit`

### 37. Governance capability read from canonical builder (S7.10)

- **Audit claim:** Replace local governance capability logic in users summary with canonical `me_capabilities`.
- **Developer statement:** The local helper duplicates logic already computed by the authorization capability builder.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1944`; code `backend/app/api/v1/endpoints/users/summary.py:45-54`, `backend/app/services/_authorization_capabilities/me.py:33-74,60-62`; docs `AGENTS.md:191-205`.
- **Reasoning:** Capability metadata is the contract source for frontend and backend authorization projections. A local mirror can drift.
- **Recommended action:** Consume `build_me_capabilities` or an extracted helper from that builder and delete `_can_view_governance`.
- **Verification:** `python3 scripts/security/validate_authz_capability_contract.py && pytest tests/backend/pytest -q -k "capabilities or users"`

### 38. Endpoint-layer Pydantic model eviction (S8.6)

- **Audit claim:** Move inline endpoint Pydantic models to schema modules, except health probes.
- **Developer statement:** Moving schemas is reasonable, but the questionnaire endpoint must remain live per finding 10.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1950`; code `backend/app/api/v1/endpoints/preferences.py:15,36`, `backend/app/api/v1/endpoints/riskhub_questionnaires.py:17,24,30`, `backend/app/api/v1/endpoints/health.py:16,22`.
- **Reasoning:** Reusable request/response models belong in `app/schemas`. Health probes can stay inline because they are operational response-only shapes.
- **Recommended action:** Move preferences and questionnaire request schemas into schema modules, keep the route module, and add an architecture check for new endpoint-local models with explicit exceptions.
- **Verification:** `rg -n "class .*\\(BaseModel\\)" backend/app/api/v1/endpoints backend/app/schemas tests/backend/pytest/architecture`

### 39. AdminConsoleCapabilities real builder (S8.7)

- **Audit claim:** Replace hardcoded admin console capabilities with a real builder.
- **Developer statement:** The endpoint returns an all-true capability object behind admin routing. Even if currently equivalent for platform admins, construction belongs in the authorization capability service.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1956`; code `backend/app/api/v1/endpoints/admin/capabilities.py:12-22`, `backend/app/schemas/admin.py:99-105`; docs `docs/security/authorization-capability-contract.md:132`, `docs/security/authorization-capability-contract.json:719`.
- **Reasoning:** Capability objects should be centrally derived and testable. Hardcoded endpoint construction is a future drift point.
- **Recommended action:** Add `build_admin_console_capabilities` under `_authorization_capabilities`, preserve current semantics if platform-admin-only, and add role matrix tests.
- **Verification:** `python3 scripts/security/validate_authz_capability_contract.py && pytest tests/backend/pytest -q -k "admin and capabilities"`

### 40. Admin sub-router re-clustering (S8.11)

- **Audit claim:** Recluster the flat admin router into topical sub-routers.
- **Developer statement:** The direction may be useful, but it should follow the capability-builder cleanup and carries enough routing/doc churn to defer.
- **Verdict:** Defer
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1962`; code `backend/app/api/v1/endpoints/admin/__init__.py:7-18`; architecture guidance `AGENTS.md:220-231`.
- **Reasoning:** The current flat list is not a correctness issue. Re-clustering changes import paths, router registration, docs fallback aliases, and allowlists.
- **Recommended action:** Defer until finding 39 is complete, then evaluate whether admin route topology still causes maintenance pain.
- **Verification:** `pytest tests/backend/pytest/architecture -q -k "endpoint or admin"`

### 41. Issue workflow serialization alias removal (B-N3)

- **Audit claim:** Delete bidirectional underscore aliases in issue workflow serialization.
- **Developer statement:** The aliases are redundant; the serializer can expose one public spelling per symbol.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1968`; code `backend/app/services/_issue_workflow/serialization.py:18,21-41`.
- **Reasoning:** Aliases in both directions make it unclear which name is stable.
- **Recommended action:** Keep the public serializer function names, delete underscored aliases, and rewrite any callers.
- **Verification:** `rg -n "_serialize|serialize_.*issue|issue_workflow.serialization" backend tests`

### 42. ActorPayloadModel outbox boilerplate reduction (BE-N2)

- **Audit claim:** Add a shared `ActorPayloadModel` for outbox payloads with `actor_user_id`.
- **Developer statement:** Repeated actor fields exist across payload classes. The refactor is reasonable if idempotency-key enforcement remains untouched.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1974`; code `backend/app/services/outbox/payloads.py:10-13,30-33,36-39,41-45,48-61`, `tests/backend/pytest/architecture/test_w12_outbox_enqueue_idempotency_key_present_red.py:23-44`.
- **Reasoning:** Shared payload inheritance reduces repeated schema boilerplate, but outbox enqueue contracts are architecture-locked.
- **Recommended action:** Introduce `ActorPayloadModel(OutboxPayloadModel)` and leave `idempotency_key=` keyword-only checks intact.
- **Verification:** `pytest tests/backend/pytest/architecture/test_w12_outbox_enqueue_idempotency_key_present_red.py -q && pytest tests/backend/pytest -q -k "outbox"`

### 43. Audit adapter-emitter helper (BE-N4)

- **Audit claim:** Extract repeated `safe_entity_label` plus `log_activity` boilerplate from audit adapters.
- **Developer statement:** The repetition is real, but the helper should only cover boilerplate and must not weaken audit matrix coverage.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1980`; code `backend/app/core/audit/kri.py:30-37,53-61,79-87,104-112,132-140,160-167,184-192`, `backend/app/core/audit/vendor.py:20-27,47-55,75-83,104-112,130-137,157-164`, `backend/app/core/audit/labels.py:4`, `backend/app/core/activity_logger.py:111-169`, `backend/app/core/audit/_audit_matrix.toml`.
- **Reasoning:** Audit adapters are high-value evidence paths. A helper is useful only if event names, entity types, and metadata remain explicit at call sites.
- **Recommended action:** Extract a small emitter helper, preserve explicit matrix entries, and run audit architecture tests.
- **Verification:** `pytest tests/backend/pytest/architecture -q -k "audit" && rg -n "safe_entity_label|log_activity" backend/app/core/audit`

### 44. API surface path-prefix registry (BE-N6)

- **Audit claim:** Centralize API path-prefix policy used by security protocol, rate limit policy, and settings guard.
- **Developer statement:** The same path concepts are currently split across multiple modules.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1986`; code `backend/app/middleware/security_protocol.py:37-72`, `backend/app/middleware/rate_limit/policy.py:9-16`, `backend/app/core/settings/protocol_guard.py:10-15`.
- **Reasoning:** Fragmented prefix policy can cause one middleware to treat a path differently from another.
- **Recommended action:** Add a small registry with categories and invariant tests that all guarded prefixes are registered once.
- **Verification:** `pytest tests/backend/pytest -q -k "security_protocol or rate_limit or protocol_guard"`

### 45. Ownership resolver factory (BE-N8)

- **Audit claim:** Replace repeated ownership resolver functions with a factory.
- **Developer statement:** The duplication is real, but this is row-level authorization code and already has domain-specific projection machinery nearby.
- **Verdict:** Defer
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1992`; code `backend/app/core/_permissions/entity_access.py:12-36,39-59,62-95,98-117`, `backend/app/core/_permissions/visible_ids.py:22-71`, `backend/app/core/_permissions/entity_visibility.py:55-85`; docs `AGENTS.md:191-205`.
- **Reasoning:** A generic factory may reduce lines while hiding domain-specific access differences. This should wait for characterization tests across KRI/control ownership and department visibility.
- **Recommended action:** Defer and first add tests that pin visible IDs and ownership behavior for each entity type.
- **Verification:** `pytest tests/backend/pytest -q -k "permission or visibility or ownership"`

### 46. Frontend query-keys factory (FE-N1)

- **Audit claim:** Promote `issueQueryKeys` into a shared query-key factory and migrate inline keys.
- **Developer statement:** A shared key factory is justified; there is already a small issue-specific precedent.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:1998`; code `frontend/src/lib/issueQueryKeys.ts:1-16`, `frontend/src/hooks/useIssueDetail.ts:3,16`, `frontend/src/hooks/useIssueHistory.ts:3,24`, `frontend/src/hooks/useRemediationPlanWorkflow.ts:4,89,91,97,100`, additional inline keys across admin, dashboard, RiskHub, and layout modules.
- **Reasoning:** Query key literals are a cache-invalidation contract. Typed factories reduce cache drift and stringly-typed invalidations.
- **Recommended action:** Add `frontend/src/lib/queryKeys.ts`, migrate resource by resource, and avoid changing fetch semantics.
- **Verification:** `rg -n "queryKey: \\[|invalidateQueries\\(\\{ queryKey: \\[" frontend/src && cd frontend && npm run test:run && npx tsc --noEmit`

### 47. RetryPolicy extraction (FE-N4)

- **Audit claim:** Extract retry semantics from `ApiClientCore`.
- **Developer statement:** Extraction is sound, but the policy is specifically auth/session-refresh retry behavior, not a generic retry policy.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2004`; code `frontend/src/services/api/ApiClientCore.ts:25-30,49-95`, `frontend/src/services/api/apiRequestBuilder.ts`.
- **Reasoning:** Naming the extracted object around session refresh and auth bypass keeps the behavior understandable and prevents accidental use for unrelated retries.
- **Recommended action:** Extract a small dependency that owns silent refresh retry decision and execution, with tests for refresh once, no retry, and bypass paths.
- **Verification:** `cd frontend && npm run test:run -- src/services/api && npx tsc --noEmit`

### 48. Error-key module consolidation (FE-N6)

- **Audit claim:** Merge `getErrorMessageKey.ts` and `errorCodeMap.ts`.
- **Developer statement:** The two files form one conceptual mapping from API error code to translation key.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2010`; code `frontend/src/i18n/getErrorMessageKey.ts:1-19`, `frontend/src/i18n/errorCodeMap.ts:1-14`, callers in `apiErrors.ts`, `responseParsing.ts`, and `ApiClientCore.ts`.
- **Reasoning:** Keeping the map and lookup in separate files provides no clear abstraction benefit.
- **Recommended action:** Merge into `errorKeys.ts`, update imports, and keep existing tests for fallback/default behavior.
- **Verification:** `rg -n "getErrorMessageKey|errorCodeMap" frontend tests && cd frontend && npm run test:run`

### 49. Control execution monitoring wrapper inline (S2.2)

- **Audit claim:** Inline and delete the three-line control execution monitoring wrapper.
- **Developer statement:** The wrapper is a thin pass-through around monitoring response behavior.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2022`; code `backend/app/services/_control_execution/monitoring.py:1-11`, `backend/app/services/_control_execution/link_governance.py:25,62,91,141,170`, `tests/backend/pytest/test_architecture_deepening_contracts.py:188`.
- **Reasoning:** Keeping a module for a pass-through wrapper adds an architecture lock without meaningful ownership.
- **Recommended action:** Inline the service call in control execution governance code, delete the wrapper, and advance the lock.
- **Verification:** `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "control_execution or monitoring"`

### 50. KRI submission alias deletion (S3.2)

- **Audit claim:** Delete `_kri_history/submission.py`.
- **Developer statement:** The file is an alias module with no production imports in the current tree.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2026`; code `backend/app/services/_kri_history/submission.py:1-21`, `tests/backend/pytest/test_architecture_deepening_contracts.py:998`.
- **Reasoning:** The alias exists only to satisfy an architecture lock. If no production caller uses it, the lock should move with deletion.
- **Recommended action:** Delete the alias and update the deepening contract in the same change.
- **Verification:** `rg -n "_kri_history\\.submission|submission.py" backend tests && pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "kri"`

### 51. KRI value-application shim deletion (S3.3)

- **Audit claim:** Delete `_kri_history/value_application.py` and import direct application functions directly.
- **Developer statement:** The shim is thin, but production callers and security contract citations must move together. This should coordinate with finding 24.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2029`; code `backend/app/services/_kri_history/value_application.py:1-7`, `backend/app/services/_kri_history/direct_application.py:30-63`, `backend/app/services/_register_listings/kris.py:31,402`, `backend/app/services/_entity_mutation_lifecycle/direct_apply.py:21,200`, `backend/app/api/v1/endpoints/kris/linked_vendors.py:3`; docs `docs/security/authorization-capability-contract.md:117-118,161`, `docs/security/authorization-capability-contract.json:389,411`.
- **Reasoning:** Deleting the shim is safe only if callers and evidence pointers are updated atomically.
- **Recommended action:** Repoint callers to `direct_application`, update docs/contracts, then delete shim and architecture lock expectation.
- **Verification:** `python3 scripts/security/validate_authz_capability_contract.py && rg -n "_kri_history\\.value_application|value_application" backend docs tests`

### 52. KRI correction-plans fake seam deletion (S3.5)

- **Audit claim:** Delete `_kri_history/correction_plans.py`.
- **Developer statement:** The file is an alias/fake boundary and is only locked by architecture tests.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2032`; code `backend/app/services/_kri_history/correction_plans.py:1-14`, `tests/backend/pytest/test_architecture_deepening_contracts.py:956,962`.
- **Reasoning:** A module that exists only as a naming seam should not remain architecture-pinned.
- **Recommended action:** Delete the file and update the deepening contract in the same change.
- **Verification:** `rg -n "_kri_history\\.correction_plans|correction_plans" backend tests && pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "correction"`

### 53. Issue workflow service collapse (S4.1)

- **Audit claim:** Remove the facade/static-method issue workflow service wrappers.
- **Developer statement:** The wrappers are pass-through layers over issue workflow functions.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2035`; code `backend/app/services/issue_workflow_service.py:1-5`, `backend/app/services/_issue_workflow/service.py:25-41`, `backend/app/services/_issue_workflow/execution.py:49`, `tests/backend/pytest/test_architecture_deepening_contracts.py:1237`.
- **Reasoning:** Static-method facades add no behavior and make the actual workflow ownership harder to find.
- **Recommended action:** Rewrite imports to direct lifecycle/execution functions, delete both wrappers, and update the architecture lock.
- **Verification:** `rg -n "IssueWorkflowService|issue_workflow_service" backend tests && pytest tests/backend/pytest -q -k "issue_workflow or issue"`

### 54. Approval queue aggregator deletion (S6.3)

- **Audit claim:** Delete `_approval_queue/lifecycle.py` aggregator.
- **Developer statement:** The file only re-exports lifecycle functions from narrower modules.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2038`; code `backend/app/services/_approval_queue/lifecycle.py:1-16`.
- **Reasoning:** A re-export module without behavior adds one more import path to preserve.
- **Recommended action:** Move intended public exports to `_approval_queue/__init__.py` or import concrete modules directly, then delete `lifecycle.py`.
- **Verification:** `rg -n "_approval_queue\\.lifecycle|approval_queue/lifecycle" backend tests && pytest tests/backend/pytest -q -k "approval_queue or approval"`

### 55. Access user service facade deletion (S7.5)

- **Audit claim:** Delete `access_user_service.py` facade and import access workflow directly.
- **Developer statement:** The facade is thin, but docs and validator fixtures cite it.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2041`; code `backend/app/services/access_user_service.py:1-26`, `backend/app/api/v1/endpoints/access.py:18,209`; docs/tests `docs/security/authorization-capability-contract.md:109`, `docs/security/authorization-capability-contract.json:106,229`, `tests/backend/pytest/test_authz_capability_contract_validator.py:502`.
- **Reasoning:** Removing the facade is fine if authorization evidence pointers remain valid.
- **Recommended action:** Repoint endpoint imports and update contract docs/json plus validator fixtures in the same change.
- **Verification:** `python3 scripts/security/validate_authz_capability_contract.py && rg -n "access_user_service|AccessUserService" backend docs tests`

### 56. Directory identity service shim deletion (S7.6)

- **Audit claim:** Delete `directory_identity_service.py` and rewrite its importers.
- **Developer statement:** The shim is thin but has broader fan-out through services, tests, and contract citations.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2044`; code `backend/app/services/directory_identity_service.py:1-35`; docs `docs/security/authorization-capability-contract.md:109`, `docs/security/authorization-capability-contract.json:229`.
- **Reasoning:** This is a mechanical cleanup with contract evidence implications.
- **Recommended action:** Repoint all imports to the canonical directory identity module/package, update docs/contracts, and coordinate with graph directory packaging in finding 61.
- **Verification:** `python3 scripts/security/validate_authz_capability_contract.py && rg -n "directory_identity_service|DirectoryIdentity" backend docs tests`

### 57. Quarterly comparison facade deletion (S8.1)

- **Audit claim:** Delete `quarterly_comparison_service.py`.
- **Developer statement:** Current repository documentation explicitly preserves this facade as the public entrypoint.
- **Verdict:** Reject
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2047`; code `backend/app/services/quarterly_comparison_service.py:1-20`, `backend/app/api/v1/endpoints/dashboard/quarterly.py:12`, `backend/app/services/_quarterly_comparison/README.md:16`, `tests/backend/pytest/test_architecture_deepening_contracts.py:559-568`.
- **Reasoning:** Deleting the facade would contradict the package README and an architecture lock. This is not merely dead code; it is the documented public service entrypoint.
- **Recommended action:** Keep the facade unless a new ADR/architecture change intentionally removes public service entrypoint facades.
- **Verification:** `rg -n "quarterly_comparison_service|_quarterly_comparison/README" backend tests`

### 58. Orphaned item facade + static-method class deletion (S8.3)

- **Audit claim:** Delete the orphaned item service facade and static-method class wrapper.
- **Developer statement:** The wrappers add little behavior, but callers must be rewritten carefully.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2050`; code `backend/app/services/orphaned_item_service.py:1-7`, `backend/app/services/_orphaned_items/service.py:20-80`.
- **Reasoning:** Function-level imports are clearer than a class of static rebinds, but the change has multiple callers and architecture lock references.
- **Recommended action:** Repoint callers to concrete `_orphaned_items` functions, then delete the facade/class and update locks.
- **Verification:** `rg -n "OrphanedItemService|orphaned_item_service|_orphaned_items.service" backend tests && pytest tests/backend/pytest -q -k "orphan"`

### 59. Control monitoring package consolidation (S2.10)

- **Audit claim:** Consolidate scattered control monitoring modules into one monitoring package.
- **Developer statement:** The current monitoring read/status/response helpers are fragmented, but consolidation should follow the easier shim deletions.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2055`; code `backend/app/services/_monitoring_status/controls.py:37-46`, `backend/app/services/_monitoring_status/queries.py:39-75`, `backend/app/services/_monitoring_response.py:115-128`, `backend/app/services/_control_execution/monitoring.py:9-11`.
- **Reasoning:** A package-level consolidation can improve ownership, but doing it before findings 17 and 49 would mix mechanical import changes with structural design.
- **Recommended action:** First delete endpoint/wrapper shims, then consolidate remaining monitoring read-model and response helpers under a service-owned package.
- **Verification:** `pytest tests/backend/pytest -q -k "monitoring or control"`

### 60. PrivilegeContext request-scoped object (S6.6)

- **Audit claim:** Introduce a request-scoped `PrivilegeContext` for privileged KRI/approval flows.
- **Developer statement:** The concept may be useful, but it is a cross-cutting authorization refactor touching load-bearing KRI write paths.
- **Verdict:** Defer
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2058`; code `backend/app/services/_kri_history/direct_application.py:30-63`, `backend/app/services/_kri_history/approval_intake.py:30-85`, `backend/app/services/_kri_history/recording.py:29-85`, `backend/app/services/_approval_execution/authorization.py:16-57`.
- **Reasoning:** The smaller approval resolve helper in finding 34 and KRI shim cleanup in finding 51 should land first. Only then will the remaining privilege parameters be clear.
- **Recommended action:** Defer until after #34 and #51, then design with explicit authorization tests for every privileged KRI write path.
- **Verification:** `pytest tests/backend/pytest -q -k "kri and (approval or privileged or record)"`

### 61. `graph_directory` adapter package move (S7.7)

- **Audit claim:** Move graph directory service/auth/transport/error modules into a `_graph_directory` package.
- **Developer statement:** The move is reasonable as a packaging cleanup, but imports, tests, and security contract citations need coordinated updates.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2061`; code `backend/app/services/graph_directory_auth.py`, `backend/app/services/graph_directory_service.py`, `backend/app/services/graph_directory_transport.py`, `backend/app/services/graph_directory_errors.py`, `backend/app/services/directory_provider_service.py:18`; tests `tests/backend/pytest/test_graph_directory_components.py`, `tests/backend/pytest/test_entra_confidential_credentials.py`; docs `docs/security/authorization-capability-contract.md:109`, `docs/security/authorization-capability-contract.json:229`.
- **Reasoning:** Grouping adapter components under one package improves locality, but stale imports and docs would create broken evidence paths.
- **Recommended action:** Move modules into `_graph_directory/`, provide temporary package exports only if needed, and update tests/contracts with finding 56.
- **Verification:** `pytest tests/backend/pytest/test_graph_directory_components.py tests/backend/pytest/test_entra_confidential_credentials.py -q && python3 scripts/security/validate_authz_capability_contract.py`

### 62. KRI vendor assignment consolidation (S5.9)

- **Audit claim:** Route KRI vendor assignment through canonical vendor-link workflow.
- **Developer statement:** The current bulk assignment code directly mutates link tables, but changing it affects audit emission and vendor-link semantics.
- **Verdict:** Defer
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2064`; code `backend/app/services/kri_vendor_assignment.py:81-119`, `backend/app/services/_vendor_links/workflow.py:265-333`.
- **Reasoning:** The finding depends on the vendor-link migration/mixin direction in finding 69. Doing it early risks mismatched audit cardinality or link semantics.
- **Recommended action:** Defer until vendor-link ownership and table structure are settled; then route reconciliation through canonical create/delete workflow with audit tests.
- **Verification:** `pytest tests/backend/pytest -q -k "vendor and kri and assignment"`

### 63. Outbox dispatch SchedulerJobRun instrumentation (BE-N7)

- **Audit claim:** Wrap outbox dispatch in `execute_tracked_job`.
- **Developer statement:** Using the common scheduler tracker is reasonable, but the current outbox state feeds admin/status behavior and must not disappear.
- **Verdict:** Accept with modification
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2067`; code `backend/app/core/scheduler_jobs.py:47,57,67,86,100,111,114-140`, `backend/app/core/scheduler_tracking.py:92`, `backend/app/services/outbox/dispatcher.py:17-110`, `tests/backend/pytest/test_scheduler_runtime.py:144`.
- **Reasoning:** Consistent scheduler instrumentation is valuable. The implementation must preserve or map the lightweight `_outbox_dispatch_state` currently used by runtime/status code.
- **Recommended action:** Wrap dispatch with tracked job semantics while maintaining admin-readable outbox dispatch state.
- **Verification:** `pytest tests/backend/pytest/test_scheduler_runtime.py -q && pytest tests/backend/pytest -q -k "outbox and scheduler"`

### 64. QueryClient defaults centralization (FE-N2)

- **Audit claim:** Extract React Query client defaults from `App.tsx`.
- **Developer statement:** Query client policy should live with API/query infrastructure, not the root component.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2070`; code `frontend/src/App.tsx:11-18`.
- **Reasoning:** Centralizing defaults makes it easier to align retry/stale-time behavior across resource query factories.
- **Recommended action:** Create `frontend/src/services/api/queryClient.ts` or equivalent and import the configured client in `App.tsx`.
- **Verification:** `cd frontend && npm run test:run && npx tsc --noEmit`

### 65. CRUD capability schema reuse (FE-N3)

- **Audit claim:** Add reusable CRUD capability schemas in frontend API schemas.
- **Developer statement:** Repeated capability shapes exist, while common schemas currently only cover collection capabilities and generic helpers.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2073`; code `frontend/src/services/api/schemas/common.ts:1-99`, repeated capability fields in frontend entity schemas for risks, controls, KRIs, vendors, and issues; docs `docs/security/capability-catalog.json`.
- **Reasoning:** Capability shapes are a contract with backend metadata. Shared schemas plus a snapshot against the catalog reduce drift.
- **Recommended action:** Add shared CRUD/resource capability schemas and verify them against `capability-catalog.json`.
- **Verification:** `cd frontend && npm run test:run && npx tsc --noEmit && rg -n "capabilities:" frontend/src/services/api/schemas`

### 66. AuthContext provider split (FE-N5)

- **Audit claim:** Split `AuthContext` into session and actions providers.
- **Developer statement:** The split could reduce re-renders and clarify responsibilities, but auth/session behavior is load-bearing and tied to upcoming capability and ADR work.
- **Verdict:** Defer
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2076`; code `frontend/src/contexts/AuthContext.tsx:11-23,27-68`, `frontend/src/services/session/bootstrap.ts`, `manager.ts`, `store.ts`, `refreshHint.ts`, `logoutSuppression.ts`, `sso.ts`, `types.ts`, `index.ts`; docs `docs/security/authorization-capability-contract.md:131`.
- **Reasoning:** The current provider exposes session state, auth actions, and `me_capabilities`. Splitting it before ADR-011 and admin/governance capability cleanups risks subtle auth regressions.
- **Recommended action:** Defer until findings 39, 37, and 72 are complete; then split with render and auth-flow tests.
- **Verification:** `cd frontend && npm run test:run -- src/contexts src/services/session && npx tsc --noEmit`

### 67. `useResourcePanelQuery` generic hook (FE-N7)

- **Audit claim:** Extract a generic resource panel query hook from RiskHub config resources.
- **Developer statement:** The current hook contains a reusable query/mutation invalidation pattern.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2079`; code `frontend/src/components/riskhub/useRiskHubConfigResource.ts:69-88,90-128`.
- **Reasoning:** A typed generic hook can reduce repeated panel query code after query-key factories exist.
- **Recommended action:** Extract after finding 46 so the hook uses canonical query keys from the start.
- **Verification:** `cd frontend && npm run test:run -- src/components/riskhub && npx tsc --noEmit`

### 68. WidgetShell + dashboard scoped query (FE-N8)

- **Audit claim:** Introduce `WidgetShell`, dashboard filter context, and scoped query helpers across dashboard widgets.
- **Developer statement:** The dashboard likely needs this cleanup, but it is a broad UX/state refactor across many widgets.
- **Verdict:** Defer
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2082`; code `frontend/src/pages/dashboard/useDashboardOverviewState.ts:20-31`, dashboard components under `frontend/src/components/dashboard/` and `frontend/src/pages/dashboard/`.
- **Reasoning:** This is too broad to bundle with architecture cleanup. It should have its own UI regression plan and screenshots.
- **Recommended action:** Defer to a dedicated dashboard refactor after query keys and auth context work settle.
- **Verification:** `cd frontend && npm run test:run -- src/pages/dashboard src/components/dashboard && npx tsc --noEmit`

### 69. Vendor link tables to mixin/polymorphic merge (S5.2)

- **Audit claim:** Introduce an abstract vendor-link mixin and later merge vendor link tables polymorphically.
- **Developer statement:** This is high-risk migration work and should not be treated as ordinary cleanup.
- **Verdict:** Defer
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2087`; code `backend/app/models/vendor_risk_link.py:16-28`, `backend/app/models/vendor_control_link.py:16-28`, `backend/app/models/vendor_kri_link.py:16-26`; docs `docs/adr/ADR-010-postgres-migration-rehearsal-contract.md:11-30`, `docs/adr/ADR-005-archivable-mixin-schema-contract.md:11-19,27-39`.
- **Reasoning:** Table inheritance and polymorphic merge affect migrations, foreign keys, archive semantics, and all vendor-link rows.
- **Recommended action:** Defer to a forward-only migration window with rehearsal, data checks, and rollback/compatibility planning.
- **Verification:** `make -f scripts/Makefile test-architecture-locks && cd backend && alembic history`

### 70. Vendor.status enum drop (S5.7)

- **Audit claim:** Drop `Vendor.status` and legacy inactive handling.
- **Developer statement:** The status enum is currently active-only legacy state, but removal is migration-coupled with vendor-link/archive cleanup.
- **Verdict:** Defer
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2091`; code `backend/app/models/vendor.py:22-24,81-82`; docs `docs/adr/ADR-005-archivable-mixin-schema-contract.md:13-16`, `docs/adr/ADR-010-postgres-migration-rehearsal-contract.md:23-30`.
- **Reasoning:** Dropping a persisted column/enum requires data validation and migration sequencing, especially around legacy inactive rows.
- **Recommended action:** Bundle with finding 69 and first confirm no rows rely on `status='inactive' AND is_archived=false`.
- **Verification:** `rg -n "VendorStatus|vendor.status|status='inactive'|inactive" backend tests docs`

### 71. Frontend session module merge (S7.8)

- **Audit claim:** Merge the session service files into fewer lifecycle modules.
- **Developer statement:** The current session area is fragmented, but it is load-bearing and should follow ADR-011 and AuthContext work.
- **Verdict:** Defer
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2095`; code `frontend/src/services/session/bootstrap.ts`, `manager.ts`, `store.ts`, `refreshHint.ts`, `logoutSuppression.ts`, `sso.ts`, `types.ts`, `index.ts`; docs `docs/security/authorization-capability-contract.md:131`.
- **Reasoning:** Session bootstrap, refresh, logout suppression, SSO, and capability reachability are auth-critical. Merging modules before the model is ratified increases regression risk.
- **Recommended action:** Defer until ADR-011 is ratified and finding 66 has a tested provider split strategy.
- **Verification:** `cd frontend && npm run test:run -- src/services/session src/contexts && npx tsc --noEmit`

### 72. ADR-011 Auth scheme and session model (S7.9)

- **Audit claim:** Create ADR-011 for auth scheme and session model.
- **Developer statement:** This ADR is needed before major frontend session/auth refactors.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2101`; docs `docs/adr/ADR-002-service-owned-transactions.md:13-15,40`, `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml:1-47`, `backend/app/core/security.py:107-136`, `docs/security/authorization-capability-contract.md:131`.
- **Reasoning:** Mock/hybrid auth, session refresh, frontend provider shape, and capability reachability need one architectural source of truth.
- **Recommended action:** Write `docs/adr/ADR-011-auth-scheme-and-session-model.md` before findings 66 and 71.
- **Verification:** `test -f docs/adr/ADR-011-auth-scheme-and-session-model.md && rg -n "ADR-011|auth scheme|session model" docs/adr docs/security`

### 73. ADR-012 KRI time-series period algebra (S3.12)

- **Audit claim:** Create ADR-012 for KRI period algebra and deadline classification.
- **Developer statement:** The ADR is justified because KRI period/deadline concepts are spread across multiple service modules.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2104`; code `backend/app/services/_kri_history/periods.py:21-93`, `backend/app/services/_kri_history/constants.py:1-2`, `backend/app/services/kri_deadline_service.py:45-81`, `backend/app/services/_config/lookup.py:26`.
- **Reasoning:** A document-first ADR will prevent period cleanup from changing deadline semantics accidentally.
- **Recommended action:** Write `docs/adr/ADR-012-kri-time-series.md` and then plan implementation cleanup separately.
- **Verification:** `test -f docs/adr/ADR-012-kri-time-series.md && rg -n "period|deadline|KRI" docs/adr/ADR-012-kri-time-series.md backend/app/services/_kri_history backend/app/services/kri_deadline_service.py`

### 74. ADR-007 amendment - three context categories

- **Audit claim:** Amend ADR-007 to classify bounded context package categories.
- **Developer statement:** The amendment is needed because the current ADR describes fewer contexts than the service package reality.
- **Verdict:** Accept
- **Evidence reviewed:** Audit `.planning/audits/2026-05-09-deepening-audit.md:2107`; docs `docs/adr/ADR-007-bounded-context-taxonomy.md:11-14`; code service packages under `backend/app/services/_*`, including `_monitoring_status`, `_monitoring_response`, `_approval_queue`, and `_vendor_links`.
- **Reasoning:** The ADR should distinguish domain contexts, technical support packages, and adapter/helper packages before more package moves are made.
- **Recommended action:** Amend ADR-007 before or alongside graph directory and monitoring package moves.
- **Verification:** `rg -n "^##|bounded context|_monitoring|_approval_queue|_vendor_links" docs/adr/ADR-007-bounded-context-taxonomy.md backend/app/services`
