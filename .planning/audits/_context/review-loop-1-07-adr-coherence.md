# Phase 4 Loop 1 — ADR Coherence Review (CONSTRUCTIVE)

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Subject: ADR drafts in `.planning/audits/_context/plan-loop-3-06-adr-drafts.md` (ADR-011, ADR-012, ADR-007 amendment) compared against `docs/adr/ADR-001..010` in full.

Mode: Constructive. Find coherence issues; do not propose new items.

Method: read every existing ADR end-to-end; verify section structure, status convention, voice, internal-citation chain, and absence of contradictions. Quote `<= 15 words` and cite `file:line`.

---

## Voice / structure baseline (ADR-001..010)

Empirical evidence:

- Status line is `Accepted` in every existing ADR — `ADR-001:5`, `ADR-002:5`, `ADR-003:5`, `ADR-004:5`, `ADR-005:5`, `ADR-006:5`, `ADR-007:5`, `ADR-008:5`, `ADR-009:5`, `ADR-010:5` (all read directly).
- Section header order verified across `ADR-001..010` is the seven-header sequence: `## Status`, `## Context`, `## Decision`, `## Alternatives Rejected`, `## Migration Impact`, `## Rollback Strategy`, `## Invariant Tests`. Confirmed by direct reads. `ADR-001:1-34` is the canonical baseline; ADR-002 adds three named subsections after `## Invariant Tests` (`## Hard Expiration on Auth-Flow Exemption` `ADR-002:38`, `## Outbox Dispatcher Consolidation` `ADR-002:42`, `## Handler Idempotency` `ADR-002:46`) — establishing the precedent ADR-011 reuses.
- ADR-005 uses inline `### sub-sections` inside `## Decision` — `### ControlStatus.inactive retention (v5.3+)` at `ADR-005:17`. Establishes precedent ADR-012 reuses.
- No existing ADR carries an explicit `## Cross-References` section header. ADR-007 references contexts inline; ADR-005 references consumer modules by import path inline; ADR-008 cites helpers inline. **ADR-012's draft adds a top-level `## Cross-References` section that is not in any existing ADR.**
- No existing ADR uses `## Forbidden` or `## Enforcement` headers; they fold those concerns into `## Decision` prose and `## Invariant Tests` respectively.

Status-convention answer (open question): **`Accepted`** is correct. Every existing ADR is `Accepted`; the repo has no `Proposed` precedent. The drafts' choice of `Accepted` matches.

---

## ADR-011 (Auth Scheme and Session Model)

```
- Status convention: PASS (matches ADR-001..010 "Accepted")
- Section structure: PASS (seven canonical headers + named subsections in ADR-002 style)
- Contradiction with ADR-002: NONE — defers to ADR-002's existing _endpoint_commit_allowlist + 2026-09-01 sunset; "lock cap drops to 0 after the sunset date" reinforces ADR-002:40 rather than redefining
- Contradiction with ADR-003: FOUND-MINOR — ADR-011 forbids new "inline `if not has_permission` raises" but does not state which DomainError replaces them. Existing AuthorizationError (backend/app/core/exceptions.py:35) and AuthenticationError (backend/app/core/exceptions.py:39) are already in EXCEPTION_REGISTRY (backend/app/core/exceptions.py:66-69). No new exception types are required, but the ADR should explicitly note that the existing AuthorizationError/AuthenticationError pair is the canonical projection — currently silent.
- Contradiction with ADR-004: NONE — JWT exp/iat construction at backend/app/core/security.py:68 already uses utc_now(); ADR-011 does not contradict, but it also does not cite ADR-004. The AND-gated mock-auth branch lives in the same file and is unrelated to UTC.
- Missing cross-reference to ADR-001: FOUND — ADR-011 prose names "the require_permission(action, resource) FastAPI dependency factory defined under ADR-001" but the line under ## Cross-References-equivalent is missing. Add a one-line citation.
- Missing cross-reference to ADR-003: FOUND — ADR-011 section "Endpoint authorization uses exactly one idiom" implicitly relies on ADR-003 exception projection (HTTPException 401/403 must be raised via DomainError translation per backend/app/core/exceptions.py:66-69). The link is not stated.
- Voice match: PASS — prose voice matches ADR-002 ("Endpoint commit calls remain only in a temporary allowlist during migration" ADR-002:25 vs ADR-011 "are tracked for migration but the count is non-increasing"). Bullet density and citation style match.
- Enforcement coverage: PASS — three new lock tests named (test_w12_auth_idiom_ratchet_red.py, test_w12_get_current_user_isolation_red.py, test_w12_mock_auth_guard_red.py) plus extension of test_w5_endpoint_commit_ratchet_red.py.
```

