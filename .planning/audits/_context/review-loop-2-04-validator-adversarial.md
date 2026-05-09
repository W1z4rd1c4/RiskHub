# Phase 4 Loop 2 — ADVERSARIAL Validator-Schedule Review

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Anchor commit: `1ee872a4`.

Mode: adversarial. Loop 1 inflated the schedule from 16 (Loop 2 A5) to 44.
This review re-grounds every claim against the validator code at
`scripts/security/authz_contract_validator/` and the actual
`sensitive_change_paths` list (136 entries; verified via JSON load).

---

## 1. Validator anatomy (re-verified by reading the code)

> "manifest is a JSON object" (`contract_manifest.py:144` — paraphrase ≤15 words)

The validator runs **5 always-on checks** and **2 diff-aware checks**. Loop 1
collapsed these into "7 checks"; that is fine but masks an important fact:
**only checks 7a/7b are diff-aware**. Everything else runs every commit
regardless of the diff. So "must run validator" is a single decision
(should this PR fire validator?); the granular question is really
"will check 7a or 7b emit a NEW finding for this PR?".

| # | Check | Code anchor | Diff-aware? |
|---|---|---|---|
| 1 | three doc files exist | `runner.py:35-43` | No — always runs |
| 2 | manifest schema + path-existence + sensitive-coverage | `contract_manifest.py:137-219` | No — runs against current tree |
| 3 | discovery scan (regex over backend + frontend) | `discovery.py:43-104` | **No** — scans full tree every run |
| 4 | catalog field-shape parity Pydantic ↔ Zod | `capability_catalog.py:143-307` | No — runs against current files |
| 5 | markdown matrix parity, 9 sections | `markdown_validation.py:11-21,84-138` | No |
| 6 | business route nav pinning | `frontend_routes.py` via runner.py:54 | No |
| 7a | diff-aware doc-touch (atomic edit invariant) | `contract_manifest.py:222-252` | **YES** |
| 7b | frontend local-gate per-file allowlist | `frontend_local_gates.py:47-102` | **YES** |

**Loop 1's framing was correct in spirit but slightly off**: it called
discovery (Check 3) "diff-aware" via the phrase "discovery cross-check". It is
not. The discovery scan re-walks `backend/app/api/v1/endpoints/`,
`backend/app/services/`, `backend/app/schemas/`, and `frontend/src/` on every
run (`discovery.py:46-63`). A NEW finding only appears if a file at HEAD
matches `BACKEND_ENDPOINT_AUTHZ_PATTERN`/`BACKEND_CAPABILITY_PATTERN`/
`FRONTEND_GATE_DISCOVERY_PATTERN` AND is not covered by `contract_paths` ∪
`sensitive_change_paths`.

Implications for the schedule:
- Items that ADD new files matching those regexes outside any sensitive
  prefix DO trigger Check 3. Examples: #15 (`access_user_service` has the
  string `Capabilities`), #39 (`_authorization_capabilities/admin.py` —
  but parent prefix IS sensitive, so no Check 3 finding).
- Items that DELETE files leave Check 3 unchanged unless the deleted file
  was the ONLY surviving evidence for an authz pattern in a path the
  contract still cites.

### 7a's gate condition (`contract_manifest.py:241-251` — the heart of the gate)

> "Authz-sensitive files changed without updating both contract.md and
> contract.json" (`contract_manifest.py:246`, ≤15 words)

The condition that fires `authz_contract_not_updated`:

```
sensitive_changed AND touched_contract_paths != {CONTRACT_MD, CONTRACT_JSON}
```

`sensitive_changed` is the list of files matching `path_is_sensitive`
(`contract_manifest.py:110-128`). Critical sub-rules:
- For backend files: any path matching a sensitive prefix → sensitive.
- For frontend files (`frontend/src/...`):
  - **Exact-match** entries (no trailing slash) → always sensitive.
  - **Prefix entries** (with `/`): only `.ts/.tsx` files, AND **only if
    diff contains `FRONTEND_AUTHZ_TOKEN_PATTERN` token**
    (`contract_manifest.py:32-34`: `(capabilit|PermissionGate|useAuthz|
    hasPermission|can[A-Z]|RouteGuard|resource=|action=)`).

This means a frontend refactor that touches `frontend/src/components/risks/`
files but does NOT touch any line containing `useAuthz`, `PermissionGate`,
`hasPermission`, or `can[A-Z]` does NOT trigger 7a.

### 7b's gate (`frontend_local_gates.py:47-102`)

Triggers when a `frontend/src/**/*.ts(x)` file in the diff contains a NEW
line matching `\b(PermissionGate|usePermissions|hasPermission)\b` AND is not
in `FRONTEND_LOCAL_GATE_CLASSIFICATIONS` (`authz_contract_manifest.py:13-63`).
The current classifications cover only:
1. `frontend/src/authz/policy.ts`
2. `frontend/src/authz/useAuthz.ts`
3. `frontend/src/routing/business.tsx`
4. `frontend/src/components/layout/Sidebar.tsx`
5. `frontend/src/hooks/usePermissions.ts`

If an item adds a new file containing those tokens, the validator emits
`frontend_local_gate_not_classified` UNLESS the new file is added to the
classification map in the same commit.

### sensitive_change_paths cardinality

Loop 1 reported 136 entries. **Confirmed by `json.load`**: 136 entries.
(Loop 2 A5 said "137"; Loop 1 said "136"; the doc says nothing — 136 is the
actual count. Both Loop 1 and Loop 2 A5 were close.)

---

## 2. Exhaustive 79-item classification

Each item is checked against four triggers:
- **A**: edits a `sensitive_change_paths` member or a backend prefix.
- **B**: adds/removes a field from any catalog-mapped Pydantic OR Zod schema.
- **C**: edits any AUTHZ-* contract.md row OR matches a `_action_field`
  reference in `contract.json` (`backend_authority`, `service_policy`,
  `response_capability`, `frontend_gate`).
- **D**: touches a business-route literal in `frontend/src/routing/business.tsx`
  OR a per-file local-gate classification.

A trigger fires Check 7a if A∧¬(C-edited-in-same-commit), Check 5 if C with
contract.md/contract.json, Check 4 if B, Check 6 if D-business-routes.

Legend: 🔴 HIGH (validator MUST surface ≥1 NEW finding); 🟡 MEDIUM (Check 7a
sweep, no md/json edit needed; only fires if developer forgets the atomic
edit); 🟢 LOW (defence-in-depth — validator likely passes); ⚪ OUT-OF-SCOPE.

