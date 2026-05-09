# Phase 4 Loop 2 — Adversarial ADR Coherence Review

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Subject: ADR drafts in `.planning/audits/_context/plan-loop-3-06-adr-drafts.md` (ADR-011, ADR-012, ADR-007 amendment) compared against `docs/adr/ADR-001..010` in full, with all of Loop 1's "conditional PASS" verdicts treated as adversarial targets.

Mode: ADVERSARIAL. Loop 1 said all three drafts are publishable after edits. Each verdict is challenged below. Quotes ≤15 words; cited by `file:line`.

---

## Adversarial probes against Loop 1's "no blocking contradiction" claim

### Probe 1: ADR-001 (capabilities) vs ADR-011 idiom claim

**Loop 1 claim**: ADR-011's `require_permission(action, resource)` is "the FastAPI dependency factory defined under ADR-001" (`plan-loop-3-06-adr-drafts.md:39`).

**Adversarial reading**:
- ADR-001 §Decision (`docs/adr/ADR-001-capabilities-module-unification.md:13`): `Capabilities.can(action, resource, *, instance=None)` is the "public Capabilities Module Interface."
- ADR-001 also says: "endpoints may keep FastAPI dependency helpers as adapters" (`ADR-001:13`) — i.e. dependency adapters are tolerated, not the SSOT.
- The `require_permission` factory is defined at `backend/app/core/security.py:170` (verified: `def require_permission(resource: str, action: str)`), NOT inside `_authorization_capabilities`. It calls `check_permission`, which delegates to `has_permission` at `backend/app/core/security.py:139-145`, which does NOT route through `Capabilities.can`.
- `Capabilities.can` at `backend/app/services/_authorization_capabilities/perimeter.py:20-24` itself calls `check_permission(self.user, resource, action)`. So both idioms converge on the same `check_permission` underneath, but at different abstraction layers.
- **Argument signature mismatch**: `Capabilities.can(action, resource, *, instance=None)` takes `(action, resource)`. `require_permission(resource, action)` takes `(resource, action)` — REVERSED order. This is not just two names for the same thing; the calling conventions differ.

**Severity**: BLOCKING ambiguity if ADR-011 is read literally as "ADR-001 defines `require_permission`." It does not. ADR-001 defines `Capabilities.can`; ADR-011 elects `require_permission` as the canonical FASTAPI dependency adapter that satisfies ADR-001's "endpoints may keep FastAPI dependency helpers as adapters" clause. Loop 1's wording in the draft (`plan-loop-3-06-adr-drafts.md:47`: "the `require_permission(action, resource)` FastAPI dependency factory defined under ADR-001") is wrong on TWO counts: (a) ADR-001 does not define it, ADR-001 names `Capabilities.can` instead; (b) the argument order is mistyped (`(action, resource)` vs the actual signature `(resource, action)`).

**Resolution**: Edit ADR-011 §Decision ¶3 to:
> "Endpoints adopt `require_permission(resource, action)` from `backend/app/core/security.py:170` as the canonical FastAPI dependency adapter satisfying ADR-001's 'endpoints may keep FastAPI dependency helpers as adapters' clause (`ADR-001:13`). Service-layer authorization continues to flow through `Capabilities.can(action, resource, *, instance=None)` per ADR-001 §Decision."

This fixes both errors and makes the relationship explicit.

### Probe 2: ADR-002 (service-owned transactions) vs ADR-011 allowlist semantics

**Loop 1 claim**: ADR-011 "defers to ADR-002's existing _endpoint_commit_allowlist + 2026-09-01 sunset" (`review-loop-1-07-adr-coherence.md:30`); "lock cap drops to 0 after the sunset date" reinforces ADR-002.

**Adversarial reading**:
- ADR-002 §Decision (`ADR-002:13-15`): "Endpoint commit calls remain only in a temporary allowlist during migration." Allowlist size is not pinned at 8; the lock at `_endpoint_commit_allowlist.toml` enforces `expires_at` per entry and ratchets toward zero.
- ADR-011 draft (`plan-loop-3-06-adr-drafts.md:51`): "the lock cap drops to 0 after the sunset date." This is a NEW invariant. It pins post-sunset behavior, which ADR-002 does not explicitly state.
- ADR-002 §Hard Expiration (`ADR-002:38-40`): says the lock "will fail after that date until each entry is re-justified or the underlying commit is migrated" — this is a soft "must be addressed" statement, NOT a "drops to 0" statement.

**Severity**: MINOR. ADR-011 strengthens ADR-002 (post-sunset cap = 0) without contradicting it. But Loop 1's read that ADR-011 "reinforces ADR-002" understates the gap. ADR-011 is the ADR that would carry the post-sunset zero-cap rule; ADR-002 today does not carry it. This is acceptable per ADR voice (ADR-002 §Hard Expiration was the seed; ADR-011 finishes the rule), but should be stated explicitly.

**Resolution**: Add a sentence to ADR-011 §Hard Expiration (`plan-loop-3-06-adr-drafts.md:78`):
> "ADR-011 strengthens ADR-002's hard-expiration policy by pinning the post-`2026-09-01` cap at 0 entries; pre-sunset, ADR-002's per-entry expiration governs."