Specific findings (ADR-011):

1. **A11.1 — Add explicit ADR-003 citation in `## Decision`**: the draft says "Body-call `_require_*` helpers and inline `if not has_permission` raises are frozen" without naming the canonical replacement projection. ADR-003's `AuthorizationError` (`backend/app/core/exceptions.py:35`) and `AuthenticationError` (`backend/app/core/exceptions.py:39`) are already in `EXCEPTION_REGISTRY` (`backend/app/core/exceptions.py:66-69`); no new exception types needed, but the ADR should state "Replacement raises route through `AuthorizationError`/`AuthenticationError` per ADR-003." Currently ADR-011 mentions ADR-003 zero times.

2. **A11.2 — Add ADR-001 citation in `## Decision`**: prose names `require_permission` "defined under ADR-001" but no `ADR-001` token appears in the body. ADR-007 amendment cites `ADR-001` directly (e.g. amendment text "subject to ADR-001 and ADR-008 SSOT discipline"); ADR-011 should match that citation density.

3. **A11.3 — `## SSO Token-Exchange Boundary` is well-formed but does not bind an invariant test**. ADR-002's three named subsections (`## Hard Expiration on Auth-Flow Exemption`, `## Outbox Dispatcher Consolidation`, `## Handler Idempotency`) each cite the lock test that enforces them (`test_w5_endpoint_commit_ratchet_red.py`, `test_w4b_outbox_no_commit_in_store_red.py`, `test_w12_outbox_enqueue_idempotency_key_present_red.py`). ADR-011's `## SSO Token-Exchange Boundary` cites only file paths; no lock test asserts "RiskHub session owns lifetime from the exchange point forward." This is a gap in voice parity with ADR-002.

4. **A11.4 — UtcAwareDatetime is not cited but should be**. ADR-011's drafted section pins JWT lifetimes via `expires_delta` and `exp` claim. `backend/app/core/security.py:68` uses `utc_now()` already. Add a one-line note in `## Invariant Tests` or `## Decision`: "JWT `exp`/`iat` claims construct from `utc_now()` per ADR-004; bare `datetime.utcnow()` remains banned." Currently silent on ADR-004.

5. **A11.5 — Two-condition AND wording is correct**. The phrase "both conditions are required (the AND is load-bearing; either alone is forbidden)" is unambiguous and supports the lock at `test_w12_mock_auth_guard_red.py`. **Verified clean** — matches the `mock_auth_enabled and settings.debug` guard in `backend/app/core/security.py:120`.

6. **A11.6 — `get_current_user` import isolation is empirically supported**. Confirmed by spot-grep: `app.api.deps.get_current_user` is the production import path (e.g. `backend/app/api/v1/endpoints/riskhub/public_config.py:5`, `backend/app/api/v1/endpoints/riskhub/_shared.py:4`, `backend/app/api/v1/endpoints/admin/_deps.py:5`). The lock at `test_w12_get_current_user_isolation_red.py` is realistic.

---

## ADR-012 (KRI Time-Series Period Algebra and Deadline Classification)