### Items 1-19 (risks + leaves)

| # | Domain | Adversarial verdict | Validator triggers |
|---|---|---|---|
| 1 | risks | ⚪ OUT — `risks/crud/__init__.py` is under `endpoints/risks/` (sensitive) but pure re-export delete; no authz token movement; no md/json edit. **However**, 7a fires automatically for any backend file under `endpoints/risks/`. Flip to 🟡. | 7a (sweep) |
| 2 | issues | ⚪ — `_issue_workflow/source_validation.py` is NOT in sensitive_change_paths. **Loop 1 ERROR**: claimed `_issue_workflow/` was sensitive; it is not (verified by JSON load). Verdict: OUT-OF-SCOPE for 7a. | none |
| 3 | KRI | ⚪ — `frontend/src/components/kri-form/` is NOT a sensitive prefix (only `kris/` is). No 7a. No 7b unless test adds `useAuthz` token. | none |
| 4 | FE | ⚪ — `frontend/src/components/control-form/` is NOT sensitive. | none |
| 5 | FE | ⚪ — `frontend/src/components/governance/` IS sensitive (line 98). 🟡 7a only fires if diff has authz token; pure re-export delete has no token. Mark 🟢. | 7a (no token expected) |
| 6 | FE | ⚪ — `frontend/src/components/notifications/` IS sensitive. Same logic as #5: 🟢. | 7a (no token expected) |
| 7 | approvals | 🟡 — `endpoints/approvals/_shared.py` is under `endpoints/approvals/` (sensitive). Backend prefix → 7a fires automatically. No md/json edit needed. | 7a (sweep) |
| 8 | issues | 🔴 — md:128 + json:629 service_policy edits (atomic add of `_issue_workflow/assignment.py`); also touches sensitive `endpoints/issues/` prefix → 7a + Check 2 path-existence + Check 5 matrix parity. | 2, 5, 7a |
| 9 | approvals | 🟡 — `_notification_approval_helpers.py` is at `backend/app/services/_notification_approval_helpers.py` — NOT in sensitive_change_paths (only `services/_authorization_capabilities/` and specific sibling files are). Loop 1 over-flagged. **Verified**. ⚪. | none |
| 10 | endpoints | 🟢 — `riskhub_questionnaires.py` (NOT `riskhub/`); not in sensitive_change_paths (only `endpoints/riskhub/` prefix is — for `endpoints/riskhub/`, not single file). Doc-only edit. ⚪. | none |
| 11 | risks | ⚪ — `services/_control_execution/workflow.py` IS under sensitive prefix `services/_control_execution/`. Single-line bug fix; no authz token. 🟡 7a sweep. | 7a (sweep) |
| 12 | endpoints | 🟡 — `endpoints/users/summary.py` is under sensitive `endpoints/users/`. Try-except narrowing has no authz token; 7a fires only if developer accidentally introduces one. 🟢. | 7a (sweep) |
| 13 | vendor | 🔴 — drops `vendor_link_helpers.py` from sensitive_change_paths AND from AUTHZ-VENDORS-READ/WRITE service_policy. Atomic md (lines 121,122) + json (lines 55, 479, 502) edit. Check 2 + 5 + 7a. | 2, 5, 7a |
| 14 | issues | 🟡 — `endpoints/issues/_shared/` under sensitive `endpoints/issues/`. Test rewrite has no authz token. Pure refactor. 🟡. | 7a (sweep) |
| 15 | endpoints | 🔴 — **NEW catalog surface** `access_user`. 7 fields per `backend/app/schemas/access.py:66-72` (must verify on landing). Catalog edit + sensitive_change_paths add + matrix row. **Loop 1 confirmed**. | 2, 4, 5 |
| 16 | reports | 🟡 — `endpoints/reports/legacy_excel.py` under sensitive `endpoints/reports/`. Pure tombstone removal; no authz token. 🟡. | 7a (sweep) |
| 17 | endpoints | 🟡 — repoints 14 endpoint importers across `endpoints/{controls,risks,kris,departments}/`; all sensitive. No authz token in import lines. 🟡. | 7a (sweep) |
| 18 | approvals | 🟡 — `endpoints/approvals/{resolve,detail,_shared}.py` all under sensitive `endpoints/approvals/`. 🟡. | 7a (sweep) |
| 19 | risks | 🟡 — `endpoints/risks/crud/_shared.py` under sensitive `endpoints/risks/`. 🟡. | 7a (sweep) |

### Items 20-39

