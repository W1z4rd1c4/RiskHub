# RiskHubOSS Audit Remediation Plan v6.3.3 — 2026-05-16

| Field | Value |
|---|---|
| Title | RiskHubOSS Audit Remediation Plan v6.3.3 |
| Plan version | 6.3.3 (Item 3 copy-safe implementation + P6 no unauthorized git isolation + active/dropped acceptance wording; supersedes 6.3.2) |
| Plan date | 2026-05-16 (v6.3.3; v6.3.2 2026-05-16; v6.3.1 2026-05-16; v6.3 2026-05-16; v6.2 2026-05-15; v6 baseline 2026-05-11) |
| Audit window | 2026-05-09 to 2026-05-10 |
| Diff base | `1cb1dd4c` |
| Diff head | `6312f866` |
| Commits in scope | 17 |
| File-change footprint | 1006 files changed (+117,874 / −8,799) |
| Audit pattern | 3-round adversarial Opus subagent review (5 + 5 + 4 = 14 agents) |
| Triage pattern | 3-round deep-triage adversarial Opus subagent review (15 agents) reconciling v5 findings against HEAD |
| Critical (red) findings | 0 active in v6.3.3; cumulative 5 caught in v5 + 5 caught in v6.3 (SQL/CRO/catalog/risk_hub/helper) + 3 caught in v6.3.1 cleanup (current_user.roles/stale catalog refs/Zod math) + 1 copy-safety cleanup in v6.3.3 (Item 3 current_user/admin_user + nonexistent RoleType import path) — all resolved |
| Total tracked items | **37 active + 3 dropped** (40 numbered; items 20, 24, and 34 dropped per v6/v6.1 — FALSE-PREMISE) |
| Phases planned | 5 fix phases (P0-P5) + 1 re-audit phase (P6) |
| Status | READY v6.3.3 — pending execution |
| Owner | Orchestrator (main thread) dispatching Opus subagents |
| v3 revision reason | v2 triage found 3 critical hazards (item 26 blocker-fork, item 32 wrong direction, item 36 fictional path), 7 partials, 7 internal-consistency drifts; v3 fixed all 17. |
| v4 revision reason | v3 triage (10 Opus subagents R1+R2) found 7 stale anchors: item 4 call-site paths (`_kri_history/...`/`_kri_value_submission/...` should be `_approval_execution/...`), item 29 path drift (`_approval_execution/approval_scenario_policy.py` → `approval_scenario_policy.py`), §11 row 27 stale path (`sensitive_fields.py` → `core/_permissions/sensitive.py`), §8 `kri_assignment.py` path (`services/kri_assignment.py` → `services/_vendor_links/kri_assignment.py`), Decisions Log D2/D3/D4/D5 leading labels off-by-one (corrected to v3 numbering #37/#38/#39/#40), §12.7 R1-E item range (`38-39` → `38-40`), item 18 dedupe rule (admin_console already catalogued at line 216 — drop from add-set). v4 patches all 7 surgically with Edit. |
| v5 revision reason | v5 enhancement pass (5 parallel Opus subagents) raised quality further by (a) catching a §11 row-30/31 misalignment v3/v4 triages missed — row 30 still described the v2-DROPPED 404-not-403 lock and row 31 described actual item 30, leaving real item 31 (Export endpoint, BL §10.3) absent from §11; (b) empirically resolving item 18's ambiguous "≤12 surfaces" to a definitive 11-ID list (v6.3: risk_hub DROPPED — nested-panel composite fails validator; see item 18) (`role_hub`, `department_hub`, `risk_type`, `approval_scenario`, `risk_questionnaire`, `dashboard_overview`, `activity_log`, `approval_request`, `user_directory`, `control_execution_list`, `kri_history` — v6.3.1: `risk_hub` removed from list to match 11-ID annotation) with bare-noun naming convention; (c) surfacing a 🔴 cross-phase blocker — P4A item 25 (`MigrationAlreadyAppliedError`) must precede P2 item 16 if phases run in numerical order; (d) adding §6.2 dependency graph (hard blockers, soft dependencies, cross-item code-touch hotspots, recommended execution order); (e) tightening §11 line ranges for items 3 and 9 to match the per-phase tables exactly; (f) confirming via empirical sweep that none of the 14 proposed test files / 7 proposed test names / 5 new baseline TOMLs collide with existing artefacts. v5 is the first plan version with explicit cross-phase ordering documented. |
| v6 revision reason | v5 deep-triage (15 Opus subagents across 3 rounds + main-thread RBAC verification) caught 5 BLOCKING issues v3/v4/v5 self-triages all missed: (1) **Item 3 PRODUCTION-BREAKING** — `admin:session.revoke` is NOT in `RBAC_PERMISSIONS`; admin role has only `("users:*", "departments:read")`. Swapping `Depends(require_platform_admin)` for `Depends(require_permission("admin","session.revoke"))` denies every platform admin (and silently grants CRO). v6 mandates the seed update + Alembic data migration. (2) **Item 17 FALSE-PREMISE** — live class is `KRICapabilities` (no `Read` suffix, 5 production consumer files); v5's "append Read to BOTH" would have inserted fictional class name `KRICapabilitiesRead`. v6 prescribes the asymmetric edit. (3) **Item 20 FALSE-PREMISE** — line-46 ceiling is INDEPENDENT ratchet (not redundant with line-45 subset); deletion would silently allow unbounded commit-site growth. v6 DROPS item 20. (4) **Item 25 PARTIAL FALSE-PREMISE** — `_projection_for` uses exact-type lookup, NO MRO walk; subclassing `ConflictError` makes HTTP 409 work via class attribute but `audit_code` falls back to `"domain_error"`. v6 mandates the registry entry (was "Optionally" in v5). (5) **Item 36 FABRICATION** — 6 of 7 v5-prescribed field names are fictional; real schema fields are `can_edit_identity, can_edit_business_access, can_edit_role, can_deactivate, can_change_active_status, can_break_glass_enable, can_revoke_sessions`. v6 replaces the fabricated list. Plus: (6) **Item 34 DROP** — "restore-pending" state does not exist in BL §8.3 anywhere; v5 would have written the fabrication into the contract. v6 DROPS item 34. Plus 12 surgical edits to items 6, 7, 9, 10, 13, 16, 21, 22, 24, 26, 29, 32, 33 covering scope expansions, regex relaxation, scaffold restructure, and framing corrections. Plus §6.2 line-688 misattribution fix and §11 row-29 second-site addition. **v6.1 patch (2026-05-15):** Counter-triage of v6 confirmed item 24 is the third FALSE-PREMISE — `useAuthz.invariant.test.ts` has no basename-substring filename guards (lines 19-21 are content guards on policy.ts source; line 28 checks a code idiom already canonical; source paths at :16,25,32,39,43,44,55 are full canonical paths passed to `readFileSync`); `BusinessRouteGuards.test.tsx` uses `vi.mock` with zero substring assertions on filenames. Item 24's 'tighten basename substring to full-path canonical' has no matching code. v6.1 DROPS item 24 alongside items 20 and 34. |
| v6.1 revision reason | DROPS item 24 as third FALSE-PREMISE — `useAuthz.invariant.test.ts` lines 19-21,28 are content guards on `policy.ts` source NOT basename matches; `BusinessRouteGuards.test.tsx` uses `vi.mock` with zero substring assertions. |
| v6.2 revision reason | Counter-triage (2026-05-15) of v6.1 surfaced 5 critical defects (C1-C5): metadata stamp drift, item 21 atomicity gap, item 28 AST under-specification, item 18 missing Zod path table, item 38 README-update sub-step missing. Plus item 14 BIND-THREADING + 4-BRANCH GUARD. v6.2 patches all inline. |
| v6.3 revision reason | Loop 1-3 triage (13 Opus subagents) confirmed 5 critical + 4 should-fix + 9 new defects against v6.2: (1) item 3 `ON CONFLICT DO NOTHING` Postgres-error (no unique constraint), replaced with `WHERE NOT EXISTS`; (2) item 3 CRO `*:*` contradicts platform-admin-only — REVERSED to mandatory admin-role assertion; (3) `admin:session.revoke` removed from `capability-catalog.json` (validator is field-shape-only); (4) item 18 `risk_hub` DROPPED — nested `RiskHubPanelCapability` panels fail validator (12 `*_field_missing` empirical); 12→11 surface IDs cascaded; (5) item 22 `_allowlist_expiry.py` helper Sub-step 0 added (file absent at HEAD); plus item 14/15 marker pins, §12.5 P4 anti-pattern scoped for item 25, §7 per-item gates for items 26-32, §13 glossary expansion with v4/v5/v6/v6.1/v6.2/v6.3 entries + D6 CRO decision. |
| v6.3.1 revision reason | Self-review + counter-triage of v6.3 (2026-05-16) caught 3 critical residue defects: (1) admin-role example used invalid `current_user.roles` (plural) — User model has singular `role: Mapped["Role"]`; replaced with canonical `current_user.role.name != RoleType.ADMIN` pattern per `admin/_deps.py:17`; (2) 4 stale "catalog registration" anchors at lines 225, 667, 939, 1014 contradicted v6.3 NOT-to-catalog rule; replaced with explicit RBAC_PERMISSIONS + contract-row targets; (3) item 18 Zod summary math drift (claimed "5+7=12" for 11 surface IDs) — corrected to "5+6=11" with `risk_questionnaire` flipped EXISTS-REUSE at `workflow.ts:230`. Plus metadata bump, L22 enumeration trim, Step 4 example refresh, line 332 disambiguation, R3-A stash-guard cross-ref. |
| v6.3.2 revision reason | Loop 1-3 triage of v6.3.1 (15 Opus subagents across 3 rounds, 2026-05-16) caught 1 critical + 1 should-fix + 5 trivial defects: (1) **🔴 Item 6 `status_code` shadow** — `ApprovalScenarioConfigurationError(DomainError)` would silently render HTTP 400 not 500 because `to_http_exception` at `backend/app/core/exceptions.py:89-95` uses `getattr(exc, "status_code", projection.status_code)` — the inherited `DomainError.status_code = 400` shadows the registered `ExceptionProjection(status_code=500, ...)`; v6.3.2 mandates explicit `status_code = 500` on the new class body. (2) **🟡 Item 37 insert-don't-overwrite** — Fix text was replacing issue-link-source policy at BL §11.5:915 with a flag-semantics statement that already lives at §10.5:798; v6.3.2 retargets the Fix to INSERT a parenthetical inline rather than overwrite. (3) §1 pytest headline elided `-m "not postgres and not benchmark"` marker spec — added inline. (4) Metadata Plan-date stamp drifted vs v6.3.1 row — refreshed. (5) Empirical-headlines parenthetical `(2026-05-11)` superseded — re-verified 2026-05-16 by Loop 3A (all 10 gates reproduce). (6) §11 row 3 line range `47-58` undercount of actual function span (47-62) — corrected at both row 3 (§11 line 945) and Item 3 file:line column (§4.2.1 line 240). (7) Item 10 log-message label "duplicate guard" was branch-inappropriate for the non-breach branch (notification dispatch) — split into branch-specific messages. **All 7 defects patched inline; no item ID added, dropped, or renumbered. Loop 3A empirically reproduced 10/10 §1 headline claims at HEAD on 2026-05-16; the plan's diff base/head SHAs remain `1cb1dd4c..6312f866` and all counts (pytest 2009/2046/37, mypy 0/593, arch 190, alembic single head `k6l7m8n9o0p1`, 17 commits, +117874/-8799) are still authoritative.** |
| v6.3.3 revision reason | Document-only cleanup after v6.3.2 review: (1) Item 3 implementation made copy-safe by naming the permission dependency local `current_user`, assigning `admin_user = require_platform_admin(current_user)` as the first handler-body statement, and explicitly adding `from app.core.security import require_permission`; (2) removed the stale inline fallback that referenced nonexistent `app.security.permissions`; (3) P6 R3-A now forbids `git stash`, `git stash pop`, and `git worktree add` unless the orchestrator explicitly authorizes git isolation in chat; (4) P6 acceptance now uses canonical accounting: 37 active items resolved, items 20/24/34 documented as dropped false-premise. |

---

## 1. Audit Summary

This document plans the remediation work for the 2026-05-09 to 2026-05-10
RiskHubOSS audit. The audit covered 17 commits between `1cb1dd4c` and
`6312f866` (1006 files; +117,874 / -8,799 lines), spanning architecture-cleanup
work, capability-contract refactors, vendor-status removal (Wave 8), forward-only
Postgres migrations, and approval-workflow hardening.

The audit was executed in three Opus-subagent rounds following the
project's mandated adversarial pattern (see `CLAUDE.md` "Adversarial rounds for
high-stakes work"):

- **Round 1** (5 parallel Opus subagents): per-domain initial pass — backend
  services and endpoints, architecture locks plus allowlists, capability
  contract, migrations, and frontend.
- **Round 2** (5 parallel Opus subagents): adversarial re-review with explicit
  briefing that Round 1 produced false flags; agents were instructed to verify
  every prior finding by reading the current file.
- **Round 3** (4 parallel Opus subagents): heavy gates with NEW-vs-PRE-EXISTING
  worktree splits for `ruff` and `mypy`, full backend pytest, frontend
  `tsc`/`eslint`, architecture-lock suite, authorization-capability-contract
  validator, and adversarial verification of Round 2 verdicts.

**Empirical headlines confirmed at HEAD (re-verified 2026-05-16 by v6.3.2 Loop 3A — 10/10 gates reproduce):**

- Backend `pytest`: **2009 collected / 2046 total (37 deselected via `-m "not postgres and not benchmark"`)**, 0 failures, 0 errors.
- Backend `mypy`: **0 errors** (`Success: no issues found in 593 source files`).
- Backend `ruff`: **All checks passed.** The v1 plan's cited E501/E402 lines do not
  exist at HEAD; `backend/ruff.toml:5` excludes `tests/` and `scripts/` from the
  scan, which the v1 plan overlooked.
- Architecture locks: **190 passed** via Makefile target (`tests/backend/pytest/architecture/` directory contributes 182, plus `test_w0_harness_contract_red.py` adds 8); all passing.
- `validate_authz_capability_contract.py`: passes.
- `validate_public_repo_hygiene.py`: **64 findings**, all from 88 already-tracked
  `.planning/audits/_context/*.md` files (will close after P0 item 1).
- `docs-topology-consistency`: **FAILS at HEAD** with `unreachable_count=1` —
  the plan file itself is unreachable from canonical docs (closes after P0 item 2).
- Frontend `tsc` 0 errors; frontend `eslint` clean.

**No 🔴 critical blockers.** Remaining items are 🟡 fixes, 🟢 observations,
or 🔵 lock improvements.

**Triage v3 reconciliation.** This plan is v3, rewritten after the v2 triage
(15 Opus subagents) found 3 critical execution hazards:

- (a) **Item 26 was framed as a P1-blocker fork** but the service-layer
  rejection seam already exists at
  `backend/app/services/_issue_workflow/update_plans.py:20-24`. v3 reframes
  item 26 as a LOCK-only deliverable.
- (b) **Item 32 told agents to add an endpoint-level
  `Depends(require_permission("controls","read"))`** when the service layer at
  `backend/app/services/_control_execution/link_governance.py:160-163` already
  enforces a stronger bilateral check (`controls:write`). The v2 instruction
  would have *weakened* the existing guard. v3 reframes item 32 as a LOCK-only
  deliverable targeting the existing service-layer seam.
- (c) **Item 36's cross-reference path
  `backend/app/services/reports/unified_exports/` does not exist.** The real
  synthesis site is
  `backend/app/services/_reporting/exports/filters.py:57,63` plus `rows.py:120`.
  v3 re-anchors item 36 to the correct path.

v3 also fixes 7 partials (item 3 under-specification, item 5 half-patch,
item 18 naming, item 22 incomplete TOML list, item 23 over-claim, item 21
idiom singularization, item 39 sibling-test omission) and 7 internal-consistency
drifts (numbering skew between table-of-contents, decision log, and per-phase
sections introduced when v2 dropped 11 stale v1 items).

**Triage v6 reconciliation.** v5 underwent a deep-triage pass (15 Opus
subagents across 3 rounds + main-thread RBAC verification at HEAD) that
caught **5 BLOCKING issues** v3/v4/v5 self-triages all missed — each of
which would have broken production code, weakened existing locks, corrupted
audit telemetry, or written fictional content into the contract:

- (1) **Item 3 PRODUCTION-BREAKING.** `admin:session.revoke` is NOT in
  `RBAC_PERMISSIONS`; admin role has only `("users:*", "departments:read")`.
  The v5 capability-marker swap denies every platform admin (and silently
  grants CRO via `*:*`). v6 mandates seed update + Alembic data migration.
- (2) **Item 17 FALSE-PREMISE.** Live class is `KRICapabilities` (no `Read`
  suffix, 5 production consumer files). v5's "append `Read` to BOTH" would
  have inserted a fictional class name into the contract. v6 prescribes the
  asymmetric edit — keep `KRICapabilities` bare, only `KRIHistoryCapabilities`
  gains the `Read` suffix.
- (3) **Item 20 DROPPED — FALSE-PREMISE.** Line-46 ceiling
  (`assert len(commit_sites) <= 2`) is an INDEPENDENT ratchet, not redundant
  with the line-45 subset check. Deleting it would silently allow unbounded
  commit-site growth. Item 20 dropped; both assertions retained.
- (4) **Item 25 PARTIAL FALSE-PREMISE.** `_projection_for` at
  `core/exceptions.py:79` uses exact-type lookup, no MRO walk. Subclassing
  `ConflictError` gives HTTP 409 via class attribute but `audit_code` falls
  back to `"domain_error"`. v6 makes the registry entry MANDATORY (was
  "Optionally" in v5).
- (5) **Item 34 DROPPED — FALSE-PREMISE.** "restore-pending" state does not
  exist anywhere in BL §8.3. Restore is a single-step terminal operation.
  v5 would have written the fabrication into the contract. Item dropped.
- (6) **Item 36 FABRICATION.** 6 of 7 v5-prescribed field names
  (`can_view, can_update_self, can_update_admin, can_delete, can_disable,
  can_unlock, can_break_glass_enable`) are fictional. Real schema fields at
  `access.py:66-72` are `can_edit_identity, can_edit_business_access,
  can_edit_role, can_deactivate, can_change_active_status,
  can_break_glass_enable, can_revoke_sessions`. v6 replaces the list.

v6 also applies 12 surgical edits (items 6, 7, 9, 10, 13, 16, 21, 22, 24,
26, 29, 32, 33) covering: prerequisite exception-class creation (item 6),
scope expansions (items 7, 9, 10, 24, 33), regex relaxation (item 13),
test-scaffold restructure (item 16), AST-walk broadening (item 26), D1
placement contradiction (item 29), guard-semantics reframing (item 32), and
TOML-convention disambiguation (items 21, 22). Plus §6.2 line-688
misattribution fix (item 26 ↛ D1; was item 29) and §11 row-29 second-site
addition.

v6.1 net active items: **37** (40 numbered minus items 20, 24, and 34 dropped).

---

## 2. Decisions Log (baked into this plan)

The following five decisions have already been made by the orchestrator and are
locked into this remediation plan. They MUST NOT be re-litigated by execution
agents. Item numbers below refer to **v6 numbering (preserves v3 ID assignments)** (which differs from v2
because v2 items 32 and 33 collapsed into a single v3 item 32).

| # | Decision | Rationale |
|---|---|---|
| D1 | **Item #5 — `approval_scenario_policy.py` requester self-approval HARDEN.** Add a guard at the top of `user_matches_approval_scenario_role` *after* the `roles is None` short-circuit — NOT a conjunction onto line 131, which would only patch the `RISK_OWNER_APPROVER_ROLE` branch and leave the line-129 `role_name in roles` branch unguarded. The guard reads: `if approval.requested_by_id == user.id: return False`. Attribute is `requested_by_id` (verified at `backend/app/models/approval_request.py:84`), NOT `requester_id`. | Defense-in-depth: the helper must be safe even if a future caller forgets the upstream `is_requester` mitigation. Encodes the self-approval invariant at the policy seam. v2's "AND-onto-line-131" framing would have patched only one of two role-resolution branches; v3 corrects to a function-entry guard. |
| D2 | **Item #8 — Contextual issue inactive-vendor code comment + Item #37 — BL §11.5 clarification.** Treat "inactive ≡ archived" semantically. The code stays as-is (only checks `is_archived`); BL §11.5 line 915 is clarified in P5A (item 37) to make the equivalence explicit. The code-comment anchor is `backend/app/services/_issue_register/source_mutation.py:42-43 (line 42 = guard test, line 43 = raise; comment above line 42)`. | Vendor `status` was dropped in migration `k6l7m8n9o0p1`. The doc was the only thing left referencing the old vocabulary; the code already encodes the correct semantics. |
| D3 | **Item #38 — `LinkedVendorSummary.status` Option A.** Finish Wave 8 #77b across four code sites plus one migration-doc update: delete the field at `frontend/src/services/api/schemas/entities/vendors.ts:9` and `frontend/src/types/vendorLink.ts:11`; **DELETE** `tests/frontend/unit/src/services/api/schemas/__tests__/vendors.statusOptional.lookup.test.ts`; **DELETE** `tests/frontend/unit/src/services/api/schemas/__tests__/vendors.statusOptional.test.ts` (sibling that the v2 plan missed); update `docs/migrations/vendor-status-removal.md:7` wording to mark the wave done. | Closes the open thread from the Wave 8 vendor-status removal. The field is dead and was only retained as a defensive optional during the rollout. v2 captured the lookup test but missed the sibling `vendors.statusOptional.test.ts`. |
| D4 | **Item #39 — AuthContext facade Option B.** Keep `useAuth()` as the canonical consumer hook. Add a one-line intent comment that narrow hooks (`useSession`, `usePreferenceState`, `useAuthActionsContext`) are available for future render-isolation needs. | No measured render-perf concern today. Migration is mechanical when needed; pre-emptively migrating every consumer is gold-plating. |
| D5 | **Item #40 — mypy CI wiring. WITHDRAWN on CI rail.** Empirical verification at HEAD shows `mypy` is already wired into CI at `.github/workflows/lint.yml:69-73` (`- name: Backend mypy gate`) and `.github/workflows/maintenance-governance.yml:151-155`. Item 40 retains *only* the `make lint-types` developer-experience wrapper under P5B. | v1's framing assumed mypy was unenforced. That assumption is false at HEAD. The wrapper is retained because it is a real DX gap, but the "wire mypy into CI" deliverable is closed. |

---

## 3. Phase Plan Overview

| Phase | Agents | Focus | Item Range | Cost (wallclock) |
|---|---|---|---|---|
| P0 — Hygiene unbreak | 1 sequential | `git rm --cached` audit-context files; add audit plan to canonical docs tree to unbreak `docs-topology-consistency` | 1-2 | ~15 min |
| P1 — Code fixes + tests | 3 parallel (A, B, C) | Capability marker rescope, unused param, requester self-approval HARDEN (D1), JSON parse hardening, schema literal types + canonical constant, contextual-issue comment, row locks, deadline-service None-owner | 3-10 (8 items) | ~45-60 min |
| P2 — Migration hardening | 1 sequential | SQLite parity, defensive idempotency logging, JSONB cast preflight, FK-drop guard, FK-ordering test fix, exception-type test tightening (item 16 blocked by P4A item 25 — see §6.2) | 11-16 | ~30-45 min |
| P3 — Capability contract cleanup | 1 sequential | KRIHistoryCapabilities prose alignment, 11 catalog surface additions (v6.3 cascade: risk_hub DROPPED from v5 12-ID list — see item 18), typed Pydantic list capabilities | 17-19 | ~30 min |
| P4A — Lock improvements + exception type | 1 of 2 parallel | Tautological ceiling (item 20 DROPPED v6), AST-walk replacement, expiry on 8 TOML allowlists (v6.2: _auth_idiom_baseline.toml moved to item 21), registry-ref instead of magic numbers (5 files, not 8), ~~frontend filename guards~~ (item 24 DROPPED v6.1), `MigrationAlreadyAppliedError` in `core/exceptions.py` | 21, 22, 23, 25 (items 20, 24 DROPPED v6/v6.1) | ~60 min |
| P4B — New architecture locks | 1 of 2 parallel | PATCH /issues service-layer status exclusion lock (seam exists), SENSITIVE_FIELDS closed-set lock, is_priority directional asymmetry policy lock, self-approval prevention lock, PATCH /access/users body-level binding lock, export endpoint visibility-clause lock, bilateral access on POST /risks/{id}/controls service-layer lock | 26-32 | (folded into P4 budget) |
| P5A — BL doc drift | 1 of 2 parallel | §8.2 archive vocabulary, §8.3 restore state (item 34 DROPPED v6), §8.3 vendor restore (correct path `_reporting/exports/`), §1.4 capabilities 5→7, §11.5 vendor inactive≡archived clarification (D2) | 33-37 (item 34 DROPPED) | ~30-45 min |
| P5B — Frontend cleanup + Makefile wrapper | 1 of 2 parallel | Wave 8 #77b finish (4 code sites — `vendors.ts`, `vendorLink.ts`, lookup test, sibling test — plus migration doc) (D3), AuthContext intent comment (D4), `make lint-types` DX wrapper (D5 residual) | 38-40 | (folded into P5 budget) |
| P6 — Re-audit | 5 + 5 + 4 = 14 | Adversarial 3-round verification of all P0-P5 fixes, BL drift reconciliation | All | ~60-90 min |

Each fix phase ends with a verification gate before the orchestrator moves to
the next phase. P5C (mypy CI wiring) from v1 has been dropped — see D5.

---

## 4. Per-Phase Detail

### 4.1 P0 — Hygiene unbreak (1 agent, sequential, ~15 min)

Single Opus subagent runs items 1-2 sequentially. The cluster is intentionally
narrow: v1 listed six P0 items, but triage found four of them already complete
at HEAD (ruff is clean; the Makefile bug was already fixed; STRUCTURE.md
metrics already match HEAD; the `last_reviewed` dates are already aligned).
The two surviving items are the ones that actually move a gate from red to
green.

| # | Title | File:line | Fix description | Verification step | Depends on |
|---|---|---|---|---|---|
| 1 | Untrack audit context files | `.planning/audits/_context/**` (90 tracked files — 88 .md + 2 non-md); `.gitignore:150` (`.planning/audits/_context/`) | The `.gitignore` entry at line 150 is necessary BUT INSUFFICIENT — 90 tracked files (88 .md + 2 non-md) are already tracked, so `validate_public_repo_hygiene.py` still finds 64 violations. (a) Run `git rm --cached -r .planning/audits/_context/` to untrack ALL files (including 2 non-md: `migration-snapshot-k6l7m8n9o0p1.txt`, `plan-loop-2-01-master-dag.yaml`) while leaving them on disk; (b) confirm `.gitignore` line 150 is committed; (c) re-run the hygiene validator to confirm exit 0. | `python3 scripts/security/validate_public_repo_hygiene.py --mode tracked` exits 0 and prints `public_repo_hygiene_findings=0` / `Public repo hygiene validation passed.` (validator returns `1 if findings else 0` at `validate_public_repo_hygiene.py:447`). Scope: this gate covers `--mode tracked` only; `--mode history-patches` will continue to flag historical commits introducing `.planning/audits/_context/` until git-history is rewritten (out of P0 scope). | — |
| 2 | Make audit plan reachable from canonical docs | `docs/DOCUMENTATION_TREE.md` OR `docs/audits/README.md` (whichever the topology validator treats as canonical entry); target: this remediation plan at `docs/audits/2026-05-10-audit-remediation-plan.md` | `docs-topology-consistency` currently fails at HEAD with `unreachable_count=1` — the audit remediation plan itself is unreachable from the canonical docs tree. Add a single link entry from the canonical docs index (or the audits README, whichever the validator scans) pointing to the plan file. **🟡 v6.3 SUB-STEP — git add REQUIRED.** The plan file `docs/audits/2026-05-10-audit-remediation-plan.md` is currently UNTRACKED. The topology validator inspects tracked files only; without `git add docs/audits/2026-05-10-audit-remediation-plan.md` the link entry will dangle. Order: (a) edit the canonical-tree entry, (b) `git add` the plan file, (c) re-run the validator. | `make -f scripts/Makefile docs-topology-consistency` exits 0; the generated `tests/results/docs/docs-tree-audit-*/docs-tree-audit.md` shows an empty `Unreachable Canonical Files` section (`unreachable_count: 0`). | item 1 (file scrubs first, then topology fix) |

**P0 verification gate:**

```
python3 scripts/security/validate_public_repo_hygiene.py     # exits 0
make -f scripts/Makefile docs-topology-consistency           # exits 0
```

Both commands must exit 0 before P1 begins. If either still fails, the P0 agent
must re-anchor (the hygiene validator may flag additional files not in
`_context/`; the topology validator may require the link be placed in a
specific section of the canonical tree).

---

### 4.2 P1 — Code fixes + regression tests (3 parallel agents)

Three Opus subagents run in parallel. Agent A and Agent B implement code
patches (items 3-6 and 7-10 respectively). Agent C writes regression tests
for the seven testable items, consuming patches from A and B as they land via
shared filesystem. Item 8 is a comment-only change and has no regression test
(coverage of the inactive≡archived equivalence lives with the BL doc update in
P5A item 37).

v3 changes vs v2:

- Item 3 rewritten — v2's `setattr(..., "required_capability", ...)` framing
  was under-specified. The `required_capability` attribute is produced only by
  the `require_permission()` / `require_business_permission()` factories in
  `backend/app/core/security.py:182,203`. Admin endpoints currently use
  `Depends(require_platform_admin)` from `admin/_deps.py:10`, a role gate that
  does not attach `required_capability`. v3 swaps the dependency on
  `sessions.py:50` and registers `("admin", "session.revoke")` in `RBAC_PERMISSIONS` + AUTHZ-AUTH-SESSION contract row (v6.3.1: NOT in `docs/security/capability-catalog.json` — see item 3 main row).
- Item 5 rewritten — v2 only patched the `RISK_OWNER_APPROVER_ROLE` branch at
  `approval_scenario_policy.py:131`. The earlier `if role_name in roles:
  return True` path at line 129 still allows self-approval. v3 adds a guard at
  the top of `user_matches_approval_scenario_role`, covering both branches.
- Item 7 rewritten — actual count is 7 inline kwarg sites plus one
  module-level constant. v3 lists all seven kwarg lines plus the constant
  update and excludes migrations under ADR-010.

#### 4.2.1 Agent A — items 3-6

| # | Title | File:line | Fix description | Verification step | Depends on |
|---|---|---|---|---|---|
| 3 | Capability marker on revoke session (REWRITTEN v3 + RBAC SEED FIX v6) | `backend/app/api/v1/endpoints/admin/sessions.py:47-62`; `backend/app/db/rbac_seed_contract.py:51-82` | **Option A (chosen).** Swap `Depends(require_platform_admin)` for `Depends(require_permission("admin", "session.revoke"))` at `sessions.py:50`. The `required_capability` attribute is produced only by the `require_permission()` / `require_business_permission()` factories in `backend/app/core/security.py:182,203`; the current `require_platform_admin` import from `admin/_deps.py:10` is a role gate that does not attach `required_capability`. **🔴 v6 BLOCKING FIX — RBAC seed update required.** Empirical at HEAD: `RBAC_PERMISSIONS` contains no `admin:*` capability; `RBAC_ROLE_PERMISSIONS["admin"] = ("users:*", "departments:read")`. `require_permission` does NO role-based bypass — it iterates the user's seeded capabilities. Without seed updates, the swap denies every platform admin with HTTP 403 and silently grants access to CRO (via `("*:*",)`). **Required additional steps:** (a) add `("admin", "session.revoke")` to `RBAC_PERMISSIONS` in `backend/app/db/rbac_seed_contract.py`; (b) grant `"admin:session.revoke"` to the `admin` role tuple in `RBAC_ROLE_PERMISSIONS`; (c) Author a forward-only Alembic data migration following the canonical pattern at `backend/alembic/versions/18c1d2e3f4a7_grant_vendor_permissions_to_cro.py`. Specifically: file slug `<next_revision_id>_grant_admin_session_revoke_to_admin.py`; `down_revision = "k6l7m8n9o0p1"` (the current head verified at HEAD by walking `down_revision` chains in `backend/alembic/versions/`; re-verify with `cd backend && alembic heads` before drafting); `upgrade()` body — (1) `op.execute("INSERT INTO permissions (resource, action, description) SELECT 'admin', 'session.revoke', 'Revoke user sessions' WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE resource='admin' AND action='session.revoke')")`; (2) `op.execute("INSERT INTO role_permissions (role_id, permission_id) SELECT r.id, p.id FROM roles r JOIN permissions p ON p.resource='admin' AND p.action='session.revoke' WHERE r.name='admin' AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id=r.id AND rp.permission_id=p.id)")`; **v6.3 rationale: the prior `ON CONFLICT`-skip form crashes Postgres 42P10 (no unique constraint on resource,action or role_id,permission_id); WHERE NOT EXISTS matches the canonical pattern at 18c1d2e3f4a6_sync_vendor_permissions.py:34-69.** `downgrade()` body — `raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")`. CRO decision (REVERSED v6.3): the legacy require_platform_admin gate EXCLUDED CRO; the new require_permission("admin","session.revoke") would silently GRANT CRO via the *:* wildcard, contradicting the documented platform-admin-only scope at docs/security/authorization-capability-contract.md:152. Required: wrap the endpoint with an explicit admin-role assertion. **v6.3.3 copy-safe implementation:** add `from app.core.security import require_permission`; keep the existing `from ._deps import require_platform_admin` import; change the revoke endpoint dependency local to `current_user: User = Depends(require_permission("admin", "session.revoke"))`; make the first handler-body statement `admin_user = require_platform_admin(current_user)`; keep the existing `revoke_admin_user_sessions(..., admin_user=admin_user)` service call. Do NOT import `RoleType` into `sessions.py`; do NOT use `app.security.permissions` (the module does not exist). This preserves the `required_capability` marker from `require_permission` and reuses the canonical admin-role enforcement at `admin/_deps.py:17`. **v6.3.1 fix: User model exposes singular `role: Mapped["Role"]` (`backend/app/models/user.py:64`), NOT plural `roles` — the prior `{r.name for r in current_user.roles}` set-comp would AttributeError at runtime.** Document in the contract row that revocation is "admin role only; CRO wildcard does NOT apply". (d) **v6.3 SUPERSEDED by REVERSED v6.3 decision above** — the admin-role assertion wrap is now MANDATORY (not conditional); `admin:session.revoke` registration goes to `RBAC_PERMISSIONS` + AUTHZ-AUTH-SESSION contract row only, NOT to `docs/security/capability-catalog.json` (catalogs Pydantic capability surfaces, not RBAC permission tuples; would emit `*_field_missing` findings). **Option B (rejected).** Attaching `setattr(require_platform_admin, "required_capability", ("admin", "*"))` in `admin/_deps.py` would mark every admin endpoint with one generic capability — wrong granularity. | `python3 scripts/security/validate_authz_capability_contract.py` exits 0 (v6.3: catalog field-parity gate unchanged — `admin:session.revoke` is NOT in the catalog by design). Membership in `RBAC_PERMISSIONS` verified by `tests/backend/pytest/architecture/test_rbac_seed_admin_session_revoke_red.py`. Static implementation checks: `rg -n "from app.core.security import require_permission|current_user: User = Depends\(require_permission\("admin", "session.revoke"\)\)|admin_user = require_platform_admin\(current_user\)" backend/app/api/v1/endpoints/admin/sessions.py` returns all three expected hits, and `rg -n "app\.security\.permissions" backend/app/api/v1/endpoints/admin/sessions.py` returns zero. Regression test (Agent C) — three cases: (i) admin user passes the new gate, (ii) non-admin/non-CRO users still get 403, (iii) CRO is **blocked** by the admin-role assertion per REVERSED v6.3 decision (returns 403 despite holding `*:*` capability). Seed reload test asserts `admin` role resolves `("admin", "session.revoke")`. | — |
| 4 | Unused approval param | `backend/app/services/_approval_execution/results.py:28-29` | Remove the unused `approval` parameter from `auto_reject_kri_approval(approval, reason)`. New signature: `auto_reject_kri_approval(reason: str)`. Update 6 call sites: `backend/app/services/_approval_execution/kri_history_correction.py:46`, `:52`, `:63`, `:74`, `:115`; `backend/app/services/_approval_execution/kri_value_submission.py:93` (both files live under `_approval_execution/`; `_kri_history/` and `_kri_value_submission/` directories do not own these callers). | Type test from Agent C asserts signature is `(reason: str)`. `rg "auto_reject_kri_approval\("` shows no caller passes two args. | — |
| 5 | Self-approval requester check (HARDEN per D1, REWRITTEN v3) | `backend/app/services/approval_scenario_policy.py:123-135` | v2 only patched the `RISK_OWNER_APPROVER_ROLE` branch at line 131, leaving line 129 (`if role_name in roles: return True`) able to admit a requester whose project role appears in `roles`. v3 adds a guard at the top of `user_matches_approval_scenario_role`, immediately after the `roles is None` short-circuit at lines 126-127: `if approval.requested_by_id == user.id: return False`. This protects both the `role_name in roles` path and the `RISK_OWNER_APPROVER_ROLE` path. Attribute name confirmed: `requested_by_id` (`backend/app/models/approval_request.py:84`); `requester_id` does not exist on the model. | Unit test (Agent C) parametrizes over four combinations of (is-requester, role membership). The two requester-as-member combinations must return False; the two non-requester combinations must return True. | — |
| 6 | JSON parse hardening (+ exception class creation in v6; **🔴 v6.3.2 status_code shadow fix**) | `backend/app/services/_riskhub_config/approval_scenario_roles.py:13-17`; `backend/app/core/exceptions.py` | **Step 0 (v6 prerequisite, v6.3.2 status_code mandate).** `ApprovalScenarioConfigurationError` does NOT exist in the repo today (`rg "ApprovalScenarioConfigurationError" backend/` returns 0 hits). Append to `backend/app/core/exceptions.py`:<br><br>```python<br>class ApprovalScenarioConfigurationError(DomainError):<br>    """Raised when approver_roles JSON is malformed for a scenario."""<br>    status_code = 500<br>```<br><br>**🔴 v6.3.2 MANDATORY: `status_code = 500` class attribute is REQUIRED — not optional.** `to_http_exception` at `backend/app/core/exceptions.py:89-95` uses `getattr(exc, "status_code", projection.status_code)` — the class/instance attribute WINS over the registry projection. The parent `DomainError` sets `status_code = 400` at `exceptions.py:13`; without explicit override on the new class body, the inherited 400 silently shadows the registered `ExceptionProjection(status_code=500, ...)` and corrupted-config failures render as HTTP 400, defeating the loud-failure intent. Compare `ServiceFailure` at `exceptions.py:55-56` which sets `status_code = 500` explicitly for the same reason. (Item 25's `MigrationAlreadyAppliedError` is unaffected because it inherits from `ConflictError` whose class attr is already 409.) **Alternative acceptable form:** inherit from `ServiceFailure` instead of `DomainError` (ServiceFailure already sets 500). AND register `ApprovalScenarioConfigurationError: ExceptionProjection(status_code=500, retryable=False, audit_code="approval_scenario_misconfigured")` in `EXCEPTION_REGISTRY` (the registry projection contributes `audit_code` and `retryable` — the `status_code=500` here is belt-and-braces consistency, NOT load-bearing for the HTTP response). **Step 1.** Replace silent fallback `except (json.JSONDecodeError, TypeError): return DEFAULT_APPROVER_ROLES.copy()` with `raise ApprovalScenarioConfigurationError(f"Corrupted approver_roles JSON for scenario {key}")`. Corrupted config must fail loudly, not silently degrade. | Regression test (Agent C) for malformed-input case must raise `ApprovalScenarioConfigurationError` AND assert `exc.status_code == 500` (catches the v6.3.2-flagged shadow regression). `python -c "from backend.app.core.exceptions import ApprovalScenarioConfigurationError, EXCEPTION_REGISTRY; assert ApprovalScenarioConfigurationError in EXCEPTION_REGISTRY; assert ApprovalScenarioConfigurationError.status_code == 500"` returns clean. End-to-end HTTP test asserts a malformed-config request returns 500 (not 400). | — |

#### 4.2.2 Agent B — items 7-10

| # | Title | File:line | Fix description | Verification step | Depends on |
|---|---|---|---|---|---|
| 7 | Schema literal types + canonical constant + 7 call sites (REWRITTEN v3) | `backend/app/schemas/riskhub.py:135` | Four-step change. **Step 1.** Create canonical constant `APPROVER_ROLES: tuple[Literal["risk_owner", "risk_manager", "cro"], ...] = ("risk_owner", "risk_manager", "cro")` in `backend/app/services/_riskhub_config/approval_scenario_roles.py` adjacent to (but not replacing) `DEFAULT_APPROVER_ROLES = ["risk_manager", "cro"]`. The existing constant encodes the default *selection*, not the full universe, and must not be reused. **Step 2.** Refactor 7 inline kwarg sites that hard-code `["risk_owner", "risk_manager", "cro"]` to `default_roles=list(APPROVER_ROLES)`: `backend/app/services/_kri_history/approval_intake.py:69`; `backend/app/services/_entity_mutation_lifecycle/approval_plans.py:93`; `backend/app/services/_entity_mutation_lifecycle/approval_plans.py:203`; `backend/app/services/_entity_mutation_lifecycle/approval_plans.py:269`; `backend/app/services/_entity_mutation_lifecycle/archive_plans.py:111`; `backend/app/services/_entity_mutation_lifecycle/archive_plans.py:187`; `backend/app/services/_entity_mutation_lifecycle/archive_plans.py:256`. **Step 3.** Update the module-level constant `DELETE_SCENARIO_DEFAULT_ROLES` at `backend/app/services/_approval_queue/execution.py:17` to import from `APPROVER_ROLES`. **Step 4.** Type `approver_roles` on `riskhub.py:135` as `approver_roles: list[Literal["risk_owner", "risk_manager", "cro"]] \| None = None` (literal tuple unpacking). Migration sites at `alembic/versions/e0f1a2b4c5d6_...py:21` and `c8d9e0f1a2b4_...py:68` are out of scope per ADR-010 forward-only. **Step 5 (v6 scope expansion).** Sweep `tests/backend/pytest/` for assertion-side hardcoded `["risk_owner", "risk_manager", "cro"]` literals and migrate to `list(APPROVER_ROLES)`. Approximate sites: `test_approvals.py:290,407,486,496,596`; `test_kris_rbac.py:889,1066`; `test_kris_value_submission_api.py:51`; `test_approval_workflow.py:385,1158`; `test_riskhub_risk_types.py:535,539,605,609,749`. **Allow-list intentional fixtures** that lock seeded defaults: `test_w1_risk_edit_priority_seed_red.py:64`, `test_alembic_revision_graph.py:59` — these keep the literal as canonical seed assertions. | Pydantic-validation test (Agent C) for unknown role rejection must fail validation with 422. `rg '"risk_owner", "risk_manager", "cro"' backend/app/services backend/app/schemas` returns zero hits outside the canonical constant. Allow-listed test fixtures still match the literal as intended. | item 6 (canonical constant lives in the same module hardened by item 6) |
| 8 | Contextual issue inactive vendor comment (NO CODE per D2) | `backend/app/services/_issue_register/source_mutation.py:42-43 (line 42 = guard test, line 43 = raise; comment above line 42)` | NO BEHAVIOR CHANGE. Add a code comment immediately above the line `if vendor_is_archived: raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot link archived vendor")` referencing BL §11.5 (the section clarified in P5A item 37). Make the inactive≡archived equivalence explicit at the seam where issue-link policy enforces it. The DOC update is item 37. | `rg "BL §11.5" backend/app/services/_issue_register/source_mutation.py` returns the comment. | item 37 (BL §11.5 clarification, P5A) |
| 9 | Row locks on approval-execution mutate-after-load paths (EXPANDED v6) | `backend/app/services/_approval_execution/edit_risk_control.py:33,86`; `backend/app/services/_approval_execution/delete_side_effects.py:37,57,79` | Add `.with_for_update()` on all five row selects so concurrent approval execution serializes on each row, preventing the two-approval race observed by the audit. **v6 scope expansion**: same race window exists in `delete_side_effects.py` — line 37 (`select(Risk)` before `mark_archived`), line 57 (`select(Control)` before `mark_archived`), and line 79 (`select(KeyRiskIndicator)` before mark_archived). All three lack `.with_for_update()` today. | Regression test (Agent C) for concurrent two-approval race on each of edit-risk + edit-control + delete-risk + delete-control + delete-kri. Run with `pytest -m postgres` if available; otherwise fall back to unit tests asserting the compiled SELECT statements include `FOR UPDATE`. | — |
| 10 | Deadline-service None-owner explicit skip (EXPANDED v6 — both branches; v6.3.2 branch-label clarified) | `backend/app/services/kri_deadline_service.py:194-208` (breach branch — duplicate-guard before insert) AND `:226-237` (non-breach branch — notification dispatch) | When `owner_id` is None, log the situation with a **branch-appropriate label** and skip explicitly. Breach branch (lines 194-208): `logger.info("Skipping deadline duplicate guard for KRI %s — no owner assigned", kri_id)` and skip the duplicate guard insert. Non-breach branch (lines 226-237): `logger.info("Skipping deadline notification for KRI %s — no owner assigned", kri_id)` and skip the notification dispatch. Today both branches silently no-op, which masks the missing-owner condition and prevents operators from noticing un-owned KRIs. **v6 scope expansion**: the sibling block at lines 226-237 has the identical `owner_id = kri.risk.owner_id if kri.risk else None / if owner_id:` pattern (non-breach notification branch) — apply the same explicit-skip + log fix to both branches with **branch-specific labels** (v6.3.2 fix — the prior single "duplicate guard" wording was inaccurate for the notification branch). | Unit test (Agent C) parametrizes over both branches (breach and non-breach). For each: None-owner case asserts the branch-appropriate log line appears (`"Skipping deadline duplicate guard"` for breach, `"Skipping deadline notification"` for non-breach) and the duplicate guard / notification is skipped (no INSERT issued, no notification sent). | — |

#### 4.2.3 Agent C — regression tests (parallel to A and B)

Agent C writes one or more tests per code-change item. Item 8 is comment-only
and has no test. Locations:

| Item | Test file | Test name (suggested) |
|---|---|---|
| 3 | `tests/backend/pytest/architecture/test_admin_sessions_capability_marker.py` | `test_revoke_user_session_resolves_to_session_revoke_capability` |
| 4 | `tests/backend/pytest/test_auto_reject_kri_approval_signature.py` | `test_auto_reject_kri_approval_takes_only_reason` |
| 5 | `tests/backend/pytest/test_approval_scenario_policy.py` | `test_requester_cannot_self_approve_via_any_scenario_role` |
| 6 | `tests/backend/pytest/_riskhub_config/test_approval_scenario_roles_malformed.py` | `test_corrupted_approver_roles_json_raises_configuration_error` |
| 7 | `tests/backend/pytest/schemas/test_approver_roles_literal_validation.py` | `test_unknown_approver_role_rejected_with_422` |
| 8 | (no test required — comment-only change; coverage in P5A item 37) | — |
| 9 | `tests/backend/pytest/test_edit_risk_control_concurrency.py` | `test_concurrent_two_approval_race_blocks_with_row_lock` |
| 10 | `tests/backend/pytest/test_kri_deadline_service_none_owner.py` | `test_owner_id_none_logs_and_skips_duplicate_guard` |

Notes for Agent C:

- **Item 3 test (REWRITTEN v6).** Mirror the canonical pattern at
  `tests/backend/pytest/architecture/test_w3_gate_snapshot.py:11-23`. The
  capability marker is attached to the `Depends` callable (returned by
  `require_permission()`), NOT to the endpoint function. Walk
  `api_router.routes` (from `app.api.v1.router import api_router`), find
  the route whose `route.name == "revoke_user_session"`, then iterate
  `route.dependant.dependencies` and read
  `getattr(dependency.call, "required_capability", None)`. Assert
  `("admin", "session.revoke")` is among the collected capabilities.
  ALSO assert `"admin:session.revoke"` appears in (a) RBAC_PERMISSIONS in backend/app/db/rbac_seed_contract.py (verified by a new tests/backend/pytest/architecture/test_rbac_seed_admin_session_revoke_red.py importing the tuple and asserting membership), and (b) the AUTHZ-AUTH-SESSION row of docs/security/authorization-capability-contract.md (platform-admin-only scope). Do NOT add to docs/security/capability-catalog.json — that file catalogs per-row Pydantic capability surfaces, not RBAC permission tuples (v6.3: validator regex would emit *_field_missing because 'admin:session.revoke' is not a valid Python identifier).
- **Item 4 test.** Import the symbol and inspect its signature via
  `inspect.signature(auto_reject_kri_approval).parameters`; assert exactly
  one parameter named `reason` typed as `str`.
- **Item 5 test (REWRITTEN v3).** Parametrize over four cases:
  1. user is requester AND user's role is in `roles` → assert False.
  2. user is requester AND `RISK_OWNER_APPROVER_ROLE` in `roles` and
     `approval.primary_approver_id == user.id` → assert False.
  3. user is NOT requester AND user's role is in `roles` → assert True.
  4. user is NOT requester AND `RISK_OWNER_APPROVER_ROLE` in `roles` and
     `approval.primary_approver_id == user.id` → assert True.

  Test body must reference `approval.requested_by_id` (not `requester_id` —
  that attribute does not exist on `backend/app/models/approval_request.py`).
- **Item 6 test.** Write a malformed JSON string to the row-shaped object
  passed into `parse_approver_roles_value` (or the public entrypoint), assert
  `ApprovalScenarioConfigurationError` is raised, and assert the message
  contains the scenario key.
- **Item 7 test.** Parametrize over `["risk_owner", "risk_manager", "cro"]`
  (accept) and `["unknown_role", "ceo", ""]` (reject with 422). Import the
  canonical `APPROVER_ROLES` constant introduced by item 7 so this test pins
  the universe.
- **Item 9 test.** When run without Postgres, compile the two SELECT
  statements rendered by the edit-risk-control execution path and assert each
  rendered SQL contains the substring `FOR UPDATE`. When run with `-m
  postgres`, simulate two concurrent approval executors and assert the second
  blocks until the first commits.
- **Item 10 test.** Use `caplog.at_level(logging.INFO)` and assert both the
  `"Skipping deadline duplicate guard for KRI"` substring and that the
  guard's INSERT path is not invoked (mock the session and assert no `add`
  call).

**Final collection check:** `cd backend && ./venv/bin/python -m pytest -q -m
"not postgres and not benchmark" --no-cov --collect-only | grep <new test
name>` confirms each new test is collected.

**P1 verification gate.** Items 3-10 each have a regression test except item
8 (comment-only). Baseline pytest collection is **2009** tests; v3 adds 7 new
tests (one each for items 3, 4, 5, 6, 7, 9, 10). After Agent C lands:

```bash
cd backend && ./venv/bin/python -m pytest -q -m "not postgres and not benchmark" \
  --no-cov --collect-only | tail -n 1
```

Expect collected ≥ **2016**. Then:

```bash
cd backend && ./venv/bin/python -m pytest -q -m "not postgres and not benchmark" --no-cov
```

Expect ~2016 passed; 0 failed. Re-run
`python3 scripts/security/validate_authz_capability_contract.py` and confirm
exit 0 (v6.3.1: catalog validator field-parity unchanged — `admin:session.revoke` is present in RBAC seed (`backend/app/db/rbac_seed_contract.py`) + AUTHZ-AUTH-SESSION row of `authorization-capability-contract.md`, **absent from `capability-catalog.json` by design**).

---
### 4.3 P2 — Migration hardening (1 agent, sequential)

Single Opus subagent runs items 11–16 sequentially. The items cluster around Alembic migration safety and the migration-test harness. Item 16 imports `MigrationAlreadyAppliedError`, which is added by P4A item 25 — schedule P4A item 25 to land before P2 item 16 begins.

Numbering continues from the prior slice (last item: 10).

| # | Title | File:line | Fix description | Verification step | Depends on |
|---|---|---|---|---|---|
| 11 | SQLite branch parity on vendor link cascade | `backend/alembic/versions/k6l7m8n9o0p1_vendor_link_cascade_and_status_drop.py:77-84` | Move `check_no_link_orphans(bind)` to BEFORE the dialect branch so both Postgres and SQLite lanes run the precheck. Today only the Postgres lane invokes it, producing silent dev-environment drift. Quote target: `if bind.dialect.name == 'postgresql':` followed by branch-local precheck call. The precheck itself is dialect-agnostic (pure SQL over `vendor_risk_links`), so hoisting it above the branch is safe on both lanes. | New test under `tests/backend/pytest/migrations/test_vendor_link_cascade_dialect_parity.py` asserts `check_no_link_orphans` is called regardless of dialect by stubbing both bind variants and recording invocations. | — |
| 12 | Defensive idempotency logging on unify_archive_state | `backend/alembic/versions/h3i4j5k6l7m8_unify_archive_state.py` | The migration is naturally idempotent: `WHERE status = 'archived'` predicates are consumed by step 2's `UPDATE risks SET status = 'active' WHERE status = 'archived'`, so a second run matches zero rows. Re-runs ARE safe. The change here is purely defensive logging for partial-failure recovery (operator crashed between steps). Add an inspector check at the start of `upgrade()`: if `SELECT COUNT(*) FROM risks WHERE is_archived = true` > 0, log `'h3i4j5k6l7m8: already-partially-applied; continuing with idempotent WHERE-clause UPDATEs'`. Do NOT skip the UPDATEs — let the WHERE clauses no-op. | New test `tests/backend/pytest/migrations/test_unify_archive_state_idempotency.py::test_unify_archive_state_logs_idempotent_marker` runs the migration twice with `caplog` and asserts the marker log line appears on the second run. The UPDATE statements still execute (verified by SQL log assertion); the second run is a no-op only by WHERE-clause selectivity. | — |
| 13 | JSONB cast preflight on approver_roles (RELAXED regex v6) | `backend/alembic/versions/i4j5k6l7m8n9_approver_roles_to_jsonb.py:25-32` | Add a SELECT preflight before the `::jsonb` cast: `SELECT id FROM approval_scenarios WHERE approver_roles IS NOT NULL AND NOT (approver_roles ~ '^\s*[\[{"0-9tfn-]')`. If any rows return, raise with the offending row IDs in the exception message. **v6 regex relaxation**: v5's `^\s*[\[{]` over-rejected valid JSON scalars (`null`, `true`, `false`, numbers, quoted strings) that would actually pass the `::jsonb` cast — false-positive failure. The v6 pattern accepts arrays/objects/scalars. Alternatively, assert via column contract that only arrays are valid (then v5 regex is fine). Today a malformed row crashes the migration with an opaque `invalid input syntax for type json` Postgres error and no row identifiers. | New test under `tests/backend/pytest/migrations/test_approver_roles_jsonb_preflight.py` (marked `pytest.mark.postgres`) inserts a malformed row, runs the migration, and asserts the raised exception message contains the bad row ID. Parametrize over `null`, `42`, `"str"` cases to verify the relaxed regex passes them. | — |
| 14 | FK-drop guard on rename_kri_archived_by_fk | `backend/alembic/versions/j5k6l7m8n9o0_rename_kri_archived_by_fk.py:28-32` | Add an inspector-based guard around `op.drop_constraint("fk_key_risk_indicators_archived_by_id", ...)`. Reuse the `_existing_fk_name` helper pattern from sibling migration `k6l7m8n9o0p1_vendor_link_cascade_and_status_drop.py:51-67`. The helper uses `pg_constraint` (Postgres-only) — this is safe to reuse because j5k6 already early-returns on SQLite at lines 25–26 (per the dialect branch), so the helper is only reached on Postgres. Quote target: `op.drop_constraint("fk_key_risk_indicators_archived_by_id", "key_risk_indicators", type_="foreignkey")`. **v6.1 RENAME-HAZARD GUARD:** `_existing_fk_name` returns by column lookup, so on a second run it would find the NEW renamed FK `fk_key_risk_indicators_archived_by_id_users` (which targets the same `archived_by_id` column) and attempt to drop it — silently regressing the migration. After the helper returns, verify `name == "fk_key_risk_indicators_archived_by_id"` (the OLD name). If the helper returns the new name `..._archived_by_id_users`, treat as no-op (already migrated) and skip the drop. **v6.2 BIND-THREADING + 4-BRANCH GUARD:** After the SQLite early-return at line 26, add `bind = op.get_bind()`. Pass `bind` as the first positional arg to `_existing_fk_name(bind, table="key_risk_indicators", column="archived_by_id", ref_table="users")`. **KEEP the literal `op.drop_constraint("fk_key_risk_indicators_archived_by_id", ...)` call** — do NOT substitute the helper-returned `name` variable. Implement four explicit branches on the helper return value: (1) `name == "fk_key_risk_indicators_archived_by_id"` → execute the literal-name drop + create NEW; (2) `name == "fk_key_risk_indicators_archived_by_id_users"` → log "already migrated" and return (no-op); (3) `name is None` → log "OLD FK absent; creating NEW only" and skip drop, fall through to `op.create_foreign_key(...)`; (4) any other name → `raise RuntimeError(f"unexpected FK name on key_risk_indicators.archived_by_id → users: {name!r}; resolve manually")`. Update the verification test to add two parametrized cases: (a) inject a non-canonical FK name (e.g., `fk_kri_archived_by_temp`) and assert RuntimeError; (b) start from "OLD FK manually dropped, NEW FK absent" and assert the migration creates the NEW FK without raising. **🟡 v6.3 MARKER REQUIRED.** New test file MUST be marked pytestmark = [pytest.mark.contract, pytest.mark.postgres] at module scope. The _existing_fk_name helper uses pg_constraint (Postgres-only). Without the marker, the default 'not postgres' collection filter would still pick it up, drift the §7 count, and ImportError on SQLite. | New test under `tests/backend/pytest/migrations/test_rename_kri_archived_by_fk_idempotency.py` runs the migration TWICE: (1) clean run; (2) second run WITHOUT first-dropping the NEW FK — assert no exception is raised AND assert the post-state has exactly one FK (`..._archived_by_id_users`) on the `archived_by_id` column (NOT the old name, NOT both). Mutation: revert the rename-hazard guard → the second run drops the renamed FK → assertion "exactly one FK on the column" fails. | item 11 (soft — reuses inspector helper pattern) |
| 15 | FK-ordering on vendor-link-orphan precheck test | `tests/backend/pytest/migrations/test_vendor_link_orphan_precheck_red.py:18-20` | The orphan INSERT currently fails with a FK violation, masking the actual precheck assertion. Apply the following strategy with explicit SUPERUSER fallback: **Primary:** `SET session_replication_role = replica` before the INSERT, then reset to `origin` after INSERT so the migration code itself runs under normal constraint enforcement. **Fallback (if the test Postgres role lacks SUPERUSER):** drop and recreate the `vendor_risk_links.vendor_id` FK around the INSERT, OR convert that FK to `DEFERRABLE INITIALLY DEFERRED` for the duration of the fixture and reset afterwards. Detect SUPERUSER capability at fixture setup with `SELECT current_setting('is_superuser')` and branch accordingly. Document the chosen path in a test-module docstring. **🟡 v6.3 MARKER REQUIRED.** session_replication_role is Postgres-only; the test file MUST carry module-scope pytestmark = [pytest.mark.contract, pytest.mark.postgres]. | Re-run the targeted test: `cd backend && ./venv/bin/python -m pytest -q ../tests/backend/pytest/migrations/test_vendor_link_orphan_precheck_red.py --no-cov`. Expect green; expect no FK violation error in output. Manual mutation: drop the SUPERUSER from the test role → fallback path activates → test still passes. | item 11 (precheck behavior may shift after item 11 lands) |
| 16 | Tighten exception-type test on migration idempotency (FULL SCAFFOLD RESTRUCTURE v6) | `tests/backend/pytest/migrations/test_vendor_migration_idempotency_red.py:15-30` | **v6 restructure required, NOT a 1-line substring swap.** The current test wraps the migration call in `try/except Exception as exc: ... await conn.rollback()` (lines 17-22). If the inner code catches and rollbacks, NO exception escapes the try block — wrapping it in `pytest.raises(MigrationAlreadyAppliedError)` would silently false-pass (the `pytest.raises` would fail with "DID NOT RAISE", a misleading failure). Full restructure: (a) ensure the migration helper raises `MigrationAlreadyAppliedError` typed exception when re-application is detected (not a generic `OperationalError`); (b) DELETE the entire `try/except` scaffold at lines 17-22; (c) replace with `with pytest.raises(MigrationAlreadyAppliedError): await conn.run_sync(run_vendor_migration_upgrade)`; (d) handle rollback explicitly via `async with conn.begin() as txn:` context manager (auto-rollback on exception is safer than a manual `finally` block). The exception class `MigrationAlreadyAppliedError(ConflictError)` is added by P4A item 25 (with MANDATORY registry entry). Verify `MigrationAlreadyAppliedError` resolves to HTTP 409 + `audit_code="migration_already_applied"` per item 25's registry entry. | Test passes after items 25 and the migration helper update. Mutation: change the migration to raise generic `Exception` instead of `MigrationAlreadyAppliedError` → `pytest.raises` fails cleanly with type mismatch (NOT a silent false-pass). | P4A item 25 (defines `MigrationAlreadyAppliedError` AND its `EXCEPTION_REGISTRY` entry) |

**P2 verification gate:** `cd backend && ./venv/bin/python -m pytest -q ../tests/backend/pytest/migrations --no-cov` exits 0; the four new tests (idempotency-logging, dialect-parity, JSONB preflight, FK-drop idempotency) pass. If a Postgres lane is available, also run `make -f scripts/Makefile test-postgres-ci`.

**Future work pointer (out of scope for this remediation cycle):** 79 of 86 Alembic revision files lack `NotImplementedError` downgrade bodies — roughly 8% ADR-010 compliance. This is pre-existing scope and is not added as a new remediation item. Track as a separate hardening epic.

---

### 4.4 P3 — Capability contract cleanup (1 agent, sequential)

Single Opus subagent runs items 17–19 sequentially. The catalog-surface additions (item 18) must precede the typed-model conversions (item 19) so the catalog format is settled before the new list-capability surfaces are added.

| # | Title | File:line | Fix description | Verification step | Depends on |
|---|---|---|---|---|---|
| 17 | KRIHistoryCapabilities prose-reference convention (CORRECTED v6) | `docs/security/authorization-capability-contract.json:438` | 🟢 trivial / prose-only. The line in question is a PROSE description string, not a code-identifier reference. Verified content: `"backend/app/schemas/kri.py KRICapabilities and KRIHistoryCapabilities.can_request_correction"` — both classes are prose-shortened. **🔴 v6 FALSE-PREMISE FIX.** v5 prescribed appending `Read` to BOTH names; empirical verification at HEAD shows this is wrong. `class KRICapabilities` exists at `backend/app/schemas/kri.py:74` with **NO `Read` suffix** and is referenced by 5 production consumer files (`_monitoring_response.py`, `_authorization_capabilities/kris.py`, `schemas/kri.py`, `_kri_history/projection.py`, `_entity_mutation_lifecycle/projection.py`). `class KRICapabilitiesRead` does NOT exist anywhere in `backend/app/schemas/`. Only `KRIHistoryCapabilitiesRead` (at `kri.py:191`) legitimately carries the suffix. **Prescribed asymmetric edit (v6):** rewrite line 438 to `"backend/app/schemas/kri.py KRICapabilities and KRIHistoryCapabilitiesRead.can_request_correction"` — keep `KRICapabilities` bare, append `Read` ONLY to the history class. The validator currently passes regardless; this is an editorial alignment to match real class names. **Option B (rejected, much larger scope):** rename live `KRICapabilities` → `KRICapabilitiesRead` across 5 production files — that's a code refactor, not the prose-only item this is. | `python3 scripts/security/validate_authz_capability_contract.py` continues to exit 0. Spot-grep: `rg -n "KRICapabilities\b" backend/app/schemas/kri.py` returns the bare class definition; `rg "KRIHistoryCapabilitiesRead" docs/security/authorization-capability-contract.json` returns the corrected prose. | — |
| 18 | Add up to 11 missing surfaces to capability catalog | `docs/security/capability-catalog.json` | The previous list had naming bugs and double-counted `MeCapabilities` (already catalogued at `docs/security/capability-catalog.json:16-19`). **Step 1 — schema reconnaissance:** Read `docs/security/capability-catalog.json:1-50` first to confirm the entry-schema convention (surface IDs are snake_case string keys; each entry maps to a field list, not a class-name reference). **Step 2 — candidate verification:** for each of the 13 candidates below, run `rg -nl "class <ClassName>" backend/app/schemas/` and confirm existence. Candidates (line numbers approximate — re-verify each): (1) `RiskHubCapabilitiesRead` at `backend/app/schemas/riskhub.py:257`; (2) `RoleHubCapabilities` at `backend/app/schemas/riskhub.py:159`; (3) `DepartmentHubCapabilities` at `backend/app/schemas/riskhub.py:220`; (4) `RiskTypeCapabilities` at `backend/app/schemas/riskhub.py:34`; (5) `ApprovalScenarioCapabilities` at `backend/app/schemas/riskhub.py:125`; (6) `RiskQuestionnaireCapabilitiesRead` at `backend/app/schemas/risk_questionnaire.py:16` (note `Read` suffix); (7) `DashboardOverviewCapabilities` at `backend/app/schemas/dashboard.py:122`; (8) `ActivityLogCapabilities` at `backend/app/schemas/activity_log.py:28`; (9) `ApprovalRequestCapabilities` at `backend/app/schemas/approval_request.py:72`; (10) `UserDirectoryCapabilities` at `backend/app/schemas/user.py:172`; (11) `ControlExecutionListCapabilities` at `backend/app/schemas/execution.py:87`; (12) `AdminConsoleCapabilities` at `backend/app/schemas/admin.py:99` (verify exact line); (13) `KRIHistoryCapabilitiesRead` at `backend/app/schemas/kri.py:191`. **Step 3 — dedupe (DEFINITIVE per v5 empirical audit 2026-05-11, REVISED v6.3):** Add **exactly 11** new surface IDs. The v5 audit grep'd each candidate against the actual catalog and found only candidate (12) `AdminConsoleCapabilities` is already present (`docs/security/capability-catalog.json:216`, id `admin_console_capabilities`). The other 12 candidates have zero hits, but **v6.3 drops `risk_hub`**: `RiskHubCapabilitiesRead` is a composite container (6 nested `RiskHubPanelCapability` sub-objects) that cannot pass the per-row field validator at `scripts/security/authz_contract_validator/capability_catalog.py` (12 `*_field_missing` findings empirically). Defer to a separate follow-up item with nested-validator support; document via prose-only reference in the contract. The 11 new IDs to add (bare-noun convention matching the dominant pattern `risk`/`control`/`vendor`/etc., NOT the `_capabilities` suffix used by `admin_console_capabilities` and `me_capabilities`): `role_hub`, `department_hub`, `risk_type`, `approval_scenario`, `risk_questionnaire`, `dashboard_overview`, `activity_log`, `approval_request`, `user_directory`, `control_execution_list`, `kri_history`. Each entry MUST include `backend.path`, `backend.class`, `frontend.path`, `frontend.schema`, and the exhaustive `fields` list copied verbatim from the Pydantic class (Zod schema must exist before catalog merge; create it in the same PR if missing). **Step 4 — surface ID derivation:** derive each catalog key as snake_case of the class name minus the `Capabilities`/`Read` suffix (e.g. `KRIHistoryCapabilitiesRead` → `kri_history`; `RoleHubCapabilities` → `role_hub`; v6.3.1: prior `RiskHubCapabilitiesRead → risk_hub` example dropped because that surface fails validator per nested-panel composite). **Step 5 — write entries:** add one entry per surface ID mapping to the field list copied from the schema class. **Step 6 — validate:** re-run `python3 scripts/security/validate_authz_capability_contract.py`. If the validator FAILS after additions, the catalog format is stricter than expected — likely a stricter JSON schema in `docs/security/authorization-capability-contract.json`; resolve before continuing. <br><br>**Step 7 — Zod schema/path table (REQUIRED v6.2).** Each catalog entry's `frontend.path` + `frontend.schema` MUST resolve to a real `export const ...Schema`. Use this matrix (Surface ID / Backend Pydantic class / Frontend Zod schema path / Status): <br>• `risk_questionnaire` / `RiskQuestionnaireCapabilitiesRead` (`backend/app/schemas/risk_questionnaire.py:16`) / `frontend/src/services/api/schemas/workflow.ts:230` / EXISTS — REUSE existing `export const riskQuestionnaireCapabilitiesSchema` at workflow.ts:230 (v6.3.1: schema empirically verified `export const`; do NOT create parallel entities/riskQuestionnaire.ts file) <br>• `dashboard_overview` / `DashboardOverviewCapabilities` (`backend/app/schemas/dashboard.py:122`) / `frontend/src/services/api/schemas/entities/dashboard.ts:143` / EXISTS — PROMOTE to `export const dashboardOverviewCapabilitiesSchema` (currently bare const at dashboard.ts:143) <br>• `user_directory` / `UserDirectoryCapabilities` (`backend/app/schemas/user.py:172`) / `frontend/src/services/api/schemas/entities/identity.ts:62` / EXISTS — PROMOTE to `export const userDirectoryCapabilitiesSchema` <br>• `kri_history` / `KRIHistoryCapabilitiesRead` (`backend/app/schemas/kri.py:191`) / `frontend/src/services/api/schemas/entities/kris.ts:126` / EXISTS — PROMOTE to `export const kriHistoryCapabilitiesSchema` <br>• `role_hub` / `RoleHubCapabilities` (`backend/app/schemas/riskhub.py:159`) / `frontend/src/services/api/schemas/entities/roleHub.ts` / MISSING — create + export <br>• `department_hub` / `DepartmentHubCapabilities` (`backend/app/schemas/riskhub.py:220`) / `frontend/src/services/api/schemas/entities/departmentHub.ts` / MISSING — create + export <br>• `risk_type` / `RiskTypeCapabilities` (`backend/app/schemas/riskhub.py:34`) / `frontend/src/services/api/schemas/entities/riskType.ts` / MISSING — create + export <br>• `approval_scenario` / `ApprovalScenarioCapabilities` (`backend/app/schemas/riskhub.py:125`) / `frontend/src/services/api/schemas/entities/approvalScenario.ts` / MISSING — create + export <br>• `activity_log` / `ActivityLogCapabilities` (`backend/app/schemas/activity_log.py:28`) / `frontend/src/services/api/schemas/entities/activityLog.ts` / MISSING — create + export <br>• `approval_request` / `ApprovalRequestCapabilities` (`backend/app/schemas/approval_request.py:72`) / `frontend/src/services/api/schemas/entities/approvalRequest.ts` / MISSING — create + export <br>• `control_execution_list` / `ControlExecutionListCapabilities` (`backend/app/schemas/execution.py:87`) / `frontend/src/services/api/schemas/entities/executions.ts:46` / EXISTS — REUSE existing exported `executionListCapabilitiesSchema` at entities/executions.ts:46 (v6.3.2: schema empirically verified `export const`; identical can_export_csv field set; do NOT create parallel file, no promotion needed) <br><br>**Zod schema/path table (v6.3.2)** empirically verified across 11 surface IDs: **5 Zod schemas already exist** — 3 PROMOTE (bare `const` → `export const`): `userDirectoryCapabilitiesSchema` at `identity.ts:62`, `kriHistoryCapabilitiesSchema` at `kris.ts:126`, `dashboardOverviewCapabilitiesSchema` at `dashboard.ts:143`; 2 REUSE (already exported, use as-is): `riskQuestionnaireCapabilitiesSchema` at `workflow.ts:230` + `executionListCapabilitiesSchema` at `entities/executions.ts:46`. **6 schema files MUST be created** using the camelCase entities convention (`roleHub.ts`, `departmentHub.ts`, `riskType.ts`, `approvalScenario.ts`, `activityLog.ts`, `approvalRequest.ts`). Total: 5 EXISTS (3 PROMOTE + 2 REUSE) + 6 MISSING = 11. | `python3 scripts/security/validate_authz_capability_contract.py` exits 0. `rg "class.*Capabilities" backend/app/schemas/` cross-checked against catalog entries — every verified class has a corresponding surface ID in the catalog. Acceptance: exactly 11 new surface IDs present in `capability-catalog.json` (per the v6.3 revised list in Step 3 — `risk_hub` excluded) with documented field-list entries; validator exit code 0. | item 17 |
| 19 | Type list-response capabilities as proper Pydantic models | `backend/app/schemas/risk.py:213` (RiskListResponse); `backend/app/schemas/control.py:252` (ControlListResponse); `backend/app/schemas/kri.py:156` (KRIListResponse); `backend/app/schemas/vendor.py:122` (VendorListResponse); `backend/app/schemas/issue.py:250` (IssueListResponse) | All 5 cited lines verified — each currently reads `capabilities: dict[str, bool] \| None = None`. Replace each with a typed Pydantic model: `RiskListCapabilities(BaseModel)`, `ControlListCapabilities(BaseModel)`, `KRIListCapabilities(BaseModel)`, `VendorListCapabilities(BaseModel)`, `IssueListCapabilities(BaseModel)`. Each carries typed `can_export: bool` and `can_create: bool` fields. Update the parent `*ListResponse` model field annotation to `capabilities: <NewClass> \| None = None`. Catalog the 5 new classes in `capability-catalog.json` (extends item 18) under surface IDs `risk_list`, `control_list`, `kri_list`, `vendor_list`, `issue_list`. | `cd backend && ./venv/bin/python -m mypy app --no-error-summary` exits with 0 errors (ensures the new types compile cleanly). `python3 scripts/security/validate_authz_capability_contract.py` exits 0. Frontend authz invariant tests under `tests/frontend/unit/src/authz/` continue to pass: `cd frontend && npm test -- src/authz`. | item 18 |

**P3 verification gate:** `python3 scripts/security/validate_authz_capability_contract.py` exits 0; spot-grep (`rg -n "role_hub\|department_hub\|risk_type\|approval_scenario\|risk_questionnaire\|dashboard_overview\|activity_log\|approval_request\|user_directory\|control_execution_list\|admin_console\|kri_history" docs/security/capability-catalog.json`) (v6.3: risk_hub dropped — see item 18) confirms the 11 new surface IDs are present. Then `cd backend && ./venv/bin/python -m mypy app --no-error-summary` for the Pydantic typing extension introduced in item 19.

---

---

### 4.5 P4 — Architecture lock improvements (P4A) and new locks (P4B)

Two Opus subagents run in parallel. P4A tightens existing locks plus adds one exception class (items 20-25; item 20 DROPPED v6); P4B adds new architecture locks (items 26-32). They work on disjoint files.

### 4.5.1 P4A — Lock improvements + exception type (1 of 2 parallel agents)

Three tightening edits to existing architecture locks (items 21, 22, 23) plus one new exception class (item 25) (items 20, 24 DROPPED v6/v6.1). None of these add new lock files; the 182 architecture-only / 190 Makefile-target baseline is unchanged by P4A. The `MigrationAlreadyAppliedError` definition (item 25) is imported by P2
item 16, so item 25 must land before item 16 is verified.

Re-anchoring notes before the table:

- **Item 21** was framed in v2 as "replace substring with AST walk." Empirical
  triage shows the repo has **three** canonical auth idioms, not one. The v3
  fix accepts (1) `Depends(require_permission(resource, action))` (136
  occurrences across 53 endpoint files) and (2) `Depends(require_platform_admin)`
  (32 occurrences across 11 files in `endpoints/admin/`) as canonical, and
  allowlists idiom (3) — body-level `_require_*` helpers in 4 specific files
  (`vendor_reports.py`, `directory.py`, `access.py`, `orphaned_items.py`, 20
  occurrences total) — in `_auth_idiom_baseline.toml` with
  `expires_at = 2026-09-01`. The negative invariant is locked: no endpoint
  handler may inline-check `current_user.is_admin` or `current_user.role`
  without going through one of the three idioms.
- **Item 22** expands from 7 to **9** TOMLs. v2 missed `_naming_allowlist.toml`
  and `_endpoint_commit_allowlist.toml`. Six months from today (2026-05-11) is
  `2026-11-11`.
- **Item 23** drops 3 of v2's 8 files (none contained numeric magic) and keeps
  the 5 that genuinely do.
- **Item 25** places `MigrationAlreadyAppliedError` in the **existing**
  `backend/app/core/exceptions.py` as a `ConflictError` subclass, not a new
  `_migrations/exceptions.py` package. Smaller surface area; integrates with
  the existing `EXCEPTION_REGISTRY` projection.

| # | Title | File:line | Fix description | Verification step | Depends on |
|---|---|---|---|---|---|
| 20 | **DROPPED in v6 — FALSE-PREMISE.** ~~Remove tautological ceiling from W12 commit-ratchet test~~ | ~~`test_w12_riskhub_config_service_commit_ratchet_red.py:46`~~ | **v6 DROP rationale.** Empirical verification at HEAD shows line 46 (`assert len(commit_sites) <= 2`) is an INDEPENDENT ratchet, not redundant with line 45 (`assert commit_sites <= allowed`). Current `_allowlist_entries()` has exactly 2 entries; if a future PR added a 3rd, line 45 would still pass (commits ⊆ allowed) but line 46 would catch the count drift as a conscious-decision gate. Deleting the ceiling would silently allow unbounded commit-site growth. v5's "tautological" framing misreads the test. **Action: no-op — keep both assertions as documented ratchet.** | n/a (no change) | — |
| 21 | Auth idiom AST walk (3 canonical idioms + body-level allowlist; REFRAMED v6) | `tests/backend/pytest/architecture/test_w12_auth_idiom_ratchet_red.py:32` + **existing** `tests/backend/pytest/architecture/_auth_idiom_baseline.toml` | **v6 REFRAME.** Empirical at HEAD: the test is ALREADY `ast.walk`-based (uses `ast.walk`, `ast.Call`, `ast.If`), not substring. The existing `_auth_idiom_baseline.toml` already exists with two scalar keys `body_call_require = 12` and `inline_403 = 5` (NOT the 136/32/20 counts v5 prescribed). **Required actions:** (a) DELETE the existing `body_call_require` and `inline_403` keys from `_auth_idiom_baseline.toml` (they are different invariants than v6 prescribes); (b) replace with `body_level_allowlist = ["vendor_reports.py", "directory.py", "access.py", "orphaned_items.py"]` and `expires_at = "2026-09-01"`; **Atomicity (v6.2):** TOML key deletion (a) and AST classifier extension (c) MUST land in the same commit. If the TOML edit lands first, every CI run KeyErrors on the missing baseline keys. (c) extend the existing AST walk in `test_w12_auth_idiom_ratchet_red.py` to classify each route's auth idiom into one of three accepted categories — (1) `Depends(require_permission(resource, action))`, (2) `Depends(require_platform_admin)` for files under `endpoints/admin/`, (3) body-level `_require_*` helper calls in allowlisted files only. Reject any other pattern. Negative invariant: assert NO route handler body contains a top-level `if current_user.is_admin` or `if current_user.role ==` check outside the three idioms. **Empirical counts at HEAD** (for documentation only — not stored in TOML): `require_permission` ~136 occurrences across 53 files; `require_platform_admin` ~32; body-level `_require_*` ~20 across 4 allowlisted files. | `pytest tests/backend/pytest/architecture/test_w12_auth_idiom_ratchet_red.py -q` passes. Mutation: introduce a 5th body-level `_require_*` in a non-allowlisted file → lock fails naming the file and the idiom. Mutation: add `if current_user.is_admin: ...` to an endpoint body → lock fails naming the file and line. | — |
| 22 | Add `expires_at` to TOML allowlists (CORRECTED COUNT v6.2 — 8 (v6's 9th, `_auth_idiom_baseline.toml`, owned by item 21 at `2026-09-01`)) | `tests/backend/pytest/architecture/_archive_allowlist.toml`, `_bounded_context_adapters.toml`, `_bounded_context_cross_cutting.toml`, `_bounded_context_read_shape.toml`, `_bounded_context_workflow_pairs.toml`, `_bounded_context_write_side.toml`, `_naming_allowlist.toml`, `_endpoint_commit_allowlist.toml` | Add `expires_at = "2026-11-11"` as a TOP-LEVEL key to all eight allowlist TOMLs listed (the architecture-test dir has 12 TOMLs total, but 3 already use a PER-ENTRY `expires_at` convention and stay as-is — see v6 note below). **🟡 v6 PER-ENTRY CONVENTION NOTE.** The architecture-test dir actually contains 12 TOMLs. The three NOT in this item's scope — `_capabilities_all_allowlist.toml`, `_riskhub_config_service_commit_allowlist.toml`, `_vendor_governance_service_commit_allowlist.toml` — ALREADY use a per-entry `expires_at` convention inside `[[allowlist]]` arrays, consumed by tests via `entry["expires_at"]` (verified at `test_w12_riskhub_config_service_commit_ratchet_red.py:54`). Mixing top-level and per-entry conventions would conflict; the consumer-loader helper MUST handle both shapes. Pick one: either (a) keep the per-entry convention for those 3 and ONLY add top-level to the 8 (current item scope; `_auth_idiom_baseline.toml` owned by item 21), with a shared helper `assert_not_expired(toml_dict)` that checks `toml_dict.get("expires_at")` first then iterates `toml_dict.get("allowlist", [])` per-entry, OR (b) normalize all 12 to per-entry in a separate normalization commit before this item lands. Choose (a) for the scope of this item. **🟡 v6.3 Sub-step 0 (PREREQUISITE — create helper before any TOML edits):** The helper module tests/backend/pytest/architecture/_allowlist_expiry.py does NOT exist at HEAD. Create it with: 'from datetime import date; import tomllib; def assert_not_expired(toml_path): data = tomllib.loads(toml_path.read_text()); top = data.get("expires_at"); if top and date.fromisoformat(top) < date.today(): raise AssertionError(f"{toml_path}: top-level expires_at={top} elapsed"); for entry in data.get("allowlist", []): exp = entry.get("expires_at"); if exp and date.fromisoformat(exp) < date.today(): raise AssertionError(f"{toml_path} entry {entry!r}: expires_at={exp} elapsed")'. Then use the shared helper across all 8 TOMLs to avoid duplication. | `pytest tests/backend/pytest/architecture/ -q` passes. Mutation: set `expires_at = "2020-01-01"` in any one TOML → consumer lock fails with the expiry message and the TOML path. The 3 per-entry TOMLs continue to pass their existing tests unchanged. | item 21 (the existing `_auth_idiom_baseline.toml` gains the same `expires_at` convention) |
| 23 | Magic numbers in 5 lock tests → Pair TOML registries | `tests/backend/pytest/architecture/test_audit_adapter_emitter_helper_red.py:57`, `test_w7_bounded_context_disjointness.py:68`, `test_capability_catalog_includes_access_user_red.py:37`, `test_w12_resource_permissions_keys_match_capability_contract_red.py:60-69`, `test_audit_adapter_usage_red.py:12-16` | For each of the 5 tests, define a Pair `_<test>_baseline.toml` next to the test file and load the magic value at module import time. Mappings: (1) `_audit_adapter_emitter_helper_baseline.toml` → `expected_row_count = 37`; (2) `_w7_bounded_context_disjointness_baseline.toml` → `expected_disjoint_count = 32`; (3) `_capability_catalog_access_user_baseline.toml` → `expected_capability_count = 8`; (4) `_w12_resource_permissions_baseline.toml` → `expected_keys = [...8-tuple...]`; (5) `_audit_adapter_usage_baseline.toml` → `expected_routes = {route: action, ... 3 entries}`. Failure message MUST include the registry file path AND the key name so the on-call dev knows where to update. **Drop from v2's list**: `test_w12_issue_status_automation_lock_red.py:13` (name-set, not magic number), `test_w13_admin_subrouter_cluster_red.py` (no numeric magic), `test_endpoint_inline_pydantic_evicted_red.py` (no numeric magic). | `pytest <each-test> -q` passes. Mutation: change `expected_row_count` to `38` in the baseline TOML → corresponding lock fails with the message `"expected 38 audit-adapter rows per _audit_adapter_emitter_helper_baseline.toml::expected_row_count, found 37"`. | — |
| 24 | **DROPPED in v6.1 — FALSE-PREMISE.** ~~Frontend invariant filename guards (EXPANDED v6 — sibling test)~~ | ~~`tests/frontend/unit/src/authz/useAuthz.invariant.test.ts:19-21,28 (slice anchors at :17, :33)`; `tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.test.tsx`~~ | ~~Both `useAuthz.invariant.test.ts` lines currently match on file basename via a substring check. Tighten each to a full-path canonical match (e.g. `expect(callerPath).toBe('src/authz/useAuthz.ts')` rather than `expect(callerPath).toContain('useAuthz')`). This prevents a future `useAuthzMocks.ts` or similarly-named helper from accidentally satisfying the invariant. **v6 scope expansion**: the sibling `BusinessRouteGuards.test.tsx` also substring-matches `BusinessRoute` — tighten its assertion similarly to a full-path canonical match against `src/authz/routing/business.tsx` (or whatever the canonical path resolves to).~~ **DROPPED in v6.1 — FALSE-PREMISE.** Lines 19-21 in `useAuthz.invariant.test.ts` are content guards on policy.ts source code (`not.toContain('?? hasPermission(')`), NOT filename basename matches; no `callerPath` variable exists. Line 28 checks a code idiom literal `authz.can('read', 'issues')` — already canonical. Source paths at lines 16/25/32/39/43/44/55 are passed to `readFileSync` and ARE already full canonical relative paths. `BusinessRouteGuards.test.tsx` uses `vi.mock`, zero substring assertions on filenames. The "tighten basename substring to full-path canonical" prescription has no matching code in either file. **Action: no-op.** | n/a (no change) | — |
| 25 | `MigrationAlreadyAppliedError` exception class + MANDATORY registry entry (CORRECTED v6) | `backend/app/core/exceptions.py` (existing file — append class AND registry entry, do not create a new package) | Append a new class `class MigrationAlreadyAppliedError(ConflictError): """Raised when an alembic migration is re-applied. See ADR-010."""` to `backend/app/core/exceptions.py`. **🔴 v6 MANDATORY REGISTRY UPDATE.** Empirical verification: `_projection_for` at `backend/app/core/exceptions.py:79` uses `EXCEPTION_REGISTRY.get(type(exc), default)` — **exact-type lookup, NO MRO walk**. A bare subclass NOT registered would: (a) get HTTP 409 via the `getattr(exc_type, "status_code", 400)` class-attribute fallback (this works by accident), BUT (b) `audit_code` falls through to the default `"domain_error"` instead of `"migration_already_applied"` — corrupting audit telemetry. v5's "Optionally register" framing was wrong. **Required (not optional):** also add `MigrationAlreadyAppliedError: ExceptionProjection(status_code=409, retryable=False, audit_code="migration_already_applied")` to the `EXCEPTION_REGISTRY` dict in the SAME patch. **Do not** create `backend/app/services/_migrations/exceptions.py` (v2 plan) — that adds a package boundary for one class. The four offending migrations (item 16) import `from backend.app.core.exceptions import MigrationAlreadyAppliedError`. | `pytest -q tests/backend/pytest/test_global_config_usage.py` passes. `python -c "from backend.app.core.exceptions import MigrationAlreadyAppliedError, EXCEPTION_REGISTRY; assert MigrationAlreadyAppliedError in EXCEPTION_REGISTRY; assert EXCEPTION_REGISTRY[MigrationAlreadyAppliedError].audit_code == 'migration_already_applied'"` returns clean. Item 16's `pytest.raises(MigrationAlreadyAppliedError)` produces HTTP 409 with audit_code `"migration_already_applied"`, not `"domain_error"`. | Blocks P2 item 16 — item 25 must merge first. |

**Sequencing inside P4A:**

- Items 20, 24, 25 are fully independent and may land in any order.
- Item 21 introduces `_auth_idiom_baseline.toml`; item 22's `expires_at` sweep
  must include it once it exists. Land item 21 first, then item 22.
- Item 23 is independent of the others.

**P4A verification gate:** `make -f scripts/Makefile test-architecture-locks`
passes. The 182 architecture-only / 190 Makefile-target baseline is unchanged by P4A (these are tightening edits,
not new locks). The `MigrationAlreadyAppliedError` definition (item 25) is
imported by P2 item 16, so item 25 must land before item 16 is verified.

### 4.5.2 P4B — 7 new architecture locks (1 of 2 parallel agents)

Each new lock lives in `tests/backend/pytest/architecture/` as a `test_*_red.py`
file with `pytest.mark.contract`. Every test must have a negative assertion
that fails when the invariant is violated, and a brief docstring at the top
naming the BL section it enforces. The seven items below renumber and rewrite
items 31–38 of the original plan. **v3 reframings vs. v2:**

- **v2 item 33 collapsed into item 32.** v3 triage confirmed the bilateral
  guard already exists at `link_governance.py:160-163` (`controls:write` —
  stronger than v2's `controls:read` proposal). No code change needed; the
  lock alone suffices.
- **Item 26** is lock-only. The rejection seam exists at
  `backend/app/services/_issue_workflow/update_plans.py:20-24` (raises 409
  with detail "Use workflow endpoints to change issue status").
- **Item 27** asserts the canonical **closed set** `{"risk", "control", "kri"}`
  exactly, not "vendor/issue absent as a gap." Issues are governed by the
  workflow seam (item 26); vendors by `capability-catalog.json` design.
- **Item 28** pins the directional asymmetry as **intentional policy**
  (`_is_priority_downgrade` exists; `_is_priority_upgrade` must NOT exist).
- **Item 31** uses "visibility-clause / `require_permission` dependency"
  framing (the canonical scope-narrowing pattern for exports), not the
  ambiguous "scope-filter Depends" v2 language.

Two real-path notes carried over from v2: item 30 targets the singular file
`endpoints/access.py` (not `endpoints/access/users.py`); item 31 targets
`endpoints/reports/unified_exports/` (not `_reporting/exports/`).

| # | Title | New test file | BL ref | Fix description | Verification step |
|---|---|---|---|---|---|
| 26 | PATCH /issues service-layer status exclusion (lock-only; BROADENED AST v6) | `tests/backend/pytest/architecture/test_patch_issues_status_excluded_red.py` + `_patch_issues_status_seam.toml` | BL §11.1 line 850 | Use full `ast.walk` traversal (NOT a "first ~10 statements" scan — that's defeated by a future helper-extraction refactor) over `backend/app/services/_issue_workflow/update_plans.py` AND any sibling helper module matching `backend/app/services/_issue_workflow/_*.py`. Locate the function that consumes `updates: dict` — empirically `build_issue_update_plan` (lines 20-24 today, but use AST-walk to find by signature, not line range). Assert anywhere in that function (or extracted helpers) there exists an `If` node with test matching `Compare(left=Constant("status"), ops=[In()], comparators=[Name("updates")])` whose body raises `HTTPException(status_code=409, detail=<substring "Use workflow endpoints">)`. Pair TOML `_patch_issues_status_seam.toml` lists `(module_path, function_name, expected_substring)` — initial value: `("backend/app/services/_issue_workflow/update_plans.py", "build_issue_update_plan", "Use workflow endpoints to change issue status")`. **Do not** target `IssueUpdate.status` — it is intentionally declared on the schema for OpenAPI parity. | Test passes on current HEAD (seam exists at lines 20-24). Mutation 1: comment out the rejection block → lock fails naming the module path, the function, and the missing substring. Mutation 2: extract the rejection into a helper `_assert_status_not_in_update(updates)` and call it from `build_issue_update_plan` → lock STILL PASSES (broadened walk finds the helper). |
| 27 | SENSITIVE_FIELDS closed-set lock | `tests/backend/pytest/architecture/test_sensitive_fields_closed_set_red.py` + `_sensitive_fields_baseline.toml` | BL §6.1 lines 485–487 | Import `SENSITIVE_FIELDS` from `backend/app/core/_permissions/sensitive.py` (defined at lines 6-10). Assert `set(SENSITIVE_FIELDS.keys()) == {"risk", "control", "kri"}` **exactly** — no `vendor`, no `issue`, no additions. Then assert `SENSITIVE_FIELDS["risk"]` ⊇ `{owner_id, department_id, category, is_priority}` and `SENSITIVE_FIELDS["control"]` ⊇ `{control_owner_id, department_id}` and `SENSITIVE_FIELDS["kri"] == set()` (KRIs inherit sensitivity from linked risk per `sensitive.py:9` comment). Pair TOML `_sensitive_fields_baseline.toml` records the canonical key set + per-resource minimum fields. **Framing**: this is NOT a gap-fill (vendors and issues are intentionally excluded — issues via the workflow seam in item 26, vendors via `capability-catalog.json` design). It is a closed-set lock against accidental key additions. | Test passes on current HEAD. Mutation 1: add `"vendor"` to `SENSITIVE_FIELDS` → lock fails with `"unexpected sensitive resource 'vendor' in SENSITIVE_FIELDS — closed set is {risk, control, kri}"`. Mutation 2: remove `is_priority` from the `"risk"` entry → lock fails naming the missing field. |
| 28 | `is_priority` directional asymmetry — pin intentional policy | `tests/backend/pytest/architecture/test_is_priority_directional_asymmetry_red.py` | BL §6.4 lines 514–516 | AST-walk `backend/app/core/_permissions/sensitive.py` (where the policy lives — `_is_priority_downgrade` defined at line 49, with surrounding comments at lines 91-96 stating "Upgrades (false→true) are allowed without approval"). Assert: (a) `_is_priority_downgrade` is defined as a function in the module AND its body contains the pattern `Return(BoolOp(op=And, values=[Compare(left=Name(<old>), ops=[Is], comparators=[Constant(True)]), Compare(left=Name(<new>), ops=[Is], comparators=[Constant(False)])]))` where `<old>` and `<new>` resolve to the function's positional parameter names from its signature; parameter renames preserve the lock, structural deviation fails it; (b) `_is_priority_upgrade` is **NOT** defined anywhere in `backend/app/core/_permissions/`. Failure message for (b): `"unexpected symmetric upgrade helper _is_priority_upgrade detected — policy is downgrade-gated only (sensitive.py:91-96)"`. **Framing**: the asymmetry is policy, not a gap. The lock pins INTENT. | Test passes on current HEAD. Mutation: add an `_is_priority_upgrade(current, new)` helper to `sensitive.py` → lock fails with the message above. |
| 29 | Self-approval prevention (accept tier-based check; D1-PLACEMENT CORRECTED v6) | `tests/backend/pytest/architecture/test_self_approval_prevention_red.py` | BL §5.4 line 451 | AST-walk for the canonical pattern `tier.is_requester` in `backend/app/services/_approval_execution/authorization.py:30` AND the assignment `is_requester=approval.requested_by_id == user.id` in `backend/app/services/approval_scenario_policy.py:171` (note: file lives at services root, NOT under `_approval_execution/`). Assert both exist. **Cross-reference D1 HARDEN item 5 (corrected v6)**: D1 adds a guard at the TOP of `user_matches_approval_scenario_role` (after the `roles is None` short-circuit, around lines 126-127), NOT at line 131. The v5 wording "at `approval_scenario_policy.py:131`" was misleading — line 131 is the `RISK_OWNER_APPROVER_ROLE` branch, which is only ONE of two branches; D1's top-of-function guard covers BOTH (the `role_name in roles` path on line 129 AND the `RISK_OWNER` branch on line 131). The lock AST-pattern must search for an `If` node with test `Compare(Attribute("approval", "requested_by_id"), Eq, Attribute("user", "id"))` and body `Return(Constant(False))` IMMEDIATELY after the `if roles is None` short-circuit, NOT at literal line 131. If D1 item 5 has not yet shipped, item 29 lands asserting only the two empirically-present sites (authorization.py:30 and approval_scenario_policy.py:171) and is amended in a follow-up commit once D1 item 5 ships. | Test passes after D1 item 5 lands (or on current HEAD with the 2-site assertion). Mutation: remove the `tier.is_requester` raise from `authorization.py:30` → lock fails naming `authorization.py`, the function, and the missing `tier.is_requester` reference. Mutation post-D1: remove the top-of-function guard → lock fails citing the missing `if approval.requested_by_id == user.id: return False` pattern. |
| 30 | PATCH /access/users binding (body-level auth, single file) | `tests/backend/pytest/architecture/test_patch_access_users_binding_red.py` + `_access_management_endpoints.toml` | BL §1.4 line 114 | AST-walk `backend/app/api/v1/endpoints/access.py` (singular file, no subdirectory). Locate the `@router.patch("/users/{user_id}", response_model=AccessUserRead)` route declared at line 190. Assert the function body contains a call to `_require_privileged(current_user)` (line 205) **AND** `_require_access_user_write(current_user)` (line 206) — both are body-level guards, not `Depends(...)`. Then assert the resolved guards permit only Admin OR CRO via static inspection of their definitions in the same module. Pair TOML `_access_management_endpoints.toml` lists `(route_path, method, expected_body_guards)` as the registry. Do **not** target `endpoints/access/users.py` — that path does not exist. | Test passes on current HEAD. Mutation: remove `_require_privileged(current_user)` from the PATCH body → lock fails with `"PATCH /users/{user_id} missing body-level auth guard _require_privileged"`. |
| 31 | Export endpoint visibility-clause / dependency lock | `tests/backend/pytest/architecture/test_export_endpoint_scope_filter_red.py` + `_export_endpoint_baseline.toml` | BL §10.3 | AST-walk `backend/app/api/v1/endpoints/reports/unified_exports/` (real path). For each function decorated with `@router.get` or `@router.post`, assert the signature's `Depends(...)` set includes `Depends(require_permission("reports", "read"))` — visible at `unified_exports/routes.py:37`. The `require_permission` dependency IS the canonical visibility-clause / scope-narrowing pattern for exports; v2's mention of a separate "scope-filter Depends" was wrong. Pair TOML `_export_endpoint_baseline.toml` lists `(route_path, method, expected_dependencies)` pairs. | Test passes on current HEAD. Mutation: drop `Depends(require_permission("reports", "read"))` from any one export route → lock fails naming the route, the method, and the missing dependency. |
| 32 | Bilateral access on POST /risks/{id}/controls (service-layer lock-only; FRAMING CORRECTED v6) | `tests/backend/pytest/architecture/test_post_risks_controls_bilateral_access_red.py` + `_risk_control_link_governance_baseline.toml` | BL §7.3 lines 562–564 | AST-walk `backend/app/services/_control_execution/link_governance.py`. Locate `create_risk_control_link` (lines ~155-170). Assert its body contains **both** calls: (a) `assert_risk_writable_for_link(... allow_direct_owner=False)` at line 160, and (b) `assert_control_writable_for_link(...)` at line **163** (NOT 162 as v5 said). **🟡 v6 FRAMING CORRECTION.** v5 claimed "they enforce `controls:write`" — empirically WRONG. `assert_control_writable_for_link` at `backend/app/services/_control_execution/access.py:50-52` checks `is_control_owner` + `check_department_access` (ownership-OR-department), NOT a capability `check_permission(..., "controls", "write")`. The guards are **two-layer**: capability gate at the endpoint (`risks:write` from the route Depends) PLUS ownership+department checks in the service. The lock is still valid (pins the calls), but the audit prose mischaracterizes the guard semantics. Pair TOML `_risk_control_link_governance_baseline.toml` records the canonical assert-pair: `[create_risk_control_link]` → `required_calls = ["assert_risk_writable_for_link", "assert_control_writable_for_link"]`, `forbidden_kwargs = ["allow_direct_owner=True"]` (must remain `False`). **v2 item 33 collapsed into this item.** | Test passes on current HEAD. Mutation 1: remove `assert_control_writable_for_link(...)` from `create_risk_control_link` → lock fails naming the function and the missing call. Mutation 2: flip `allow_direct_owner=False` to `True` → lock fails citing the forbidden kwarg. |

**Dropped from original P4B:** v2 item 35 (issue-read 404-not-403 anti-leakage
lock). Empirical verification: `backend/app/services/_issue_workflow/loading.py:53,55,62,64`
already raises only `404` on unauthorized-or-not-found paths — no `403` leaks
today. Adding a lock here would be a regression guard with no current gap;
carry the invariant forward as a one-line "covered" note in P6 verification.

**Also dropped from v2:** v2 item 33 ("Lock: bilateral access on POST
/risks/{id}/controls — depends on item 32"). The guard already exists in
`link_governance.py` and v3 item 32 covers the lock alone — no separate
code-change item is needed.

**Sequencing inside P4B:**

- Items 26, 27, 28, 30, 31, 32 are independent and may land in any order.
- Item 29's coverage of `approval_scenario_policy.py:131` depends on D1 HARDEN
  item 5 landing first; if D1 item 5 has not yet shipped, item 29 lands
  asserting only the two empirically-present sites (lines 30 and 171), and is
  amended in a follow-up commit once D1 item 5 ships.

**P4B verification gate:** `make -f scripts/Makefile test-architecture-locks`
passes. Lock count rises from the **190** collected baseline (Makefile target — `tests/backend/pytest/architecture/` directory + `test_w0_harness_contract_red.py`) to **197** (P4B
adds **7** net new lock files: items 26, 27, 28, 29, 30, 31, 32 — one per
item, since item 32 is lock-only and v2 item 33 is dropped). Manual sanity
check: for at least 2 of the 7 new locks, introduce a synthetic violation and
confirm the lock fails with a clear message. Confirm `make -f scripts/Makefile
test-architecture-locks` count line reads `197 passed` (or `197 collected`).

---

---

### 4.6 P5 — BL doc drift + frontend + Makefile wrapper

P5 is the final fix phase. It splits into two parallel sub-phases:

- **P5A** (items 33-37; item 34 DROPPED v6): BL doc drift in `docs/BUSINESS_LOGIC.md`. Doc-only;
  no application code touched.
- **P5B** (items 38-40): Frontend `LinkedVendorSummary.status` finish,
  AuthContext intent comment, and the `make lint-types` Makefile wrapper.

P5A and P5B are independent and may be dispatched in parallel.

#### 4.6.1 P5A — BL doc drift (items 33, 35-37, parallel-1; item 34 DROPPED v6)

Edit `docs/BUSINESS_LOGIC.md` to reconcile five drift items surfaced by
Rounds 1-3. All edits are doc-only; no code, locks, or schemas change.

| # | BL section | Drift | v3 fix |
|---|---|---|---|
| 33 | §8.2 line 596 + §2.4 line 252 (EXPANDED v6) | "soft-delete" used in archive description AND "Soft delete flag" on Departments | Replace "soft-delete" with "archive" vocabulary on line 596; cite ADR-005 inline. **v6 scope expansion**: BL line 252 (Department `is_active` row) also reads "Soft delete flag" — but Departments don't use the Archivable mixin (no `is_archived/archived_at/archived_by_id`). Reword to "Active flag (Departments use `is_active` for soft-delete; not the Archivable mixin)" to disambiguate from the post-Wave-8 archive vocabulary. |
| 34 | **DROPPED in v6 — FALSE-PREMISE.** ~~§8.3 line 617-618~~ | ~~"restore-pending" state implied but not defined~~ | **v6 DROP rationale.** `rg "restore.pending\|restore pending\|pending.restore" docs/BUSINESS_LOGIC.md` returns 0 matches. §8.3 lines 605-621 describes restore as a single-step terminal operation (`status='active'` / `is_archived=false`, clear archive metadata) — no two-step pending workflow exists. Executing as-written would WRITE a fabrication into BL §8.3. **Action: no-op — restore is immediate by contract; nothing to define.** If a multi-step restore workflow is desired, file a separate BL design proposal. |
| 35 | §8.3 line 620 | Vendor restore clarification cross-refs a non-existent path | Update wording: ``` `status='active'` alias appears only in tabular CSV exports synthesized at `backend/app/services/_reporting/exports/`, not in REST responses.``` |
| 36 | §1.4 line 114-116 (CORRECTED v6 — real field names) | "5 capabilities" stale (schema now defines 7) | **🔴 v6 FABRICATION FIX.** v5 prescribed fictional CRUD-style names (`can_view, can_update_self, can_update_admin, can_delete, can_disable, can_unlock, can_break_glass_enable`) — only `can_break_glass_enable` matched reality. Empirical at HEAD: `AccessUserCapabilities` at `backend/app/schemas/access.py:66-72` defines exactly these 7 fields verbatim: `can_edit_identity`, `can_edit_business_access`, `can_edit_role`, `can_deactivate`, `can_change_active_status`, `can_break_glass_enable`, `can_revoke_sessions`. BL §1.4 line 116 currently lists 5 (omits `can_change_active_status` and `can_break_glass_enable`). **Prescribed edit:** update BL line 116 to enumerate all 7 schema fields verbatim and bump the "5 capabilities" count to 7. Cite ADR-001 (capability contract is backend-authoritative). |
| 37 | §11.5 line 915 (v6.3.2 retarget — insert, don't overwrite) | "Vendor inactive ≡ archived" semantic equivalence is implicit at the issue-link enforcement seam but never stated inline. Empirical: literal phrase does not exist in BL (`grep -n "inactive ≡ archived" docs/BUSINESS_LOGIC.md` → 0 hits); current line 915 reads `"Inactive vendors cannot be used as contextual issue sources or added as issue vendor links; callers must restore the vendor first."` — the inactive-vendor enforcement is correctly stated, but the §10.5 archive-equivalence is not annotated at the issue-link seam where D2 governs. | **🟡 v6.3.2 INSERT, DO NOT OVERWRITE.** The v6 Fix text "vendor `is_archived=True` is the single authoritative inactive flag; `status` column is dropped" would replace the issue-link-source policy with a flag-semantics statement that already lives at `BL §10.5:798` (`"Vendors: archived semantics use is_archived"`). The correct edit is to annotate the equivalence inline by INSERTING a parenthetical into the existing sentence, preserving the issue-link policy intact: `"Inactive vendors cannot be used as contextual issue sources or added as issue vendor links **(inactive ≡ archived per §10.5; status column is dropped)**; callers must restore the vendor first."` Do NOT delete the existing sentence. (D2 partner — code comment in item 8 cites this section.) Verification grep: `grep -n "inactive ≡ archived per §10.5" docs/BUSINESS_LOGIC.md` returns exactly the §11.5:915 hit; `grep -n "Inactive vendors cannot be used" docs/BUSINESS_LOGIC.md` STILL returns the §11.5:915 hit (sentence preserved). |

**Item 35 details — critical anchor correction.**

The v2 plan cited
`backend/app/services/reports/unified_exports/` as the tabular-CSV
synthesis path. That path **does not exist**. The synthesis actually
lives in the `_reporting/exports/` package:

- `backend/app/services/_reporting/exports/filters.py:57,63` —
  synthesizes `row["status"] = "archived" if bool(row.get("is_archived")) else "active"`.
- `backend/app/services/_reporting/exports/rows.py:120` — synthesizes
  `"status": "archived" if vendor.is_archived else "active"`.

The BL §8.3 clarification text MUST anchor on `_reporting/exports/` (not
the non-existent `reports/unified_exports/`). The v2 anchor was the
critical hazard that the v3 triage caught.

**Verification gates (P5A):**

- `rg -n "soft-delete|restore-pending|reports/unified_exports|5 capabilities" docs/BUSINESS_LOGIC.md`
  returns zero matches once items 33, 34, 35, 36 land.
- `rg -n "_reporting/exports" docs/BUSINESS_LOGIC.md` returns the new
  item 35 reference (one or more hits).
- Manual review of §8.2, §8.3, §1.4, §11.5 confirms no §X.Y line-anchor
  drift introduced.

#### 4.6.2 P5B — Frontend + Makefile wrapper (items 38-40, parallel-2)

P5B item 38 covers FOUR frontend sites + migration doc (sibling test caught in v3). P5B contains three independent fixes. Items 38-40 below.

| # | Title | File:line | Fix description | Verification | Depends on |
|---|---|---|---|---|---|
| 38 | Wave 8 #77b finish — FOUR sites + migration doc (D3) | `frontend/src/services/api/schemas/entities/vendors.ts:9`; `frontend/src/types/vendorLink.ts:11`; `tests/frontend/unit/src/services/api/schemas/__tests__/vendors.statusOptional.lookup.test.ts`; `tests/frontend/unit/src/services/api/schemas/__tests__/vendors.statusOptional.test.ts`; `docs/migrations/vendor-status-removal.md:7` | (a) Delete `status: z.string().nullable().optional(),` from `linkedVendorSummarySchema` at `vendors.ts:9`. (b) Delete `status?: string \| null;` from `LinkedVendorSummary` at `vendorLink.ts:11`. (c) DELETE the entire file `vendors.statusOptional.lookup.test.ts`. (d) DELETE the entire file `vendors.statusOptional.test.ts` (sibling that v2 missed; asserts pre-migration soft-tolerance for `vendorSchema.status` no longer in scope). (e) Update `vendor-status-removal.md:7` from "Post-migration: Wave 8 item #77b removes the frontend field entirely." to "Completed: Wave 8 item #77b removes the frontend field entirely (date to fill on commit)." (f) Update `tests/frontend/unit/src/services/api/schemas/__tests__/README.md` Contents list to remove the two deleted test entries `vendors.statusOptional.lookup.test.ts` and `vendors.statusOptional.test.ts` so the directory README no longer references the deleted files. | `rg "linkedVendor\.status\|LinkedVendorSummary[^a-zA-Z0-9_].*status" frontend/ tests/frontend/` returns zero matches. `cd frontend && npx tsc --noEmit && npm run lint` exit 0. | — |
| 39 | AuthContext intent comment (D4 Option B) | `frontend/src/contexts/AuthContext.tsx:41-59` | Add a single intent comment immediately above the `useAuth` function at line 41 documenting why the consolidated context shape is preserved (vs. a narrow-hook facade). The comment cites: render isolation is fine at today's call-site density; if a future high-frequency consumer needs isolation, migrate that consumer only. No application logic changes. | `cd frontend && npx tsc --noEmit && npm run lint` exit 0. | — |
| 40 | `make lint-types` Makefile target (D5 residual) | `scripts/Makefile` (add target adjacent to `lint-backend`) | Add a `lint-types:` target adjacent to `lint-backend` that invokes `cd backend && ./venv/bin/python -m mypy --config-file mypy.ini app`. Local-dev convenience only; mypy CI step is already wired at `.github/workflows/lint.yml:69-73`. Do NOT add a duplicate CI step. | `make -f scripts/Makefile lint-types` exit 0. | — |

#### 4.6.3 P5 verification gate

After both P5A and P5B land:

- `cd frontend && npx tsc --noEmit && npm run lint` exits 0.
- `make -f scripts/Makefile lint-types` exits 0.
- Manual review of `docs/BUSINESS_LOGIC.md` confirms items 33, 35-37 reconciled (item 34 DROPPED v6).
- `rg "linkedVendor\.status|LinkedVendorSummary[^a-zA-Z0-9_].*status" frontend/ tests/frontend/` returns zero matches.

---

### 4.7 P6 — Re-audit (3 rounds × Opus subagents)

After all P0-P5 fixes land, re-run the proven 3-round adversarial pattern.
Parallel dispatch within each round; sequential rounds. The orchestrator
synthesizes at the end.

#### 4.7.1 Round 1 (5 parallel Opus subagents)

| Agent | Domain | Inputs | Outputs |
|---|---|---|---|
| R1-A | Backend services + endpoints | Verify items **3-10** fixes in current HEAD; cross-check BL §X.Y references | 🔴/🟡/🟢/🔵/✅ per finding with `file:line` + ≤15-word quote |
| R1-B | Architecture locks + allowlists | Read `tests/backend/pytest/architecture/` and `*_allowlist.toml`; verify items **21-32 except 24** (items 20, 24 DROPPED v6/v6.1) | 🔴/🟡/🟢/🔵/✅ per finding |
| R1-C | Capability contract | Read `docs/security/authorization-capability-contract.{md,json}` and `capability-catalog.json`; verify items **17-19**; run `validate_authz_capability_contract.py` | 🔴/🟡/🟢/🔵/✅ per finding |
| R1-D | Migrations | Read `backend/alembic/versions/` and `tests/backend/pytest/migrations/`; verify items **11-16** | 🔴/🟡/🟢/🔵/✅ per finding |
| R1-E | Frontend + Makefile | Read `frontend/src/` and `scripts/Makefile`; verify items **38-40** (38=Wave 8 #77b finish, 39=AuthContext intent comment, 40=`make lint-types` target); run `tsc`, `eslint`, and `make lint-types` | 🔴/🟡/🟢/🔵/✅ per finding |

#### 4.7.2 Round 2 (5 parallel Opus subagents — adversarial)

Each Round 2 agent is briefed: **"Round 1 produced false flags. Verify
each finding by reading the current file. Add new findings missed by
Round 1."**

| Agent | Focus |
|---|---|
| R2-A | Cross-reference integrity sweep across all R1 findings + BL ↔ ADR ↔ schema cross-references |
| R2-B | Security adversarial deep-dive: authz, capability contract, sensitive fields, PII flows, leakage paths |
| R2-C | Migration safety adversarial: forward-only (ADR-010), idempotency, FK ordering, dialect parity |
| R2-D | Test-lock soundness: manual mutation tests on ≥3 locks |
| R2-E | Empirical cheap-gate runner: `ruff`, `mypy`, `tsc`, `eslint`, lock suite, authz validator |

#### 4.7.3 Round 3 (4 parallel Opus subagents — heavy gates + verification)

| Agent | Focus |
|---|---|
| R3-A | Full backend pytest in the current checkout with NEW-vs-PRE-EXISTING classification. Capture `git status --short` before and after the run. Do **not** run `git stash`, `git stash pop`, or `git worktree add` unless the orchestrator explicitly authorizes that isolation step in chat. If the tree is too dirty for reliable classification, stop and report the blocker instead of changing git state. |
| R3-B | mypy + frontend tsc + R2-E gate fixup analysis |
| R3-C | Postgres + release-parity + leak audit (skip cleanly if env unavailable) |
| R3-D | Adversarial verification of R2 verdicts |

**Synthesis:** orchestrator writes the final P6 report.

**Acceptance criterion for P6:** zero 🔴 findings; all **37 active items**
resolved; items 20, 24, and 34 documented as dropped false-premise; all
P0-P5 fixes verified intact; BL drift items 33, 35-37 land cleanly with no
§X.Y inconsistency.

---

## 5. Verification Gates per Phase

| After phase | Gates to run | Expected result |
|---|---|---|
| P0 | `make -f scripts/Makefile lint-backend`; `docs-topology-consistency`; `validate_public_repo_hygiene.py` | All exit 0; hygiene ≤ 0 findings |
| P1 | `cd backend && ./venv/bin/python -m pytest -q -m "not postgres and not benchmark" --no-cov` | ≥ **2016** collected (2009 baseline + 7 new tests for items 3, 4, 5, 6, 7, 9, 10); 0 failed |
| P2 | `cd backend && ./venv/bin/python -m pytest -q ../tests/backend/pytest/migrations --no-cov`; if env available also `make test-postgres-ci` | Migration tests pass; idempotency/preflight tests pass; postgres lane green if `TEST_DATABASE_URL` set |
| P3 | `python3 scripts/security/validate_authz_capability_contract.py` | Items 17 (rename) + 18 (11 catalog surfaces — v6.3 cascade: risk_hub dropped) + 19 (5 typed list-capability classes) all resolved |
| P4 | `make -f scripts/Makefile test-architecture-locks` | Exit 0; lock count **190 → 197 (Makefile target; `tests/backend/pytest/architecture/` alone is 182 → 189)** (7 net new: items 26, 27, 28, 29, 30, 31, 32). Manual mutation triggers clear failure on ≥2 of the new locks |
| P5 | `cd frontend && npx tsc --noEmit && npm run lint`; `make -f scripts/Makefile lint-types`; `rg "soft-delete\|restore-pending\|reports/unified_exports\|5 capabilities" docs/BUSINESS_LOGIC.md` | All exit 0; rg returns zero matches across the four stale-vocabulary tokens |
| P6 | All gates from R2-E + R3-A/B/C; full pytest, mypy, tsc, eslint | Pytest exit 0; mypy exit 0; tsc exit 0; eslint exit 0; all P0-P5 phase gates re-run exit 0; zero 🔴 findings |

---

## 6. Rollback Plan

If any phase introduces a regression that can't be fixed within 30 minutes:

1. **Identify the failing change** via `git log --oneline <phase-start>..HEAD`.
2. **Revert that change** with `git revert <commit>` (do NOT force-push
   or `git reset`; everything stays committed for audit trail).
3. **Re-run the phase verification gates** to confirm rollback restored
   green state.
4. **Re-dispatch the phase agent** with the failure context baked in.
5. **Document the failure mode** in this plan's "Known Issues" section
   so P6 re-audit checks for it.

### 6.1 Critical execution hazard protocol

Any agent dispatch that hits a 🔴 critical execution hazard (wrong file
path, wrong attribute name, wrong module location) MUST **abort and
report to the orchestrator BEFORE re-trying with a corrected anchor**.
The v3 triage corrected **11** such hazards from the v2 plan:

- D1 wording: `requested_by_id` (NOT `requester_id`).
- Item 8 anchor: `backend/app/services/_issue_register/source_mutation.py:42`
  (NOT `contextual.py`, which does not exist).
- Item 25 placement: `backend/app/core/exceptions.py` subclass of
  `ConflictError` (NOT a new `_migrations/` package — that package does
  not exist).
- Item 26 framing: lock-only against the existing seam at
  `backend/app/services/_issue_workflow/update_plans.py:20-24` (the seam
  already exists; no new service code).
- Item 32 framing: lock-only against the service-layer guard at
  `backend/app/services/_control_execution/link_governance.py:160-163`
  (bilateral guard is service-layer-only; no endpoint code change
  needed; v2 collapsed items 32+33 into single item 32).
- Item 35 cross-ref path: `backend/app/services/_reporting/exports/`
  (NOT `reports/unified_exports/`, which does not exist).
- Item 38 sibling test: 4 frontend sites (NOT 3); the sibling
  `vendors.statusOptional.test.ts` must also be deleted.
- Item 23 list: 5 magic-number tests (NOT 8).
- Item 22 TOML count: 8 allowlists (NOT 7; v6.2 corrected).
- Item 5 guard placement: top-of-function guard (NOT a conjunction
  appended to line 131).
- Item 3 rescope: swap `Depends(require_platform_admin)` for
  `Depends(require_permission)` + register `admin:session.revoke` in
  `RBAC_PERMISSIONS` (`backend/app/db/rbac_seed_contract.py`) and the
  AUTHZ-AUTH-SESSION row of the authorization contract. **v6.3.1: NOT in
  `docs/security/capability-catalog.json`** — that file catalogs Pydantic
  capability surfaces, not RBAC permission tuples (would emit `*_field_missing`
  findings). Wrap endpoint with explicit admin-role assertion per item 3 main row.

If an agent encounters a stale anchor it must **NOT silently invent a
substitute**. Stop, report, await re-anchored instructions.

### 6.2 Item-level dependency graph (v5 — added 2026-05-11)

Per the v5 empirical dependency audit, the following blockers and orderings apply across phases:

**Hard blockers (item X cannot start until item Y completes):**

| Blocked item | Blocker | Reason |
|---|---|---|
| 2 | 1 | `docs-topology-consistency` fix runs after `git rm --cached` untracks the `_context/*.md` cluster |
| **16** | **25** | **🔴 Cross-phase blocker.** P2 item 16's test imports `MigrationAlreadyAppliedError`, which is defined by P4A item 25. If P-phases run in numerical order, item 25 must be PROMOTED to run before P2, OR item 16's test must be marked `xfail`/`skip` until item 25 lands. |
| 18 | 17 | Catalog surface additions depend on settled prose-convention from item 17 |
| 19 | 18 | Typed `*ListCapabilities` Pydantic models extend the catalog surfaces added by item 18 |
| 22 | 21 | Item 22 sweeps `expires_at` across 8 TOMLs (v6.2), one of which (`_auth_idiom_baseline.toml`) is mutated by item 21 |
| All P6 | All P0-P5 | Re-audit acts on landed fixes only |

**Soft dependencies / ordering preferences:**

| Item | Lands after | Reason |
|---|---|---|
| 7 | 6 | Canonical `APPROVER_ROLES` constant lives in the same module hardened by item 6 (`approval_scenario_roles.py`) |
| 8 | 37 | Code comment cites BL §11.5; clearer if doc clarification lands first |
| 14 | 11 | Reuses `_existing_fk_name` inspector pattern from item 11's sibling migration |
| 15 | 11 | Orphan-precheck fixture behavior may shift after item 11 hoists the precheck |
| 29 | 5 | Item 29 explicitly pins D1's top-of-function guard at `approval_scenario_policy.py` (D1 places guard at top, not literal line 131; v6 corrected) — item 26 is NOT related to D1 (item 26 pins `_issue_workflow/update_plans.py`, separate seam) |

**Cross-item code-touch (merge-conflict hotspots; serialize within an agent):**

| Items | Shared file / area |
|---|---|
| 5, 7, 29 | `approval_scenario_policy.py` + `_riskhub_config/approval_scenario_roles.py` |
| 6, 7 | `_riskhub_config/approval_scenario_roles.py` |
| 11, 14, 15 | Sibling alembic migrations + orphan-precheck fixture |
| 16, 25 | `core/exceptions.py` ↔ migration idempotency test |
| 18, 19 | `docs/security/capability-catalog.json` (sequential edits) |
| 21, 22 | `_auth_idiom_baseline.toml` |
| 26, 37, 8 | BL §11.5 ↔ `source_mutation.py:42` ↔ `update_plans.py:20-24` |

**Recommended execution order:**

1. P0 — item 1 → item 2 (serial)
2. **P4A item 25 PROMOTED** — define `MigrationAlreadyAppliedError` in `core/exceptions.py` before P2 starts
3. P1 — Agent A (3 → 4 → 5 → 6 → 7), Agent B (8 → 9 → 10), Agent C (regression tests) in parallel
4. P2 — items 11 → 14 → 15 → 12 → 13 → 16 (item 16 now unblocked)
5. P3 — items 17 → 18 → 19 (strict serial)
6. P4A remaining — item 21 → item 22 (item 23 standalone; items 20, 24 DROPPED v6/v6.1)
7. P4B — items 26, 27, 28, 30, 31, 32 in parallel; item 29 may run in parallel with 26-32 as long as P1 Agent A (which contains item 5) has completed
8. P5A — items 33, 35-37 in parallel (item 34 DROPPED v6)
9. P5B — items 38 → 39 → 40 (serial within one agent)
10. P6 — re-audit

### 6.3 Known Issues (populated during execution)

> *No known issues recorded yet — execution has not begun.*

---

## 7. Acceptance Criteria (final "done" definition)

All of the following MUST hold before declaring the audit remediation complete:

- [ ] All **37 active items** resolved (items 20, 24, and 34 dropped per v6/v6.1 — false-premise; document the drops in the execution-trail rather than producing fixes).
- [ ] `make -f scripts/Makefile lint-backend` exits 0.
- [ ] `make -f scripts/Makefile test-architecture-locks` exits 0;
      collected lock count is **197** (190 Makefile-target baseline + 7 net new); architecture-only directory baseline remains 182 → 189.
- [ ] `cd backend && ./venv/bin/python -m pytest -q -m "not postgres and not benchmark"`
      collected ≥ **2025** (2009 baseline + 7 P1 regression tests for items 3,4,5,6,7,9,10 + 2 P2 non-postgres tests for items 11, 12 + 7 P4B lock files for items 26-32); 0 failed; coverage ≥ 69%. Note (v6.3): items 13, 14, 15 add `pytest.mark.postgres`-marked tests deselected by the `not postgres` filter; item 16 restructures an existing postgres-marked test with no net add. Per §4.3 v6.3 amendments, items 14 AND 15 MUST carry module-scope `pytestmark = [pytest.mark.contract, pytest.mark.postgres]`. If item 14 is left unmarked, expect 2026; if both 14 AND 15 unmarked, expect 2027; if all 3 of item 14's cases unmarked, expect 2028. Verify exact count empirically before P6 sign-off — pinned expectation is 2025.
- [ ] `make -f scripts/Makefile lint-types` exits 0.
- [ ] `cd frontend && npx tsc --noEmit && npm run lint` exits 0.
- [ ] `python3 scripts/security/validate_authz_capability_contract.py`
      passes with items 17 (KRIHistoryCapabilities rename), 18 (11
      catalog surfaces), and 19 (5 typed list-capability classes)
      resolved.
- [ ] `python3 scripts/security/validate_public_repo_hygiene.py` exits 0.
- [ ] `make -f scripts/Makefile docs-topology-consistency` exits 0.
- [ ] Per-item collection gates (in addition to the P-aggregate gate above):
  - Item 1: `python3 scripts/security/validate_public_repo_hygiene.py --mode tracked` exits 0.
  - Item 4: `pytest -k test_auto_reject_kri_approval_takes_only_reason` collected = 1, exit 0.
  - Item 8: no test (comment-only) — coverage relies on item 37 BL update; spot-check `rg "BL §11.5" backend/app/services/_issue_register/source_mutation.py` returns the comment.
  - Item 11: `pytest -k test_vendor_link_cascade_dialect_parity` collected = 1, exit 0.
  - Item 12: `pytest -k test_unify_archive_state_logs_idempotent_marker` collected = 1, exit 0.
  - Item 13: `pytest -k test_approver_roles_jsonb_preflight` collected ≥ 1 (`pytest.mark.postgres`), exit 0 in postgres lane.
  - Item 14: `pytest -k test_rename_kri_archived_by_fk_idempotency` collected ≥ 3 (clean run + 2 parametrized RuntimeError/manual-drop cases), exit 0.
  - Item 15: `pytest -k test_vendor_link_orphan_precheck_red` collected ≥ 1, exit 0 in postgres lane.
  - Item 16: `pytest -k test_vendor_migration_idempotency_red` collected ≥ 1, exit 0 (after item 25 lands).
  - Item 39: `cd frontend && npx tsc --noEmit && npm run lint` exit 0 (comment-only change, no new test).
  - Items 26-32 (P4B locks — v6.3 expansion): `pytest -k <test_filename_stem>` collected = 1, exit 0 for each:
    - Item 26: `pytest -k test_patch_issues_status_excluded_red` collected = 1
    - Item 27: `pytest -k test_sensitive_fields_closed_set_red` collected = 1
    - Item 28: `pytest -k test_is_priority_directional_asymmetry_red` collected = 1
    - Item 29: `pytest -k test_self_approval_prevention_red` collected = 1
    - Item 30: `pytest -k test_patch_access_users_binding_red` collected = 1
    - Item 31: `pytest -k test_export_endpoint_scope_filter_red` collected = 1
    - Item 32: `pytest -k test_post_risks_controls_bilateral_access_red` collected = 1
    - Aggregate Makefile-target lock count 190 → 197 empirically confirmed.
- [ ] P6 re-audit produces zero 🔴 findings.
- [ ] `docs/BUSINESS_LOGIC.md` reconciled per items 33, 35-37 (item 34 DROPPED v6).

---

## 8. Future Work (🟢 observations from audit, NOT in this plan)

The following observations were surfaced during the audit (or the v2/v3
triages) but are intentionally out of scope. They are tracked here so
the next remediation cycle can pick them up.

- **ADR-010 backfill across legacy migrations.** 79 of 86 migrations
  lack the `NotImplementedError` downgrade body (≈8% ADR-010
  compliance). Items 11-14 only correct the 4 in-scope migrations.
  Scope a separate cycle to backfill the forward-only invariant across
  all 79 legacy migrations and add a permanent architecture lock.
- **Postgres CI lane is required.** 5 of 6 NEW migration tests added in
  P2 are `pytest.mark.postgres` — silently skipped without
  `TEST_DATABASE_URL`. Wire a Postgres lane in CI as a hard requirement.
- **Substring-on-read-text architecture locks.** 22 of 89 architecture-lock
  tests still use substring searches on `read_text()` (item 21 was
  reframed v6 to AST classification; item 24 was DROPPED v6.1 as
  FALSE-PREMISE — frontend filename guards never were `read_text()`
  substring fixes). A wholesale AST conversion is a multi-week
  effort; deferred.
- **Stray 403s in issue workflow.**
  `backend/app/services/_issue_workflow/assignment.py:32` and
  `backend/app/services/_issue_workflow/update_plans.py:34` return 403
  in mutation paths. BL §11.2's "404 not 403" applies to **reads** only;
  mutation 403s may be legitimate. Document the distinction in BL §11.2.
- **`scripts/security/release_parity_audit/static_resolution.py:9`** —
  pre-existing path-doubling bug (`/scripts/scripts/dev.sh`). File
  separately.
- **`scripts/security/run_public_repo_leak_audit.sh`** — fails-closed
  when Docker is unavailable. Add a non-Docker gitleaks fallback.
- **AuthContext narrow-hook consumer migration.** Covered as item 39
  (intent comment only). If a future high-frequency component needs
  render-isolation, migrate that specific consumer; no blanket
  migration needed.
- **`frontend/src/components/settings/DocumentationSettings.tsx:35`** and
  **`frontend/src/pages/DocumentationPage.tsx:33`** infer audience from
  `docs[0]?.audience`. Works today; would break if response shape
  changes. Low priority.
- **`backend/app/services/_vendor_links/kri_assignment.py:118-122`** runs symmetric
  `validate_assignable_vendors` on link AND unlink. Confirm intent with
  product before changing.
- **`backend/alembic/versions/g2h3i4j5k6l7_add_archivable_columns.py:42-44`**
  runs UPDATE inside same transaction as DDL. Postgres ≥11 fast-path
  makes `ADD COLUMN` metadata-only, but the same-tx UPDATE still holds
  an exclusive lock. For million-row `vendors`, run during off-peak.

---

## 9. Appendix A — Original Audit Round Metadata

This appendix documents the 3-round audit that surfaced the items in
this plan. It is included so that future audits can use the same
dispatch pattern and so that any disagreement about a finding's
provenance can be traced to the agent that produced it.

> **v2 plan revision history:** v2 rewrote the original 47-item plan
> after a 3-round adversarial triage (15 Opus subagents) found 11 stale
> items, 6 critical execution hazards, and 13 partials. v2 has 41 items.
>
> **v3 plan revision history (2026-05-11):** v2 triage (15 Opus
> subagents) found 3 critical hazards (items 26, 32, 36) + 7 partials
> + 7 internal-consistency drifts. v3 fixes all 17. Item count: **40**
> (v2 had 41; v3 collapsed v2 items 32+33 into a single item 32 because
> the bilateral guard is service-layer-only).

### 9.1 Round 1 — Domain initial pass (5 parallel Opus subagents)

| Agent | Domain | What it caught |
|---|---|---|
| R1-A | Backend services + endpoints | Original items 7-14 |
| R1-B | Architecture locks + allowlists | Original items 25-30 + the 31-38 gaps |
| R1-C | Capability contract | Original items 21-24 |
| R1-D | Migrations | Original items 15-20 |
| R1-E | Frontend | Original items 30, 44, 45 |

### 9.2 Round 2 — Adversarial re-review (5 parallel Opus subagents)

Briefed: "Round 1 produced false flags. Verify each finding by reading
the current file. Add new findings."

| Agent | Focus | What it caught |
|---|---|---|
| R2-A | Cross-reference integrity sweep | Confirmed 41 R1 findings; formalized BL drift |
| R2-B | Security adversarial deep-dive | Confirmed original item 9 HARDEN (D1); flagged lock gaps |
| R2-C | Migration safety adversarial | Confirmed original items 15-20 |
| R2-D | Test-lock soundness | Manual mutation confirmed R1 lock findings |
| R2-E | Empirical cheap-gate runner | ruff (4 fixes), mypy (0 errors, wired), tsc (0), eslint clean, locks (182 actual) |

### 9.3 Round 3 — Heavy gates + verification (4 parallel Opus subagents)

| Agent | Focus | What it caught |
|---|---|---|
| R3-A | Full backend pytest worktree split | 2009 passed; 0 failed; coverage 88.84% |
| R3-B | mypy + tsc + R2-E fixup | mypy 0; tsc 0; eslint clean |
| R3-C | Postgres + release-parity + leak audit | Postgres skipped (no env); release-parity flagged path-doubling |
| R3-D | Adversarial verification of R2 verdicts | Flagged D1 (HARDEN) and D3 (Wave 8 #77b) for orchestrator |

### 9.4 v2 Triage (15 Opus subagents, 2026-05-10) and v3 Triage (15 Opus subagents, 2026-05-11)

v2 triage ran the same 3-round pattern against the original 47-item
plan; v3 triage ran the same pattern against the v2 plan. v3 collapsed
v2 items 32+33 into a single item, renumbered, corrected 10 anchors,
and produced this 40-item plan.

### 9.5 v4 Triage (~5 Opus subagents, 2026-05-12) and v5 Triage (15 Opus subagents across 3 rounds, 2026-05-13)

v4 reframed three lock items (idiom singularization, item 39 sibling-test omission) plus 7 internal-consistency drifts. v5 ran 5 parallel Opus subagents in an enhancement pass — corrected §11 row-30/31 misalignment, resolved item 18's 12-surface ID list empirically, surfaced the P4A item 25 → P2 item 16 cross-phase blocker, and added §6.2 dependency-graph subsection.

### 9.6 v6 Triage (15 Opus subagents across 3 rounds + main-thread RBAC verification, 2026-05-14) and v6.1/v6.2 Counter-Triage (2026-05-15)

v6 caught 5 BLOCKING issues v3/v4/v5 self-triages all missed (items 3, 17, 20, 25, 36) plus DROPs of items 20 and 34 (FALSE-PREMISE), and 12 surgical edits. v6.1 dropped item 24 (third FALSE-PREMISE — `useAuthz.invariant.test.ts` has no basename-substring guards). v6.2 added bind-threading + 4-branch guard to item 14 (rename FK migration) plus C1-C5 amendments. Net active items: **37**.

---

## 10. Appendix B — Item-Number Quick Reference (v6 numbering — preserves v3 ID assignments)

| Item # | Phase | Sub-agent |
|---|---|---|
| 1 | P0 | sequential |
| 2 | P0 | sequential |
| 3 | P1 | Agent A |
| 4 | P1 | Agent A |
| 5 | P1 | Agent A |
| 6 | P1 | Agent A |
| 7 | P1 | Agent B |
| 8 | P1 | Agent B |
| 9 | P1 | Agent B |
| 10 | P1 | Agent B |
| 11 | P2 | sequential |
| 12 | P2 | sequential |
| 13 | P2 | sequential |
| 14 | P2 | sequential |
| 15 | P2 | sequential |
| 16 | P2 | sequential |
| 17 | P3 | sequential |
| 18 | P3 | sequential |
| 19 | P3 | sequential |
| 20 | — | **DROPPED in v6** |
| 21 | P4A | parallel-1 |
| 22 | P4A | parallel-1 |
| 23 | P4A | parallel-1 |
| 24 | — | **DROPPED in v6.1** |
| 25 | P4A | parallel-1 |
| 26 | P4B | parallel-2 |
| 27 | P4B | parallel-2 |
| 28 | P4B | parallel-2 |
| 29 | P4B | parallel-2 |
| 30 | P4B | parallel-2 |
| 31 | P4B | parallel-2 |
| 32 | P4B | parallel-2 |
| 33 | P5A | parallel-1 |
| 34 | — | **DROPPED in v6** |
| 35 | P5A | parallel-1 |
| 36 | P5A | parallel-1 |
| 37 | P5A | parallel-1 |
| 38 | P5B | parallel-2 |
| 39 | P5B | parallel-2 |
| 40 | P5B | parallel-2 |

---

## 11. Appendix C — Cross-Reference Map (v6 numbering — preserves v3 ID assignments)

| Item | BL section | ADR ref | Schema/code anchor |
|---|---|---|---|
| 1 | — | — | `.gitignore`; `.planning/audits/_context/`; action: `git rm --cached -r .planning/audits/_context/` |
| 2 | — | — | `.planning/codebase/STRUCTURE.md:22-32`; canonical docs tree |
| 3 | §1.4 | — | `backend/app/api/v1/endpoints/admin/sessions.py:47-62` (swap `Depends(require_platform_admin)` at line 50 for `Depends(require_permission("admin","session.revoke"))` + register in `RBAC_PERMISSIONS` + AUTHZ-AUTH-SESSION contract row; **v6.3.1: NOT in `capability-catalog.json`**) |
| 4 | §5.4 | ADR-002 | `backend/app/services/_approval_execution/results.py:28-29` |
| 5 | §5.4 | ADR-002 | `backend/app/services/approval_scenario_policy.py:123-135 (top-of-function guard after roles-None short-circuit; NOT at literal line 131)` (HARDEN per D1; top-of-function guard using `requested_by_id`, NOT a conjunction onto line 131; NOT `requester_id`) |
| 6 | §5.1 | — | `backend/app/services/_riskhub_config/approval_scenario_roles.py:13-17` |
| 7 | §5.1 | — | `backend/app/schemas/riskhub.py:135` |
| 8 | §11.5 (line 915) | — | `backend/app/services/_issue_register/source_mutation.py:42-43 (line 42 = guard test, line 43 = raise; comment above line 42)` (NOT `contextual.py`) ; cross-ref D2 / item 37 |
| 9 | §5.4 | ADR-002 | `backend/app/services/_approval_execution/edit_risk_control.py:33,86` (Risk SELECT line 33, Control SELECT line 86 — both gain `.with_for_update()`); v6 EXPANDED: delete_side_effects.py:37,57,79 |
| 10 | §6.4 | — | `backend/app/services/kri_deadline_service.py:194-208 + :226-237 (both branches per v6)` |
| 11-14 | §8.x | ADR-010 | Named `backend/alembic/versions/*.py` (4 in-scope migrations) |
| 15-16 | (test infra) | ADR-010 | `tests/backend/pytest/migrations/*.py` |
| 17 | §1.x | — | `docs/security/authorization-capability-contract.json:438` (KRIHistoryCapabilitiesRead prose alignment) |
| 18 | §1.x, §6.1 | — | `docs/security/capability-catalog.json` (11 missing surfaces) (v6.3: risk_hub DROPPED) |
| 19 | §6.1 | — | `backend/app/schemas/*Capabilities` (5 typed list-capability classes) |
| 20 | (lock infra) | — | **DROPPED in v6 — FALSE-PREMISE.** Line-46 ceiling at `test_w12_riskhub_config_service_commit_ratchet_red.py` is an independent ratchet, not redundant; deletion would weaken the lock. No action. |
| 21 | (lock infra) | — | `tests/backend/pytest/architecture/*.py` (substring → AST) |
| 22 | (lock infra) | ADR-010 | `tests/backend/pytest/architecture/*.py` + 8 `*_allowlist.toml` files (v6.2; `_auth_idiom_baseline.toml` owned by item 21) (forward-only substring → AST) |
| 23 | (lock infra) | — | `tests/backend/pytest/architecture/*.py` (5 magic-number tests) |
| 24 | (lock infra) | — | **DROPPED in v6.1 — FALSE-PREMISE.** No basename-substring filename guards exist in `useAuthz.invariant.test.ts` or `BusinessRouteGuards.test.tsx`; the 'tighten to full-path canonical' has no matching code. |
| 25 | (lock infra) | — | `backend/app/core/exceptions.py` (new subclass of `ConflictError`; NOT a new `_migrations/` package — that does not exist) |
| 26 | §11.1 line 850 | — | `backend/app/services/_issue_workflow/update_plans.py:20-24` (lock-only against existing seam; OpenAPI parity on `IssueUpdate` schema) |
| 27 | §6.1 line 485-487 | — | `backend/app/core/_permissions/sensitive.py` (SENSITIVE_FIELDS lock) |
| 28 | §6.4 line 514-516 | — | `_is_priority_downgrade` helper lock |
| 29 | §5.4 line 451 | ADR-002 | `backend/app/services/_approval_execution/authorization.py:30` + `backend/app/services/approval_scenario_policy.py:171` (v6: second site added; post-D1, add top-of-function guard in `user_matches_approval_scenario_role`) |
| 30 | §1.4 line 114 | — | `backend/app/api/v1/endpoints/access.py` (PATCH /users/{user_id} body-level auth; NOT `access/users.py`) |
| 31 | §10.3 line 776 | — | `backend/app/api/v1/endpoints/reports/unified_exports/routes.py:37` (export visibility-clause / `Depends(require_permission("reports","read"))` lock) |
| 32 | §7.3 line 562-564 | — | `backend/app/services/_control_execution/link_governance.py:160-163` (lock-only against existing service-layer guard; no endpoint code change) |
| 33 | §8.2 line 596 | ADR-005 | `docs/BUSINESS_LOGIC.md` |
| 34 | (dropped) | — | **DROPPED in v6 — FALSE-PREMISE.** §8.3 contains no 'restore-pending' wording; restore is single-step terminal. |
| 35 | §8.3 line 620 | — | `docs/BUSINESS_LOGIC.md`; cross-ref `backend/app/services/_reporting/exports/filters.py:57 (KRI), :63 (vendor) + rows.py:120 (vendor)` (NOT `reports/unified_exports/`) |
| 36 | §1.4 line 116 | — | `docs/BUSINESS_LOGIC.md`; `backend/app/schemas/access.py:66-72` (capabilities 5 → 7) |
| 37 | §11.5 line 915 | — | `docs/BUSINESS_LOGIC.md`; cross-ref to item 8 |
| 38 | — | — | `frontend/src/services/api/schemas/entities/vendors.ts:9`; `frontend/src/types/vendorLink.ts:11`; `tests/frontend/unit/src/services/api/schemas/__tests__/vendors.statusOptional.lookup.test.ts` (DELETE); `tests/frontend/unit/src/services/api/schemas/__tests__/vendors.statusOptional.test.ts` (DELETE — sibling); `docs/migrations/vendor-status-removal.md:7` (4 frontend sites, NOT 3) |
| 39 | — | — | `frontend/src/contexts/AuthContext.tsx:41-59` |
| 40 | — | — | `scripts/Makefile` (lint-types target; mypy CI already wired at `.github/workflows/lint.yml:69-73`) |

---

## 12. Appendix D — Dispatch Templates for Phase Agents

### 12.0 Universal anti-patterns (apply to every phase)

Bake into every dispatch:

- Use `requested_by_id` (NOT `requester_id`).
- Item 8 anchors at `backend/app/services/_issue_register/source_mutation.py:42` (NOT `contextual.py`).
- Use `backend/app/api/v1/endpoints/access.py` (NOT `access/users.py`).
- For the **endpoint layer** (item 31) use `backend/app/api/v1/endpoints/reports/unified_exports/`. For the **service layer** alias-synthesis (item 35) use `backend/app/services/_reporting/exports/filters.py:57,63` + `rows.py:120`. The non-existent paths `backend/app/services/reports/unified_exports/` and `backend/app/api/v1/endpoints/access/users.py` are the v2-era hazards — never use them.
- mypy is **already wired** at `.github/workflows/lint.yml:69-73` — do NOT add a duplicate CI step.
- The `_migrations/` package **does not exist** — item 25 uses `backend/app/core/exceptions.py`.
- Item 26 seam **already exists** at `backend/app/services/_issue_workflow/update_plans.py:20` — lock-only.
- Item 32 service-layer guard **already enforces** at `backend/app/services/_control_execution/link_governance.py:160-163` — lock-only.
- v6 has **37 active + 3 dropped** (40 numbered; items 20, 24, and 34 DROPPED — FALSE-PREMISE). Use v6 numbering (preserves v3 ID assignments).
- If an anchor doesn't match the current repo, **abort and report** — never invent a substitute.
- `useAuthz.invariant.test.ts` has NO basename-substring matches — item 24 was DROPPED v6.1; if an executor "finds" basename substrings, they're hallucinating. Lines 16, 25, 32, 39, 43, 44, 55 use full canonical paths passed to readFileSync (v6.3: canonical-path line list refined per item 24 DROP rationale at line 412).
- Item 14 rename-hazard guard MUST `drop_constraint` with the LITERAL FK name `fk_key_risk_indicators_archived_by_id`; do NOT substitute a helper-returned variable name (else 4-branch logic short-circuits).
- `MigrationAlreadyAppliedError` MUST register in `EXCEPTION_REGISTRY` (else item 16's `pytest.raises(MigrationAlreadyAppliedError)` import-time NameErrors).

### 12.1 P0 dispatch template

> **Working directory:** `<REPO_ROOT>`
>
> **Task:** P0 hygiene cluster from §4.1. Items **1-2**.
>
> Steps: (1) add `.planning/audits/_context/` to `.gitignore`; (2) add this plan to the canonical docs tree per `docs-topology-consistency`.
>
> Gates: `make -f scripts/Makefile docs-topology-consistency` exit 0; `validate_public_repo_hygiene.py` exit 0.
>
> Output: 🟢 per item; 🟡 if follow-up needed. ≤ 60 lines. Plus §12.0 anti-patterns.

### 12.2 P1 dispatch template (Agents A, B, C)

> **Working directory:** `<REPO_ROOT>`
>
> **Task:** P1 sub-agent <A|B|C> from §4.2.
>
> - Agent A: items **3-6**. Item 3 = swap `Depends(require_platform_admin)` for `Depends(require_permission)` + register in `RBAC_PERMISSIONS` + AUTHZ-AUTH-SESSION contract row (**v6.3.1: NOT in `capability-catalog.json`**) + explicit admin-role assertion wrap. Item 5 = HARDEN (D1) top-of-function guard using `requested_by_id`.
> - Agent B: items **7-10**. Item 8 = `_issue_register/source_mutation.py:42`.
> - Agent C: regression tests for items **3, 4, 5, 6, 7, 9, 10** (NOT item 8 — covered by integration). Confirm collection via `pytest --collect-only`.
>
> Gate: `pytest -q -m "not postgres and not benchmark" --no-cov` exit 0; collected ≥ **2016**.
>
> Output: 🟢 per item with `file:line`. Plus §12.0.

### 12.3 P2 dispatch template

> Task: P2 migration hardening from §4.3. Items **11-16** sequential.
>
> Gates: `pytest -q ../tests/backend/pytest/migrations --no-cov` exit 0; if `TEST_DATABASE_URL` set, `make test-postgres-ci` exit 0.
>
> Output: 🟢 per item. Anti-patterns: do NOT alter forward-only invariants (ADR-010); modify migration logic AND test-harness scaffolds where item 16 requires (full restructure of tests/backend/pytest/migrations/test_vendor_migration_idempotency_red.py is in-scope — the anti-pattern is editing application-domain code, not test scaffolds). v6.3 scoping.

### 12.4 P3 dispatch template

> Task: P3 capability contract cleanup from §4.4. Items **17-19** sequential.
>
> Steps: (17) rename `KRIHistoryCapabilities` → `KRIHistoryCapabilitiesRead` at `docs/security/authorization-capability-contract.json:438`; (18) add **11** missing catalog surfaces; (19) convert **5** `dict[str, bool]` collection capabilities to typed Pydantic models.
>
> Gate: `validate_authz_capability_contract.py` exit 0.
>
> Output: 🟢 per item with `file:line`. Anti-patterns: do NOT change per-row capability shape on `{Risk,Control,Vendor,Issue,KRI}Read.capabilities`. Plus §12.0.

### 12.5 P4 dispatch template (P4A, P4B)

> Task: P4<A|B> from §4.5.
>
> - P4A: items **21, 22, 23, 25** (items 20, 24 DROPPED v6/v6.1). Tighten existing locks; AST walks; add `expires_at` field to 8 allowlists (v6.2). Item 25 places the new exception subclass under `backend/app/core/exceptions.py` (NOT `_migrations/`).
> - P4B: items **26-32**. Add **7 net new** architecture-lock test files. Each carries `pytest.mark.contract` and a docstring referencing the BL section. Item 26 is lock-only against existing seam at `update_plans.py:20`. Item 32 is lock-only against `link_governance.py:160-163`.
>
> Gate: `make -f scripts/Makefile test-architecture-locks` exit 0; lock count **190 → 197** (Makefile target); manual mutation on ≥2 new locks triggers clear failure.
>
> Output: 🟢 per item. Anti-patterns: do NOT change application code EXCEPT the single-class append in item 25 (backend/app/core/exceptions.py — class definition + EXCEPTION_REGISTRY entry); do NOT modify BL doc (P5A's job); plus §12.0. v6.3 scoping.

### 12.6 P5 dispatch template (P5A, P5B)

> Task: P5<A|B> from §4.6.
>
> - P5A: items **33, 35-37** (item 34 DROPPED v6). Edit `docs/BUSINESS_LOGIC.md` per §4.6.1 table. Cite ADR-005 in §8.2. Item 35 anchors `_reporting/exports/filters.py:57,63` + `rows.py:120` (NOT `reports/unified_exports/`). Item 36 capabilities count 5 → 7.
> - P5B: items **38-40**. **Item 38 has FOUR frontend sites** plus the migration doc — do NOT miss the `vendors.statusOptional.test.ts` sibling. Item 39 is an intent comment in AuthContext. Item 40 adds `make lint-types`; do NOT add a duplicate mypy CI step.
>
> Gates: `tsc --noEmit && npm run lint` exit 0; `make lint-types` exit 0; `rg "linkedVendor\.status|LinkedVendorSummary[^a-zA-Z0-9_].*status" frontend/ tests/frontend/` returns zero matches; BL review.
>
> Output: 🟢 per item with `file:line`. Plus §12.0.

### 12.7 P6 dispatch template (Round 1 sub-agents)

> Task: P6 Round 1 <R1-A | R1-B | R1-C | R1-D | R1-E>. Verify all P0-P5 fixes intact in current HEAD. Cross-check against §11.
>
> - R1-A: backend services + endpoints (items **3-10**)
> - R1-B: architecture locks + allowlists (items **21-32 except 24**; items 20, 24 DROPPED v6/v6.1)
> - R1-C: capability contract (items **17-19**)
> - R1-D: migrations (items **11-16**)
> - R1-E: frontend + Makefile (items **38-40**)
>
> Output: tier marker + `file:line` + ≤15-word direct quote. ≤ 200 lines. Do NOT spawn sub-agents; do NOT modify files. Plus §12.0.

### 12.8 P6 dispatch template (Round 2 — adversarial)

> Task: P6 Round 2 <R2-A | R2-B | R2-C | R2-D | R2-E>. Briefed: "Round 1 produced false flags. Verify each finding by reading the current file. Add new findings missed."
>
> Output: VERIFIED-REAL / FALSE-FLAG / PRE-EXISTING / TRIVIAL per finding with `file:line` + ≤15-word quote. New findings as 🔴/🟡/🟢/🔵/✅. ≤ 250 lines. Plus §12.0.

### 12.9 P6 dispatch template (Round 3 — heavy gates)

> Task: P6 Round 3 <R3-A | R3-B | R3-C | R3-D>. Heavy gates + verification of R2 verdicts.
>
> - R3-A: full backend pytest in the current checkout with NEW-vs-PRE-EXISTING classification. Capture `git status --short` before and after the run. Do **not** run `git stash`, `git stash pop`, or `git worktree add` unless the orchestrator explicitly authorizes that isolation step in chat. If the tree is too dirty for reliable classification, stop and report the blocker instead of changing git state.
> - R3-B: mypy + tsc + R2-E gate fixup analysis
> - R3-C: Postgres + release-parity + leak audit (skip cleanly if env unavailable)
> - R3-D: adversarial verification of R2 verdicts
>
> Output: per gate, exit code + summary; per R2 finding, CONFIRMED / OVERRULED / DEFERRED. ≤ 200 lines. Plus §12.0.

---

## 13. Appendix E — Glossary

| Term | Meaning in this plan |
|---|---|
| 🔴 Critical | Blocks merge; must be fixed before commit |
| 🟡 Should fix before commit | Non-blocking but in scope for this remediation |
| 🟢 Observation | Out of scope for this remediation; tracked in Future Work |
| 🔵 Lock improvement | Tightens an existing architecture-lock test |
| ✅ Verified clean | Spot-checked and no issue found; included for audit trail |
| HARDEN | Strengthen a check (add an extra invariant) without changing public API |
| ADR | Architecture Decision Record under `docs/adr/` |
| BL | `docs/BUSINESS_LOGIC.md` |
| Lock | A `tests/backend/pytest/architecture/test_*_red.py` invariant test |
| Allowlist | A `_*_allowlist.toml` file that paired locks consult for the canonical set |
| `client_factory` | The fixture in `tests/backend/pytest/conftest.py` for backend API tests |
| Capability contract | `docs/security/authorization-capability-contract.{md,json}` + `capability-catalog.json` |
| Forward-only migration | Per ADR-010, `downgrade()` raises `NotImplementedError` |
| Adversarial round | A re-review round where agents are briefed that the prior round produced false flags |
| Self-contained prompt | A sub-agent prompt that bakes in cwd, file paths, output format, and length cap (no conversation context) |
| v2 triage | The 3-round, 15-Opus-subagent revision pass on the original 47-item plan that produced the 41-item v2 plan |
| v3 triage | The 3-round, 15-Opus-subagent revision pass on the v2 plan that produced this 40-item v3 plan (2026-05-11) (superseded by v6 — see §1 metadata) |
| v4 triage | 10-Opus-subagent stale-anchor sweep producing surgical Edit patches (see §1 v4 row, 2026-05-12) |
| v5 triage | 5-Opus-subagent enhancement pass adding §11 row-31 + §6.2 dependency graph (see §1 v5 row, 2026-05-13) |
| v6 triage | 15-Opus-subagent deep triage + main-thread RBAC verification that DROPPED items 20 and 34 (see §1 v6 row, 2026-05-14) |
| v6.1 patch | Counter-triage that DROPPED item 24 as third FALSE-PREMISE — useAuthz.invariant.test.ts has no basename-substring guards (2026-05-15) |
| v6.2 patch | Counter-triage C1-C5 fixes plus item 14 BIND-THREADING and item 21 atomicity guarantee (2026-05-15) |
| v6.3 patch | Loop 1 + Loop 2 + Loop 3 18-finding amendment — risk_hub drop, CRO admin-role assertion, _allowlist_expiry.py helper creation, per-item gate expansion to 37/37, peer→Pair TOML unification (2026-05-15) |
| v6.3.1 patch | Self-review cleanup — fixed v6.3 residue: invalid `current_user.roles` example → canonical singular `current_user.role`; 4 stale "catalog registration" anchors at lines 225/667/939/1014 → RBAC_PERMISSIONS + contract row; Zod table summary math 5+7=12 → 5+6=11 with `risk_questionnaire` flipped EXISTS-REUSE; metadata v6.2→v6.3; L22 enumeration `risk_hub` trim; Step 4 example refresh; line 332 `present` disambiguation; R3-A §12.9 cross-ref (2026-05-16) |
| v6.3.2 patch | 15-Opus-subagent Loop 1-3 triage of v6.3.1 caught one production-safety regression and six trivial drift items: 🔴 **Item 6 status_code shadow** — `ApprovalScenarioConfigurationError(DomainError)` would render HTTP 400 because `to_http_exception` prefers class attr over registry projection; `status_code = 500` now mandatory on the class body; 🟡 **Item 37 retarget** — Fix text now INSERTS a parenthetical at BL §11.5:915 rather than overwriting the issue-link-source policy that already coexists with the §10.5:798 archive-equivalence statement; plus pytest marker spec inline in §1 headline, metadata Plan-date refresh, empirical-headlines re-verification stamp 2026-05-16, §11 row 3 + §4.2.1 Item 3 file:line `47-58` → `47-62`, and §4.2.2 Item 10 log message split into branch-specific labels (`"duplicate guard"` for breach, `"notification"` for non-breach). Loop 3A empirically reproduced 10/10 §1 headlines at HEAD on 2026-05-16 (2026-05-16). |
| v6.3.3 patch | Document-only cleanup — Item 3 implementation is copy-safe (`current_user` permission dependency, first-body `admin_user = require_platform_admin(current_user)`, no nonexistent `app.security.permissions` import); P6 R3-A forbids `git stash`, `git stash pop`, and `git worktree add` unless explicitly authorized by the orchestrator in chat; P6 acceptance uses canonical 37 active + 3 dropped accounting (2026-05-16). |
| Critical execution hazard | A stale anchor (wrong path / attribute / module) that would cause a phase agent to fail or silently mis-edit |
| Wave 8 | The multi-PR cleanup of the legacy `Vendor.status` column; items #69+#70 dropped the backend column, #77b removes the frontend field |
| AST walk | Parsing a Python file's abstract syntax tree (`ast.parse`/`ast.walk`) to detect structural patterns instead of substring searches |
| Pair TOML | A `_<test>_baseline.toml` file holding canonical expected values that a lock test reads, so updates touch the registry rather than test code |
| Seam | A single well-defined chokepoint in the codebase where an invariant must be enforced (e.g., `update_plans.py:20` for issue-status rejection) |
| OpenAPI parity | The practice of declaring optional fields on `*Update` schemas (even when rejected by the service) so OpenAPI docs match the response shape |
| Break-glass | The SSO emergency-access flow (`can_break_glass_enable` capability) that bypasses normal auth for incident response |
| D1 | Self-approval requester guard at top of `user_matches_approval_scenario_role` (item 5) |
| D2 | Vendor archive truth — `is_archived` flag is canonical, `Vendor.status` deprecated |
| D3 | KRI history projection — read-shape lock for KRI history endpoint |
| D4 | Cross-domain capability surfaces — shared capability strings across resources |
| D5 | DX wrapper for type-checking — convenience script around mypy invocation |
| D6 | Item 3 CRO-revoke privilege decision (v6.3 REVERSED) — admin-role explicit assertion preserves the platform-admin-only scope per docs/security/authorization-capability-contract.md:152, blocking the *:* wildcard from granting CRO unintended revoke power. Decision recorded inline at item 3 prescription. |
| FALSE-PREMISE | Audit item where prescribed code does not exist; marked DROPPED |
| P4A | Architecture lock improvements sub-phase (items 21, 22, 23, 25) |
| P4B | New architecture locks sub-phase (items 26-32) |
| P5A | BL doc drift sub-phase (items 33, 35-37) |
| P5B | Frontend + Makefile sub-phase (items 38-40) |
| MRO | Method Resolution Order — Python class hierarchy resolution |
| tier | `is_requester` flag on `approval_privilege_tier` dataclass |
| REFRAME | v6 in-place fix that retargets the item's scope without changing item ID |
| BIND-THREADING | v6.2 pattern: `bind = op.get_bind()` threaded explicitly through helper calls |
| RENAME-HAZARD | v6.1 silent-regress risk where helper looks up by stable column rather than expected name |

---

*End of plan. Total items: 40 numbered (37 active + 3 dropped per v6/v6.1: items 20, 24, and 34 — FALSE-PREMISE). Phases: 6 fix + 1 re-audit. Acceptance: zero 🔴 findings; all 37 active items closed; 3 dropped items annotated.*