```
- Status convention: PASS (matches ADR-001..010 "Accepted")
- Section structure: FAIL — adds a top-level `## Cross-References` section header NOT present in any existing ADR (ADR-001..010 use inline citations or fold cross-refs into ## Invariant Tests bullets). This breaks voice parity.
- Contradiction with ADR-005: NONE — KRI is one of the four ArchivableMixin entities (ADR-005:39 "Migration tests verify backfill for Risk, Control, Vendor, and KRI"). ADR-012's recording.py SSOT does not contradict ArchivableMixin; live/archive predicates remain untouched.
- Contradiction with ADR-006: NONE — ADR-012 explicitly cites "A snapshot rebaseline for the affected listing/dashboard surfaces is taken under ADR-006 before the collapse."
- Contradiction with ADR-007: NONE — ADR-012 cites `ADR-007:13` for `_kri_history` boundary; the period-algebra SSOT lives inside `_kri_history`, respecting bounded-context atomicity.
- Contradiction with ADR-008: FOUND-MINOR — ADR-008's threshold SSOT uses `get_config_int` with `ConfigDefaults` (ADR-008:13). ADR-012 deletes `ConfigDefaults.REPORTING_GRACE_DAYS` (`_config/lookup.py:26`). This is consistent in shape but inverts the SSOT direction (`ConfigDefaults` is the SSOT for risk thresholds; for grace days `_kri_history.constants` is the SSOT). The draft addresses this in its Alternatives Rejected ("Pick `ConfigDefaults.REPORTING_GRACE_DAYS` as SSOT: rejected because the `_kri_history.constants` value is consumed by every other module") — but the ADR's "## Decision" should explicitly state that this is a deliberate variation from ADR-008's threshold pattern, not an SSOT inconsistency. Currently the ADR claims to "reuse the same pattern" (Cross-References ADR-008) which is not literally true.
- Contradiction with ADR-009: NONE — alias deprecation correctly defers to ADR-009's `_reserved_modules.toml` registration, with the caveat noted in A12.4 below.
- Contradiction with ADR-004: NONE (period_bounds_for_date already operates on UTC-aware dates in `_kri_history.periods.py`; ADR-012 does not contradict, but does not explicitly cite ADR-004).
- Missing cross-reference to ADR-002: FOUND — ADR-012 introduces "`backend/app/services/_kri_history/recording.py` is the sole writer of period-tagged KRIHistory rows" — this is an ADR-002 service-owned-transactions concern. The recorder is the transaction-owning entrypoint and should cite ADR-002.
- Voice match: FAIL-MINOR — adds `## Cross-References` section that no existing ADR uses; the cross-references should be folded into `## Invariant Tests` bullets (ADR-008 model) or inline in `## Decision` (ADR-007 model).
- Enforcement coverage: PASS — five new locks named (test_kri_period_algebra_ssot_red.py, plus three behaviours, plus _kri_state_vocabulary_allowlist.toml).
```

Specific findings (ADR-012):

1. **A12.1 — Drop the `## Cross-References` section header**. No existing ADR uses this header. ADR-008 folds cross-refs into `## Invariant Tests` bullet ("Doc alignment: tests/backend/pytest/test_w2_doc_contract_alignment_red.py"); ADR-005 folds them inline in `## Decision`. The four bullets currently under ADR-012's `## Cross-References` should move into `## Invariant Tests` (one bullet per ADR cited) or inline in the `## Decision` prose. Voice parity is broken otherwise.

2. **A12.2 — `## Decision` should soften the "same pattern as ADR-008" claim**. The Cross-References bullet "ADR-008 — sets the SSOT pattern for risk thresholds; ADR-012 reuses the same pattern" is not literally accurate: ADR-008 makes `ConfigDefaults` the SSOT (`ConfigDefaults` consumed via `get_config_int`); ADR-012 makes `_kri_history.constants` the SSOT and **deletes** the corresponding `ConfigDefaults.REPORTING_GRACE_DAYS` entry. Replace "reuses the same pattern" with "applies the SSOT discipline of ADR-008 to a different anchor, with rationale documented in `## Alternatives Rejected`." This avoids implying that `ConfigDefaults` is uniformly the SSOT location — which contradicts ADR-008's actual scope (risk thresholds only).