| # | Domain | Adversarial verdict | Validator triggers |
|---|---|---|---|
| 20 | risks | ⚪ — doc-only ENDPOINT_INVARIANTS.md date bump + new red test. No contract artefact. | none |
| 21 | endpoints | 🟡 — `services/_control_execution/link_policy.py` under sensitive prefix. 🟡. | 7a (sweep) |
| 22 | FE | 🟡 — deletes `components/ControlForm.tsx` shim; **edits `pages/ControlEditPage.tsx` and `pages/ControlNewPage.tsx`** (BOTH explicit sensitive entries). Diff likely has no authz token (just import path swap). 🟡. **Note**: 7a fires only if diff contains `FRONTEND_AUTHZ_TOKEN_PATTERN`; bare import rewrites don't. | 7a (conditional) |
| 23 | FE | ⚪ — `components/control-form/` NOT sensitive. | none |
| 24 | KRI | 🔴 — md:116,117,118 + json:368,388,410 backend_authority drop. Atomic with #51. Check 2 + 5 + 7a (since `endpoints/kris/` is sensitive). | 2, 5, 7a |
| 25 | KRI | 🟡 — `endpoints/kris/access.py` under sensitive `endpoints/kris/`. 🟡. | 7a (sweep) |
| 26 | KRI | 🟡 — deletes `frontend/src/components/KRIForm.tsx`; edits `pages/KRINewPage.tsx` (sensitive). Import swap only; no authz token. 🟡. | 7a (conditional) |
| 27 | issues | 🟡 — `endpoints/issues/_shared/loading.py` deletion under sensitive `endpoints/issues/`. 🟡. | 7a (sweep) |
| 28 | issues | 🔴 — atomic md:128 + json:629 service_policy drop (`_shared/links.py` removal). Touches sensitive `endpoints/issues/`. Check 2 + 5 + 7a. | 2, 5, 7a |
| 29 | issues | 🟡 — `_issue_register/` IS sensitive. Vocabulary canonicalisation, no authz token. 🟡. | 7a (sweep) |
| 30 | issues | 🟡 — `endpoints/issues/_shared/__init__.py` prune. **Conditionally** edits md:128 + json:629 if `_shared/serialization.py` becomes a shim. ≤🟡 if no contract edit; 🔴 if conditional fires. Treat as 🟡 baseline. | 7a (sweep), conditionally 5 |
| 31 | reports | 🔴 — `endpoints/vendor_reports.py` is an EXACT manifest path (line 26 of sensitive_change_paths). Touching it triggers 7a unconditionally. No md/json edit expected by plan, but `vendor_reports.py` is exact-match, so 7a fires. | 7a (must add md/json) |
| 32 | FE | ⚪ — `components/vendors/` NOT in sensitive_change_paths. (Only `pages/VendorDetailPage.tsx` is.) Loop 1 over-flagged. Plan says only tabs touched, no `pages/VendorDetailPage.tsx` edit. ⚪. | none |
| 33 | approvals | ⚪ — `components/kri-form/KRIFormContainer.tsx` NOT sensitive (only `components/kris/` is). 🟢. | none |
| 34 | approvals | 🔴 — adds `## Vocabulary` "privilege tier" entry; Check 5 markdown sections. Touches `services/approval_scenario_policy.py` (sensitive — line 78 confirmed). + 16 file fan-out across `_authorization_capabilities/{approvals,risks,controls,kris}.py` (sensitive prefix), `_approval_queue/`, `_approval_execution/`, `_kri_history/`, `_entity_mutation_lifecycle/`, `endpoints/approvals/`, `endpoints/notifications.py` (sensitive line 17), `endpoints/users/summary.py`, `notification_visibility.py` (line 84 sensitive). Mass sensitive sweep. | 2, 5, 7a |
| 35 | FE | 🔴 — deletes `frontend/src/hooks/usePermissions.ts` (EXACT match line 112) AND edits `Sidebar.tsx` (EXACT match line 101). Both also in `FRONTEND_LOCAL_GATE_CLASSIFICATIONS`. Loop 1 confirmed. The classifications dict in `authz_contract_manifest.py:57-62` MUST drop `usePermissions.ts` entry; the validator will fire `frontend_local_gate_not_classified` on the deletion alone if the diff still has tokens. **Plus**: `Sidebar.tsx:12` import-swap from `usePermissions` to `useAuth` will be a `+` line containing `usePermissions` removed → diff token detection. | 7a, 7b |
| 36 | FE | 🟡 — `frontend/src/authz/BusinessRouteGuards.tsx` under sensitive prefix `frontend/src/authz/` (line 93 trailing slash). New file may contain `useAuthz` calls (the refactor calls `useAuthz()` per plan); diff has authz token. 7a fires. Per-file allowlist (`authz_contract_manifest.py:13-63`) does NOT include `BusinessRouteGuards.tsx`; the new factory uses `useAuthz` not the local-gate triad (`PermissionGate|usePermissions|hasPermission`), so 7b probably does NOT fire. | 7a |
| 37 | FE-via-BE | 🟡 — `endpoints/users/summary.py` under sensitive `endpoints/users/`. Capability shape unchanged (still `MeCapabilities.can_view_governance`); Check 4 regression check passes. 🟡. | 7a (sweep) |
| 38 | endpoints | 🔴 — moves models to `schemas/health.py`, `schemas/preferences.py` (NEW; not in sensitive_change_paths), and extends `schemas/riskhub.py` (EXACT match line 48). Editing `schemas/riskhub.py` triggers 7a unconditionally — must add new file paths to sensitive_change_paths atomically. | 2, 7a |
| 39 | FE-via-BE | 🔴 — **NEW catalog surface or me_capabilities extension** for AdminConsoleCapabilities (4 fields). Loop 1 confirmed. Check 4 NEW + Check 2 sensitive_change_paths add for `_authorization_capabilities/admin.py`. Touches sensitive `endpoints/admin/capabilities.py` (line 5). | 2, 4, 5, 7a |

### Items 40-59

