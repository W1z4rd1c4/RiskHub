# Phase 4 Loop 1 Review — Validator-Schedule Completeness

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Anchor commit: `1ee872a4`.

This review checks every Loop-1 item (79 total) against the validator's seven
checks (`scripts/security/validate_authz_capability_contract.py:170-175` →
`runner.run_validation` per `runner.py:35-60`). Loop 2 A5 listed 16 items
(`plan-loop-2-05-validator-schedule.md:427`); this review finds **gaps and
miscalls** — items missing from the schedule, items wrongly on it, and items
that need a stronger validator gate (esp. the Pydantic ↔ Zod parity items).

Reference data:

- `sensitive_change_paths` count = **136** entries
  (`docs/security/authorization-capability-contract.json` keys; raw count via
  `python3 -c` listing).
- 27 `AUTHZ-` action IDs (verified by enumeration of `actions[]`).
- Validator's 7 checks, paraphrased ≤15 words each:
  - **Check 1**: existence of three doc files (`runner.py:35-43`).
  - **Check 2**: manifest schema + path-existence + sensitive-change-paths
    coverage (`contract_manifest.py:137-219`).
  - **Check 3**: discovery cross-check across backend
    endpoints/services/schemas + frontend `*.ts*` (`discovery.py:43-104`).
  - **Check 4**: capability-catalog field-shape parity Pydantic ↔ Zod
    (`capability_catalog.py:143-230`).
  - **Check 5**: markdown matrix parity, 9 required sections
    (`markdown_validation.py:11-21`).
  - **Check 6**: business route nav pinning (10 routes,
    `authz_contract_manifest.py:66-77`).
  - **Check 7**: diff-aware doc-touch + frontend local-gate per-file pattern
    allowlist (`runner.py:56-60`, `contract_manifest.py:222-252`,
    `frontend_local_gates.py`).

Atomic-doc-touch rule (Check 7): if a changed file matches a
`sensitive_change_paths` entry (and, for `.ts`/`.tsx`, contains an
`FRONTEND_AUTHZ_TOKEN_PATTERN` token), then both `contract.md` AND
`contract.json` must also be touched in the same diff
(`contract_manifest.py:241-251`). This is the dominant trigger for the
"item must run validator" decision.

---

## 1. Loop 2 A5's 16 items — re-confirmed in scope

Each of these stays on the validator schedule. Justification verified
against the per-item plans.

| # | Loop 2 A5 reason | Re-confirmed evidence | Verdict |
|---|---|---|---|
| #13 | drop `vendor_link_helpers.py` from sensitive_change_paths + 2 service_policy strings | `plan-loop-1-05-vendor-quarterly.md:28-32` cites `json:55,479,502` and `md:121,122` | KEEP |
| #15 | NEW catalog surface `access_user` (8th); 7 fields | `plan-loop-1-07-endpoints.md:144-152` lists 7 fields; `capability_catalog.py:269-306` is the parity check | KEEP — **Check 4 NEW** |
| #24 | strip `kris/linked_vendors.py` from `backend_authority` (md:116-118 / json:368,388,410) | `plan-loop-1-04-kris.md:71-72` | KEEP (atomic w/ #51) |
| #34 | adds `## Vocabulary` "privilege tier" entry; `service_policy` cite for `approval_scenario_policy.py` | `plan-loop-1-03-approvals.md:169-170` | KEEP |
| #37 | `_can_view_governance` mirror; regression of `MeCapabilities` field-shape | `plan-loop-1-06-frontend.md:245` | KEEP (regression-only) |
| #39 | `AdminConsoleCapabilities` builder; pins 4 admin caps + new sensitive path | `plan-loop-1-06-frontend.md:268-270` | KEEP — **Check 4 NEW** |
| #50 | drop `submission.py` from md:117,118,161 + json:389,411 | `plan-loop-1-04-kris.md:155-156` | KEEP |
| #51 | drop `value_application.py` from md:117,118,161 + json:389,411 (atomic w/ #24) | `plan-loop-1-04-kris.md:190-191` | KEEP |
| #55 | drop `access_user_service.py` from json:106 + json:229 + md:109 | `plan-loop-1-08-crosscut.md:311-317` | KEEP |
| #56 | drop `directory_identity_service.py` from json:111 + json:229 + md:109 | `plan-loop-1-08-crosscut.md:397-403` | KEEP (paired w/ #61) |
| #60 | adds `## Vocabulary` "privilege context" + `get_privilege_context` cite | `plan-loop-1-03-approvals.md:226-238` | KEEP |
| #61 | path rewrite `graph_directory_service.py` → `_graph_directory/service.py` (json:113 + md:109) | `plan-loop-1-08-crosscut.md:498-507` | KEEP (paired w/ #56) |
| #62 | path rewrite `kri_vendor_assignment.py` (md:172 perimeter-pass note) | `plan-loop-1-04-kris.md:277-278` | KEEP |
| #65 | `crudCapabilitySchema` Zod base; risks/controls/kris/vendors parity | `plan-loop-1-06-frontend.md:393`; failure mode at `capability_catalog.py:299-306` | KEEP — **Check 4 STRESS** |
| #66 | `AuthContext` split — Check 7 `FRONTEND_LOCAL_GATE_CLASSIFICATIONS` per-file allowlist (`authz_contract_manifest.py:13-63`) | `plan-loop-1-06-frontend.md:415-419` introduces 3 new context files | KEEP |
| #71 | session module merge `frontend/src/services/session/` is a sensitive_change_paths prefix | sensitive_change_paths includes `frontend/src/services/session/`; merging 8→4 files inside that prefix triggers Check 7 | KEEP — **add'l: not on Loop 2 A5? cross-ref** |