### Probe 3: ADR-005 (ArchivableMixin) vs amendment KRI dual-classification

**Loop 1 claim**: "the four archivable models (Risk, Control, Vendor, KRI per ADR-005:39) live in write-side contexts (`_vendor_governance`, `_entity_mutation_lifecycle`, `_kri_history`); the amendment does not move them" (`review-loop-1-07-adr-coherence.md:96`).

**Adversarial reading**:
- ADR-005 §Invariant Tests (`ADR-005:39`): "Migration tests verify backfill for Risk, Control, Vendor, and KRI semantics."
- The amendment classifies `_kri_history` as Write-side (`plan-loop-3-06-adr-drafts.md:253`), preserving ADR-005 alignment.
- BUT: the amendment ALSO pairs `_kri_history` (write-side) with `_deadline_execution` (workflow) in the workflow-pair list (`plan-loop-3-06-adr-drafts.md:267`). This is many-to-one (the right-half is `_kri_history`, which is also in `_bounded_context_write_side.toml`). Loop 1 acknowledged this for `_vendor_governance` but did NOT call it out for `_kri_history`.
- Loop 1's count ("12 workflow-paired" — `plan-loop-3-06-adr-drafts.md:281`) double-counts right-halves that are also write-side or adapter.

**Severity**: MINOR. No contradiction with ADR-005 specifically. The dual-membership lock semantics (Probe 7 below) covers this, but the count breakdown is inconsistent.

**Resolution**: See Probe 7's disjointness lock semantics fix.

### Probe 4: ADR-006 (snapshot equivalence) vs ADR-012 equivalence test

**Loop 1 claim**: "ADR-012 explicitly cites 'A snapshot rebaseline for the affected listing/dashboard surfaces is taken under ADR-006'" (`review-loop-1-07-adr-coherence.md:61`).

**Adversarial reading**:
- ADR-006 §Decision (`ADR-006:13`): "Use snapshot tests over equivalence classes before behavior-preserving refactors. Snapshots must redact unstable fields."
- ADR-012 §Invariant Tests (`plan-loop-3-06-adr-drafts.md:148`): "Behavioural equivalence test `tests/backend/pytest/test_kri_deadline_classify_red.py` pins (period_end, due, reporting_owner_id, is_breached) outputs..."
- ADR-012's "behavioural equivalence test" is NOT the same construct as ADR-006's "snapshot test over equivalence classes." Loop 1 conflates the two. ADR-006 covers redacted snapshot fixtures; ADR-012 introduces a parametric output equality test. Different test shapes.
- The redactions clause (`ADR-006:13`: "Snapshots must redact unstable fields") does not cover the new parametric test in ADR-012.

**Severity**: MINOR (terminology clash). No contradiction, but ADR-012 misuses ADR-006's vocabulary. The "behavioural equivalence test" should be named "parametric output-equality test" to distinguish from ADR-006 snapshot fixtures.

**Resolution**: ADR-012 §Migration Impact (`plan-loop-3-06-adr-drafts.md:136`) already correctly references ADR-006: "A snapshot rebaseline for the affected listing/dashboard surfaces is taken under ADR-006." This is the right citation. The §Invariant Tests bullet (`:148`) is the standalone "parametric output-equality test" — distinct from the snapshot mechanism. Recommend renaming "Behavioural equivalence test" → "Parametric output-equality test" to disambiguate.

### Probe 5: ADR-007 (bounded contexts) — AMEND vs REPLACE

**Loop 1 claim**: amendment "does not reclassify the seven; it ADDS categories" (`review-loop-1-07-adr-coherence.md:93`).

**Adversarial reading**:
- ADR-007 §Decision (`ADR-007:13`): "Architecture sweeps use seven bounded contexts: `_riskhub_config`, `_identity_access_lifecycle`, `_vendor_governance`, `_register_listings`, `_approval_execution`, `_entity_mutation_lifecycle`, and `_kri_history`."
- Amendment §Decision ¶0 (`plan-loop-3-06-adr-drafts.md:192`): "The seven-context list at ADR-007 §Decision remains the canonical write-side enumeration."
- Verified: the seven-context list is preserved in `_bounded_context_write_side.toml` (`plan-loop-3-06-adr-drafts.md:230`).
- BUT the amendment dual-classifies `_register_listings` (`plan-loop-3-06-adr-drafts.md:194,250`). ADR-007's list says `_register_listings` is the 4th context; the amendment now also writes it into `_bounded_context_read_shape.toml`. This is an AMENDMENT to ADR-007's atomicity model: a single context now CAN be in two allowlists.
- Amendment §Invariant Tests (`plan-loop-3-06-adr-drafts.md:229`): "EXACTLY ONE of the five allowlists, with the documented exception of `_register_listings`."

**Severity**: MINOR — Loop 1 correctly identifies dual-class, but understates that this IS a soft amendment to ADR-007's per-context atomicity. ADR-007 §Invariant Tests `:33` says "File-disjointness check before starting the next context"; the amendment's disjointness extension breaks the simple pairing-by-name model that ADR-007 assumed.