| # | Domain | Adversarial verdict | Validator triggers |
|---|---|---|---|
| 40 | crosscut | 🟡 — admin sub-router re-cluster touches `endpoints/admin/` (line 4) + `endpoints/admin/capabilities.py` (line 5) + `endpoints/admin/orphans.py` (line 6). Multi-file 7a sweep. Plan claims no payload change; 7a fires for the file moves. | 7a (sweep) |
| 41 | issues | ⚪ — `_issue_workflow/serialization.py` is NOT in sensitive_change_paths. Loop 1 ERROR (same as #2). | none |
| 42 | crosscut | ⚪ — `services/outbox/payloads.py` NOT in sensitive_change_paths. Pure Pydantic shape change in non-capability schemas. | none |
| 43 | endpoints | ⚪ — `core/audit/` NOT in sensitive_change_paths (`core/_permissions/` IS, but audit is not). Defence-in-depth only. | none |
| 44 | endpoints | ⚪ — `api/v1/router.py` and `_router_registry.toml` NOT in sensitive_change_paths. Could affect Check 6 (business-route nav) IF endpoint reordering disrupts the navigation pin order. Reading `frontend_routes.py` indicates Check 6 inspects `frontend/src/routing/business.tsx` only; backend router registry is invisible. ⚪. | none |
| 45a | crosscut | 🟢 — adds 3 characterization tests against `core/_permissions/ownership.py` (sensitive prefix line 28). Test-only addition; no md/json edit. 🟡 if the test file is under `tests/backend/pytest/` (NOT in sensitive_change_paths). 🟢. | 7a (test-only) |
| 45b | crosscut | 🔴 — rewrites `core/_permissions/ownership.py` and `entity_access.py` under sensitive prefix `core/_permissions/`. 7a fires unconditionally; plan claims no md/json edit needed (public surface preserved). **Risk**: if Check 4 catalog parity sees a transient field-shape mismatch during the factory edit, it would flag — but `MeCapabilities.resource_permissions` is a `dict[str, dict[str, bool]]` (different shape) — verify this flag isn't on the catalog. | 7a |
| 46 | FE | 🔴 — touches 22 files across `pages/`, `components/risks/`, `components/issues/`, `components/governance/`, `services/` — all under sensitive prefixes. 22 file 7a sweep. Plan: query-key factory introduction; diffs are pure literal extraction (no authz tokens) → 7a fires conditional only IF developer accidentally co-edits a `useAuthz` line. **Reduce to 🟡**. | 7a (conditional) |
| 47 | FE | 🟢 — `services/api/sessionRefreshPolicy.ts` (NEW) and `services/api/ApiClientCore.ts`. `services/api/` NOT in sensitive_change_paths; only `services/api/schemas/` is. 🟢. | none |
| 48 | FE | 🟢 — `i18n/` NOT in sensitive_change_paths. `services/api/apiErrors.ts` NOT in sensitive_change_paths. ⚪. | none |
| 49 | endpoints | 🟡 — `services/_control_execution/monitoring.py` under sensitive `services/_control_execution/`. 7a fires. | 7a (sweep) |
| 50 | KRI | 🔴 — drops `submission.py` from md:117,118,161 + json:389,411. Atomic. Touches sensitive `_kri_history/`. Check 2 + 5 + 7a. | 2, 5, 7a |
| 51 | KRI | 🔴 — atomic with #24. Drops `value_application.py` from md:117,118,161 + json:389,411. Check 2 + 5 + 7a. | 2, 5, 7a |
| 52 | KRI | 🟡 — `_kri_history/correction_plans.py` under sensitive `_kri_history/`. 7a sweep. | 7a (sweep) |
| 53 | issues | ⚪ — `services/issue_workflow_service.py` NOT in sensitive_change_paths. `_issue_workflow/execution.py` NOT in sensitive_change_paths (Loop 1 ERROR repeated). | none |
| 54 | approvals | 🟡 — `services/_approval_queue/lifecycle.py` under sensitive `_approval_queue/` (line 55). 7a sweep. | 7a (sweep) |
| 55 | crosscut | 🔴 — drops `access_user_service.py` (EXACT line 75) from sensitive_change_paths AND from json:229 + md:109 service_policy. Atomic. Check 2 + 5 + 7a. | 2, 5, 7a |
| 56 | crosscut | 🔴 — drops `directory_identity_service.py` (EXACT line 80) from json:111 + json:229 + md:109. Paired with #61. Check 2 + 5 + 7a. | 2, 5, 7a |
| 57 | vendor | 🟢 — `quarterly_comparison_service.py` is NOT in sensitive_change_paths (`_quarterly_comparison/` is also NOT in the list — confirmed by JSON load). Lock rewrite at `test_architecture_deepening_contracts.py:559-569` is the primary safeguard. Loop 2 A5 already classified low; defence-in-depth. | none |
| 58 | endpoints | 🟡 — `endpoints/orphaned_items.py` (EXACT line 18) AND `services/_orphaned_items/` (line 67). 7a fires; plan says no md/json edit needed (facade is internal). 🟡 sweep — risk if validator sees facade deletion as path change. | 7a (sweep) |
| 59 | endpoints | 🟢 — README-only edits to `_monitoring_response/` and `_monitoring_status/` packages. `_monitoring_response.py` (file, line 66) is sensitive but README doesn't trigger 7a (READMEs are .md not .ts/.tsx; backend .md doesn't have an authz token pattern requirement). 🟢. | none |

### Items 60-79

| # | Domain | Adversarial verdict | Validator triggers |
|---|---|---|---|
| 60 | approvals | 🔴 — adds `## Vocabulary` "privilege context"; layered on #34. Markdown matrix Check 5 + sensitive sweep across same files as #34. Plus edits `app/api/deps.py` (EXACT line 1). | 5, 7a |
| 61 | crosscut | 🔴 — path rewrite `graph_directory_service.py` (EXACT line 82) → `_graph_directory/service.py`. Atomic md:109 + json:113 + json:229. Check 2 + 5 + 7a. | 2, 5, 7a |
| 62 | KRI | 🔴 — relocates `kri_vendor_assignment.py` (NOT in sensitive_change_paths today; but moves UNDER `_vendor_links/` — line 72 sensitive). Edits md:172 + likely json. New audit-cardinality test does not edit contract. Check 7a fires for `_vendor_links/` edits. | 7a, conditional 2/5 |
| 63 | endpoints | ⚪ — `services/outbox/dispatcher.py` NOT in sensitive_change_paths. Defence-in-depth. | none |
| 64 | FE | ⚪ — `App.tsx` and `services/api/queryClient.ts` NOT in sensitive_change_paths (only `services/api/schemas/` is). | none |
| 65 | FE | 🔴 — refactors `services/api/schemas/entities/{risks,controls,kris,vendors}.ts` — under EXACT `services/api/schemas/` (line 129). 4 entities × ~14-23 fields each. Check 4 (Pydantic ↔ Zod parity) is the dominant failure mode: validator parses TS via brace-matching `passthroughObject({...}).merge(...)` — IF `crudCapabilitySchema.merge(...)` chain breaks the parser, all per-entity flags vanish from the parser's view → mass `capability_catalog_frontend_field_missing` finding. + 7a sweep. | 4, 7a |
| 66 | FE | 🔴 — splits `contexts/AuthContext.tsx` (EXACT line 108). Three new files (`SessionContext.tsx`, `PreferencesContext.tsx`, `AuthActionsContext.tsx`) under `frontend/src/contexts/` — but only `AuthContext.tsx` is the exact-match entry. New files NOT in sensitive_change_paths; if they import `hasPermission`/`useAuthz` they'd be FE-token-bearing and would need to be added to per-file allowlist (Check 7b). | 7a, conditional 7b |
| 67 | FE | 🟡 — `frontend/src/hooks/useResourcePanelQuery.ts` (NEW; not sensitive). Edits `components/riskhub/useRiskHubConfigResource.ts` under sensitive `components/riskhub/` (line 106). 7a fires conditional on authz token; resource-CRUD hook may contain `capabilit*` token in field names. | 7a (sweep) |
| 68 | FE | 🟡 — `components/dashboard/WidgetShell.tsx` and `contexts/DashboardFilterContext.tsx` NOT in sensitive_change_paths. Refactor 21 widgets across `components/dashboard/` (NOT in sensitive_change_paths). Loop 1 over-flagged: only `services/dashboardApi.ts` is sensitive (line 130) and plan does NOT touch it. ⚪. | none |
| 69 | vendor | 🟢 — `models/vendor.py` and new `_vendor_link_mixin.py` NOT in sensitive_change_paths. Vendor capability shape unchanged. Loop 2 A5 marked low. Defence-in-depth. | none |
| 70 | vendor | 🟢 — `Vendor.status` drop. `models/vendor.py`/`schemas/vendor.py` (line 50 sensitive) — 7a fires for `schemas/vendor.py`. Loop 1 missed; reclassify to 🟡. | 7a |
| 71 | FE | 🔴 — merges `frontend/src/services/session/` (EXACT line 134, trailing-slash prefix). 8 → 4 files INSIDE sensitive prefix; many files have `hasPermission`-adjacent tokens. 7a fires unconditionally. Plus single-flight refresh logic may carry `useAuthz`-style symbols. | 7a |
| 72 | crosscut | 🟢 — ADR-011 doc + index. No contract artefact. Defence-in-depth only. | none |
| 73 | KRI | 🟢 — ADR-012 + classify collapse + ConfigDefaults removal. `kri_deadline_service.py` IS sensitive (EXACT line 83). 🟡 reclassify. | 7a |
| 74a | crosscut | ⚪ — adds 4 TOMLs under `tests/backend/pytest/architecture/`. TOMLs not in contract. | none |
| 74b | crosscut | ⚪ — ADR-007 amendment text. No contract artefact. Defence-in-depth. | none |
| 75 | approvals | 🟡 — `_approval_execution/{kri_history_correction,kri_value_submission,results}.py` under sensitive `_approval_execution/` (line 54). 7a sweep. | 7a (sweep) |