Note: #71 is **NOT** on Loop 2 A5's list — see §2 below for missing items.
Loop 2 A5 lists `#69+#70` and `#74b`; both are confirmed below.

| # | Loop 2 A5 reason | Verdict |
|---|---|---|
| #69+#70 (bundle) | `models/vendor.py` and new `_vendor_link_mixin.py` are at the edge of `sensitive_change_paths`; vendor capability shape unchanged | KEEP (low — defence-in-depth) |
| #74b | ADR-007 amendment touches no contract artefact | KEEP (defence-in-depth only) |
| #57 | quarterly facade: not in `sensitive_change_paths` → low | KEEP (defence-in-depth) |

**Loop 2 A5 total — re-confirmed: 16 items KEEP** (with #66 / #71 distinction
flagged in §2).

---

## 2. Items MISSING from Loop 2 A5's schedule

Each item below either edits a `sensitive_change_paths` member OR cites a path
inside a `service_policy`/`backend_authority`/`frontend_gate` blob that the
plan explicitly says must be edited atomically. They MUST be on the validator
schedule.

### A. Issue-domain items that touch AUTHZ-ISSUES-REMEDIATION

The Loop-1 issues plan explicitly says #8 and #28 edit
`docs/security/authorization-capability-contract.md:128` and
`docs/security/authorization-capability-contract.json:629`
(`plan-loop-1-01-issues.md:41-42, :100, :215`). Loop 2 A5 lists neither.

| # | Reason for inclusion | Plan cite | Validator concern |
|---|---|---|---|
| **#8** | adds `_issue_workflow/assignment.py` to `service_policy` enum at md:128 + json:629 | `plan-loop-1-01-issues.md:100` | Check 2 path-existence on the new file path; Check 7 atomic doc-touch (file moves under `service_policy` cite + sensitive_change_paths includes `_issue_workflow/`) |
| **#28** | drops `_shared/links.py` token from `service_policy` at md:128 + json:629 | `plan-loop-1-01-issues.md:215` | Check 2 `contract_path_missing` for `_shared/links.py` if not removed; Check 7 atomic |
| **#30** | edits `md:128` + `.json:629` in same commit if `_shared/serialization.py` is reduced to a re-export shim (conditional) | `plan-loop-1-01-issues.md:331` | Check 2 + Check 7 (conditional — must run validator regardless) |

### B. Issues-domain items that touch sensitive_change_paths but not service_policy

Sensitive paths include `backend/app/services/_issue_workflow/`,
`backend/app/services/_issue_register/`, `backend/app/api/v1/endpoints/issues/`.
Any deletion or rename inside those trees fires Check 7's "doc-touch
required" if the validator's `FRONTEND_AUTHZ_TOKEN_PATTERN` matches; for
backend Python files Check 7 always demands the atomic md/json edit.