3. **A12.3 — Add ADR-002 citation in `## Decision`**: the draft introduces `_kri_history/recording.py` as "the sole writer of `KRIHistory` rows that carry a period identity." This is an ADR-002 service-entrypoint concern (sole writer = transaction owner). Add: "per ADR-002 the recorder is the transaction-owning service entrypoint." Currently silent on ADR-002.

4. **A12.4 — ADR-009 alias-deprecation citation is conditional**. The draft says "any temporary alias entry in `_reserved_modules.toml` during the deprecation window for `_kri_history.constants.REPORTING_GRACE_DAYS` aliasing, if used." `_reserved_modules.toml` per `ADR-009:13` covers reserved enum/role/permission entries; ADR-009 does not document an "alias deprecation window" surface. The ADR-012 reference should clarify whether (a) `_reserved_modules.toml` will accept a new entry-type for module-level aliases, or (b) a different registry governs aliases. Currently the draft conflates two scopes — ADR-009 records reservations of *unimplemented* surfaces, not deprecation aliases of *existing* surfaces. This is a coherence gap.

5. **A12.5 — Five-state vocabulary lock realistic**. The frontend pin (`frontend/src/services/api/schemas/entities/kris.ts:42`) is empirically supported (cited in draft); pinning the `monitoring_status: z.enum(['new','not_submitted','breach','warning','optimal'])` together with the backend `KRIDeadlineService.classify` emit set is a clean cross-stack lock. **Verified clean.**

6. **A12.6 — `## Migration Impact` is concrete and complete**. The four file-level rewrite targets (`kri_deadline_service.py:64,77,78`, `kri_deadline_service.py:52`, `kri_deadline_support.py:36`, `_config/lookup.py:26`) plus the snapshot rebaseline reference are all verifiable. **Verified clean.**

---

## ADR-007 Amendment (Read-Shape, Workflow-Paired, Adapter, and Core Categories)

```
- Status convention: PASS — uses "Accepted (as an amendment)" which is consistent with the parent ADR-007:5 "Accepted"
- Section structure: PASS — uses ### sub-headers (### Status, ### Context, ### Decision, ### Alternatives Rejected, ### Migration Impact, ### Rollback Strategy, ### Invariant Tests) which is the right shape for an in-file amendment (the parent ADR-007 already used `## Invariant Tests` as a top-level header at ADR-007:29; appending under it preserves the file's structure). Matches ADR-002's named-subsection precedent at `## Hard Expiration` (ADR-002:38) which used `##` for the subsection header — the amendment's choice of `###` is one notch deeper, which is appropriate because the amendment is a self-contained sub-document.
- Original seven contexts preserved: PASS — Decision text states "The seven-context list at ADR-007 §Decision remains the canonical write-side enumeration." Cross-checks against ADR-007:13.
- Contradiction with the seven contexts: NONE — `_register_listings` dual-classification is explicitly named, the amendment does not reclassify the seven; it ADDS categories. Matches the directive in the open-questions list.
- Contradiction with ADR-001: NONE — Core category binds `_authorization_capabilities` to ADR-001 SSOT (`ADR-001:13` "one public Capabilities Module Interface"). The bind is explicit in the amendment's `### Decision` ¶4 and `### Invariant Tests` bullet 5.
- Contradiction with ADR-002: NONE — workflow-paired contexts sweep "as one rollback unit"; this is not a new transaction rule, it's a sweep-ordering rule that respects ADR-002's per-context atomicity tests.
- Contradiction with ADR-005: NONE — the four archivable models (Risk, Control, Vendor, KRI per ADR-005:39) live in write-side contexts (`_vendor_governance`, `_entity_mutation_lifecycle`, `_kri_history`); the amendment does not move them.
- Contradiction with ADR-010: NONE — adapter contexts are documented as exception-translation seams; ADR-010's forward-only migration rules apply to write-side contexts and are unaffected.
- Disjointness lock extension: PASS — the amendment names `test_w7_bounded_context_disjointness.py` and explicitly handles `_register_listings` as the documented dual-class case ("the lock counts each package once except for the explicitly-dual `_register_listings`").
- Voice match: PASS — bullet density and citation style match ADR-007 (e.g. "Per-context HTTPException ban once migrated" ADR-007:31 vs amendment "the lock allows HTTPException translation only at the adapter boundary").
- Enforcement coverage: PASS — five new TOMLs named, lock extension articulated.
```

Specific findings (ADR-007 amendment):

1. **A7a.1 — `## Decision` ¶3 (adapter contexts) cites ADR-003 implicitly**. The amendment text says "Translation from external-system exceptions to RiskHub `DomainError` subclasses is the adapter's job per ADR-003." This is correct and matches `ADR-003:33` "AST ban on `raise HTTPException` in migrated service packages and reviewed core seams." **Verified clean.**