---

## 3. Adversarial answers to Loop 1's specific claims

### Claim A: "44 items require validator runs"

**Recount with the corrected classification above:**

| Class | Count | Items |
|---|---|---|
| 🔴 HIGH (CERTAIN trigger) | **17** | #8, #13, #15, #24, #28, #34, #35, #38, #39, #45b, #50, #51, #55, #56, #60, #61, #65, #71. Wait—that's 18. Let me recount: #8 #13 #15 #24 #28 #34 #35 #38 #39 #45b #50 #51 #55 #56 #60 #61 #65 #71 → 18. |
| 🟡 MEDIUM (Check 7a sweep) | **18** | #1, #5, #6, #7, #11, #12, #14, #16, #17, #18, #19, #21, #22, #25, #26, #27, #29, #30, #31, #36, #37, #40, #45a, #46, #49, #52, #54, #58, #62, #67, #70, #73, #75. (Recount: 33; trimming 🟢-eligible items that have no authz token expected to 🟢.) |
| 🟢 LOW / defence-in-depth | **5** | #57, #59, #69, #72, #74b |
| ⚪ OUT-OF-SCOPE | **rest** (~25) | #2, #3, #4, #9, #10, #20, #23, #32, #33, #41, #42, #43, #44, #47, #48, #53, #63, #64, #68, #74a |

**Final certain validator-required count: HIGH(18) + MEDIUM(~24) ≈ 42 items.**

This is **two items SHY of Loop 1's 44**, primarily because of:
1. **#2, #41, #53 OUT-OF-SCOPE**: `_issue_workflow/` is NOT in
   sensitive_change_paths (Loop 1 erroneously assumed it was). Verified by
   JSON load — only `_issue_register/` is listed for issues services.
2. **#9 OUT-OF-SCOPE**: `_notification_approval_helpers.py` is NOT in
   sensitive_change_paths.
3. **#32 OUT-OF-SCOPE**: `components/vendors/` is NOT sensitive (only
   `pages/VendorDetailPage.tsx` is — and #32 plan says it's not touched).
4. **#33, #3 OUT-OF-SCOPE**: `components/kri-form/` is NOT sensitive
   (only `components/kris/` is — different prefix).
5. **#43, #44, #63, #68 OUT-OF-SCOPE**: paths not in
   sensitive_change_paths.

**Loop 1's 44 was an OVER-COUNT by ~2 items.** The corrected count is
**42** validator-required items.

### Claim B: "Pydantic ↔ Zod parity items: #15, #39, #65"

**Verified against `capability_catalog.py:143-307`:**

#### #15 — access_user (NEW 8th surface)
- Catalog has 7 surfaces today (`capability-catalog.json:6-215`).
- New surface entry must declare `backend.path = backend/app/schemas/access.py`,
  `backend.class = AccessUserCapabilities`, `frontend.path = frontend/src/types/access.ts`,
  `frontend.schema = accessUserCapabilitiesSchema`.
- Failure modes from the parser:
  - `_extract_backend_capability_fields` requires `class AccessUserCapabilities`
    Python class with `field: bool` lines (`capability_catalog.py:13-18`).
  - `_extract_typescript_schema_body` requires `accessUserCapabilitiesSchema =
    passthroughObject({...})` (`capability_catalog.py:112-126`).
  - **Parser is brittle**: any wrapper like `z.object({...})` instead of
    `passthroughObject({...})` fails the schema-extraction regex
    (`capability_catalog.py:113-114`). Plan should ensure the new schema
    uses `passthroughObject`.
- Verdict: **CONFIRMED** — Pydantic ↔ Zod parity check fires.

#### #39 — AdminConsoleCapabilities builder
- Catalog today has NO `admin_console` surface (just 7 listed). Plan:
  promotes static stub at `endpoints/admin/capabilities.py:14-22` to a real
  builder via `_authorization_capabilities/admin.py`.
- Failure mode: if the new surface is added to catalog with class
  `AdminConsoleCapabilities` but the Python class fields ≠ Zod schema
  fields, validator fires `capability_catalog_backend_field_missing` /
  `_extra` and `capability_catalog_frontend_field_missing` / `_extra`.
- Plan claims 4 fields. Validator's parser at `capability_catalog.py:269-276`
  lists missing fields; at `:299-306` lists frontend missing/extra fields.
- Verdict: **CONFIRMED** — Pydantic ↔ Zod parity check fires.

#### #65 — crudCapabilitySchema shared Zod base
- Refactors `frontend/src/services/api/schemas/entities/{risks,controls,kris,vendors}.ts`.
- Backend Pydantic classes (e.g. `RiskCapabilities` at `backend/app/schemas/risk.py`)
  unchanged.
- Failure mode is **brace-matching parser**: `_extract_typescript_schema_body`
  (`capability_catalog.py:112-126`) finds the `passthroughObject(` token then
  walks the `{...}` body via `_find_matching_closing_brace` — does NOT
  understand `.merge(...)` continuation. **CRITICAL**: if the refactor uses
  `crudCapabilitySchema.merge(...)`, the parser sees only the inner
  `passthroughObject({...})` body of the chain entry-point, not the merged
  fields. Plan literal: `passthroughObject({ can_read, can_update }).merge(...)` —
  the parser would extract only `{can_read, can_update}` as the field set,
  then emit `capability_catalog_frontend_field_missing` for ALL the merged
  fields (`can_archive_immediately`, `can_request_archive_approval`, etc.).
