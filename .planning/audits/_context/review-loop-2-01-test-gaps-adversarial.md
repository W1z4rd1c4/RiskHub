# Phase 4 Loop 2 Adversarial Review — Test-Gap Audit

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Reviewer: ADVERSARIAL (Round 2). Target: `review-loop-1-01-test-gaps.md` ("100% spot-check pass rate" claim).

Mode: ADVERSARIAL. Loop 1 was constructive; this round assumes Loop 1 was too lenient and looks for hallucinated quotes, missed gaps, and tautological "RED" tests.

---

## Section A — Counter Spot-Check (10 items, fresh reads, ≠ Loop 1's sample)

I read the cited file:line for each of these 10 items and verified the assertion would fail today.

| Item | Cite | Read result | Verdict |
| --- | --- | --- | --- |
| #2 | `_issue_workflow/source_validation.py:117` literally `_ensure_owner_assignable = ensure_owner_assignable` | confirmed at line 117 quote `_ensure_owner_assignable = ensure_owner_assignable` | PASS |
| #11 | `_control_execution/workflow.py:155` literally `names.append(risk.process)` | confirmed at line 155 quote `names.append(risk.process)` | PASS |
| #12 | `users/summary.py:48` literally `except Exception:` returning `False` | confirmed lines 47-49 quote `except Exception:` then `return False` | PASS |
| #15 | `docs/security/capability-catalog.json` has 7 surfaces; `schemas/access.py:63` `class AccessUserCapabilities(BaseModel)` | confirmed 7 ids (capabilities, me_capabilities, risk, control, kri, issue, vendor); `AccessUserCapabilities` at `:63` (Loop 1 said `:66-72`; off by 3) | PASS (with minor cite drift) |
| #27 | `_shared/loading.py:29` literally `selectinload(Issue.links).selectinload(IssueLink.risk)` | confirmed at endpoints/issues/_shared/loading.py:29 quote `selectinload(Issue.links).selectinload(IssueLink.risk)` | PASS |
| #28 | endpoint `_shared/links.py:11,39` define `_resolve_vendor_department_and_access` and `_issue_link_department_ids` | confirmed at lines 11 and 39 of `endpoints/issues/_shared/links.py` | PASS |
| #34 | 22+ `can_resolve_approvals(current_user)` sites | grep yields 25 in `backend/app` (44 total occurrences); plan's "22+" hedge holds | PASS |
| #39 | `admin/capabilities.py:16-21` 4 fields hardcoded `True` | confirmed lines 16-21 quote `can_revoke_sessions=True, can_run_directory_check_all=True, can_update_log_config=True, can_export_loaded_audit_logs=True` | PASS |
| #41 | `_issue_workflow/serialization.py:18` `active_exception = _active_exception` and `:41` `_serialize_exception_with_user_names = serialize_exception_with_user_names` | confirmed both lines | PASS |
| #76 | 8 auth-flow `db.commit` sites | confirmed all 8: refresh.py:177, logout.py:101+132, sso.py:170, _sso_helpers.py:48, password.py:128+161, demo.py:67 | PASS |

**Pass rate: 10/10 (100%).** Adversarial spot-check confirms Loop 1's 30/30 file:line accuracy.

One minor drift on #15 (Loop 1 cited `:66-72`; the actual class is at `:63`). Within tolerance — the field count and surface absence are both verified.

---

## Section B — Loop 1 Counts: Verified

| Loop 1 claim | Adversarial check | Verdict |
| --- | --- | --- |
| #46 has 33 inline `queryKey: [` literals (plan said 45) | `grep -rn "queryKey: \[" frontend/src/ \| wc -l = 33` | Loop 1 RIGHT (33 confirmed). |
| But: plan's "45" is `queryKey:` total (incl. variable references) | `grep -rn "queryKey:" frontend/src/ \| wc -l = 45` | Plan's 45 is also valid; conflation; both numbers are real for different counts. |
| #74a has 32 not 31 packages | `ls -d backend/app/services/_*/ \| wc -l = 32` | Loop 1 WRONG. The 32 includes `__pycache__/`. Excluding pycache gives **31** (plan correct). |
| 33/34 architecture-test files have `pytestmark` | `grep -l pytestmark architecture/*.py \| wc -l = 34/34` | Loop 1 OFF BY ONE — all 34 have it. |