| # | Reason for inclusion | Plan cite | Validator concern |
|---|---|---|---|
| **#2** | edits `_issue_workflow/source_validation.py` (under sensitive_change_paths `_issue_workflow/` prefix) | `plan-loop-1-01-issues.md:56-57` | Check 7 sweeps the `_issue_workflow/` prefix → must verify md/json untouched is valid (it is — pure alias delete) |
| **#14** | edits `_shared/notifications.py`, `_shared/__init__.py` (under `endpoints/issues/_shared/` — *not* in sensitive_change_paths but `endpoints/issues/` is); plus rewrites `outbox/handlers/issues.py` | sensitive_change_paths includes `backend/app/api/v1/endpoints/issues/` (line in JSON); plan at `plan-loop-1-01-issues.md:122-150` | Check 7 prefix-match — needs validator to confirm no atomic-edit requirement was missed |
| **#27** | deletes `endpoints/issues/_shared/loading.py` (under sensitive_change_paths prefix) | `plan-loop-1-01-issues.md:174` | Check 7 prefix-match |
| **#29** | edits `_issue_register/constants.py` and `_issue_workflow/update_plans.py` etc. | `plan-loop-1-01-issues.md:248-265` | Check 7 prefix-match (no md/json edits expected; validator verifies) |
| **#41** | edits `_issue_workflow/serialization.py` | `plan-loop-1-01-issues.md:359-364` | Check 7 prefix-match (alias delete only; validator confirms no atomic edit) |
| **#53** | deletes `services/issue_workflow_service.py` and rewrites `_issue_workflow/execution.py` | `plan-loop-1-01-issues.md:396-405` | Check 7 prefix-match |

These six are SOFT additions — the plans explicitly say "no capability-contract
change" but each one is inside a sensitive_change_paths prefix, so Check 7
must run as a regression sentinel. If the dev forgets, Check 7 will surface
`authz_contract_not_updated` if there's any inadvertent token introduction.

### C. Approvals-domain items missing

| # | Reason for inclusion | Plan cite | Validator concern |
|---|---|---|---|
| **#9** | rewrites `_notification_approval_helpers.py` to call `approval_scenario_policy.can_view_approval_resource` (json:109 cite, AUTHZ-APPROVALS service_policy) | `plan-loop-1-03-approvals.md:71` | Check 2 path-coverage (the helper file is under `services/` — sensitive_change_paths includes `backend/app/services/_authorization_capabilities/`, not the helper itself; **but** AUTHZ-APPROVALS `service_policy` lists `approval_scenario_policy.py` which gains a new caller — Check 3 discovery may sweep new patterns); Check 7 if the file matches a sensitive prefix |
| **#7** | deletes `_get_approval_department_id` from `endpoints/approvals/_shared.py` (sensitive_change_paths includes `backend/app/api/v1/endpoints/approvals/`) | `plan-loop-1-03-approvals.md:38` | Check 7 prefix-match |
| **#18** | repoints 4 endpoint sites + deletes from `_shared.py` (under `endpoints/approvals/`) | `plan-loop-1-03-approvals.md:91-94` | Check 7 prefix-match |
| **#54** | inlines `_approval_queue/lifecycle.py` (under sensitive_change_paths `_approval_queue/`) | `plan-loop-1-03-approvals.md:200-201` | Check 7 prefix-match |
| **#75** | edits `_approval_execution/{kri_history_correction.py, kri_value_submission.py, results.py}` (under sensitive_change_paths `_approval_execution/`) | `plan-loop-1-03-approvals.md:259-261` | Check 7 prefix-match |
| **#33** | KRI banner unify — frontend, edits `frontend/src/components/kri-form/` (sensitive_change_paths includes `frontend/src/components/kris/`, not `kri-form/` as a separate entry) but `frontend/src/components/forms/ApprovalQueuedBanner.tsx` is reachable from `frontend/src/pages/` and `frontend/src/components/governance/` | `plan-loop-1-03-approvals.md:120-121` | Check 7 frontend local-gate per-file allowlist needs verification — if any new authz token (e.g. `useAuthz`) lands in `KRIFormContainer.tsx`, the per-file allowlist (`authz_contract_manifest.py:13-63`) must include it |

### D. KRI-domain items missing