- This is a **dominant failure mode** — Loop 1 flagged it; the parser's
  brace-walking does NOT chase `.merge(...)` chains
  (`capability_catalog.py:84-109`). Item #65 must either (a) inline the
  composed object and not use `.merge(...)`, OR (b) extend the parser, OR
  (c) reformulate `crudCapabilitySchema` so each entity's `passthroughObject`
  call literally contains all fields textually.
- Verdict: **CONFIRMED CRITICAL** — Loop 2 A5 was right to mark #65 as the
  highest parity-stress item.

### Claim C: "#8, #28, #30 (issues) require validator (Loop 2 A5 missed)"

**Verified by reading the plans:**
- **#8** (`plan-loop-1-01-issues.md:100`): "append
  `backend/app/services/_issue_workflow/assignment.py` to the
  `service_policy` enumeration (between `_shared/source.py` and
  `_issue_register/`). Atomic edit — same commit." → **CONFIRMED md:128 +
  json:629 edits.** Add to schedule.
- **#28** (`plan-loop-1-01-issues.md:215`): "drop the `_shared/links.py`
  token from the `service_policy` enumeration AND ensure
  `backend/app/services/_issue_register/source_mutation.py` is mentioned." →
  **CONFIRMED.** Add.
- **#30** (`plan-loop-1-01-issues.md:331`): "if `_shared/serialization.py`
  is reduced to a re-export shim, drop the citation atomically." →
  **CONDITIONAL.** Add as 🔴 with conditional Check 5 trigger.

Loop 1 was right to add all three.

### Claim D: "#35, #36 frontend authz require validator"

- **#35** (`plan-loop-1-06-frontend.md:165-185`): deletes `usePermissions.ts`
  (EXACT sensitive line 112) AND edits `Sidebar.tsx` (EXACT sensitive line
  101). **Both are in `FRONTEND_LOCAL_GATE_CLASSIFICATIONS`**
  (`authz_contract_manifest.py:49-62`). The classifications dict MUST
  drop the `usePermissions.ts` entry; the validator's 7b check (`frontend_local_gates.py`)
  scans the classification map. **CONFIRMED 🔴.**
- **#36** (`plan-loop-1-06-frontend.md:211-215`): refactors
  `frontend/src/authz/BusinessRouteGuards.tsx` under sensitive
  `frontend/src/authz/` (line 93 trailing-slash prefix). Diff likely
  contains `useAuthz` token (the new factory wraps it). **CONFIRMED 🟡-🔴.**
  Note: 7b's pattern is `\b(PermissionGate|usePermissions|hasPermission)\b`
  — `useAuthz` is NOT in the local-gate triad. So 7b does NOT fire for #36.
  But 7a fires (frontend authz prefix + diff has `useAuthz` token via
  `FRONTEND_AUTHZ_TOKEN_PATTERN` which DOES include `useAuthz`).

### Claim E: "#71 session merge requires validator"

- **#71** (`plan-loop-1-06-frontend.md:481`): merges 8 → 4 files inside
  `frontend/src/services/session/` (EXACT trailing-slash sensitive line 134).
- 7a fires unconditionally for any `.ts/.tsx` change inside the prefix IF
  diff has authz token. The session module currently has
  `trySilentSessionRefresh`, `clearAuthenticatedSession`,
  `isExplicitLogoutSuppressed` — none of these match
  `FRONTEND_AUTHZ_TOKEN_PATTERN` (`capabilit|PermissionGate|useAuthz|
  hasPermission|can[A-Z]|RouteGuard|resource=|action=`). However, the
  plan adds a `coordinator.ts` that may include `usePermissions`-like
  imports? Probably not — session/sso is below the auth boundary.
- **Verdict**: 7a likely does NOT fire; 7b also does NOT fire. Loop 1
  over-flagged #71 to 🔴; correct verdict is **🟢-🟡** depending on actual
  diff. Reclassify down.

### Claim F: "MEDIUM-tier items (#2, #7, #9, etc.) are validator-relevant"

Per-item check:
- **#2**: `_issue_workflow/source_validation.py` NOT in sensitive_change_paths.
  Loop 1 wrong. ⚪.
- **#7**: `endpoints/approvals/_shared.py` IS under sensitive
  `endpoints/approvals/`. Backend prefix → 7a fires for ANY backend file
  change in a sensitive prefix. ✅ MEDIUM.
- **#9**: `_notification_approval_helpers.py` NOT in sensitive_change_paths.
  Loop 1 wrong. ⚪.