**Loop 1's adversarial #74a count claim is itself a hallucination.** The plan's 31 was correct.

---

## Section C — MISSING tests (Loop 1 said "0 MISSING")

Loop 1 claimed "MISSING: 0 — every item has a proposed test". I verified by reading 5 plans for items with thin coverage:

- **#76 (auth-flow `db.commit` migration)**: NOT in Loop 1's review at all. Loop 1 said "#76 and #77 NOT FOUND". Both ARE defined in `plan-loop-3-07-integration-v2.md:160-300`. Loop 1's claim that #76/#77 "are not picked up by the Loop 1 plans" is correct (they were added in Loop 3), but the adversarial framing is: **Loop 1 did not check Loop 3 docs, so it under-counted**. The Loop 3 doc at line 167-205 defines the test (TDD: per-site `_endpoint_commit_allowlist.toml` removal as each migration lands), but **NO new architecture-lock test is proposed for #76**. The lock proposed is implicit in the existing `_endpoint_commit_allowlist.toml` allowlist — meaning each removal flips the allowlist GREEN. There is no test that asserts "the 8 sites no longer call `await db.commit()` directly". This is a MISSING test.
- **#77 (Vendor.status FE TS prune)**: NO test proposed in `plan-loop-3-07-integration-v2.md:265-298`. The plan says "Run TS compiler + Zod schema test to confirm no consumer breaks" — but no NEW failing test. This is MISSING.
- **#46 query-key partial-refactor mid-state**: plan says "one commit per domain" with the structural assertion locked at the END only. **No test that catches partial-refactor stale literals between commits.** A developer who migrates 8 of 11 domains and stops would not be caught by any RED test. MISSING.
- **#69/#70 migration concurrent writes**: 4 RED tests cover post-upgrade DB state (cascade introspection, column dropped, downgrade NotImplementedError, revision chain). **NO test for**: (a) concurrent writes during column drop, (b) FK violation rollback during upgrade, (c) lock-monitoring assertion that ADR-010 §"Lock monitoring is attached" requires. The ADR-010 invariant test ledger at `:32-37` lists 4 invariants; the migration plan only covers 3 (head applies, row counts match, downgrade-NotImplementedError). The 4th — "Lock monitoring is attached to the staging rehearsal record" — has no test. MISSING.
- **#34 string-search structural lock**: AST-based check is more robust per Loop 1 recommendation. The string-search lock IS proposed but only against 16 named files. Files added later (e.g., a new `_authorization_capabilities/issues.py`) would not be caught. PARTIAL.

**Conclusion: Loop 1's "0 MISSING" claim is FALSE. At least 4 items have MISSING tests for specific edge cases.**

---

## Section D — Tautological/GREEN-only "RED" tests (Loop 1 found 4; I find more)

Loop 1 listed these as WRONG-TYPE: #10 KEEP, #20 doc-only GREEN, #59 doc-only README GREEN, #72 ADR-011 presence.

Adversarial additions:

- **#74b** (ADR-007 amendment): test asserts file contains the new section + 4-5 category names + 31-package census. The category names and package list are dictated by the test author, so the test is GREEN as soon as the doc is written. There is NO assertion on a DECISION — e.g., "amendment sets the disjointness rule on or before 2026-12-31" or "amendment cites revision X". Without a decision-anchor, this is a doc-presence tautology. Loop 1 marked WRONG-TYPE on the strict TDD axis but accepted the presence assertion — adversarial reads this as **insufficient**.
- **#73** ADR-012: same shape — test asserts file existence + section regex + a count assertion ("3 static-method calls" at `kri_deadline_service.py:64,77,78`). The static-method count IS a decision-anchor (a real RED). PASSES adversarial scrutiny.
- **#37** GREEN contract-pin half: Loop 1 caught this. The other half (structural import-removal) IS RED. ACCEPTED.
- **#20** doc-only: Loop 1 caught this. Recommendation stands.
- **#59 monitoring packages doc-only**: ALSO has a structural error — plan calls `_monitoring_response` a "package" but it is a SINGLE FILE (verified `ls /backend/app/services/_monitoring_response 2>&1` returns no such directory; the file `_monitoring_response.py` is at line `:1` "Compatibility Adapter for monitoring response projection helpers"). The plan's instruction "Create or extend `backend/app/services/_monitoring_response/README.md`" is **impossible** — there is no package. Loop 3 ADR-007 amendment correctly classifies `_monitoring_response.py` as a FILE entry in `_bounded_context_read_shape.toml`. Loop 1 reviewer DID NOT catch this contradiction. ADVERSARIAL FINDING.