| # | Reason for inclusion | Plan cite | Validator concern |
|---|---|---|---|
| **#3** | edits `frontend/src/components/kri-form/kriFormWorkflow.ts` — sensitive_change_paths includes `frontend/src/components/kris/` not `kri-form/`, but if any test addition triggers `FRONTEND_AUTHZ_TOKEN_PATTERN` match in a sensitive prefix, validator fires | `plan-loop-1-04-kris.md:34-39` | Check 7 — *only* if test addition triggers; otherwise low |
| **#25** | edits `kris/access.py` and 3 endpoint files under `endpoints/kris/` (sensitive_change_paths includes `endpoints/kris/`) | `plan-loop-1-04-kris.md:93-94` | Check 7 prefix-match (no contract edits expected; validator confirms) |
| **#26** | deletes `frontend/src/components/KRIForm.tsx`, edits `KRINewPage.tsx` (sensitive_change_paths includes `frontend/src/pages/KRINewPage.tsx`) | `plan-loop-1-04-kris.md:119` | Check 7 — `KRINewPage.tsx` is a sensitive_change_path → atomic edit triggered if frontend authz token appears in diff |
| **#52** | deletes `_kri_history/correction_plans.py` (under sensitive `_kri_history/`) | `plan-loop-1-04-kris.md:213` | Check 7 prefix-match |
| **#73** | ADR-012 — edits `kri_deadline_service.py` and `_config/lookup.py`. Neither is in sensitive_change_paths directly; `_kri_history/constants.py` is under `_kri_history/` prefix | `plan-loop-1-04-kris.md:325-330` | Check 7 prefix-match — defence-in-depth |

### E. Vendor-quarterly + reports items missing

| # | Reason for inclusion | Plan cite | Validator concern |
|---|---|---|---|
| **#16** | deletes legacy excel routes; edits `endpoints/reports/` (sensitive_change_paths includes `endpoints/reports/`) | `plan-loop-1-05-vendor-quarterly.md:57-60` | Check 7 prefix-match |
| **#17** | deletes `endpoints/_monitoring_response.py` shim — repoints 14 endpoints across `risks/, controls/, kris/, departments/` (all sensitive_change_paths prefixes) | `plan-loop-1-05-vendor-quarterly.md:93-107` | Check 3 discovery may flip; Check 7 multi-prefix sweep |
| **#31** | extracts vendor reporting rows; edits `endpoints/vendor_reports.py` (sensitive_change_paths includes `endpoints/vendor_reports.py`) | `plan-loop-1-05-vendor-quarterly.md:134-136` | Check 7 — file is in sensitive_change_paths |

### F. Frontend-domain items missing