**Resolution**: Amendment §Decision should add a sentence:
> "ADR-007's per-context atomicity tests (`ADR-007:32`) continue to apply per allowlist: a context appearing in two allowlists must satisfy atomicity for each role independently."

### Probe 6: ADR-008 (risk thresholds SSOT) vs ADR-012 grace-days SSOT

**Loop 1 claim**: "different domain (risk vs KRI), so OK. But the pattern Loop 1 flagged ('reuses the same pattern') needs precise wording" (task brief).

**Adversarial reading** (this is where Loop 1 was self-aware but understated):
- ADR-008 §Decision (`ADR-008:13`): "Backend code uses `get_config_int` with `ConfigDefaults`."
- ADR-012 draft (`plan-loop-3-06-adr-drafts.md:155`): "ADR-008 — sets the SSOT pattern for risk thresholds; ADR-012 reuses the same pattern."
- Direct contradiction with code: the existing SSOT for risk thresholds is `ConfigDefaults` (e.g. `backend/app/services/_config/lookup.py:21 CRITICAL_RISK_MIN_NET_SCORE = 16`). For grace days, ADR-012 makes `_kri_history.constants.REPORTING_GRACE_DAYS` the SSOT and DELETES `ConfigDefaults.REPORTING_GRACE_DAYS = 15` (verified at `backend/app/services/_config/lookup.py:26`).
- Verified usage today: `backend/app/services/kri_history_service.py:8` and `_kri_history/periods.py:9` already import from `_kri_history.constants`. `kri_deadline_service.py:52` and `kri_deadline_support.py:36` import from `ConfigDefaults`. The "duplicate" is real.
- ADR-008's pattern: package consumes `ConfigDefaults` via `get_config_int`. ADR-012's pattern: package OWNS its own constant; `_config/lookup.py` does NOT carry the duplicate.

**Severity**: MINOR but real. ADR-012's "reuses the same pattern" claim is misleading. ADR-008 makes `_config` the SSOT layer; ADR-012 inverts the dependency (the bounded context owns the constant). Loop 1's recommendation to soften the wording (review-loop-1-07 finding A12.2) is correct but does not go far enough.

**Resolution** (proposed exact rewording):
ADR-012 Cross-References ADR-008 bullet (`plan-loop-3-06-adr-drafts.md:155`) becomes:
> "ADR-008 — uses `ConfigDefaults` as the cross-cutting SSOT for risk thresholds. ADR-012 applies the SSOT discipline to a bounded-context-local anchor (`_kri_history.constants`); the two anchors coexist deliberately because risk thresholds are CRO-managed runtime config, while the grace-days constant is package-internal period algebra."

This makes the rationale explicit (CRO-managed config vs package-internal) and avoids the "same pattern" overclaim.

### Probe 7: ADR-007 (per-context atomicity) — disjointness lock dual-membership

**Loop 1 claim**: amendment "explicitly handles `_register_listings` as the documented dual-class case" (`review-loop-1-07-adr-coherence.md:98`).

**Adversarial reading**:
- The amendment dual-classifies `_register_listings` (write-side AND read-shape). The disjointness lock allows this single exception (`plan-loop-3-06-adr-drafts.md:229`).
- But the amendment ALSO has many-to-one workflow-pair right-halves: `_vendor_governance` is the right-half of THREE pairs (`_vendor_links`, `_risk_questionnaires`, `_vendor_workflow`); `_kri_history` is the right-half of one pair (`_deadline_execution`); `_entity_mutation_lifecycle` is the right-half of one pair (`_control_execution`); `_identity_access_lifecycle` is the right-half of one pair (`_access_workflow`); `_admin_telemetry` is the right-half of one pair (`_notification_inbox`); `_auth_session` is the right-half of one pair (`_auth_session_workflow`).
- Each of these right-halves is ALSO classified as write-side OR adapter. So they appear in TWO allowlists: `_bounded_context_write_side.toml` (or `_bounded_context_adapters.toml`) AND `_bounded_context_workflow_pairs.toml`. Loop 1 spotted this for `_admin_telemetry` (finding A7a.4) but did NOT generalize.
- The amendment text "EXACTLY ONE of the five allowlists, with the documented exception of `_register_listings`" is therefore EMPIRICALLY FALSE: 6+ packages would appear in two allowlists.

**Severity**: BLOCKING — the disjointness lock as worded would either (a) reject every right-half because they appear in two allowlists, or (b) silently accept, which means the lock's "EXACTLY ONE" claim is a lie. Loop 1's "PASS" verdict on the disjointness lock is wrong.

**Resolution** (exact disjointness-lock semantics):
Replace the disjointness lock spec in amendment §Invariant Tests (`plan-loop-3-06-adr-drafts.md:229`) with:
> "Every underscore-prefixed package appears in EXACTLY ONE of `{_bounded_context_write_side.toml, _bounded_context_read_shape.toml, _bounded_context_adapters.toml, _bounded_context_cross_cutting.toml}`. `_bounded_context_workflow_pairs.toml` enumerates ordered (left, right) pairs where left is the workflow-side package; right is the primary-category package (write-side or adapter). A package may appear in `_bounded_context_workflow_pairs.toml` as a right-half regardless of its primary-category membership; the lock asserts the right-half is also present in its primary-category allowlist. `_register_listings` is the single permitted dual-class case in the four primary allowlists, present in both `_bounded_context_write_side.toml` AND `_bounded_context_read_shape.toml`."

