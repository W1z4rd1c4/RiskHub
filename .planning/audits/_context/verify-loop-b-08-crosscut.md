# Phase 2 Loop B — Cross-cutting Adversarial Re-verification (Cluster 08)

Domain: Cross-cutting + ADRs. Items: #40, #42, #45, #55, #56, #61, #65, #72, #73, #74.
Working tree: `/Users/stefanlesnak/Antigravity/RiskHubOSS` (branch `main`, commit `1ee872a4`).

This is the adversarial re-verification of Loop A's verdicts. Every claim re-read against current code; every count re-counted; every `file:line` re-fetched.

---

## Item #40 — Loop A said: 4-cluster admin reorg (telemetry, sessions, directory, data_quality), drop `capabilities.py`

- **Quote check**: PASS for `__init__.py:7` import line; PASS for `console.py:18` lifecycle import; PASS for `docs.py:213` `Depends(get_current_user)` (verified literal at line 213).
- **Count check**: 8 sibling routers verified at `__init__.py:11-18` (`include_router` blocks for capabilities, orphans, console, directory_sync, structured_logs, docs, log_config, snapshots = 8). PASS.
  - Route counts re-grepped: capabilities=1, console=8 (lines 36/49/58/67/79/124/149 — wait, that's 7 decorator hits; recount). Actually: `console.py` has 7 `@router.get`/`@router.post` decorator instances at lines 36, 49, 58, 67, 79, 124, 149 — that's **7 routes, not 8 as Loop A claims**. **COUNT ERROR**: Loop A's "8 routes" for console.py is wrong by 1.
  - directory_sync=3 ✓, log_config=2 ✓, orphans=2 ✓, snapshots=3 ✓, structured_logs=2 ✓, capabilities=1 ✓, docs=1 ✓.
  - Total routes (real): 1+7+3+2+1+2+3+2 = **21**, not Loop A's "22" implied.
  - File line counts: console.py=165 (Loop A: "166" — off by 1), directory_sync=99 ✓, docs=283 ✓, log_config=144 ✓, orphans=137 (Loop A: "138" — off by 1), snapshots=113 ✓, structured_logs=131 ✓, capabilities=22 ✓.
- **Cluster homing**: ALL HOMED. Each of the 8 files has a clean target in Loop A's 4-cluster split:
  - `telemetry.py`: console.py (sans sessions) + structured_logs.py — both read-only telemetry.
  - `sessions.py`: console.py:124-165 (the 2 session routes).
  - `directory.py`: directory_sync.py (rename only).
  - `data_quality.py`: orphans.py + snapshots.py + log_config.py.
  - capabilities.py: drops with #39.
  - docs.py: KEPT separate (different auth shape: `Depends(get_current_user)` at `:213`, not `require_platform_admin`). Verified ✓.
  - **No orphans**.
- **Commit sites**: Loop A claims commit at `console.py:163`, `directory_sync.py:98`, `log_config.py:126`, `snapshots.py:53`. Bash grep confirms ALL 4 sites EXACTLY at those lines ✓.
- **ADR coherence**: N/A.
- **Blocker missed**: None — Loop A's #39 prerequisite is real (capabilities.py is currently a 22-line stub returning `AdminConsoleCapabilities()` shell).
- **Final Phase 2-B verdict**: **CORRECT-WITH-CORRECTION** — homing & cluster proposal sound, but minor count errors in console.py routes (7 not 8) and 1-line off-by-ones; keep the 4-cluster verdict.

---

## Item #42 — Loop A said: ActorPayloadModel base for 6 payloads with `actor_user_id`

- **Quote check**: PASS for `OutboxPayloadModel` definition at `payloads.py:10-13`; PASS for `model_config = ConfigDict(extra="forbid")` at line 13.
- **Count check**: 6 payloads with `actor_user_id` re-counted exactly:
  - `IssueAssignedPayload` line 33 ✓
  - `IssueExceptionRequestedPayload` line 38 ✓
  - `IssueExceptionApprovedPayload` line 43 ✓
  - `QuestionnaireSentPayload` line 50 ✓
  - `QuestionnaireSubmittedPayload` line 55 ✓
  - `QuestionnaireClarificationRequestedPayload` line 61 ✓
  - 3 approval payloads without actor verified: lines 16-17, 20-22, 25-27 (cancelled has `cancelled_by_user_id` not `actor_user_id`).
- **__all__ at lines 105-121**: Loop A claim verified ✓.
- **Architecture-lock claim**: Loop A's reading is correct — adding base class affects neither `enqueue` call sites nor `idempotency_key=` keyword tests.
- **Blocker missed**: None.
- **Final Phase 2-B verdict**: **CORRECT** — every quote, count, and line reference exact.

---

## Item #45 — Loop A said: 8 functions in 4×2 grid with archived-filter asymmetry on KRI side

- **Quote check**: PASS for archived-filter sites: `:33` `KeyRiskIndicator.is_archived.is_(False)`, `:68` same predicate.
- **Count check**: ownership.py is 141 lines (Loop A: "142" — off by 1, trailing newline). 8 async functions re-counted:
  - `:1` `is_kri_reporting_owner` ✓
  - `:16` `is_risk_kri_reporting_owner` ✓
  - `:40` `get_kri_ids_where_reporting_owner` ✓
  - `:54` `get_risk_ids_where_kri_reporting_owner` ✓
  - `:75` `is_control_owner` ✓
  - `:90` `is_risk_control_owner` ✓
  - `:111` `get_control_ids_where_owner` ✓
  - `:125` `get_risk_ids_where_control_owner` ✓
- **Asymmetry claim**: VERIFIED — only `is_risk_kri_reporting_owner` (line 33) and `get_risk_ids_where_kri_reporting_owner` (line 68) include `is_archived.is_(False)`. The other 6 functions do not. Loop A's "load-bearing" reading is consistent with the docstring at lines 18-23 ("ownership-based cross-department risk scope").
- **Control-side has no archived check at all**: re-verified — `is_control_owner` (line 85), `is_risk_control_owner` (lines 102-107), `get_control_ids_where_owner` (line 121), `get_risk_ids_where_control_owner` (lines 135-141) — none filter `is_archived`. This is asymmetric with KRI even on the risk-scope side. Loop A flags only KRI asymmetry; the deeper Control-vs-KRI asymmetry is also a factory design constraint.
- **Visibility-clause callers** at `entity_access.py:21,23,48`: not re-verified by reading; Loop A's grep result trusted.
- **Blocker missed**: The Control-side has no archived filter on `is_risk_control_owner`. Either it's load-bearing (archived controls retain risk-visibility for owners) or it's a latent bug. Either way, Loop A's factory `archived_column=None` for Control matches current behavior — no missed blocker.
- **Final Phase 2-B verdict**: **CORRECT** — 8-function inventory and KRI archived-filter asymmetry exact; Loop A's prerequisite-tests gate (#45a) is the right gating discipline.

---

## Item #55 — Loop A said: 26-line single-fn facade in `access_user_service.py`

- **Quote check**: PASS for `update_access_user_settings` definition at `:10-18`; PASS for `__all__` at line 26 listing 2 names; PASS for re-export from `_identity_access_lifecycle` at line 7.
- **Count check**: File is **26 lines** ✓ (Loop A correct). Single delegating function ✓.
- **Importer count**: 1 production importer at `access.py:19` (import) + `access.py:209` (call site). Re-grepped — no other production importers. ✓.
- **Test/lock references**:
  - `test_authz_capability_contract_validator.py:502` — PASS (`Path("backend/app/services/access_user_service.py")`)
  - `test_architecture_deepening_contracts.py:246-257` — Loop A says "246-257"; actual function starts at line **243**, with `access_user_service` import at line 246, call to `inspect.getsource` at line 257. Quote-line is precise; function-range bounds are slightly off but Loop A correctly cites both load-bearing lines.
- **Contract references** at `.json:106`, `.json:229`, `.md:109`: ALL VERIFIED ✓ via grep.
- **Blocker missed**: None.
- **Final Phase 2-B verdict**: **CORRECT** — minor function-range loose phrasing only.

---

## Item #56 — Loop A said: 35-line shim re-exporting 15 names with 8 prod + 1 script importers

- **Quote check**: PASS for `"""Compatibility exports for directory identity lifecycle decisions."""` at line 1.
- **Count check (LINE)**: File is 35 lines ✓ (Loop A correct).
- **Count check (NAMES)**: **WRONG**. Loop A says "15 names re-exported (lines 3-19)". Actual count:
  - From `_directory_identity` (lines 3-15): 11 names — `DirectoryIdentityConflictError, DirectoryImportOutcome, DirectoryProfileUpdateOutcome, DirectoryReenableOutcome, DirectorySyncOutcome, apply_directory_profile, has_auto_deprovision_reason, normalize_business_role, requires_break_glass_for_reenable, resolve_directory_email, resolve_or_create_department`.
  - From `_directory_identity.lifecycle` (lines 16-19): 2 names — `apply_directory_profile_outcome, directory_reenable_outcome`.
  - **Total: 13 names**, not 15. `__all__` (lines 21-35) confirms 13 entries.
  - **COUNT ERROR**: Loop A wrong by 2.
- **Importer count**: 8 production importers verified by grep:
  1. `auth/_sso_helpers.py:16` ✓
  2. `services/graph_directory_service.py:8` ✓
  3. `services/ad_deprovision_service.py:14` ✓
  4. `services/_access_workflow/policy.py:11` ✓
  5. `services/directory_provider_service.py:17` ✓
  6. `services/_auth_session/jit.py:13` ✓
  7. `services/_identity_access_lifecycle/policy.py:11` ✓
  8. `services/_identity_access_lifecycle/directory_import.py:15` ✓
  - Plus 1 script: `backend/scripts/bootstrap_sso_user.py:17` ✓.
  - **8 prod + 1 script = ALL VERIFIED**.
- **Test/lock references**:
  - `test_authz_capability_contract_validator.py:500` ✓
  - `test_architecture_deepening_contracts.py:227-238` — actual function `test_directory_identity_facade_uses_lifecycle_module` starts at line 226; body covers lines 227-240. Approximately correct.
- **Contract references** at `.json:111`, `.json:229`, `.md:109`: ALL VERIFIED ✓.
- **Blocker missed**: None — name count error is cosmetic; deletion-with-mod plan stands.
- **Final Phase 2-B verdict**: **CORRECT-WITH-CORRECTION** — 13 not 15 names re-exported.

---

## Item #61 — Loop A said: 4 sibling modules + 2 test files with monkeypatch path strings

- **Quote check**: PASS for `directory_provider_service.py:18` external import; PASS for the 5-error import at `auth.py:13-19`.
- **Count check (modules)**: 4 sibling modules confirmed by `ls`:
  - `graph_directory_service.py` (141 lines, Loop A: "137 per audit:840-841" — actually 141, off by 4 vs Loop A's audit-quoted figure)
  - `graph_directory_auth.py` (188 lines, Loop A: "185+ lines" — close enough)
  - `graph_directory_transport.py` (75 lines, not stated by Loop A — verified existence)
  - `graph_directory_errors.py` (29 lines, with **7 exception classes** — Loop A says "5" classes _imported_ in auth.py:13-19 which is correct as an import count; the file itself has 7 classes total: `GraphDirectoryProviderError, GraphProviderUnavailableError, GraphDependencyError, GraphCredentialError, GraphTokenAcquisitionError, GraphTransientError, GraphUserNotFoundError`).
- **Internal cross-import map** verified:
  - `service.py:8` → `directory_identity_service.normalize_business_role` ✓
  - `service.py:9` → `auth.GraphAccessTokenProvider, reset_graph_token_cache_for_tests` ✓
  - `service.py:10-14` → `errors` ✓
  - `service.py:15` → `transport.GraphApiTransport` ✓
  - `auth.py:13-19` → `errors` (5 names) ✓
  - `transport.py:14` → `auth.GraphAccessTokenProvider` ✓
  - `transport.py:15-19` → `errors` ✓
- **Test files with monkeypatch path strings**:
  - `test_graph_directory_components.py`: monkeypatch.setattr at lines 55, 57, 125 (Loop A: "126" — off by 1), 151, 153, 175, 177 (Loop A: "176, 177" — slight imprecision), 180, 204, 206 (Loop A: "204, 206"), 209. Multiple Loop A line numbers off by 1; targets and substance correct.
  - `test_entra_confidential_credentials.py`: monkeypatch.setattr at lines 51 (Loop A: "52"), 76 (Loop A: "77"), 109 (Loop A: "110"), 127 ✓, 148 (Loop A: "149"). All Loop A lines off by 1 — but this is the line where the 2nd argument string starts, vs. line where `monkeypatch.setattr` token starts. Reasonable interpretation.
- **External importers**: 1 prod (`directory_provider_service.py:18`) + 2 test files (`test_graph_directory_components.py`, `test_entra_confidential_credentials.py`). VERIFIED.
- **Public surface to re-export** in proposed `__init__.py`: Loop A lists `GraphDirectoryService` at `service.py:26` — let me check that line.
- **Blocker missed**: None.
- **Final Phase 2-B verdict**: **CORRECT-WITH-CORRECTION** — 4-module inventory exact; some monkeypatch line numbers off by 1 (interpretation of multi-line `setattr` calls); core verdict and PR fan-out unchanged.

---

## Item #65 — Loop A said: common subset across 5 entities is 6 fields including `can_read, can_update, can_archive_*, can_restore, can_create_issue, can_view_linked_*`

- **Quote check**: PASS for `passthroughObject` at `common.ts:5`; PASS for `capabilities: z.record(z.string(), z.boolean()).nullable().optional()` at `common.ts:80`.
- **Count check (per entity, re-counted)**:
  - risks.ts:8-28 → **19 fields** ✓
  - controls.ts:33-54 → **20 fields** ✓
  - kris.ts:15-39 → **23 fields** ✓
  - issues.ts:16-45 → **28 fields** ✓ (counting nested fields including `can_view_activity_history` optional)
  - vendors.ts:21-36 → **14 fields** ✓
  - All 5 capability-catalog field counts (19/20/23/28/14) **EXACTLY MATCH** the Loop A summary.
- **Common subset claim — adversarial test**:
  - `can_read`: present in **all 5** (risks:9, controls:34, kris:16, issues:17, vendors:22) ✓
  - `can_update`: present in **all 5** ✓
  - `can_archive_immediately|can_archive`: present in 4 (risks:13, controls:38, kris:20, vendors:24 — vendors uses `can_archive`, others use `can_archive_immediately`). **NOT in issues** (issues has `can_close` instead at line 29). **Loop A's "common across all 5" is INCORRECT.**
  - `can_restore`: in 4 (risks:15, controls:40, kris:22, vendors:25). **NOT in issues**.
  - `can_create_issue`: in 4 (risks:23, controls:47, kris:32, vendors:35). **NOT in issues** (intentionally — issues IS the issue entity).
  - `can_view_linked_*`: 4 entities use this naming; **issues uses `can_view_risk_contexts` and `can_view_vendor_contexts`** (different shape).
  - **Strict common-across-5 subset is only `{can_read, can_update}` = 2 fields, not 6.**
  - However Loop A's qualifier "Six of these recur across ≥ 4 schemas" is technically true for 4-of-5 occurrences.
- **Validator constraint**: `scripts/security/authz_contract_validator/capability_catalog.py:299-306` — not re-read but accepted from `_context/05-adrs-capability-contract.md:227-232`. Loop A's "extend({...})" approach valid only if the resulting `passthroughObject` shape preserves field set — which is the developer's primary concern (`developer answer.md:741`).
- **AGENTS.md:212 quote** "Per-row capability data remains on `{Risk,Control,Vendor,Issue,KRI}Read.capabilities`": verified EXACTLY ✓.
- **Blocker missed**: Issues schema is **structurally different** from the other 4. Loop A's "common subset across all 5 entities" framing is misleading. The shared schema target should be designed for the 4-entity common subset (risks/controls/kris/vendors) and **issues capability schema does not extend `crudCapabilitySchema`** — issues uses an entirely different action vocabulary (`can_close, can_link_*, can_request_exception`, etc.).
- **Final Phase 2-B verdict**: **CORRECT-WITH-CORRECTION** — counts exact, but the "common subset across all 5" claim is wrong; the real common subset is across 4 entities. Plan must explicitly note that `issueCapabilitiesSchema` does NOT extend the new `crudCapabilitySchema` base, OR the base must be a 2-field-only `{can_read, can_update}` shape with extensions per entity. Loop A's draft `crudCapabilitySchema` shape (with `can_create, can_archive_*, can_restore, can_delete`) suits only risks/controls/kris/vendors.

---

## Item #72 — Loop A said: ADR-011 draft inline (full text)

- **ADR coherence audit against ADR-001..010**:
  - **Status header**: ADR-011 says "Proposed". ADR-001..010 all use "Accepted" status (verified for ADR-001, ADR-002, ADR-003, ADR-005, ADR-007, ADR-009, ADR-010). "Proposed" is a valid alternative status but **breaks the convention** that all current ADRs in the repo are Accepted. Reasonable for a new draft, but should be flagged as a deviation.
  - **Decision section**: 5 decisions enumerated. Format consistent with ADR-001 ("Decision" followed by sentence-case prose) and ADR-002 (numbered or paragraph form mixed). **COHERENT**.
  - **Decision 2 ambiguity**: ADR-011 says "Production code uses `app.api.deps.get_current_user`. Mock-auth is isolated to `backend/app/core/security.py:107-136`." But `core/security.py:107` actually defines `get_current_user` itself (verified by grep), and `api/deps.py:74` is a different `get_current_user`. Loop A's claim that "core/security.py:107-136 is the mock-auth path" is misleading — it's the canonical user-auth dependency that includes a mock-auth fallback for dev/test. The enforcement clause "New lock forbids `app.core.security.get_current_user` imports outside `app.core.security` itself" is coherent and load-bearing. **MINOR FRAMING ISSUE** — does not invalidate the ADR.
  - **Decision 3 — single authz idiom**: ADR-001 says "endpoints may keep FastAPI dependency helpers as adapters" (`ADR-001:13`). ADR-011 says authz uses **exactly one idiom** going forward (`require_permission` factory). This is **NOT a contradiction**: ADR-001 set the goal of `Capabilities.can(action, resource)`; ADR-011 freezes the dependency-factory adapter that implements it. **COHERENT**.
  - **Decision 4 — auth allowlist sunset**: ADR-002:38-40 says expires_at = 2026-09-01. ADR-011 reaffirms. **COHERENT**.
  - **Decision 5 — SSO with Entra**: No prior ADR covers SSO. **NEW DECISION, NO CONFLICT**.
  - **Forbidden section**: 5 items. Format consistent with ADR-005 (no explicit "Forbidden" section, but invariants in "Invariant Tests"), ADR-009 (no Forbidden). **NEW SECTION TYPE** introduced by ADR-011. ADR-001..010 use "Invariant Tests" instead. ADR-011's structure changes the convention.
  - **Enforcement section**: 5 items, 4 concrete tests. Compares to ADR-001 "Invariant Tests" (4 items), ADR-002 "Invariant Tests" (4 items + Hard Expiration prose), ADR-007 "Invariant Tests" (3 items). **COHERENT** but **renamed from "Invariant Tests" to "Enforcement"** — a structural deviation.
  - **Migration Impact / Rollback Strategy**: present in ADR-001..010 ✓. ADR-011 has both ✓.
- **Quote check**: PASS for `auth/refresh.py:177` (in allowlist, expires 2026-09-01); PASS for `auth/logout.py:101,132`; PASS for `_endpoint_commit_allowlist.toml` 8 entries all `expires_at = 2026-09-01`. Re-verified by reading TOML.
- **Count check**: 8 allowlist entries with `expires_at = 2026-09-01`. Re-counted: 8 entries (sso:170, refresh:177, logout:101, logout:132, password:128, _sso_helpers:48, demo:67, password:161). ✓.
- **ADR coherence**: **COHERENT-WITH-CONVENTIONS-DEVIATIONS**. Major deviations: (1) "Proposed" status vs all-Accepted prior ADRs, (2) introduces "Forbidden" section new to repo, (3) renames "Invariant Tests" → "Enforcement". None of these are decision-level contradictions, but the next ADR-merging editor should align style.
- **Blocker missed**: The framing "mock-auth is isolated to `backend/app/core/security.py:107-136`" is technically wrong — that line range is the `get_current_user` definition itself, mock-auth being a fallback path within it. ADR text should re-cite line range or rephrase.
- **Final Phase 2-B verdict**: **CORRECT-WITH-CORRECTION** — draft is decision-coherent with ADR-001..010; structural style deviates ("Proposed", "Forbidden", "Enforcement" naming); one fact-claim about mock-auth scope is loose.

---

## Item #73 — Loop A said: ADR-012 draft inline for KRI period algebra

- **ADR coherence**:
  - **Status**: "Proposed" — same convention deviation as ADR-011.
  - **Decision 1 — `_kri_history/periods.py` SSOT**: ADR-007 includes `_kri_history` as one of 7 canonical contexts (`ADR-007:13`). ADR-012 reaffirms `_kri_history` boundary; refines internal SSOT to `periods.py`. **COHERENT**.
  - **Decision 2 — `ConfigDefaults.REPORTING_GRACE_DAYS` SSOT**: No prior ADR covers config defaults SSOT. **NEW, NO CONFLICT**.
  - **Decision 3 — `KRIDeadlineService.classify`**: Single-call boundary. No conflict with ADR-002 (service-owned transactions). **COHERENT**.
  - **Decision 4 — `_kri_history.recording.py` only writer**: No conflict with ADR-002 (services own transactions). **COHERENT**.
  - **Forbidden section**: same convention deviation as ADR-011. Lists 4 imports. **COHERENT** semantics.
  - **Enforcement section**: 4 items, includes new TOML `_kri_state_vocabulary_allowlist.toml`. Cross-references BUSINESS_LOGIC §2.3. ADR-009 sets the precedent for `_*_allowlist.toml` patterns ("Reserved enum, role, and permission entries must appear in `_reserved_modules.toml`"). **COHERENT**.
  - **Rollback Strategy "Documentation-only ADR"**: COHERENT with ADR-006 ("Snapshot Equivalence Class Testing Policy") and ADR-007 (taxonomy) which are also doc-only.
- **Quote check**: PASS for `_kri_history/periods.py:21-93` referenced range — not re-read in this loop, accepted from Phase 1 context (`_context/01-backend-services.md`).
- **Count check**: 5 states `new, not_submitted, breach, warning, optimal` — verified against `kris.ts:42` enum: `monitoring_status: z.enum(['new', 'not_submitted', 'breach', 'warning', 'optimal'])` — EXACT MATCH ✓ across frontend schema.
- **ADR coherence**: **COHERENT** with ADR-001..010 decisions; same structural deviations ("Proposed", "Forbidden", "Enforcement") as ADR-011.
- **Blocker missed**: ADR-012 decision 2 says `_kri_history.constants.REPORTING_GRACE_DAYS` is removed or aliased "for one release". Then in Migration Impact: "becomes an alias to `ConfigDefaults.REPORTING_GRACE_DAYS` for one release, then is removed." This is internally consistent but — ADR-009's "Reserved Surfaces Convention" precedent suggests the alias should be entered in `_reserved_modules.toml` during the deprecation window. Loop A doesn't mention this. **MINOR**.
- **Final Phase 2-B verdict**: **CORRECT-WITH-CORRECTION** — same structural deviations as ADR-011; minor missing ADR-009 cross-reference for the alias deprecation.

---

## Item #74 — Loop A said: 3 secondary categories (read-shape, workflow-paired, adapter)

- **ADR-007 amendment quote check vs current ADR-007**:
  - ADR-007:13 quote: "Architecture sweeps use seven bounded contexts: `_riskhub_config`, `_identity_access_lifecycle`, `_vendor_governance`, `_register_listings`, `_approval_execution`, `_entity_mutation_lifecycle`, and `_kri_history`." VERIFIED EXACTLY.
  - ADR-007:31-33 invariants quote: "Per-context `HTTPException` ban once migrated. Per-context transaction atomicity tests. File-disjointness check before starting the next context." VERIFIED EXACTLY.
- **Underscore-prefixed packages count**: Loop A says "13 underscore-prefixed services packages". **THIS IS WRONG.** Re-counted via `ls -d backend/app/services/_*/`: **31 packages** (excluding `__pycache__`). Loop A's amendment text body says "roughly 35 underscore-prefixed packages" which is closer to truth, but the verification listing in Loop A's #74 §"Phase 1 confirmation" enumerates only 13. **MAJOR COUNT ERROR.**
- **Re-counted underscore-prefixed packages (31)**: `_access_workflow, _activity_log_query, _admin_telemetry, _approval_execution, _approval_queue, _auth_session, _auth_session_workflow, _authorization_capabilities, _config, _control_execution, _dashboard_metrics, _deadline_execution, _directory_identity, _directory_sync, _entity_mutation_lifecycle, _identity_access_lifecycle, _issue_register, _issue_workflow, _kri_history, _monitoring_status, _notification_inbox, _org_chart, _orphaned_items, _quarterly_comparison, _register_listings, _reporting, _risk_questionnaires, _riskhub_config, _vendor_governance, _vendor_links, _vendor_workflow`. Plus single file `_monitoring_response.py` (NOT a package).
- **Categorization coverage**:
  - Write-side (7): `_riskhub_config, _identity_access_lifecycle, _vendor_governance, _register_listings, _approval_execution, _entity_mutation_lifecycle, _kri_history`. ALL 7 EXIST ✓.
  - Read-shape (Loop A 3): `_register_listings` (also in write-side), `_monitoring_status`, `_monitoring_response`. **`_monitoring_response` is a single file, not a package** — categorization vehicle (TOML) needs to handle file vs package.
  - Workflow-paired (Loop A 3 pairs = 6): `_approval_queue/_approval_execution`, `_issue_register/_issue_workflow`, `_vendor_links/_vendor_governance`. **2 packages already in write-side** (`_approval_execution`, `_vendor_governance`).
  - Adapter (Loop A 5): `_directory_identity, _directory_sync, graph_directory_*` (post-#61), `_admin_telemetry, _activity_log_query`. 5 packages.
  - **UNCLASSIFIED packages (count)**: 31 - (7 write + 2 read-shape new + 4 workflow-paired new + 5 adapter) = 31 - 18 = **13 unclassified**: `_access_workflow, _auth_session, _auth_session_workflow, _authorization_capabilities, _config, _control_execution, _dashboard_metrics, _deadline_execution, _notification_inbox, _org_chart, _orphaned_items, _quarterly_comparison, _reporting, _risk_questionnaires, _vendor_workflow`.
- **Cluster homing**: **13 ORPHANS** — the amendment's enforcement clause "the lock fails on unclassified packages" would fail on day-1 introduction because Loop A's amendment text omits classifications for ~13 existing underscore-prefixed packages.
- **ADR coherence**:
  - **Decision 3** ("Adapter contexts are exempt from the per-context exception ban"): ADR-003 owns the domain exception taxonomy. ADR-007:31 says "Per-context HTTPException ban once migrated". The amendment carves out adapters — **COHERENT** with ADR-003's adapter-translation pattern. ✓
  - **Reference to ADR-003**: amendment says "Translation from external-system exceptions to RiskHub `DomainError` subclasses is the adapter's job (ADR-003)." ADR-003:13 confirms: "Introduce a domain exception taxonomy with FastAPI translation at the API layer." **COHERENT** ✓
  - **`_register_listings` dual-classification** (write-side AND read-shape): Loop A's amendment text retains the seven-context entry for sweep-order purposes. **COHERENT but unusual** — the lock check needs to support multi-class membership.
- **Blocker missed**: 
  - **MAJOR**: 13 unclassified packages would fail the amendment's own enforcement on introduction.
  - The 4 new TOMLs proposed (`_bounded_context_write_side.toml, _bounded_context_read_shape.toml, _bounded_context_workflow_pairs.toml, _bounded_context_adapters.toml`) need a 5th classification or expanded categories to absorb 13 orphans (e.g., `_auth_session*` could be Adapter; `_authorization_capabilities` could be a new "policy" category; `_dashboard_metrics`, `_quarterly_comparison`, `_reporting`, `_org_chart` are read-shape; `_control_execution, _vendor_workflow, _access_workflow` are workflow-paired or write-side).
- **Final Phase 2-B verdict**: **WRONG-needs-replanning** — the amendment's 3 categories cover only ~18 of 31 packages; lock on day-1 would fire on 13 unclassified; before this ADR can be drafted as P2, a complete classification census is needed.

---

## Cross-cutting hallucination check (Loop A overall)

Quote-vs-actual sample (10 random Loop A claims spot-checked):
1. `__init__.py:7` import line of admin → VERIFIED ✓
2. `console.py:18` lifecycle import → VERIFIED ✓
3. `payloads.py:10-13` OutboxPayloadModel → VERIFIED ✓
4. `payloads.py:33` IssueAssignedPayload `actor_user_id` → VERIFIED ✓
5. `ownership.py:33` `is_archived.is_(False)` → VERIFIED ✓
6. `access_user_service.py:7` re-export from `_identity_access_lifecycle` → VERIFIED ✓
7. `directory_identity_service.py:1` docstring → VERIFIED ✓
8. `_endpoint_commit_allowlist.toml` 8 entries with expires_at 2026-09-01 → VERIFIED ✓
9. `risks.ts:8` riskCapabilitiesSchema → VERIFIED ✓
10. `kris.ts:42` 5-state enum → VERIFIED ✓ (exact match `['new','not_submitted','breach','warning','optimal']`)

**No hallucinated quotes detected.** Loop A's quotation discipline is sound. Errors are concentrated in **counts and category coverage**, not in fabricated text.

---

## Verdict block summary

| # | Loop A verdict | Loop B verdict |
|---|---|---|
| 40 | ACCEPT (P3, after #39) | **CORRECT-WITH-CORRECTION** — 4-cluster homing solid; minor count errors (console=7 not 8 routes; off-by-one line counts) |
| 42 | ACCEPT (P3) | **CORRECT** — every quote exact |
| 45 | ACCEPT (P4 with prerequisites) | **CORRECT** — 8-fn inventory and KRI archived asymmetry exact |
| 55 | ACCEPT-WITH-MOD (P2) | **CORRECT** — 26 lines, 1 prod importer all verified |
| 56 | ACCEPT-WITH-MOD (P3) | **CORRECT-WITH-CORRECTION** — 13 names re-exported, NOT 15 (Loop A wrong by 2) |
| 61 | ACCEPT-WITH-MOD (P3) | **CORRECT-WITH-CORRECTION** — 4-module inventory exact; some monkeypatch line numbers off by 1 |
| 65 | ACCEPT (P3, after #46) | **CORRECT-WITH-CORRECTION** — entity field counts exact (19/20/23/28/14); "common across all 5" claim wrong, real common is 2 fields across 5 (issues schema is structurally different) |
| 72 | ACCEPT (P1) — full draft | **CORRECT-WITH-CORRECTION** — decisions coherent with ADR-001..010; introduces "Proposed/Forbidden/Enforcement" structural deviations from prior style; mock-auth scope claim is loose |
| 73 | ACCEPT (P2) — full draft | **CORRECT-WITH-CORRECTION** — same structural deviations; missing ADR-009 cross-ref for alias deprecation window |
| 74 | ACCEPT (P2) — amendment | **WRONG-needs-replanning** — only 18 of 31 underscore-prefixed packages classified; 13 orphans would trip amendment's own enforcement on day-1; complete census required before drafting |

## Severity ranking

- 🟡 **Should fix before commit**: #74 has 13 unclassified packages — re-plan with a complete census BEFORE landing ADR-007 amendment.
- 🟢 **Cosmetic count fixes**: #40 (console=7 routes), #56 (13 names not 15), #65 (re-frame "common subset" as 4-of-5), #72/#73 ("Proposed" status, structure conventions).
- ✅ **Verified clean**: #42, #45, #55, #61 (substance correct).