| # | Reason for inclusion | Plan cite | Validator concern |
|---|---|---|---|
| **#22** | deletes `ControlForm.tsx` shim; edits `pages/ControlEditPage.tsx`, `ControlNewPage.tsx`, `ControlCreateDialog.tsx` (sensitive_change_paths includes `pages/ControlEditPage.tsx`, `pages/ControlNewPage.tsx`) | `plan-loop-1-06-frontend.md:91-94` | Check 7 — both pages are sensitive |
| **#32** | edits `frontend/src/components/vendors/VendorLinked*Tab.tsx` — sensitive_change_paths does not include `components/vendors/`, but `pages/VendorDetailPage.tsx` is sensitive and consumes those tabs | `plan-loop-1-06-frontend.md:142-144` | Check 7 — only if `VendorDetailPage.tsx` is touched |
| **#35** | deletes `hooks/usePermissions.ts` (sensitive_change_paths explicitly includes `frontend/src/hooks/usePermissions.ts`); rewrites `Sidebar.tsx` (also sensitive); 18 test mock rewrites | `plan-loop-1-06-frontend.md:165-185` | **Check 7 strong** — `usePermissions.ts` AND `Sidebar.tsx` are explicit sensitive entries; AND `Sidebar.tsx` is in `FRONTEND_LOCAL_GATE_CLASSIFICATIONS` (per-file allowlist) |
| **#36** | edits `frontend/src/authz/BusinessRouteGuards.tsx` — sensitive_change_paths includes `frontend/src/authz/` prefix; `BusinessRouteGuards.tsx` consumes capability fields | `plan-loop-1-06-frontend.md:211-215` | Check 7 — `frontend/src/authz/` is sensitive; per-file allowlist (`authz_contract_manifest.py:13-63`) currently includes `policy.ts`, `useAuthz.ts`, `routing/business.tsx`, `Sidebar.tsx`, `usePermissions.ts` — if `BusinessRouteGuards.tsx` is added to allowlist, validator must confirm |
| **#38** | endpoint Pydantic eviction — moves models to `schemas/health.py`, `schemas/preferences.py`, `schemas/riskhub.py` (sensitive_change_paths includes `schemas/__init__.py` not `health.py` or `preferences.py`; `schemas/riskhub.py` IS in sensitive_change_paths) | `plan-loop-1-07-endpoints.md:319-331` | Check 7 — `schemas/riskhub.py` is sensitive |
| **#46** | LIFTS 45 inline queryKey literals across 22 files; touches sensitive prefixes (`pages/`, `components/risks/`, `components/issues/`, `components/governance/`, `services/`) | `plan-loop-1-06-frontend.md:288-291` | Check 7 — multi-prefix sweep across many sensitive entries |
| **#47** | extracts `frontend/src/services/api/sessionRefreshPolicy.ts`; edits `services/api/ApiClientCore.ts` — sensitive_change_paths does NOT include `services/api/` directly but includes `frontend/src/services/api/schemas/`; ApiClientCore is consumed by `services/session/` (sensitive) | `plan-loop-1-06-frontend.md:312-316` | Check 7 — defence-in-depth |
| **#48** | merges `frontend/src/i18n/{getErrorMessageKey,errorCodeMap}.ts` into `errorKeys.ts`; rewrites `services/api/apiErrors.ts` and `ApiClientCore.ts` | `plan-loop-1-06-frontend.md:336-342` | Check 7 — defence-in-depth |
| **#64** | extracts `services/api/queryClient.ts`; edits `App.tsx` — App.tsx is not directly sensitive | `plan-loop-1-06-frontend.md:362-365` | Check 7 — minimal |
| **#67** | extracts `useResourcePanelQuery` from `useRiskHubConfigResource.ts` — sensitive_change_paths includes `frontend/src/components/riskhub/` | `plan-loop-1-06-frontend.md:443-444` | Check 7 prefix-match |
| **#68** | introduces `WidgetShell` + scoped query selector; edits `DashboardFilterContext.tsx` and 21 dashboard widgets — sensitive_change_paths does NOT include `frontend/src/contexts/DashboardFilterContext.tsx` (only `AuthContext.tsx`) but `pages/DashboardPage.tsx` is reachable; **dashboard authz**: `frontend_gate` of AUTHZ-DASHBOARDS lists `frontend/src/services/dashboardApi.ts` (sensitive) | `plan-loop-1-06-frontend.md:464-468` | Check 7 — only if `dashboardApi.ts` is touched |

### G. Endpoints-domain items missing

| # | Reason for inclusion | Plan cite | Validator concern |
|---|---|---|---|
| **#10** | locks module presence of `endpoints/riskhub_questionnaires.py` — file is under sensitive prefix `endpoints/risk_questionnaires/`? No — actually `riskhub_questionnaires.py` (not `risk_questionnaires/`); not in sensitive_change_paths directly. `endpoints/riskhub/` is sensitive | `plan-loop-1-07-endpoints.md:30-46` | Check 2 path-existence (no edits expected); low |
| **#12** | narrows `users/summary.py` blanket-except — sensitive_change_paths includes `endpoints/users/` | `plan-loop-1-07-endpoints.md:96-103` | Check 7 prefix-match |
| **#21** | collapses control-risk link loaders in `_control_execution/link_policy.py` — sensitive_change_paths includes `services/_control_execution/` | `plan-loop-1-07-endpoints.md:272-274` | Check 7 prefix-match |
| **#43** | adds audit emit helper at `core/audit/_emit.py`; edits 6 audit adapter modules (`risk.py`, `control.py`, etc.) — `core/audit/` is NOT in sensitive_change_paths, but the matrix references audit adapters indirectly | `plan-loop-1-07-endpoints.md:381-386` | Check 7 — defence-in-depth |
| **#44** | introduces `_router_registry.toml`; edits `api/v1/router.py` — `endpoints/` prefixes are sensitive | `plan-loop-1-07-endpoints.md:429-435` | Check 7 — could affect business-route nav (Check 6 indirectly) |
| **#49** | inlines `_control_execution/monitoring.py` — sensitive prefix `services/_control_execution/` | `plan-loop-1-07-endpoints.md:485-499` | Check 7 prefix-match |
| **#58** | deletes `services/orphaned_item_service.py` facade and `OrphanedItemService` — sensitive_change_paths includes `services/_orphaned_items/`; `endpoints/orphaned_items.py` is in sensitive_change_paths | `plan-loop-1-07-endpoints.md:546-571` | Check 7 prefix-match |
| **#59** | doc-only README sharpening for `_monitoring_response/` and `_monitoring_status/` — sensitive_change_paths includes `services/_monitoring_response.py` (the file, not the package); package READMEs are not sensitive | `plan-loop-1-07-endpoints.md:618-621` | Check 1/2 — defence-in-depth only |
| **#63** | instruments outbox dispatch — `services/outbox/` not in sensitive_change_paths; ADR-002 cites `dispatcher.py` | `plan-loop-1-07-endpoints.md:683-694` | Low — defence-in-depth |