2. **A7a.2 — Core category name is appropriate but carries a collision risk**. The repo already has `backend/app/core/` (verified: `backend/app/core/exceptions.py`, `backend/app/core/security.py`, `backend/app/core/datetime_utils.py`, `backend/app/core/_permissions/`, etc.). A taxonomy category named "Core" applied to **service** packages (`_authorization_capabilities`, `_config`) is slightly ambiguous because `core/` is a sibling directory tree, not a service-package category. **Recommended mitigation**: rename to "Cross-cutting" in the amendment text and TOML name (`_bounded_context_cross_cutting.toml` instead of `_bounded_context_core.toml`). The drafted Alternatives Rejected paragraph already considers "Three categories without `Core`" — consider also rejecting "Three categories without `Cross-cutting`" to make the rationale explicit. Open-question answer below.

3. **A7a.3 — Workflow-pair count is 10 pairs, but a graph reading suggests 9 unique left-halves**. Counting the bullet list under `### Decision` ¶2:
   - `_approval_queue ↔ _approval_execution` (1)
   - `_issue_register ↔ _issue_workflow` (2)
   - `_vendor_links ↔ _vendor_governance` (3)
   - `_access_workflow ↔ _identity_access_lifecycle` (4)
   - `_control_execution ↔ _entity_mutation_lifecycle` (5)
   - `_deadline_execution ↔ _kri_history` (6)
   - `_auth_session_workflow ↔ _auth_session` (7)
   - `_risk_questionnaires ↔ _vendor_governance` (8) — `_vendor_governance` reused
   - `_vendor_workflow ↔ _vendor_governance` (9) — `_vendor_governance` reused again
   - `_notification_inbox ↔ _admin_telemetry` (10) — both right-halves are workflow/adapter, not write-side
   
   `_vendor_governance` appears as the right-half in three pairs (3, 8, 9). The amendment should explicitly state that one write-side context can be paired with multiple workflow-side contexts (this is a many-to-one mapping). Currently the lock spec ("a sweep that touches one half also covers the other") works in both directions but would require touching `_vendor_governance` to also sweep all three left-halves. Risk: the lock as written might be over-aggressive. **Recommended clarification**: add to `### Decision` ¶2 "Workflow-pair sweep direction is left → right (touching the workflow half forces the write-side half to sweep, but not vice versa)."