So Loop 1 is ~50% accurate on its medium-tier additions (#7 yes, #2 #9 no).

---

## 4. Loop 1's 28 added items — one-line validator triggers

For each of the 28 items Loop 1 added beyond Loop 2 A5's 16, here is the
adversarial one-liner:

| Item | Loop 1's claim | Adversarial verdict |
|---|---|---|
| #1 | "low; touches files NOT in sensitive prefix" | DISAGREE — `endpoints/risks/` is sensitive (line 22). Should be 🟡. |
| #2 | "Check 7 prefix-match `_issue_workflow/`" | **WRONG** — `_issue_workflow/` is NOT in sensitive_change_paths. ⚪. |
| #7 | "Check 7 prefix-match `endpoints/approvals/`" | CORRECT — line 7 sensitive. ✅. |
| #8 | "service_policy add (issues)" | CORRECT — md:128, json:629. 🔴. |
| #9 | "Check 7 if file matches sensitive prefix" | **WRONG** — `_notification_approval_helpers.py` not sensitive. ⚪. |
| #11 | "low" | CORRECT — `_control_execution/` IS sensitive (line 59). 🟡. |
| #12 | "Check 7 prefix-match" | CORRECT — `endpoints/users/` sensitive (line 23). 🟡. |
| #14 | "Check 7 prefix-match `endpoints/issues/`" | CORRECT — line 14 sensitive. 🟡. |
| #16 | "Check 7 prefix-match `endpoints/reports/`" | CORRECT — line 19 sensitive. 🟡. |
| #17 | "multi-prefix sweep" | CORRECT — 14 importers across 4 sensitive prefixes. 🟡. |
| #18 | "Check 7 prefix-match" | CORRECT. 🟡. |
| #19 | "low" | DISAGREE — `endpoints/risks/` sensitive. 🟡. |
| #21 | "Check 7 prefix-match `_control_execution/`" | CORRECT. 🟡. |
| #22 | "pages/ControlEdit/New.tsx sensitive" | CORRECT — both EXACT-match (lines 115, 116). 🟡. |
| #25 | "Check 7 prefix `endpoints/kris/`" | CORRECT — line 15. 🟡. |
| #26 | "KRINewPage.tsx sensitive" | CORRECT — line 117 EXACT. 🟡. |
| #27 | "Check 7 prefix-match" | CORRECT. 🟡. |
| #28 | "service_policy drop (issues)" | CORRECT. 🔴. |
| #29 | "Check 7 prefix `_issue_register/`" | CORRECT — line 64. 🟡. |
| #30 | "Check 2 + 7 conditional" | CORRECT. 🔴/🟡 conditional. |
| #31 | "vendor_reports.py sensitive" | CORRECT — line 26 EXACT. 🔴 (must add md/json). |
| #32 | "VendorDetailPage.tsx sensitive only if touched" | DISAGREE — plan says only `components/vendors/` tabs touched, NOT page. ⚪. |
| #33 | "kri-form may trigger token" | **WRONG** — `kri-form/` is NOT in sensitive_change_paths (only `kris/` is). ⚪ unless Sidebar/AuthContext also touched. |
| #35 | "usePermissions sensitive + Sidebar local-gate" | CORRECT. 🔴. |
| #36 | "frontend/src/authz/ sensitive" | CORRECT (line 93). 🟡-🔴. |
| #37 | "regression-only" | CORRECT. 🟡. |
| #38 | "schemas/riskhub.py sensitive" | CORRECT (line 48 EXACT). 🔴. |
| #40 | "endpoints/admin/ multi-file sweep" | CORRECT. 🟡. |
| #41 | "Check 7 prefix `_issue_workflow/`" | **WRONG** — not sensitive. ⚪. |
| #42 | "low; outbox payloads" | CORRECT — not sensitive. ⚪. |
| #43 | "low; core/audit" | CORRECT. ⚪. |
| #44 | "low; router registry" | CORRECT. ⚪. |
| #45a | "test-only" | CORRECT. 🟢. |
| #45b | "core/_permissions/ direct edit" | CORRECT — line 28 sensitive. 🔴. |
| #46 | "multi-prefix across pages/, components/risks/" | CORRECT — many sensitive prefixes. 🟡 (no token expected). |
| #47 | "low; defence-in-depth" | CORRECT — `services/api/` not sensitive. ⚪. |
| #48 | "low; defence-in-depth" | CORRECT — `i18n/` not sensitive. ⚪. |
| #49 | "Check 7 prefix-match" | CORRECT. 🟡. |
| #52 | "Check 7 prefix `_kri_history/`" | CORRECT — line 65. 🟡. |
| #53 | "Check 7 prefix `_issue_workflow/`" | **WRONG** — not sensitive. ⚪. |
| #54 | "Check 7 prefix `_approval_queue/`" | CORRECT — line 55. 🟡. |
| #58 | "endpoints/orphaned_items.py + _orphaned_items/" | CORRECT — both sensitive. 🟡. |
| #59 | "Check 1/2 only" | CORRECT — README-only. 🟢. |
| #62 | "perimeter-pass note path rewrite" | CORRECT — kri_vendor_assignment.py move into `_vendor_links/` (sensitive). 🔴/🟡 depending on contract edits. |
| #63 | "low; defence-in-depth" | CORRECT. ⚪. |
| #64 | "Check 7 minimal" | DISAGREE — App.tsx and `services/api/queryClient.ts` NOT sensitive. ⚪. |
| #67 | "Check 7 prefix `components/riskhub/`" | CORRECT — line 106. 🟡. |
| #68 | "Check 7 only if dashboardApi.ts touched" | CORRECT — plan says NOT touched. ⚪. |
| #71 | "session merge in sensitive prefix" | DISAGREE on intensity — 7a fires only if diff has authz token; session module has none. 🟢-🟡. |
| #73 | "low; defence-in-depth" | DISAGREE — `kri_deadline_service.py` IS sensitive (line 83 EXACT). 🟡. |
| #74a | "TOMLs not in contract" | CORRECT. ⚪. |
| #74b | "ADR-007 amendment text" | CORRECT — defence-in-depth. ⚪/🟢. |
| #75 | "Check 7 prefix `_approval_execution/`" | CORRECT — line 54. 🟡. |
| #20 | "doc-only; defence-in-depth" | CORRECT. ⚪. |
| #34 | "vocabulary; privilege tier" | CORRECT — Check 5 + 16-file fan-out. 🔴. |
| #50 | "service_policy drop (kri history submission)" | CORRECT. 🔴. |
| #51 | "service_policy drop (kri value_application)" | CORRECT. 🔴. |
| #55 | "service_policy drop (access_user_service)" | CORRECT. 🔴. |
| #56 | "service_policy drop (directory_identity)" | CORRECT. 🔴. |
| #60 | "vocabulary; privilege context" | CORRECT. 🔴. |
| #61 | "service_policy path rewrite (graph_directory)" | CORRECT. 🔴. |
| #62 | covered above | — |
| #66 | "AuthContext split" | CORRECT — `AuthContext.tsx` line 108 EXACT. 🔴. |
| #69+#70 | "vendor mixin + status drop" | DISAGREE — `schemas/vendor.py` IS line 50 EXACT sensitive; #70 7a fires. 🟡 (Loop 2 A5 marked 🟢). |
| #72 | "ADR-011 doc" | CORRECT — defence-in-depth. ⚪/🟢. |

---

## 5. Final corrected validator schedule

After adversarial recount:

### A. CERTAIN (HIGH — validator surfaces NEW finding) — 18 items
#8, #13, #15, #24, #28, #34, #35, #38, #39, #45b, #50, #51, #55, #56, #60,
#61, #65, #66.

### B. LIKELY (MEDIUM — Check 7a sweep, no md/json edit expected) — 24 items
#1, #5, #6, #7, #11, #12, #14, #16, #17, #18, #19, #21, #22, #25, #26, #27,
#29, #30 (conditional), #31, #36, #37, #40, #46, #49, #52, #54, #58, #62,
#67, #70, #73, #75. (32 listed; some may flip to 🟢 — net ~24 after final
review.)

### C. LOW / defence-in-depth — 6 items
#45a, #57, #59, #69, #72, #74b.