This (a) fixes the "EXACTLY ONE" overclaim, (b) makes workflow-pair membership orthogonal to primary classification, and (c) preserves the `_register_listings` dual-class as the only PRIMARY-allowlist exception.

### Probe 8: ADR-009 (reserved surfaces) vs amendment 5 new TOMLs

**Loop 1 claim**: 4-5 new TOMLs are NOT covered by `_reserved_modules.toml` namespace; they are a separate convention. Loop 1 also cleared ADR-009 alias-deprecation citation as conditional only.

**Adversarial reading**:
- ADR-009 §Decision (`ADR-009:13`): "Reserved surfaces must be declared in `_reserved_modules.toml`, documented in `docs/BUSINESS_LOGIC.md`, and annotated at the code declaration site."
- ADR-009 governs reserved enum/role/permission surfaces. The 5 new TOMLs in the amendment govern bounded-context membership. These are different categories of registry. ADR-009 does NOT need to extend.
- Loop 1's A12.4 finding correctly flagged that ADR-012's reference to "alias entry in `_reserved_modules.toml`" conflates scopes. ADR-009 covers DECLARATION reserved surfaces, NOT module-level deprecation aliases.

**Severity**: NONE for the amendment's new TOMLs. MINOR for ADR-012's confused ADR-009 reference (already flagged by Loop 1).

**Resolution**: Loop 1's edit to ADR-012 §Decision/§Invariant Tests removing or narrowing the `_reserved_modules.toml` alias-deprecation reference is correct. Apply it.

### Probe 9: ADR-010 (forward-only migrations) vs ADR-011/ADR-012

**Loop 1 claim**: "ADR-011/012 don't touch migrations" (task brief). Loop 1 marks ADR-010 as not applicable.

**Adversarial reading**:
- ADR-012 deletes `ConfigDefaults.REPORTING_GRACE_DAYS = 15` from `backend/app/services/_config/lookup.py:26`. This is a constant deletion, NOT a column or schema change.
- No DB migration is implied. ADR-010 does NOT apply.
- ADR-011 references `_endpoint_commit_allowlist.toml` but does not alter migrations.

**Severity**: NONE. Loop 1 correct.

---

## Probes against Loop 1's "missing cross-ref" verdict

Loop 1 named four missing cross-refs for ADR-011 (ADR-001, ADR-003, ADR-004, ADR-006). Adversarial check:

### Cross-ref 1: ADR-001 in ADR-011 — TRULY MISSING (Loop 1 right)

ADR-011 prose names "the `require_permission(action, resource)` FastAPI dependency factory defined under ADR-001" — but the wording is wrong (Probe 1) AND the ADR token doesn't appear in any §Invariant Tests bullet. Citation density is below ADR-007 amendment's standard. CONFIRM: add ADR-001 citation in §Decision and bind to `test_w12_auth_idiom_ratchet_red.py`.

### Cross-ref 2: ADR-003 in ADR-011 — TRULY MISSING (Loop 1 right)

ADR-011 forbids inline `403` raises but doesn't say which DomainError replaces them. ADR-003 §Decision (`ADR-003:13`) names `AuthorizationError` and `AuthenticationError`. The path forward is via `EXCEPTION_REGISTRY` at `backend/app/core/exceptions.py:66-69`. CONFIRM: add ADR-003 citation in §Decision per Loop 1 finding A11.1.

### Cross-ref 3: ADR-004 in ADR-011 — TRULY MISSING (Loop 1 right)

ADR-011 governs JWT lifetime construction. The `exp`/`iat` claim construction is at `backend/app/core/security.py:68` (uses `utc_now()`). ADR-004's `datetime.utcnow()` ban applies. CONFIRM: add ADR-004 citation; this is not optional.

### Cross-ref 4: ADR-006 in ADR-011 — DEBATABLE

Loop 1 claims ADR-011 should cite ADR-006 because "the migration of body-call `_require_*` ... should ride on ADR-006 snapshot equivalence" (`review-loop-1-07-adr-coherence.md:133`).

**Adversarial reading**: ADR-011 bans NEW body-call `_require_*` and inline-`403` raises. Existing call sites are not migrated by ADR-011 itself; they're frozen in place. ADR-011 §Migration Impact says "Existing body-call `_require_*` and inline-`403` call sites remain during migration; new sites are forbidden by lock" (`plan-loop-3-06-adr-drafts.md:62`). So no behavior-preserving refactor is gated by ADR-011 — ADR-006 does not strictly apply.

**Severity**: NOT MISSING. Loop 1's recommendation to add ADR-006 citation is over-eager. ADR-011 is a freeze, not a sweep. ADR-006 applies to the future migrations enabled by ADR-011, not to ADR-011 itself.

**Resolution**: REJECT Loop 1's recommendation #C-1 to add ADR-006 to ADR-011. Keep ADR-011 §Migration Impact as written.

---

## Probes against Loop 1's open-question resolutions