4. **A7a.4 — `_notification_inbox ↔ _admin_telemetry` pairing has an adapter-vs-workflow conflict**. The amendment classifies `_admin_telemetry` as an Adapter context (¶3 bullet "Adapter contexts: ... `_admin_telemetry`") AND as the right-half of a workflow pair (¶2 bullet "_notification_inbox ↔ _admin_telemetry"). The disjointness lock requires every package in EXACTLY ONE allowlist; `_admin_telemetry` would appear in `_bounded_context_adapters.toml` AND would be cited as the right-half of a pair in `_bounded_context_workflow_pairs.toml`. The amendment's draft text ("the lock counts each package once except for the explicitly-dual `_register_listings`") explicitly forbids this. **Resolution required**: either (a) classify `_notification_inbox` as Adapter (matching `_admin_telemetry`) and document the inbox→telemetry coupling as an adapter-to-adapter coupling; or (b) move `_admin_telemetry` to Workflow-paired and remove it from Adapter; or (c) declare `_admin_telemetry` as a second dual-class. Open-question answer below.

5. **A7a.5 — Counts in the closing summary do not balance against the disjointness rule**. Draft text: "7 write-side + 8 read-shape (incl. `_monitoring_response.py` file + `_register_listings` dual-class) + 12 workflow-paired + 6 adapter + 2 core = 35 entries across 31 packages and 1 file." The math: the 12 workflow-paired count includes 10 pairs of left-halves only (one per pair), but several pairs share a right-half (`_vendor_governance` ×3). If the count is "left-half packages enumerated as workflow-paired", then it is 10, not 12. If the count is "all unique packages appearing on either side of any pair", then `_vendor_governance` (write-side), `_identity_access_lifecycle` (write-side), `_entity_mutation_lifecycle` (write-side), `_kri_history` (write-side), `_auth_session` (adapter), `_admin_telemetry` (adapter) all appear as right-halves and double-count. **Recommended fix**: rewrite the count breakdown to enumerate "10 workflow left-halves" and clarify that right-halves carry their primary category (write-side or adapter). The open-question text already flags this as a count-sanity issue Loop B will hit.

6. **A7a.6 — `_orphaned_items` Read-shape vs Workflow-paired**. The draft picks Read-shape ("Read-shape because the listing projection dominates"). Looking at the package contents: `core.py`, `flagging.py`, `governance.py`, `logging.py`, `reads.py`, `resolution.py`, `resolution_plan.py`, `service.py`, `stats.py`, `workflow.py` — the package has BOTH a `reads.py` (read-shape) AND a `workflow.py` (workflow). It looks like a workflow-side package that also exposes read projections. **Open-question answer below.**

---

## Cross-cutting findings

1. **C-1 — None of the three drafts cite ADR-006 except ADR-012**. ADR-011 introduces three new lock tests; the migration of body-call `_require_*` and inline-`403` sites is a behavior-preserving refactor that should ride on ADR-006 snapshot equivalence (per `ADR-006:13` "before behavior-preserving refactors"). ADR-011 should add: "Auth-idiom migration is gated on ADR-006 snapshot rebaseline of affected route fixtures."

2. **C-2 — None of the three drafts cite ADR-010 even though several touch migrations**. ADR-012 deletes `ConfigDefaults.REPORTING_GRACE_DAYS = 15` (a code constant, not a column), so ADR-010 does not strictly apply. ADR-007 amendment introduces five new TOMLs but no DB migrations. **Verified clean** — no ADR-010 citation needed.

3. **C-3 — Voice parity: "Forbidden additions" prose folded into `## Decision` per ADR-002:13/25 voice — this is correctly applied across all three drafts.** ADR-011 says "are forbidden" (e.g. "New SSO providers ... do not bypass refresh rotation"); ADR-012 says "is forbidden" (e.g. "A second `REPORTING_GRACE_DAYS` constant or alias outside `_kri_history.constants` is forbidden"); ADR-007 amendment uses parallel prose. **Verified clean.**