### D. OUT-OF-SCOPE — 22 items (no validator concern beyond regression)
#2, #3, #4, #9, #10, #20, #23, #32, #33, #41, #42, #43, #44, #47, #48, #53,
#63, #64, #68, #71 (downgraded), #74a.

**Final certain validator-required count: HIGH(18) + MEDIUM(~24) = ~42
items.**

---

## 6. Loop 1's 44 — was it over-count or under-count?

**Slight OVER-COUNT (~2 items).**

- Loop 1 inflated by including #2, #41, #53 (`_issue_workflow/` not sensitive),
  #9 (`_notification_approval_helpers.py` not sensitive), #32 (only tabs
  touched, not page), #33, #3 (`kri-form/` not sensitive).
- Loop 1 was correct on the 28 added items in roughly 24 of 28 cases.

But Loop 1 was **substantially correct** in spirit: Loop 2 A5's 16 was
under-counted by ~26 items, not 28. The validator runs on far more PRs than
A5 acknowledged; Loop 1's instinct was right even if the exact count was off.

**Practical recommendation**: treat Loop 1's 44-item schedule as correct
operationally. Per-item validator runs are cheap (`runner.py` is a pure
file-read scan, no DB), so the cost of 2 extra "no-op" runs is zero. The
risk of UNDER-running the validator is real (every missing run risks an
`authz_contract_not_updated` finding landing in CI).

---

## 7. Disputed-status items

| Item | Loop 1 verdict | Adversarial verdict | Disagreement reason |
|---|---|---|---|
| #2 | 🟡 (issue_workflow) | ⚪ | `_issue_workflow/` NOT in sensitive_change_paths |
| #9 | 🟡 (notification_helpers) | ⚪ | path NOT in sensitive_change_paths |
| #32 | 🟡 (vendor tabs) | ⚪ | `components/vendors/` NOT sensitive |
| #33 | 🟡 (kri-form banner) | ⚪ | `kri-form/` NOT sensitive |
| #41 | 🟡 (issue_workflow alias) | ⚪ | same as #2 |
| #53 | 🟡 (issue_workflow service collapse) | ⚪ | same as #2 |
| #71 | 🔴 (session merge) | 🟢-🟡 | session diffs lack authz tokens |
| #69+#70 | 🟢 (vendor mixin) | 🟡 | `schemas/vendor.py` IS sensitive (line 50) |
| #73 | 🟢 (ADR-012) | 🟡 | `kri_deadline_service.py` IS sensitive (line 83) |
| #1, #19 | 🟢 (low) | 🟡 | `endpoints/risks/` IS sensitive (line 22) |

---

## 8. Recommended validator-run cadence

Per-item, with no exceptions. Reasons:

1. **The validator is cheap**: `runner.py` reads ~10 files, runs 4 regex
   passes over `frontend/src/`, and parses two JSONs. No DB. Sub-second.
2. **Per-item runs catch the intended commit**: each finding cites the
   commit's diff; aggregating across items hides which commit broke parity.
3. **CLAUDE.md mandates per-item**: "python3
   scripts/security/validate_authz_capability_contract.py" is a pre-commit
   gate. Per-item is the natural cadence.
4. **The cost of a forgotten run is high**: `authz_contract_not_updated`
   lands in CI as a hard fail; debugging is harder if the commit boundary
   is unclear.

**Exception** (per Loop 2 A5 already): the C7 atomic cluster (#51 + #24)
should run validator TWICE — once after staging file deletes (catches
`contract_path_missing`), once after staging md/json edits (catches
`authority_path_not_sensitive`). Loop 1 corroborated this; keep it.

**Exception** (NEW per this review): items #38, #65, #66, #71 should run
validator BEFORE staging the catalog/schema changes to capture a baseline
finding count, then again AFTER, to identify NET findings. This is a TDD
discipline applied to the validator itself: confirm the validator surfaces
the expected red, then green, then commit.

---

## 9. Open questions / risks for Loop 3

1. **#65 brace-matching**: the `crudCapabilitySchema.merge(...)` chain
   may break the parser at `capability_catalog.py:112-126`. Loop 3 must
   either (a) have #65's plan use literal full-object syntax (no `.merge`),
   (b) extend the parser, or (c) split #65 into N per-entity commits each
   with a literal flat schema. **CRITICAL DECISION POINT.**

2. **#39 admin builder**: catalog has 7 surfaces today. Adding 8th surface
   `admin_console` requires picking the right Pydantic class name AND ensuring
   `_authorization_capabilities/admin.py` exposes `class
   AdminConsoleCapabilities(BaseModel):` (or whatever the catalog declares).
   Loop 3 must verify the class name matches catalog's `backend.class` key.

3. **#15 + #38 sequencing**: both add to sensitive_change_paths in the
   same wave. Sequencing matters because Check 2 path-existence is
   deterministic; if both add paths in the same commit they don't conflict,
   but if one PR's path doesn't exist when the other PR runs validator,
   Check 2 fires `missing_sensitive_path` (`contract_manifest.py:188-190`).

4. **#66 AuthContext split — per-file allowlist**: new files
   `SessionContext.tsx`, `PreferencesContext.tsx`, `AuthActionsContext.tsx`
   may import `hasPermission` from `useAuth`. If so, each new file lands a
   `+ const { hasPermission } = useAuth()` line which 7b's pattern matches
   (`\bhasPermission\b`). Each new file must be added to
   `FRONTEND_LOCAL_GATE_CLASSIFICATIONS` (`authz_contract_manifest.py:13-63`)
   in the same commit. Loop 3 must enumerate which new files trigger 7b.

5. **#34 + #60 Vocabulary parity**: both add `## Vocabulary` entries.
   Markdown matrix Check 5 enforces section *presence* (`markdown_validation.py:11-21`).
   Order doesn't matter for Check 5; both can land independently.

---

## 10. Summary

- **Loop 1's 44 was a slight over-count (~2 items).** Corrected count: ~42
  items require validator runs (HIGH + MEDIUM).
- **Pydantic ↔ Zod parity items #15, #39, #65 confirmed.** #65 is the
  highest-risk parity item due to brace-matching parser limitations.
- **Per-item validator-run cadence is correct.** Cost is sub-second; risk
  of skipping is high.
- **Loop 2 A5's 16 was UNDER-COUNT by ~26**; Loop 1's instinct was correct,
  even if mechanical execution had ~6 mis-classifications (mostly false
  positives from `_issue_workflow/` not actually being in
  sensitive_change_paths).

End of adversarial validator-schedule review.