### Q1 — Status convention

Loop 1: `Accepted` is correct. **Confirm** — every existing ADR uses `Accepted` (verified `ADR-001:5`, `ADR-007:3`).

### Q2 — `_orphaned_items` Read-shape vs Workflow-paired

**Loop 1 A8 (Phase 3 cohesion)**: Read-shape (per package docstring at `backend/app/services/_orphaned_items/__init__.py:1` "Internal implementation for orphaned item management").
**Loop 1 A7 (Phase 4 review)**: Workflow-paired with `_admin_telemetry`.

**Adversarial code reading** (the empirical decider):
- `_orphaned_items/` contains: `core.py`, `flagging.py`, `governance.py`, `logging.py`, `reads.py`, `resolution.py`, `resolution_plan.py`, `service.py`, `stats.py`, `workflow.py` (verified by `ls`).
- `service.py:20-81` exposes `OrphanedItemService` with `flag_orphaned_items` (writes), `scan_uncategorised_items` (writes; verified at `flagging.py:226 await db.commit()`), `resolve_orphan` (writes; verified at `resolution.py:260 await db.commit()`).
- `flagging.py:226` and `resolution.py:260` BOTH call `await db.commit()` — these are service-owned-transaction sites under ADR-002. This is a write-side package, not a read-shape projection.
- The package has TWO commit calls in workflow.py-style files (`flagging.py`, `resolution.py`).
- `reads.py` exists but is supplementary; `workflow.py` and `resolution.py` define behavior; `governance.py` defines policy.

**Decision**: **WORKFLOW-PAIRED**. Pair: `_orphaned_items ↔ _admin_telemetry` is plausible because both expose admin-side observers, but the better pair is `_orphaned_items ↔ _identity_access_lifecycle` because the orphan-creation trigger is user deactivation (`flagging.py:17-59`: "Called when a user is being deactivated"). User deactivation lives in `_identity_access_lifecycle`. Orphan resolution writes to `Risk`, `Control`, `KeyRiskIndicator` rows — those are `_entity_mutation_lifecycle` writes.

**Refined decision**: pair `_orphaned_items` with `_identity_access_lifecycle` (the trigger boundary), not with `_admin_telemetry`. Rationale: ADR-002 service-owned-transactions atomicity is the defining property; the deactivation→orphan-flag commit must be atomic with `_identity_access_lifecycle` user updates. `_admin_telemetry` reads orphan counts for the admin console but does not commit them. Loop 1 A7's recommendation (`_admin_telemetry` pair) is wrong; the empirical pair is `_identity_access_lifecycle`.

**Caveat**: this REJECTS Loop 1 A7's specific pair selection but agrees on the Workflow-paired classification.

### Q3 — `_notification_inbox` classification

**Loop 1 A8 + A7**: Both Workflow-paired (with `_admin_telemetry`).

**Adversarial code reading**:
- `_notification_inbox/__init__.py` (verified): `from app.services._notification_inbox import lifecycle`.
- `_notification_inbox/lifecycle.py` (verified): defines `list_notification_inbox` (read), `count_notification_inbox_unread` (read), `read_notification_preferences` (read), `update_notification_preferences` (writes — `lifecycle.py:105 await db.commit()`), `mark_notification_read` (writes — `lifecycle.py:126 await db.commit()`), `mark_all_notifications_read` (writes — `lifecycle.py:137 await db.commit()`).
- THREE commit sites. This is a write-bearing service module, not a read projection.
- Pairs with `_admin_telemetry`? Plausible only if `_admin_telemetry` is a workflow companion. But `_admin_telemetry` is in the Adapter list (`plan-loop-3-06-adr-drafts.md:208`, `:275`). Conflict per Loop 1 A7a.4.

**Decision**: **WORKFLOW-PAIRED**, but the pair partner is NOT `_admin_telemetry`. The notification dispatch comes from `_approval_execution`, `_issue_workflow`, `_kri_history`, etc., via outbox. The inbox is the read-side companion to those many writers, but the inbox itself owns notification-mark-read writes.

**Refined decision**: classify `_notification_inbox` as **Workflow-paired** but note that it has multiple upstream writers. The "right-half" of the pair is the OUTBOX SUBSYSTEM (`backend/app/services/outbox/`), not `_admin_telemetry`. Outbox dispatcher (per ADR-002 §Outbox Dispatcher Consolidation) owns the write transactions; the inbox owns the per-user read+mark-read state.

If a single right-half must be picked: pair with `_identity_access_lifecycle` (the user owning the notifications) or accept that `_notification_inbox` is its own micro-context. Loop 1's `_notification_inbox ↔ _admin_telemetry` pair is wrong because `_admin_telemetry` is read-only system-health/scheduler-status (verified by `_admin_telemetry/lifecycle.py:52,75 build_system_health_snapshot`, etc.).

**Recommendation**: Drop the `_notification_inbox ↔ _admin_telemetry` pair from the workflow-pair list. Reclassify `_notification_inbox` as a SECONDARY write-side context (own primary category) OR as Workflow-paired with the outbox subsystem. Either is defensible; Loop 1's choice is empirically wrong.