4. **C-4 — None of the drafts cite ADR-009 surface registration *for adapter contexts***. The ADR-007 amendment's adapter category exempts adapter boundaries from the per-context HTTPException ban. This is an exception to the per-context ban and is a good candidate for `_reserved_modules.toml` — except ADR-009 covers code-declaration reserved surfaces (entity types, roles, permissions), not architecture-lock exemptions. The right home for adapter-boundary exemptions is the per-context `_*_boundaries_red.py` allowlist family, not `_reserved_modules.toml`. **Verified clean** (no ADR-009 citation needed for adapter exemptions).

---

## Open-question resolutions (with rationale)

### Q1 — ADR status convention

**Answer**: `Accepted`. Every existing ADR (`ADR-001:5` through `ADR-010:5`) uses `Accepted`. There is no `Proposed` precedent in the repo. Drafts already pick `Accepted`; **no change needed.**

### Q2 — `_orphaned_items` classification

**Answer**: Reclassify as **Workflow-paired** with `_admin_telemetry`. Rationale: the package contains both read (`reads.py`, `stats.py`) AND write (`resolution.py`, `resolution_plan.py`, `workflow.py`, `flagging.py`) modules. A pure Read-shape context has no `workflow.py` (compare `_dashboard_metrics`, `_quarterly_comparison`, `_reporting`, `_org_chart` which are all read-only projections). The presence of `workflow.py` and `governance.py` makes `_orphaned_items` the workflow side of orphan-management, with `_admin_telemetry` as the audit-projection right-half. **Recommended ADR-007 amendment edit**: move `_orphaned_items` from Read-shape to Workflow-paired, keep the table appendix and update one row.

Caveat: this collides with finding **A7a.4** because `_admin_telemetry` is then a right-half of two pairs (`_notification_inbox ↔ _admin_telemetry` AND `_orphaned_items ↔ _admin_telemetry`) AND classified as Adapter. This is the same many-to-one pattern as `_vendor_governance`. Resolve by treating `_admin_telemetry` as Adapter (its primary category) and accept that workflow-pair right-halves can be Adapter or write-side — this is the simplest model.

### Q3 — `_notification_inbox` classification

**Answer**: **Workflow-paired** (paired with `_admin_telemetry`). The package contains `lifecycle.py` (single-file workflow surface), which is a workflow signature. Adapter would be wrong because `_notification_inbox` does not translate external system exceptions to `DomainError` (the ADR-003 adapter test); it owns notification dispatch lifecycle inside RiskHub. The draft already picks Workflow-paired; **no change needed.**

### Q4 — 5th category name (Core vs Policy vs Cross-cutting)

**Answer**: **`Cross-cutting`**. Rationale:

- `Core` collides with the existing `backend/app/core/` directory (verified: `backend/app/core/exceptions.py`, `backend/app/core/security.py`, etc.). A taxonomy bucket named "Core" applied to *services* (`_authorization_capabilities`, `_config`) creates ambiguity with `core/` — readers will conflate the two scopes.
- `Policy` is too narrow — `_config` is not strictly policy; it provides configuration defaults consumed by every other context.
- `Cross-cutting` matches the existing ADR-007 vocabulary inflection ("Architecture sweeps use seven bounded contexts" `ADR-007:13`) and is unambiguous against the `core/` directory.

**Recommended ADR-007 amendment edits**:
- Replace `Core` with `Cross-cutting` everywhere (5 occurrences plus the TOML name `_bounded_context_core.toml` → `_bounded_context_cross_cutting.toml`).
- Update the closing prose "Core category" → "Cross-cutting category".
- Update Alternatives Rejected: rename "Three categories without `Core`" to "Three categories without `Cross-cutting`".

### Q5 — `_register_listings` dual-classification

**Answer**: Keep as documented dual-class. The draft and the open-questions note both pick this, with the disjointness lock explicitly allowing this single dual case. **No change needed.**

### Q6 — `_admin_telemetry` and `_vendor_governance` many-to-one