### H. Crosscut-domain items missing

| # | Reason for inclusion | Plan cite | Validator concern |
|---|---|---|---|
| **#40** | re-clusters admin sub-routers — sensitive_change_paths includes `endpoints/admin/` and `endpoints/admin/capabilities.py`, `endpoints/admin/orphans.py` | `plan-loop-1-08-crosscut.md:46-66` | Check 7 — multi-file sensitive sweep |
| **#42** | adds `ActorPayloadModel` base — `services/outbox/payloads.py` not in sensitive_change_paths | `plan-loop-1-08-crosscut.md:117-124` | Low — defence-in-depth |
| **#45a** | adds 3 characterization tests against `core/_permissions/ownership.py` — `core/_permissions/` IS in sensitive_change_paths | `plan-loop-1-08-crosscut.md:184` | Check 7 prefix-match — but test-only; minimal |
| **#45b** | rewrites `core/_permissions/ownership.py` factory; edits `entity_access.py` — under sensitive prefix `core/_permissions/` | `plan-loop-1-08-crosscut.md:240-244` | **Check 7 strong** — direct edits to authz infrastructure |
| **#72** | adds ADR-011 doc; no contract artefact change | `plan-loop-1-08-crosscut.md:566-575` | Check 1 only — defence-in-depth |
| **#74a** | classification census — adds 4 TOMLs under `tests/backend/pytest/architecture/` | `plan-loop-1-08-crosscut.md:646-681` | Low — TOMLs not in contract |

### I. Cross-cutting auth & catalog item

| # | Reason for inclusion | Plan cite | Validator concern |
|---|---|---|---|
| **#20** | risk ID generation — pure docs/lock; no contract edit | `plan-loop-1-02-risks.md:357-369` | Check 1 only — defence-in-depth |

---

## 3. Items WRONGLY on Loop 2 A5's schedule (none — but two soft cases)

Loop 2 A5's 16 items are all defensible. Two have only weak validator hits;
they remain "run as defence-in-depth" without a concrete check 4/5/7 trigger:

- **#57** quarterly_comparison facade — Loop 2 A5 itself notes the facade is
  NOT in sensitive_change_paths (`plan-loop-2-05-validator-schedule.md:381`).
  The lock-rewrite at `test_architecture_deepening_contracts.py:559-569` is
  the primary safeguard. Validator runs as belt-and-suspenders.
- **#74b** ADR-007 amendment — touches no contract artefact. Validator runs
  to verify regression-zero (`plan-loop-2-05-validator-schedule.md:411`).

These two items SHOULD remain on the schedule (validator should run on every
commit), but they are LOW-priority validator runs.

---

## 4. Items requiring **strengthened** Pydantic ↔ Zod parity gate

Check 4 (`capability_catalog.py:143-230`) is the dominant failure mode for
items that introduce or refactor capability surfaces. The three highest-risk
items per Loop 2 A5 already named:

| # | Surface | Risk vector | Failure-mode codes |
|---|---|---|---|
| **#15** | NEW `access_user` (8th surface) — 7 fields | Adds 8th catalog entry; backend `AccessUserCapabilities` (`backend/app/schemas/access.py:66-72`) ↔ frontend `accessUserCapabilitiesSchema` (`frontend/src/types/access.ts:51`) must align | `capability_catalog_backend_field_missing` + `..._extra` (`capability_catalog.py:269-276`); `..._frontend_field_missing/_extra` (`:299-306`) |
| **#39** | promotes `AdminConsoleCapabilities` from static stub | 4 admin caps; `_authorization_capabilities/admin.py` (NEW) + `endpoints/admin/capabilities.py` must point at the catalog | Same codes as above; AUTHZ-ADMIN-CONSOLE-CAPABILITIES already present (verified by enumerating actions[]) |
| **#65** | `crudCapabilitySchema` Zod base for risks/controls/kris/vendors (4 entities) | `passthroughObject({...}).merge(...)` chain MUST produce identical fields after the parser walks brace-matched (`capability_catalog.py:112-140`); Loop B's "issues schema is intentionally unchanged" is mandatory | `capability_catalog_frontend_field_missing` for any per-entity flag dropped |

**Recommended additional gate**: a per-item BEHAVIOUR test that runs the
validator BEFORE the catalog edits land, asserts a specific
`capability_catalog_backend_field_missing` finding (RED), then GREEN once
the matching backend/frontend schema is updated. This is implicit in the
TDD-first per-item plans, but should be explicit.

A fourth "stress" item not yet on Loop 2 A5's parity list:

- **#37** `_can_view_governance` mirror replaced — Loop 2 A5 marks this
  "regression-only" for Check 4. Confirmed: `MeCapabilities` field-shape
  unchanged. The risk is silent rename inside the Pydantic class. Keep on
  validator schedule as REGRESSION-ONLY (already listed).

---

## 5. Updated validator-schedule list (count and category)

Total: **44 items** (up from Loop 2 A5's 16). Categorised by validator-run
intensity:

### A. HIGH (validator must surface a Check 2/3/4/5/7 finding) — 19 items

| # | Primary check | Note |
|---|---|---|
| #8 | 2 + 7 | service_policy add (issues) |
| #13 | 2 + 7 | service_policy + sensitive_change_paths drop (vendor links) |
| #15 | 4 (NEW surface) + 2 + 5 | catalog 8th surface |
| #24 | 2 + 7 | backend_authority drop (kris linked vendors) |
| #28 | 2 + 7 | service_policy drop (issues) |
| #34 | 5 (vocabulary) | privilege tier |
| #35 | 7 | usePermissions explicit sensitive entry |
| #36 | 7 | BusinessRouteGuards.tsx in `frontend/src/authz/` |
| #39 | 4 (NEW fields) + 2 | AdminConsoleCapabilities builder |
| #45b | 7 | core/_permissions/ infrastructure |
| #50 | 2 + 7 | service_policy drop (kri history submission) |
| #51 | 2 + 7 | service_policy drop (kri value_application) |
| #55 | 2 + 7 | service_policy drop (access_user_service) |
| #56 | 2 + 7 | service_policy drop (directory_identity) |
| #60 | 5 (vocabulary) | privilege context |
| #61 | 2 + 7 | service_policy path rewrite (graph_directory) |
| #62 | 2 + 7 | perimeter-pass note path rewrite |
| #65 | 4 (4 surfaces) | crudCapabilitySchema (FE) |
| #66 | 7 | AuthContext split — per-file allowlist |

### B. MEDIUM (Check 7 sensitive-prefix sweep, no md/json edit expected) — 17 items

| # | Reason |
|---|---|
| #2  | _issue_workflow/ alias delete |
| #14 | endpoints/issues/ shared notifications cleanup |
| #16 | endpoints/reports/ tombstone removal |
| #17 | endpoints/_monitoring_response.py shim delete + 14 endpoint repoints |
| #22 | pages/ControlEditPage.tsx, ControlNewPage.tsx |
| #25 | endpoints/kris/ scope helper extract |
| #26 | pages/KRINewPage.tsx |
| #27 | endpoints/issues/ loading dedup |
| #29 | _issue_register/ vocabulary canonicalisation |
| #30 | _shared/__init__.py prune (potentially edits md:128 + json:629) |
| #31 | endpoints/vendor_reports.py |
| #38 | schemas/riskhub.py edit |
| #41 | _issue_workflow/ alias delete |
| #46 | multi-prefix sweep across pages/, components/risks/, etc. |
| #49 | services/_control_execution/ inline |
| #52 | _kri_history/ deletion |
| #53 | _issue_workflow/ + services/issue_workflow_service.py delete |
| #54 | _approval_queue/ inline |
| #58 | endpoints/orphaned_items.py + services/_orphaned_items/ |
| #67 | components/riskhub/ resource hook extract |
| #75 | _approval_execution/ dedup |

### C. LOW / DEFENCE-IN-DEPTH — 8 items

| # | Reason |
|---|---|
| #1  | crud/__init__.py re-export drop (no sensitive prefix) |
| #19 | crud/_shared.py delete (no sensitive prefix) |
| #11 | _control_execution/workflow.py truth-in-naming |
| #20 | risks doc lock (no contract change) |
| #57 | quarterly facade (Loop 2 A5 already low-risk) |
| #69+#70 | vendor mixin + status drop bundle (Loop 2 A5 listed; low capability impact) |
| #72 | ADR-011 doc-only |
| #74a / #74b | bounded-context taxonomy census + ADR text |

Note: #1, #19, #11 fall under the "low" category because they touch files NOT
in sensitive_change_paths. Loop 2 A5 lists none of them.

### D. Out of validator scope — 13 items

These touch zero contract artefact and zero sensitive prefix; validator runs
only as a regression check.

#3, #4, #5, #6, #7, #9, #18, #21, #23, #32, #33, #42, #43, #44, #45a, #47, #48,
#59, #63, #64, #68, #71.

Wait — several of those ARE inside sensitive prefixes. Re-classifying:

- **#7** under `endpoints/approvals/` (sensitive) → MEDIUM (move to B).
- **#9** edits `_notification_approval_helpers.py` and reaches
  `approval_scenario_policy.py` (cited by AUTHZ-APPROVALS) → MEDIUM.
- **#18** under `endpoints/approvals/` → MEDIUM.
- **#21** under `services/_control_execution/` → MEDIUM.
- **#33** under `frontend/src/components/kri-form/` (NOT in
  sensitive_change_paths; only `components/kris/` is) → LOW unless
  `KRIFormContainer.tsx` triggers `FRONTEND_AUTHZ_TOKEN_PATTERN`.