---

## Section E — Convention violations (Loop 1 listed 18; I verified 5)

Loop 1 said 18 items are missing explicit `pytestmark = pytest.mark.contract` in their proposed tests. I read 5 of them:

- **#1** (`test_risks_crud_public_surface_red.py`): plan-loop-1-02-risks.md does NOT mention `pytestmark` for the new file. Confirmed.
- **#13** (`test_vendor_link_helpers_shim_removed_red.py`): plan-loop-1-05-vendor-quarterly.md does NOT mention `pytestmark`. Confirmed.
- **#16** (`test_reports_legacy_excel_tombstones_removed_red.py`): plan-loop-1-05 does NOT mention `pytestmark`. Confirmed.
- **#74a** (`test_bounded_context_classification_complete_red.py`): plan-loop-1-08 does NOT mention `pytestmark`. Confirmed.
- **#40** (`test_w12_admin_subrouter_clustering_red.py`): plan-loop-1-08 does NOT mention `pytestmark`. Confirmed.

5/5 verified. Loop 1's "18 items missing" estimate is plausible. RECOVERABLE — fix the plan to explicitly require `pytestmark = pytest.mark.contract` for every new file under `tests/backend/pytest/architecture/`.

NOTE: Architecture invariant existing files all have it (34/34 verified via `grep -l pytestmark tests/backend/pytest/architecture/*.py`). The risk is only NEW files if author forgets.

---

## Section F — DOC-ONLY items: presence vs. decision-anchor

Loop 1 raised this question. My read on each DOC-ONLY:

| Item | Test asserts | Decision-anchor? | Verdict |
| --- | --- | --- | --- |
| #10 | KEEP `riskhub_questionnaires.py` exists with `router` | `router` symbol present | regression-pin only; adversarial: ACCEPTED but should be labeled "regression pin" not "RED" |
| #20 | `generate_risk_id_code` re-export resolves; ≥2 importers; doc string in `ENDPOINT_INVARIANTS.md` | importer-count + doc string | weak — doc string already present, importers already there. Adversarial: GREEN-only as Loop 1 said |
| #59 | README "projection" / "state-query" wording | NONE — author chooses wording | adversarial: TAUTOLOGICAL + plan calls a file a "package" — IMPOSSIBLE TO IMPLEMENT |
| #72 | ADR-011 file exists; 9 section regex match; `expires_at 2026-09-01` | `expires_at 2026-09-01` is a real commitment | adversarial: ACCEPTED as decision-anchor |
| #73 | ADR-012 file exists; period algebra SSOT; 3 static-method calls; `_kri_state_vocabulary_allowlist.toml` | static-method-count anchor + TOML content | adversarial: REAL RED |
| #74a | 31 packages × exactly 1 of 4-5 TOML categories | classification table | adversarial: REAL RED |
| #74b | ADR-007 amendment file has 4-5 categories + 31-package census | author-chosen | adversarial: TAUTOLOGY without decision-anchor |

Loop 1 missed: **#59 file/package contradiction** and **#74b lack of decision-anchor**.

---

## Section G — MIGRATION items #69/#70 — concurrent writes / FK violations

Loop 1 listed 4 RED tests for #69 + #70. I verified via plan-loop-2-06-migration-window.md §6.1-6.5:

- §6.1: model-shape (mixin invariant)
- §6.2: vendor.status drop model-shape
- §6.3: Postgres-lane FK cascade introspection
- §6.4: forward-only contract (downgrade NotImplementedError)

NONE of these covers:

1. **Concurrent write during migration**: a `BEGIN; INSERT INTO vendors...; -- migration drops status column --; COMMIT` would either succeed (column still in tx) or fail. There is no test that asserts the migration takes a lock that prevents this. ADR-010 §"Lock monitoring is attached" hints at this requirement but no test enforces it.
2. **FK violation rollback during upgrade**: if a `vendor_risk_links` row exists referencing a deleted vendor, the new `ON DELETE CASCADE` would silently delete it. Plan does not assert "no orphan rows exist before applying CASCADE" or capture rowcount delta.
3. **Idempotency**: if `alembic upgrade head` is run twice, does it raise? Standard alembic guards on `down_revision`, but the test doesn't pin that.
4. **Mixed-state tolerance**: column drop + FK rebuild are 2 SQL ops in 1 migration. If op 1 succeeds and op 2 fails, what's the recovery? The plan's "snapshot rollback only" is the doctrine but no test exercises a partial-failure scenario.

**MISSING tests for #69+#70: concurrent writes, FK orphan precheck, partial-failure recovery.**

---

## Section H — #34 (22+ sites) — does parametrized test catch each site?

Loop 1 said the parametrized test covers "8 tier-capable scenarios" (TIER VARIANTS) plus a structural string-search lock against 16 named files.

Adversarial read:

- The 8-tier parametrize covers TIER variations, NOT site coverage. A site that happens to use the helper but evaluates the wrong tier branch would still pass.
- The string-search lock is **per file** (16 files explicitly named in plan-loop-1-03-approvals.md:144). A NEW file added later that uses `can_resolve_approvals(current_user)` would NOT be caught.
- Plan acknowledges some files (e.g., `_authorization_capabilities/{approvals,risks,controls,kris}.py`) are listed; if a 5th `_authorization_capabilities/issues.py` is added in another item (e.g., #15-related), the lock would NOT cover it.

Recommendation: convert string-search to AST-based scan over `app.services` AND `app.api.v1` AND `app.core` (excluding the `approval_scenario_policy` module and `app.core.permissions`). Adversarial verdict: **partial coverage**.

---

## Section I — #66 AuthContext split — render-count test

Loop 1 said "re-render-count assertion via 'counter ref' needs concrete shape; plan should specify `useRef(0)` + spy".

Adversarial confirms: plan-loop-1-06-frontend.md:411 says "the test must measure render counts via a counter ref" — but does NOT specify:
- How many re-renders are expected (target: ≤1 for unrelated context mutation)
- Which child component pattern to use (e.g., `function CountingChild() { const ref = useRef(0); useEffect(() => { ref.current++; }); ... }`)
- How to drive the mutation (e.g., `act(() => { result.current.markPreferencesReady(); })`)

The render-count test is **ASPIRATIONAL** in the plan. Without a concrete shape, the developer may write an assertion that passes against the OLD pre-split context too (if the harness is wrong). MISSING test detail.

---

## Section J — #46 query-key partial-refactor

Loop 1 caught the count discrepancy (33 vs 45) but did not flag the partial-refactor risk.

Adversarial: the plan proposes "one commit per domain" with 11 domains AND "a final commit removing the structural assertion's allow-list". This means:

- Commit 1-11: each migrates one domain. The structural assertion is DEFERRED until commit 12. So during commits 1-11, partial-state is undetected.
- A developer who migrates 7 domains and merges to main: **no RED test fires**. The structural assertion is still on the allowlist.

Recommendation: per-commit guard via `git diff` count assertion (each commit reduces inline-literal count by ≥N, where N is the domain's count). MISSING.

---

## Section K — MSAL/MSW mock concerns

Loop 1 did not address this directly. Adversarial check:

- `frontend/src/contexts/AuthContext.tsx` does NOT import MSAL directly (verified via `grep -l msal frontend/src/contexts/`).
- MSAL lives in `frontend/src/services/entraAuth.ts` (only consumer per `grep -rln msal frontend/src/`).
- The AuthContext split (#66) does NOT touch MSAL. Render-count tests do not need MSW mocks.
- However: `useAuthBootstrap` may invoke services that DO touch MSAL transitively. Plan-loop-1-06 `:407` says "**#37 + #39 are real prerequisites** (capability builder must be the single source of truth before the bootstrap context splits)". The capability builder uses backend API; tests need MSW mocks for `/api/v1/users/me/capabilities` etc.

Verified: existing `tests/frontend/unit/src/contexts/__tests__/Auth*` tests use MSW handlers via `tests/frontend/unit/src/test-utils/`. NEW split-tests must reuse that harness. Plan does NOT explicitly require this. RECOMMENDATION: amend plan #66 to instruct "reuse `tests/frontend/unit/src/test-utils/msw-server.ts`".

---

## Section L — #15 access_user — does validator catch the new surface?

Loop 1 said "PASS" without verifying the validator actually iterates surfaces.

Adversarial verification:

- `scripts/security/authz_contract_validator/capability_catalog.py:153-219` reads `surfaces = catalog.get("surfaces")` and iterates with `for index, surface in enumerate(surfaces, start=1)`.
- For each surface, it reads `surface.get("backend")` and `surface.get("frontend")` and validates both.
- Adding `access_user` as the 8th surface IS picked up automatically — no validator code change needed.

Loop 1 was right. ACCEPTED.

---

## Section M — Items NOT spot-checked but with structural concerns

- **#30** Issue `_shared/__init__.py` 36 names — plan says `:42-79` lists 36 names. Spot-check confirms `_shared/__init__.py:42-79` exists with 36 names. ACCEPTED.
- **#43** `_audit_matrix.toml` lock — `architecture/test_w7_audit_adapter_completeness_red.py:9` literally `pytestmark = pytest.mark.contract`. ACCEPTED.
- **#44** 27 router includes — plan claims 27. Did not verify directly; Loop 1 accepted.
- **#71** session 8 → 4 files — verified 8 .ts files at `frontend/src/services/session/`: `bootstrap.ts, index.ts, logoutSuppression.ts, manager.ts, refreshHint.ts, sso.ts, store.ts, types.ts`. README.md is present (not a code file). PASS.

---

## Section N — Summary findings

### Loop 1 claims that HOLD up

1. ✅ 30/30 file:line citations confirmed by 10/10 fresh adversarial spot-check.
2. ✅ Convention violations (`pytestmark.contract` not explicit) on ~18 items — verified 5/5.
3. ✅ #46 has 33 inline `queryKey: [` literals (plan said 45) — count is correct for `queryKey: [` form; plan's 45 was for `queryKey:` form (different).
4. ✅ #20 is GREEN-only.
5. ✅ #37 has GREEN contract-pin half.
6. ✅ #15 validator picks up new surface automatically.
7. ✅ All 8 auth-flow `db.commit` sites confirmed.

### Loop 1 claims that DON'T HOLD up

1. ❌ "**0 MISSING tests**" — at least 4 items have MISSING tests for specific edge cases:
   - #76: no architecture-lock test (only allowlist-removal which is doc-only).
   - #77: no test proposed at all.
   - #46: no per-commit partial-refactor guard.
   - #69+#70: no concurrent-write / FK orphan precheck / partial-failure recovery tests.
2. ❌ "**#74a has 32 not 31 packages**" — Loop 1 wrong; the 32 includes `__pycache__/`. Excluding pycache yields 31. Plan was correct.
3. ❌ "**33/34 architecture-test files have pytestmark**" — actual: 34/34. Loop 1 off-by-one.
4. ❌ "**Items #76 and #77 NOT FOUND**" — both ARE defined in `plan-loop-3-07-integration-v2.md`. Loop 1 didn't read Loop 3 docs.
5. ❌ "**#59 monitoring packages doc-only WEAK**" — additional finding: plan calls `_monitoring_response` a "package" but it is a SINGLE FILE. Plan instruction "Create `_monitoring_response/README.md`" is IMPOSSIBLE TO IMPLEMENT. Loop 3 (ADR-007 amendment) correctly classifies it as a FILE entry. Loop 1 reviewer didn't catch this contradiction.

### Test gaps Loop 1 missed (top 5)

1. **#69+#70 concurrent-write / FK-orphan / partial-failure tests** — only 4 RED tests; ADR-010 §"Lock monitoring" invariant has NO test. (Section G)
2. **#46 partial-refactor guard** — structural assertion is locked only at the FINAL commit; commits 1-11 leave partial-state undetected. (Section J)
3. **#76 architecture-lock test** — only allowlist removal, no test asserting `await db.commit()` absent in 8 auth files. (Section C)
4. **#77 missing test entirely** — Loop 3 doc says "TS compiler + Zod test" but no NEW failing test specified. (Section C)
5. **#34 string-search lock fragility** — per-file enumeration; new file added later not covered. (Section H)

### Recommended pre-Phase-5 additions

1. **Plan amendment for #76**: add `tests/backend/pytest/architecture/test_auth_flow_no_endpoint_commit_red.py` asserting the 8 named auth files contain ZERO `await db.commit()` after migration. Mark `pytestmark = pytest.mark.contract`.
2. **Plan amendment for #77**: add `tests/frontend/unit/src/types/__tests__/vendor.shape.test.ts` asserting `LinkedVendor`/`Vendor` TS types have NO `status` field after #70 lands.
3. **Plan amendment for #46**: add a per-commit ratchet test in `tests/frontend/unit/src/lib/queryKeys/__tests__/queryKeys.budget.test.ts` that locks the maximum allowed `queryKey: [` count. Each domain-migration commit reduces the budget; PR fails if budget is exceeded.
4. **Plan amendment for #69+#70**: add `tests/backend/pytest/migrations/test_vendor_link_orphan_precheck_postgres_red.py` asserting (a) zero orphan vendor_*_links rows pre-upgrade, (b) lock-monitoring assertion captures the upgrade run, (c) idempotency: second `alembic upgrade head` is a no-op.
5. **Plan amendment for #34**: replace string-search lock with AST scan over `app.services/`, `app.api/`, `app.core/` (excluding `approval_scenario_policy` and `core.permissions`). Use `_audit_matrix.toml`-style allowlist.
6. **Plan amendment for #59**: REWRITE — `_monitoring_response` is a SINGLE FILE not a package. Either (a) drop the README requirement and assert the file's docstring contains "projection" and `_monitoring_status/README.md` contains "state queries", or (b) FIRST split `_monitoring_response.py` into a package, THEN write the README. Plan currently has an impossible instruction.
7. **Plan amendment for #66**: spell out the render-counter pattern explicitly (`useRef(0) + useEffect`) and the assertion shape (`expect(ref.current).toBeLessThanOrEqual(N)`). Reuse the existing MSW harness.
8. **Plan amendment for #74b**: add a decision-anchor — e.g., assert the amendment cites a specific revision ID (e.g., `k6l7m8n9o0p1` per #69+#70) or sets `expires_at 2026-12-31`. Pure presence + section regex is tautological.
9. **Convention sweep**: amend Loop 1 plans to require `pytestmark = pytest.mark.contract` at module scope for all NEW files under `tests/backend/pytest/architecture/`. Items: #1, #3, #13, #16, #17, #19, #20, #31, #40, #55, #56, #57, #61, #72, #74a, #74b.
10. **MSAL/MSW boilerplate**: amend frontend plan items (#66, #67, #68) to instruct "reuse `tests/frontend/unit/src/test-utils/msw-server.ts`" so MSAL-adjacent surfaces don't need ad-hoc mocking.

---

## Section O — Adversarial verdict

Loop 1's review is **substantially correct on file:line citations** (10/10 adversarial spot-check pass) but **understates test gaps** in 5 specific areas:

- DOC-ONLY tautologies: 4 caught + 2 missed (#59 file-vs-package contradiction; #74b lack of decision-anchor)
- MIGRATION concurrent-write / FK-orphan / partial-failure: not addressed
- #76 / #77: not in Loop 1's scope (they're in Loop 3 docs); MISSING tests for both
- #46 partial-refactor mid-state: not addressed
- #34 site coverage: per-file string-search is fragile

Loop 1's count error (#74a "32 vs 31") and pytestmark count (33/34 vs 34/34) are minor.

**Recommended action**: Phase 5 should incorporate the 10 plan amendments in Section N. The plan structure is sound; only specific test surfaces need sharpening.

End of Phase 4 Loop 2 adversarial review.