**Answer**: Document explicitly. Both packages appear as the right-half of multiple workflow pairs. Add a sentence to `### Decision` ¶2 of the amendment: "Workflow-pair right-halves carry their primary category (write-side or adapter) and can appear as the right-half of multiple pairs." This avoids the disjointness-lock contradiction surfaced in finding **A7a.4**.

---

## Recommended ADR draft edits before publication

### ADR-011 edits

- Add ADR-001 citation in `## Decision` ¶3: "the `require_permission(action, resource)` FastAPI dependency factory defined in `ADR-001`'s public Capabilities Module Interface".
- Add ADR-003 citation in `## Decision` ¶3 closing: "Replacement raises route through `AuthorizationError`/`AuthenticationError` per ADR-003 and the projection registry at `backend/app/core/exceptions.py`."
- Add ADR-004 citation in `## Invariant Tests`: "JWT `exp`/`iat` claims construct from `utc_now()` per ADR-004; bare `datetime.utcnow()` remains banned in `core/security.py`."
- Add ADR-006 citation in `## Migration Impact`: "Auth-idiom migration is gated on ADR-006 snapshot rebaseline of affected route fixtures."
- Bind a lock test to `## SSO Token-Exchange Boundary` to match ADR-002's named-subsection precedent.

### ADR-012 edits

- Drop the top-level `## Cross-References` section header. Move the four bullets into `## Invariant Tests` as cross-reference bullets (per ADR-008:33 voice) or inline in `## Decision` (per ADR-005:19 voice).
- Replace "ADR-008 — sets the SSOT pattern for risk thresholds; ADR-012 reuses the same pattern" with "ADR-012 applies the SSOT discipline of ADR-008 to a different anchor (`_kri_history.constants`); see `## Alternatives Rejected` for the rationale on inverting the dependency direction."
- Add ADR-002 citation in `## Decision` ¶4: "per ADR-002, the recorder is the transaction-owning service entrypoint."
- Clarify the ADR-009 alias-deprecation citation: either narrow to "if `_reserved_modules.toml` is extended to cover module-level deprecation aliases" or remove the contingent reference and note that no temporary alias is planned.

### ADR-007 amendment edits

- Rename `Core` → `Cross-cutting` (text and TOML filename `_bounded_context_core.toml` → `_bounded_context_cross_cutting.toml`).
- Document many-to-one workflow-pair semantics explicitly: "Workflow-pair right-halves carry their primary category and may appear as the right-half of multiple pairs."
- Move `_orphaned_items` from Read-shape to Workflow-paired (with `_admin_telemetry`), updating the appendix table row.
- Recompute the closing count summary; clarify that the 10/12 figure is "10 workflow-pair left-halves enumerated"; do not double-count right-halves.
- Add a sentence in `### Decision` clarifying the workflow-pair sweep direction (left → right is mandatory; right → left is not).

---

## Per-ADR coherence verdict (compact)

| ADR | Voice/structure | Contradictions | Cross-refs | Verdict |
|---|---|---|---|---|
| ADR-011 | PASS | NONE blocking; A11.1/A11.2/A11.4 missing-citation gaps | ADR-001/ADR-003/ADR-004/ADR-006 missing | **Conditional PASS — needs cross-reference bullets and one ADR-002-style lock binding for SSO subsection.** |
| ADR-012 | FAIL-MINOR (`## Cross-References` header is novel) | A12.2 (pattern-claim wording); A12.4 (ADR-009 scope confusion) | ADR-002 missing | **Conditional PASS — needs section-header rework and three citation tightenings.** |
| ADR-007 amendment | PASS | A7a.4 (`_admin_telemetry` dual-membership); A7a.5 (count math) | None missing — citations to ADR-001/002/003/008 are present | **Conditional PASS — needs Core→Cross-cutting rename, dual-membership clarification, and `_orphaned_items` reclassification.** |

All three drafts are publishable after the constructive edits in `## Recommended ADR draft edits before publication`. None has a blocking contradiction with `ADR-001..010`.