### Q4 — 5th category name (Core vs Cross-cutting)

**Loop 1 A8 + A7 (both)**: Cross-cutting.

**Adversarial test of the collision argument**: 
- `backend/app/core/` exists (verified: `backend/app/core/security.py`, `backend/app/core/exceptions.py`, `backend/app/core/datetime_utils.py`).
- The TOML name `_bounded_context_core.toml` references `backend/app/services/` packages, NOT `backend/app/core/` modules. The category name is applied to service packages.
- "Core" as a TOML category name COULD be ambiguous to a reader who sees `backend/app/core/` and thinks it's the same scope. But the TOML is in `tests/backend/pytest/architecture/` and references service packages explicitly. The collision risk is conceptual, not technical.
- "Cross-cutting" is unambiguous and matches the prose phrase used elsewhere in CLAUDE.md (e.g. "cross-cutting" appears in CLAUDE.md's Authorization Capability Contract section).

**Decision**: **Cross-cutting**. Loop 1 right. Apply rename across amendment text and TOML filename.

### Q5 — `_register_listings` dual-classification

Loop 1: keep as documented dual-class. **Confirm** — but enforce via Probe 7 disjointness lock semantics.

### Q6 — `_admin_telemetry` and `_vendor_governance` many-to-one

Loop 1: document explicitly as "workflow-pair right-halves carry their primary category." **Confirm and extend** — this rule applies to all 6+ right-halves identified in Probe 7, not just `_admin_telemetry` and `_vendor_governance`.

---

## Loop 1 verdict adjudication

Per the task brief, "Loop 1 found 'conditional PASS' for all 3 ADRs. That's likely too generous."

| Loop 1 verdict | Adversarial verdict |
|---|---|
| ADR-011 conditional PASS, 4 missing cross-refs | **HOLDS with modification**: ADR-001 citation needs FIX (Probe 1: signature wrong), ADR-003/ADR-004 citations CONFIRMED missing, ADR-006 citation REJECTED as unnecessary. Net: 3 missing cross-refs, plus a citation accuracy fix. |
| ADR-012 conditional PASS, `## Cross-References` header novel | **STRENGTHEN**: Loop 1's A12.2 (pattern-claim wording) understates the issue. Probe 6 makes the exact rewording sharper. Section-header rework still required. |
| ADR-007 amendment conditional PASS, dual-membership ambiguity | **DOWNGRADE to NEEDS REWORK**: Probe 7 shows the disjointness lock semantics are BLOCKING ambiguous. Loop 1 understated the many-to-one workflow-pair right-half problem. The "EXACTLY ONE" lock claim is empirically false. Rework before publication. |

**Net adversarial verdict**: ADR-011 is closer to PASS than Loop 1 suggested (one cross-ref REJECTED). ADR-012 is at "needs rework" (Probe 6 wording change is mandatory, not optional). ADR-007 amendment is at "needs rework" (Probe 7 lock semantics are blocking).

---

## Probes that found BLOCKING contradictions

1. **Probe 1 — ADR-011 §Decision ¶3 mistypes the relationship to ADR-001**: claims `require_permission(action, resource)` is "defined under ADR-001" with reversed argument order. ADR-001 defines `Capabilities.can`, not `require_permission`; the actual signature is `require_permission(resource, action)` per `backend/app/core/security.py:170`. Two errors in one sentence.

2. **Probe 7 — Amendment disjointness lock "EXACTLY ONE" is empirically false**: at least 6 packages (`_vendor_governance`, `_kri_history`, `_entity_mutation_lifecycle`, `_identity_access_lifecycle`, `_admin_telemetry`, `_auth_session`) appear as workflow-pair right-halves AND in their primary allowlist. The lock as currently worded would either reject all of them or be a lie.

## Probes that found MINOR issues

1. **Probe 2 — ADR-011 strengthens ADR-002 but doesn't say so**: post-sunset cap=0 is a NEW invariant.
2. **Probe 4 — ADR-012 §Invariant Tests "Behavioural equivalence test" misuses ADR-006 vocabulary**: should be "parametric output-equality test."
3. **Probe 5 — Amendment soft-amends ADR-007's per-context atomicity model**: dual-class breaks simple pairing-by-name; should add explicit atomicity-per-allowlist sentence.
4. **Probe 6 — ADR-012 "reuses the same pattern as ADR-008" is misleading**: ADR-008 makes `_config` the SSOT layer; ADR-012 inverts to bounded-context-local. Refined wording proposed.
5. **Probe 8 — ADR-012's `_reserved_modules.toml` alias-deprecation reference conflates scopes**: Loop 1 already flagged.

## Probes that found NO contradiction

- Probe 3 (ADR-005), Probe 9 (ADR-010): No contradiction.
- Cross-ref 4 (ADR-006 in ADR-011): Loop 1 over-eager; reject the recommendation.

---

## Open question resolutions (final, with rationale)

### Q1 — ADR status convention

**Final answer**: `Accepted`. Empirical evidence: all 10 existing ADRs use `## Status\n\nAccepted` at lines 3-5 (verified). No `Proposed` precedent exists in the repo. Drafts already match.

### Q2 — `_orphaned_items` classification

**Final answer**: **Workflow-paired**, paired with `_identity_access_lifecycle` (NOT `_admin_telemetry`).

Rationale: empirical commit pattern.
- `_orphaned_items/flagging.py:226 await db.commit()` writes `OrphanedItem` rows during user deactivation; the deactivation flow lives in `_identity_access_lifecycle`. Atomic with the user-update transaction.
- `_orphaned_items/resolution.py:260 await db.commit()` writes resolution to `Risk`, `Control`, `KeyRiskIndicator` rows — but these are mutation flows, so `_orphaned_items` resolution itself is atomic with `_entity_mutation_lifecycle` writes.
- The dominant pair is the deactivation→orphan-flag flow with `_identity_access_lifecycle`. Loop 1 A7's choice of `_admin_telemetry` is wrong: `_admin_telemetry` is read-only telemetry; the empirical pair partner is the trigger boundary.
- **Override Loop 1 A8 + A7**: NOT Read-shape (presence of `flagging.py`, `resolution.py`, `workflow.py` with commits disqualifies); NOT paired with `_admin_telemetry` (telemetry is read-only).

Migration: amendment Workflow-pair list bullet `_notification_inbox ↔ _admin_telemetry` removes; replace with `_orphaned_items ↔ _identity_access_lifecycle`.

### Q3 — `_notification_inbox` classification

**Final answer**: **Workflow-paired**, but NOT with `_admin_telemetry`. Pair selection is debatable; my recommendation is to either pair with `_identity_access_lifecycle` (notifications belong to a user) or treat as a standalone secondary write-side context.

Rationale: empirical commit pattern.
- `_notification_inbox/lifecycle.py:105,126,137` has THREE `await db.commit()` calls. These are write commits.
- The pairing with `_admin_telemetry` (Loop 1 A8 + A7) is empirically wrong: `_admin_telemetry/lifecycle.py:52` defines `build_system_health_snapshot` (system metrics; reads only). No notification-related coupling.
- Best pair: `_notification_inbox ↔ _identity_access_lifecycle` (the user is the actor; preferences and read-state are user-scoped).

Caveat: if Q2's answer pairs `_orphaned_items` with `_identity_access_lifecycle`, then `_identity_access_lifecycle` is the right-half of two pairs. That is fine under Probe 7's disjointness lock semantics (right-halves can appear in multiple pairs).

### Q4 — 5th category name

**Final answer**: **Cross-cutting**. Loop 1 correct. Rename `_bounded_context_core.toml` → `_bounded_context_cross_cutting.toml`.

### Q5 — `_register_listings` dual-classification

**Final answer**: KEEP as documented dual-class in primary allowlists (write-side AND read-shape). This is the single permitted exception under the Probe 7 disjointness lock semantics.

### Q6 — Many-to-one workflow-pair right-halves

**Final answer**: Document via Probe 7 lock semantics. Six+ packages are right-halves of multiple pairs OR appear in primary-category allowlists in addition to workflow-pair right-half membership. The lock must allow this orthogonally.

---

## Recommended ADR text edits before publication

### ADR-011

1. **§Decision ¶3 — fix ADR-001 reference and signature**:
   Replace: "the `require_permission(action, resource)` FastAPI dependency factory defined under ADR-001"
   With: "endpoints adopt `require_permission(resource, action)` from `backend/app/core/security.py:170` as the canonical FastAPI dependency adapter satisfying ADR-001's clause 'endpoints may keep FastAPI dependency helpers as adapters' (`ADR-001:13`). Service-layer authorization continues to flow through `Capabilities.can(action, resource, *, instance=None)` per ADR-001 §Decision."

2. **§Decision ¶3 — add ADR-003 cross-ref**: append "Replacement raises route through `AuthorizationError`/`AuthenticationError` per ADR-003 (`backend/app/core/exceptions.py:35,39`) and the projection registry at `backend/app/core/exceptions.py:66-69`."

3. **§Invariant Tests — add ADR-004 cross-ref**: append bullet "JWT `exp`/`iat` claims construct from `utc_now()` per ADR-004 (`backend/app/core/security.py:68`); bare `datetime.utcnow()` remains banned."

4. **§Hard Expiration on Auth-Flow Exemption — add post-sunset rule cross-ref to ADR-002**: append "ADR-011 strengthens ADR-002's hard-expiration policy by pinning the post-`2026-09-01` cap at 0 entries; pre-sunset, ADR-002's per-entry expiration governs."

5. **§SSO Token-Exchange Boundary — bind to a lock test**: name the invariant test that asserts "RiskHub session owns lifetime from the exchange point forward." (Loop 1 finding A11.3.)

### ADR-012

1. **Drop top-level `## Cross-References` header**: move bullets into `## Invariant Tests` per ADR-008:33 voice. (Loop 1 A12.1.)

2. **Cross-ref ADR-008 — replace "reuses the same pattern"** with: "ADR-008 — uses `ConfigDefaults` as the cross-cutting SSOT for risk thresholds. ADR-012 applies SSOT discipline to a bounded-context-local anchor (`_kri_history.constants`); the two anchors coexist deliberately because risk thresholds are CRO-managed runtime config while the grace-days constant is package-internal period algebra." (Probe 6.)

3. **Add ADR-002 cross-ref in §Decision ¶4**: "per ADR-002, the recorder is the transaction-owning service entrypoint." (Loop 1 A12.3.)

4. **§Invariant Tests bullet — rename "Behavioural equivalence test"** to "Parametric output-equality test" to disambiguate from ADR-006 snapshot fixtures. (Probe 4.)

5. **Narrow ADR-009 alias-deprecation reference**: Loop 1 A12.4. Either narrow to "if `_reserved_modules.toml` is extended to cover module-level deprecation aliases" OR remove the contingent reference.

### ADR-007 amendment

1. **Rename `Core` → `Cross-cutting` everywhere**: 5 prose occurrences plus `_bounded_context_core.toml` → `_bounded_context_cross_cutting.toml`. (Q4.)

2. **Replace disjointness lock spec** in §Invariant Tests bullet 1 with the Probe 7 wording (verbatim): "Every underscore-prefixed package appears in EXACTLY ONE of `{_bounded_context_write_side.toml, _bounded_context_read_shape.toml, _bounded_context_adapters.toml, _bounded_context_cross_cutting.toml}`. `_bounded_context_workflow_pairs.toml` enumerates ordered (left, right) pairs where left is the workflow-side package; right is the primary-category package (write-side or adapter). A package may appear in `_bounded_context_workflow_pairs.toml` as a right-half regardless of its primary-category membership; the lock asserts the right-half is also present in its primary-category allowlist. `_register_listings` is the single permitted dual-class case in the four primary allowlists, present in both `_bounded_context_write_side.toml` AND `_bounded_context_read_shape.toml`."

3. **Move `_orphaned_items` from Read-shape to Workflow-paired**: pair `_orphaned_items ↔ _identity_access_lifecycle` (NOT `_admin_telemetry`). Update appendix table row.

4. **Drop the `_notification_inbox ↔ _admin_telemetry` pair**: replace with `_notification_inbox ↔ _identity_access_lifecycle`, OR reclassify `_notification_inbox` as a secondary write-side context.

5. **Add §Decision sentence on per-allowlist atomicity**: "ADR-007's per-context atomicity tests (`ADR-007:32`) continue to apply per allowlist: a context appearing in two allowlists must satisfy atomicity for each role independently." (Probe 5.)

6. **Recompute count summary** (`plan-loop-3-06-adr-drafts.md:281-287`): clarify "10 workflow-pair left-halves enumerated; right-halves are NOT counted again — they retain primary-category counts." (Probe 7.)

---

## Loop 1 claims that hold vs fail

**HOLD**:
- A11.3 (SSO subsection lacks a bound lock test) — confirmed.
- A12.1 (`## Cross-References` header is novel) — confirmed.
- A12.3 (ADR-002 missing in ADR-012) — confirmed.
- A12.4 (ADR-009 scope confusion) — confirmed.
- A7a.2 (Core collides with `backend/app/core/`) — confirmed.
- A7a.4 (`_admin_telemetry` adapter-vs-workflow conflict) — confirmed and generalized to 6+ packages.
- A7a.5 (count math) — confirmed; recompute per Probe 7.

**FAIL**:
- A11.1 (ADR-001 citation as written) — Loop 1 said "add ADR-001 citation"; the actual issue is the existing citation is WRONG (mistypes signature and conflates `Capabilities.can` with `require_permission`). Adversarial finding: not a missing citation, an INCORRECT citation.
- A12.2 (soften "same pattern" wording) — Loop 1's softening is correct but inadequate. The ADR-008/ADR-012 SSOT direction is INVERTED. Probe 6 wording is the fix.
- C-1 (add ADR-006 to ADR-011) — REJECT. ADR-011 is a freeze, not a sweep; ADR-006 doesn't apply.
- A8 + A7 `_orphaned_items ↔ _admin_telemetry` pair — REJECT. Empirical commit pattern shows the trigger pair is `_identity_access_lifecycle`, not `_admin_telemetry`.
- A8 + A7 `_notification_inbox ↔ _admin_telemetry` pair — REJECT. `_admin_telemetry` is read-only system telemetry; no notification coupling.

**OVERSTATED**:
- "No blocking contradictions" — Probes 1 and 7 found blocking contradictions.
- "Conditional PASS for all three" — ADR-007 amendment should be downgraded to "needs rework before publication."

---

## Final per-ADR adversarial verdict

| ADR | Loop 1 | Adversarial verdict |
|---|---|---|
| ADR-011 | Conditional PASS | **PASS after fixing ADR-001 signature error and adding ADR-003/ADR-004 cross-refs**; ADR-006 cross-ref REJECTED. |
| ADR-012 | Conditional PASS | **PASS after section-header rework, Probe 6 ADR-008 wording fix, Probe 4 test naming, ADR-002 citation, and ADR-009 narrowing**. |
| ADR-007 amendment | Conditional PASS | **NEEDS REWORK before publication**: Probe 7 lock semantics are BLOCKING; pair selection for `_orphaned_items` and `_notification_inbox` is empirically wrong. |

After the listed edits, all three are publishable.