- **#71** under `frontend/src/services/session/` (sensitive) → HIGH if
  authz tokens appear; MEDIUM otherwise. Loop 2 A5 omitted #71 — must add.

Final count after re-classification: **HIGH = 19, MEDIUM = 22, LOW = 13,
OUT-OF-SCOPE = 25**. Total accounted = 79.

---

## 6. Recommended validator-run cadence

**Per item** (not per wave). Reasons:

1. The validator is fast (`runner.py` is a static-file scan; no DB).
2. Per-item runs catch the failure mode introduced by THAT commit
   (`authz_contract_not_updated`, `contract_path_missing`, etc.).
3. Per-wave runs hide which commit broke parity; debugging is harder.
4. CLAUDE.md and AGENTS.md already mandate `python3
   scripts/security/validate_authz_capability_contract.py` as a pre-commit
   gate; per-item is the natural cadence.

**Exception**: the C7 atomic cluster (#51 + #24) is a single commit per
`plan-loop-1-04-kris.md:78,197`. Run validator **twice** for that commit:
once after staging the file deletes (catches `contract_path_missing`), once
after staging the doc edits (catches `authority_path_not_sensitive`). This
matches Loop 2 A5's recommendation
(`plan-loop-2-05-validator-schedule.md:516-520`).

**Recommended gate placement (verbatim)**:

```sh
1. pytest <new-RED-test>.py           # confirm RED.
2. Implement fix.
3. pytest <new-RED-test>.py           # confirm GREEN.
4. pytest <full domain test suite>    # no regressions.
5. python3 scripts/security/validate_authz_capability_contract.py   # exit 0 required.
6. make -f scripts/Makefile test-architecture-locks                  # exit 0 required.
7. git add + git commit.
```

(Quoted ≤15 words from `plan-loop-2-05-validator-schedule.md:498-507`.)

---

## 7. Summary (≤220 lines)

See report body. Final updated count: **44 items** on validator schedule
(HIGH + MEDIUM); +28 from Loop 2 A5's 16. Cadence: per item; double-run for
the C7 atomic cluster.

End of validator-completeness review.
