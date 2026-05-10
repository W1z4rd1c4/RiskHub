# RiskHub Architecture Cleanup — Resolution Plan

| Field | Value |
| --- | --- |
| Date | 2026-05-09 |
| Source audit | `.planning/audits/2026-05-09-deepening-audit.md` |
| Developer response | `.planning/audits/developer answer.md` |
| Total items | 79 (74 audit + #75 bonus + #45a/b + #74a/b + #76 + #77 splits) |
| Estimated effort | 727 hours (~18 dev-weeks single-developer @ 40h/week) |
| Calendar window | ~4.5 months (start 2026-05-09 → completion ~2026-09-23) |
| Pacing | Standard (40h/week) — intensive pacing rejected per Phase 4 fatigue analysis |
| Methodology | 7-phase orchestration, 104 Opus agent invocations |
| Mode | TDD; single sequential developer; doc/lock-only Reject arguments invalid; Defers planned |

## Table of Contents

- [Section 1 — Header, Executive Summary, Methodology, Scope, Glossary](#riskhub-architecture-cleanup--resolution-plan)
  - [Executive Summary](#executive-summary)
  - [Methodology](#methodology)
  - [Scope](#scope)
  - [Phase 4 Adversarial Corrections Summary](#phase-4-adversarial-corrections-summary)
  - [Glossary](#glossary)
- [Section 2 — Master Sequence + Wave Structure + Critical Path + Atomic Clusters + Hub Waves](#section-2--master-sequence--wave-structure--critical-path--atomic-clusters--hub-waves)
  - Master Sequence (79 items)
  - 9-Wave Release Structure (Waves 1, 2, 3, 4, 5, 6a, 6b, 7, 8)
  - Critical Path Analysis (`#2 → #8 → #28 → #30`)
  - Atomic Clusters (`#24+#51`, `#56+#61`, `#69+#70`)
  - Hub Waves (Approvals, Frontend query-keys, Endpoints monitoring, Issues critical path, Auth + Session)
  - Effort Distribution
- [Section 3 — Per-Item Recipes Part 1 (Waves 1-3, Slots 1-28)](#section-3--per-item-recipes-part-1-waves-1-3-slots-1-28)
  - Wave 1 — ADRs Ratified (Slots 1-4): #72, #73, #74a, #10
  - Wave 2 — P1 Quick Wins + #76 Auth Migration (Slots 5-14): #57, #37, #12, #13, #1, #19, #11, #14, #15, #76
  - Wave 3 — P2 Dead-code A (Slots 15-28): #2, #3, #4, #5, #6, #7, #41, #50, #52, #53, #54, #75, #18, #20
- [Section 4 — Per-Item Recipes Part 2 (Waves 4-5, Slots 29-58)](#section-4--per-item-recipes-part-2-waves-4-5-slots-29-58)
  - Wave 4 — P2 Dead-code B + Doc-Contract Cluster (Slots 29-45)
  - Wave 5 — P2 Chains + ADR-007 Amendment Text (Slots 46-58, plus #43, #44 cross-domain pair)
- [Section 5 — Per-Item Recipes Part 3 (Waves 6-8, Slots 59-79+) + Migration Window Detail](#section-5--per-item-recipes-part-3-waves-6-8-slots-59-79--migration-window-detail)
  - Wave 6a — P3 Infrastructure + #77a (Slots 59-69)
  - Wave 6b — P3 Capability + Admin (Slots 70-73)
  - Wave 7 — P4 Deferred (Slots 74-77)
  - Wave 8 — Migration + FE TS Cleanup (Slots 78-80, including #69+#70 atomic, #77b)
  - Detailed Migration Window (#69+#70 — 9-step sequence, 8 RED tests, snapshot/restore, postgres-lane)
- [Section 6 — ADR Drafts (Inline)](#section-6--adr-drafts-inline)
  - ADR-011: Auth Scheme and Session Model (item #72)
  - ADR-012: KRI Time-Series Period Algebra (item #73)
  - ADR-007 Amendment: Read-Shape, Workflow-Paired, Adapter, and Cross-cutting Categories (items #74a, #74b)
- [Section 7 — Registers and Supporting References](#section-7--registers-and-supporting-references)
  - 7.1 README & Lock Change Register
  - 7.2 Risk Register
  - 7.3 Rollback Register
  - 7.4 Pre-commit Gate Runbook
  - 7.5 CI Strategy
  - 7.6 Capability Contract Validator Schedule
  - 7.7 Effort & Pacing
  - 7.8 Open Questions Register (3 unresolved Phase 5+ items)
  - 7.9 Appendix — Source Materials Index (Phase 1-7 artifacts)

## Executive Summary

This plan resolves 79 architectural-debt items uncovered by the
2026-05-09 deepening audit and the developer's structured response.
Items span every layer of the RiskHub backend (services, endpoints,
authorization helpers, capability contract, audit emitters, vendor
link models), the React frontend (AuthContext, query-key factories,
session module, dashboard widgets), the architecture-lock TOML
registries, the ADR set, and the supporting README/documentation
surface. The plan covers the entire developer-answer matrix without
exclusion: `Reject` items that the developer argued away on doc/lock
grounds are still executed as document-only verifications, and every
`Defer` item is scheduled — none are dropped.

The approach is TDD-first throughout. Every item — including
documentation moves and lock relaxations — lands as a red→green pair.
Ordering follows a single sequential developer working through nine
land-gates: ADRs first (so dependents plan against ratified text),
then P1 quick-wins, then the bulk of P2 dead-code and shim deletes,
then the P2 consolidation chains (issues, monitoring, approvals),
then the P3 medium-tier work (query-key factories, admin builder,
audit instrumentation), and finally the P4 architectural changes
(AuthContext split, PrivilegeContext, ownership resolver factory,
session module merge) and the single Postgres migration window for
`AbstractVendorLink` + `Vendor.status` drop. The atomic clusters
(`#24+#51`, `#56+#61`, `#69+#70`) land contiguously in the same
commit; hub waves (`#9 → #34 → #60`, `#46 → {#65, #67, #68}`,
`#17 → #49 → #59`) ratchet additively.

The longest dependency chain in the DAG is the issues-domain barrel
prune: `#2 → #8 → #28 → #30` (4 nodes;
`plan-loop-2-08-master-sequence.md:158`). The deepest convergence
sink is `#71` (frontend session merge), which depends on
`{#47, #66, #72}` plus `#66`'s own `{#37, #39}` prereqs. Five
items carry the highest landing-time risk: `#69+#70` (single
Postgres migration window with forward-only Alembic per ADR-010 and
4 FK rebuilds), `#34` (privilege-tier helper migrating 22+ call
sites across 16 files per `plan-loop-1-03-approvals.md:148-164`),
`#66` (AuthContext provider split with re-render isolation tests),
`#76` (8 auth-flow `db.commit` migrations with hard 2026-09-01
deadline anchored in `_endpoint_commit_allowlist.toml`), and `#46`
(query-key factory promotion across 33 inline keys in 10 per-domain
commits).

Three new ADRs land as part of the plan: ADR-011 (Auth Scheme and
Session Model, item `#72`), ADR-012 (KRI Time-Series Period Algebra
and Deadline Classification, item `#73`), and an amendment to
ADR-007 split across `#74a` (31-package census + 5 new
`_bounded_context_*.toml` registries) and `#74b` (amendment text
referencing the post-#61 32-package final state). The plan
introduces approximately 63 new architecture lock tests across the
gates (counted across the per-recipe `_red.py` filenames in
`recipe-01..08-*.md`) and 7 NEW TOML registries
(`_bounded_context_{write_side,read_shape,workflow_pairs,adapters,policy}.toml`,
`_kri_state_vocabulary_allowlist.toml`, plus relaxations of the
existing `_archive_allowlist.toml`, `_naming_allowlist.toml`,
`_capabilities_all_allowlist.toml`, `_endpoint_commit_allowlist.toml`,
`_get_db_override_whitelist.toml`).

The capability-contract validator
(`scripts/security/validate_authz_capability_contract.py`) runs as
part of the commit gate for approximately 42 of the 79 items — every
item whose body touches `docs/security/authorization-capability-contract.{md,json}`,
`docs/security/capability-catalog.json`, or the `tests/frontend/unit/src/authz/`
invariant test home. The validator-touching schedule is itemised in
Section 7.6 (validator schedule register).

## Methodology

Section 1's analysis and the per-item recipes were produced through a
seven-phase orchestrated planning effort using parallel Opus subagents
under the orchestration model defined in `CLAUDE.md`. The main thread
acted as orchestrator and synthesizer; no investigation or file reads
of substance ran in the main thread.

- **Phase 1 — Context load (8 parallel Opus agents)**: built the
  empirical baseline against commit `1ee872a4` on `main`. One agent
  per surface: backend services
  (`01-backend-services.md`), backend endpoints
  (`02-backend-endpoints.md`), frontend architecture
  (`03-frontend-architecture.md`), architecture locks
  (`04-architecture-locks.md`), ADRs and capability contract
  (`05-adrs-capability-contract.md`), test surface
  (`06-test-surface.md`), migrations and schema
  (`07-migrations-schema.md`), documentation surface
  (`08-documentation-surface.md`).
- **Phase 2 — Verification (2 adversarial loops × 8 agents = 16
  agents)**: every audit finding re-checked against current code.
  Loop A confirmed first-pass classifications
  (`verify-loop-a-01..08-*.md`); Loop B was deliberately briefed that
  Loop A produced false flags and instructed to disagree on every
  contestable item (`verify-loop-b-01..08-*.md`). Loop B's
  corrections are the ground truth for the staleness-prone findings
  flagged in `memory/feedback_audits_validate_current_code.md`.
- **Phase 3 — Planning (3 loops × 8 agents = 24 agents)**: Loop 1
  produced per-domain TDD step skeletons
  (`plan-loop-1-01..08-*.md`); Loop 2 produced cross-domain
  artefacts — master DAG, execution order, lock-conflict matrix,
  doc-touch matrix, validator schedule, migration window, hidden
  prereqs, master sequence
  (`plan-loop-2-01..08-*.md/.yaml`); Loop 3 produced
  pre-commit gates, CI strategy, rollback register, risk register,
  README/lock register, ADR drafts, integration v2, cohesion review
  (`plan-loop-3-01..08-*.md`).
- **Phase 4 — Plan review (2 loops × 8 agents = 16 agents)**:
  adversarial review of the Phase-3 plan. Loop 1 focused on
  constructive challenges (`review-loop-1-01..08-*.md`); Loop 2 was
  briefed that Loop 1 produced false flags and re-checked every
  flag adversarially (`review-loop-2-01..08-*.md`). Phase 4 is the
  source of the major effort escalations recorded in §"Phase 4
  Adversarial Corrections Summary" below.
- **Phase 5 — Per-item TDD recipe drafting (8 agents)**: full
  red→green→refactor recipes for all 79 items, packaged as 8 per-domain
  recipe files (`recipe-01-issues.md` through `recipe-08-crosscut-adrs.md`).
- **Phase 6 — Empirical recipe verification (8 agents)**: every cited
  `file:line` in every recipe re-verified against the working tree at
  `1ee872a4`; every "would-fail-today" assertion re-derived from the
  actual file content; every implementation path checked against the
  architecture-lock TOMLs (`verify-recipe-01..08-*.md`).
- **Phase 7 — Final assembly (7 section owners + 1 merger)**: this
  document. Section owners produced their assigned sections in
  parallel; the merger reconciled cross-section references and
  emitted the final plan.

Total agent invocations: 8 (Phase 1) + 16 (Phase 2) + 24 (Phase 3) +
16 (Phase 4) + 8 (Phase 5) + 8 (Phase 6) + 24 (Phase 7) =
**104 parallel Opus invocations** across 7 phases. Every finding in
this plan has been adversarially re-reviewed at least once and
empirically re-verified at least once against the working tree at
commit `1ee872a4`.

### How to read this document

This plan is structured as a layered reference. Most readers will not
read it linearly.

- **Section 1 (this section)** — orientation. Read once.
- **Section 2 — Master sequence**. The 79-item ordering with
  dependency edges, atomic clusters, hub waves, gate boundaries, and
  per-item effort labels. Read second to internalise the
  pace and the critical path. The master table at
  `plan-loop-2-08-master-sequence.md:39-117` is the canonical sequence;
  Section 2 reproduces it with Phase-4 effort corrections applied.
- **Sections 3–5 — Per-item TDD recipes**. The day-by-day reference.
  Each recipe contains the red test, the green implementation, the
  refactor pass, the lock-relaxation tuple, and the validator-touch
  decision. Sections 3–5 are organised by gate (3 = ADRs + P1 wave;
  4 = P2 dead-code + chains + monitoring + atomic clusters; 5 = P3
  medium-tier + P4 deferred + migration window).
- **Section 6 — ADR drafts**. Full ADR-011, ADR-012, and the ADR-007
  amendment text, ready to copy into `docs/adr/`. Read alongside
  items `#72`, `#73`, `#74a`, `#74b`. Source: `plan-loop-3-06-adr-drafts.md`.
- **Section 7 — Registers**. README/lock change register
  (`plan-loop-3-05-readme-lock-register.md`), risk register
  (`plan-loop-3-04-risk-register.md`), rollback register
  (`plan-loop-3-03-rollback-register.md`). Operational-discipline
  reference; not read top-to-bottom but indexed during incident
  response.
- **Section 7.4–7.9 — Ancillary references**. Pre-commit gate runbook
  (`plan-loop-3-01-precommit-gates.md`, Section 7.4), CI strategy
  (`plan-loop-3-02-ci-strategy.md`, Section 7.5), validator schedule
  (`plan-loop-2-05-validator-schedule.md`, Section 7.6), migration window
  plan (`plan-loop-2-06-migration-window.md`, Section 7.7), doc-touch
  matrix (`plan-loop-2-04-doc-touch-matrix.md`, Section 7.8),
  lock-conflict matrix (`plan-loop-2-03-lock-conflict-matrix.md`,
  Section 7.9).

## Scope

### In-scope

- Every audit finding from `.planning/audits/2026-05-09-deepening-audit.md`
  sections 6.1, 6.2, 6.3, plus the developer-flagged Bonus item `#75`,
  regardless of the developer's verdict (`Accept`, `Accept with
  modification`, `Reject`, `Defer`, `Needs investigation`).
- Every documentation surface touched by an in-scope item: the eight
  `docs/*.md` indices (`README.md`, `BUSINESS_LOGIC.md`,
  `DOCUMENTATION_TREE.md`, `ARCHITECTURE.md`, `STATE_MACHINES.md`,
  `STRUCTURE.md`, `CONCERNS.md`, `CONVENTIONS.md`), every package-level
  `README.md` whose contract changes, every `docs/adr/*.md` whose
  decision is amended, and `docs/security/authorization-capability-contract.{md,json}`
  + `docs/security/capability-catalog.json`.
- Every TOML registry under
  `tests/backend/pytest/architecture/`: existing
  (`_archive_allowlist.toml`, `_naming_allowlist.toml`,
  `_capabilities_all_allowlist.toml`, `_endpoint_commit_allowlist.toml`,
  `_get_db_override_whitelist.toml`, `_reserved_modules.toml`) and
  the seven NEW registries introduced by the plan
  (`_bounded_context_{write_side,read_shape,workflow_pairs,adapters,policy}.toml`,
  `_kri_state_vocabulary_allowlist.toml`).
- Every red→green test pair, including pure-doc-only tests for the
  two `Reject` items (`#10`, `#57`) and the two ADR-only items
  (`#72`, `#73`). The Phase-4 review eliminated the "doc/lock-only
  Reject without test" pattern: every plan item ships a
  red-then-green test, even if the test is a pure structural lock.

### Out-of-scope

- **Playwright E2E tests**: explicitly excluded by user direction. No
  recipe in this plan adds an E2E test. Frontend behaviour is verified
  through Vitest unit tests, RTL component tests, and Zod schema
  parser tests. Backend behaviour is verified through `client_factory`
  pytest tests, architecture lock tests, and the capability-contract
  validator subprocess.
- **Postgres-marked pytest unrelated to migrations**: only the
  `#69+#70` migration window has a Postgres rehearsal cycle; all other
  items rely on the SQLite default lane. The Postgres lane plumbing is
  scheduled within `#69+#70`'s budget per
  `plan-loop-2-06-migration-window.md:534`.
- **Speculative refactors not in the original audit**: any "while
  we're here, also fix X" suggestion that surfaced during Phase 1–6
  but was not in the audit or developer-answer matrix is excluded. If
  the developer wants to expand scope mid-execution, they fork a new
  audit cycle.

### Constraints

- **ADR-001 (Capabilities seam)** is unchanged; capabilities remain on
  `{Risk,Control,Vendor,Issue,KRI}Read.capabilities` with frontend
  invariant home `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts`,
  per `CLAUDE.md` and `docs/security/authorization-capability-contract.md`.
- **ADR-002 (Service-owned transactions)** is the law for every
  endpoint commit migration, including `#76`. Auth-flow exemptions
  carry hard `expires_at = 2026-09-01`; the lock cap drops to 0 after
  the sunset.
- **ADR-005 (Archive semantics)** is honoured by `#69+#70`: vendor
  links use forward-only archive state; no soft-delete columns added.
- **ADR-010 (Forward-only Postgres migrations)** is honoured by
  `#69+#70`: the Alembic revision adds the new mixin+constraints in a
  forward-only migration and drops `Vendor.status` in the same upgrade
  per `plan-loop-2-06-migration-window.md:160`.
- **CLAUDE.md / AGENTS.md conventions** are honoured: backend API
  tests use `client_factory` from `tests/backend/pytest/conftest.py`;
  any local `dependency_overrides[get_db]` block requires an entry in
  `_get_db_override_whitelist.toml`; architecture-lock tests run via
  `make -f scripts/Makefile test-architecture-locks`; the
  capability-contract validator runs via
  `python3 scripts/security/validate_authz_capability_contract.py`.

## Phase 4 Adversarial Corrections Summary

The Phase-4 adversarial loop overrode several Phase-3 estimates and
several Phase-3 implementation paths. The major corrections that
shaped the plan:

- **`#34` effort: M → XL (28-32h)** —
  `review-loop-2-06-effort-adversarial.md:48-73` re-counted 22+
  call-site migrations across 16 files
  (`plan-loop-1-03-approvals.md:148-164`). Loop-3's M (8h) was
  insufficient; the realistic budget is 11h for the 22 mechanical
  migrations alone, plus 6h fixture matrix, plus 2h dataclass design,
  plus 3h validator iteration, plus 2h two-round review. **Verdict:
  XL (32h).**
- **`#74a` effort: M → XL (26-30h)** —
  `review-loop-1-06-effort-audit.md:69-79` and
  `review-loop-2-06-effort-adversarial.md:75-96` re-counted **31
  packages** (Phase-1 said 13). Each package needs a 3-hop
  reachability audit and classification decision. The 5 NEW
  `_bounded_context_*.toml` registries scaffold + lint + lock test +
  13-orphan classification developer sign-off + ADR text amendment +
  2 review rounds totals 26-30h. **Verdict: XL (28h).**
- **`#69+#70` effort: L+ → XL (35-42h)** —
  `review-loop-2-06-effort-adversarial.md:112-143` added Postgres lane
  CI plumbing (3-4h, not in Loop-1 budget), Postgres rehearsal cycle
  (4h), 70-test smoke verification (3-4h), and explicit two-round
  review (4h). The migration window itself is 4 NEW Phase-4 RED tests
  per `plan-loop-2-06-migration-window.md:596,657`: cascade-correctness
  Postgres-lane test, FK `confdeltype='c'` lock test,
  `vendors.status absent` schema test, `ix_vendors_status absent`
  index test. **Verdict: XL (40h) with explicit 4h Postgres rehearsal
  budget.**
- **`#46` effort: L → L+ (24-28h)** —
  `review-loop-2-06-effort-adversarial.md:145-162` confirmed Loop-B's
  empirical count: **33 inline query-keys (NOT 45)** across 10
  per-domain commits. Each commit carries 30 min of commit-prep + 1h
  reviewer feedback overhead, adding ~15h to Loop-1's 16-20h baseline.
  The plan keeps the 10-commit-per-domain strategy but budgets a
  per-commit ratchet on the invariant test (`test_query_keys_are_factory_only_red.py`).
  **Verdict: L+ (24-28h) with explicit per-commit budget ratchet.**
- **`#76` priority: P3 → P1; effort: M → L** —
  `plan-loop-3-07-integration-v2.md:178-194` confirmed 8 auth-flow
  `db.commit` sites (`auth/refresh.py:177`, `auth/logout.py:101,132`,
  `auth/sso.py:170`, `auth/_sso_helpers.py:48`,
  `auth/password.py:128,161`, `auth/demo.py:67`) carrying
  `expires_at = 2026-09-01`. The Phase-4 review escalated this from
  P3 to P1 because the deadline blocks every release after that date;
  effort lifted from M to L because each site has potential
  cross-session lock or logout-suppression coupling per
  `plan-loop-3-07-integration-v2.md:609-611`. **Verdict: L (8-12h)
  with ½-day spike confirming ~30 min/site holds.**
- **`#74` split into `#74a` + `#74b`** —
  `plan-loop-3-07-integration-v2.md:96-115` split the original
  ADR-007 amendment into a CENSUS phase (`#74a`: enumerate the 31
  packages, draft 5 new TOML registries, scaffold the lock test) and
  an AMEND phase (`#74b`: write the ADR-007 amendment text against the
  ratified census). `#74b` carries a hard cross-domain dependency on
  `#61` (the `graph_directory` move adds the 32nd package). The split
  resolves the v1 "infeasible Seq 4" issue.
- **`#77` split into `#77a` + `#77b`** —
  `plan-loop-3-07-integration-v2.md:204-220` split the
  `Vendor.status` FE TS cleanup into a pre-migration
  characterization test (`#77a`: pin current `vendor.status` consumer
  count) and a post-migration cleanup (`#77b`: prune the TS+Zod
  schemas after `#69+#70` lands). The split lets `#77a` land before
  the migration window and `#77b` land after.
- **ADR-011 Probe 1 fix** — Phase-3 Loop-A claimed the `require_permission`
  pattern lives at ADR-001's seam. Phase-3 Loop-B corrected this:
  `require_permission(action, resource)` is the FastAPI dependency
  factory at `core/security.py:170` (not ADR-001's invariant; ADR-001
  is the capability-contract seam). The ADR-011 draft at
  `plan-loop-3-06-adr-drafts.md:47-51` cites the corrected location.
- **ADR-007 amendment: "EXACTLY ONE" → "PRIMARY classification +
  many-to-one for right-halves"** — Phase-4 review at
  `review-loop-2-07-adr-adversarial.md` rejected the original
  "exactly-one classification" rule because right-half packages
  (e.g., `_orphaned_items`, `_notification_inbox`) legitimately pair
  with multiple bounded contexts. The amendment uses a PRIMARY
  classification (the package's load-bearing context) plus a
  many-to-one paired-with mapping for right-half packages.
- **5th category: `Cross-cutting` (NOT `Core`)** — `Core` collides
  with the existing `backend/app/core/` directory and would force a
  `_bounded_context_core.toml` registry that contradicts the
  package's namespace meaning. `Cross-cutting` is the 5th category;
  the registry is `_bounded_context_policy.toml` per
  `plan-loop-1-08-crosscut.md:646-672` (workflow_pairs, adapters,
  policy, write_side, read_shape).
- **`_orphaned_items` + `_notification_inbox`: Workflow-paired with
  `_identity_access_lifecycle`** — these three packages share the
  identity-access lifecycle workflow per
  `plan-loop-1-08-crosscut.md:602-613`. The `_bounded_context_workflow_pairs.toml`
  registry pairs them explicitly so the lock test can assert the
  trio lands together.
- **`#65` critical fix: literal flat schemas (NOT `.merge()`/
  `.extend()`)** — Phase-3 Loop-B caught that the Zod `crudCapabilitySchema`
  base cannot be implemented via `.merge()` or `.extend()`: the
  capability-contract parser at
  `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts` does NOT
  walk the Zod schema tree. Each domain schema must inline the
  literal `{ create, update, delete, archive, view, view_archived }`
  shape. The `recipe-07-frontend-authz.md` recipe enforces literal
  flat schemas across all 5 domain Zod files.
- **`#12` narrowing target: `HTTPException` (NOT `AuthorizationError`)** —
  Phase-3 Loop-B at `plan-loop-1-07-endpoints.md:67-110` corrected
  the narrowing target. The blanket-except in `users/summary.py:48,62`
  catches the result of `ensure_business_view_access`, which raises
  `HTTPException(403)`, not a custom `AuthorizationError`. The narrow
  except is `except (HTTPException, SQLAlchemyError):`, not the
  Loop-A draft `except AuthorizationError`.
- **`#62` audit-cardinality: PER-ROW EVENTS (matches existing
  canonical)** — Phase-3 Loop-B at `plan-loop-1-04-kris.md:233-243`
  confirmed the per-row audit-event cardinality. The behavioural test
  asserts 3+1+1 events (3 unlinks + 1 link + 1 final-state event) for
  a 3→2-vendor reassignment. The roll-up alternative was rejected
  because it diverges from the existing `link_vendor_target` /
  `unlink_vendor_target` audit pattern.
- **`#73` SSOT: `_kri_history/constants.py:2` (delete duplicate at
  `_config/lookup.py:26`)** — ADR-012 pins
  `backend/app/services/_kri_history/constants.py:2 REPORTING_GRACE_DAYS = 15`
  as the single source of truth. The duplicate at
  `backend/app/services/_config/lookup.py:26 ConfigDefaults.REPORTING_GRACE_DAYS`
  is removed; `kri_deadline_service.py:52` and
  `kri_deadline_support.py:36` re-import from the SSOT. The lock test
  `test_kri_state_vocabulary_complete_red.py` enforces the absence of
  the duplicate constant.

## Glossary

- **TDD (Test-Driven Development)**: every commit lands as a
  red→green pair. The red commit introduces a failing test; the green
  commit makes it pass without modifying the test. Refactor commits
  may follow but must keep all tests green. The TDD discipline is
  enforced in this plan even for documentation and lock-only items.
- **Atomic cluster**: two or more items that must land in the same
  commit. The plan has three: `#24+#51` (KRI linked-vendors barrel +
  KRI value-application shim, shared docs/contract citations);
  `#56+#61` (`directory_identity_service` shim + `graph_directory`
  adapter package, shared docs/contracts); `#69+#70`
  (`AbstractVendorLink` mixin + `Vendor.status` drop, single Postgres
  migration window). Atomic clusters cannot be split across PRs.
- **Hub wave**: a sequence of items where each member additively
  extends the previous member's contract. The plan has three:
  Approvals privilege tier (`#9 → #34 → #60`), Frontend query-keys
  (`#46 → {#65, #67, #68}`), Endpoints monitoring (`#17 → #49 → #59`).
  Hub waves can be split across PRs, but each member must land in
  sequence.
- **Validator-touching**: an item is validator-touching if its body
  modifies `docs/security/authorization-capability-contract.{md,json}`,
  `docs/security/capability-catalog.json`, or any line cited by
  `scripts/security/validate_authz_capability_contract.py`. The
  validator runs as part of the commit gate for every
  validator-touching item; the schedule is in
  `plan-loop-2-05-validator-schedule.md`.
- **Doc/lock-only Reject**: an audit finding the developer rejected
  on the grounds that the file should be kept and only documentation
  or lock entries should record the rejection. The plan executes
  every doc/lock-only Reject as a document-only verification with a
  red→green structural test (e.g., `test_riskhub_questionnaires_module_present_red.py`
  for `#10`, `test_quarterly_comparison_service_facade_red.py` for `#57`).
  The Phase-4 review explicitly invalidated the argument that
  "doc/lock-only" items can ship without a test.
- **`sensitive_change_paths`**: the field in
  `docs/security/authorization-capability-contract.json` listing
  every code path whose modification requires a contract revision.
  Items `#13`, `#55`, and `#56+#61` modify entries in this field; the
  validator subprocess re-checks the entries after each landing.
- **Forward-only Postgres migration**: per ADR-010, every Alembic
  upgrade is forward-only; downgrades are forbidden. The `#69+#70`
  migration adds the new `_vendor_link_mixin.py` mixin and four FK
  rebuilds (`vendor_risk_links.{vendor_id,risk_id}`,
  `vendor_control_links.{vendor_id,control_id}`) with `ON DELETE
  CASCADE`, drops `Vendor.status` and its index `ix_vendors_status`
  in the same upgrade, and is rehearsed against a Postgres replica
  before merge per `plan-loop-2-06-migration-window.md:596,657`.
- **`client_factory`**: the pytest fixture from
  `tests/backend/pytest/conftest.py` that builds a TestClient with
  the canonical `dependency_overrides` map. All backend API tests in
  this plan use `client_factory`. Any local
  `dependency_overrides[get_db]` block requires an entry in
  `tests/backend/pytest/_get_db_override_whitelist.toml` per
  `CLAUDE.md`.
- **Hub wave additive ratchet**: each hub-wave member relaxes the
  prior member's lock by adding new entries, never by removing prior
  entries. Example: `#9` adds the canonical
  `can_user_view_approval_resource` import path; `#34` adds
  `resolve_approval_privilege_tier` consumers; `#60` adds the
  `Depends(get_privilege_context)` consumers. None of the three
  removes the prior member's entries.
- **PRIMARY classification + many-to-one paired-with**: the ADR-007
  amendment pattern. Each backend package carries one PRIMARY
  bounded-context classification (the load-bearing context) and zero
  or more "paired-with" entries (the workflow-coupled contexts). The
  registry split is: `_bounded_context_write_side.toml`,
  `_bounded_context_read_shape.toml`,
  `_bounded_context_workflow_pairs.toml`,
  `_bounded_context_adapters.toml`,
  `_bounded_context_policy.toml` (the 5th `Cross-cutting` category).

---

## Section 2 — Master Sequence + Wave Structure + Critical Path + Atomic Clusters + Hub Waves


**Build commit ref**: `1ee872a4` (`main`).
**Today**: 2026-05-09.
**Source v2 sequence**: `plan-loop-3-07-integration-v2.md`.
**Source corrections**: `review-loop-2-08-cohesion-adversarial.md` Q-D (#76 effort M→L), Q-E (#76 P3→P1), Q-F (#77 split #77a/#77b), Q-H (8 waves → 9 waves).
**Source effort**: `review-loop-2-06-effort-adversarial.md`.

This section presents the FINAL 79-item master sequence after Loop 3
integration v2 PLUS Loop 2 adversarial corrections. The four overrides
applied since v2:

1. **#76 effort M → L** (12-16h) per Q-D — 8 auth/ commit sites with paired
   transactional contexts and integration-test scaffold.
2. **#76 priority P3 → P1** per Q-E — 2026-09-01 deadline already at risk
   given cleanup-start-date 2026-05-09; promotion lands #76 at ~2026-07-15.
3. **#77 split into #77a + #77b** per Q-F — pre-migration Zod-optionality
   test (#77a, ~30min, Wave 6a) + post-migration prune (#77b, S=4h, Wave 8).
4. **8 waves → 9 waves (Wave 6 split into 6a/6b)** per Q-H — Wave 6's 124h
   block compresses 13 medium-or-larger items into 3 weeks (PR fatigue).

---

## Master Sequence (79 items)

Legend: `Eff` = effort (S=4h, M=8h, L=20h, XL=40h). `Pri` = priority
(P1/P2/P3/P4). `Validator?` = `yes` if commit gate runs
`scripts/security/validate_authz_capability_contract.py`. `Doc/lock burden`
= `low` (file/code only), `med` (TOML/lock + code), `high` (capability
contract + tests + docs).

| Seq | ID | Audit-tag | Domain | Title | Effort | Priority | Wave | Pre-req | Atomic with | Validator? | Doc/lock burden |
|---:|---|---|---|---|---|---|---|---|---|---|---|
| 1 | #72 | S7.9 (ADR-011) | crosscut | Author ADR-011 (Auth Scheme and Session Model) | M | P1 | 1 | none | none | no | high |
| 2 | #73 | S3.12 (ADR-012) | kris | Author ADR-012 (KRI time-series period algebra) | M | P2 | 1 | none | none | no | high |
| 3 | #74a | ADR-007 (a) | crosscut | ADR-007 amendment — 31-package census (CENSUS phase) | XL | P3 | 1 | none | none | no | med |
| 4 | #10 | S8.5 | endpoints | Keep `riskhub_questionnaires.py` (Reject; doc-only) | S | P1 | 1 | none | none | no | low |
| 5 | #57 | S8.1 | vendor | Keep `quarterly_comparison_service.py` facade (Reject; doc-only) | S | P2 | 2 | none | none | no | low |
| 6 | #37 | S7.10 | crosscut (FE+BE) | Replace `_can_view_governance` mirror with `build_me_capabilities` | S | P1 | 2 | none | none | yes | high |
| 7 | #12 | D-N3 | endpoints | Narrow blanket-except in `users/summary.py` | S | P1 | 2 | (soft: #37) | none | no | low |
| 8 | #13 | S5.1/C-N2 | vendor | Delete `vendor_link_helpers.py` shim + sync capability contract | S | P1 | 2 | none | none | yes | high |
| 9 | #1 | A-N1 | risks | Drop `validate_risk_type` re-export from risks/crud `__all__` | S | P2 | 2 | none | none | no | low |
| 10 | #19 | S1.4 | risks | Consolidate risk-type validation onto service policy | S | P1 | 2 | #1 | none | no | low |
| 11 | #11 | S2.7 | risks | Control execution `risk.process` → `risk.name` truth-in-naming fix | S | P1 | 2 | #19 | none | no | low |
| 12 | #14 | S4.4 | issues | Issues outbox-only notification cleanup | M | P1 | 2 | none | none | no | med |
| 13 | #15 | D-N2 | endpoints | Add `access_user` capability surface to catalog | M | P1 | 2 | none | none | yes | high |
| 14 | #76 | ADR-011 follow-up | crosscut | Migrate 8 auth-flow `db.commit` sites to service-owned transactions | **L** | **P1** | **2** | #72 | none | no | med |
| 15 | #2 | B-N1 | issues | Drop 4 underscore aliases in `_issue_workflow/source_validation.py` | S | P2 | 3 | none | none | no | low |
| 16 | #3 | S3.11 | kris | Delete `kriFormWorkflow.ts` + tautological test | S | P2 | 3 | none | none | no | med |
| 17 | #4 | FE-deadcode-1 | frontend | Delete `controlFormWorkflow.ts` (3-line, 0 prod) | S | P2 | 3 | none | none | no | low |
| 18 | #5 | FE-deadcode-2 | frontend | Delete `orphanResolutionPresentation.ts` (1-line re-export) | S | P2 | 3 | none | none | no | low |
| 19 | #6 | FE-deadcode-3 | frontend | Delete `notifications/resourcePath.ts` (5-line re-export) | S | P2 | 3 | none | none | no | low |
| 20 | #7 | C-N1 | approvals | Delete endpoint shim `_get_approval_department_id` | S | P2 | 3 | none | none | no | low |
| 21 | #41 | B-N3 | issues | Delete bidirectional underscore aliases in issue-workflow serialization | S | P2 | 3 | none | none | no | low |
| 22 | #50 | S3.2 | kris | Delete `_kri_history/submission.py` wrapper | S | P2 | 3 | none | none | no | med |
| 23 | #52 | S3.5 | kris | Delete `_kri_history/correction_plans.py` | S | P2 | 3 | none | none | no | med |
| 24 | #53 | S4.1 | issues | Issue workflow service collapse (drop `IssueWorkflowService` facade) | S | P2 | 3 | none | none | no | med |
| 25 | #54 | S6.3 | approvals | Inline `_approval_queue/lifecycle.py` aggregator | S | P2 | 3 | none | none | no | low |
| 26 | #75 | Bonus | approvals | Delete-and-consolidate `_auto_reject_kri_approval` | S | P2 | 3 | none | none | no | low |
| 27 | #18 | S6.2 | approvals | Repoint-and-delete endpoint `_build_approval_read` | S | P2 | 3 | none | none | no | low |
| 28 | #20 | S1.6 | risks | Risk ID generation co-location (DOCUMENT-ONLY w/ stable re-export) | S | P2 | 3 | none | none | no | med |
| 29 | #21 | S2.6 | endpoints | Collapse Control-Risk link loader duplicates (keyword-only `load_link`) | S | P2 | 4 | none | none | no | med |
| 30 | #25 | S3.7 | kris | Extract KRI department-scope helper (overdue+due_soon) | S | P2 | 4 | none | none | no | low |
| 31 | #26 | S3.9 | kris | Delete `KRIForm.tsx` shim + ESLint pin | S | P2 | 4 | none | none | no | low |
| 32 | #29 | S4.6 | issues | Source-type vocabulary canonicalization (single helper) | S | P2 | 4 | none | none | no | low |
| 33 | #33 | S6.4 | approvals | Unify frontend approval-queued banners (drop KRI variant) | S | P2 | 4 | none | none | no | low |
| 34 | #35 | S7.3 | frontend | Delete `usePermissions` hook | S | P2 | 4 | none | (soft → #66) | no | low |
| 35 | #36 | S7.4 | frontend | Refactor `BusinessRouteGuards.tsx` to typed factory | S | P2 | 4 | none | none | no | low |
| 36 | #48 | FE-N6 | frontend | Merge `getErrorMessageKey.ts` + `errorCodeMap.ts` | S | P2 | 4 | none | none | no | low |
| 37 | #64 | FE-N2 | frontend | Extract QueryClient defaults from `App.tsx` | S | P2 | 4 | none | none | no | low |
| 38 | #47 | FE-N4 | frontend | Extract session-refresh retry policy | S | P3 | 4 | none | none | no | low |
| 39 | #22 | S2.8 | frontend | Delete `ControlForm.tsx` 1-line shim | S | P2 | 4 | none | none | no | low |
| 40 | #23 | S2.9 | frontend | Inline `controlFormUtils` helpers into narrow consumers | S | P2 | 4 | #22 | none | no | low |
| 41 | #55 | S7.5 | crosscut | Delete `access_user_service.py` facade | S | P2 | 4 | none | none | yes | high |
| 42 | #24 | S3.4 | kris | Delete-and-repoint `kris/linked_vendors.py` barrel | S | P2 | 4 | none | #51 | yes | high |
| 43 | #51 | S3.3 | kris | Delete `_kri_history/value_application.py` shim | S | P2 | 4 | none | #24 | yes | high |
| 44 | #56 | S7.6 | crosscut | Delete `directory_identity_service.py` shim | S | P3 | 4 | none | #61 | yes | high |
| 45 | #61 | S7.7 | crosscut | Move `graph_directory_*` modules into `_graph_directory/` package | M | P3 | 4 | none | #56 | yes | high |
| 46 | #74b | ADR-007 (b) | crosscut | ADR-007 amendment — ADR text (after census + #61) | M | P3 | 5 | #74a, #61 (cross) | none | no | high |
| 47 | #17 | S2.1 | vendor | Inline `_monitoring_response` endpoint shim | S | P2 | 5 | none | none | no | med |
| 48 | #49 | S2.2 | endpoints | Inline `_control_execution/monitoring.py` wrapper | S | P2 | 5 | #17 | none | no | med |
| 49 | #59 | S2.10 | endpoints | Consolidate `_monitoring_*` packages (docs+lock) | M | P3 | 5 | #17, #49 | none | no | med |
| 50 | #9 | S6.5 | approvals | Delete-and-redirect duplicate `can_user_view_approval_resource` | S | P2 | 5 | none | none | no | low |
| 51 | #34 | S6.6 | approvals | Extract `resolve_approval_privilege_tier` helper | XL | P3 | 5 | #9 | none | no | med |
| 52 | #27 | S4.2 | issues | Issue-loading duplicate deletion | M | P2 | 5 | none | none | no | med |
| 53 | #8 | B-N2 | issues | Source-validation split + canonical link helpers consolidation | M | P2 | 5 | #2 | none | no | med |
| 54 | #28 | S4.3 | issues | Issue source-mutation triplicate collapse | M | P2 | 5 | #8 | none | no | med |
| 55 | #30 | S4.10 | issues | `issues/_shared/__init__.py` underscore re-export pruning | M | P2 | 5 | #14, #27, #28 | none | no | med |
| 56 | #16 | S8.10 | vendor | Remove reports legacy-excel tombstones (410s) | M | P2 | 5 | none | none | no | med |
| 57 | #38 | S8.6 | endpoints | Move 8 inline endpoint Pydantic models to schemas (FE Zod mirror bundled per #G) | M | P2 | 5 | #10 | none | no | med |
| 58 | #31 | S5.5 | vendor | Extract vendor reporting row formatters | M | P3 | 5 | none | none | no | low |
| 59 | #43 | BE-N4 | endpoints | Audit adapter-emitter helper (additive) | M | P3 | 5 | none | none | no | med |
| 60 | #44 | BE-N6 | endpoints | Centralize guarded path-prefix registry | M | P3 | 5 | none | none | no | med |
| 61 | #58 | S8.3 | endpoints | Delete `OrphanedItemService` facade + static-method class | M | P3 | 5 | none | none | no | med |
| 62 | #46 | FE-N1 | frontend | Promote resource query-key factories | L+ | P3 | 6a | none | none | no | med |
| 63 | #67 | FE-N7 | frontend | Extract generic `useResourcePanelQuery` | M | P3 | 6a | #46 | none | no | low |
| 64 | #65 | FE-N3 | frontend | Extract `crudCapabilitySchema` shared Zod base | M | P3 | 6a | #46 | none | no | high |
| 65 | #42 | BE-N2 | crosscut | `ActorPayloadModel` shared base | S | P3 | 6a | none | none | no | low |
| 66 | #32 | S5.8 | frontend | Extract generic vendor linked-entity tab | M | P3 | 6a | none | none | no | low |
| 67 | #45a | BE-N8a | crosscut | Ownership prerequisite characterization tests | M | P4 | 6a | none | none | no | med |
| 68 | #62 | S5.9 | kris | Relocate `kri_vendor_assignment.py` + per-row audit events | M | P3 | 6a | none | none | no | med |
| 69 | #77a | S5.7-FE (Phase A) | frontend | Pre-migration Zod test asserting `Vendor.status` optional | S | P3 | 6a | none | (paired w/ #77b) | no | low |
| 70 | #39 | S8.7 | crosscut (FE+BE) | Replace `admin/capabilities.py` static stub with real builder | M | P3 | 6b | none | none | yes | high |
| 71 | #40 | S8.11 | crosscut | Re-cluster admin sub-routers (telemetry/sessions/directory/data_quality) | M | P3 | 6b | #39 | none | no | med |
| 72 | #66 | FE-N5 | frontend | Split `AuthContext.tsx` into independent providers | M | P4 | 6b | #37, #39 (soft: #35) | none | no | med |
| 73 | #55-style | S7.5 (followups) | (covered by Seq 41) | reserved slot — no separate task | — | — | — | — | — | — | — |
| 73 | #63 | BE-N7 | endpoints | Instrument outbox dispatch with `SchedulerJobRun` | M | P3 | 6b | none | none | no | med |
| 74 | #45b | BE-N8b | crosscut | Ownership resolver factory | M | P4 | 7 | #45a | none | no | med |
| 75 | #68 | FE-N8 | frontend | Introduce `WidgetShell` + scoped query selector | M | P4 | 7 | #46, #66 | none | no | med |
| 76 | #60 | S6.6 | approvals | Introduce `PrivilegeContext` + `Depends(get_privilege_context)` | M | P4 | 7 | #34, #51 | none | no | high |
| 77 | #71 | S7.8 | frontend | Merge `services/session/` 8 files → 4 | M | P4 | 7 | #47, #66, #72 | none | no | med |
| 78 | #69 | S5.2 | vendor | Introduce `AbstractVendorLink` mixin (Phase 1) | XL (#69+#70 bundle) | P4 | 8 | none | #70 | no | high |
| 79 | #70 | S5.7 | vendor | Drop `Vendor.status` enum (Postgres migration) | XL (#69+#70 bundle) | P4 | 8 | #69 | #69 | no | high |
| 80 | #77b | S5.7-FE (Phase B) | frontend | Prune `Vendor.status` from FE TS types and Zod schemas | S | P3 | 8 | #70 | (paired w/ #77a) | no | low |

> **Sequence-count reconciliation**: the table presents 79 distinct
> work-items (78 from v2 plus the #77a/#77b split — net +1, since v2 had
> #77 as a single item). Slot 73 above lists a placeholder row to signal
> that v2's `(57 frontend) → (58 admin) → (59 endpoints)` ordering is
> preserved with #63 in the second row-73 slot. Row 73's first line is a
> documentation marker, not a separate ID — the developer counts 79 work
> items (rows 1-72, 73#63, 74-80, omitting the marker). This bookkeeping
> matches Loop 2's conclusion: *"79 → 80 items if #77a/#77b are formally
> split, but the convention is to count #77 as one logical work-item with
> two phases"* (per `review-loop-2-08-cohesion-adversarial.md:546-553`).

> **Loop 2 explicit overrides applied above**:
> - **#76** moved from v2 Seq 70 → final Seq 14 (Wave 2 P1, per Q-E
>   `review-loop-2-08-cohesion-adversarial.md:267-281`).
> - **#76** effort upgraded M → L (per Q-D `:231-238`).
> - **#77** split into **#77a** (Wave 6a, Seq 69, S=0.5h) and **#77b**
>   (Wave 8, Seq 80, S=4h) per Q-F `:303-317`.
> - **Wave 6** split into **6a + 6b** per Q-H `:371-391`.

---

## 9-Wave Release Structure

The 9-wave structure is the Loop 2 corrected form of Loop 1's 8-wave
plan. Net change vs Loop 1: Wave 6 split into Wave 6a (infrastructure)
and Wave 6b (capability + admin). #76 promoted from Wave 7 → Wave 2.
#77 split into #77a (Wave 6a) and #77b (Wave 8).

### Wave 1 — ADRs Ratified (Items 1-4, 14h, Week 1)

- **Items**: #72 (ADR-011 Auth Scheme), #73 (ADR-012 KRI period algebra),
  #74a (ADR-007 census, CENSUS phase), #10 (Reject keep
  `riskhub_questionnaires.py`).
- **Goal**: All architecture decisions documented before code lands.
  Ratifies #72/#73/#74a so dependents (#76, #61, #66, #71, KRI cleanups,
  #74b text) can land with ADR-backed contracts.
- **Doc focus**: 3 new ADRs published; new TOML registries drafted
  (`_bounded_context_*.toml` straws for #74a's census phase).
- **Validator runs**: 0 (ADR-only, no code).
- **Why these in Wave 1**: ADRs are document-only; they unblock everything
  downstream. #74a is the census (data-only); #74b's amendment text is
  Wave 5 (depends on #61 landing first).

### Wave 2 — P1 Quick Wins + #76 Auth Migration (Items 5-14, 44h, Weeks 2-3)

- **Items**: #57 (Reject keep `quarterly_comparison_service.py`), **#37
  (governance mirror swap)**, **#12 (users/summary blanket-except narrow,
  per #A ordering)**, #13 (`vendor_link_helpers` shim drop), #1
  (validate_risk_type re-export drop), #19 (risk-type validation onto
  service policy), #11 (`risk.process` → `risk.name` truth-in-naming),
  #14 (issues outbox-only notification cleanup), #15 (`access_user`
  capability surface), **#76 (auth/ commit migration — promoted P1, deadline
  2026-09-01).**
- **Goal**: Address all P1 items + the deadline-sensitive #76. The
  `users/summary.py` 3-way overlap (`#37 → #12 → #34` cluster) starts
  here; #34 lands in Wave 5.
- **Validator runs**: 4 (#13, #15, #37; plus #76 indirectly via
  `_endpoint_commit_allowlist.toml` removals).
- **Critical Wave**: #76 lands ~Week 3 (calendar 2026-05-23 — 14 weeks
  before 2026-09-01 deadline). Promotion from P3→P1 buys ~6 weeks of
  buffer (per `review-loop-2-08-cohesion-adversarial.md:280-281`).

### Wave 3 — P2 Dead-code A (Items 15-28, 56h, Weeks 4-5)

- **Items**: #2 (issue underscore aliases), #3, #4, #5, #6, #7 (FE/BE
  dead-code), #41 (issue-workflow bidirectional aliases), #50, #52 (KRI
  history wrappers), #53 (IssueWorkflowService facade), #54
  (`_approval_queue/lifecycle` inline), #75 (`_auto_reject_kri_approval`
  consolidate), #18 (endpoint `_build_approval_read` repoint-and-delete),
  #20 (Risk ID co-location DOC-ONLY).
- **Goal**: Maximize file-deletion velocity; quick-wins maintain momentum
  after the heavier Wave 2.
- **Validator runs**: 0 (none of these touch capability contract).

### Wave 4 — P2 Dead-code B + Doc-Contract Wave (Items 29-45, 60h, Weeks 6-7)

- **Items**: #21 (Control-Risk link loader collapse), #25 (KRI dept-scope
  helper), #26 (`KRIForm.tsx` shim drop), #29 (source-type
  canonicalization), #33 (FE approval banner unify), #35 (`usePermissions`
  drop — soft prereq for #66), #36 (`BusinessRouteGuards` typed factory),
  #48 (`getErrorMessageKey`+`errorCodeMap` merge), #64 (QueryClient
  defaults extract), #47 (session-refresh retry), #22 (`ControlForm.tsx`
  shim), #23 (controlFormUtils inline). **Then the doc-contract wave**:
  #55, #24+#51 (atomic), #56+#61 (atomic).
- **Goal**: Contiguous doc-contract edits to keep `docs/security/authorization-capability-contract.{md,json}`
  cache warm (per `review-loop-1-08-cohesion-resolution.md:541-568`
  cohesion #2).
- **Validator runs**: 5 consecutive (Seq 41, 42, 43, 44, 45 — the
  `_authz_capability_contract` row at md:109 shrinks 3 times).
- **Critical week**: 5 contract-edit commits in 5 days at Seq 41-45;
  partial-removal states are valid intermediate states (per Correction C
  in `plan-loop-3-07-integration-v2.md:139-150`).

### Wave 5 — P2 Chains + ADR-007 Amendment Text (Items 46-61, 88h, Weeks 8-9)

- **Items**: **#74b (ADR-007 amendment text — moved later per
  Correction B)**, #17 (monitoring shim), #49 (control-execution
  monitoring inline), #59 (consolidate `_monitoring_*`), #9 (delete-redirect
  `can_user_view_approval_resource`), **#34 (privilege tier helper, lands
  AFTER #37+#12 per Correction A)**, #27 (issue-loading dup deletion),
  **#8 → #28 → #30 (the issues critical-path chain)**, #16 (reports
  legacy-excel tombstones), #38 (8 inline schemas + FE Zod mirror per
  Correction G), #31, #43, #44, #58.
- **Goal**: Land the 4-deep issues critical chain (#2→#8→#28→#30) and
  complete ADR-007 amendment text (#74b after #61).
- **Validator runs**: 0 (the doc-contract wave already closed in Wave 4).
- **Heaviest single wave** at 88h = ~2.2 weeks (3 M-effort items + 5
  S-effort + #74b M).

### Wave 6a — P3 Infrastructure + #77a (Items 62-69, 60.5h, Weeks 10-11)

- **Items**: #46 (FE query-keys factory — gates #65, #67, #68), #67
  (generic `useResourcePanelQuery`), #65 (`crudCapabilitySchema`
  shared Zod base), #42 (`ActorPayloadModel` shared base), #32 (vendor
  linked-entity tab), #45a (ownership prerequisite characterization tests),
  #62 (`kri_vendor_assignment.py` relocate), **#77a (pre-migration Zod
  optional-test, ~30min — Phase A)**.
- **Goal**: Set up FE infrastructure for next wave; #46's L-effort
  query-keys factory unblocks 3 dependent items in next sub-wave.
- **Validator runs**: 0 (Wave 6a infrastructure does NOT touch contract).
- **Why split**: 60h sustainable for one reviewer over 1.5 weeks (per
  Q-H rationale).

### Wave 6b — P3 Capability + Admin (Items 70-73, 40h, Week 12)

- **Items**: #39 (admin builder — gates #40, #66), #40 (admin sub-router
  re-cluster), #66 (`AuthContext.tsx` split — soft after #35 per
  Correction E), #63 (outbox `SchedulerJobRun` instrumentation).
- **Goal**: Complete capability and admin work; #66 unblocks #68, #71.
- **Validator runs**: 1 (#39 admin builder).
- **High contract-doc density**: 1 hits validator. Confined to 1 week.

### Wave 7 — P4 Deferred (Items 74-77, 56h, Week 13)

- **Items**: #45b (ownership resolver factory), #68 (`WidgetShell` + scoped
  query selector), #60 (`PrivilegeContext` + `Depends(get_privilege_context)`),
  #71 (`services/session/` 8→4 merge — 4 distinct prereqs).
- **Goal**: Tackle defers per user instruction; some require hub wave
  completion (#71 needs #47+#66+#72).
- **Validator runs**: 0.

### Wave 8 — Migration + FE TS Cleanup (Items 78-80, 28h, Week 14)

- **Items**: **#69 + #70 atomic** (Postgres migration window, single
  Alembic revision per ADR-010), **#77b (FE TS post-migration prune,
  Phase B)**.
- **Goal**: The single migration window; dedicated focus, no other work
  on the calendar that week (per `recipe-05-vendor-migration.md`).
- **Validator runs**: 0 (no contract change; ADR-005/ADR-010 govern).
- **Calendar pinned**: deploy-day operation; #77b lands in same week to
  close the deploy-skew window between BE migration and FE TS types.

---

## Critical Path Analysis

### Strict critical path (longest single linear dependency chain)

**`#2 → #8 → #28 → #30`** — the issues-domain barrel-prune chain (4 nodes):

```
   #2          #8           #28          #30
  (B-N1)      (B-N2)        (S4.3)       (S4.10)
   S/P2  →     M/P2     →    M/P2    →    M/P2
   Seq 15      Seq 53        Seq 54        Seq 55
   4h  +       8h    +       8h    +        8h    =  28h
   Wave 3      Wave 5         Wave 5         Wave 5
```

This chain is `B-N1` underscore-alias drop → `B-N2` source-validation
split → `S4.3` source-mutation triplicate collapse → `S4.10`
`_shared/__init__.py` prune. The full chain spans Wave 3 → Wave 5.

> Source: `plan-loop-2-08-master-sequence.md:155-158` (verified).

### Other length-3 chains (parallel)

```
#1   →   #19   →   #11           (risks; Wave 2)
S/P2     S/P1      S/P1
4h        4h        4h         =  12h

#9   →   #34   →   #60           (approvals privilege tier)
S/P2     M/P3      M/P4
4h        8h        8h         =  20h         Wave 5 → Wave 7

#17  →   #49   →   #59           (monitoring)
S/P2     S/P2      M/P3
4h        4h        8h         =  16h         Wave 5

#37  →   #66   →   #71           (FE auth/session)
S/P1     M/P4      M/P4
4h        8h        8h         =  20h         Wave 2 → 6b → 7

#46  →   #65 (or #67 or #68)     (FE query-keys factory)
L/P3     M/P3
20h       8h                  =  28h         Wave 6a (if #65/#67); Wave 7 (if #68)
```

### Deepest sink — #71 (4 distinct prereqs)

`#71` (Seq 77, Wave 7) has 4 distinct prereqs:

```
            #37 ─┐
            #39 ─┤───→ #66 ─┐
                                        ├───→ #71
            #47 ────────────────────────┤
            #72 ────────────────────────┘
```

`#71` requires: {#47, #66, #72}. `#66` itself requires {#37, #39}. So
the transitive prereq set for #71 is `{#37, #39, #47, #66, #72}`.

> Source: `plan-loop-2-08-master-sequence.md:174-181` (verified).

### Loop 2 verdict on critical path

**Critical path UNCHANGED** by Loop 2 corrections:

- `#72 → #76` (new hard edge per Correction D) is a 2-node chain — does
  not extend the longest path.
- `#70 → #77a / #77b` (post-migration FE prune) is 2-node chain.
- `#76` promotion P3→P1 moved it from Wave 7 → Wave 2 but the chain
  length is still 2.

> Source: `plan-loop-3-07-integration-v2.md:540-558`.

### ASCII visualization of critical path

```
Wave 3                    Wave 5                              Final
~~~~~~~~                  ~~~~~~~~                           ~~~~~~~~
[ #2 ] —————————— [ #8 ] —————— [ #28 ] —————— [ #30 ] —— END
4h, S/P2          8h, M/P2       8h, M/P2        8h, M/P2
B-N1              B-N2           S4.3             S4.10
                  needs #2       needs #8         needs #14, #27, #28
                                                  ↑↑↑
                                          (3 independent prereqs;
                                           Wave 2 and Wave 5)
```

Total path length: 28h critical work, gated across Wave 3 → Wave 5.
End-to-end delay if critical path slips: 1 week per slipped item.

---

## Atomic Clusters (must commit contiguously)

| Cluster | Items | Wave | Reason |
|---|---|---:|---|
| **A** | #24 + #51 | 4 | Share `kris/linked_vendors.py:3` import line + 6 doc citations across `docs/security/authorization-capability-contract.{md,json}`. Per `plan-loop-2-08-master-sequence.md:283`: *"ATOMIC with #51"*. |
| **B** | #56 + #61 | 4 | Cross-import dependency between `directory_identity_service.py` and `graph_directory_*` modules. Per `plan-loop-2-08-master-sequence.md:327`: *"ATOMIC with #61"*. |
| **C** | #69 + #70 | 8 | Single Alembic forward-only revision; ADR-010 single migration window. Per `plan-loop-2-08-master-sequence.md:429`: *"bundled with #70 (single migration window)"*. |

> No new atomic clusters introduced by Loop 3 v2 corrections (per
> `plan-loop-3-07-integration-v2.md:482-489`).

### Sequencing-only soft clusters (NOT atomic; coordinate but commit separately)

| Cluster | Items | Reason |
|---|---|---|
| **users/summary 3-way** | #37 → #12 → #34 | Three plans edit `users/summary.py`; recommended order #37 → #12 → #34 (per Correction A). |
| **doc-contract validator-reentry** | #55 → #56+#61 | Validator runs after each commit; partial-removal states of `service_policy` row at md:109 are valid intermediate states (per Correction C). |
| **mock-file double-rewrite avoidance** | #35 → #66 | Soft prereq; #35 must land first to avoid double-rewriting 18 mock files (per Correction E). |
| **#77a/#77b temporal split** | #77a (Wave 6a) → #69+#70 (Wave 8) → #77b (Wave 8) | Phase A pre-migration test ⊕ Phase B post-migration prune. The pair coordinates around the migration cutover (per Q-F resolution). |

---

## Hub Waves (sequential, additive)

| Hub | Items | Wave layout | Constraint |
|---|---|---|---|
| **Approvals privilege tier** | #9 → #34 → #60 | W5 → W5 → W7 | All additive on `approval_scenario_policy.py`; 2-week soak between #34 (W5) and #60 (W7) per `plan-loop-1-03-approvals.md:218`. |
| **Frontend query-keys factory** | #46 → {#65, #67} → #68 | W6a → W6a (#65/#67) → W7 (#68) | Factory landing unblocks 3 consumers; #65/#67 land same wave (sub-fanout) and #68 lands W7 after #66. |
| **Endpoints monitoring** | #17 → #49 → #59 | W5 → W5 → W5 | Shim → wrapper → consolidation order; same wave for cache warmth. |
| **Issues critical path** | #2 → #8 → #28 → #30 | W3 → W5 → W5 → W5 | Critical path; #14+#27 also feed #30 with parallel timing. |
| **Auth + Session** | #72 → #66 → #71 | W1 → W6b → W7 | ADR ratification → AuthContext split → session merge. |

---

## Sequencing Principles Applied

1. **Dependency topology** — no item placed before any of its prereqs.
2. **Priority within tier** — P1 > P2 > P3 > P4.
3. **Effort within tier** — S < M < L < XL (quick wins maintain momentum
   between heavier items).
4. **Atomic clusters land contiguously** — #24+#51 (W4 Seq 42-43),
   #56+#61 (W4 Seq 44-45), #69+#70 (W8 Seq 78-79).
5. **Hub waves stay additive** — Approvals/Endpoints/FE-query-keys land
   in single domain phases.
6. **ADRs land EARLY (Wave 1)** — #72/#73/#74a unlock dependents.
7. **Migration window lands LATE (Wave 8)** — #69+#70 isolate to single
   week, no other work on calendar.
8. **Validator-touching items spaced OR clustered** — Wave 4's
   doc-contract wave is intentionally clustered (cache warm); Wave 2's
   #13/#15/#37 are spaced to absorb validator failures without cascade.
9. **Deadline-sensitive promotion** — #76 P1 buys 6 weeks of buffer
   before 2026-09-01 deadline (Q-E override).
10. **Reviewer fatigue management** — Wave 6 split into 6a + 6b (Q-H);
    no wave exceeds 88h (Wave 5).

---

## Effort Distribution

| Wave | Items | Effort | Dev-weeks |
|---:|---:|---:|---:|
| 1 | 4 | 14h | 0.35 |
| 2 | 11 | 44h | 1.10 |
| 3 | 14 | 56h | 1.40 |
| 4 | 17 | 60h | 1.50 |
| 5 | 16 | 88h | 2.20 |
| 6a | 8 | 60.5h | 1.51 |
| 6b | 4 | 40h | 1.00 |
| 7 | 4 | 56h | 1.40 |
| 8 | 3 | 28h | 0.70 |
| **Total** | **81** | **~446.5h base** | **~11.16 weeks base** |
| + cushion | | **+82h** | **+2.05 weeks** |
| + adversarial review | | **+200h** | **+5.0 weeks (interleaved)** |
| **Final estimate** | | **~728h with full overheads** | **~18.2 weeks (with 30% buffer)** |

> **Item-count footnote**: the sum of items per wave (4+11+14+17+16+8+4+4+3
> = 81) exceeds 79 because **#76 is counted once in Wave 2** (P1 promotion
> per Q-E, not Wave 7) and **#77 is counted twice (#77a in Wave 6a + #77b
> in Wave 8)** but represents 1 logical work-item with two phases. The 79
> distinct work-items are preserved; the +2 ledger discrepancy is solely
> the #77a/#77b split bookkeeping. Per
> `review-loop-2-08-cohesion-adversarial.md:413-414`: *"Reconciled item
> count: 79 (unchanged — Loop 1's items preserved; #76 moves to Wave 2;
> #77 splits temporally not as a new ID)"*.

> **Effort-total reconciliation with Loop 2 §8** (per
> `review-loop-2-08-cohesion-adversarial.md:586-598`):
>
> - Loop 2 master-sequence baseline: 484 h (77 items).
> - + #76 + #77 (Loop 3 v2): +12 h → 496 h (79 items).
> - Loop 1 A6 strict adjustments (#34 +12, #35 +4, #74a +12, #59 -4): +24 h → 520 h.
> - Loop 1 A6 borderline cushion: +18 h → 538 h.
> - Loop 2 Q-D adjustment (#76 M → L): +8 h → **546 h with cushion**.
> - Loop 2 net total: ≈ 68.25 dev-days ≈ 13.65 weeks single-dev.
> - With 30% buffer: ~18 weeks; today is 2026-05-09; project completion
>   ~2026-09-09 (interleaved review) or ~2026-10-07 (sequential review).

> **Wave 5 calendar warning**: Wave 5 at 88h is 2.2 dev-weeks. Combined
> with Wave 4's 60h doc-contract density, Weeks 6-9 are the **crunch
> period**; if Wave 4's validator partial-removal tolerance fails (open
> issue per Q-Q4), Wave 5 starts ~3 days late.

---

## Cross-references

- **Master sequence v2 (with corrections-applied table)**:
  `.planning/audits/_context/plan-loop-3-07-integration-v2.md` §2.
- **Loop 2 adversarial overrides**:
  `.planning/audits/_context/review-loop-2-08-cohesion-adversarial.md`
  Q-D, Q-E, Q-F, Q-H.
- **Effort total derivation**:
  `.planning/audits/_context/review-loop-2-06-effort-adversarial.md` and
  `review-loop-1-06-effort-audit.md:889-891`.
- **Atomic clusters source**:
  `.planning/audits/_context/plan-loop-2-01-master-dag.yaml` lines 283,
  327, 429.
- **Critical path source**:
  `.planning/audits/_context/plan-loop-2-08-master-sequence.md:155-181`.
- **Hub wave structure source**:
  `.planning/audits/_context/plan-loop-2-08-master-sequence.md:14-17`.

---

End of Phase 7 Section 2 — Master Sequence + Wave Structure + Critical
Path + Atomic Clusters + Hub Waves.

---

## Section 3 — Per-Item Recipes Part 1 (Waves 1-3, Slots 1-28)


**Build commit ref**: `1ee872a4` (`main`).
**Today**: 2026-05-09.
**Sources**:
- v2 master sequence: `.planning/audits/_context/plan-loop-3-07-integration-v2.md`.
- Final Section 2 (master sequence + wave structure): `.planning/audits/_context/final-section-2-sequence.md`.
- Phase 5 recipes: `recipe-01-issues.md` … `recipe-08-crosscut-adrs.md`.
- Phase 6 corrections: `verify-recipe-01..08-*.md`.

This section harvests the per-item recipes for the first 28 sequence slots
(Waves 1, 2, and 3) and applies every Phase 6 correction noted in the
verification reports. Each recipe carries the same shape: pre-flight checks,
TDD red→green steps, lock/TOML/contract updates, README/doc updates, ordered
verification commands, commit boundary, rollback class + procedure, and risk
notes.

---

## Wave 1-3 Introduction — Goals and Cadence

### Wave 1 — ADRs Ratified (Slots 1-4, ~14 dev-hours, Week 1)

- **Items in scope (slots 1-4)**: #72 (ADR-011 Auth Scheme & Session Model),
  #73 (ADR-012 KRI Time-Series Period Algebra), #74a (ADR-007 amendment —
  31-package census), #10 (Reject keep `riskhub_questionnaires.py` with
  presence-lock; the early-Wave-1 doc-cluster placeholder).
- **Goal**: Land all architecture decisions BEFORE any code lands. Three new
  ADRs publish their canonical statements; one doc-only Reject decision adds
  a presence-lock so a future "0 routes" audit cannot delete the live
  questionnaire send route.
- **Doc focus**: 3 ADRs + 5 new TOMLs (`_bounded_context_*.toml`) + 8+ new
  architecture-lock tests pinning the new contracts.
- **Validator runs**: 0 (Wave 1 is doc + lock only; no production code touched).
- **Why Wave 1 first**: ADRs unblock dependents. #72 gates #76 (auth/ commit
  migration in Wave 2); #74a gates #74b (amendment text in Wave 5);
  ADR-012 ratifies the rule that the eventual KRI deadline-service collapse
  enforces. #10's presence-lock prevents future regressions.

### Wave 2 — P1 Quick Wins + #76 Auth Migration (Slots 5-14, ~44 dev-hours, Weeks 2-3)

- **Items in scope (slots 5-14)**: #57 (Reject keep
  `quarterly_comparison_service.py` facade), #37 (governance mirror swap),
  #12 (`users/summary` blanket-except narrow), #13 (`vendor_link_helpers`
  shim drop), #1 (`validate_risk_type` re-export drop), #19 (risk-type
  validation onto service policy), #11 (`risk.process` → `risk.name`
  truth-in-naming), #14 (issues outbox-only notification cleanup), #15
  (`access_user` capability surface), #76 (8-site auth/ commit migration).
- **Goal**: Address every P1 audit-finding plus the deadline-sensitive #76
  (2026-09-01 commit-allowlist expiration). The `users/summary.py` 3-way
  overlap (#37 → #12 → #34) starts here in the recommended order; #34
  lands later in Wave 5.
- **Validator runs**: 4 (#13, #15, #37 directly touch the capability
  contract; #76 indirectly via `_endpoint_commit_allowlist.toml` removals).
- **Critical Wave**: #76 lands ~Week 3 (calendar 2026-05-23) — 14 weeks
  before the 2026-09-01 expiration. The P3→P1 promotion in Q-E buys
  ≥6 weeks of buffer.

### Wave 3 — P2 Dead-code A (Slots 15-28, ~56 dev-hours, Weeks 4-5)

- **Items in scope (slots 15-28)**: #2 (issue underscore aliases), #3
  (`kriFormWorkflow.ts` delete), #4 (`controlFormWorkflow.ts` delete), #5
  (`orphanResolutionPresentation.ts` delete), #6 (`notifications/resourcePath.ts`
  delete), #7 (`_get_approval_department_id` shim delete), #41 (issue-workflow
  bidirectional aliases), #50 (`_kri_history/submission.py` wrapper),
  #52 (`_kri_history/correction_plans.py` wrapper), #53 (`IssueWorkflowService`
  facade collapse), #54 (`_approval_queue/lifecycle.py` inline), #75
  (`_auto_reject_kri_approval` consolidate), #18 (endpoint
  `_build_approval_read` repoint-and-delete), #20 (Risk ID co-location
  DOC-ONLY).
- **Goal**: Maximize file-deletion velocity. Quick S-effort wins maintain
  momentum after the heavier Wave 2.
- **Validator runs**: 0 (none of these touch the capability contract).
- **Heart of dead-code phase A**: 14 items totalling 56 dev-hours; every
  item carries an architecture lock to prevent regressions.

### Cross-wave conventions

- All new architecture tests carry `pytestmark = pytest.mark.contract`.
- Backend integration tests use `client_factory` from
  `tests/backend/pytest/conftest.py`; local `dependency_overrides[get_db]`
  blocks require an entry in `_get_db_override_whitelist.toml`.
- Lock TOMLs touched include `_archive_allowlist.toml`,
  `_naming_allowlist.toml`, `_capabilities_all_allowlist.toml`, and
  `_endpoint_commit_allowlist.toml`.
- Capability-contract changes coordinate with
  `docs/security/authorization-capability-contract.{md,json}` and
  `docs/security/capability-catalog.json`.
- Quote rule: every cited code snippet ≤ 15 words.

---

## Phase 6 Corrections Applied (Wave 1-3 scope)

The recipes below incorporate the empirical corrections from
`verify-recipe-01..08-*.md`:

| Item | Phase 6 correction |
|---|---|
| #74a | "Exactly 31 packages" wording → "31 today, 32 after #61"; `_orphaned_items` and `_notification_inbox` paired with `_identity_access_lifecycle` (NOT `_admin_telemetry`); allowlist filename uses `cross_cutting` (NOT `core`). |
| #10  | FE caller path corrected: `frontend/src/services/riskHubApi.ts:308-310` (NOT `services/api/riskHubApi.ts`). |
| #15  | New Zod schema tightens the existing TS-optional drift: the FE has `capabilities?` optional today; the new Zod schema in #15 makes it required, closing the drift. |
| #41  | Recipe extended to ALSO edit `backend/app/api/v1/endpoints/issues/_shared/serialization.py:18,30` (Phase 6 V1 caught: endpoint barrel imports `_active_exception` and would break post-rename). |
| #76  | 8 commit sites verified at exact (file, line) tuples (`auth/sso.py:170`, `auth/refresh.py:177`, `auth/logout.py:101,132`, `auth/_sso_helpers.py:48`, `auth/password.py:128,161`, `auth/demo.py:67`); `_endpoint_commit_allowlist.toml` already carries 8 entries with `expires_at = "2026-09-01"`. |

(#43, #8, and #22 are in Waves 4-5, not in this section's scope.)

---

## Wave 1 — ADR Ratification (Slots 1-4)

### Item #1 — #72 — ADR-011: Auth Scheme and Session Model

**Sequence**: Wave 1, slot 1. **Effort**: M (6-8h). **Priority**: P1. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 1 (`final-section-2-sequence.md:34`).
- [ ] Read latest state of `backend/app/core/security.py:107-136`, `backend/app/core/security.py:170` (the `require_permission` factory cited by ADR-011), and `backend/app/api/v1/endpoints/auth/{sso.py,refresh.py,logout.py,password.py,_sso_helpers.py,demo.py}`.
- [ ] Read `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` (already carries 8 auth entries with `expires_at = "2026-09-01"`).
- [ ] No concurrent feature work touches `backend/app/core/security.py` or `backend/app/api/v1/endpoints/auth/`.
- [ ] `pytest tests/backend/pytest/architecture/ -q` baseline passes.

**TDD Step 1 — Write Failing Test (RED)**

Files (4 new architecture lock tests):
- `tests/backend/pytest/architecture/test_w12_auth_idiom_ratchet_red.py`
- `tests/backend/pytest/architecture/test_w12_get_current_user_isolation_red.py`
- `tests/backend/pytest/architecture/test_w12_mock_auth_guard_red.py`
- `tests/backend/pytest/architecture/test_w12_sso_token_exchange_boundary_red.py`

Each test starts with `pytestmark = pytest.mark.contract`.

```python
# tests/backend/pytest/architecture/test_w12_auth_idiom_ratchet_red.py
from __future__ import annotations
import ast, tomllib
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ENDPOINTS = REPO_ROOT / "backend/app/api/v1/endpoints"
BASELINE = Path(__file__).parent / "_auth_idiom_baseline.toml"

def _count_legacy_idioms(root: Path) -> dict[str, int]:
    body_calls, inline_403 = 0, 0
    for path in root.rglob("*.py"):
        try:
            tree = ast.parse(path.read_text())
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                fn = node.func
                name = (fn.id if isinstance(fn, ast.Name)
                        else fn.attr if isinstance(fn, ast.Attribute) else None)
                if name and name.startswith("_require_"):
                    body_calls += 1
            if isinstance(node, ast.If):
                test = ast.unparse(node.test)
                if "has_permission" in test and "not " in test:
                    for child in ast.walk(node):
                        if isinstance(child, ast.Raise) and "403" in ast.unparse(child):
                            inline_403 += 1
    return {"body_call_require": body_calls, "inline_403": inline_403}

def test_auth_idiom_count_non_increasing() -> None:
    baseline = tomllib.loads(BASELINE.read_text())
    current = _count_legacy_idioms(ENDPOINTS)
    assert current["body_call_require"] <= baseline["body_call_require"]
    assert current["inline_403"] <= baseline["inline_403"]
```

```python
# tests/backend/pytest/architecture/test_w12_get_current_user_isolation_red.py
from __future__ import annotations
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ALLOWED = {"backend/app/core/security.py", "backend/app/api/deps.py"}

def test_get_current_user_imports_only_inside_allowed_files() -> None:
    offenders: list[str] = []
    for path in (REPO_ROOT / "backend/app").rglob("*.py"):
        rel = str(path.relative_to(REPO_ROOT))
        if rel in ALLOWED:
            continue
        text = path.read_text()
        if "from app.core.security import" in text and "get_current_user" in text:
            offenders.append(rel)
    assert offenders == [], (
        "get_current_user must be imported via app.api.deps, not app.core.security"
    )
```

```python
# tests/backend/pytest/architecture/test_w12_mock_auth_guard_red.py
from __future__ import annotations
import ast
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SECURITY = REPO_ROOT / "backend/app/core/security.py"

def test_mock_auth_branch_is_guarded_by_two_conjuncts() -> None:
    tree = ast.parse(SECURITY.read_text())
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            target = ast.unparse(node.targets[0])
            if target == "mock_auth_enabled":
                value = ast.unparse(node.value)
                if "mock_auth_enabled" in value and "debug" in value and " and " in value:
                    return
    raise AssertionError("mock-auth fallback must be gated by mock_auth_enabled AND debug")
```

```python
# tests/backend/pytest/architecture/test_w12_sso_token_exchange_boundary_red.py
from __future__ import annotations
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SSO = REPO_ROOT / "backend/app/api/v1/endpoints/auth/sso.py"
HELPERS = REPO_ROOT / "backend/app/api/v1/endpoints/auth/_sso_helpers.py"

def test_sso_module_calls_exchange_helper() -> None:
    sso_text = SSO.read_text()
    assert (
        "from app.api.v1.endpoints.auth._sso_helpers" in sso_text
        or "from .._sso_helpers" in sso_text
    )
    helpers_text = HELPERS.read_text()
    assert "create_access_token" in helpers_text or "create_refresh_token" in helpers_text
```

Expected: RED. Run:
```
pytest tests/backend/pytest/architecture/test_w12_auth_idiom_ratchet_red.py tests/backend/pytest/architecture/test_w12_get_current_user_isolation_red.py tests/backend/pytest/architecture/test_w12_mock_auth_guard_red.py tests/backend/pytest/architecture/test_w12_sso_token_exchange_boundary_red.py -q
```
Tests fail because the baseline TOML, the isolation invariant, and the SSO boundary lock are not yet asserted.

**TDD Step 2 — Implement Change**

Files to create:
- `docs/adr/ADR-011-auth-scheme-and-session-model.md` — full ADR text per `recipe-08-crosscut-adrs.md:316-376`. Decision states `require_permission(resource, action)` is canonical (defined at `backend/app/core/security.py:170` per Phase 6 Probe 1 fix). Cross-refs ADR-001/002/003/004 (NOT ADR-006 — Phase 4 REJECT). Includes `## SSO Token-Exchange Boundary` subsection.
- `tests/backend/pytest/architecture/_auth_idiom_baseline.toml` — captures current counts of body-call `_require_*` and inline-403 raises (the lock asserts non-increasing).
- The 4 new architecture lock tests above.

Files to edit:
- None. ADR + locks only; no production code touched in #72.

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

After ADR-011 lands and the baseline TOML captures today's count:
```
pytest tests/backend/pytest/architecture/test_w12_*_red.py -q
```
All 4 tests pass.

**Lock/TOML/Contract Updates (same commit)**:
- `tests/backend/pytest/architecture/_auth_idiom_baseline.toml` — new file with `body_call_require = N` and `inline_403 = M` reflecting today's counts.
- Existing lock at `tests/backend/pytest/architecture/test_w5_endpoint_commit_ratchet_red.py::test_auth_commit_allowlist_entries_are_complete_and_unexpired` — no edit needed; the existing date check fires on `2026-09-01` once #76 removes the entries.

**README/Doc Updates (same commit)**:
- `docs/adr/README.md` (if present) — append ADR-011 row to the index.
- `AGENTS.md` — cross-reference ADR-011 next to ADR-002 in the auth-flow section.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_w12_auth_idiom_ratchet_red.py -q` — must pass.
2. `pytest tests/backend/pytest/architecture/test_w12_get_current_user_isolation_red.py -q` — must pass.
3. `pytest tests/backend/pytest/architecture/test_w12_mock_auth_guard_red.py -q` — must pass.
4. `pytest tests/backend/pytest/architecture/test_w12_sso_token_exchange_boundary_red.py -q` — must pass.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
7. `ruff check tests/backend/pytest/architecture/test_w12_*_red.py` — clean.
8. `mypy tests/backend/pytest/architecture/test_w12_*_red.py` — clean.

**Commit Boundary**: single commit.
**Title**: `docs(adr): land ADR-011 auth scheme and session model with 4 invariant locks`.

**Rollback** (class: DOC-ONLY + LOCK-RATCHET):
1. `git revert <SHA>` to remove ADR-011, the 4 lock tests, and the baseline TOML.
2. No production code change to revert (none was made).
3. Re-run `make -f scripts/Makefile test-architecture-locks` — must pass without the new locks.
4. Estimated revert time: 10 min.

**Risk Notes**: LOW — doc + lock only; no runtime code touched. Mitigation: baseline TOML captures today's counts so the lock ratchet is empirically grounded. #76 (Wave 2) drives the counts to 0 inside the auth/ subtree.

---

### Item #2 — #73 — ADR-012: KRI Time-Series Period Algebra

**Sequence**: Wave 1, slot 2. **Effort**: M (6-8h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 2 (`final-section-2-sequence.md:35`).
- [ ] Read latest state of `backend/app/services/_kri_history/periods.py:21,50,59,87,109`.
- [ ] Read `backend/app/services/_kri_history/constants.py:2` (canonical `REPORTING_GRACE_DAYS = 15`).
- [ ] Read `backend/app/services/_config/lookup.py:26` (the duplicate `REPORTING_GRACE_DAYS`).
- [ ] Read `backend/app/services/kri_deadline_service.py:64,77,78` (call sites collapsed alongside this commit per ADR-012 Migration Impact).
- [ ] No concurrent feature work touches `_kri_history/` or `kri_deadline_service.py`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py`

```python
from __future__ import annotations
import ast
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
PERIODS = REPO_ROOT / "backend/app/services/_kri_history/periods.py"

CANONICAL_FUNCTIONS = {
    "period_bounds_for_date",
    "latest_closed_period_for_date",
    "is_period_end_boundary",
    "due_date",
    "is_within_reporting_window",
}

def test_canonical_period_helpers_defined_only_in_periods_py() -> None:
    """ADR-012: period algebra has exactly one home (_kri_history/periods.py)."""
    offenders: list[str] = []
    for path in (REPO_ROOT / "backend/app").rglob("*.py"):
        rel = str(path.relative_to(REPO_ROOT))
        if rel == "backend/app/services/_kri_history/periods.py":
            continue
        try:
            tree = ast.parse(path.read_text())
        except SyntaxError:
            continue
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if node.name in CANONICAL_FUNCTIONS:
                    offenders.append(f"{rel}:{node.lineno}::{node.name}")
    assert offenders == [], f"ADR-012 forbids duplicate definitions: {offenders}"

def test_reporting_grace_days_has_one_canonical_definition() -> None:
    """ADR-012: REPORTING_GRACE_DAYS = 15 lives only in _kri_history/constants.py."""
    offenders: list[str] = []
    for path in (REPO_ROOT / "backend/app").rglob("*.py"):
        rel = str(path.relative_to(REPO_ROOT))
        if rel == "backend/app/services/_kri_history/constants.py":
            continue
        text = path.read_text()
        if "REPORTING_GRACE_DAYS" in text and "= 15" in text:
            offenders.append(rel)
    assert offenders == [], f"ADR-012 forbids duplicate REPORTING_GRACE_DAYS: {offenders}"
```

Expected: RED today (the duplicate at `_config/lookup.py:26` triggers the second assertion).

The lock test for #73 uses **Option A-trim** (paired with ADR-012 ratification): the test file lands in this same Wave 1 commit AND the trivial mechanical edits (`kri_deadline_service.py:64,77,78` rewrite to import canonical `REPORTING_GRACE_DAYS` + delete `_config/lookup.py:26 ConfigDefaults.REPORTING_GRACE_DAYS`) ship alongside ADR-012 ratification — they are documented in ADR-012's Migration Impact section (Section 6) and treated as part of #73's commit boundary, not deferred to a separate slot. This avoids any intermediate RED state.

Run baseline:
```
pytest tests/backend/pytest -q -k "kri" --collect-only > /tmp/kri-pre.txt
```

**TDD Step 2 — Implement Change**

Files to create:
- `docs/adr/ADR-012-kri-time-series.md` — full ADR text per `plan-loop-3-06-adr-drafts.md:94-158`. Decision pins `_kri_history/periods.py` as canonical, `_kri_history/constants.py:2` as the SSOT for `REPORTING_GRACE_DAYS = 15`, and the 5-state vocabulary (`new`, `not_submitted`, `breach`, `warning`, `optimal`). Cross-refs ADR-007 (bounded contexts), ADR-008 (SSOT pattern), ADR-009 (alias deprecation window).

Files to edit (ratified alongside ADR-012; trivial mechanical edits documented in ADR-012 Migration Impact, Section 6):
- `backend/app/services/kri_deadline_service.py:64,77,78` — replace local `REPORTING_GRACE_DAYS` references with `from app.services._kri_history.constants import REPORTING_GRACE_DAYS`.
- `backend/app/services/_config/lookup.py:26` — remove `ConfigDefaults.REPORTING_GRACE_DAYS` definition (now resolved through `_kri_history/constants.py`).

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

ADR-012 establishes the rule. Wave 1 ships doc-only:
```
pytest tests/backend/pytest -q -k "kri" --collect-only > /tmp/kri-post.txt
diff /tmp/kri-pre.txt /tmp/kri-post.txt   # no test surface change
```

**Lock/TOML/Contract Updates (same commit)**:
- New architecture lock `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py` (Step 1) lands GREEN once the `_config/lookup.py:26` removal + `kri_deadline_service.py:64,77,78` import rewrite are in this same commit per ADR-012 Migration Impact (Section 6).

**README/Doc Updates (same commit)**:
- `docs/adr/README.md` (if present) — append ADR-012 row to the index.
- `docs/BUSINESS_LOGIC.md:758` — cross-reference ADR-012 if §2.3 (KRI state vocabulary) is cited there.

**Verification Commands** (in order):
1. `make -f scripts/Makefile test-architecture-locks` — locks green (no new lock added per Option B).
2. `pytest tests/backend/pytest -q -k "kri"` — broad KRI suite green.
3. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
4. `ruff check docs/adr/ADR-012-kri-time-series.md` — N/A for ADR Markdown.

**Commit Boundary**: single commit.
**Title**: `docs(adr): land ADR-012 KRI time-series period algebra and deadline classification`.

**Rollback** (class: DOC-ONLY):
1. `git revert <SHA>` to remove ADR-012.
2. No production code change to revert.
3. Estimated revert time: 5 min.

**Risk Notes**: LOW — ADR + 3 trivial mechanical line-level edits (one import rewrite + one constant deletion) ratified together. Mitigation: the structural lock + the duplicate-removal land in the same commit so the test never sees an intermediate RED state. The mechanical edits are pure SSOT consolidation (canonical constant already lives in `_kri_history/constants.py:2`).

---

### Item #3 — #74a — ADR-007 amendment: 31-package census + 5-TOML classification

**Sequence**: Wave 1, slot 3. **Effort**: XL (26-30h). **Priority**: P3. **Atomic with**: none (paired with #74b in Wave 5). **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 3 (`final-section-2-sequence.md:36`).
- [ ] Run `ls -d backend/app/services/_*/ | grep -v __pycache__ | wc -l` — must return 31 (Phase 6 #74a counts confirmed: 31 packages today, 32 after #61 lands).
- [ ] Read each of the 31 package `__init__.py` files to verify primary classification.
- [ ] Read `docs/adr/ADR-007-bounded-context-taxonomy.md` (current ADR base).
- [ ] No concurrent feature work touches `backend/app/services/`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py`

```python
from __future__ import annotations
import tomllib
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SERVICES = REPO_ROOT / "backend/app/services"
ARCH_DIR = Path(__file__).parent

WRITE_SIDE = ARCH_DIR / "_bounded_context_write_side.toml"
READ_SHAPE = ARCH_DIR / "_bounded_context_read_shape.toml"
WORKFLOW_PAIRS = ARCH_DIR / "_bounded_context_workflow_pairs.toml"
ADAPTERS = ARCH_DIR / "_bounded_context_adapters.toml"
CROSS_CUTTING = ARCH_DIR / "_bounded_context_cross_cutting.toml"

def _load_toml(path: Path) -> dict:
    return tomllib.loads(path.read_text())

def _underscored_packages() -> set[str]:
    return {
        p.name for p in SERVICES.iterdir()
        if p.is_dir() and p.name.startswith("_") and p.name != "__pycache__"
    }

def test_every_package_in_exactly_one_primary_allowlist() -> None:
    pkgs = _underscored_packages()
    write_side = set(_load_toml(WRITE_SIDE).get("packages", []))
    read_shape = set(_load_toml(READ_SHAPE).get("packages", []))
    adapters = set(_load_toml(ADAPTERS).get("packages", []))
    cross_cutting = set(_load_toml(CROSS_CUTTING).get("packages", []))
    pairs = _load_toml(WORKFLOW_PAIRS).get("pairs", [])
    workflow_lefts = {pair["left"] for pair in pairs}

    primaries = write_side | read_shape | adapters | cross_cutting | workflow_lefts
    unclassified = pkgs - primaries
    assert unclassified == set(), f"ADR-007 amendment: unclassified packages: {unclassified}"

    documented_dual = {"_register_listings"}
    overlaps = (write_side & read_shape) - documented_dual
    assert overlaps == set(), f"undocumented dual-class: {overlaps}"

def test_register_listings_is_dual_classed() -> None:
    write_side = set(_load_toml(WRITE_SIDE).get("packages", []))
    read_shape = set(_load_toml(READ_SHAPE).get("packages", []))
    assert "_register_listings" in write_side
    assert "_register_listings" in read_shape

def test_monitoring_response_is_file_entry_in_read_shape() -> None:
    files = set(_load_toml(READ_SHAPE).get("files", []))
    assert "backend/app/services/_monitoring_response.py" in files

def test_at_least_31_packages_classified() -> None:
    """Phase 6: 31 today, 32 after #61 lands; lock asserts >= 31."""
    pkgs = _underscored_packages()
    assert len(pkgs) >= 31, (
        f"expected >= 31 underscored packages today; 32 after #61 lands; got {len(pkgs)}"
    )
```

Expected: RED. The 5 TOMLs do not yet exist; lock fires on missing files.

**TDD Step 2 — Implement Change**

Files to create (5 new TOMLs):
- `tests/backend/pytest/architecture/_bounded_context_write_side.toml` — 7 canonical write-side contexts.
- `tests/backend/pytest/architecture/_bounded_context_read_shape.toml` — 6 read-shape (incl. `_register_listings` dual + `_monitoring_response.py` file entry).
- `tests/backend/pytest/architecture/_bounded_context_workflow_pairs.toml` — 11 pairs (Phase 6 correction: `_orphaned_items` and `_notification_inbox` pair with `_identity_access_lifecycle`).
- `tests/backend/pytest/architecture/_bounded_context_adapters.toml` — 6 adapters (`_directory_identity`, `_directory_sync`, `_graph_directory` (planned-package, post-#61 comment), `_admin_telemetry`, `_activity_log_query`, `_auth_session`).
- `tests/backend/pytest/architecture/_bounded_context_cross_cutting.toml` — 2 cross-cutting (`_authorization_capabilities`, `_config`). Phase 6 correction: filename uses `cross_cutting` (NOT `core`).

Sample for write-side:
```toml
# _bounded_context_write_side.toml
packages = [
    "_riskhub_config",
    "_identity_access_lifecycle",
    "_vendor_governance",
    "_register_listings",  # dual-classed; also in read_shape
    "_approval_execution",
    "_entity_mutation_lifecycle",
    "_kri_history",
]
```

Sample for adapters (Phase 6 #74a wording):
```toml
# _bounded_context_adapters.toml
packages = [
    "_directory_identity",
    "_directory_sync",
    "_graph_directory",  # planned-package; created by #61 (Wave 4 Seq 44).
    "_admin_telemetry",
    "_activity_log_query",
    "_auth_session",
]
```

Sample for workflow-pairs (Phase 6 correction):
```toml
# _bounded_context_workflow_pairs.toml
[[pairs]]
left = "_approval_queue"
right = "_approval_execution"

[[pairs]]
left = "_issue_register"
right = "_issue_workflow"

[[pairs]]
left = "_vendor_links"
right = "_vendor_governance"

[[pairs]]
left = "_access_workflow"
right = "_identity_access_lifecycle"

[[pairs]]
left = "_control_execution"
right = "_entity_mutation_lifecycle"

[[pairs]]
left = "_deadline_execution"
right = "_kri_history"

[[pairs]]
left = "_auth_session_workflow"
right = "_auth_session"

[[pairs]]
left = "_risk_questionnaires"
right = "_vendor_governance"

[[pairs]]
left = "_vendor_workflow"
right = "_vendor_governance"

[[pairs]]
left = "_orphaned_items"
right = "_identity_access_lifecycle"  # Phase 6 correction.

[[pairs]]
left = "_notification_inbox"
right = "_identity_access_lifecycle"  # Phase 6 correction.
```

Files to also create (4 architecture lock tests):
- `tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py` (above).
- `tests/backend/pytest/architecture/test_w13_read_shape_no_commit_red.py` — asserts read-shape packages do not call `await db.commit()`.
- `tests/backend/pytest/architecture/test_w13_adapter_exception_translation_red.py` — asserts adapter packages translate external errors to `DomainError`.
- `tests/backend/pytest/architecture/test_w13_cross_cutting_ssot_red.py` — asserts cross-cutting packages bind to ADR-001 / ADR-008 SSOT chains.

Files to edit:
- None.

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py tests/backend/pytest/architecture/test_w13_*_red.py -q
```
All 4 tests pass once TOMLs are populated.

**Lock/TOML/Contract Updates (same commit)**:
- 5 new TOMLs (above) plus 4 new architecture lock tests.
- `_graph_directory` is pre-listed in `_bounded_context_adapters.toml` with a "post-#61" comment per Phase 6 #74a wording — the disjointness lock allows this because it accepts the package once it exists; the `_at_least_31` test enforces "≥ 31 today; 32 after #61 lands".

**README/Doc Updates (same commit)**:
- `tests/backend/pytest/architecture/README.md` (if present) — index the 5 new TOMLs.
- `AGENTS.md:170-180` (Architecture Locks section) — cross-reference the disjointness lock.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py -q` — must pass.
2. `pytest tests/backend/pytest/architecture/test_w13_*_red.py -q` — must pass.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `ruff check tests/backend/pytest/architecture/` — clean.
6. `mypy tests/backend/pytest/architecture/` — clean.

**Commit Boundary**: single commit.
**Title**: `feat(architecture): classify 31 underscore packages into 5 bounded-context allowlists (ADR-007 census)`.

**Rollback** (class: CROSS-DOMAIN; lock-ratchet + 5 TOMLs + 4 tests):
1. `git revert <SHA>` to remove the 5 TOMLs and 4 tests.
2. Re-run `make -f scripts/Makefile test-architecture-locks` — confirm legacy state.
3. Estimated revert time: 15 min.

**Risk Notes**: MEDIUM — broad surface; misclassification could cascade. Mitigations: read each `__init__.py` before classifying; ADR-007 amendment text (#74b, Wave 5) cross-references the table; disjointness lock catches drift. Phase 6 correction confirmed `_orphaned_items`/`_notification_inbox` pair with `_identity_access_lifecycle` (NOT `_admin_telemetry`).

---

### Item #4 — #10 — KEEP `riskhub_questionnaires.py` with presence-lock (Reject; doc-only)

**Sequence**: Wave 1, slot 4. **Effort**: S (≤2h). **Priority**: P1. **Atomic with**: none (presence-lock gates #38 in Wave 5). **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 4 (`final-section-2-sequence.md:37`).
- [ ] Read latest state of `backend/app/api/v1/endpoints/riskhub_questionnaires.py:37` (`@router.post("/batch-send", ...)`).
- [ ] Phase 6 path correction: confirm `frontend/src/services/riskHubApi.ts:308-310` (NOT `services/api/riskHubApi.ts`) — call site for the live route.
- [ ] Read `frontend/src/components/risks/RiskQuestionnairesPanel.tsx:257` (Send button → `riskHubApi.ts:308-310` → `riskhub_questionnaires.py:37`).
- [ ] No concurrent feature work touches `riskhub_questionnaires.py`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py`

```python
"""Lock that riskhub_questionnaires.py exists and exposes its router."""
from __future__ import annotations
import importlib
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
MODULE_PATH = REPO_ROOT / "backend/app/api/v1/endpoints/riskhub_questionnaires.py"

def test_module_file_exists() -> None:
    assert MODULE_PATH.is_file(), "Audit #10 REJECT: module is load-bearing; do not delete"

def test_module_exposes_router_with_batch_send_route() -> None:
    mod = importlib.import_module("app.api.v1.endpoints.riskhub_questionnaires")
    assert hasattr(mod, "router")
    paths = {getattr(r, "path", "") for r in mod.router.routes}
    assert any("batch-send" in p for p in paths), "live route lost"
```

Expected: GREEN today (the contract is already satisfied — the test is a forward-facing ratchet). Run:
```
pytest tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py -q
```

**TDD Step 2 — Implement Change**

Files to create:
- `tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py` (above).

Files to edit:
- `docs/agent/ENDPOINT_INVARIANTS.md` — add a stanza pinning the module + the FE caller chain (`RiskQuestionnairesPanel.tsx:257` → `riskHubApi.ts:308-310` → `riskhub_questionnaires.py:37`). Phase 6 path drift correction baked in.
- `.planning/audits/_context/02-backend-endpoints.md` — add note: `riskhub_questionnaires.py` rejection rationale + presence-lock cross-ref.

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py -q
```
Both assertions already pass; the lock pins the contract.

**Lock/TOML/Contract Updates (same commit)**:
- New presence-lock test IS the contract.
- No TOML allowlist edit required.

**README/Doc Updates (same commit)**:
- `docs/agent/ENDPOINT_INVARIANTS.md` — invariant stanza added with verification date `2026-05-09`.
- `.planning/audits/_context/02-backend-endpoints.md` — note row appended.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py -q` — must pass.
2. `pytest tests/backend/pytest -q -k "questionnaire"` — sanity (existing tests green).
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py` — clean.

**Commit Boundary**: single commit.
**Title**: `docs(endpoints): lock riskhub_questionnaires presence (audit #10 REJECT, doc-only)`.

**Rollback** (class: DOC-ONLY):
1. Delete the test file; revert doc edits.
2. No source code touched.
3. Estimated revert time: 5 min.

**Risk Notes**: VERY LOW — DOC-ONLY ratchet; pure forward-facing pin. Phase 6 path correction guards against a future refactor that breaks the FE call chain. Presence-lock gates #38 in Wave 5: when #38 moves the inline Pydantic models, the lock guarantees the route survives.

---

## Wave 2 — P1 Quick Wins + #76 Auth Migration (Slots 5-14)

### Item #5 — #57 — KEEP `quarterly_comparison_service.py` facade (Reject; doc-only)

**Sequence**: Wave 2, slot 5. **Effort**: S (≤2h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 5 (`final-section-2-sequence.md:38`).
- [ ] Read latest state of `backend/app/services/quarterly_comparison_service.py:1-12`.
- [ ] Read `backend/app/services/_quarterly_comparison/__init__.py` (the canonical implementation home — facade re-exports from here).
- [ ] No concurrent feature work touches the facade module.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_quarterly_comparison_facade_present_red.py`

```python
"""Lock the quarterly comparison facade re-export contract."""
from __future__ import annotations
import importlib
import pytest

pytestmark = pytest.mark.contract

def test_facade_module_present_and_re_exports_canonical() -> None:
    facade = importlib.import_module("app.services.quarterly_comparison_service")
    canonical = importlib.import_module("app.services._quarterly_comparison")
    # Facade must re-export the public surface verbatim.
    for name in getattr(canonical, "__all__", ()):
        assert hasattr(facade, name), f"facade missing canonical re-export: {name}"
```

Expected: GREEN today (already satisfied). The test is a forward-facing ratchet preventing accidental deletion.

**TDD Step 2 — Implement Change**

Files to create:
- `tests/backend/pytest/architecture/test_quarterly_comparison_facade_present_red.py` (above).

Files to edit:
- `backend/app/services/quarterly_comparison_service.py` — add a docstring header citing audit #57 verdict (Reject — facade is load-bearing for backwards compat with existing call sites).
- `.planning/audits/_context/01-backend-services.md` — add note: facade is intentionally kept for compat; lock test pins the contract.

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_quarterly_comparison_facade_present_red.py -q
```
Both assertions already pass.

**Lock/TOML/Contract Updates (same commit)**:
- New presence-lock test IS the contract.

**README/Doc Updates (same commit)**:
- `backend/app/services/quarterly_comparison_service.py` — docstring stating "Re-export facade per audit #57 (Reject)".
- `.planning/audits/_context/01-backend-services.md` — note row.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_quarterly_comparison_facade_present_red.py -q` — must pass.
2. `pytest tests/backend/pytest -q -k "quarterly"` — sanity.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/services/quarterly_comparison_service.py` — clean.

**Commit Boundary**: single commit.
**Title**: `docs(services): lock quarterly_comparison_service facade (audit #57 REJECT)`.

**Rollback** (class: DOC-ONLY):
1. Delete test; revert docstring + note.
2. Estimated revert time: 5 min.

**Risk Notes**: VERY LOW — DOC-ONLY ratchet. Mitigations: facade is a 1-line re-export; lock test enforces continued re-export.

---

### Item #6 — #37 — Replace `_can_view_governance` mirror with canonical `build_me_capabilities`

**Sequence**: Wave 2, slot 6. **Effort**: S (3-4h). **Priority**: P1. **Atomic with**: none (soft sequencing pair `#37 → #12 → #34`). **Validator**: yes.

**Dependencies (must be complete first)**: none (soft: lands ahead of #12 to honor Correction A `#37 → #12 → #34`)

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 6 (`final-section-2-sequence.md:39`).
- [ ] Read latest state of `backend/app/api/v1/endpoints/users/summary.py:45-50,54` (the FE-mirroring `_can_view_governance` helper definition + call site).
- [ ] Read `backend/app/services/_authorization_capabilities/__init__.py` (canonical `build_me_capabilities` location).
- [ ] Read `frontend/src/authz/useAuthz.ts` (FE consumer to confirm contract shape).
- [ ] No concurrent feature work touches `users/summary.py` or `_authorization_capabilities/`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_users_summary_uses_canonical_capabilities_red.py`

```python
"""S7.10: users/summary delegates to build_me_capabilities, not local mirror."""
from __future__ import annotations
import inspect
import pytest

pytestmark = pytest.mark.contract

def test_users_summary_imports_canonical_builder() -> None:
    from app.api.v1.endpoints.users import summary
    src = inspect.getsource(summary)
    assert "build_me_capabilities" in src, "must consume canonical builder"
    assert "_can_view_governance" not in src, "FE-mirror must be deleted"

def test_no_residual_can_view_governance_definition() -> None:
    from app.api.v1.endpoints.users import summary
    assert not hasattr(summary, "_can_view_governance")
```

Expected: RED. `_can_view_governance` exists today.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/api/v1/endpoints/users/summary.py:45-50` — delete the `_can_view_governance` helper definition.
- `backend/app/api/v1/endpoints/users/summary.py:54` — replace the `_can_view_governance(current_user)` call with the canonical `await build_me_capabilities(db, current_user)` derivation (drop the standalone helper; thread the capability bundle through `_build_shell_summary`).
- `backend/app/api/v1/endpoints/users/summary.py:1-10` — drop now-unused imports; add `from app.services._authorization_capabilities import build_me_capabilities`.
- `docs/security/authorization-capability-contract.md` — note that `users/summary` consumes the canonical builder (one-line addition under the AUTHZ-USERS row).
- `docs/security/authorization-capability-contract.json` — sync the corresponding JSON entry.

Files to create:
- `tests/backend/pytest/architecture/test_users_summary_uses_canonical_capabilities_red.py` (above).

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_users_summary_uses_canonical_capabilities_red.py -q
pytest tests/backend/pytest/api/v1/test_users_summary.py -q
```
Both pass.

**Lock/TOML/Contract Updates (same commit)**:
- `docs/security/authorization-capability-contract.{md,json}` — AUTHZ-USERS row updated.
- `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml` — no allowlist change required (canonical builder already covered).

**README/Doc Updates (same commit)**:
- `docs/security/authorization-capability-contract.md` — add line under AUTHZ-USERS noting `users/summary` delegates to `_authorization_capabilities/__init__.py::build_me_capabilities`.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_users_summary_uses_canonical_capabilities_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_users_summary.py -q` — must pass.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `ruff check backend/app/api/v1/endpoints/users/summary.py` — clean.
6. `mypy backend/app/api/v1/endpoints/users/summary.py` — clean.
7. `npx tsc --noEmit` — FE green (no FE consumer change).

**Commit Boundary**: single commit.
**Title**: `refactor(users): replace _can_view_governance mirror with canonical build_me_capabilities`.

**Rollback** (class: CROSS-DOMAIN with capability-contract edit):
1. `git revert <SHA>` to restore the `_can_view_governance` helper and the contract JSON/MD entries.
2. Re-run `python3 scripts/security/validate_authz_capability_contract.py` — exit 0 (legacy state).
3. Estimated revert time: 15 min.

**Risk Notes**: LOW — internal refactor; no API surface change. Mitigation: lock test forbids reintroduction; capability-contract validator runs in commit gate. Soft pair-with #12: #12 narrows blanket-except in the same file (`users/summary.py:48,62`) immediately after #37 lands.

---

### Item #7 — #12 — Narrow blanket-except in `users/summary.py`

**Sequence**: Wave 2, slot 7. **Effort**: S (≤2h). **Priority**: P1. **Atomic with**: none (soft sequencing — lands AFTER #37). **Validator**: no.

**Dependencies (must be complete first)**: #37 (soft; same-file)

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 7 (`final-section-2-sequence.md:40`).
- [ ] Read latest state of `backend/app/api/v1/endpoints/users/summary.py:48,62` (two `except Exception:` blocks).
- [ ] Confirm #37 has landed (`_can_view_governance` is gone; FE-mirror is replaced with canonical builder).
- [ ] No concurrent feature work touches `users/summary.py`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_users_summary_no_blanket_except_red.py`

```python
"""D-N3: users/summary blanket-except blocks must specify concrete exception types."""
from __future__ import annotations
import ast
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SUMMARY = REPO_ROOT / "backend/app/api/v1/endpoints/users/summary.py"

def test_no_blanket_except_in_users_summary() -> None:
    tree = ast.parse(SUMMARY.read_text())
    offenders: list[int] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ExceptHandler) and node.type is None:
            offenders.append(node.lineno)
    assert offenders == [], f"blanket-except at line(s) {offenders}; must specify type"
```

Expected: RED. Two blanket-except blocks at `:48` and `:62`.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/api/v1/endpoints/users/summary.py:48` — narrow `except Exception:` to `except (HTTPException, SQLAlchemyError):` (or the concrete types thrown by the protected block; verify pre-edit).
- `backend/app/api/v1/endpoints/users/summary.py:62` — same narrow.

Files to create:
- `tests/backend/pytest/architecture/test_users_summary_no_blanket_except_red.py` (above).

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_users_summary_no_blanket_except_red.py -q
pytest tests/backend/pytest/api/v1/test_users_summary.py -q
```
Both pass.

**Lock/TOML/Contract Updates (same commit)**:
- New architecture lock IS the contract.

**README/Doc Updates (same commit)**:
- None required (internal exception narrowing).

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_users_summary_no_blanket_except_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_users_summary.py -q` — must pass.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/api/v1/endpoints/users/summary.py` — clean.
5. `mypy backend/app/api/v1/endpoints/users/summary.py` — clean.

**Commit Boundary**: single commit.
**Title**: `D-N3: narrow blanket-except in users/summary.py`.

**Rollback** (class: TRIVIAL):
1. `git revert <SHA>` to restore the blanket-except blocks.
2. Estimated revert time: 5 min.

**Risk Notes**: LOW — exception narrowing only. Mitigation: existing tests cover error paths; lock test forbids regression.

---

### Item #8 — #13 — Delete `vendor_link_helpers.py` shim + sync capability contract

**Sequence**: Wave 2, slot 8. **Effort**: S (≤3h). **Priority**: P1. **Atomic with**: none. **Validator**: yes.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 8 (`final-section-2-sequence.md:41`).
- [ ] Read latest state of `backend/app/api/v1/endpoints/vendor_link_helpers.py:1-30` (the shim).
- [ ] Read `backend/app/services/_vendor_links/__init__.py` (canonical home).
- [ ] Run `grep -rn "from app.api.v1.endpoints.vendor_link_helpers" backend/ tests/` — confirm 0 production callers (Phase 4 verified).
- [ ] No concurrent feature work touches vendor link surfaces.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_vendor_link_helpers_shim_deleted_red.py`

```python
"""S5.1/C-N2: vendor_link_helpers shim must be deleted; canonical lives in services."""
from __future__ import annotations
import importlib
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SHIM = REPO_ROOT / "backend/app/api/v1/endpoints/vendor_link_helpers.py"

def test_shim_file_removed() -> None:
    assert not SHIM.exists(), "vendor_link_helpers shim must be deleted"

def test_canonical_module_intact() -> None:
    mod = importlib.import_module("app.services._vendor_links")
    assert hasattr(mod, "load_vendor_link") or hasattr(mod, "list_vendor_links")
```

Expected: RED. The shim file still exists.

**TDD Step 2 — Implement Change**

Files to delete:
- `backend/app/api/v1/endpoints/vendor_link_helpers.py` (entire file).

Files to edit:
- Any caller that still imports from the shim path (Phase 4 verified 0 production callers; the file is purely dead). If `vendors/_shared/__init__.py` re-exports, drop those entries.
- `docs/security/authorization-capability-contract.md` — drop the `vendor_link_helpers` row from AUTHZ-VENDORS section.
- `docs/security/authorization-capability-contract.json` — sync the corresponding JSON entry.

Files to create:
- `tests/backend/pytest/architecture/test_vendor_link_helpers_shim_deleted_red.py` (above).

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_vendor_link_helpers_shim_deleted_red.py -q
pytest tests/backend/pytest -q -k "vendor_link"
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- `docs/security/authorization-capability-contract.{md,json}` — AUTHZ-VENDORS row updated (shim entry dropped).
- `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml` — drop any reference to the shim path.

**README/Doc Updates (same commit)**:
- `backend/app/api/v1/endpoints/vendors/README.md` (if present) — drop reference to `vendor_link_helpers`.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_vendor_link_helpers_shim_deleted_red.py -q` — must pass.
2. `pytest tests/backend/pytest -q -k "vendor"` — broad vendor suite green.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `ruff check backend/app/api/v1/endpoints/vendors/_shared/` — clean.
6. `mypy backend/app/api/v1/endpoints/vendors/_shared/` — clean.

**Commit Boundary**: single commit.
**Title**: `S5.1/C-N2: delete vendor_link_helpers shim + sync capability contract`.

**Rollback** (class: CROSS-DOMAIN with capability-contract edit):
1. `git revert <SHA>` to restore the shim and the contract entries.
2. Re-run `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
3. Estimated revert time: 10 min.

**Risk Notes**: LOW — file is purely dead (0 production callers per Phase 4). Mitigation: lock test forbids reintroduction; validator runs in commit gate.

---

### Item #9 — #1 — Drop `validate_risk_type` re-export from risks/crud `__all__`

**Sequence**: Wave 2, slot 9. **Effort**: S (≤2h). **Priority**: P2. **Atomic with**: none (sequencing soft-prereq for #19). **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 9 (`final-section-2-sequence.md:42`).
- [ ] Read latest state of `backend/app/api/v1/endpoints/risks/crud/__init__.py` (the re-export shim).
- [ ] Read `backend/app/services/_risk_governance/risk_validation.py` (canonical home of `validate_risk_type`).
- [ ] Run `grep -rn "from app.api.v1.endpoints.risks.crud import validate_risk_type" backend/ tests/` — confirm 0 production callers.
- [ ] No concurrent feature work touches risks/crud surfaces.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_risks_crud_no_validate_risk_type_re_export_red.py`

```python
"""A-N1: risks/crud package no longer re-exports validate_risk_type."""
from __future__ import annotations
import importlib
import pytest

pytestmark = pytest.mark.contract

def test_validate_risk_type_not_in_crud_all() -> None:
    crud = importlib.import_module("app.api.v1.endpoints.risks.crud")
    assert "validate_risk_type" not in getattr(crud, "__all__", ())
    assert not hasattr(crud, "validate_risk_type"), "must not be available via crud"
```

Expected: RED. The name is currently in `__all__`.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/api/v1/endpoints/risks/crud/__init__.py` — drop `validate_risk_type` from `__all__`; remove the re-export line if present.
- `.planning/audits/_context/02-backend-endpoints.md` — note the migration (callers consume canonical via `app.services._risk_governance`).

Files to create:
- `tests/backend/pytest/architecture/test_risks_crud_no_validate_risk_type_re_export_red.py` (above).

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_risks_crud_no_validate_risk_type_re_export_red.py -q
pytest tests/backend/pytest -q -k "risk_type"
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New architecture lock IS the contract.

**README/Doc Updates (same commit)**:
- `.planning/audits/_context/02-backend-endpoints.md` — add note row.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_risks_crud_no_validate_risk_type_re_export_red.py -q` — must pass.
2. `pytest tests/backend/pytest -q -k "risk"` — broad risk suite green.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/api/v1/endpoints/risks/crud/` — clean.
5. `mypy backend/app/api/v1/endpoints/risks/crud/` — clean.

**Commit Boundary**: single commit.
**Title**: `A-N1: drop validate_risk_type re-export from risks/crud package`.

**Rollback** (class: TRIVIAL):
1. `git revert <SHA>` to restore the re-export.
2. Estimated revert time: 5 min.

**Risk Notes**: LOW — re-export drop only. Mitigations: lock test forbids regression; soft-prereq for #19 (the validation consolidation).

---

### Item #10 — #19 — Consolidate risk-type validation onto service policy

**Sequence**: Wave 2, slot 10. **Effort**: S (≤3h). **Priority**: P1. **Atomic with**: none (depends on #1). **Validator**: no.

**Dependencies (must be complete first)**: #1 (the `__all__` cleanup must land first; #19 then migrates the residual callers).

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 10 (`final-section-2-sequence.md:43`).
- [ ] Read latest state of `backend/app/api/v1/endpoints/risks/crud/create.py` (caller of `validate_risk_type`).
- [ ] Read `backend/app/services/_risk_governance/risk_validation.py:18` (canonical helper).
- [ ] Run `grep -rn "validate_risk_type" backend/ tests/` and enumerate remaining callers.
- [ ] Confirm #1 has landed (re-export removed).
- [ ] No concurrent feature work touches risks/crud or `_risk_governance`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_risk_type_validation_canonical_red.py`

```python
"""S1.4: validate_risk_type lives in services/_risk_governance only; endpoints delegate."""
from __future__ import annotations
import ast
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ENDPOINTS = REPO_ROOT / "backend/app/api/v1/endpoints/risks"

def test_no_local_validate_risk_type_in_endpoints() -> None:
    offenders: list[str] = []
    for path in ENDPOINTS.rglob("*.py"):
        try:
            tree = ast.parse(path.read_text())
        except SyntaxError:
            continue
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if node.name == "validate_risk_type":
                    offenders.append(f"{path}:{node.lineno}")
    assert offenders == [], f"S1.4: must delegate to service policy: {offenders}"

def test_endpoints_import_canonical_path() -> None:
    create = (ENDPOINTS / "crud/create.py").read_text()
    assert "from app.services._risk_governance" in create
    assert "validate_risk_type" in create
```

Expected: RED. The current call site does not import the canonical path.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/api/v1/endpoints/risks/crud/create.py:19` — replace local import with `from app.services._risk_governance.risk_validation import validate_risk_type`. Update call sites accordingly.
- Other risks-domain callers (per Phase 4 enumeration) — same migration.
- `.planning/audits/_context/02-backend-endpoints.md` — note migration.

Files to create:
- `tests/backend/pytest/architecture/test_risk_type_validation_canonical_red.py` (above).

Files to delete:
- None (the canonical helper already exists; this is a caller migration).

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_risk_type_validation_canonical_red.py -q
pytest tests/backend/pytest -q -k "risk"
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New architecture lock IS the contract.

**README/Doc Updates (same commit)**:
- `.planning/audits/_context/02-backend-endpoints.md` — note row appended.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_risk_type_validation_canonical_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_risks.py tests/backend/pytest/test_risks.py -q` — must pass.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/api/v1/endpoints/risks/` — clean.
5. `mypy backend/app/api/v1/endpoints/risks/` — clean.

**Commit Boundary**: single commit.
**Title**: `S1.4: consolidate risk-type validation onto service policy`.

**Rollback** (class: TRIVIAL):
1. `git revert <SHA>` to restore the local definition.
2. Estimated revert time: 10 min.

**Risk Notes**: LOW — caller migration; canonical helper unchanged. Mitigations: lock test forbids regression. Soft sequence: #1 → #19 → #11.

---

### Item #11 — #11 — Control execution `risk.process` → `risk.name` truth-in-naming fix

**Sequence**: Wave 2, slot 11. **Effort**: S (≤2h). **Priority**: P1. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: #19 (soft sequencing — same risks domain)

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 11 (`final-section-2-sequence.md:44`).
- [ ] Read latest state of `backend/app/services/_control_execution/...` for `risk.process` references (audit S2.7).
- [ ] Read the `Risk` model definition to confirm `Risk.name` is canonical (`Risk.process` is misnamed/legacy).
- [ ] No concurrent feature work touches `_control_execution/`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_control_execution_uses_risk_name_red.py`

```python
"""S2.7: control execution must reference Risk.name, not Risk.process (truth-in-naming)."""
from __future__ import annotations
import ast
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
TARGET = REPO_ROOT / "backend/app/services/_control_execution"

def test_no_risk_process_attribute_access_in_control_execution() -> None:
    offenders: list[str] = []
    for path in TARGET.rglob("*.py"):
        try:
            tree = ast.parse(path.read_text())
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Attribute) and node.attr == "process":
                if isinstance(node.value, ast.Name) and node.value.id == "risk":
                    offenders.append(f"{path}:{node.lineno}")
    assert offenders == [], f"S2.7: must use risk.name not risk.process: {offenders}"
```

Expected: RED. `risk.process` references exist today.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/services/_control_execution/*.py` — replace `risk.process` with `risk.name` everywhere. Verify no Pydantic schema or ORM mapping anchors `process`; if it does, add a one-line `name = process` alias temporarily.

Files to create:
- `tests/backend/pytest/architecture/test_control_execution_uses_risk_name_red.py` (above).

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_control_execution_uses_risk_name_red.py -q
pytest tests/backend/pytest -q -k "control_execution"
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New architecture lock IS the contract.

**README/Doc Updates (same commit)**:
- `backend/app/services/_control_execution/README.md` (if present) — note rename.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_control_execution_uses_risk_name_red.py -q` — must pass.
2. `pytest tests/backend/pytest -q -k "control"` — broad control suite green.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/services/_control_execution/` — clean.
5. `mypy backend/app/services/_control_execution/` — clean.

**Commit Boundary**: single commit.
**Title**: `S2.7: rename risk.process to risk.name in _control_execution (truth-in-naming)`.

**Rollback** (class: TRIVIAL):
1. `git revert <SHA>` to restore `risk.process`.
2. Estimated revert time: 5 min.

**Risk Notes**: LOW — attribute rename only; the underlying field name is `name` and `process` is a legacy alias. Mitigation: existing tests cover the surface; lock test forbids regression.

---

### Item #12 — #14 — Issues outbox-only notification cleanup

**Sequence**: Wave 2, slot 12. **Effort**: M (4-6h). **Priority**: P1. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 12 (`final-section-2-sequence.md:45`).
- [ ] Read latest state of `backend/app/services/_issue_workflow/notifications.py` and any in-process notification emit sites (audit S4.4).
- [ ] Read `backend/app/services/outbox/dispatcher.py` (the canonical outbox path).
- [ ] Confirm the issue-workflow domain currently emits via TWO paths (in-process + outbox) per audit S4.4.
- [ ] No concurrent feature work touches issues notifications.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_issues_outbox_only_emit_red.py`

```python
"""S4.4: issue notifications emit ONLY through outbox; no in-process side-effect calls."""
from __future__ import annotations
import ast
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ISSUES_WORKFLOW = REPO_ROOT / "backend/app/services/_issue_workflow"
BANNED_FUNCTIONS = {"send_email_now", "publish_in_process_notification"}

def test_no_inprocess_notification_emit_from_issues() -> None:
    offenders: list[str] = []
    for path in ISSUES_WORKFLOW.rglob("*.py"):
        try:
            tree = ast.parse(path.read_text())
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                fn = node.func
                name = (fn.id if isinstance(fn, ast.Name)
                        else fn.attr if isinstance(fn, ast.Attribute) else None)
                if name in BANNED_FUNCTIONS:
                    offenders.append(f"{path}:{node.lineno}::{name}")
    assert offenders == [], f"S4.4: must use outbox: {offenders}"
```

Expected: RED. Audit S4.4 enumerates the in-process emit sites that must be replaced.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/services/_issue_workflow/notifications.py` — replace in-process emit calls with `OutboxService.enqueue(...)` (provide the keyword args required by the outbox lock at `tests/backend/pytest/architecture/test_w12_outbox_enqueue_idempotency_key_present_red.py`). For each emit, define a Pydantic payload (or reuse one) on `backend/app/services/outbox/payloads.py`.
- `backend/app/services/_issue_workflow/__init__.py` — drop now-unused imports.

Files to create:
- `tests/backend/pytest/architecture/test_issues_outbox_only_emit_red.py` (above).

Files to delete:
- Any orphaned in-process helper that solely served the in-process path.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_issues_outbox_only_emit_red.py -q
pytest tests/backend/pytest/test_issue_workflow.py tests/backend/pytest/test_outbox_idempotency.py -q
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New architecture lock IS the contract.
- Existing outbox idempotency lock at `tests/backend/pytest/architecture/test_w12_outbox_enqueue_idempotency_key_present_red.py:34-49` — no edit; the new emit sites must satisfy the same keyword-arg contract.

**README/Doc Updates (same commit)**:
- `backend/app/services/_issue_workflow/README.md` (if present) — note "outbox-only emit".

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_issues_outbox_only_emit_red.py -q` — must pass.
2. `pytest tests/backend/pytest/test_issue_workflow.py -q` — must pass.
3. `pytest tests/backend/pytest/test_outbox_idempotency.py -q` — must pass.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `ruff check backend/app/services/_issue_workflow/` — clean.
6. `mypy backend/app/services/_issue_workflow/` — clean.

**Commit Boundary**: single commit.
**Title**: `S4.4: enforce outbox-only emit in issues notifications`.

**Rollback** (class: CROSS-DOMAIN — touches outbox payloads):
1. `git revert <SHA>` to restore in-process emit paths.
2. Re-run `pytest tests/backend/pytest/test_outbox_idempotency.py -q` — confirm legacy state.
3. Estimated revert time: 20 min.

**Risk Notes**: MEDIUM — emission semantics change (synchronous → async). Mitigations: integration tests confirm outbox dispatch; lock test forbids regression; outbox idempotency lock catches missing keyword args.

---

### Item #13 — #15 — Add `access_user` capability surface to catalog

**Sequence**: Wave 2, slot 13. **Effort**: M (4-6h). **Priority**: P1. **Atomic with**: none. **Validator**: yes.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 13 (`final-section-2-sequence.md:46`).
- [ ] Read latest state of `docs/security/capability-catalog.json` (today carries 7 surfaces: `RISK`, `CONTROL`, `VENDOR`, `ISSUE`, `KRI`, `APPROVAL`, `USER`).
- [ ] Read `docs/security/authorization-capability-contract.md` and `.json` (the contract).
- [ ] Read `frontend/src/types/access.ts` (FE consumer; today has `capabilities?` optional — Phase 6 #15 note: new Zod schema tightens this drift).
- [ ] No concurrent feature work touches the contract files.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_capability_catalog_includes_access_user_red.py`

```python
"""D-N2: capability-catalog.json must list 'access_user' as the 8th surface."""
from __future__ import annotations
import json
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
CATALOG = REPO_ROOT / "docs/security/capability-catalog.json"

def test_access_user_surface_present() -> None:
    data = json.loads(CATALOG.read_text())
    surfaces = {entry["surface"] for entry in data.get("surfaces", [])}
    assert "ACCESS_USER" in surfaces or "access_user" in surfaces

def test_access_user_carries_required_actions() -> None:
    data = json.loads(CATALOG.read_text())
    for entry in data.get("surfaces", []):
        if entry["surface"].lower() == "access_user":
            actions = set(entry.get("actions", []))
            assert {"read", "write"}.issubset(actions)
            return
    raise AssertionError("access_user surface missing")
```

Expected: RED. The 8th surface is not yet listed.

**TDD Step 2 — Implement Change**

Files to edit:
- `docs/security/capability-catalog.json` — add `access_user` entry with the actions enumerated by the FE (`read`, `write`, etc.).
- `docs/security/authorization-capability-contract.md` — add the AUTHZ-ACCESS-USER section row.
- `docs/security/authorization-capability-contract.json` — sync the JSON.
- `frontend/src/authz/useAuthz.ts` — add `access_user` to the union type (FE today has `capabilities?` optional; Phase 6 #15 note: the new Zod schema tightens this drift).
- `frontend/src/services/api/schemas/` (canonical FE Zod home — pick the file scoped to AUTHZ-USERS / `me`) — add `accessUserCapabilitiesSchema = z.object({...})` MARKING THE FIELD REQUIRED. This closes the existing FE TS-optional drift. (Note: `frontend/src/authz/` carries `useAuthz.ts` + `BusinessRouteGuards.tsx` + `policy.ts` only — it does NOT host Zod schemas; confirmed at commit `1ee872a4`.)
- `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts` — extend to assert `access_user` is part of the required surfaces.

Files to create:
- `tests/backend/pytest/architecture/test_capability_catalog_includes_access_user_red.py` (above).

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_capability_catalog_includes_access_user_red.py -q
python3 scripts/security/validate_authz_capability_contract.py
cd frontend && npm run test:run -- ../tests/frontend/unit/src/authz/useAuthz.invariant.test.ts
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- `docs/security/capability-catalog.json` — 8th surface added.
- `docs/security/authorization-capability-contract.{md,json}` — AUTHZ-ACCESS-USER row added.
- `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml` — add the new surface to the allowlist if the lock requires it.

**README/Doc Updates (same commit)**:
- `docs/security/authorization-capability-contract.md` — surface table updated to 8 surfaces.
- `frontend/src/authz/README.md` (verified present at commit `1ee872a4`) — note Zod schema tightens optional drift.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_capability_catalog_includes_access_user_red.py -q` — must pass.
2. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `npx tsc --noEmit` (in frontend) — clean.
5. `npm run test:run -- ../tests/frontend/unit/src/authz/useAuthz.invariant.test.ts` (in frontend) — pass.
6. `ruff check tests/backend/pytest/architecture/test_capability_catalog_includes_access_user_red.py` — clean.

**Commit Boundary**: single commit.
**Title**: `D-N2: add access_user as 8th capability surface (catalog + contract + Zod tighten)`.

**Rollback** (class: CROSS-DOMAIN with capability-contract edit + FE Zod):
1. `git revert <SHA>` to restore the 7-surface catalog and the FE TS-optional shape.
2. Re-run `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
3. Re-run `cd frontend && npx tsc --noEmit` — clean.
4. Estimated revert time: 20 min.

**Risk Notes**: MEDIUM — touches contract + FE schema. Phase 6 #15 note: the new Zod schema tightens existing TS-optional drift; some downstream FE code may rely on `capabilities?` being optional. Mitigations: invariant test enforces the new shape; validator gate runs in commit; FE TS compile catches widening regressions.

---

### Item #14 — #76 — Migrate 8 auth-flow `db.commit` sites to service-owned transactions

**Sequence**: Wave 2, slot 14. **Effort**: L (12-16h). **Priority**: P1 (promoted from P3 per Q-E; deadline 2026-09-01). **Atomic with**: none. **Validator**: no (touches `_endpoint_commit_allowlist.toml`, not the capability contract).

**Dependencies (must be complete first)**: #72 (ADR-011 — must ratify the canonical pattern first).

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 14 (`final-section-2-sequence.md:47`).
- [ ] Confirm #72 (ADR-011) has landed.
- [ ] Read each of the 8 commit sites (Phase 6 confirmed at exact lines):
  - `backend/app/api/v1/endpoints/auth/sso.py:170`
  - `backend/app/api/v1/endpoints/auth/refresh.py:177`
  - `backend/app/api/v1/endpoints/auth/logout.py:101`
  - `backend/app/api/v1/endpoints/auth/logout.py:132`
  - `backend/app/api/v1/endpoints/auth/_sso_helpers.py:48`
  - `backend/app/api/v1/endpoints/auth/password.py:128`
  - `backend/app/api/v1/endpoints/auth/password.py:161`
  - `backend/app/api/v1/endpoints/auth/demo.py:67`
- [ ] Read `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` — 8 entries, all `expires_at = "2026-09-01"`.
- [ ] No concurrent feature work touches `backend/app/api/v1/endpoints/auth/`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_auth_flow_no_endpoint_commit_red.py`

```python
"""S7.9: auth/ endpoints have ZERO db.commit() calls; service layer owns transactions."""
from __future__ import annotations
import ast
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
AUTH_DIR = REPO_ROOT / "backend/app/api/v1/endpoints/auth"

def _has_commit(tree: ast.AST) -> bool:
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            fn = node.func
            if isinstance(fn, ast.Attribute) and fn.attr == "commit":
                return True
    return False

def test_no_db_commit_in_auth_endpoints() -> None:
    offenders: list[str] = []
    for path in AUTH_DIR.rglob("*.py"):
        try:
            tree = ast.parse(path.read_text())
        except SyntaxError:
            continue
        if _has_commit(tree):
            offenders.append(str(path.relative_to(REPO_ROOT)))
    assert offenders == [], (
        f"#76: auth/ endpoints must own zero commits; offenders: {offenders}"
    )
```

Expected: RED. 6 distinct files (2 each in `logout.py` and `password.py`) carry `db.commit()`; all 8 sites must move to a service.

**TDD Step 2 — Implement Change**

Files to create:
- `backend/app/services/_auth_session_workflow/__init__.py` — new service module owning the transactional contexts.
- `backend/app/services/_auth_session_workflow/sso.py` — moves the SSO commit (paired transactional context per Q-D).
- `backend/app/services/_auth_session_workflow/refresh.py` — refresh commit.
- `backend/app/services/_auth_session_workflow/logout.py` — 2 logout commits.
- `backend/app/services/_auth_session_workflow/password.py` — 2 password commits.
- `backend/app/services/_auth_session_workflow/demo.py` — demo commit.
- `tests/backend/pytest/architecture/test_auth_flow_no_endpoint_commit_red.py` (above).
- `tests/backend/pytest/integration/test_auth_session_workflow.py` — integration scaffold per Q-D effort upgrade (M → L) covering happy path + rollback for each migrated site.

Files to edit:
- Each of the 8 endpoint files — replace `await db.commit()` with a call to the new service function.
- `backend/app/api/v1/endpoints/auth/_sso_helpers.py:48` — same pattern.
- `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` — DELETE all 8 entries (they reach `expires_at = "2026-09-01"` now obsolete).

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_auth_flow_no_endpoint_commit_red.py -q
pytest tests/backend/pytest/integration/test_auth_session_workflow.py -q
pytest tests/backend/pytest/architecture/test_w5_endpoint_commit_ratchet_red.py -q
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` — 8 auth entries removed (now empty for auth/, or schema retains zero rows).
- New architecture lock IS the contract.

**README/Doc Updates (same commit)**:
- `backend/app/api/v1/endpoints/auth/README.md` — note "service-owned transactions per ADR-011".
- `AGENTS.md` — cross-reference ADR-011 + #76 commit site list.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_auth_flow_no_endpoint_commit_red.py -q` — must pass.
2. `pytest tests/backend/pytest/integration/test_auth_session_workflow.py -q` — must pass (8-site integration scaffold green).
3. `pytest tests/backend/pytest/architecture/test_w5_endpoint_commit_ratchet_red.py -q` — must pass (allowlist count is 0).
4. `pytest tests/backend/pytest -q -k "auth"` — broad auth suite green.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
7. `ruff check backend/app/services/_auth_session_workflow/ backend/app/api/v1/endpoints/auth/` — clean.
8. `mypy backend/app/services/_auth_session_workflow/ backend/app/api/v1/endpoints/auth/` — clean.

**Commit Boundary**: 8 atomic commits acceptable (one per site/file), OR a single commit covering all 8 sites + service module. Recommended: 1 commit for the new service module + 8 small commits per migrated site (better blame trail; matches Q-D rationale of "8 auth/ commit sites with paired transactional contexts").
**Title (single-commit)**: `S7.9/#76: migrate 8 auth/ commit sites to _auth_session_workflow service`.

**Rollback** (class: CROSS-DOMAIN with allowlist + new service module):
1. `git revert <SHA>` (or revert each of the 8+1 commits in reverse order).
2. Restore `_endpoint_commit_allowlist.toml` 8 auth entries.
3. Re-run `pytest tests/backend/pytest/architecture/ -q` — confirm legacy state.
4. Estimated revert time: 60 min (multi-file).

**Risk Notes**: MEDIUM — 8 sites across 6 files; transactional semantics change. Mitigations: ADR-011 ratifies the pattern; integration scaffold covers happy + rollback paths; allowlist deletion is the gate; deadline buffer ≥6 weeks before 2026-09-01.

---

## Wave 3 — P2 Dead-code A (Slots 15-28)

### Item #15 — #2 — Drop 4 underscore aliases in `_issue_workflow/source_validation.py`

**Sequence**: Wave 3, slot 15. **Effort**: S (≤2h). **Priority**: P2. **Atomic with**: none (sequencing soft-prereq for #8 in Wave 5). **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 15 (`final-section-2-sequence.md:48`).
- [ ] Read latest state of `backend/app/services/_issue_workflow/source_validation.py:18,19,20,21` (the 4 underscore aliases).
- [ ] Read `backend/app/services/_issue_register/source_validation.py` (canonical home).
- [ ] No concurrent feature work touches issue source-validation.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_issue_workflow_source_validation_no_aliases_red.py`

```python
"""B-N1: workflow/source_validation drops 4 underscore-self aliases."""
from __future__ import annotations
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
TARGET = REPO_ROOT / "backend/app/services/_issue_workflow/source_validation.py"

BANNED = (
    "_validate_issue_source_payload = validate_issue_source_payload",
    "_validate_link_target = validate_link_target",
    "_resolve_link_targets = resolve_link_targets",
    "_normalize_link_targets = normalize_link_targets",
)

def test_no_self_aliases() -> None:
    text = TARGET.read_text()
    for line in BANNED:
        assert line not in text, f"B-N1: alias must be deleted: {line!r}"
```

Expected: RED. The 4 aliases exist today.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/services/_issue_workflow/source_validation.py:18-21` — delete the 4 self-alias lines.
- Any caller still importing the underscore form — repoint to the canonical name.

Files to create:
- `tests/backend/pytest/architecture/test_issue_workflow_source_validation_no_aliases_red.py` (above).

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_issue_workflow_source_validation_no_aliases_red.py -q
pytest tests/backend/pytest -q -k "source_validation"
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New architecture lock IS the contract.

**README/Doc Updates (same commit)**:
- None required (internal alias drop).

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_issue_workflow_source_validation_no_aliases_red.py -q` — must pass.
2. `pytest tests/backend/pytest/test_issue_workflow.py -q` — must pass.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/services/_issue_workflow/source_validation.py` — clean.
5. `mypy backend/app/services/_issue_workflow/source_validation.py` — clean.

**Commit Boundary**: single commit.
**Title**: `B-N1: drop 4 underscore aliases in _issue_workflow/source_validation`.

**Rollback** (class: TRIVIAL):
1. `git revert <SHA>` to restore the aliases.
2. Estimated revert time: 5 min.

**Risk Notes**: LOW — aliases were dead. Mitigation: lock test forbids regression.

---

### Item #16 — #3 — Delete `kriFormWorkflow.ts` + tautological test

**Sequence**: Wave 3, slot 16. **Effort**: S (≤2h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 16 (`final-section-2-sequence.md:49`).
- [ ] Read latest state of `frontend/src/components/kri-form/kriFormWorkflow.ts` (the file slated for deletion).
- [ ] Read `tests/frontend/unit/src/components/kri-form/kriFormWorkflow.spec.ts` (the tautological test).
- [ ] Run `grep -rn "kriFormWorkflow" frontend/src/` — confirm 0 prod consumers.
- [ ] No concurrent feature work touches kri-form.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/frontend/unit/src/components/kri-form/kriFormWorkflow.absent.spec.ts`

```typescript
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("S3.11: kriFormWorkflow.ts removal", () => {
  it("source file is deleted", () => {
    const path = resolve(__dirname, "../../../../../frontend/src/components/kri-form/kriFormWorkflow.ts");
    expect(existsSync(path)).toBe(false);
  });
});
```

Expected: RED. The file still exists.

**TDD Step 2 — Implement Change**

Files to delete:
- `frontend/src/components/kri-form/kriFormWorkflow.ts`.
- `tests/frontend/unit/src/components/kri-form/kriFormWorkflow.spec.ts` (tautological — it asserted the module exists).

Files to edit:
- Any FE consumer that re-exports `kriFormWorkflow` — drop the re-export line. Phase 4 verified 0 prod consumers; only the tautological test imported the module.

Files to create:
- `tests/frontend/unit/src/components/kri-form/kriFormWorkflow.absent.spec.ts` (above).

**TDD Step 3 — Confirm GREEN**

```
cd frontend && npm run test:run -- ../tests/frontend/unit/src/components/kri-form
cd frontend && npx tsc --noEmit
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New FE absence test IS the contract.
- `tests/backend/pytest/architecture/_naming_allowlist.toml` — no entry expected.

**README/Doc Updates (same commit)**:
- `frontend/src/components/kri-form/README.md` (if present) — drop reference.

**Verification Commands** (in order):
1. `cd frontend && npm run test:run -- ../tests/frontend/unit/src/components/kri-form` — must pass.
2. `cd frontend && npx tsc --noEmit` — clean.
3. `cd frontend && npm run lint` — clean.

**Commit Boundary**: single commit.
**Title**: `S3.11: delete kriFormWorkflow.ts + tautological test`.

**Rollback** (class: TEST-ONLY + DOC-ONLY):
1. `git revert <SHA>` to restore both files.
2. Estimated revert time: 5 min.

**Risk Notes**: LOW — pure deletion; no prod consumers. Mitigation: absence-lock prevents reintroduction.

---

### Item #17 — #4 — Delete `controlFormWorkflow.ts` (3-line, 0 prod)

**Sequence**: Wave 3, slot 17. **Effort**: S (≤1h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 17 (`final-section-2-sequence.md:50`).
- [ ] Read latest state of `frontend/src/components/control-form/controlFormWorkflow.ts` (3-line module).
- [ ] Run `grep -rn "controlFormWorkflow" frontend/src/` — confirm 0 prod consumers (Phase 4 verified).
- [ ] No concurrent feature work touches control-form.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/frontend/unit/src/components/control-form/controlFormWorkflow.absent.spec.ts`

```typescript
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("FE-deadcode-1: controlFormWorkflow.ts removal", () => {
  it("source file is deleted", () => {
    const path = resolve(__dirname, "../../../../../frontend/src/components/control-form/controlFormWorkflow.ts");
    expect(existsSync(path)).toBe(false);
  });
});
```

Expected: RED.

**TDD Step 2 — Implement Change**

Files to delete:
- `frontend/src/components/control-form/controlFormWorkflow.ts`.

Files to edit:
- Drop any re-export entry from `frontend/src/components/control-form/index.ts` if it cites the removed module.

Files to create:
- `tests/frontend/unit/src/components/control-form/controlFormWorkflow.absent.spec.ts` (above).

**TDD Step 3 — Confirm GREEN**

```
cd frontend && npm run test:run -- ../tests/frontend/unit/src/components/control-form
cd frontend && npx tsc --noEmit
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New FE absence test IS the contract.

**README/Doc Updates (same commit)**:
- `frontend/src/components/control-form/README.md` (if present) — drop reference.

**Verification Commands** (in order):
1. `cd frontend && npm run test:run -- ../tests/frontend/unit/src/components/control-form` — must pass.
2. `cd frontend && npx tsc --noEmit` — clean.
3. `cd frontend && npm run lint` — clean.

**Commit Boundary**: single commit.
**Title**: `FE-deadcode-1: delete controlFormWorkflow.ts (3-line, 0 prod)`.

**Rollback** (class: TRIVIAL):
1. `git revert <SHA>`.
2. Estimated revert time: 3 min.

**Risk Notes**: VERY LOW — 3-line dead module. Mitigation: absence-lock prevents reintroduction.

---

### Item #18 — #5 — Delete `orphanResolutionPresentation.ts` (1-line re-export)

**Sequence**: Wave 3, slot 18. **Effort**: S (≤1h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 18 (`final-section-2-sequence.md:51`).
- [ ] Read latest state of `frontend/src/...orphanResolutionPresentation.ts` (1-line re-export).
- [ ] Run `grep -rn "orphanResolutionPresentation" frontend/src/` — confirm 0 prod consumers.
- [ ] No concurrent feature work touches orphan-resolution surfaces.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/frontend/unit/src/...orphanResolutionPresentation.absent.spec.ts`

```typescript
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("FE-deadcode-2: orphanResolutionPresentation.ts removal", () => {
  it("re-export file is deleted", () => {
    const path = resolve(__dirname, "../../../../../frontend/src/path/to/orphanResolutionPresentation.ts");
    expect(existsSync(path)).toBe(false);
  });
});
```

(Resolve the exact path against HEAD before writing the test; the audit cited the file but the relative path may live under `components/orphan-resolution/` or `services/`.)

**TDD Step 2 — Implement Change**

Files to delete:
- The 1-line re-export module (path resolved during pre-flight).

Files to edit:
- Repoint any re-export consumer to the canonical home.

Files to create:
- The FE absence test above.

**TDD Step 3 — Confirm GREEN**

```
cd frontend && npm run test:run
cd frontend && npx tsc --noEmit
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New FE absence test IS the contract.

**README/Doc Updates (same commit)**:
- None required.

**Verification Commands** (in order):
1. `cd frontend && npm run test:run` — must pass.
2. `cd frontend && npx tsc --noEmit` — clean.
3. `cd frontend && npm run lint` — clean.

**Commit Boundary**: single commit.
**Title**: `FE-deadcode-2: delete orphanResolutionPresentation.ts (1-line re-export)`.

**Rollback** (class: TRIVIAL):
1. `git revert <SHA>`.
2. Estimated revert time: 3 min.

**Risk Notes**: VERY LOW — 1-line re-export.

---

### Item #19 — #6 — Delete `notifications/resourcePath.ts` (5-line re-export)

**Sequence**: Wave 3, slot 19. **Effort**: S (≤1h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 19 (`final-section-2-sequence.md:52`).
- [ ] Read latest state of `frontend/src/.../notifications/resourcePath.ts` (5-line re-export).
- [ ] Run `grep -rn "notifications/resourcePath" frontend/src/` — confirm 0 prod consumers.
- [ ] No concurrent feature work touches notifications.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/frontend/unit/src/.../resourcePath.absent.spec.ts`

```typescript
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("FE-deadcode-3: notifications/resourcePath.ts removal", () => {
  it("re-export file is deleted", () => {
    const path = resolve(__dirname, "../../../../../frontend/src/notifications/resourcePath.ts");
    expect(existsSync(path)).toBe(false);
  });
});
```

(Resolve exact path during pre-flight.)

**TDD Step 2 — Implement Change**

Files to delete:
- `frontend/src/notifications/resourcePath.ts` (5-line re-export).

Files to edit:
- Drop the re-export entry from `frontend/src/notifications/index.ts` if present.
- Repoint any consumer to the canonical home (per Phase 4 enumeration).

Files to create:
- The absence-test file above.

**TDD Step 3 — Confirm GREEN**

```
cd frontend && npm run test:run
cd frontend && npx tsc --noEmit
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New FE absence test IS the contract.

**README/Doc Updates (same commit)**:
- None required.

**Verification Commands** (in order):
1. `cd frontend && npm run test:run` — must pass.
2. `cd frontend && npx tsc --noEmit` — clean.
3. `cd frontend && npm run lint` — clean.

**Commit Boundary**: single commit.
**Title**: `FE-deadcode-3: delete notifications/resourcePath.ts (5-line re-export)`.

**Rollback** (class: TRIVIAL):
1. `git revert <SHA>`.
2. Estimated revert time: 3 min.

**Risk Notes**: VERY LOW — 5-line re-export.

---

### Item #20 — #7 — Delete `_get_approval_department_id` endpoint shim

**Sequence**: Wave 3, slot 20. **Effort**: S (≤2h). **Priority**: P2. **Atomic with**: none (co-touches `_shared.py` with #18 — keep separate commits). **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 20 (`final-section-2-sequence.md:53`).
- [ ] Read latest state of `backend/app/api/v1/endpoints/approvals/_shared.py:17-31` (the shim).
- [ ] Confirm 0 production callers of `_get_approval_department_id`. Phase 6: `grep` returned only the shim definition + 4 callers of canonical `get_approval_department_id`.
- [ ] Read `backend/app/services/_approval_execution/loading.py:31` (canonical home).
- [ ] No concurrent feature work touches `approvals/_shared.py`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_get_approval_department_id_shim_deleted_red.py`

```python
"""C-N1: endpoint shim _get_approval_department_id must be deleted."""
from __future__ import annotations
import importlib
import pytest

pytestmark = pytest.mark.contract

def test_endpoint_shim_absent() -> None:
    shared = importlib.import_module("app.api.v1.endpoints.approvals._shared")
    assert not hasattr(shared, "_get_approval_department_id"), (
        "C-N1: endpoint shim must be deleted; canonical lives in _approval_execution/loading.py"
    )

def test_canonical_intact() -> None:
    loading = importlib.import_module("app.services._approval_execution.loading")
    assert hasattr(loading, "get_approval_department_id")
```

Expected: RED. The shim still exists at `_shared.py:17-31`.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/api/v1/endpoints/approvals/_shared.py` — delete the entire `_get_approval_department_id` body at lines 17-31. Drop now-orphaned imports (`AsyncSession`, `ApprovalRequest` if only used by the shim).
- `.planning/audits/_context/03-frontend-architecture.md` — note removal (per Phase 4 disposition).

Files to create:
- `tests/backend/pytest/architecture/test_get_approval_department_id_shim_deleted_red.py` (above).

Files to delete:
- None (the shim is removed by editing `_shared.py`, not by deleting the file).

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_get_approval_department_id_shim_deleted_red.py -q
pytest tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approval_resolution.py -q
make -f scripts/Makefile test-architecture-locks
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New architecture lock IS the contract.

**README/Doc Updates (same commit)**:
- None required.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_get_approval_department_id_shim_deleted_red.py -q` — must pass.
2. `pytest tests/backend/pytest -q -k "approval"` — broad approval suite green.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/api/v1/endpoints/approvals/_shared.py` — clean.
5. `mypy backend/app/api/v1/endpoints/approvals/_shared.py` — clean.

**Commit Boundary**: single commit.
**Title**: `C-N1: delete _get_approval_department_id endpoint shim (0 prod callers)`.

**Rollback** (class: TRIVIAL):
1. `git revert <SHA>` to restore the 14-line shim.
2. Estimated revert time: 5 min.

**Risk Notes**: VERY LOW — 0 production callers. Mitigation: lock test forbids regression.

---

### Item #21 — #41 — Drop bidirectional underscore aliases in `_issue_workflow/serialization.py`

**Sequence**: Wave 3, slot 21. **Effort**: S (2h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none — soft pair-with #2 (same anti-pattern).

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 21 (`final-section-2-sequence.md:54`).
- [ ] Read latest state of `backend/app/services/_issue_workflow/serialization.py:18,41` (the bidirectional aliases).
- [ ] Read `backend/app/services/_issue_register/serialization.py:47,246` (canonical homes).
- [ ] **Phase 6 V1 critical**: read `backend/app/api/v1/endpoints/issues/_shared/serialization.py:18,30` (the endpoint barrel that imports `_active_exception` and re-exports it via `_shared/__init__.py:19,51`).
- [ ] No concurrent feature work touches `_issue_workflow/serialization.py`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_issue_workflow_serialization_no_self_aliases_red.py`

```python
"""B-N3: workflow/serialization drops self-aliases; endpoint barrel repointed."""
from __future__ import annotations
import importlib
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
WORKFLOW_SER = REPO_ROOT / "backend/app/services/_issue_workflow/serialization.py"
SHARED_SER = REPO_ROOT / "backend/app/api/v1/endpoints/issues/_shared/serialization.py"

def test_no_self_aliases_in_workflow_serialization() -> None:
    text = WORKFLOW_SER.read_text()
    assert "active_exception = _active_exception" not in text
    assert "_serialize_exception_with_user_names = serialize_exception_with_user_names" not in text

def test_endpoint_barrel_imports_public_active_exception() -> None:
    """Phase 6 V1: endpoint barrel must rename _active_exception → active_exception."""
    text = SHARED_SER.read_text()
    assert "import _active_exception" not in text, "endpoint barrel must use public name"
    assert "import active_exception" in text or "from app.services._issue_register.serialization import active_exception" in text
```

Expected: RED. Both alias lines exist; endpoint barrel imports `_active_exception`.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/services/_issue_register/serialization.py:47` — promote underscored `_active_exception` to public `active_exception` (rename the function definition).
- `backend/app/services/_issue_workflow/serialization.py:9-11` — change `from app.services._issue_register.serialization import (_active_exception,)` to `from app.services._issue_register.serialization import active_exception`. Drop the `:18 active_exception = _active_exception` line.
- `backend/app/services/_issue_workflow/serialization.py:41` — delete `_serialize_exception_with_user_names = serialize_exception_with_user_names`.
- **Phase 6 V1 critical**: `backend/app/api/v1/endpoints/issues/_shared/serialization.py:18` — rename import from `_active_exception` to `active_exception`. The endpoint barrel re-export must point to the new public name.
- **Phase 6 V1 critical**: `backend/app/api/v1/endpoints/issues/_shared/serialization.py:30` — update `__all__` entry from `_active_exception` to `active_exception` (or drop entirely if the public name is already exported via the workflow-serialization re-export — verify pre-edit).
- `backend/app/api/v1/endpoints/issues/_shared/__init__.py:19,51` — same rename if these lines re-export the underscored name.

Files to create:
- `tests/backend/pytest/architecture/test_issue_workflow_serialization_no_self_aliases_red.py` (above).

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_issue_workflow_serialization_no_self_aliases_red.py -q
pytest tests/backend/pytest -q -k "serialization"
pytest tests/backend/pytest/test_issue_workflow.py -q
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New architecture lock IS the contract.

**README/Doc Updates (same commit)**:
- None required.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_issue_workflow_serialization_no_self_aliases_red.py -q` — must pass.
2. `pytest tests/backend/pytest/test_issue_workflow.py -q` — must pass.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/services/_issue_workflow backend/app/services/_issue_register backend/app/api/v1/endpoints/issues/_shared` — clean.
5. `mypy backend/app/services/_issue_workflow backend/app/services/_issue_register backend/app/api/v1/endpoints/issues/_shared` — clean.

**Commit Boundary**: single commit (alias drop + rename + endpoint barrel rename in same commit per Phase 6 V1 — without the `_shared/serialization.py` edit, the endpoint barrel breaks between Seq 21 and Seq 53/54).
**Title**: `B-N3: drop bidirectional underscore aliases in _issue_workflow/serialization (incl. endpoint barrel)`.

**Rollback** (class: LOCK-RATCHET, multi-file):
1. `git revert <SHA>` — restores all alias lines and rename.
2. Estimated revert time: 10 min.

**Risk Notes**: LOW (after Phase 6 V1 correction). Without the `_shared/serialization.py:18,30` edit, the endpoint barrel would point at a non-existent name between Seq 21 and Seq 54 (#30). Mitigations: lock test pins absence; Phase 6 critical correction caught the hidden consumer.

---

### Item #22 — #50 — Delete `_kri_history/submission.py` wrapper

**Sequence**: Wave 3, slot 22. **Effort**: S (≤2h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 22 (`final-section-2-sequence.md:55`).
- [ ] Read latest state of `backend/app/services/_kri_history/submission.py` (wrapper module).
- [ ] Read `backend/app/services/_kri_history/__init__.py` (canonical surface).
- [ ] Run `grep -rn "from app.services._kri_history.submission" backend/ tests/` — confirm 0 prod callers (Phase 4 verified).
- [ ] No concurrent feature work touches `_kri_history/`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_kri_history_submission_wrapper_deleted_red.py`

```python
"""S3.2: _kri_history/submission.py wrapper must be deleted."""
from __future__ import annotations
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
WRAPPER = REPO_ROOT / "backend/app/services/_kri_history/submission.py"

def test_wrapper_deleted() -> None:
    assert not WRAPPER.exists(), "S3.2: wrapper must be deleted"
```

Expected: RED. The wrapper still exists.

**TDD Step 2 — Implement Change**

Files to delete:
- `backend/app/services/_kri_history/submission.py` (entire file).

Files to edit:
- Drop the wrapper export from `backend/app/services/_kri_history/__init__.py` if present.
- Repoint any caller (per Phase 4 enumeration) to the canonical `_kri_history` surface.
- `tests/backend/pytest/architecture/_archive_allowlist.toml` — drop any entry pinning the wrapper.

Files to create:
- `tests/backend/pytest/architecture/test_kri_history_submission_wrapper_deleted_red.py` (above).

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_kri_history_submission_wrapper_deleted_red.py -q
pytest tests/backend/pytest -q -k "kri_history"
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- `_archive_allowlist.toml` — drop any entry referencing the deleted wrapper.

**README/Doc Updates (same commit)**:
- `backend/app/services/_kri_history/README.md` (if present) — drop wrapper reference.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_kri_history_submission_wrapper_deleted_red.py -q` — must pass.
2. `pytest tests/backend/pytest -q -k "kri"` — broad KRI suite green.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/services/_kri_history/` — clean.
5. `mypy backend/app/services/_kri_history/` — clean.

**Commit Boundary**: single commit.
**Title**: `S3.2: delete _kri_history/submission.py wrapper`.

**Rollback** (class: TRIVIAL):
1. `git revert <SHA>` to restore wrapper.
2. Estimated revert time: 5 min.

**Risk Notes**: LOW — wrapper is dead. Mitigation: lock test forbids regression.

---

### Item #23 — #52 — Delete `_kri_history/correction_plans.py`

**Sequence**: Wave 3, slot 23. **Effort**: S (≤2h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 23 (`final-section-2-sequence.md:56`).
- [ ] Read latest state of `backend/app/services/_kri_history/correction_plans.py` (the wrapper).
- [ ] Run `grep -rn "from app.services._kri_history.correction_plans" backend/ tests/` — confirm 0 prod callers.
- [ ] No concurrent feature work touches `_kri_history/`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_kri_history_correction_plans_deleted_red.py`

```python
"""S3.5: _kri_history/correction_plans.py must be deleted."""
from __future__ import annotations
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
WRAPPER = REPO_ROOT / "backend/app/services/_kri_history/correction_plans.py"

def test_wrapper_deleted() -> None:
    assert not WRAPPER.exists(), "S3.5: wrapper must be deleted"
```

Expected: RED.

**TDD Step 2 — Implement Change**

Files to delete:
- `backend/app/services/_kri_history/correction_plans.py`.

Files to edit:
- `backend/app/services/_kri_history/__init__.py` — drop the wrapper re-export if present.
- Repoint any caller to the canonical surface.
- `tests/backend/pytest/architecture/_archive_allowlist.toml` — drop any entry referencing the deleted file.

Files to create:
- `tests/backend/pytest/architecture/test_kri_history_correction_plans_deleted_red.py` (above).

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_kri_history_correction_plans_deleted_red.py -q
pytest tests/backend/pytest -q -k "kri_history"
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- `_archive_allowlist.toml` — drop any wrapper entry.

**README/Doc Updates (same commit)**:
- None required.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_kri_history_correction_plans_deleted_red.py -q` — must pass.
2. `pytest tests/backend/pytest -q -k "kri"` — broad KRI suite green.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/services/_kri_history/` — clean.
5. `mypy backend/app/services/_kri_history/` — clean.

**Commit Boundary**: single commit.
**Title**: `S3.5: delete _kri_history/correction_plans.py`.

**Rollback** (class: TRIVIAL):
1. `git revert <SHA>`.
2. Estimated revert time: 5 min.

**Risk Notes**: LOW.

---

### Item #24 — #53 — Drop `IssueWorkflowService` facade (issue workflow service collapse)

**Sequence**: Wave 3, slot 24. **Effort**: S (3-4h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 24 (`final-section-2-sequence.md:57`).
- [ ] Read latest state of `backend/app/services/issue_workflow_service.py` (the static-method facade).
- [ ] Read `backend/app/services/_issue_workflow/__init__.py` (canonical surface).
- [ ] Enumerate all callers of `IssueWorkflowService.<verb>(...)` (Phase 4 verified ~7 lifecycle verbs).
- [ ] No concurrent feature work touches issues domain.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_issue_workflow_service_facade_collapsed_red.py`

```python
"""S4.1: IssueWorkflowService static-method facade must be dropped."""
from __future__ import annotations
import importlib
import pytest

pytestmark = pytest.mark.contract

def test_facade_class_absent() -> None:
    try:
        mod = importlib.import_module("app.services.issue_workflow_service")
    except ModuleNotFoundError:
        return  # facade module deleted entirely — accepted form
    assert not hasattr(mod, "IssueWorkflowService"), (
        "S4.1: static-method facade must be dropped; consume _issue_workflow directly"
    )
```

Expected: RED.

**TDD Step 2 — Implement Change**

Files to edit (or delete the facade module entirely):
- `backend/app/services/issue_workflow_service.py` — delete the `IssueWorkflowService` class. Optionally delete the file if it's now empty.
- For each caller of `IssueWorkflowService.<verb>(...)`, replace with the canonical free-function from `app.services._issue_workflow` (per Phase 4 enumeration of ~7 lifecycle verbs).

Files to create:
- `tests/backend/pytest/architecture/test_issue_workflow_service_facade_collapsed_red.py` (above).

Files to delete:
- `backend/app/services/issue_workflow_service.py` (if empty after class drop).

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_issue_workflow_service_facade_collapsed_red.py -q
pytest tests/backend/pytest/test_issue_workflow.py -q
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New architecture lock IS the contract.

**README/Doc Updates (same commit)**:
- `backend/app/services/_issue_workflow/README.md` (if present) — note canonical entry points.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_issue_workflow_service_facade_collapsed_red.py -q` — must pass.
2. `pytest tests/backend/pytest/test_issue_workflow.py -q` — must pass (covers all 7 lifecycle verbs).
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/services/_issue_workflow backend/app/services/issue_workflow_service.py` — clean (or skip the latter if deleted).
5. `mypy backend/app/services/_issue_workflow` — clean.

**Commit Boundary**: single commit.
**Title**: `S4.1: drop IssueWorkflowService static-method facade`.

**Rollback** (class: CROSS-DOMAIN — touches multiple callers):
1. `git revert <SHA>` to restore facade and caller call-sites.
2. Estimated revert time: 35 min.

**Risk Notes**: LOW — static-method binds are pure passthroughs. Mitigation: existing `test_issue_workflow.py` covers all 7 lifecycle verbs; lock test forbids regression.

---

### Item #25 — #54 — Inline `_approval_queue/lifecycle.py` aggregator

**Sequence**: Wave 3, slot 25. **Effort**: S (≤2h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none — independent of #18 (different surfaces); independent of #34/#60 (#54 is a soft, non-blocking prerequisite for clean package boundary).

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 25 (`final-section-2-sequence.md:58`).
- [ ] Read latest state of `backend/app/services/_approval_queue/lifecycle.py:1-17` (17-line pure re-export module per Phase 6).
- [ ] Read `backend/app/services/_approval_queue/__init__.py` (the package init that imports from `lifecycle`).
- [ ] Read existing deepening contract tests at `tests/backend/pytest/test_architecture_deepening_contracts.py:1005,1025,1041` (these will be rewritten in the same commit).
- [ ] No concurrent feature work touches `_approval_queue/`.

**TDD Step 1 — Write Failing Test (RED)**

The test contract is captured by **rewriting** the 3 existing deepening tests at `test_architecture_deepening_contracts.py:1005, :1025, :1041` (per Phase 5 recipe `recipe-03-approvals.md:499-547`).

```python
# tests/backend/pytest/test_architecture_deepening_contracts.py:1005 (rewrite)
def test_approval_queue_routes_use_queue_lifecycle_module() -> None:
    """S6.3: routes consume the package directly; no `lifecycle` indirection."""
    import inspect
    from app.api.v1.endpoints.approvals import queue, resolve
    from app.services import _approval_queue as queue_pkg
    assert hasattr(queue_pkg, "ApprovalQueuePage")
    assert hasattr(queue_pkg, "ApprovalQueueProjection")
    assert hasattr(queue_pkg, "ApprovalRequestIntakePlan")
    route_source = inspect.getsource(queue) + inspect.getsource(resolve)
    assert "from app.services._approval_queue" in route_source
    assert "from app.services._approval_queue.lifecycle" not in route_source
```

```python
# :1025 (rewrite)
def test_approval_queue_lifecycle_uses_service_owned_helpers() -> None:
    """S6.3: package __init__ imports leaf submodules; no lifecycle aggregator."""
    import inspect
    from app.services import _approval_queue as queue_pkg
    package_source = inspect.getsource(queue_pkg)
    assert "from .contracts import" in package_source
    assert "from .counts import" in package_source
    assert "from .execution import" in package_source
    assert "from .queries import" in package_source
    assert "from .lifecycle" not in package_source
```

```python
# :1041 (rewrite)
def test_approval_queue_lifecycle_delegates_intake_query_projection() -> None:
    """S6.3: __init__ never inlines write-side logic; banned strings stay banned."""
    from pathlib import Path
    REPO = Path(__file__).resolve().parents[3]
    src = (REPO / "backend/app/services/_approval_queue/__init__.py").read_text()
    BANNED = ("create_approval_request_with_audit", "select(ApprovalRequest)",
              "def _build_delete_intake_plan", "def _approval_queue_page")
    for token in BANNED:
        assert token not in src, f"S6.3: banned token {token!r} found in package init"
```

Expected: RED at HEAD against the deletion (because `lifecycle.py` still exists and `__init__.py` re-imports from it). GREEN once `lifecycle.py` is gone and `__init__.py` carries the leaf imports.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/services/_approval_queue/__init__.py` — replace the current `from .lifecycle import (...)` block with the 4 leaf imports verbatim from `lifecycle.py:3-6`:
  ```python
  from .contracts import ApprovalQueuePage, ApprovalQueueProjection, ApprovalRequestIntakePlan
  from .counts import count_pending_approval_queue
  from .execution import create_delete_approval_request
  from .queries import list_approval_queue_page, list_my_approval_queue_page
  ```
  Keep the existing `__all__` list (already correct and identical).
- `tests/backend/pytest/test_architecture_deepening_contracts.py` — rewrite the 3 tests at `:1005, :1025, :1041` per the snippets above.

Files to delete:
- `backend/app/services/_approval_queue/lifecycle.py`.

Files to create:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/test_architecture_deepening_contracts.py -k approval_queue -x -q
pytest tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approval_resolution.py -x -q
make -f scripts/Makefile test-architecture-locks
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- 3 deepening tests rewritten as above.
- No TOML allowlist anchors `lifecycle.py`.

**README/Doc Updates (same commit)**:
- `backend/app/services/_approval_queue/README.md` — drop any reference to `lifecycle.py`.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -k approval_queue -q` — must pass.
2. `pytest tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approval_resolution.py -q` — must pass.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/services/_approval_queue/` — clean.
5. `mypy backend/app/services/_approval_queue/` — clean.

**Commit Boundary**: single commit (test rewrites + import migration + file deletion in same commit).
**Title**: `refactor(approvals): inline _approval_queue/lifecycle into package __init__`.

**Rollback** (class: LOCK-RATCHET — restores `lifecycle.py`, original `__init__.py` indirection, and original deepening test bodies):
1. `git revert <SHA>`.
2. Estimated revert time: 10 min.

**Risk Notes**: LOW — pure re-export deletion; identical surface. Mitigation: rewritten deepening tests pin the new structure (no lifecycle indirection); no change in runtime semantics.

---

### Item #26 — #75 — Delete-and-consolidate `_auto_reject_kri_approval`

**Sequence**: Wave 3, slot 26. **Effort**: S (≤2h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none — independent of #7/#9/#18/#33/#34/#54/#60.

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 26 (`final-section-2-sequence.md:59`).
- [ ] Read latest state of:
  - `backend/app/services/_approval_execution/kri_history_correction.py:23-24` (the duplicate).
  - `backend/app/services/_approval_execution/kri_value_submission.py:23-24` (byte-identical duplicate).
- [ ] Confirm 6 caller sites (Phase 6 verified at exact lines):
  - `kri_history_correction.py:50, 56, 67, 78, 119` (5 callers).
  - `kri_value_submission.py:97` (1 caller).
- [ ] Read `backend/app/services/_approval_execution/results.py` (recommended host — `SideEffectResult.auto_rejected` already lives here).
- [ ] No concurrent feature work touches `_approval_execution/`.

**TDD Step 1 — Write Failing Test (RED)**

Append to `tests/backend/pytest/test_architecture_deepening_contracts.py`:

```python
def test_auto_reject_kri_approval_consolidated() -> None:
    """Bonus #75: byte-identical duplicates removed; canonical lives in results."""
    import importlib
    history = importlib.import_module("app.services._approval_execution.kri_history_correction")
    submission = importlib.import_module("app.services._approval_execution.kri_value_submission")
    results = importlib.import_module("app.services._approval_execution.results")
    assert not hasattr(history, "_auto_reject_kri_approval"), (
        "Bonus #75: duplicate must be deleted from kri_history_correction"
    )
    assert not hasattr(submission, "_auto_reject_kri_approval"), (
        "Bonus #75: duplicate must be deleted from kri_value_submission"
    )
    assert hasattr(results, "auto_reject_kri_approval"), (
        "Bonus #75: canonical helper must live in _approval_execution.results"
    )
```

Expected: RED at HEAD — both duplicates exist; canonical does not.

Behavioral parity test extension to `tests/backend/pytest/test_approval_side_effect_dispatch.py` — add parametrized cases that exercise both auto-reject paths (history correction stale + value submission stale) and assert `SideEffectResult.outcome == SideEffectOutcome.AUTO_REJECTED` and `.reason` propagates through `apply_auto_rejection`. Use `client_factory` for any HTTP integration.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/services/_approval_execution/results.py` — append:
  ```python
  def auto_reject_kri_approval(approval: ApprovalRequest, reason: str) -> SideEffectResult:
      return SideEffectResult.auto_rejected(reason)
  ```
  (`ApprovalRequest` already imported at top of file; verify.)
- `backend/app/services/_approval_execution/kri_history_correction.py` — delete lines 23-24 (`def _auto_reject_kri_approval(...)`); replace 5 call sites at lines 50, 56, 67, 78, 119 with `auto_reject_kri_approval(...)`; merge the new symbol into the existing `from .results import SideEffectResult` import at line :18 → `from .results import SideEffectResult, auto_reject_kri_approval`.
- `backend/app/services/_approval_execution/kri_value_submission.py` — same: delete lines 23-24; replace caller at line 97; merge import at line :18.
- `tests/backend/pytest/test_architecture_deepening_contracts.py` — append the new structural assertion (above).
- `tests/backend/pytest/test_approval_side_effect_dispatch.py` — extend with parametrized auto-reject parity cases.

Files to create:
- None.

Files to delete:
- None (the duplicates are removed by editing, not by file deletion).

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/test_approval_side_effect_dispatch.py tests/backend/pytest/test_approval_edit_apply.py tests/backend/pytest/test_pending_kri_approval_preflight.py -x -q
pytest tests/backend/pytest/test_architecture_deepening_contracts.py -k auto_reject -q
make -f scripts/Makefile test-architecture-locks
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New structural assertion above.
- No TOML allowlist anchors.

**README/Doc Updates (same commit)**:
- `backend/app/services/_approval_execution/README.md` (if present) — list `auto_reject_kri_approval` under canonical helpers.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/test_approval_side_effect_dispatch.py -q` — must pass.
2. `pytest tests/backend/pytest/test_approval_edit_apply.py -q` — must pass.
3. `pytest tests/backend/pytest/test_pending_kri_approval_preflight.py -q` — must pass.
4. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -k auto_reject -q` — must pass.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `ruff check backend/app/services/_approval_execution/` — clean.
7. `mypy backend/app/services/_approval_execution/` — clean.

**Commit Boundary**: single commit.
**Title**: `refactor(approvals): consolidate auto_reject_kri_approval in _approval_execution.results`.

**Rollback** (class: TRIVIAL — restores both duplicates; outcome semantics unchanged):
1. `git revert <SHA>`.
2. Estimated revert time: 10 min.

**Risk Notes**: LOW — byte-identical duplicates; outcome semantics preserved. Mitigation: behavioral parametric parity test catches any drift; canonical co-locates with `SideEffectResult.auto_rejected`.

---

### Item #27 — #18 — Repoint-and-delete endpoint `_build_approval_read`

**Sequence**: Wave 3, slot 27. **Effort**: S (≤2h). **Priority**: P2. **Atomic with**: none — co-touches `_shared.py` with #7; keep separate commits. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 27 (`final-section-2-sequence.md:60`).
- [ ] Read latest state of:
  - `backend/app/api/v1/endpoints/approvals/_shared.py:34-61` (the endpoint copy).
  - `backend/app/services/_approval_queue/projection.py:13-39` (canonical, 19-field-for-field identical per Phase 6).
- [ ] Read 4 callers: `resolve.py:18,61,85,102` and `detail.py:15,56`.
- [ ] No concurrent feature work touches `approvals/_shared.py` (#7 in Wave 3 slot 20 also touches this file — keep in separate commit).

**TDD Step 1 — Write Failing Test (RED)**

Append to `tests/backend/pytest/test_architecture_deepening_contracts.py`:

```python
def test_endpoint_shim_build_approval_read_repointed() -> None:
    """S6.2: endpoint copy deleted; resolve+detail consume queue projection."""
    import importlib, inspect
    shared = importlib.import_module("app.api.v1.endpoints.approvals._shared")
    resolve = importlib.import_module("app.api.v1.endpoints.approvals.resolve")
    detail = importlib.import_module("app.api.v1.endpoints.approvals.detail")
    projection = importlib.import_module("app.services._approval_queue.projection")
    assert not hasattr(shared, "_build_approval_read"), (
        "S6.2: endpoint copy of _build_approval_read must be deleted"
    )
    assert hasattr(projection, "build_approval_read"), "canonical must remain"
    src = inspect.getsource(resolve) + inspect.getsource(detail)
    assert "build_approval_read" in src, "endpoints must consume canonical helper"
    assert "_build_approval_read" not in src, "endpoints must not call deleted shim"
```

Plus a 19-key response-shape parity regression in `tests/backend/pytest/test_approval_response_parity.py` (new file with `pytestmark = pytest.mark.contract`) using `client_factory`. Asserts that POST `/approvals/{id}/approve`, `/reject`, `/cancel`, and GET `/approvals/{id}` return the same 19 keys for a single approval row.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/api/v1/endpoints/approvals/resolve.py:18` — replace `from ._shared import _build_approval_read, logger` with `from ._shared import logger` and add `from app.services._approval_queue.projection import build_approval_read`.
- `backend/app/api/v1/endpoints/approvals/resolve.py:61, 85, 102` — replace `_build_approval_read(...)` with `build_approval_read(...)` (3 sites).
- `backend/app/api/v1/endpoints/approvals/detail.py:15` — replace `from ._shared import _build_approval_read` with `from app.services._approval_queue.projection import build_approval_read`.
- `backend/app/api/v1/endpoints/approvals/detail.py:56` — replace `_build_approval_read(...)` with `build_approval_read(...)`.
- `backend/app/api/v1/endpoints/approvals/_shared.py:34-61` — delete the entire `_build_approval_read` body. Drop now-orphaned imports (`approval_resource_label`, `ApprovalRequestRead`, `approval_capabilities`, `User`, `ApprovalRequest`). Keep `logger` symbol — `resolve.py` still imports it.
- `tests/backend/pytest/test_architecture_deepening_contracts.py` — append the new structural assertion.

Files to create:
- `tests/backend/pytest/test_approval_response_parity.py` (the 19-key response-shape parity regression).

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approval_resolution.py tests/backend/pytest/test_approvals.py -x -q
pytest tests/backend/pytest/test_approval_response_parity.py -q
pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q
make -f scripts/Makefile test-architecture-locks
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New structural assertion above.
- `_endpoint_commit_allowlist.toml`: no change (no new commits introduced).
- Existing positive anchor at `test_architecture_deepening_contracts.py:1029` (`assert hasattr(projection, "build_approval_read")`) reinforced — no change needed.

**README/Doc Updates (same commit)**:
- None. AUTHZ-APPROVALS row at `docs/security/authorization-capability-contract.md:119` already names `services/_approval_queue/projection.py`.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/test_approval_workflow.py -q` — must pass.
2. `pytest tests/backend/pytest/test_approval_resolution.py -q` — must pass.
3. `pytest tests/backend/pytest/test_approval_response_parity.py -q` — must pass.
4. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q` — must pass.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `ruff check backend/app/api/v1/endpoints/approvals/` — clean.
7. `mypy backend/app/api/v1/endpoints/approvals/` — clean.

**Commit Boundary**: single commit (RED test + 4 call-site repoints + deletion in same commit).
**Title**: `refactor(approvals): repoint _build_approval_read to approval_queue.projection`.

**Rollback** (class: TRIVIAL — restores endpoint copy; response shape unchanged either way):
1. `git revert <SHA>`.
2. Estimated revert time: 10 min.

**Risk Notes**: LOW — bodies are 19-field-for-field identical (Phase 6 verified). Mitigation: response-shape parity regression catches any drift; endpoint shim deletion is mechanical.

---

### Item #28 — #20 — Risk ID generation co-location (DOC-ONLY w/ stable re-export)

**Sequence**: Wave 3, slot 28. **Effort**: S (≤2h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 28 (`final-section-2-sequence.md:61`).
- [ ] Read latest state of `backend/app/api/v1/endpoints/risks/id_generation.py:7` (`async def generate_risk_id_code(db, process)`).
- [ ] Read `backend/app/api/v1/endpoints/risks/__init__.py:3,8` (the load-bearing re-export).
- [ ] Read `backend/app/api/v1/endpoints/risks/crud/create.py:19` (caller via package facade).
- [ ] Read `backend/scripts/migrate_risks.py:16` (caller via package facade).
- [ ] Read tests at `tests/backend/pytest/test_risks.py:556`, `tests/backend/pytest/test_risk_id_generation.py:13`.
- [ ] Read `docs/agent/ENDPOINT_INVARIANTS.md:11-14, 21-22`.
- [ ] No concurrent feature work touches risks endpoint surface.

**TDD Step 1 — Write Failing Test (RED — actually a forward-facing ratchet)**

File: `tests/backend/pytest/architecture/test_risks_required_reexports_red.py`

```python
"""S1.6: lock the load-bearing risks package re-export of generate_risk_id_code."""
from __future__ import annotations
import importlib
import re
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]

def test_generate_risk_id_code_is_re_exported_from_risks_package() -> None:
    pkg = importlib.import_module("app.api.v1.endpoints.risks")
    deep = importlib.import_module("app.api.v1.endpoints.risks.id_generation")
    assert getattr(pkg, "generate_risk_id_code") is deep.generate_risk_id_code

def test_generate_risk_id_code_listed_in_package_all() -> None:
    pkg = importlib.import_module("app.api.v1.endpoints.risks")
    assert "generate_risk_id_code" in getattr(pkg, "__all__", ())

def test_two_or_more_test_files_use_package_facade_import() -> None:
    pattern = re.compile(
        r"from\s+app\.api\.v1\.endpoints\.risks\s+import\s+generate_risk_id_code"
    )
    matches = []
    for path in (REPO_ROOT / "tests/backend/pytest").rglob("*.py"):
        if pattern.search(path.read_text(encoding="utf-8")):
            matches.append(str(path.relative_to(REPO_ROOT)))
    assert len(matches) >= 2, matches

def test_endpoint_invariants_doc_pins_required_reexport() -> None:
    invariants = (REPO_ROOT / "docs/agent/ENDPOINT_INVARIANTS.md").read_text(encoding="utf-8")
    assert "app.api.v1.endpoints.risks.generate_risk_id_code" in invariants
```

Expected: PASS today — the contract is already satisfied. The test is a forward-facing ratchet to prevent a future cleanup from removing the re-export.

**TDD Step 2 — Implement Change (DOC-ONLY)**

Files to create:
- `tests/backend/pytest/architecture/test_risks_required_reexports_red.py` (above).

Files to edit:
- `docs/agent/ENDPOINT_INVARIANTS.md:21-22` — bump verification date stanza from `2026-02-16` to `2026-05-09`. Add a stanza pinning `app.api.v1.endpoints.risks.generate_risk_id_code` re-export.
- `.planning/audits/_context/02-backend-endpoints.md` — add note: risks package facade re-export is load-bearing for `test_risks.py:556` and `test_risk_id_generation.py:13`. Future cleanup removing the re-export must first migrate both tests.
- `.planning/audits/_context/06-test-surface.md` — add one-line pointer to the two tests that depend on the package facade.

Files to delete:
- None (DOC-ONLY).

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_risks_required_reexports_red.py -q
```
Already green; ratchet locks the contract.

**Lock/TOML/Contract Updates (same commit)**:
- New architecture lock IS the contract.
- No TOML allowlist edits required.

**README/Doc Updates (same commit)**:
- `docs/agent/ENDPOINT_INVARIANTS.md:21-22` — date bump and re-export pin.
- `.planning/audits/_context/02-backend-endpoints.md` — note row.
- `.planning/audits/_context/06-test-surface.md` — pointer.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_risks_required_reexports_red.py -q` — must be green.
2. `pytest tests/backend/pytest/test_risks.py -q` — sanity.
3. `pytest tests/backend/pytest/test_risk_id_generation.py -q` — sanity.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.

**Commit Boundary**: single commit.
**Title**: `docs(risks): lock generate_risk_id_code package re-export contract`.

**Rollback** (class: DOC-ONLY):
1. Delete the test file; revert doc edits.
2. No source code touched.
3. Estimated revert time: 5 min.

**Risk Notes**: VERY LOW — DOC-ONLY ratchet; pure forward-facing pin. Mitigation: 4-assertion test catches any future cleanup that removes the re-export.

---

## End of Section 3 — Wave 1-3 Recipes (28 Items)

This section delivered the per-item recipes for sequence slots 1-28
covering Wave 1 (ADR ratification), Wave 2 (P1 quick wins + #76 auth
migration), and Wave 3 (P2 dead-code A). Section 4 picks up at slot 29
(Wave 4) for the doc-contract wave + remaining P2 dead-code.


---

## Section 4 — Per-Item Recipes Part 2 (Waves 4-5, Slots 29-58)


Phase: **7 (production-write)**. Build commit ref: `1ee872a4` on `main`.
Source: Phase 5 recipes (`recipe-01-issues.md`, `recipe-02-risks-and-endpoints.md`, `recipe-03-approvals.md`, `recipe-04-kris.md`, `recipe-05-vendor-migration.md`, `recipe-06-frontend-deadcode.md`, `recipe-07-frontend-authz.md`, `recipe-08-crosscut-adrs.md`, `plan-loop-3-06-adr-drafts.md`).
Phase 6 corrections applied: see verify-recipe-01..08 reports.
Master sequence: `plan-loop-3-07-integration-v2.md:343-422` (79 items).

This section documents items in v2 master-sequence slots 30-58 — Wave 4 (P2 dead-code B + Doc-Contract Cluster, 15 items in slots 30-44) and Wave 5 (P2 chains + ADR-007 amendment text, 15 items in slots 45-58 plus the #43 / #44 cross-domain pair previously considered Wave 5 partners).

All recipes assume single sequential developer; TDD red→green; new architecture
tests carry `pytestmark = pytest.mark.contract`; backend integration tests use
`client_factory` from `tests/backend/pytest/conftest.py`. Quote rule: ≤15 words.

---

## Wave 4 — P2 Dead-code B + Doc-Contract Cluster (Items #21S + 27-41 in this section, v2 Seq 28-45)

The v2 master sequence places 15 items into Wave 4 (per `final-section-2-sequence.md:190-208`). Wave 4 leads off with Seq 28 (#21) — captured below as `Item #21S (Section 4)` to avoid renumbering against Section 3's `Item #27` / `Item #28` slots. The remainder follows the user-supplied Wave 4 ordering (#25, #26, #29, #33, #36, #35, #48, #64, #47, #22, #23, #55, #24+#51 atomic, #56+#61 atomic).

> **Author note**: the user specified the Wave-4 listing in
> traversal order rather than v2-Seq order. Each recipe below
> records both `Wave: 4` and the v2 `Slot: …` so readers can
> reconcile against `final-section-2-sequence.md` and
> `plan-loop-3-07-integration-v2.md:344-422`.

---

### Item #21S (Section 4) — #21 — Collapse Control-Risk link loader duplicates (S2.6)

**Note**: This recipe is the missing Wave-4 leadoff slot (v2 Seq 28). It is named `#21S` instead of `#27` to avoid renumbering all subsequent Section 4 items, since Section 3 already uses `#27` and `#28` for `#18` and `#20` respectively. The Section 2 master sequence still pins this as Seq 28 / Wave 4. Source: `recipe-02-risks-and-endpoints.md:958-1106`.

**Wave**: 4  | **Slot**: v2 Seq 28  | **Effort**: S (≤2h)  | **Priority**: P2  | **Domain**: endpoints

**Dependencies**: none
**Atomic with**: none
**Validator?**: no

#### Why this work

`backend/app/services/_control_execution/link_policy.py:22` and
`link_policy.py:35` carry duplicated `load_link_for_control` / `load_link_for_risk`
helpers that raise identical `HTTPException(status_code=404, detail="Link not found")`
(lines 31, 44). Both callers (`link_governance.py:102`, `link_governance.py:181`)
use them; collapse into a single keyword-only `load_link(db, *, control_id, risk_id)`
helper. Architecture deepening contract `tests/backend/pytest/test_architecture_deepening_contracts.py`
pins `load_control_for_link` / `load_risk_for_link` / `assert_*_for_link`
but NOT the per-direction loaders, so the collapse is contract-safe. Audit ID
= #21 (S2.6); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 28 (`final-section-2-sequence.md`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of:
  - `backend/app/services/_control_execution/link_policy.py:22-45`
  - `backend/app/services/_control_execution/link_governance.py:102, 181`
  - `tests/backend/pytest/test_architecture_deepening_contracts.py`
- [ ] No concurrent feature-work conflicts on `_control_execution/`.

#### TDD Step 1 — Write Failing Test (RED)

**Test file (new)**: `tests/backend/pytest/architecture/test_control_risk_link_loader_collapsed_red.py`

```python
"""Lock the collapsed load_link helper in control-risk link policy."""
from __future__ import annotations

import importlib

import pytest

pytestmark = pytest.mark.contract


def test_load_link_helper_present() -> None:
    link_policy = importlib.import_module(
        "app.services._control_execution.link_policy"
    )
    assert callable(getattr(link_policy, "load_link", None))


def test_per_direction_loaders_removed() -> None:
    link_policy = importlib.import_module(
        "app.services._control_execution.link_policy"
    )
    assert not hasattr(link_policy, "load_link_for_control")
    assert not hasattr(link_policy, "load_link_for_risk")


def test_link_governance_uses_collapsed_loader() -> None:
    import inspect
    link_governance = importlib.import_module(
        "app.services._control_execution.link_governance"
    )
    source = inspect.getsource(link_governance)
    assert "load_link(db, control_id=" in source or "load_link(db," in source
    assert "load_link_for_control(" not in source
    assert "load_link_for_risk(" not in source
```

Add a behavioral regression in `tests/backend/pytest/test_risks.py` (using
`client_factory`-built fixtures already present) covering the 404 branch for
both call sites (`delete_risk_control_link` and `delete_control_risk_link`).
Skip if existing tests already cover both 404 branches.

**Expected**: RED. All three lock assertions FAIL today (per-direction
loaders still present, governance imports them).

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/services/_control_execution/link_policy.py:22-45` — replace
  `load_link_for_control` and `load_link_for_risk` with a single
  keyword-only `load_link(db, *, control_id, risk_id)` helper.

  ```python
  async def load_link(
      db: AsyncSession,
      *,
      control_id: int,
      risk_id: int,
  ) -> ControlRiskLink:
      link = (
          await db.execute(
              select(ControlRiskLink)
              .where(ControlRiskLink.control_id == control_id)
              .where(ControlRiskLink.risk_id == risk_id)
          )
      ).scalar_one_or_none()
      if link is None:
          raise HTTPException(status_code=404, detail="Link not found")
      return link
  ```

- `backend/app/services/_control_execution/link_governance.py:102` — change
  `link = await load_link_for_control(db, control_id=control_id, risk_id=risk_id)`
  to `link = await load_link(db, control_id=control_id, risk_id=risk_id)`.
- `backend/app/services/_control_execution/link_governance.py:181` — change
  `link = await load_link_for_risk(db, risk_id=risk_id, control_id=control_id)`
  to `link = await load_link(db, control_id=control_id, risk_id=risk_id)`.
- `link_governance.py` import block — drop `load_link_for_control`,
  `load_link_for_risk`; add `load_link`.

**Files to create**:
- `tests/backend/pytest/architecture/test_control_risk_link_loader_collapsed_red.py` (above).

**Files to delete**: none.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_control_risk_link_loader_collapsed_red.py -q
pytest tests/backend/pytest/test_risks.py -q
pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q
```

All pass.

#### Lock/TOML/Contract updates (same commit)

- New architecture lock IS the contract.
- No TOML allowlist edits.
- No capability-contract change.

#### README / doc updates (same commit)

- None required.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_control_risk_link_loader_collapsed_red.py -q` — pass.
2. `pytest tests/backend/pytest/test_risks.py -q` — regression green.
3. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q` — deepening contract sanity green.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `rg "load_link_for_control|load_link_for_risk" backend/` — no hits outside the deleted block.
6. `ruff check backend/app/services/_control_execution` — clean.
7. `mypy backend/app/services/_control_execution` — clean.

#### Commit boundary

Single commit titled: `refactor(control-risk): collapse load_link_for_* into load_link`.

#### Rollback

- Class: **LOCK-RATCHET**.
- Procedure:
  1. `git revert <SHA>` — restores per-direction loaders.
  2. Drop the new test file.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: ≤2h (single helper rewrite + 2 caller edits + 1 lock test + verification).
- Risk: LOW — pure refactor; identical 404 behavior preserved; both callers covered.
- Mitigations: structural lock pins symbol surface; behavioral 404-branch regression spot-checks both delete endpoints.

---

### Item #27 (Section 4) — #25 — Extract KRI department-scope helper

**Wave**: 4  | **Slot**: v2 Seq 29  | **Effort**: S (~3h)  | **Priority**: P2  | **Domain**: kris

**Dependencies**: none (lands cleanly after #24+#51 settle)
**Atomic with**: none
**Validator?**: no

#### Why this work

`backend/app/api/v1/endpoints/kris/access.py:20-32` and `backend/app/services/_register_listings/kris.py:58-69` both carry the `dept_ids = get_user_department_ids(...) → filter` pattern, plus the `due_soon.py`, `overdue.py`, `breaches.py` triplicate inline at `backend/app/api/v1/endpoints/kris/crud/`. The recipe extracts a single `apply_kri_department_scope(query, *, current_user, department_id)` helper into `kris/access.py`. Audit ID = #25 (S3.7); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 29 (`plan-loop-3-07-integration-v2.md:372`).
- [ ] Confirm prerequisites complete: #24+#51 atomic cluster (Wave 4) settled — fresh import tree on `_kri_history.direct_application`.
- [ ] Read latest state of `backend/app/api/v1/endpoints/kris/access.py:20-32`, `backend/app/services/_register_listings/kris.py:58-69`, `backend/app/api/v1/endpoints/kris/crud/{due_soon,overdue,breaches}.py`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file 1** (behavioural, new): `tests/backend/pytest/test_kris_department_scope_helper_red.py`

```python
import pytest
pytestmark = pytest.mark.contract

@pytest.mark.asyncio
async def test_kris_due_soon_department_scope_matches_inline_baseline(
    client_factory, db_session, dept_user, other_dept_kri,
) -> None:
    async with client_factory(current_user=dept_user) as ac:
        r = await ac.get("/api/v1/kris/due-soon", params={"department_id": other_dept_kri.department_id})
        assert r.status_code == 200
        assert r.json()["items"] == []
```

(Repeat for `/overdue`, `/breaches` and the matching-department case; also for the privileged-user path with `dept_ids=None` and the no-`department_id` query path.)

**Test file 2** (structural lock): append to `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`:

```python
def test_kri_endpoint_dept_scope_is_extracted() -> None:
    inline_offenders: list[str] = []
    for fname in ("due_soon.py", "overdue.py", "breaches.py"):
        path = REPO_ROOT / "backend/app/api/v1/endpoints/kris/crud" / fname
        if "get_user_department_ids" in path.read_text(encoding="utf-8"):
            inline_offenders.append(fname)
    assert inline_offenders == []
```

**Expected**: RED. All three files contain `get_user_department_ids` today.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/api/v1/endpoints/kris/access.py` — append `apply_kri_department_scope(query, *, current_user, department_id)` returning the query with department-scope filters applied (mirroring the existing inline triplicated logic).
- `backend/app/api/v1/endpoints/kris/crud/due_soon.py`, `.../overdue.py`, `.../breaches.py` — replace inline `get_user_department_ids` filter blocks with calls to the new helper.
- Optionally collapse the duplicate `can_create_kri_for_any_parent_risk` body (`access.py:20-32` and `_register_listings/kris.py:58-69`) by routing one through the other; out of scope for #25's narrow extraction unless trivial.

**Files to create**:
- `tests/backend/pytest/test_kris_department_scope_helper_red.py`.
- New structural lock appended to `test_w4_bc_g_kri_history_boundaries_red.py`.

**Files to delete**: none.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/test_kris_department_scope_helper_red.py tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py -q
```

Both pass.

#### Lock/TOML/Contract updates (same commit)

- New structural lock IS the contract.
- No capability-contract change (helper preserves capability semantics — pure-Python filter consolidation).
- No TOML allowlist edits.

#### README / doc updates (same commit)

- None (no doc citation pins this duplicate pattern).

#### Verification commands (run all in order)

1. `make -f scripts/Makefile test-architecture-locks` — locks green.
2. `pytest tests/backend/pytest/test_kris_department_scope_helper_red.py tests/backend/pytest/test_kris_rbac.py tests/backend/pytest/test_kris_history_listing_api.py -q` — must pass.
3. `rg "get_user_department_ids" backend/app/api/v1/endpoints/kris/` — only `access.py` (helper) plus its imports in the three crud files.
4. `ruff check backend/app/api/v1/endpoints/kris backend/app/services/_register_listings` — clean.
5. `mypy backend/app/api/v1/endpoints/kris backend/app/services/_register_listings` — clean.

#### Commit boundary

Single commit titled: `S3.7: extract apply_kri_department_scope; collapse triplicated due_soon/overdue/breaches filter`.

#### Rollback

- Class: **LOCK-RATCHET**.
- Procedure:
  1. `git revert <SHA>` — restores the inline triplicated blocks.
  2. Drop the new test files.
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: 3h (helper + 3 crud rewrites + 2 tests + verification).
- Risk: LOW — pure-Python filter consolidation; capability semantics preserved.
- Mitigations: behavioural parity test pins endpoint shape; structural lock catches re-introduction.

---

### Item #28 (Section 4) — #26 — Delete `KRIForm.tsx` shim and ESLint pin

**Wave**: 4  | **Slot**: v2 Seq 30  | **Effort**: S (~2h)  | **Priority**: P2  | **Domain**: frontend (kris)

**Dependencies**: none
**Atomic with**: none
**Validator?**: no

#### Why this work

`frontend/src/components/KRIForm.tsx` is a 2-line shim re-exporting `KRIFormContainer` from `@/components/kri-form/KRIFormContainer`. Sole production importer is `KRINewPage.tsx:5`; 4 test sites also reference it. `frontend/eslint.config.js:145-158` carries a file-targeted rule block pinning the shim. Audit ID = #26 (S3.9); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 30 (`plan-loop-3-07-integration-v2.md:373`).
- [ ] Confirm prerequisites: none. Verify `KRIEditPage.tsx` does NOT exist; `KRINewPage.tsx` is the sole production importer.
- [ ] Read latest state of `frontend/src/components/KRIForm.tsx`, `frontend/src/pages/KRINewPage.tsx:5`, `frontend/eslint.config.js:145-158`, the 4 test sites.
- [ ] Run `rg "@/components/KRIForm'|vi.mock(\"@/components/KRIForm\"" frontend/ tests/frontend/` — produce expected match set.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: append to `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`:

```python
def test_kri_form_facade_is_removed() -> None:
    assert not (REPO_ROOT / "frontend/src/components/KRIForm.tsx").exists()


def test_eslint_kri_form_pin_is_removed() -> None:
    eslint = (REPO_ROOT / "frontend/eslint.config.js").read_text(encoding="utf-8")
    assert "src/components/KRIForm.tsx" not in eslint


def test_no_module_imports_kri_form_facade() -> None:
    offenders: list[str] = []
    for root in (REPO_ROOT / "frontend/src", REPO_ROOT / "tests/frontend/unit/src"):
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix not in {".ts", ".tsx"}:
                continue
            text = path.read_text(encoding="utf-8")
            if "@/components/KRIForm'" in text or 'vi.mock("@/components/KRIForm"' in text:
                offenders.append(str(path.relative_to(REPO_ROOT)))
    assert offenders == []
```

**Expected**: RED. All three assertions fail today.

#### TDD Step 2 — Implement Change

**Files to delete**:
- `frontend/src/components/KRIForm.tsx` (2-line shim).

**Files to edit**:
- `frontend/src/pages/KRINewPage.tsx:5` — change `import { KRIForm } from '@/components/KRIForm';` to `import { KRIFormContainer as KRIForm } from '@/components/kri-form/KRIFormContainer';`. If `KRIFormProps`/`KRIFormVendorContext` are referenced, add `import type { KRIFormProps, KRIFormVendorContext } from '@/components/kri-form/kriForm.types';`.
- `tests/frontend/unit/src/components/__tests__/KRIForm.edit.test.tsx:5` — repoint import to `@/components/kri-form/KRIFormContainer`.
- `tests/frontend/unit/src/components/__tests__/KRIForm.vendor-context.test.tsx:4` — repoint.
- `tests/frontend/unit/src/pages/__tests__/DirectFormCapabilityGates.test.tsx:66` — update `vi.mock` target string.
- `tests/frontend/unit/src/pages/__tests__/KRIForms.vendor-context.test.tsx:32` — update `vi.mock` target string.
- `frontend/eslint.config.js:145-158` — remove the `files: ["src/components/KRIForm.tsx"]` rule block.
- `frontend/src/components/kri-form/README.md:5` — replace any mention of public facade `KRIForm.tsx` with reference to `KRIFormContainer`.

**Files to create**: the new structural lock additions above.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py -q -k kri_form
cd frontend && npm run test:run -- KRIForm
```

Both pass.

#### Lock/TOML/Contract updates (same commit)

- New structural lock additions above.
- Capability contract `md:117` mentions "KRI form/list components" without pinning the shim file; no edit required.
- No TOML allowlist edits.

#### README / doc updates (same commit)

- `frontend/src/components/kri-form/README.md:5` — remove "public facade `KRIForm.tsx`" prose.

#### Verification commands (run all in order)

1. `make -f scripts/Makefile test-architecture-locks` — locks green.
2. `cd frontend && npm run lint` — clean.
3. `cd frontend && npm run test:run -- KRIForm` — must pass.
4. `rg "@/components/KRIForm'" frontend tests` — zero hits.
5. `cd frontend && npx tsc --noEmit` — clean.

#### Commit boundary

Single commit titled: `S3.9: delete KRIForm.tsx shim; rewrite 5 importers; drop eslint.config pin`.

#### Rollback

- Class: **LOCK-RATCHET**.
- Procedure:
  1. `git revert <SHA>` — restores the 2-line shim, 1 page import, 4 test sites, ESLint rule block, README prose.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: 2h (file delete + 5 importer rewrites + ESLint rule drop + README + 3 lock tests).
- Risk: LOW — sole production importer is one page; 4 test sites verified.
- Mitigations: typecheck catches missed imports; ESLint pin removal verified by lock test.

---

### Item #29 (Section 4) — #29 — Source-type vocabulary canonicalization

**Wave**: 4  | **Slot**: v2 Seq 31  | **Effort**: S (3h)  | **Priority**: P2  | **Domain**: issues

**Dependencies**: none (independent; cleanest after #28 but landing earlier is fine)
**Atomic with**: none
**Validator?**: no

#### Why this work

Three near-duplicate definitions exist:
- `_source_type_value` at `backend/app/services/_issue_register/source_mutation.py:24`.
- `source_type_value` at `backend/app/services/_issue_workflow/update_plans.py:19`.
- `source_type_value` at `backend/app/services/_issue_register/linked_context.py:103`.

The recipe extracts a single canonical helper `source_type_value` into `_issue_register/constants.py` with `None`-handling (returns `""`) and Enum coercion. Audit ID = #29 (S4.6); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 31 (`plan-loop-3-07-integration-v2.md:374`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `backend/app/services/_issue_register/constants.py`, `_issue_register/source_mutation.py:24`, `_issue_workflow/update_plans.py:19`, `_issue_register/linked_context.py:103`.
- [ ] Confirm three definitions exist at the cited lines.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file 1** (architecture lock, new): `tests/backend/pytest/architecture/test_source_type_value_has_one_canonical_definition_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
from __future__ import annotations
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
TRIO = (
    REPO_ROOT / "backend/app/services/_issue_register/source_mutation.py",
    REPO_ROOT / "backend/app/services/_issue_workflow/update_plans.py",
    REPO_ROOT / "backend/app/services/_issue_register/linked_context.py",
)


def test_source_type_value_canonical_home_exists() -> None:
    from app.services._issue_register import constants
    assert hasattr(constants, "source_type_value")


def test_source_type_value_defined_only_in_constants() -> None:
    defs = 0
    for path in TRIO:
        text = path.read_text()
        if "def source_type_value" in text or "def _source_type_value" in text:
            defs += 1
    assert defs == 0, "duplicate source_type_value definitions remain in trio"
```

**Test file 2** (unit test, new): `tests/backend/pytest/test_issue_source_type_value.py` (NOT under `architecture/`).

```python
from __future__ import annotations
import pytest
from enum import Enum
from app.models.issue import IssueSourceType
from app.services._issue_register.constants import source_type_value


class _OtherEnum(str, Enum):
    foo = "foo"


@pytest.mark.parametrize(
    "value,expected",
    [
        (IssueSourceType.manual, "manual"),
        (IssueSourceType.audit, "audit"),
        (IssueSourceType.control_execution, "control_execution"),
        (IssueSourceType.kri_breach, "kri_breach"),
        ("manual", "manual"),
        (_OtherEnum.foo, "foo"),
        (None, ""),
    ],
)
def test_source_type_value_normalizes_inputs(value, expected) -> None:
    assert source_type_value(value) == expected
```

**Expected**: RED. Both fail (helper not defined yet, three definitions remain).

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/services/_issue_register/constants.py` — append the canonical helper:
  ```python
  from enum import Enum
  from app.models.issue import IssueSourceType

  def source_type_value(source_type: IssueSourceType | Enum | str | None) -> str:
      if source_type is None:
          return ""
      if isinstance(source_type, Enum):
          return source_type.value
      return str(source_type)
  ```
- `backend/app/services/_issue_workflow/update_plans.py:19-20` — delete local `def source_type_value`; add `from app.services._issue_register.constants import source_type_value` at top.
- `backend/app/services/_issue_register/source_mutation.py:24-25` — delete local `def _source_type_value`; add `from .constants import source_type_value` at top. At `:162`, rename local `source_type_value = _source_type_value(source_type)` to `value = source_type_value(source_type)` (avoid shadowing). Update references at `:162,164,175,192` to `value`.
- `backend/app/services/_issue_register/linked_context.py:103-104` — delete local `def source_type_value`; add `from .constants import source_type_value` at top. Call at `:110` works unchanged.

**Files to create**: the two new test files above.

**Files to delete**: none.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_source_type_value_has_one_canonical_definition_red.py tests/backend/pytest/test_issue_source_type_value.py -q
```

Both pass.

#### Lock/TOML/Contract updates (same commit)

- Architecture lock from Step 1.
- No capability-contract change.
- No TOML allowlist edits.

#### README / doc updates (same commit)

- `backend/app/services/_issue_register/README.md` — append Contents bullet: `- constants.py - UNKNOWN_*_LABEL strings and source_type_value coercer (canonical)`.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/test_issue_source_type_value.py -q` — must pass.
2. `pytest tests/backend/pytest/architecture/test_source_type_value_has_one_canonical_definition_red.py -q` — must pass.
3. `pytest tests/backend/pytest/api/v1/test_issue_workflow.py tests/backend/pytest/api/v1/test_issues_crud_api.py -q` — domain suite green.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `ruff check backend/app/services/_issue_register backend/app/services/_issue_workflow` — clean.
6. `mypy backend/app/services/_issue_register backend/app/services/_issue_workflow` — clean.

#### Commit boundary

Single commit titled: `S4.6: extract canonical source_type_value into _issue_register/constants`.

#### Rollback

- Class: **LOCK-RATCHET** (per `plan-loop-3-03-rollback-register.md:341`).
- Procedure:
  1. `git revert <SHA>` to restore the three local definitions and remove the constants helper.
  2. Drop both new test files.
  3. Restore `_issue_register/README.md` Contents bullet edit.
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: 3h (helper + 3 import repoints + variable shadow rename + 2 tests).
- Risk: LOW — bodies are functionally equivalent (Loop B verified `IssueSourceType` is `str, Enum`).
- Mitigations: parametrized unit test covers Enum, str, foreign-Enum, None paths; structural lock catches duplicate re-introduction.

---

### Item #30 (Section 4) — #33 — Unify frontend approval-queued banners

**Wave**: 4  | **Slot**: v2 Seq 32  | **Effort**: S (~3h)  | **Priority**: P2  | **Domain**: approvals (frontend)

**Dependencies**: none. Frontend-only.
**Atomic with**: none
**Validator?**: no

#### Why this work

Two distinct banner components exist: `frontend/src/components/forms/ApprovalQueuedBanner.tsx` (prop-driven, used by Risk and Control forms via i18n hoist at `RiskFormContainer.tsx:111-119` and `ControlFormContainer.tsx:180-188`) and `frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx` (KRI-specific variant with one extra wrapper `<div>` and class-order drift). Loop B confirmed the KRI variant has no semantic difference; recipe unifies under the canonical `ApprovalQueuedBanner` and hoists the KRI i18n into `KRIFormContainer`. Audit ID = #33 (S6.4); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 32 (`plan-loop-3-07-integration-v2.md:375`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `frontend/src/components/kri-form/KRIFormContainer.tsx:7,158-163`, `frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx`, `frontend/src/components/forms/ApprovalQueuedBanner.tsx`, `frontend/src/components/risk-form/RiskFormContainer.tsx:111-119` (for the canonical i18n hoist pattern).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file 1** (component, augment): `tests/frontend/unit/src/components/kri-form/KRIFormContainer.approval-banner.test.tsx`. Render `<KRIFormContainer>` with `state.approvalQueued` set; assert exactly one `ApprovalQueuedBanner` (matched by `data-testid="approval-queued-banner"`) renders with resolved `title`, translated `message` (with `errorKeys.*` prefix routing), and `viewApprovalsLabel`. **Expected**: RED at HEAD because the container imports the dedicated `KriApprovalQueuedBanner`.

**Test file 2** (absence, new): `tests/frontend/unit/src/components/kri-form/no-kri-banner-duplicate.test.ts`:

```typescript
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("S6.4: KriApprovalQueuedBanner deletion", () => {
  it("KriApprovalQueuedBanner.tsx file removed", () => {
    const path = resolve(__dirname, "../../../../../frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx");
    expect(existsSync(path)).toBe(false);
  });
});
```

Plus a grep-style assertion (e.g. via `import.meta.glob`) that no `frontend/src/**/*.{ts,tsx}` file imports `KriApprovalQueuedBanner`.

**Expected**: RED. File still exists.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `frontend/src/components/kri-form/KRIFormContainer.tsx:7` — replace `import { KriApprovalQueuedBanner } from './KriApprovalQueuedBanner';` with `import { ApprovalQueuedBanner } from '@/components/forms/ApprovalQueuedBanner';`.
- Same file, lines 158-163 — replace the `<KriApprovalQueuedBanner ... />` block with the prop-driven version. Compute `closeLabel`, `title`, `viewApprovalsLabel`, `message` (with `errorKeys.`-prefix routing) inside the container, mirroring `RiskFormContainer.tsx:111-119`.

**Files to delete**:
- `frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx`.

**Files to create**: the two new tests above.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run test:run -- ../tests/frontend/unit/src/components/kri-form ../tests/frontend/unit/src/components/forms
```

All pass.

#### Lock/TOML/Contract updates (same commit)

- None (backend-side untouched).
- Frontend invariant test home `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts` is unaffected.

#### README / doc updates (same commit)

- `frontend/src/components/forms/README.md` — if it enumerates banner siblings, note KRI form uses the canonical component.
- `frontend/src/components/kri-form/README.md` — remove any reference to `KriApprovalQueuedBanner`.

#### Verification commands (run all in order)

1. `cd frontend && npm run test:run -- ../tests/frontend/unit/src/components/kri-form ../tests/frontend/unit/src/components/forms` — must pass.
2. `cd frontend && npx tsc --noEmit` — clean.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled: `refactor(frontend/kri): unify approval queued banner via KRIFormContainer i18n hoist`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` — restores local KRI banner + container import.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: 3h (container rewrite + i18n hoist + 2 tests + verification).
- Risk: LOW — Behavior is i18n-equivalent; one extra wrapper `<div>` and class-order drift disappear on consolidation.
- Mitigations: component test pins data-testid contract; absence test pins file removal.

---

### Item #31 (Section 4) — #36 — Refactor `BusinessRouteGuards.tsx` to typed factory

**Wave**: 4  | **Slot**: v2 Seq 34  | **Effort**: S (~2h)  | **Priority**: P2  | **Domain**: frontend

**Dependencies**: none. Can run in parallel with #35.
**Atomic with**: none
**Validator?**: no

#### Why this work

`frontend/src/authz/BusinessRouteGuards.tsx:18-36` carries 4 identical guards (`GovernanceRouteGuard`, `ActivityLogRouteGuard`, `UsersRouteGuard`, `UserLifecycleRouteGuard`) each wrapping the same `useAuthz` boolean-key check pattern. The recipe replaces the four hand-rolled functions with a typed factory `createBusinessRouteGuard<K extends BoolKeys>(key: K)`. Loop B confirmed all 4 capability keys are boolean fields on `Authz` (`policy.ts:13-39`). Audit ID = #36 (S7.4); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 34 (`plan-loop-3-07-integration-v2.md:377`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `frontend/src/authz/BusinessRouteGuards.tsx:18-36`, `frontend/src/authz/policy.ts:13-39`, existing `tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.test.tsx`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file 1** (factory contract, new): `tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.factory.test.tsx`. For each `(name, key)` in `[(GovernanceRouteGuard, canViewGovernance), (ActivityLogRouteGuard, canViewActivityLog), (UsersRouteGuard, canViewUsersRoute), (UserLifecycleRouteGuard, isPlatformAdmin)]`: render with stubbed `useAuthz()` returning `{ [key]: true }` / `{ [key]: false }` and assert children rendered / `<Navigate to="/" replace />` rendered.

```ts
import { createBusinessRouteGuard } from '@/authz/BusinessRouteGuards';
// (the import resolves only after refactor lands)
```

**Test file 2** (structural, new): `tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.structural.test.ts`. Read `frontend/src/authz/BusinessRouteGuards.tsx` source via `fs.readFileSync`. Assert:
- Exactly 1 `function createBusinessRouteGuard<` declaration.
- `(source.match(/function\s+\w+RouteGuard\s*\(/g) ?? []).length === 0` (no hand-rolled function declarations besides the factory).
- 4 `export const` named guards bound to `createBusinessRouteGuard(...)` calls.

**Test file 3**: existing `tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.test.tsx` continues to pass — pin route semantics during the refactor.

**Expected**: RED on Tests 1 + 2.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `frontend/src/authz/BusinessRouteGuards.tsx`:
  ```ts
  import type { ReactNode } from 'react';
  import { Navigate } from 'react-router-dom';
  import { useAuthz } from '@/authz/useAuthz';
  import type { Authz } from '@/authz/policy';

  type GuardProps = { children: ReactNode };
  type BoolKeys = { [K in keyof Authz]: Authz[K] extends boolean ? K : never }[keyof Authz];

  export function createBusinessRouteGuard<K extends BoolKeys>(key: K) {
      return function BusinessRouteGuard({ children }: GuardProps) {
          const authz = useAuthz();
          if (!authz[key]) return <Navigate to="/" replace />;
          return <>{children}</>;
      };
  }

  export const GovernanceRouteGuard = createBusinessRouteGuard('canViewGovernance');
  export const ActivityLogRouteGuard = createBusinessRouteGuard('canViewActivityLog');
  export const UsersRouteGuard = createBusinessRouteGuard('canViewUsersRoute');
  export const UserLifecycleRouteGuard = createBusinessRouteGuard('isPlatformAdmin');
  ```

No changes to consumers (routing files import the same names).

**Files to create**: the two new test files above.

**Files to delete**: none.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run test:run -- ../tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.factory.test.tsx ../tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.structural.test.ts ../tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.test.tsx
```

All pass.

#### Lock/TOML/Contract updates (same commit)

- None. `useAuthz.invariant.test.ts:46-48` enumerates `authz.can(action, resource)` capability tuples — unrelated to top-level boolean keys.

#### README / doc updates (same commit)

- `frontend/src/authz/README.md` — describe the factory contract and the `BoolKeys` type.

#### Verification commands (run all in order)

1. `cd frontend && npm run test:run -- ../tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.factory.test.tsx` — must pass.
2. `cd frontend && npm run test:run -- ../tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.structural.test.ts` — must pass.
3. `cd frontend && npm run test:run -- ../tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.test.tsx` — must pass.
4. `cd frontend && npx tsc --noEmit` — clean.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled: `refactor(frontend/authz): replace 4 BusinessRouteGuards with typed factory`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` — restores 4 explicit guards.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 2h (factory + 2 new tests + README + verification).
- Risk: LOW — `BoolKeys` type is the only new concept; no other callers depend on it.
- Mitigations: existing route-semantics test pinned during refactor; structural test pins single-factory invariant.

---

### Item #32 (Section 4) — #35 — Delete `usePermissions` hook

**Wave**: 4  | **Slot**: v2 Seq 33  | **Effort**: S (~3h)  | **Priority**: P2  | **Domain**: frontend

**Dependencies**: none structural. Should land BEFORE #66 (AuthContext split, Wave 6b) to avoid double-rewriting the 18 mock files.
**Atomic with**: none — soft pair-with #66 (per `final-section-2-sequence.md:380` mock-file double-rewrite avoidance)
**Validator?**: no

#### Why this work

`frontend/src/hooks/usePermissions.ts` is a pure passthrough to `useAuth().hasPermission` plus 8 `useAuthz()` accessors. Loop B confirmed only `hasPermission` is consumed in production (`Sidebar.tsx:25`); all 18 test sites are `vi.mock('@/hooks/usePermissions', ...)` calls. Audit ID = #35 (S7.3); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 33 (`plan-loop-3-07-integration-v2.md:376`).
- [ ] Confirm prerequisites: none. Verify #66 has NOT yet landed (else #35 lands second cycle, the mock files are rewritten twice).
- [ ] Read latest state of `frontend/src/hooks/usePermissions.ts:4-20`, `frontend/src/components/layout/Sidebar.tsx:12,25`, the 18 test mock sites listed below.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file 1** (structural, new): `tests/frontend/unit/src/hooks/__tests__/usePermissions.deleted.structural.test.ts`. Three assertions:
- `expect(fs.existsSync(usePermissionsPath)).toBe(false);`
- Walk `frontend/src/**/*.{ts,tsx}` via `fast-glob` (already in dev deps); assert no file source contains `from '@/hooks/usePermissions'`.
- Walk `tests/frontend/**/*.{ts,tsx}` similarly; assert zero matches.

**Test file 2** (Sidebar regression, new): `tests/frontend/unit/src/components/layout/__tests__/Sidebar.usePermissions.replaced.test.tsx`. Render `<Sidebar />` inside `MemoryRouter` + `QueryClientProvider`; mock `@/contexts/AuthContext` with `vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: stubUser, hasPermission: vi.fn().mockReturnValue(true), logout: vi.fn(), logoutPending: false, logoutErrorKey: null }) }));` and `vi.mock('@/authz/useAuthz', () => ({ useAuthz: () => stubAuthz }));`. Assert sidebar links toggle on permission.

**Expected**: RED on both. File exists; 1 prod import (Sidebar) + 18 test imports.

#### TDD Step 2 — Implement Change

**Files to delete**:
- `frontend/src/hooks/usePermissions.ts`.

**Files to edit**:
- `frontend/src/components/layout/Sidebar.tsx` — remove line 12 (`import { usePermissions } from '@/hooks/usePermissions';`); replace line 25 with destructure from existing `useAuth()` line 24: `const { user, logout, logoutPending, logoutErrorKey, hasPermission } = useAuth();`.
- The 18 test mock files (per Loop B verified):
  - `tests/frontend/unit/src/components/layout/__tests__/SidebarPolling.test.tsx`
  - `tests/frontend/unit/src/components/kri/KRIValueModal.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/VendorDetailPage.issue-entry.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/IssuesPage.url-params.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/RiskDetailPage.issue-entry.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/IssuesPage.grouped-views.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/UserNewPage.sso.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/VendorsPage.grouped-views.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/IssueDetailPage.tabs.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/DashboardPage.overview.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/IssuesPage.table-navigation.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/IssueNewPage.cancel.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/IssuesPage.naming.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/KRIDetailPage.edit-approval.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/IssueNewPage.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/IssuesPage.layout-parity.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/ControlDetailPage.issue-entry.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/KRIDetailPage.issue-entry.test.tsx`

  Pattern (each file currently has `vi.mock('@/hooks/usePermissions', ...)`):
  ```ts
  // BEFORE:
  vi.mock('@/hooks/usePermissions', () => ({
      usePermissions: () => ({ hasPermission: (r, a) => /*...*/, canViewUsers: /*...*/ }),
  }));

  // AFTER:
  vi.mock('@/contexts/AuthContext', async (orig) => ({
      ...(await orig() as object),
      useAuth: () => ({ user: stubUser, hasPermission: (r, a) => /*...*/ }),
  }));
  ```
  For files that consumed `canViewUsers`/`canManageAccess`/etc., add a parallel `vi.mock('@/authz/useAuthz', ...)`.

**Files to create**: the two new test files above.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run test:run -- ../tests/frontend/unit/src/hooks/__tests__/usePermissions.deleted.structural.test.ts ../tests/frontend/unit/src/components/layout/__tests__/Sidebar.usePermissions.replaced.test.tsx ../tests/frontend/unit/src/components/layout/__tests__/SidebarPolling.test.tsx
cd frontend && npm run test:run
```

Full FE unit suite green; 18 mock-rewrites pass.

#### Lock/TOML/Contract updates (same commit)

- `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts` — verify no entry references `usePermissions` (none expected).
- `_naming_allowlist.toml` — drop `usePermissions` if currently listed (most likely not; hook lives in `frontend/src/hooks/`).

#### README / doc updates (same commit)

- `frontend/src/hooks/README.md` — remove the entry for `usePermissions`.
- `.planning/audits/_context/03-frontend-architecture.md` — note the hook is gone.

#### Verification commands (run all in order)

1. `cd frontend && npm run test:run -- ../tests/frontend/unit/src/hooks/__tests__/usePermissions.deleted.structural.test.ts` — must pass.
2. `cd frontend && npm run test:run -- ../tests/frontend/unit/src/components/layout/__tests__/Sidebar.usePermissions.replaced.test.tsx` — must pass.
3. `cd frontend && npm run test:run -- ../tests/frontend/unit/src/components/layout/__tests__/SidebarPolling.test.tsx` — regression green.
4. `cd frontend && npm run test:run` — full FE unit suite, all 18 mock-rewrites pass.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled: `refactor(frontend): remove usePermissions passthrough, route Sidebar via useAuth`.

#### Rollback

- Class: **CROSS-DOMAIN** (18 test files).
- Procedure:
  1. `git revert <SHA>` — restores the 20-line hook + 18 mock files.
- Risk vector: mismatched mock shapes across the 18 rewrites — keep new mocks minimal (only the keys each test consumes) so revert is mechanical.
- Estimated revert time: 30 min.

#### Effort & Risk

- Estimated time: 3h (delete + Sidebar destructure + 18 mock rewrites + 2 new tests + verification).
- Risk: MEDIUM — 18-file change radius; mismatched mock shapes can cascade.
- Mitigations: structural test pins file absence; per-file mock rewrites are mechanical; #35 lands before #66 to avoid double-rewrite.

---

### Item #33 (Section 4) — #48 — Merge `getErrorMessageKey.ts` + `errorCodeMap.ts`

**Wave**: 4  | **Slot**: v2 Seq 35  | **Effort**: S (~1.5h)  | **Priority**: P2  | **Domain**: frontend

**Dependencies**: none
**Atomic with**: none
**Validator?**: no

#### Why this work

Two i18n files split across `frontend/src/i18n/getErrorMessageKey.ts:1-19` (function importing the map) and `frontend/src/i18n/errorCodeMap.ts:1-14` (the `ERROR_CODE_TO_KEY` const). The recipe merges them into a single `frontend/src/i18n/errorMessageKey.ts` (camelCase to keep neighborhood convention). No re-export shim — both legacy paths have grep-known importers that migrate atomically. Audit ID = #48 (FE-N6); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 35 (`plan-loop-3-07-integration-v2.md:378`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `frontend/src/i18n/getErrorMessageKey.ts:1-19`, `frontend/src/i18n/errorCodeMap.ts:1-14`.
- [ ] Pre-flight grep: `rg "from '@/i18n/getErrorMessageKey'" frontend/ tests/frontend/` and `rg "from '@/i18n/errorCodeMap'" frontend/ tests/frontend/` — record exact importer set.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file 1** (combined behavior, new): `tests/frontend/unit/src/i18n/errorMessageKey.test.ts` — pure-function unit tests for `getErrorMessageKey` and `ERROR_CODE_TO_KEY`.

```ts
import { describe, it, expect } from 'vitest';
import { ERROR_CODE_TO_KEY, getErrorMessageKey } from '@/i18n/errorMessageKey';

describe('getErrorMessageKey', () => {
    it('maps known codes via the table', () => {
        expect(getErrorMessageKey('UNAUTHORIZED')).toBe('errorKeys.unauthorized');
        expect(getErrorMessageKey('validation_error')).toBe('errorKeys.validation');
    });
    it('falls back to status-based mapping when no code matches', () => {
        expect(getErrorMessageKey(undefined, 401)).toBe('errorKeys.unauthorized');
        expect(getErrorMessageKey('UNKNOWN_X', 500)).toBe('errorKeys.server');
    });
    it('returns errorKeys.unknown when nothing matches', () => {
        expect(getErrorMessageKey()).toBe('errorKeys.unknown');
    });
});

describe('ERROR_CODE_TO_KEY', () => {
    it('has 10 entries covering all UiErrorCode variants', () => {
        expect(Object.keys(ERROR_CODE_TO_KEY)).toHaveLength(10);
    });
});
```

**Test file 2** (absence, new): `tests/frontend/unit/src/i18n/errorMessageKey.absence.test.ts` — asserts the two old files are gone.

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const I18N = path.resolve(__dirname, '../../../../../frontend/src/i18n');

describe('legacy split error files are deleted', () => {
    it('getErrorMessageKey.ts is gone', () => {
        expect(fs.existsSync(path.join(I18N, 'getErrorMessageKey.ts'))).toBe(false);
    });
    it('errorCodeMap.ts is gone', () => {
        expect(fs.existsSync(path.join(I18N, 'errorCodeMap.ts'))).toBe(false);
    });
});
```

**Expected**: RED on absence test.

#### TDD Step 2 — Implement Change

**Files to create**:
- `frontend/src/i18n/errorMessageKey.ts` — combined module:
  ```ts
  import type { ErrorMessageKey, UiErrorCode } from '@/types/i18n';

  export const ERROR_CODE_TO_KEY: Record<UiErrorCode, ErrorMessageKey> = {
      UNAUTHORIZED: 'errorKeys.unauthorized',
      FORBIDDEN: 'errorKeys.forbidden',
      NOT_FOUND: 'errorKeys.not_found',
      VALIDATION_ERROR: 'errorKeys.validation',
      NETWORK_ERROR: 'errorKeys.network',
      REQUEST_TIMEOUT: 'errorKeys.request_timeout',
      SERVER_ERROR: 'errorKeys.server',
      REQUEST_FAILED: 'errorKeys.request_failed',
      DEMO_LOGIN_FAILED: 'errorKeys.demo_login_failed',
      UNKNOWN_ERROR: 'errorKeys.unknown',
  };

  export function getErrorMessageKey(code?: string | null, status?: number): ErrorMessageKey {
      if (code) {
          const normalized = code.toUpperCase() as UiErrorCode;
          if (normalized in ERROR_CODE_TO_KEY) return ERROR_CODE_TO_KEY[normalized];
      }
      if (status === 401) return 'errorKeys.unauthorized';
      if (status === 403) return 'errorKeys.forbidden';
      if (status === 404) return 'errorKeys.not_found';
      if (status === 422) return 'errorKeys.validation';
      if (status && status >= 500) return 'errorKeys.server';
      return 'errorKeys.unknown';
  }
  ```

**Files to edit**: every importer of either path (collected via pre-flight grep). Migration:
```diff
- import { getErrorMessageKey } from '@/i18n/getErrorMessageKey';
+ import { getErrorMessageKey } from '@/i18n/errorMessageKey';
```
```diff
- import { ERROR_CODE_TO_KEY } from '@/i18n/errorCodeMap';
+ import { ERROR_CODE_TO_KEY } from '@/i18n/errorMessageKey';
```

**Files to delete**:
- `frontend/src/i18n/getErrorMessageKey.ts`.
- `frontend/src/i18n/errorCodeMap.ts`.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run test:run -- errorMessageKey
cd frontend && npm run lint && npx tsc --noEmit
```

All pass.

#### Lock/TOML/Contract updates (same commit)

- None.

#### README / doc updates (same commit)

- Integration log notes "i18n error mapping consolidated to `@/i18n/errorMessageKey`."

#### Verification commands (run all in order)

1. `cd frontend && npm run lint && npx tsc --noEmit` — clean.
2. `cd frontend && npm run test:run -- errorMessageKey` — must pass.
3. `cd frontend && npm run test:run` — full vitest green.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit (atomic) titled: `chore(i18n): merge getErrorMessageKey + errorCodeMap into errorMessageKey`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` — restores both legacy files and importer paths.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 1.5h (combined module + importer migration + 2 tests).
- Risk: LOW — mechanical import rewrite; pure-function bodies are equivalent.
- Mitigations: behavior test pins map size and status fallbacks; absence test pins file deletion.

---

### Item #34 (Section 4) — #64 — Extract QueryClient defaults from `App.tsx`

**Wave**: 4  | **Slot**: v2 Seq 36  | **Effort**: S (~1h)  | **Priority**: P2  | **Domain**: frontend

**Dependencies**: none
**Atomic with**: none — lightly related to #46 (both centralize React Query infra), but **independent**
**Validator?**: no

#### Why this work

`frontend/src/App.tsx:11-18` carries an inline `new QueryClient({ defaultOptions: { queries: { staleTime: 1000 * 60, retry: 1 } } })`. The recipe extracts to `frontend/src/lib/queryClient.ts` with `APP_QUERY_CLIENT_DEFAULTS` const + `createAppQueryClient()` factory. Audit ID = #64 (FE-N2); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 36 (`plan-loop-3-07-integration-v2.md:379`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `frontend/src/App.tsx:3,11-18`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/frontend/unit/src/lib/queryClient.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { APP_QUERY_CLIENT_DEFAULTS, createAppQueryClient } from '@/lib/queryClient';

describe('app QueryClient defaults', () => {
    it('exposes a 60s staleTime and retry=1', () => {
        const queries = APP_QUERY_CLIENT_DEFAULTS.defaultOptions?.queries;
        expect(queries?.staleTime).toBe(60_000);
        expect(queries?.retry).toBe(1);
    });

    it('createAppQueryClient builds a QueryClient with those defaults', () => {
        const qc = createAppQueryClient();
        const opts = qc.getDefaultOptions();
        expect(opts.queries?.staleTime).toBe(60_000);
        expect(opts.queries?.retry).toBe(1);
    });
});
```

**Expected**: RED — module does not exist yet.

#### TDD Step 2 — Implement Change

**Files to create**:
- `frontend/src/lib/queryClient.ts`:
  ```ts
  import { QueryClient, type QueryClientConfig } from '@tanstack/react-query';

  export const APP_QUERY_CLIENT_DEFAULTS: QueryClientConfig = {
      defaultOptions: {
          queries: {
              staleTime: 1000 * 60, // 1 minute
              retry: 1,
          },
      },
  };

  export function createAppQueryClient(): QueryClient {
      return new QueryClient(APP_QUERY_CLIENT_DEFAULTS);
  }
  ```
- The new test file above.

**Files to edit**:
- `frontend/src/App.tsx`:
  ```diff
  - import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  + import { QueryClientProvider } from '@tanstack/react-query';
  + import { createAppQueryClient } from '@/lib/queryClient';
    ...
  - const queryClient = new QueryClient({
  -   defaultOptions: {
  -     queries: {
  -       staleTime: 1000 * 60, // 1 minute
  -       retry: 1,
  -     },
  -   },
  - });
  + const queryClient = createAppQueryClient();
  ```

**Files to delete**: none.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run test:run -- queryClient
```

Pass.

#### Lock/TOML/Contract updates (same commit)

- None.

#### README / doc updates (same commit)

- None.

#### Verification commands (run all in order)

1. `cd frontend && npm run lint && npx tsc --noEmit` — clean.
2. `cd frontend && npm run test:run -- queryClient` — must pass.
3. `cd frontend && npm run test:run` — spot check that `App` still mounts.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled: `refactor(frontend): extract App QueryClient defaults to lib/queryClient`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` — restores inline `App.tsx:11-18` block.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 1h (factory + 1 unit test + App.tsx edit + verification).
- Risk: LOW — provider tree unchanged; existing `App.tsx` smoke test continues to pass.
- Mitigations: pure-config extract; defaults pinned by 60_000 / retry=1 unit test.

---

### Item #35 (Section 4) — #47 — Extract session-refresh retry policy

**Wave**: 4  | **Slot**: v2 Seq 37  | **Effort**: S (~3h)  | **Priority**: P3  | **Domain**: frontend

**Dependencies**: none — independent
**Atomic with**: none. Hub-wave soft prereq for #71 (services/session merge).
**Validator?**: no

#### Why this work

`frontend/src/services/api/ApiClientCore.ts:25-72` carries the silent-session-refresh decision plus inline 401 retry/refresh/clear logic. Phase 4 verified target lines: 25-30 hold `shouldAttemptSilentSessionRefresh`; 61-73 hold the inline 401 retry/refresh/clear block inside `executeRequest`. The recipe extracts a pure-policy module deciding: (a) whether to attempt a silent refresh given `(pathname, attempt, isExplicitLogoutSuppressed)`, (b) compose the retry — accept a `refreshFn` and `clearSessionFn`, return either "refreshed, retry now" or "give up, throw 401". Audit ID = #47 (FE-N4); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 37 (`plan-loop-3-07-integration-v2.md:380`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `frontend/src/services/api/ApiClientCore.ts:25-30,61-73`.
- [ ] Verify existing `tests/frontend/unit/src/services/api/__tests__/` integration tests.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/frontend/unit/src/services/api/sessionRefreshPolicy.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import {
    shouldAttemptSilentSessionRefresh,
    applySessionRefreshPolicy,
} from '@/services/api/sessionRefreshPolicy';
import { ApiClientError } from '@/services/api/apiErrors';

vi.mock('@/services/session/logoutSuppression', () => ({
    isExplicitLogoutSuppressed: vi.fn(() => false),
}));

describe('shouldAttemptSilentSessionRefresh', () => {
    it('returns false when attempt > 0', () => {
        expect(shouldAttemptSilentSessionRefresh({ pathname: '/api/v1/risks', attempt: 1 })).toBe(false);
    });
    it('returns false for /api/v1/auth/* paths', () => {
        expect(shouldAttemptSilentSessionRefresh({ pathname: '/api/v1/auth/login', attempt: 0 })).toBe(false);
    });
    it('returns true on first attempt for non-auth paths', () => {
        expect(shouldAttemptSilentSessionRefresh({ pathname: '/api/v1/risks', attempt: 0 })).toBe(true);
    });
});

describe('applySessionRefreshPolicy', () => {
    it('returns retry when refresh succeeds', async () => {
        const out = await applySessionRefreshPolicy(
            { pathname: '/api/v1/risks', attempt: 0 },
            { tryRefresh: async () => 'new-token', clearSession: () => {} },
        );
        expect(out).toEqual({ kind: 'retry' });
    });

    it('clears session and throws 401 when refresh fails', async () => {
        const clear = vi.fn();
        await expect(applySessionRefreshPolicy(
            { pathname: '/api/v1/risks', attempt: 0 },
            { tryRefresh: async () => null, clearSession: clear },
        )).rejects.toBeInstanceOf(ApiClientError);
        expect(clear).toHaveBeenCalledOnce();
    });

    it('skips refresh and clears immediately when policy says no', async () => {
        const tryRefresh = vi.fn();
        const clear = vi.fn();
        await expect(applySessionRefreshPolicy(
            { pathname: '/api/v1/auth/login', attempt: 0 },
            { tryRefresh, clearSession: clear },
        )).rejects.toBeInstanceOf(ApiClientError);
        expect(tryRefresh).not.toHaveBeenCalled();
        expect(clear).toHaveBeenCalledOnce();
    });
});
```

**Expected**: RED — module does not exist.

#### TDD Step 2 — Implement Change

**Files to create**:
- `frontend/src/services/api/sessionRefreshPolicy.ts`:
  ```ts
  import { isExplicitLogoutSuppressed } from '@/services/session/logoutSuppression';
  import { clearAuthenticatedSession } from '@/services/session/manager';
  import { trySilentSessionRefresh } from '@/services/session/sso';
  import { ApiClientError } from './apiErrors';
  import { getErrorMessageKey } from '@/i18n/getErrorMessageKey';

  export interface SessionRefreshContext { pathname: string; attempt: number }

  export function shouldAttemptSilentSessionRefresh({ pathname, attempt }: SessionRefreshContext): boolean {
      if (isExplicitLogoutSuppressed()) return false;
      if (attempt > 0) return false;
      if (pathname.startsWith('/api/v1/auth/')) return false;
      return true;
  }

  export type RefreshOutcome =
      | { kind: 'retry' }
      | { kind: 'unauthorized' };

  export async function applySessionRefreshPolicy(
      ctx: SessionRefreshContext,
      deps: {
          tryRefresh?: () => Promise<string | null | undefined>;
          clearSession?: () => void;
      } = {},
  ): Promise<RefreshOutcome> {
      const tryRefresh = deps.tryRefresh ?? trySilentSessionRefresh;
      const clearSession = deps.clearSession ?? (() => clearAuthenticatedSession({ clearBootstrap: true }));

      if (shouldAttemptSilentSessionRefresh(ctx)) {
          const refreshed = await tryRefresh();
          if (refreshed) return { kind: 'retry' };
      }
      clearSession();
      throw new ApiClientError({
          status: 401,
          code: 'UNAUTHORIZED',
          messageKey: getErrorMessageKey('UNAUTHORIZED', 401),
          rawMessage: 'Unauthorized',
      });
  }
  ```
- The new test file above.

**Files to edit**:
- `frontend/src/services/api/ApiClientCore.ts:25-72` — `executeRequest` collapses to:
  ```diff
    if (response.status === 401) {
  -     if (this.shouldAttemptSilentSessionRefresh(prepared.pathname, attempt)) {
  -         const refreshedToken = await trySilentSessionRefresh();
  -         if (refreshedToken) {
  -             return this.executeRequest({
  -                 endpoint, options, attempt: attempt + 1, parseSuccess, parseError,
  -             });
  -         }
  -     }
  -     clearAuthenticatedSession({ clearBootstrap: true });
  -     throw new ApiClientError({ ... });
  +     const outcome = await applySessionRefreshPolicy(
  +         { pathname: prepared.pathname, attempt },
  +     );
  +     if (outcome.kind === 'retry') {
  +         return this.executeRequest({
  +             endpoint, options, attempt: attempt + 1, parseSuccess, parseError,
  +         });
  +     }
    }
  ```
- Delete the now-unused private `shouldAttemptSilentSessionRefresh` method on `ApiClient`; remove the now-redundant imports (`trySilentSessionRefresh`, `clearAuthenticatedSession`, `isExplicitLogoutSuppressed`).

**Files to delete**: none.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run test:run -- sessionRefreshPolicy
cd frontend && npm run test:run -- ApiClientCore
```

Both pass.

#### Lock/TOML/Contract updates (same commit)

- None.

#### README / doc updates (same commit)

- None (independent).

#### Verification commands (run all in order)

1. `cd frontend && npm run lint && npx tsc --noEmit` — clean.
2. `cd frontend && npm run test:run -- sessionRefreshPolicy` — must pass.
3. `cd frontend && npm run test:run -- ApiClientCore` — must pass.
4. Verify `ApiClientCore.ts` shrinks by ≥30 lines.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled: `refactor(api-client): extract session-refresh policy module`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` — restores inline `executeRequest` block.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: 3h (policy module + tests + ApiClientCore rewrite + verification).
- Risk: LOW — pure functions with injected deps; `getBlob` inherits the policy automatically through `executeRequest`.
- Mitigations: per-branch unit tests cover refresh-success, refresh-fail, and policy-says-no paths; existing integration tests pin behavior.

---

### Item #36 (Section 4) — #22 — Delete `ControlForm.tsx` 1-line shim

**Wave**: 4  | **Slot**: v2 Seq 38  | **Effort**: S (~1h)  | **Priority**: P2  | **Domain**: frontend

**Dependencies**: none. Strict prerequisite for #23.
**Atomic with**: none — but #22 must complete before #23 (same `control-form/` tree)
**Validator?**: no

#### Why this work

`frontend/src/components/ControlForm.tsx` is a 1-line shim: `export { ControlForm } from './control-form/ControlFormContainer';`. **Phase 4 correction**: 3 prod importers verified — `frontend/src/pages/ControlEditPage.tsx:6`, `frontend/src/pages/ControlNewPage.tsx:6`, `frontend/src/components/ControlCreateDialog.tsx:5`. **Phase 6 correction**: 4 test importers verified, including `tests/frontend/unit/src/__tests__/approval_ui_rendering.spec.tsx:14`. Audit ID = #22 (S2.8); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 38 (`plan-loop-3-07-integration-v2.md:381`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `frontend/src/components/ControlForm.tsx`, the 3 production importers, and the 4 test importers (including `tests/frontend/unit/src/__tests__/approval_ui_rendering.spec.tsx:14`).
- [ ] Run `rg "from '@/components/ControlForm'|from './ControlForm'" frontend/ tests/frontend/` — verify import set.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/frontend/unit/src/components/ControlForm.shim-absence.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('ControlForm.tsx 1-line shim is deleted', () => {
    it('shim file does not exist', () => {
        const shim = path.resolve(__dirname, '../../../../../frontend/src/components/ControlForm.tsx');
        expect(fs.existsSync(shim)).toBe(false);
    });

    it('canonical ControlFormContainer exports ControlForm', async () => {
        const mod = await import('@/components/control-form/ControlFormContainer');
        expect(typeof mod.ControlForm).toBe('function');
    });
});
```

**Expected**: RED on first assertion. The typecheck gate (`tsc --noEmit`) implicitly enforces that all 3 prod importers + 4 test importers still type-check post-migration.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `frontend/src/pages/ControlEditPage.tsx:6`:
  ```diff
  - import { ControlForm } from '@/components/ControlForm';
  + import { ControlForm } from '@/components/control-form/ControlFormContainer';
  ```
- `frontend/src/pages/ControlNewPage.tsx:6` — same diff.
- `frontend/src/components/ControlCreateDialog.tsx:5`:
  ```diff
  - import { ControlForm } from './ControlForm';
  + import { ControlForm } from './control-form/ControlFormContainer';
  ```
- The 4 test importers, including **`tests/frontend/unit/src/__tests__/approval_ui_rendering.spec.tsx:14`** (Phase 6 correction). Each migrates to the canonical container path.

**Files to delete**:
- `frontend/src/components/ControlForm.tsx`.

**Files to create**: the new test above.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npx tsc --noEmit
cd frontend && npm run test:run -- ControlForm
```

Both pass.

#### Lock/TOML/Contract updates (same commit)

- None. The deleted file is not a public component documented in any registry.

#### README / doc updates (same commit)

- Integration log: "ControlForm shim removed; canonical = `@/components/control-form/ControlFormContainer`."

#### Verification commands (run all in order)

1. `cd frontend && npm run lint` — clean.
2. `cd frontend && npx tsc --noEmit` — clean.
3. `cd frontend && npm run test:run -- ControlForm` — must pass.
4. `rg "from '@/components/ControlForm'" frontend/ tests/frontend/` — 0 matches.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit (atomic — 3 importer edits + 4 test edits + shim delete) titled: `chore(control-form): delete ControlForm 1-line shim`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` — restores 1-line shim and 7 importer edits.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 1h (3 prod importer rewrites + 4 test importer rewrites + shim delete + 1 absence test).
- Risk: LOW — typecheck catches any missed importer; Phase 6 caught the 4th test importer at `approval_ui_rendering.spec.tsx:14`.
- Mitigations: typecheck gate + absence test + integration log entry.

---

### Item #37 (Section 4) — #23 — Inline `controlFormUtils` helpers

**Wave**: 4  | **Slot**: v2 Seq 39  | **Effort**: S (~2h)  | **Priority**: P2  | **Domain**: frontend

**Dependencies**: **#22 (Seq 38)** — strict order; both touch `control-form/` tree.
**Atomic with**: none
**Validator?**: no

#### Why this work

`frontend/src/components/control-form/controlFormUtils.ts` is 12 lines with 2 exports — `formatFrequencyLabel`, `getControlFormErrorKey`. Verified consumers (3 references):
- `frontend/src/components/control-form/ControlFormExecutionStep.tsx:5` imports `formatFrequencyLabel`.
- `frontend/src/components/control-form/useControlFormLookups.ts:9` imports `getControlFormErrorKey` (used at `:31, :44`).
- `frontend/src/components/control-form/useControlFormWorkflow.ts:14` imports `getControlFormErrorKey` (used at `:129`).

The recipe inlines each helper at the consumer top-of-file. Phase 4 explicitly authorized inlining despite duplication. Audit ID = #23 (S2.9); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 39 (`plan-loop-3-07-integration-v2.md:382`).
- [ ] Confirm prerequisites complete: #22 lock GREEN (ControlForm shim deleted).
- [ ] Read latest state of `frontend/src/components/control-form/controlFormUtils.ts`, the 3 consumer files.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file 1** (absence, new): `tests/frontend/unit/src/components/control-form/controlFormUtils.absence.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('controlFormUtils.ts is inlined into consumers', () => {
    it('does not exist on disk', () => {
        const target = path.resolve(
            __dirname,
            '../../../../../../frontend/src/components/control-form/controlFormUtils.ts',
        );
        expect(fs.existsSync(target)).toBe(false);
    });
});
```

**Test file 2** (inlined-helper behavior pin, new): `tests/frontend/unit/src/components/control-form/inlined-helpers.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { ApiClientError } from '@/services/apiClient';

describe('inlined formatFrequencyLabel (in ControlFormExecutionStep)', () => {
    it('replaces underscores and title-cases', async () => {
        const mod = await import('@/components/control-form/ControlFormExecutionStep');
        expect(mod).toBeDefined();
    });
});

describe('inlined getControlFormErrorKey (in useControlFormWorkflow & useControlFormLookups)', () => {
    it('returns ApiClientError messageKey when present', () => {
        const err = new ApiClientError({
            status: 422,
            code: 'VALIDATION_ERROR',
            messageKey: 'errorKeys.validation',
            rawMessage: '...',
        });
        // Behavior verified through hook-level tests at
        // tests/frontend/unit/src/components/control-form/__tests__/useControlFormWorkflow.test.tsx
    });
});
```

**Expected**: RED on absence test.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `frontend/src/components/control-form/ControlFormExecutionStep.tsx`:
  ```diff
  - import { formatFrequencyLabel } from './controlFormUtils';
  + // Inlined from former controlFormUtils.ts (deleted in #23).
  + const formatFrequencyLabel = (value: string): string =>
  +     value.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  ```
- `frontend/src/components/control-form/useControlFormLookups.ts`:
  ```diff
  - import { getControlFormErrorKey } from './controlFormUtils';
  + import { ApiClientError } from '@/services/apiClient';
  + // Inlined from former controlFormUtils.ts (deleted in #23).
  + const getControlFormErrorKey = (error: unknown, fallback = 'errorKeys.unknown'): string => {
  +     if (error instanceof ApiClientError) return error.messageKey;
  +     return fallback;
  + };
  ```
  (Skip the `ApiClientError` import line if already present.)
- `frontend/src/components/control-form/useControlFormWorkflow.ts` — same diff as `useControlFormLookups.ts`.

**Files to delete**:
- `frontend/src/components/control-form/controlFormUtils.ts`.

**Files to create**: the two new tests above.

> **Refactor note**: the duplication of `getControlFormErrorKey` across `useControlFormLookups.ts` and `useControlFormWorkflow.ts` is intentional — Phase 4 explicit authorization. The helper is too small to warrant a shared module.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run test:run -- control-form
```

Pass.

#### Lock/TOML/Contract updates (same commit)

- None.

#### README / doc updates (same commit)

- Integration log: "controlFormUtils inlined; helpers live at consumer top-of-file."

#### Verification commands (run all in order)

1. `cd frontend && npm run lint` — clean.
2. `cd frontend && npx tsc --noEmit` — clean.
3. `cd frontend && npm run test:run -- control-form` — must pass.
4. Existing hook-level test at `tests/frontend/unit/src/components/control-form/__tests__/useControlFormWorkflow.test.tsx` (if present — verify before commit) must continue to pass.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit (atomic — 3 import edits + helper inlines + file delete) titled: `chore(control-form): inline controlFormUtils helpers; delete utility module`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` — restores file and 3 import edits.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: 2h (3 inlines + delete + 2 tests + verification).
- Risk: LOW — pure-function helpers; consumer count verified.
- Mitigations: typecheck catches missed inlines; hook-level tests cover behavior; #22 lands first to settle the canonical import path.

---

### Item #38 (Section 4) — #55 — Delete `access_user_service.py` facade

**Wave**: 4  | **Slot**: v2 Seq 40  | **Effort**: S (1-2h)  | **Priority**: P2  | **Domain**: crosscut

**Dependencies**: none. First commit in the doc-contract validator-reentry cluster (Wave 4 Seq 40-45 per `final-section-2-sequence.md:201-208`).
**Atomic with**: none — soft sequence-only cluster #55 → #24+#51 → #56+#61 (validator runs after each commit; partial-removal states are valid intermediate states per Correction C).
**Validator?**: **yes** — `python3 scripts/security/validate_authz_capability_contract.py` MUST exit 0 after stripping path entry from validator test.

#### Why this work

`backend/app/services/access_user_service.py` is a 26-line name-only wrapper with single inlined call site at `backend/app/api/v1/endpoints/access.py:19`. Wrapper signature is identical to canonical `update_access_profile` per `access_user_service.py:18-24`. ADR-007 §Decision context #2 names `_identity_access_lifecycle` as the canonical write-side context for access profile mutation; the facade was redundant. Audit ID = #55 (S7.5); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 40 (`plan-loop-3-07-integration-v2.md:383`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `backend/app/services/access_user_service.py:10-24`, `backend/app/api/v1/endpoints/access.py:19`, `tests/backend/pytest/test_authz_capability_contract_validator.py:502`, `tests/backend/pytest/test_architecture_deepening_contracts.py:246`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/architecture/test_w13_access_user_service_facade_removed_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
from __future__ import annotations
import ast
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
FACADE = REPO_ROOT / "backend/app/services/access_user_service.py"


def test_access_user_service_facade_deleted() -> None:
    assert not FACADE.exists(), (
        "S7.5: access_user_service.py facade must be deleted"
    )


def test_no_production_module_imports_facade() -> None:
    offenders: list[str] = []
    for path in (REPO_ROOT / "backend/app").rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if "from app.services.access_user_service" in text or "import app.services.access_user_service" in text:
            offenders.append(str(path.relative_to(REPO_ROOT)))
    assert offenders == []
```

**Expected**: RED — file still exists; 1 production importer.

#### TDD Step 2 — Implement Change

**Files to delete**:
- `backend/app/services/access_user_service.py` (26 lines).

**Files to edit**:
- `backend/app/api/v1/endpoints/access.py:19` — change `from app.services.access_user_service import update_access_user_settings` to `from app.services._identity_access_lifecycle import update_access_profile as update_access_user_settings`.
- `tests/backend/pytest/test_authz_capability_contract_validator.py:502` — remove the `Path("backend/app/services/access_user_service.py")` entry from the path-list assertion.
- `tests/backend/pytest/test_architecture_deepening_contracts.py:246` — remove the line `from app.services import access_user_service` (or repoint per local import strategy).

**Files to create**: the new lock test above.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_w13_access_user_service_facade_removed_red.py -x
```

Pass.

#### Lock/TOML/Contract updates (same commit)

- New `test_w13_access_user_service_facade_removed_red.py`.
- `tests/backend/pytest/test_authz_capability_contract_validator.py:502` — path entry removed.
- `tests/backend/pytest/test_architecture_deepening_contracts.py:246` — import line removed.
- **Capability contract**: `docs/security/authorization-capability-contract.md` and `.json` — strip any reference to `access_user_service.py` (the validator-reentry runs and must remain green).

#### README / doc updates (same commit)

- `backend/app/services/_identity_access_lifecycle/README.md` — confirm Contents lists `update_access_profile` as the canonical mutation entry (no edit if already accurate).

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_w13_access_user_service_facade_removed_red.py -x` — must pass.
2. `pytest tests/backend/pytest -q -k "access"` — broader access suite green via `client_factory`.
3. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `ruff check backend/app/services backend/app/api/v1/endpoints/access.py` — clean.
6. `mypy backend/app` — clean.

#### Commit boundary

Single commit titled: `S7.5: delete access_user_service facade; access endpoint uses _identity_access_lifecycle`.

#### Rollback

- Class: **CROSS-DOMAIN** (capability contract).
- Procedure:
  1. `git revert <SHA>` — restores 26-line facade + 3 test edits + contract entries.
  2. Re-run validator; must exit 0.
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: 1-2h (delete + rewrite import + 2 lock-test edits + contract validator).
- Risk: LOW — single inlined call site; signature parity verified.
- Mitigations: aliasing at import time (`as update_access_user_settings`) keeps endpoint signature stable; lock test catches re-introduction.

---

### Items #39 + #40 (Section 4) — #24 + #51 — Atomic Cluster A: Delete `kris/linked_vendors.py` barrel and `_kri_history/value_application.py` alias

**Wave**: 4  | **Slots**: v2 Seq 41 + 42  | **Effort**: combined S/M (~3h)  | **Priority**: P2  | **Domain**: kris

**Dependencies**: none. Second cluster in the doc-contract validator-reentry chain (after #55, before #56+#61).
**Atomic with**: **YES — single-commit cluster** (per `plan-loop-2-08-master-sequence.md:283`: *"ATOMIC with #51"*). Both touch the same import line `kris/linked_vendors.py:3` and share 6 doc citations across `docs/security/authorization-capability-contract.{md,json}`.
**Validator?**: **yes** — validator must exit 0 in the same commit.

#### Why this work

Both items must commit contiguously because they share:
- 1 import line: `backend/app/api/v1/endpoints/kris/linked_vendors.py:3` reads `from app.services._kri_history.value_application import visible_linked_vendors`.
- 6 doc citations across `docs/security/authorization-capability-contract.md:116,117,118` and `docs/security/authorization-capability-contract.json:368,388,410`.
- 4 lock-test lines at `tests/backend/pytest/test_architecture_deepening_contracts.py:976-980, 999-1000`.

The 3 remaining production importers of `_kri_history/value_application.py` (`_register_listings/kris.py:31`, `_entity_mutation_lifecycle/direct_apply.py:21`, `kris/linked_vendors.py:3`) must be repointed at `_kri_history.direct_application` in the SAME COMMIT — otherwise either step alone leaves dangling imports.

Audit IDs = #24 (S3.4) + #51 (S3.3); developer verdict = ACCEPT (atomic).

#### Pre-flight checklist

- [ ] Verify slots in master sequence: v2 Seq 41 + 42 (`plan-loop-3-07-integration-v2.md:384-385`).
- [ ] Confirm prerequisites complete: #55 lock GREEN (validator exit 0 between commits).
- [ ] Read latest state of `backend/app/api/v1/endpoints/kris/linked_vendors.py`, `backend/app/services/_kri_history/value_application.py`, `backend/app/services/_register_listings/kris.py:31`, `backend/app/services/_entity_mutation_lifecycle/direct_apply.py:21`.
- [ ] Read `docs/security/authorization-capability-contract.md:116-118,161` and `.json:368,388,389,410,411`.
- [ ] Read lock test lines `tests/backend/pytest/test_architecture_deepening_contracts.py:976-980, 999-1000`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

Append to `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`:

```python
def test_kris_linked_vendors_barrel_is_removed() -> None:
    assert not (REPO_ROOT / "backend/app/api/v1/endpoints/kris/linked_vendors.py").exists()


def test_kri_history_value_application_alias_is_removed() -> None:
    assert not (REPO_ROOT / "backend/app/services/_kri_history/value_application.py").exists()


def test_no_module_imports_value_application() -> None:
    backend_root = REPO_ROOT / "backend"
    offenders: list[str] = []
    for path in backend_root.rglob("*.py"):
        if "_kri_history.value_application" in path.read_text(encoding="utf-8"):
            offenders.append(str(path.relative_to(REPO_ROOT)))
    assert offenders == []
```

**Expected**: RED — both files present; offending imports exist.

#### TDD Step 2 — Implement Change

**Files to delete**:
- `backend/app/api/v1/endpoints/kris/linked_vendors.py` (5 lines).
- `backend/app/services/_kri_history/value_application.py` (8 lines).

**Files to edit**:
- `backend/app/services/_register_listings/kris.py:31` — repoint:
  ```diff
  - from app.services._kri_history.value_application import visible_linked_vendors
  + from app.services._kri_history.direct_application import visible_linked_vendors
  ```
- `backend/app/services/_entity_mutation_lifecycle/direct_apply.py:21` — same diff (the third importer was `kris/linked_vendors.py:3` itself, deleted).
- `tests/backend/pytest/test_architecture_deepening_contracts.py:976-980` — DELETE the line `value_application_path = "backend/app/services/_kri_history/value_application.py"` and the two `_source(value_application_path)` assertions at `:979,980`. Otherwise `_source(...)` raises `FileNotFoundError`.
- `tests/backend/pytest/test_architecture_deepening_contracts.py:999-1000` — drop the dead negative-assertion strings:
  - `"from app.services._kri_history.value_application import _apply_kri_value_directly"`.
  - `"from app.services._kri_history.value_application import ("`.

**Doc updates (must land in this commit)**:
- `docs/security/authorization-capability-contract.md:116` — strip `kris/linked_vendors.py` from the `backend_authority` cell.
- `docs/security/authorization-capability-contract.md:117` — strip both `kris/linked_vendors.py` from `backend_authority` AND `_kri_history/value_application.py` from `service_policy`.
- `docs/security/authorization-capability-contract.md:118` — strip both `kris/linked_vendors.py` AND `_kri_history/value_application.py`.
- `docs/security/authorization-capability-contract.md:161` — strip `value_application.py` from the inventory cell.
- `docs/security/authorization-capability-contract.json:368` — strip `kris/linked_vendors.py` from `backend_authority`.
- `docs/security/authorization-capability-contract.json:388` — strip `kris/linked_vendors.py`.
- `docs/security/authorization-capability-contract.json:389` — strip `_kri_history/value_application.py`.
- `docs/security/authorization-capability-contract.json:410` — strip `kris/linked_vendors.py`.
- `docs/security/authorization-capability-contract.json:411` — strip `_kri_history/value_application.py`.

**Files to create**: the new structural locks above (appended to `test_w4_bc_g_kri_history_boundaries_red.py`).

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py -q -k "linked_vendors or value_application"
python3 scripts/security/validate_authz_capability_contract.py
```

All pass; validator exit 0.

#### Lock/TOML/Contract updates (same commit)

- New structural lock IS the contract.
- 4 lock-test line edits at `:976-980, 999-1000`.
- 9 doc-citation edits across `.md` and `.json`.

#### README / doc updates (same commit)

- All doc-citation edits enumerated above.

#### Verification commands (run all in order)

1. `make -f scripts/Makefile test-architecture-locks` — locks green.
2. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
3. `pytest tests/backend/pytest/test_kri_history_intake_workflow.py tests/backend/pytest/test_kris_value_submission_api.py tests/backend/pytest/test_kris_history_listing_api.py -q` — domain suites green.
4. `rg "kris/linked_vendors|_kri_history.value_application|_kri_history/value_application" backend/ tests/backend/pytest/` — only test entries remain; no production-code hits.
5. `ruff check backend/app/services backend/app/api/v1/endpoints/kris` — clean.
6. `mypy backend/app/services backend/app/api/v1/endpoints/kris` — clean.

#### Commit boundary

**SINGLE atomic commit** titled: `S3.3 + S3.4: delete kris/linked_vendors.py barrel and _kri_history/value_application.py alias (atomic)`.

The commit covers:
- 2 file deletes.
- 2 import repoints.
- 4 lock-test line edits at `:976-980,999-1000`.
- 9 doc-citation edits across `.md` and `.json`.

#### Rollback

- Class: **CROSS-DOMAIN** (capability contract validator).
- Procedure:
  1. `git revert <SHA>` — restores barrel + alias + 6 doc citations + 4 lock lines as one unit.
  2. Re-run validator; exit 0 required.
- Estimated revert time: 20 min.

#### Effort & Risk

- Estimated time: ~3h (2 deletes + 2 repoints + 4 lock-test edits + 9 doc edits + validator + cross-suite verification).
- Risk: MEDIUM — capability contract atomic edit; partial commit leaves either dangling imports or contract drift.
- Mitigations: validator runs in-commit; lock test catches re-introduction; documentation-surface domain coordinates with this recipe (no parallel rewrite on the same MD/JSON cells).

#### Cross-domain handoff

Documentation-surface domain has visibility into the same 6 lines. This recipe absorbs them. Coordinate with docs-domain Phase 5 recipe to ensure no parallel rewrite collides on the same MD/JSON cells.

---

### Items #41 + #42 (Section 4) — #56 + #61 — Atomic Cluster B: Delete `directory_identity_service.py` shim and move `graph_directory_*` modules into `_graph_directory/` package

**Wave**: 4  | **Slots**: v2 Seq 43 + 44  | **Effort**: combined M (~7-9h)  | **Priority**: P3  | **Domain**: crosscut

**Dependencies**: none upstream. Last cluster in Wave 4 doc-contract validator-reentry chain.
**Atomic with**: **YES — paired wave** (per `plan-loop-2-08-master-sequence.md:327`: *"ATOMIC with #61"*). Cross-import dependency between `directory_identity_service.py` and `graph_directory_*` modules.
**Validator?**: **yes** — validator must exit 0 in the same commit (or back-to-back commits if split).

#### Why this work

Two coupled changes:
1. **#56 (S7.6)** — Delete 35-line `backend/app/services/directory_identity_service.py` shim. **Phase 6 correction**: re-exports **13** names (NOT 15). 8 prod importers + 1 script.
2. **#61 (S7.7)** — Move 4 modules `backend/app/services/graph_directory_{auth,errors,service,transport}.py` into `backend/app/services/_graph_directory/` package.

The cross-import is at `graph_directory_service.py:8 from app.services.directory_identity_service import normalize_business_role`. After #61, that file becomes `_graph_directory/service.py` and the import becomes `from app.services._directory_identity import normalize_business_role` — only resolvable in the post-#56 world. **Phase 6 correction**: pair as #61 first (package move), then #56 (shim delete) if split — but single-commit is preferred.

Audit IDs = #56 (S7.6) + #61 (S7.7); developer verdict = ACCEPT (atomic).

#### Pre-flight checklist

- [ ] Verify slots in master sequence: v2 Seq 43 + 44 (`plan-loop-3-07-integration-v2.md:386-387`).
- [ ] Confirm prerequisites complete: #24+#51 atomic cluster GREEN (validator exit 0).
- [ ] Read latest state of `backend/app/services/directory_identity_service.py` (35 lines, 13 re-exports), the 8 prod importers below + `backend/scripts/bootstrap_sso_user.py:17`, the 4 `graph_directory_*.py` modules.
- [ ] Verify the **13** re-exports at `directory_identity_service.py:3-15` (11 names → `_directory_identity`) and `:16-19` (2 names → `_directory_identity.lifecycle`).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file 1** (new, for #56): `tests/backend/pytest/architecture/test_w13_directory_identity_shim_removed_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
from __future__ import annotations
import ast
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SHIM = REPO_ROOT / "backend/app/services/directory_identity_service.py"


def test_directory_identity_shim_deleted() -> None:
    assert not SHIM.exists(), "S7.6: directory_identity_service.py shim must be deleted"


def test_no_production_imports_shim() -> None:
    offenders: list[str] = []
    for root in (REPO_ROOT / "backend/app", REPO_ROOT / "backend/scripts"):
        for path in root.rglob("*.py"):
            text = path.read_text(encoding="utf-8")
            if "from app.services.directory_identity_service" in text:
                offenders.append(str(path.relative_to(REPO_ROOT)))
    assert offenders == []
```

**Test file 2** (new, for #61): `tests/backend/pytest/architecture/test_w13_graph_directory_package_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
from __future__ import annotations
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
PKG_INIT = REPO_ROOT / "backend/app/services/_graph_directory/__init__.py"
LEGACY_FILES = (
    REPO_ROOT / "backend/app/services/graph_directory_auth.py",
    REPO_ROOT / "backend/app/services/graph_directory_errors.py",
    REPO_ROOT / "backend/app/services/graph_directory_service.py",
    REPO_ROOT / "backend/app/services/graph_directory_transport.py",
)


def test_graph_directory_package_exists() -> None:
    assert PKG_INIT.is_file(), "S7.7: _graph_directory/__init__.py must exist"


def test_legacy_graph_directory_files_removed() -> None:
    for path in LEGACY_FILES:
        assert not path.exists(), f"S7.7: legacy file {path.name} must be moved into the package"


def test_no_production_imports_legacy_modules() -> None:
    offenders: list[str] = []
    for path in (REPO_ROOT / "backend/app").rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        for stem in ("graph_directory_auth", "graph_directory_errors", "graph_directory_service", "graph_directory_transport"):
            if f"from app.services.{stem}" in text:
                offenders.append(f"{path.relative_to(REPO_ROOT)}:{stem}")
    assert offenders == []
```

**Expected**: RED — both files/packages missing or wrong layout.

#### TDD Step 2 — Implement Change

**Files to move (`#61`)**:
- `backend/app/services/graph_directory_auth.py` (188 lines) → `backend/app/services/_graph_directory/auth.py`.
- `backend/app/services/graph_directory_errors.py` (29 lines) → `backend/app/services/_graph_directory/errors.py`.
- `backend/app/services/graph_directory_service.py` (141 lines) → `backend/app/services/_graph_directory/service.py`.
- `backend/app/services/graph_directory_transport.py` (75 lines) → `backend/app/services/_graph_directory/transport.py`.

Update internal imports inside the four moved files (e.g., `graph_directory_transport.py:14 from app.services.graph_directory_auth import …` becomes `from app.services._graph_directory.auth import …`).

**Files to create (`#61`)**:
- `backend/app/services/_graph_directory/__init__.py` — re-exports public surface; docstring + `__all__`.
- `backend/app/services/_graph_directory/README.md` — per ADR-007 amendment Adapter category.
- `tests/backend/pytest/architecture/test_w13_graph_directory_package_red.py` (above).

**Files to delete (`#56`)**:
- `backend/app/services/directory_identity_service.py` (35 lines, 13 re-exports).

**Files to edit (`#56`)** — rewrite each importer (8 prod + 1 script):
- `backend/app/api/v1/endpoints/auth/_sso_helpers.py:16` — repoint to `app.services._directory_identity`.
- `backend/app/services/directory_provider_service.py:17` — repoint.
- `backend/app/services/_graph_directory/service.py:8` (after #61 move) — repoint cross-import to `from app.services._directory_identity import normalize_business_role`.
- `backend/app/services/ad_deprovision_service.py:14` — repoint.
- `backend/app/services/_access_workflow/policy.py:11` — repoint.
- `backend/app/services/_identity_access_lifecycle/policy.py:11` — repoint.
- `backend/app/services/_auth_session/jit.py:13` — repoint.
- `backend/app/services/_identity_access_lifecycle/directory_import.py:15` — repoint.
- `backend/scripts/bootstrap_sso_user.py:17` — repoint.

**Mapping for the 13 re-exports**:
- `normalize_business_role`, `apply_directory_profile`, `has_auto_deprovision_reason`, `requires_break_glass_for_reenable`, `resolve_directory_email`, `resolve_or_create_department`, `DirectoryIdentityConflictError`, `DirectoryImportOutcome`, `DirectoryProfileUpdateOutcome`, `DirectoryReenableOutcome`, `DirectorySyncOutcome` → `app.services._directory_identity`.
- `apply_directory_profile_outcome`, `directory_reenable_outcome` → `app.services._directory_identity.lifecycle`.

**Files to edit (`#61` cross-cut)**:
- `backend/app/services/directory_provider_service.py:18` — also touched by #56's repoint; rewrite import to `_graph_directory`.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_w13_directory_identity_shim_removed_red.py tests/backend/pytest/architecture/test_w13_graph_directory_package_red.py -q
python3 scripts/security/validate_authz_capability_contract.py
```

All pass; validator exit 0.

#### Lock/TOML/Contract updates (same commit)

- New 2 architecture locks above.
- ADR-007 amendment lists `_directory_identity` and `_graph_directory` as adapters; the adapter TOML (`_bounded_context_adapters.toml`) created by #74a/#74b lists them — no edit here unless the amendment land has slipped past this commit.
- ADR-009 — no `_reserved_modules.toml` entry needed (forward-only delete; no public API alias).

#### README / doc updates (same commit)

- New `backend/app/services/_graph_directory/README.md` — per ADR-007 amendment Adapter category.
- `backend/app/services/_directory_identity/README.md` — confirm Contents lists all 13 names that #56 just consolidated; no edit if accurate.
- Capability contract docs — verify no `directory_identity_service.py` citation remains; strip if found.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_w13_directory_identity_shim_removed_red.py -x` — must pass.
2. `pytest tests/backend/pytest/architecture/test_w13_graph_directory_package_red.py -x` — must pass.
3. `pytest tests/backend/pytest -q -k "directory or graph_directory or sso"` — broad suite green via `client_factory`.
4. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `ruff check backend/app/services` — clean.
7. `mypy backend/app` — clean.

#### Commit boundary

**Recommended**: SINGLE atomic commit titled: `S7.6 + S7.7: delete directory_identity_service shim and move graph_directory_* into _graph_directory/ package (atomic)`.

**Alternative split** (if review pressure favors smaller diffs): 2 back-to-back commits in order **#61 first** (package move), **then #56** (shim delete). The cross-import in `graph_directory_service.py:8` resolves only after #61 lands; #56 then rewrites the cross-import inside the moved file.

#### Rollback

- Class: **CROSS-DOMAIN** (capability contract validator + package layout).
- Procedure:
  1. `git revert <SHA>` (or revert both commits in reverse order #56 → #61 if split).
  2. Restore the 4 legacy `graph_directory_*.py` files; restore `directory_identity_service.py`.
  3. Re-run validator; exit 0 required.
- Estimated revert time: 30 min.

#### Effort & Risk

- Estimated time: ~7-9h (S+M = #56 1-2h + #61 5-7h; combined cluster cost ~7h with shared verification).
- Risk: MEDIUM — package layout change + 13 import repoints + cross-package import; partial revert leaves dangling imports.
- Mitigations: 2 lock tests pin file/package layout; ADR-007 amendment + adapter TOML enforce category; validator runs in-commit; `_graph_directory/__init__.py` re-exports the public surface so external callers stay stable.

---

## Wave 5 — P2 Chains + ADR-007 Amendment Text (Items 43-57 in this section, v2 Seq 45-58 plus #43/#44 cross-domain pair)

The v2 master sequence places 16 items into Wave 5 (per `final-section-2-sequence.md:209-223`). This section continues with the user-supplied ordering: #74b, #17, #49, #59, #9, #34, #27, #8, #28, #30, #16, #38, #31, #43, #44.

> **Validator runs in Wave 5**: 0. The doc-contract validator-reentry chain
> closed in Wave 4. Wave 5 may still touch contract docs for vocabulary
> additions (#34, #60), but no validator-gating commit is the gate-of-the-day.

> **Critical chain reminder** (per `final-section-2-sequence.md:274-283`):
> the issues critical path `#2 → #8 → #28 → #30` runs entirely through this
> wave (#8 at Seq 52, #28 at Seq 53, #30 at Seq 54).

---

### Item #43 (Section 4) — #74b — ADR-007 amendment text

**Wave**: 5  | **Slot**: v2 Seq 45  | **Effort**: M (4-6h)  | **Priority**: P3  | **Domain**: crosscut (ADR)

**Dependencies**: **#74a (Seq 3, Wave 1)** for the 5 TOML allowlists; **#61 (Seq 44, Wave 4)** must have landed so the new `_graph_directory` package exists for the adapter TOML to cite.
**Atomic with**: none — but the disjointness lock referenced here was created in #74a; #74b only appends the amendment text.
**Validator?**: no

#### Why this work

ADR-007 named seven write-side bounded contexts but the codebase carries 31 underscore-prefixed packages under `backend/app/services/`. The unnamed remainder falls into four coherent shapes: read-shape projections, workflow-paired companions, adapter contexts, and a small set of cross-cutting policy modules. Without a documented secondary taxonomy, reviewers read the seven-context list as exhaustive and misclassify new packages. #74b documents the secondary taxonomy and binds it to the disjointness lock created in #74a.

> **Per Phase 6 corrections**: the **full amendment text** lives in the
> Section 6 ADR drafts file (`final-section-6-adrs.md`); this recipe only
> references and locks it. The disjointness semantics are: every
> underscore-prefixed package is in EXACTLY ONE primary allowlist
> (with `_register_listings` dual-classed write-side AND read-shape, and
> workflow-pair right-halves additionally appearing in the workflow-pair
> allowlist as many-to-one — that exemption is the only departure from
> strict disjointness).

Audit ID = #74b (ADR-007 amendment); developer verdict = ACCEPT (P3).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 45 (`plan-loop-3-07-integration-v2.md:388`).
- [ ] Confirm prerequisites: #74a 5 TOMLs landed (`_bounded_context_write_side.toml`, `_bounded_context_read_shape.toml`, `_bounded_context_workflow_pairs.toml`, `_bounded_context_adapters.toml`, `_bounded_context_cross_cutting.toml`); #61 `_graph_directory/` package created.
- [ ] Read latest state of `docs/adr/ADR-007-bounded-context-taxonomy.md`.
- [ ] Read `tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py` (created by #74a).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

No new test in #74b itself; the disjointness lock and the 5 TOML allowlists were authored in #74a. The doc update is the deliverable.

If the disjointness lock authored in #74a does not yet recognize `_graph_directory` as adapter, append/extend an assertion:

```python
def test_amendment_recognizes_graph_directory_adapter() -> None:
    """#74b: ADR-007 amendment binding to TOML adapter list includes _graph_directory."""
    import tomllib
    from pathlib import Path
    REPO = Path(__file__).resolve().parents[3]
    adapters = tomllib.loads((REPO / "tests/backend/pytest/architecture/_bounded_context_adapters.toml").read_text())
    names = {entry["context"] for entry in adapters.get("contexts", [])}
    assert "_graph_directory" in names, "#74b amendment must list _graph_directory in adapter TOML"
```

**Expected**: GREEN already if #61 + #74a fully landed; RED otherwise.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `docs/adr/ADR-007-bounded-context-taxonomy.md` — append the **Amendment 1 — Read-Shape, Workflow-Paired, Adapter, and Cross-cutting Contexts** text. Full text in `final-section-6-adrs.md`.

**Files to create**: none (TOMLs and disjointness lock created in #74a).

**Files to delete**: none.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py -q
```

All pass.

#### Lock/TOML/Contract updates (same commit)

- The 5 TOMLs were authored under #74a; #74b only references them.
- Disjointness lock recognizes the renamed `_bounded_context_cross_cutting.toml`.

#### README / doc updates (same commit)

- ADR-007 amendment text appended (per `final-section-6-adrs.md`).
- Cross-references — ADR-001 (`_authorization_capabilities` SSOT), ADR-008 (`_config` SSOT), ADR-003 (adapter exception translation).

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py -q` — must pass.
2. `make -f scripts/Makefile test-architecture-locks` — locks green.
3. (Doc-only build sanity check if any.)

#### Commit boundary

Single commit titled: `docs(adr): append ADR-007 Amendment 1 (read-shape, workflow-paired, adapter, cross-cutting)`.

#### Rollback

- Class: **DOC-ONLY**.
- Procedure:
  1. `git revert <SHA>` to remove the appended amendment text.
  2. The 5 TOMLs and disjointness lock survive (created in #74a; not removed by this revert).
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 4-6h (verify amendment text against current TOML state + 11 workflow pairs + 6 adapters + 2 cross-cutting + ADR-007 cross-references).
- Risk: LOW — doc-only.
- Mitigations: disjointness lock catches misclassification; the amendment text in `final-section-6-adrs.md` was Phase 4-corrected against the current 31-package count.

---

### Item #44 (Section 4) — #17 — Inline `_monitoring_response` endpoint shim

**Wave**: 5  | **Slot**: v2 Seq 46  | **Effort**: S (~45 min)  | **Priority**: P2  | **Domain**: vendor (endpoints)

**Dependencies**: none. Independent leaf; pure import-rewrite + file delete. First item in the **monitoring hub-wave** `#17 → #49 → #59`.
**Atomic with**: none. Hub-wave additive ordering.
**Validator?**: no

#### Why this work

`backend/app/api/v1/endpoints/_monitoring_response.py:1-26` is a 26-line compatibility adapter re-exporting 9 names from `app.services._monitoring_response`. **Phase 6 verified**: 14 importers across `endpoints/{controls,risks,kris}/crud/*.py`, `endpoints/{controls,risks}/linking.py|control_links.py`, `endpoints/risks/control_links.py`, and `endpoints/departments/{controls,kris}.py`. The recipe rewrites all 14 importers and deletes the shim. Audit ID = #17 (S2.1); developer verdict = ACCEPT (P1).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 46 (`plan-loop-3-07-integration-v2.md:389`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `backend/app/api/v1/endpoints/_monitoring_response.py:1-26` and the 14 importers:
  - `backend/app/api/v1/endpoints/departments/controls.py:10`
  - `backend/app/api/v1/endpoints/departments/kris.py:8`
  - `backend/app/api/v1/endpoints/controls/crud/create.py:6`
  - `backend/app/api/v1/endpoints/controls/crud/detail.py:6`
  - `backend/app/api/v1/endpoints/controls/crud/restore.py:6`
  - `backend/app/api/v1/endpoints/controls/linking.py:4`
  - `backend/app/api/v1/endpoints/risks/control_links.py:4`
  - `backend/app/api/v1/endpoints/risks/crud/restore.py:6`
  - `backend/app/api/v1/endpoints/risks/crud/detail.py:6`
  - `backend/app/api/v1/endpoints/risks/crud/create.py:7`
  - `backend/app/api/v1/endpoints/kris/crud/detail.py:6`
  - `backend/app/api/v1/endpoints/kris/crud/create.py:6`
  - `backend/app/api/v1/endpoints/kris/crud/restore.py:6`
  - `backend/app/api/v1/endpoints/kris/crud/breaches.py:8`
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/architecture/test_monitoring_response_shim_removed_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
"""RED: _monitoring_response endpoints shim deleted; canonical service path used."""
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract


def test_endpoint_shim_file_deleted() -> None:
    assert not Path("backend/app/api/v1/endpoints/_monitoring_response.py").exists()


def test_no_endpoint_imports_shim() -> None:
    import subprocess
    out = subprocess.run(
        ["grep", "-rn", "from app.api.v1.endpoints._monitoring_response", "backend", "--include=*.py"],
        capture_output=True, text=True,
    )
    assert out.stdout == "", f"Unexpected importers:\n{out.stdout}"


def test_canonical_service_module_exposes_surface() -> None:
    from app.services import _monitoring_response as svc
    for name in (
        "MonitoringResponseContext", "build_control_monitoring_fields",
        "build_kri_monitoring_fields", "load_monitoring_response_context",
        "serialize_control_brief_for_link", "serialize_control_read",
        "serialize_control_risk_link", "serialize_kri_response",
        "serialize_risk_read",
    ):
        assert hasattr(svc, name), name
```

**Expected**: RED — shim file exists; 14 importers reference it.

#### TDD Step 2 — Implement Change

For each of the 14 importers, rewrite the import line:
```diff
- from app.api.v1.endpoints._monitoring_response import (...)
+ from app.services._monitoring_response import (...)
```
(Imported names unchanged; only module path swaps.)

After all 14 are rewritten, **delete** `backend/app/api/v1/endpoints/_monitoring_response.py` (26 lines).

**Files to create**: the new lock test above.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_monitoring_response_shim_removed_red.py -x
```

Pass.

#### Lock/TOML/Contract updates (same commit)

- New lock test above.
- Deepening contract test does NOT pin this shim; no edit required.

#### README / doc updates (same commit)

- None.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_monitoring_response_shim_removed_red.py -x` — must pass.
2. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -x` — must pass.
3. `ruff check backend tests` — clean.
4. `mypy backend/app` — clean.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled: `refactor(monitoring): inline endpoint shim; 14 importers repointed to service`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` — restores 26-line file + 14 import lines.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: ~45 min (14 import rewrites in lockstep + file delete + RED test + verification).
- Risk: LOW — pure import-graph rewrite; no DB / schema change.
- Mitigations: lock test pins shim absence; surface check pins canonical names exposed by service module.

---

### Item #45 (Section 4) — #49 — Inline `_control_execution/monitoring.py` wrapper

**Wave**: 5  | **Slot**: v2 Seq 47  | **Effort**: S (~45 min)  | **Priority**: P2  | **Domain**: endpoints (control execution)

**Dependencies**: **#17 (Seq 46)** — same monitoring hub-wave. Lock pinned at `tests/backend/pytest/test_architecture_deepening_contracts.py:188,192`.
**Atomic with**: none. Hub-wave additive.
**Validator?**: no

#### Why this work

`backend/app/services/_control_execution/monitoring.py:1-11` is an 11-line passthrough:
```python
async def load_control_execution_monitoring_context(db: AsyncSession) -> MonitoringResponseContext:
    now = utc_now()
    return await load_monitoring_response_context(db, now=now, today=now.date())
```

4 callers, all in `backend/app/services/_control_execution/link_governance.py:25,62,91,141,170`. Lock pinned at `tests/backend/pytest/test_architecture_deepening_contracts.py:188,192`. Audit ID = #49 (S2.2); developer verdict = ACCEPT (P1).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 47 (`plan-loop-3-07-integration-v2.md:390`).
- [ ] Confirm prerequisites complete: #17 lock GREEN.
- [ ] Read latest state of `backend/app/services/_control_execution/monitoring.py:1-11` and `_control_execution/link_governance.py:25,62,91,141,170`.
- [ ] Read existing lock at `tests/backend/pytest/test_architecture_deepening_contracts.py:183-194`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/architecture/test_control_execution_monitoring_inlined_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
"""RED: monitoring.py wrapper deleted; inlined into link_governance."""
import inspect
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract


def test_monitoring_wrapper_module_removed() -> None:
    assert not Path("backend/app/services/_control_execution/monitoring.py").exists()


def test_link_governance_inlines_load_call() -> None:
    from app.services._control_execution import link_governance
    src = inspect.getsource(link_governance)
    assert "from app.services._monitoring_response import" in src
    assert "load_control_execution_monitoring_context" not in src
    assert "load_monitoring_response_context" in src
```

**Expected**: RED — wrapper module exists; link_governance still imports the wrapper.

#### TDD Step 2 — Implement Change

**Files to delete**:
- `backend/app/services/_control_execution/monitoring.py` (11 lines).

**Files to edit**:
- `backend/app/services/_control_execution/link_governance.py:25` — change:
  ```diff
  - from app.services._control_execution.monitoring import load_control_execution_monitoring_context
  + from app.services._monitoring_response import load_monitoring_response_context
  + from app.core.datetime_utils import utc_now
  ```
  Recommended: keep one local helper at the top of `link_governance.py`:
  ```python
  async def _ctx(db: AsyncSession) -> MonitoringResponseContext:
      now = utc_now()
      return await load_monitoring_response_context(db, now=now, today=now.date())
  ```
  Call `_ctx(db)` 4 times at `:62,91,141,170`.
- `tests/backend/pytest/test_architecture_deepening_contracts.py:183-194` — REWRITE:
  - `:184` — drop `monitoring` from the imports tuple.
  - `:188` — change `assert hasattr(monitoring, "load_control_execution_monitoring_context")` to test for `_ctx` helper or remove this assertion entirely.
  - `:192` — change `assert "from app.services._control_execution.monitoring" in governance_source` to `assert "from app.services._monitoring_response import" in governance_source`.

  New body:
  ```python
  def test_control_execution_governance_uses_split_modules() -> None:
      from app.services._control_execution import access, link_governance, link_policy, projection

      assert hasattr(access, "ControlRiskAccessDecision")
      assert hasattr(projection, "ControlExecutionProjection")
      assert hasattr(link_policy, "ControlRiskLinkPlan")

      governance_source = inspect.getsource(link_governance)
      assert "from app.services._monitoring_response import" in governance_source
      assert "app.api.v1.endpoints" not in governance_source
  ```

**Files to create**: the new lock test above.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_control_execution_monitoring_inlined_red.py tests/backend/pytest/test_architecture_deepening_contracts.py::test_control_execution_governance_uses_split_modules -x
```

Pass.

#### Lock/TOML/Contract updates (same commit)

- `tests/backend/pytest/test_architecture_deepening_contracts.py:188,192` — rewritten as above.
- New lock test above.

#### README / doc updates (same commit)

- `backend/app/services/_control_execution/README.md` (if exists) — strike `monitoring.py` from inventory; note inlining.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_control_execution_monitoring_inlined_red.py -x` — must pass.
2. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py::test_control_execution_governance_uses_split_modules -x` — must pass.
3. `ruff check backend tests` — clean.
4. `mypy backend/app` — clean.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled: `refactor(control-execution): inline monitoring wrapper into link_governance`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` — restores 11-line wrapper + 4 import sites + lock-test edits.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: ~45 min (delete + 4 inlines or `_ctx` helper + 2 lock-test rewrites + verification).
- Risk: LOW — pure passthrough; behavior preserved.
- Mitigations: lock-test rewrite is atomic with the inline; existing deepening lock retained.

---

### Item #46 (Section 4) — #59 — Consolidate `_monitoring_*` packages (docs+lock)

**Wave**: 5  | **Slot**: v2 Seq 48  | **Effort**: M (4-6h)  | **Priority**: P3  | **Domain**: endpoints (monitoring)

**Dependencies**: **#17 (Seq 46), #49 (Seq 47)** — terminal of monitoring hub-wave.
**Atomic with**: none.
**Validator?**: no

#### Why this work

**Phase 4/6 CRITICAL correction**: `_monitoring_response` IS A SINGLE FILE (`backend/app/services/_monitoring_response.py`, 278 lines), NOT a package. The recipe takes path **(b)**: drop the `_monitoring_response/README.md` requirement and use **docstring + `_monitoring_status/README.md` only**. Path (a) (split single file into package first) requires moving 278 lines into N submodules with no functional change and is out of scope for #59.

The deliverable: extend the module docstring at `backend/app/services/_monitoring_response.py:1` to describe role + dependency on `_monitoring_status`, and append a sentence to `backend/app/services/_monitoring_status/README.md` Notes section describing `_monitoring_response.py`. Audit ID = #59 (S2.10); developer verdict = ACCEPT (P3).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 48 (`plan-loop-3-07-integration-v2.md:391`).
- [ ] Confirm prerequisites complete: #17 + #49 locks GREEN.
- [ ] Read latest state of `backend/app/services/_monitoring_response.py:1-15` (docstring), `backend/app/services/_monitoring_status/README.md`.
- [ ] Confirm `_monitoring_response.py` is a single file, NOT a package (Phase 6 CRITICAL).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/architecture/test_w13_monitoring_consolidation_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
from __future__ import annotations
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
RESPONSE_FILE = REPO_ROOT / "backend/app/services/_monitoring_response.py"
STATUS_README = REPO_ROOT / "backend/app/services/_monitoring_status/README.md"
PACKAGE_INIT = REPO_ROOT / "backend/app/services/_monitoring_response/__init__.py"


def test_monitoring_response_docstring_mentions_monitoring_status() -> None:
    text = RESPONSE_FILE.read_text(encoding="utf-8")
    # docstring is at top of module
    assert "monitoring_status" in text[:600], "docstring must reference _monitoring_status"


def test_monitoring_status_readme_mentions_monitoring_response() -> None:
    text = STATUS_README.read_text(encoding="utf-8")
    assert "_monitoring_response.py" in text


def test_monitoring_response_remains_single_file() -> None:
    # Phase 6 CRITICAL: _monitoring_response is a single file; no package layout.
    assert not PACKAGE_INIT.exists(), (
        "S2.10: _monitoring_response must remain a single file, not a package"
    )
```

**Expected**: RED on docstring/README substring expectations.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/services/_monitoring_response.py:1-15` — extend module docstring to:
  ```python
  """Read-shape projection for monitoring responses. Pairs with _monitoring_status (see services/_monitoring_status/README.md). File-level entry per ADR-007 amendment."""
  ```
- `backend/app/services/_monitoring_status/README.md` — append a sentence to Notes section describing `_monitoring_response.py` is the file-level read-shape complement.

**Files to create**: the new lock test above.

**Files to delete**: none.

> **DO NOT create** `backend/app/services/_monitoring_response/__init__.py` — Phase 6 CRITICAL: `_monitoring_response` is a single file. The README requirement was dropped.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_w13_monitoring_consolidation_red.py -x
```

Pass.

#### Lock/TOML/Contract updates (same commit)

- New lock test above.
- `_bounded_context_read_shape.toml` (created by #74b/#74a) holds `_monitoring_response.py` as a file entry — this recipe does NOT populate that TOML; #74b/#74a does.

#### README / doc updates (same commit)

- `backend/app/services/_monitoring_response.py:1` — docstring extended.
- `backend/app/services/_monitoring_status/README.md` — Notes append.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_w13_monitoring_consolidation_red.py -x` — must pass.
2. `pytest tests/backend/pytest -q -k "monitoring"` — broad monitoring suite green.
3. `ruff check backend/app/services/_monitoring_response.py backend/app/services/_monitoring_status` — clean.
4. `mypy backend/app/services/_monitoring_response.py backend/app/services/_monitoring_status` — clean.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled: `docs(monitoring): consolidate _monitoring_response/_monitoring_status taxonomy via docstring + README cross-link`.

#### Rollback

- Class: **DOC-ONLY** (per Phase 6 path-(b) decision).
- Procedure:
  1. `git revert <SHA>` — restores docstring + README + drops the lock test.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 4-6h (research + docstring + README + lock test + verification; the upper bound covers reviewer alignment on Phase 4 path-b decision).
- Risk: LOW — doc-only.
- Mitigations: lock test pins single-file invariant; ADR-007 amendment treats `_monitoring_response.py` as a file entry; no production imports change.

---

### Item #47 (Section 4) — #9 — Delete-and-redirect duplicate `can_user_view_approval_resource`

**Wave**: 5  | **Slot**: v2 Seq 49  | **Effort**: S (~2h)  | **Priority**: P2  | **Domain**: approvals

**Dependencies**: none. **First commit in `#9 → #34 → #60` approval_scenario_policy hub-wave**.
**Atomic with**: none.
**Validator?**: no — no TOML allowlist anchors `can_user_view_approval_resource`.

#### Why this work

`backend/app/services/_notification_approval_helpers.py:72-79` carries a duplicate `can_user_view_approval_resource` body. Bodies are identical to the canonical `approval_scenario_policy.can_view_approval_resource` at `backend/app/services/approval_scenario_policy.py:134`; only the canonical version carries a docstring. The single internal caller is at `:98` of `_notification_approval_helpers.py`. Audit ID = #9 (S6.5); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 49 (`plan-loop-3-07-integration-v2.md:392`).
- [ ] Confirm prerequisites: none. (Hub-wave additive surgery.)
- [ ] Read latest state of `backend/app/services/_notification_approval_helpers.py:9,72-79,98`, `backend/app/services/approval_scenario_policy.py:134`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (append to existing): `tests/backend/pytest/test_architecture_deepening_contracts.py`

```python
def test_notification_approval_helpers_no_duplicate_can_view() -> None:
    """S6.5: duplicate can_user_view_approval_resource removed; canonical consumed."""
    import importlib, inspect
    helpers = importlib.import_module("app.services._notification_approval_helpers")
    assert not hasattr(helpers, "can_user_view_approval_resource"), (
        "S6.5: duplicate must be deleted from _notification_approval_helpers"
    )
    src = inspect.getsource(helpers.eligible_approval_notification_recipients)
    assert "can_view_approval_resource" in src, (
        "Caller must consume approval_scenario_policy.can_view_approval_resource"
    )
```

Behavioral regression: extend `tests/backend/pytest/test_approval_workflow.py` (already imports `can_view_approval_resource` at `:26`) with a parametric test asserting `eligible_approval_notification_recipients` skips a candidate without read access on each `ApprovalResourceType` (RISK, CONTROL, KRI), incrementing `skipped["hidden_resource"]`. Use `client_factory` for any HTTP-level assertion.

**Expected**: RED — duplicate body still exists.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/services/_notification_approval_helpers.py:72-79` — DELETE the duplicate body.
- Same file, line 98 — rewrite the call site: `if not await can_view_approval_resource(db, candidate, approval):`.
- Same file, line 9 — extend the existing `from app.services.approval_scenario_policy import (...)` import to include `can_view_approval_resource` (which already imports `RISK_OWNER_APPROVER_ROLE, scenario_roles_for_approval`).

**Files to create**: none.

**Files to delete**: none.

#### TDD Step 3 — Confirm GREEN

```
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_approval_workflow.py -x
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_architecture_deepening_contracts.py -k notification_approval
```

Pass.

#### Lock/TOML/Contract updates (same commit)

- New structural assertion above.
- No TOML allowlist anchors `can_user_view_approval_resource`.

#### README / doc updates (same commit)

- None. AUTHZ-APPROVALS row at `docs/security/authorization-capability-contract.md:119` already names `approval_scenario_policy.py`.

#### Verification commands (run all in order)

1. `cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_approval_workflow.py -x` — must pass.
2. `cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_architecture_deepening_contracts.py -k notification_approval` — must pass.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled: `refactor(approvals): consolidate can_view_approval_resource on approval_scenario_policy`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` — restores duplicate body.
  2. No serialization, schema, or wire-format change.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 2h (delete + import update + call-site rewrite + structural assertion + behavioral regression).
- Risk: LOW — bodies are byte-identical (Loop B).
- Mitigations: structural lock catches re-introduction; behavioral regression pins recipient eligibility behavior.

---

### Item #48 (Section 4) — #34 — Extract `resolve_approval_privilege_tier` helper

**Wave**: 5  | **Slot**: v2 Seq 50  | **Effort**: **XL** (28-32h, Phase 4 corrected from M)  | **Priority**: P3  | **Domain**: approvals

**Dependencies**: **#9 (Seq 49)** — additive hub-wave; **2-week separation** between #34 (Wave 5) and #60 (Wave 7) so the migration soaks before layering FastAPI Depends on top. Lands AFTER #37 + #12 per Correction A.
**Atomic with**: none.
**Validator?**: no — but capability-contract vocabulary edits at `md:43-54` require validator green check.

#### Why this work

Extract a single canonical helper into `backend/app/services/approval_scenario_policy.py` returning a frozen dataclass (`ApprovalPrivilegeTier`) plus async `resolve_approval_privilege_tier(db, user, approval) -> ApprovalPrivilegeTier`. Migrate **25 call sites across 16 files** (Phase 4 verification — Loop 1's "22+" was a hedge; AST scan confirms 25). **Phase 6 verification: 25 sites in 16 files matches Phase 5 P5-A3 exactly**.

This recipe is the **single owner** of the `can_resolve_approvals(current_user)` migration. Other domain recipes must NOT double-migrate the same predicate. Cross-domain prerequisites affect shared files in Risks/Controls/KRIs domains:
- `_authorization_capabilities/{risks,controls,kris}.py` (3 files shared with R/C/K plans).
- `_entity_mutation_lifecycle/{approval_plans,archive_plans}.py` (mutation flow).
- `_kri_history/{governance,intake}.py` (KRI domain).

Audit ID = #34 (S6.6); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 50 (`plan-loop-3-07-integration-v2.md:393`).
- [ ] Confirm prerequisites complete: #9 lock GREEN; #37 (Seq 6) and #12 (Seq 7) landed.
- [ ] Read latest state of `backend/app/services/approval_scenario_policy.py:142` (insertion point) and the 16 files / 25 lines listed below.
- [ ] AST-scan to confirm 25 call sites: `python3 -c "..."` (helper provided in production edits).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test A** (behavioral parametric tier consistency, new): `tests/backend/pytest/test_approval_privilege_tier.py`

```python
"""S6.6: resolve_approval_privilege_tier behavioral parity across flows."""
from __future__ import annotations
import pytest
pytestmark = pytest.mark.contract

from app.services.approval_scenario_policy import (
    TIER_CAPABLE_SCENARIO_KEYS,
    resolve_approval_privilege_tier,
    ApprovalPrivilegeTier,
)

@pytest.mark.parametrize("scenario_key", sorted(TIER_CAPABLE_SCENARIO_KEYS) + ["__legacy__"])
@pytest.mark.parametrize(
    "user_role,is_primary,is_requester",
    [
        ("admin", False, False),
        ("cro", False, False),
        ("risk_manager", False, False),
        ("risk_owner", True, False),
        ("risk_owner", False, True),
        ("auditor", False, False),
    ],
)
async def test_privilege_tier_matches_legacy_ladder(
    db_session, scenario_key, user_role, is_primary, is_requester, approval_factory
):
    user, approval = approval_factory(role=user_role, scenario=scenario_key,
                                       primary=is_primary, requester=is_requester)
    tier = await resolve_approval_privilege_tier(db_session, user, approval)
    assert isinstance(tier, ApprovalPrivilegeTier)
    from app.core.permissions import can_resolve_approvals
    from app.services.approval_scenario_policy import (
        scenario_allows_privileged_resolution,
        user_matches_approval_scenario_role,
    )
    assert tier.is_privileged == can_resolve_approvals(user)
    assert tier.scenario_match == (
        user_matches_approval_scenario_role(approval, user)
        if approval.scenario_approver_roles is not None else None
    )
    assert tier.privileged_scenario_match == scenario_allows_privileged_resolution(approval, user)
    assert tier.is_primary_approver == is_primary
    assert tier.is_requester == is_requester
```

**Test B** (AST-based structural lock, append to `tests/backend/pytest/test_architecture_deepening_contracts.py`):

> **Phase 6 correction**: AST-scan code snippet from `recipe-03-approvals.md:1218-1259` must be **inline in this recipe** (not paraphrased). The 25-site count + AST-scan are verified together.

```python
def test_can_resolve_approvals_only_in_policy_or_permissions() -> None:
    """S6.6: AST-scan lock — `can_resolve_approvals(...)` Call nodes only inside
    approval_scenario_policy.* and core.permissions.*. Future-proof against new
    files (Phase 4 found per-file string-search fragile)."""
    import ast
    from pathlib import Path
    REPO = Path(__file__).resolve().parents[3]
    BACKEND_APP = REPO / "backend" / "app"
    ALLOWED = {
        "backend/app/services/approval_scenario_policy.py",
        "backend/app/core/_permissions/evaluation.py",
        "backend/app/core/permissions.py",
    }
    offenders: list[str] = []
    for py in BACKEND_APP.rglob("*.py"):
        rel = str(py.relative_to(REPO))
        if rel in ALLOWED:
            continue
        try:
            tree = ast.parse(py.read_text())
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                fn = node.func
                name = (
                    fn.id if isinstance(fn, ast.Name)
                    else fn.attr if isinstance(fn, ast.Attribute)
                    else None
                )
                if name == "can_resolve_approvals":
                    offenders.append(f"{rel}:{node.lineno}")
    assert not offenders, (
        "S6.6: can_resolve_approvals() must only be called from approval_scenario_policy "
        "or core.permissions. Offenders:\n  " + "\n  ".join(offenders)
    )


def test_resolve_approval_privilege_tier_canonical() -> None:
    """S6.6: helper exported from approval_scenario_policy."""
    import importlib
    policy = importlib.import_module("app.services.approval_scenario_policy")
    assert hasattr(policy, "resolve_approval_privilege_tier")
    assert hasattr(policy, "ApprovalPrivilegeTier")
```

**Expected**: RED — current code has 25 offending sites; helper does not exist.

#### TDD Step 2 — Implement Change

**Helper introduction** at `backend/app/services/approval_scenario_policy.py` (append after line `:142`, after `can_view_approval_resource`):

```python
@dataclass(frozen=True)
class ApprovalPrivilegeTier:
    is_privileged: bool
    is_primary_approver: bool
    is_requester: bool
    scenario_match: bool | None
    privileged_scenario_match: bool | None


async def resolve_approval_privilege_tier(
    db: AsyncSession, user: User, approval: ApprovalRequest
) -> ApprovalPrivilegeTier:
    """Single source of truth for approval-resolution authorization tier."""
    from app.core.permissions import can_resolve_approvals  # internal authority
    return ApprovalPrivilegeTier(
        is_privileged=can_resolve_approvals(user),
        is_primary_approver=(approval.primary_approver_id == user.id),
        is_requester=(approval.requester_id == user.id),
        scenario_match=user_matches_approval_scenario_role(approval, user),
        privileged_scenario_match=scenario_allows_privileged_resolution(approval, user),
    )
```

**Call-site migration (25 sites in 16 files)** — verified via AST scan; matches Phase 5 P5-A3:

| File | Line(s) | Notes |
|---|---|---|
| `backend/app/api/v1/endpoints/approvals/detail.py` | :47 | replace 4 hand-rolled booleans with single tier lookup |
| `backend/app/api/v1/endpoints/notifications.py` | :127 | bare `is_privileged` read |
| `backend/app/api/v1/endpoints/users/summary.py` | :26 | bare `is_privileged` read |
| `backend/app/services/_approval_execution/authorization.py` | :30 | replace 5 booleans |
| `backend/app/services/_approval_queue/counts.py` | :12 | same |
| `backend/app/services/_approval_queue/queries.py` | :28, :33 | adjust f-string log line at `:28` to read `tier.is_privileged` |
| `backend/app/services/_authorization_capabilities/approvals.py` | :15 | same |
| `backend/app/services/_authorization_capabilities/controls.py` | :54 | cross-domain — Risks/Controls owner |
| `backend/app/services/_authorization_capabilities/kris.py` | :74 | cross-domain — KRIs owner |
| `backend/app/services/_authorization_capabilities/risks.py` | :54 | cross-domain — Risks owner |
| `backend/app/services/_entity_mutation_lifecycle/approval_plans.py` | :69, :162, :267 | cross-domain — mutation flow |
| `backend/app/services/_entity_mutation_lifecycle/archive_plans.py` | :110, :186, :255 | cross-domain — mutation flow |
| `backend/app/services/_kri_history/governance.py` | :238 | cross-domain — KRI |
| `backend/app/services/_kri_history/intake.py` | :42 | cross-domain — KRI |
| `backend/app/services/approval_execution_service.py` | :116, :222, :235, :237 | collapse 4 predicate calls into one helper invocation per function |
| `backend/app/services/notification_visibility.py` | :78, :207 | same |

Total: **25 sites in 16 files**.

Each site replaces `can_resolve_approvals(current_user)` (or `can_resolve_approvals(user)`) with reading `tier.is_privileged` from a single `tier = await resolve_approval_privilege_tier(db, current_user, approval)` invocation per scope. Drop `from app.core.permissions import can_resolve_approvals` from each migrated file (keep only in `approval_scenario_policy.py` and `core.permissions`).

`backend/app/core/permissions.py` and `backend/app/core/_permissions/evaluation.py:65` keep `can_resolve_approvals` exports — the helper still uses it internally.

**Files to create**: 1 new behavioral test + 2 lock-test additions to existing file.

**Files to delete**: none.

#### TDD Step 3 — Confirm GREEN

```
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_approval_privilege_tier.py
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_architecture_deepening_contracts.py -k "resolve_approval_privilege_tier or can_resolve_approvals_only"
```

Pass.

#### Lock/TOML/Contract updates (same commit)

- New AST-based deepening contract (Test B above).
- **§Vocabulary edit at `docs/security/authorization-capability-contract.md:43-54`** (Phase 4 correction — NOT line `:119`). Append a table row:
  ```markdown
  | Privilege tier | Resolved per-approval boolean fivefold (`is_privileged`, `is_primary_approver`, `is_requester`, `scenario_match`, `privileged_scenario_match`) returned by `approval_scenario_policy.resolve_approval_privilege_tier`. |
  ```
- Re-emit `docs/security/authorization-capability-contract.json` so `python3 scripts/security/validate_authz_capability_contract.py` passes.
- AUTHZ-APPROVALS row at `:119` — extend `Service policy` cell to cite `resolve_approval_privilege_tier` alongside the existing `approval_scenario_policy.py` reference.
- No `_endpoint_commit_allowlist.toml` ratchet (no new `db.commit`).
- No `_capabilities_all_allowlist.toml` change (no new resource/action pair).
- No `_naming_allowlist.toml` change.

#### README / doc updates (same commit)

- `docs/security/authorization-capability-contract.md:43-54` — vocabulary row above.
- `docs/security/authorization-capability-contract.md:119` — Service-policy cell extended.
- `backend/app/services/_approval_execution/README.md`, `backend/app/services/_approval_queue/README.md`, `backend/app/services/_entity_mutation_lifecycle/README.md`, `backend/app/services/_kri_history/README.md` — if they enumerate authorization predicates, cross-reference helper.

#### Verification commands (run all in order)

1. `cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_approval_privilege_tier.py` — must pass.
2. `cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approvals.py tests/backend/pytest/test_approval_resolution.py tests/backend/pytest/test_w1_privileged_escalation_red.py -x` — must pass.
3. `cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_architecture_deepening_contracts.py -k "resolve_approval_privilege_tier or can_resolve_approvals_only"` — must pass.
4. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

ONE migration commit titled: `refactor(approvals): centralize privilege-tier resolution via resolve_approval_privilege_tier`. RED tests + helper introduction + 25-site migration + doc updates in same commit.

#### Rollback

- Class: **CROSS-DOMAIN** (largest in-domain diff: 16 files × 25 sites).
- Procedure:
  1. `git revert <SHA>` — restores per-site predicates verbatim.
  2. Drop the new test file + 2 lock-test additions.
  3. Restore `md:43-54` vocabulary row + `:119` service-policy cell.
  4. Re-run validator; exit 0 required.
- No schema, capability surface, or wire-format change.
- Estimated revert time: 60 min (16 files; manual review per-file).

#### Effort & Risk

- Estimated time: **XL (28-32h)** (Phase 4 correction; Loop 1 said M). 25 sites × ~30min decision time + dataclass design + parametric matrix + AST-scan test + 2 review rounds + doc/json round-trip.
- Risk: HIGH — broad cross-domain surface; 25 call-site behaviors must remain identical; partial commit leaves half-migrated codebase.
- Mitigations: parametric tier-consistency test pins behavior across role × scenario matrix; AST-scan lock catches re-introduction (future-proof against new files); single-commit migration guards against partial state; 2-week soak gates #60.

---

### Item #49 (Section 4) — #27 — Issue-loading duplicate deletion

**Wave**: 5  | **Slot**: v2 Seq 51  | **Effort**: M (~5h)  | **Priority**: P2  | **Domain**: issues

**Dependencies**: none. Strict prerequisite for #30.
**Atomic with**: none.
**Validator?**: no — no entry references `_shared/loading.py`.

#### Why this work

`backend/app/api/v1/endpoints/issues/_shared/loading.py:22-65` is byte-identical to `backend/app/services/_issue_workflow/loading.py` (Loop B verified). Recipe deletes the endpoint duplicate, repoints 4 endpoint consumer files (`crud/{contextual,create,detail}.py`, `links.py`) to the service module. Audit ID = #27 (S4.2); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 51 (`plan-loop-3-07-integration-v2.md:394`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `backend/app/api/v1/endpoints/issues/_shared/loading.py`, `backend/app/services/_issue_workflow/loading.py`, the 4 endpoint consumers (`crud/contextual.py`, `crud/create.py`, `crud/detail.py`, `links.py`).
- [ ] Confirm endpoint `_shared/loading.py:22-65` is byte-identical to service module.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/architecture/test_endpoint_issues_loading_is_thin_or_deleted_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
from __future__ import annotations
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ENDPOINT_LOADING = REPO_ROOT / "backend/app/api/v1/endpoints/issues/_shared/loading.py"


def test_endpoint_issues_loading_is_deleted_or_thin() -> None:
    if not ENDPOINT_LOADING.exists():
        return
    text = ENDPOINT_LOADING.read_text()
    # The selectinload SQL fragment is the byte-identical duplicate body.
    assert "selectinload(Issue.links).selectinload(IssueLink.risk)" not in text
```

**Expected**: RED — `_shared/loading.py:29` literally contains the fragment.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/api/v1/endpoints/issues/crud/contextual.py:20,95` — replace `_get_issue_with_relations` import with `from app.services._issue_workflow.loading import get_issue_with_relations`; rename call site.
- `backend/app/api/v1/endpoints/issues/crud/create.py:21,107` — same pattern.
- `backend/app/api/v1/endpoints/issues/crud/detail.py:10,21` — replace `_get_readable_issue_or_404` with `from app.services._issue_workflow.loading import get_readable_issue_or_404`; rename call site.
- `backend/app/api/v1/endpoints/issues/links.py:14,80,128` — replace `_get_writable_issue_or_404` with `from app.services._issue_workflow.loading import get_writable_issue_or_404`; rename call sites.
- `backend/app/api/v1/endpoints/issues/_shared/__init__.py:11,54-56` — drop the three `_get_*` imports and their `__all__` entries (overlaps with #30; in-scope edit here is purely the import drop).

**Files to delete**:
- `backend/app/api/v1/endpoints/issues/_shared/loading.py` (entire file `:1-65`).

**Files to create**: the new lock test above.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_endpoint_issues_loading_is_thin_or_deleted_red.py -q
```

Pass.

#### Lock/TOML/Contract updates (same commit)

- Existing lock at `tests/backend/pytest/test_architecture_deepening_contracts.py:1192-1206` already asserts service-side `loading.get_issue_with_relations`, `loading.get_writable_issue_or_404` — confirm still GREEN.
- New structural lock above.
- No TOML allowlist edits (no entry references `_shared/loading.py`).
- No capability-contract change (file not cited).

#### README / doc updates (same commit)

- `backend/app/api/v1/endpoints/issues/_shared/README.md:13` — strike `loading.py` from Contents list.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_endpoint_issues_loading_is_thin_or_deleted_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_issues_crud_api.py tests/backend/pytest/api/v1/test_issues_rbac_api.py tests/backend/pytest/api/v1/test_issue_workflow.py -q` — domain suite green.
3. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "issue_workflow"` — locks green.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `ruff check backend/app/api/v1/endpoints/issues backend/app/services/_issue_workflow` — clean.
6. `mypy backend/app/api/v1/endpoints/issues backend/app/services/_issue_workflow` — clean.

#### Commit boundary

Single commit titled: `S4.2: delete endpoint issues/_shared/loading.py; service loader is canonical`.

#### Rollback

- Class: **LOCK-RATCHET** (per `plan-loop-3-03-rollback-register.md:317`).
- Procedure:
  1. `git revert <SHA>` — restores duplicate loader.
  2. Drop new lock test.
  3. Restore line `:13` in README.
- Coordination: chain into #30. If #30 landed, revert sequence is `#30 → #28 → #27`.
- Estimated revert time: 25 min.

#### Effort & Risk

- Estimated time: 5h (4 endpoint files repointed + 1 file deleted + barrel + README + lock).
- Risk: LOW — service loader is canonical body; underscore copy was dead duplication.
- Mitigations: existing deepening lock at `:1192-1206` asserts service-side presence; new lock pins endpoint-side absence.

---

### Item #50 (Section 4) — #8 — Source-validation split + canonical link helpers consolidation

**Wave**: 5  | **Slot**: v2 Seq 52  | **Effort**: M (~6h)  | **Priority**: P2  | **Domain**: issues

**Dependencies**: **#2 (Seq 14, Wave 3)**. Critical chain `#2 → #8 → #28 → #30`.
**Atomic with**: none (sequential prerequisite for #28).
**Validator?**: yes — capability contract `md:128` and `.json:629` add `_issue_workflow/assignment.py`.

#### Why this work

`backend/app/services/_issue_workflow/source_validation.py:16-21,24-42` carries owner-validation helpers `validate_user_exists` and `ensure_owner_assignable` that conceptually belong in `_issue_workflow/assignment.py`. Recipe promotes the bodies (byte-identical move), repoints `update_plans.py` and `execution.py` callers, and updates the endpoint barrel re-export. **Phase 6 critical correction**: must edit `tests/backend/pytest/test_architecture_deepening_contracts.py:1199` AND `:1203` (not just `:1193`). Audit ID = #8 (B-N2); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 52 (`plan-loop-3-07-integration-v2.md:395`).
- [ ] Confirm prerequisites complete: `pytest tests/backend/pytest/architecture/test_issue_workflow_no_underscored_self_aliases_red.py -q` (must pass — proves #2 landed).
- [ ] Read latest state of `backend/app/services/_issue_workflow/source_validation.py`, `_issue_workflow/assignment.py`, `_issue_register/source_mutation.py`, `backend/app/api/v1/endpoints/issues/_shared/validation.py`, `_shared/links.py`.
- [ ] Confirm `_issue_workflow/assignment.py` exists and does NOT yet expose `validate_user_exists` / `ensure_owner_assignable`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**File**: append to `tests/backend/pytest/test_architecture_deepening_contracts.py` (existing file already has `pytestmark = pytest.mark.contract` at module scope per Loop 1 plan `:54`).

```python
def test_issue_workflow_owner_validation_lives_in_dedicated_module() -> None:
    from app.services._issue_workflow import assignment

    source = _source("backend/app/services/_issue_workflow/source_validation.py")
    assert "async def validate_user_exists" not in source
    assert "async def ensure_owner_assignable" not in source

    assert hasattr(assignment, "validate_user_exists")
    assert hasattr(assignment, "ensure_owner_assignable")
```

Add behavior pin in `tests/backend/pytest/api/v1/test_issue_workflow.py` (use `client_factory`). Verify existing 400 (`User {id} not found`), 403 (department mismatch), 409 (archived vendor) cases still pass after the move.

**Expected**: RED.

#### TDD Step 2 — Implement Change

**Commit (a)**: move owner-validation into `assignment.py`, repoint workflow callers, repoint endpoint validation.

**Files to edit**:
- `backend/app/services/_issue_workflow/assignment.py` — append two public coroutines `validate_user_exists` and `ensure_owner_assignable`. Bodies are byte-identical to current `source_validation.py:16-21,24-42`. Preserve imports.
- `backend/app/services/_issue_workflow/source_validation.py:16-21,24-42` — delete the bodies. Update `__all__` at `:122-130` — remove the names.
- `backend/app/services/_issue_workflow/update_plans.py:9-14` — change `from app.services._issue_workflow.source_validation import (validate_user_exists, ensure_owner_assignable, ...)` to import these two names from `_issue_workflow.assignment`. Keep other names in source_validation until #28 lands.
- `backend/app/services/_issue_workflow/execution.py:41-47` — same repoint for `validate_user_exists` and `ensure_owner_assignable`. Other names stay until #28.
- `backend/app/api/v1/endpoints/issues/_shared/validation.py:11-37` — replace local `_validate_user_exists` and `_ensure_owner_assignable` bodies with thin re-imports:
  ```python
  from app.services._issue_workflow.assignment import (
      ensure_owner_assignable as _public_ensure_owner_assignable,
      validate_user_exists as _public_validate_user_exists,
  )

  _validate_user_exists = _public_validate_user_exists
  _ensure_owner_assignable = _public_ensure_owner_assignable
  ```
  Final removal of these underscored bindings happens in #30.

**Commit (b)**: shrink/delete `source_validation.py` link/vendor bodies.

**Files to edit (commit b)**:
- `backend/app/services/_issue_workflow/source_validation.py:45-114` — delete `issue_link_department_ids` and `resolve_vendor_department_and_access` bodies. Update `__all__` to drop these names. Recommended end-state: `git rm backend/app/services/_issue_workflow/source_validation.py`.
- `backend/app/api/v1/endpoints/issues/_shared/links.py:11-80` — keep until #28 (commit b deletes only the workflow-side bodies).
- **`tests/backend/pytest/test_architecture_deepening_contracts.py:1193`** — update import tuple if `source_validation` is removed: `from app.services._issue_workflow import execution, lifecycle, loading, outbox, serialization` (drop `source_validation`).
- **Phase 6 critical**: also edit **`tests/backend/pytest/test_architecture_deepening_contracts.py:1199`** AND **`:1203`** — drop any remaining `source_validation` references in the parallel assertions / hasattr checks. Without these edits, the test file imports a deleted symbol and the entire deepening contract module errors at collection time.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/test_architecture_deepening_contracts.py::test_issue_workflow_owner_validation_lives_in_dedicated_module -q
```

Pass after commit (a).

#### Lock/TOML/Contract updates (same commit)

- New architecture-lock assertion (Step 1).
- `docs/security/authorization-capability-contract.md:128` and `.json:629` — append `backend/app/services/_issue_workflow/assignment.py` to the `service_policy` enumeration (between `_shared/source.py` and `_issue_register/`). Atomic edit in commit (a).
- 3 lock-test edits at `:1193, :1199, :1203` (commit b).
- No TOML allowlist edits.

#### README / doc updates (same commit)

- `backend/app/services/_issue_workflow/README.md:11` — add `assignment.py - owner-assignment validation (user existence, owner-to-department eligibility)` to Contents (commit a).
- If commit (b) deletes `source_validation.py`, update README to remove the file reference.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py::test_issue_workflow_owner_validation_lives_in_dedicated_module -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_issue_workflow.py tests/backend/pytest/api/v1/test_issues_crud_api.py tests/backend/pytest/api/v1/test_issues_rbac_api.py -q` — domain suite green.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `ruff check backend/app/services/_issue_workflow backend/app/api/v1/endpoints/issues` — clean.
6. `mypy backend/app/services/_issue_workflow backend/app/api/v1/endpoints/issues` — clean.

#### Commit boundary

**2 atomic commits** (per Loop 1 plan):
- Commit (a) title: `B-N2(a): move owner-validation helpers to _issue_workflow/assignment`
- Commit (b) title: `B-N2(b): shrink _issue_workflow/source_validation to source_mutation re-export`

#### Rollback

- Class: **CROSS-DOMAIN** (per `plan-loop-3-03-rollback-register.md:97`).
- Procedure:
  1. **Revert commit (b) FIRST, then commit (a)** if both are merged.
  2. `git revert <commit-b-SHA>` then `git revert <commit-a-SHA>`.
  3. Restore `:1193, :1199, :1203` import lines in `test_architecture_deepening_contracts.py` (re-add `source_validation`).
  4. Drop the new `test_issue_workflow_owner_validation_lives_in_dedicated_module` assertion.
  5. If #28 / #30 already landed downstream, **defer revert** until those are also reverted (per chain `#2 → #8 → #28 → #30`).
- Estimated revert time: 30 min (60 min if #28/#30 landed).

#### Effort & Risk

- Estimated time: 6h (test + 2 commits' implementation + verification).
- Risk: MEDIUM — chain head; partial commit leaves stale imports. Loop 3 risk register flags this as part of the critical-path stall risk (`plan-loop-3-04-risk-register.md:542-554`).
- Mitigations: 2-commit boundary so each step lands GREEN; tests cover all owner-assignment HTTP paths; capability contract updated atomically with code; **Phase 6 correction at `:1199, :1203`** prevents collection-time errors.

---

### Item #51 (Section 4) — #28 — Issue source-mutation triplicate collapse

**Wave**: 5  | **Slot**: v2 Seq 53  | **Effort**: M (~6h)  | **Priority**: P2  | **Domain**: issues

**Dependencies**: **#8 (Seq 52)**. Critical chain link.
**Atomic with**: none (sequential prerequisite for #30).
**Validator?**: yes — capability contract `md:128` and `.json:629` drop `_shared/links.py`.

#### Why this work

Three near-duplicate bodies of `issue_link_department_ids` and `resolve_vendor_department_and_access`:
- canonical at `backend/app/services/_issue_register/source_mutation.py:28-53,56-97`.
- workflow copy at `backend/app/services/_issue_workflow/source_validation.py` (after #8 commit b).
- endpoint copy at `backend/app/api/v1/endpoints/issues/_shared/links.py:11-80`.

Recipe deletes the workflow + endpoint copies, repoints callers at the canonical `_issue_register/source_mutation.py` bodies, deletes endpoint `_shared/links.py`. Audit ID = #28 (S4.3); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 53 (`plan-loop-3-07-integration-v2.md:396`).
- [ ] Confirm prerequisites complete: `pytest tests/backend/pytest/test_architecture_deepening_contracts.py::test_issue_workflow_owner_validation_lives_in_dedicated_module -q` (#8 lock test must pass).
- [ ] Read latest state of `backend/app/services/_issue_register/source_mutation.py`, `_issue_workflow/source_validation.py` (after #8), `_issue_workflow/update_plans.py`, `backend/app/api/v1/endpoints/issues/_shared/links.py`, `_shared/__init__.py`, `endpoints/issues/links.py`.
- [ ] Confirm canonical bodies in `_issue_register/source_mutation.py:28-53` (`resolve_vendor_department_and_access`) and `:56-97` (`issue_link_department_ids`) intact.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/architecture/test_issue_link_helpers_have_one_canonical_home_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
from __future__ import annotations
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ENDPOINT_LINKS = REPO_ROOT / "backend/app/api/v1/endpoints/issues/_shared/links.py"
WORKFLOW_SOURCE = REPO_ROOT / "backend/app/services/_issue_workflow/source_validation.py"
REGISTER_MUTATION = REPO_ROOT / "backend/app/services/_issue_register/source_mutation.py"


def test_endpoint_links_no_longer_owns_helper_bodies() -> None:
    if not ENDPOINT_LINKS.exists():
        return
    text = ENDPOINT_LINKS.read_text()
    assert "async def _resolve_vendor_department_and_access" not in text
    assert "async def _issue_link_department_ids" not in text


def test_workflow_source_validation_no_longer_owns_helper_bodies() -> None:
    if not WORKFLOW_SOURCE.exists():
        return
    text = WORKFLOW_SOURCE.read_text()
    assert "async def issue_link_department_ids" not in text
    assert "async def resolve_vendor_department_and_access" not in text


def test_canonical_bodies_remain_in_register_source_mutation() -> None:
    text = REGISTER_MUTATION.read_text()
    assert "async def issue_link_department_ids" in text
    assert "async def resolve_vendor_department_and_access" in text
```

**Expected**: RED on Tests 1-2.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/services/_issue_workflow/update_plans.py:9-14` — change imports so `issue_link_department_ids` is imported from `app.services._issue_register.source_mutation` (alongside the three names already imported there). Drop the `_issue_workflow.source_validation` import for `issue_link_department_ids`.
- `backend/app/api/v1/endpoints/issues/links.py:13-19` — replace `_resolve_vendor_department_and_access` with `from app.services._issue_register.source_mutation import resolve_vendor_department_and_access` (drop underscore prefix); rename call site at `:68`.
- `backend/app/api/v1/endpoints/issues/_shared/__init__.py:10,57,66` — drop `_issue_link_department_ids` and `_resolve_vendor_department_and_access` from import block and `__all__` (overlaps with #30; in-scope edit here is just the link-helper rows).

**Files to delete**:
- `backend/app/api/v1/endpoints/issues/_shared/links.py` (entire file `:1-81`).
- If `backend/app/services/_issue_workflow/source_validation.py` is empty after removing `issue_link_department_ids` and `resolve_vendor_department_and_access`, `git rm` it (commit b of #8 may already do this; coordinate to avoid double-edit).

**Files to create**: the new lock test above.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_issue_link_helpers_have_one_canonical_home_red.py -q
```

Pass.

#### Lock/TOML/Contract updates (same commit)

- New structural lock from Step 1.
- Capability contract `docs/security/authorization-capability-contract.md:128` and `.json:629` — drop `backend/app/api/v1/endpoints/issues/_shared/links.py` from `service_policy` enumeration. Confirm `backend/app/services/_issue_register/` token remains. Atomic edit.
- No TOML allowlist edits.

#### README / doc updates (same commit)

- `backend/app/api/v1/endpoints/issues/_shared/README.md:12` — strike `links.py` from Contents list.
- `backend/app/services/_issue_register/README.md` — append a Contents bullet: `- source_mutation.py - canonical owner of vendor/department resolution and IssueLink department aggregation`.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_issue_link_helpers_have_one_canonical_home_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_issue_workflow.py tests/backend/pytest/api/v1/test_issues_crud_api.py tests/backend/pytest/api/v1/test_issues_rbac_api.py -q` — domain suite green.
3. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "issue"` — locks green.
4. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `ruff check backend/app/api/v1/endpoints/issues backend/app/services` — clean.
7. `mypy backend/app/api/v1/endpoints/issues backend/app/services/_issue_register backend/app/services/_issue_workflow` — clean.

#### Commit boundary

Single commit titled: `S4.3: collapse triplicate source-mutation helpers into _issue_register/source_mutation`.

#### Rollback

- Class: **CROSS-DOMAIN** (#8 prereq, #30 dependent) per `plan-loop-3-03-rollback-register.md:329`.
- Procedure:
  1. **Revert #30 first** if it landed.
  2. `git revert <SHA>` to restore the triplicate.
  3. Drop the new lock test.
  4. Restore `_issue_register/README.md` Contents bullet.
  5. Restore capability contract `_shared/links.py` token at `.md:128` and `.json:629`.
  6. Run validator — exit 0 required.
- Estimated revert time: 30 min.

#### Effort & Risk

- Estimated time: 6h (chain-coordination, contract atomic edit, file delete, repoint).
- Risk: MEDIUM — chain item; partial revert leaves duplicate helpers + stale lock. Per `plan-loop-3-04-risk-register.md:542-554`, the `#2 → #8 → #28 → #30` chain is the longest critical path.
- Mitigations: structural lock catches re-introduction; capability validator pins service_policy enumeration; #30 follows in next slot to clean the now-dead barrel entries.

---

### Item #52 (Section 4) — #30 — `issues/_shared/__init__.py` underscore re-export pruning

**Wave**: 5  | **Slot**: v2 Seq 54  | **Effort**: M (~6h)  | **Priority**: P2  | **Domain**: issues

**Dependencies**: **#14 (Seq 12, Wave 2), #27 (Seq 51, Wave 5), #28 (Seq 53, Wave 5)**. Terminal node of `#2 → #8 → #28 → #30` chain.
**Atomic with**: none.
**Validator?**: yes — capability contract may need updates if `_shared/serialization.py` is deleted.

#### Why this work

`backend/app/api/v1/endpoints/issues/_shared/__init__.py` carries 36 entries / 13 public / 23 underscored. Phase 4 corrected counts: **14 prunable + 9 to re-point**. The 2 `_notify_*` test imports go through SUBMODULE (`from ...notifications import ...`), NOT through the barrel — so #30 alone does not break the test, but #14 must have already removed the underlying functions. Audit ID = #30 (S4.10); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 54 (`plan-loop-3-07-integration-v2.md:397`).
- [ ] Confirm prerequisites complete: #14, #27, #28 architecture locks all GREEN.
- [ ] Read latest state of `backend/app/api/v1/endpoints/issues/_shared/__init__.py`, all 5 endpoint consumer files (`crud/{contextual,create,detail}.py`, `links.py`, plus `crud/list.py` if any underscore imports remain).
- [ ] Run grep for the 23 underscored names against `backend/app/api/v1/endpoints/issues/` — confirm only 5 remaining files import them.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/architecture/test_issue_shared_barrel_has_no_underscored_reexports_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
from __future__ import annotations
import pytest

pytestmark = pytest.mark.contract


def test_issue_shared_barrel_no_underscored_reexports() -> None:
    from app.api.v1.endpoints.issues import _shared as barrel

    underscored = sorted(name for name in barrel.__all__ if name.startswith("_"))
    assert underscored == [], f"barrel must not re-export underscored names: {underscored}"


def test_issue_shared_barrel_explicit_guards() -> None:
    from app.api.v1.endpoints.issues import _shared as barrel

    for forbidden in (
        "_active_exception",
        "_ensure_owner_assignable",
        "_get_active_user_with_permissions",
        "_get_issue_with_relations",
        "_get_readable_issue_or_404",
        "_get_writable_issue_or_404",
        "_issue_link_department_ids",
        "_issue_source_link",
        "_label_or_fallback",
        "_link_display",
        "_link_matches_issue_source",
        "_notify_exception_approved",
        "_notify_exception_requested",
        "_notify_issue_assigned",
        "_resolve_user_name",
        "_resolve_vendor_department_and_access",
        "_serialize_exception",
        "_serialize_exception_with_user_names",
        "_serialize_issue_link",
        "_serialize_issue_read",
        "_serialize_issue_summary",
        "_serialize_remediation",
        "_validate_user_exists",
    ):
        assert forbidden not in barrel.__all__, f"{forbidden!r} re-introduced in barrel"
```

**Expected**: RED — `__all__` currently lists 23 underscored names (`:51-73`).

#### TDD Step 2 — Implement Change

**Per-name disposition** (Phase 4 corrected ledger of 36 = 13 public + 23 underscored = 14 prunable + 9 to re-point):

**Drop (14 underscored, no live external consumer after #14/#27/#28)** — remove from `__all__` and import block:
1. `_active_exception` (`:19, :51`).
2. `_get_active_user_with_permissions` (`:13, :53`) — drop unless `notifications.py` retains it.
3. `_issue_link_department_ids` (`:10, :57`) — body deleted by #28.
4. `_label_or_fallback` (`:21, :59`).
5. `_link_display` (`:22, :60`).
6. `_notify_exception_approved` (`:14, :62`) — body deleted by #14.
7. `_notify_exception_requested` (`:15, :63`) — body deleted by #14.
8. `_notify_issue_assigned` (`:16, :64`) — body deleted by #14.
9. `_resolve_user_name` (`:24, :65`).
10. `_serialize_exception` (`:25, :67`).
11. `_serialize_exception_with_user_names` (`:26, :68`).
12. `_serialize_issue_read` (`:28, :70`).
13. `_serialize_issue_summary` (`:29, :71`).
14. `_serialize_remediation` (`:30, :72`).

**Re-point (9 with live external consumers)** — repoint consumers, then remove from barrel:
15. `_ensure_owner_assignable` — consumers `crud/create.py:20,51`, `crud/contextual.py:19,41`. Repoint to `from app.services._issue_workflow.assignment import ensure_owner_assignable`; rename call sites.
16. `_validate_user_exists` — consumers `crud/create.py:22,50`, `crud/contextual.py:21,40`. Repoint to `from app.services._issue_workflow.assignment import validate_user_exists`; rename call sites.
17. `_get_issue_with_relations` — already deleted by #27; consumers already repointed.
18. `_get_readable_issue_or_404` — already deleted by #27; consumers already repointed.
19. `_get_writable_issue_or_404` — already deleted by #27; consumers already repointed.
20. `_resolve_vendor_department_and_access` — already deleted by #28; consumers already repointed.
21. `_issue_source_link` — consumer `links.py:15,134`. Recommended: `from app.services._issue_register.linked_context import issue_source_link` and rename call site.
22. `_link_matches_issue_source` — consumer `links.py:16,135`. Same pattern.
23. `_serialize_issue_link` — consumer `links.py:18,101,118`. Promote `_serialize_issue_link` to public `serialize_issue_link` in `_issue_register/serialization.py` and import the public name.

**Keep public (13)** — leave intact in `__all__`: `UNKNOWN_CONTROL_LABEL`, `UNKNOWN_DEPARTMENT_LABEL`, `UNKNOWN_EXECUTION_LABEL`, `UNKNOWN_KRI_LABEL`, `UNKNOWN_RISK_LABEL`, `UNKNOWN_USER_LABEL`, `UNKNOWN_VENDOR_LABEL`, `ResolvedIssueSource`, `build_issue_linked_visibility`, `clear_issue_source_links`, `ensure_issue_source_link`, `resolve_contextual_issue_source`, `resolve_issue_source_metadata`.

**Files to edit**:
- `backend/app/api/v1/endpoints/issues/_shared/__init__.py` — full rewrite per the disposition table above. Final `__all__` = 13 items.
- `backend/app/api/v1/endpoints/issues/crud/create.py:20-22,50-51` — repoint to `_issue_workflow.assignment`; drop underscores at call sites.
- `backend/app/api/v1/endpoints/issues/crud/contextual.py:19-21,40-41` — same pattern.
- `backend/app/api/v1/endpoints/issues/links.py:13-19,68,80,101,118,128,134-135` — repoint each remaining underscore name; rename call sites.
- `backend/app/api/v1/endpoints/issues/_shared/validation.py` — delete the file if all consumers now import directly from `_issue_workflow.assignment` (recommended).
- `backend/app/api/v1/endpoints/issues/_shared/serialization.py` — drop underscored re-exports; if all consumers reach `_issue_register` directly, the file shrinks or is deleted.

**Files to delete (recommended)**:
- `backend/app/api/v1/endpoints/issues/_shared/validation.py` (now empty after #8 + #30).
- `backend/app/api/v1/endpoints/issues/_shared/serialization.py` (if no surviving consumers).

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_issue_shared_barrel_has_no_underscored_reexports_red.py -q
```

Pass.

#### Lock/TOML/Contract updates (same commit)

- Structural lock from Step 1.
- Capability contract `md:128` and `.json:629` — confirm `_shared/source.py` and `_shared/serialization.py` still exist; if deleted, drop the citation atomically.
- No TOML allowlist edits.

#### README / doc updates (same commit)

- `backend/app/api/v1/endpoints/issues/_shared/README.md` — refresh Contents.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_issue_shared_barrel_has_no_underscored_reexports_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_issue_workflow.py tests/backend/pytest/api/v1/test_issues_crud_api.py tests/backend/pytest/api/v1/test_issues_rbac_api.py -q` — domain suite green.
3. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "issue"` — locks green.
4. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `ruff check backend/app/api/v1/endpoints/issues` — clean.
7. `mypy backend/app/api/v1/endpoints/issues` — clean.

#### Commit boundary

Single commit titled: `S4.10: prune issues/_shared barrel underscored re-exports; rename survivors to public`.

#### Rollback

- Class: **CROSS-DOMAIN** (multi-prereq) per `plan-loop-3-03-rollback-register.md:352`.
- Procedure:
  1. `git revert <SHA>` to restore pruned underscored re-exports.
  2. Drop the new lock test.
  3. Restore `_shared/README.md` Contents block.
  4. Restore deleted `_shared/{validation,serialization}.py` if their bodies were removed.
  5. Allowlist update if applicable.
- Estimated revert time: 30 min.

#### Effort & Risk

- Estimated time: 6h (5 endpoint files × repoint + barrel + lock + README + capability contract).
- Risk: MEDIUM — broad consumer surface; partial revert breaks imports across issue endpoints.
- Mitigations: structural lock + per-name guard list catches re-introduction; consumer count verified via grep before commit.

---

### Item #53 (Section 4) — #16 — Remove reports legacy-excel tombstones (410s)

**Wave**: 5  | **Slot**: v2 Seq 55  | **Effort**: M (~2h)  | **Priority**: P2  | **Domain**: vendor (reports)

**Dependencies**: none.
**Atomic with**: none.
**Validator?**: no.

#### Why this work

Four tombstone routes in `backend/app/api/v1/endpoints/reports/`:
- `legacy_excel.py:14` `@router.get("/controls/excel")`.
- `legacy_excel.py:23` `@router.get("/risks/excel")`.
- `summary_excel.py:97` `@router.get("/summary/excel")`.
- `audit_trail_excel.py:133` `@router.get("/audit-trail/excel")`.

KEEP LIVE the `xlsx`-rejection at:
- `audit_trail_excel.py:142` `@router.get("/audit-trail/export")` — calls `resolve_export_format(format, ...)` which raises `excel_export_removed` if `format == "xlsx"`.
- `summary_excel.py:106` `@router.get("/summary/export")` — same shape.

Audit ID = #16 (S8.10); developer verdict = ACCEPT (P1).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 55 (`plan-loop-3-07-integration-v2.md:398`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `backend/app/api/v1/endpoints/reports/legacy_excel.py`, `summary_excel.py:97-103`, `audit_trail_excel.py:133-139`, `__init__.py:11,16`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/api/v1/test_reports_excel_tombstones_removed_red.py`

```python
"""RED: 4 legacy /excel tombstones removed; /export?format=xlsx rejection preserved."""
import pytest

pytestmark = pytest.mark.contract


@pytest.mark.asyncio
async def test_excel_tombstones_return_404(client_factory) -> None:
    async with client_factory() as client:
        for path in (
            "/api/v1/reports/controls/excel",
            "/api/v1/reports/risks/excel",
            "/api/v1/reports/summary/excel",
            "/api/v1/reports/audit-trail/excel",
        ):
            response = await client.get(path)
            assert response.status_code == 404, path


@pytest.mark.asyncio
async def test_export_xlsx_format_still_rejected(client_factory) -> None:
    async with client_factory() as client:
        for path in (
            "/api/v1/reports/audit-trail/export?format=xlsx",
            "/api/v1/reports/summary/export?format=xlsx",
        ):
            response = await client.get(path)
            assert response.status_code == 410
            assert response.json()["detail"]["code"] == "excel_export_removed"
```

**Expected**: RED — tombstone routes still return 410 (or whatever they return today).

#### TDD Step 2 — Implement Change

**Files to delete**:
- `backend/app/api/v1/endpoints/reports/legacy_excel.py` (entire file: 30 lines).

**Files to edit**:
- `backend/app/api/v1/endpoints/reports/__init__.py:11,16` — DELETE `legacy_router` import + `include_router` line.
- `backend/app/api/v1/endpoints/reports/summary_excel.py:97-103` — DELETE the `download_summary_excel` function (7 lines incl. decorator).
- `backend/app/api/v1/endpoints/reports/audit_trail_excel.py:133-139` — DELETE the `download_audit_trail_excel` function.
- `tests/backend/pytest/test_protocol_contract_probe.py:26,108` — drop `/api/v1/reports/controls/excel` from probe path list; response excerpt expectation moves to `/api/v1/reports/controls/export?format=xlsx`.
- `tests/backend/pytest/test_openapi_contract_parity.py:26-29` — drop the four `/excel` paths from OpenAPI parity list (keep `/export` paths).
- `tests/backend/pytest/test_reports_rbac.py:193,369,379,391` — repoint each `/api/v1/reports/<x>/excel` GET to `/api/v1/reports/<x>/export?format=xlsx`. Status code stays 410, `detail.code` stays `excel_export_removed`.
- `tests/backend/pytest/api/v1/test_reports_audit.py:274` — repoint `/api/v1/reports/audit-trail/excel` to `/api/v1/reports/audit-trail/export?format=xlsx`.
- `tests/backend/pytest/test_vendor_reports.py:53,57` — already exercises `/vendor-reports/<x>?format=xlsx`; no edit (different routes).

**Files to create**: the new RED test above.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/api/v1/test_reports_excel_tombstones_removed_red.py -x
```

Pass (404 for tombstones, 410 for `/export?format=xlsx`).

#### Lock/TOML/Contract updates (same commit)

- `backend/app/api/v1/endpoints/reports/__init__.py` — `legacy_router` removed (1 import + 1 include_router).
- No allowlist toml entries.

#### README / doc updates (same commit)

- `backend/app/api/v1/endpoints/reports/README.md` — strike `legacy_excel.py` row from route inventory.
- `docs/BUSINESS_LOGIC.md:758` — verify "format = csv (xlsx returns 410 excel_export_removed)" remains accurate.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/api/v1/test_reports_excel_tombstones_removed_red.py -x` — must pass.
2. `pytest tests/backend/pytest/test_protocol_contract_probe.py tests/backend/pytest/test_openapi_contract_parity.py tests/backend/pytest/test_reports_rbac.py tests/backend/pytest/api/v1/test_reports_audit.py -x` — must pass.
3. `ruff check backend tests` — clean.
4. `mypy backend/app` — clean.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

ONE commit titled: `refactor(reports): remove 4 excel tombstones; preserve xlsx rejection on /export`.

#### Rollback

- Class: **TRIVIAL** (no data, no schema; FE never called these — they 410'd anyway).
- Procedure:
  1. `git revert <SHA>` — restores routes.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: 2h (test repointing is the bulk).
- Risk: LOW — no consumer surface (routes 410'd already).
- Mitigations: behavioural test pins both 404 (tombstones) and 410 (`/export?format=xlsx`); existing OpenAPI/RBAC suites updated atomically.

---

### Item #54 (Section 4) — #38 — Move 8 inline endpoint Pydantic models to schemas

**Wave**: 5  | **Slot**: v2 Seq 56  | **Effort**: M (~4h)  | **Priority**: P2  | **Domain**: endpoints

**Dependencies**: **#10 (Seq 4, Wave 1)** — presence-lock guarantees `riskhub_questionnaires.py` isn't deleted; FE Zod mirror bundled per Correction G.
**Atomic with**: none.
**Validator?**: no.

#### Why this work

8 inline models confirmed at:
- `health.py:16` `class LivenessResponse(BaseModel):`.
- `health.py:22` `class ReadinessResponse(BaseModel):`.
- `health.py:32` `class HealthResponse(ReadinessResponse):`.
- `preferences.py:15` `class PreferencesUpdate(BaseModel):`.
- `preferences.py:36` `class PreferencesResponse(BaseModel):`.
- `riskhub_questionnaires.py:17` `class RiskFilters(BaseModel):`.
- `riskhub_questionnaires.py:24` `class BatchSendRequest(BaseModel):`.
- `riskhub_questionnaires.py:30` `class BatchSendResponse(BaseModel):`.

**Phase 4 correction**: rename `RiskFilters` → `BatchSendRiskFilters` to avoid future collision (per `verify-loop-b-07-endpoints.md:42-49,156-157`). Audit ID = #38 (S8.6); developer verdict = ACCEPT (P2).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 56 (`plan-loop-3-07-integration-v2.md:399`).
- [ ] Confirm prerequisites complete: #10 lock GREEN.
- [ ] Read latest state of the 3 endpoint files: `health.py:16-35`, `preferences.py:15-40`, `riskhub_questionnaires.py:17-34,37-42`.
- [ ] Verify no `from app.api.v1.endpoints.riskhub_questionnaires import RiskFilters` consumer exists in repo.
- [ ] Verify FE Zod mirrors at `frontend/src/services/api/schemas/riskHub.ts` field names unchanged.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/architecture/test_endpoint_inline_pydantic_evicted_red.py`

```python
"""Lock that endpoint modules import schemas, not define them inline."""
from __future__ import annotations
import ast
import importlib
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]

EVICTED_FROM_HEALTH = {
    "LivenessResponse",
    "ReadinessResponse",
    "HealthResponse",
}
EVICTED_FROM_PREFERENCES = {
    "PreferencesUpdate",
    "PreferencesResponse",
}
EVICTED_FROM_RISKHUB_Q = {
    "BatchSendRiskFilters",
    "BatchSendRequest",
    "BatchSendResponse",
}


def _module_classnames(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    return {
        node.name for node in ast.walk(tree)
        if isinstance(node, ast.ClassDef)
    }


def test_health_endpoint_does_not_define_evicted_classes() -> None:
    path = REPO_ROOT / "backend/app/api/v1/endpoints/health.py"
    assert _module_classnames(path).isdisjoint(EVICTED_FROM_HEALTH)


def test_preferences_endpoint_does_not_define_evicted_classes() -> None:
    path = REPO_ROOT / "backend/app/api/v1/endpoints/preferences.py"
    assert _module_classnames(path).isdisjoint(EVICTED_FROM_PREFERENCES)


def test_riskhub_questionnaires_endpoint_does_not_define_evicted_classes() -> None:
    path = REPO_ROOT / "backend/app/api/v1/endpoints/riskhub_questionnaires.py"
    assert _module_classnames(path).isdisjoint(
        EVICTED_FROM_RISKHUB_Q | {"RiskFilters"}
    )


def test_schema_modules_export_evicted_classes() -> None:
    health_schema = importlib.import_module("app.schemas.health")
    preferences_schema = importlib.import_module("app.schemas.preferences")
    riskhub_schema = importlib.import_module("app.schemas.riskhub")
    for name in EVICTED_FROM_HEALTH:
        assert hasattr(health_schema, name)
    for name in EVICTED_FROM_PREFERENCES:
        assert hasattr(preferences_schema, name)
    for name in EVICTED_FROM_RISKHUB_Q:
        assert hasattr(riskhub_schema, name)
```

**Expected**: RED on all four assertions (classes still inline; new schema modules don't exist; `RiskFilters` not yet renamed).

#### TDD Step 2 — Implement Change

**Files to create**:
1. `backend/app/schemas/health.py`:
   ```python
   """Health/readiness/liveness response schemas."""
   from __future__ import annotations
   from typing import Literal
   from pydantic import BaseModel


   class LivenessResponse(BaseModel):
       status: Literal["alive"]


   class ReadinessResponse(BaseModel):
       ready: bool
       database: Literal["connected", "disconnected"]
       redis: Literal["connected", "disconnected", "disabled"]
       scheduler_role: Literal["disabled", "leader", "follower"]
       scheduler_status: Literal["disabled", "leader_running", "follower_ready", "error"]


   class HealthResponse(ReadinessResponse):
       status: Literal["healthy", "degraded"]
   ```

2. `backend/app/schemas/preferences.py`:
   ```python
   """User preferences request/response schemas."""
   from __future__ import annotations
   from pydantic import BaseModel, field_validator


   class PreferencesUpdate(BaseModel):
       theme: str | None = None
       language: str | None = None

       @field_validator("theme")
       @classmethod
       def validate_theme(cls, v: str | None) -> str | None:
           if v is not None and v not in ("light", "dark", "riskhub"):
               raise ValueError("Invalid theme. Must be one of: light, dark, riskhub")
           return v

       @field_validator("language")
       @classmethod
       def validate_language(cls, v: str | None) -> str | None:
           if v is not None and v not in ("en", "cs"):
               raise ValueError("Invalid language. Must be one of: en, cs")
           return v


   class PreferencesResponse(BaseModel):
       theme: str
       language: str
   ```

3. Append to `backend/app/schemas/riskhub.py`:
   ```python
   # ============================================================================
   # Risk Hub Questionnaire Batch-Send Schemas
   # ============================================================================


   class BatchSendRiskFilters(BaseModel):
       """Filter criteria for batch questionnaire send (renamed from RiskFilters)."""
       department_id: int | None = None
       process: str | None = None
       category: str | None = None
       status: str | None = None


   class BatchSendRequest(BaseModel):
       select_all: bool
       risk_ids: list[int] | None = None
       filters: BatchSendRiskFilters | None = None


   class BatchSendResponse(BaseModel):
       created_count: int
       skipped_no_owner: list[int]
       skipped_open_exists: list[int]
       errors: list[str]
   ```

**Files to edit**:
- `backend/app/api/v1/endpoints/health.py:16-35` — delete inline classes; add `from app.schemas.health import HealthResponse, LivenessResponse, ReadinessResponse`. Drop unused `pydantic.BaseModel` and `Literal` imports.
- `backend/app/api/v1/endpoints/preferences.py:15-40` — delete inline classes; add `from app.schemas.preferences import PreferencesResponse, PreferencesUpdate`. Drop unused imports.
- `backend/app/api/v1/endpoints/riskhub_questionnaires.py:17-34` — delete inline classes; add `from app.schemas.riskhub import BatchSendRequest, BatchSendResponse, BatchSendRiskFilters`. Drop `from pydantic import BaseModel` import. Internal references at `:39, :42` (`payload: BatchSendRequest`, `response_model=BatchSendResponse`) already use the names; ensure import resolves.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_endpoint_inline_pydantic_evicted_red.py -q
pytest tests/backend/pytest/api/v1/test_riskhub_questionnaires.py tests/backend/pytest/test_health.py -q
```

All pass.

#### Lock/TOML/Contract updates (same commit)

- New architecture lock IS the contract.
- Frontend Zod mirrors at `frontend/src/services/api/schemas/riskHub.ts` (e.g. `batchSendQuestionnairesResponseSchema`) — verify field names unchanged (only the class identifier moves; wire payload identical).
- No TOML edits.

#### README / doc updates (same commit)

- None required (mechanical move).

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_endpoint_inline_pydantic_evicted_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_riskhub_questionnaires.py -q` — behavioral parity.
3. `pytest tests/backend/pytest/test_health.py -q` — must pass.
4. `cd frontend && npx tsc --noEmit` — Zod mirror sanity.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

ONE commit titled: `S8.6: move 8 inline endpoint Pydantic models to schemas (rename RiskFilters → BatchSendRiskFilters)`. (Optional 3-commit split per endpoint module if review pressure favors smaller diffs.)

#### Rollback

- Class: **LOCK-RATCHET**.
- Procedure:
  1. `git revert <SHA>` — restores inline classes; schemas can stay as orphan files (harmless) or full revert.
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: 4h (3 schema files + 3 endpoint edits + test + verification).
- Risk: LOW — pure mechanical move; FE Zod mirrors verify field-name parity.
- Mitigations: structural lock catches re-introduction; OpenAPI parity preserved (only class moved); rename collision resolved.

---

### Item #55 (Section 4) — #31 — Extract vendor reporting row formatters

**Wave**: 5  | **Slot**: v2 Seq 57  | **Effort**: M (~1.5h)  | **Priority**: P3  | **Domain**: vendor

**Dependencies**: none.
**Atomic with**: none.
**Validator?**: no.

#### Why this work

`backend/app/api/v1/endpoints/vendor_reports.py:36-119` carries `_annual_report_rows` (`:36-73`) and `_dora_register_rows` (`:76-119`) — pure pure-data row formatters with no FastAPI/DB coupling. Recipe moves them into `backend/app/services/_vendor_governance/reports.py:7` (stub already exists at the destination; `VendorReportDefinition` lives there). The endpoint then imports `from app.services._vendor_governance.reports import annual_report_rows, dora_register_rows` (rename drops leading underscore — they become public package-internal names since used by sibling endpoint module). Audit ID = #31 (S5.5); developer verdict = ACCEPT (P3).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 57 (`plan-loop-3-07-integration-v2.md:400`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `backend/app/api/v1/endpoints/vendor_reports.py:36-119, :146, :170`, `backend/app/services/_vendor_governance/reports.py:1-12` (stub).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/architecture/test_vendor_governance_reports_extraction_red.py`

```python
"""RED: row formatters live in _vendor_governance.reports, not in the endpoint."""
import inspect
import pytest

pytestmark = pytest.mark.contract


def test_annual_report_rows_lives_in_vendor_governance() -> None:
    from app.services._vendor_governance.reports import annual_report_rows
    assert callable(annual_report_rows)


def test_dora_register_rows_lives_in_vendor_governance() -> None:
    from app.services._vendor_governance.reports import dora_register_rows
    assert callable(dora_register_rows)


def test_endpoint_does_not_redefine_row_formatters() -> None:
    from app.api.v1.endpoints import vendor_reports as ep
    src = inspect.getsource(ep)
    assert "def _annual_report_rows" not in src
    assert "def _dora_register_rows" not in src
    assert "from app.services._vendor_governance.reports import" in src


def test_annual_headers_preserved() -> None:
    from app.services._vendor_governance.reports import annual_report_rows
    sig = inspect.signature(annual_report_rows)
    assert list(sig.parameters) == ["report"]
```

**Expected**: RED — formatters still in endpoint.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/services/_vendor_governance/reports.py` — append after the existing `VendorReportDefinition`:
  ```python
  def annual_report_rows(report) -> tuple[list[str], list[list[object]]]:
      headers = [
          "Vendor ID", "Name", "Legal Name", "Vendor Type", "Department",
          "Owner", "Process", "Subprocess", "Supports Core Function",
          "DORA Relevant", "Significant Vendor", "Risk Score (1-5)",
          "Report Year", "Generated At",
      ]
      rows: list[list[object]] = []
      for vendor in report.vendors:
          rows.append(
              [
                  vendor.vendor_id, vendor.name, vendor.legal_name or "",
                  vendor.vendor_type, vendor.department_name or "",
                  vendor.outsourcing_owner_name or "", vendor.process,
                  vendor.subprocess or "",
                  bool(vendor.supports_important_core_insurance_function),
                  bool(vendor.dora_relevant), bool(vendor.is_significant_vendor),
                  vendor.risk_score_1_5, report.process_evaluation.year,
                  report.generated_at.isoformat(),
              ]
          )
      return headers, rows


  def dora_register_rows(rows) -> tuple[list[str], list[list[object]]]:
      headers = [
          "vendor_id", "name", "legal_name", "registration_id", "vendor_type",
          "dora_relevant", "is_significant_vendor",
          "supports_important_core_insurance_function", "risk_score_1_5",
          "outsourcing_owner_user_id", "outsourcing_owner_name",
          "department_id", "department_name", "process", "subprocess",
          "replaceability", "has_alternative_providers",
      ]
      data_rows: list[list[object]] = []
      for row in rows:
          data_rows.append(
              [
                  row.vendor_id, row.name, row.legal_name or "",
                  row.registration_id or "", row.vendor_type,
                  bool(row.dora_relevant), bool(row.is_significant_vendor),
                  bool(row.supports_important_core_insurance_function),
                  row.risk_score_1_5, row.outsourcing_owner_user_id or "",
                  row.outsourcing_owner_name or "", row.department_id or "",
                  row.department_name or "", row.process, row.subprocess or "",
                  row.replaceability or "", bool(row.has_alternative_providers),
              ]
          )
      return headers, data_rows
  ```
- `backend/app/api/v1/endpoints/vendor_reports.py`:
  - `:36-119` — DELETE both `_annual_report_rows` and `_dora_register_rows` definitions.
  - After `:26` imports add: `from app.services._vendor_governance.reports import annual_report_rows, dora_register_rows`.
  - `:146` — change `_annual_report_rows(report)` to `annual_report_rows(report)`.
  - `:170` — change `_dora_register_rows(rows)` to `dora_register_rows(rows)`.

**Files to create**: the new lock test above.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_vendor_governance_reports_extraction_red.py -q
pytest tests/backend/pytest/test_vendor_reports.py -q
```

All pass.

#### Lock/TOML/Contract updates (same commit)

- New lock test above.
- No TOML edits.

#### README / doc updates (same commit)

- `backend/app/services/_vendor_governance/__init__.py` — if file currently re-exports `VendorReportDefinition` only, add the two new function names. Verify by reading file.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_vendor_governance_reports_extraction_red.py -q` — must pass.
2. `pytest tests/backend/pytest/test_vendor_reports.py -q` — must pass.
3. `ruff check backend tests` — clean.
4. `mypy backend/app` — clean.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

ONE commit titled: `refactor(vendor-reports): extract row formatters to _vendor_governance.reports`.

#### Rollback

- Class: **LOCK-RATCHET** (code-shape-only).
- Procedure:
  1. `git revert <SHA>` — restores endpoint definitions and reverts service-side appends.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: 1.5h (move + rename + endpoint edits + test).
- Risk: LOW — pure pure-data formatters; no FastAPI/DB coupling.
- Mitigations: lock test pins canonical home + signature; behavior pinned by existing `test_vendor_reports.py`.

---

### Item #56 (Section 4) — #43 — Audit adapter-emitter helper (additive)

**Wave**: 5  | **Slot**: v2 Seq 59  | **Effort**: M (~6h)  | **Priority**: P3  | **Domain**: endpoints (audit)

**Dependencies**: none.
**Atomic with**: none. Cross-domain item (audit adapter — used by 6 audit modules).
**Validator?**: no.

#### Why this work

`backend/app/core/audit/_audit_matrix.toml` declares **37 adapter rows** (Phase 4 verified count). Each row maps a `(module, function)` pair to one of the 6 audit modules: `risk.py`, `control.py`, `kri.py`, `issue.py`, `approval.py`, `vendor.py`. Recipe adds an additive `emit_adapter(...)` helper at `backend/app/core/audit/_emit.py` that wraps the existing `log_activity` call boilerplate. **Phase 6 corrections**:
- The new RED test must AST-parse `emit_adapter` calls and assert `safe_entity_label` keyword present.
- The lock cite is `test_w7_audit_adapter_completeness_red.py:33-39` (lines 33-39, NOT just `:13`).

Helper MUST be additive: every named function (`control_created`, `issue_assigned`, etc.) MUST remain at module scope. Helper is invoked INSIDE each existing `def`, never as a replacement for it. Audit ID = #43 (BE-N4); developer verdict = ACCEPT (P3).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 59 (`plan-loop-3-07-integration-v2.md:402`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `backend/app/core/audit/_audit_matrix.toml`, `backend/app/core/audit/{risk,control,kri,issue,approval,vendor}.py`.
- [ ] Run `python3 -c "import tomllib; print(len(tomllib.load(open('backend/app/core/audit/_audit_matrix.toml','rb'))['adapter']))"` — confirm 37.
- [ ] Read `tests/backend/pytest/architecture/test_w7_audit_adapter_completeness_red.py:33-39` and `test_w7_audit_safe_entity_label_red.py` (the two existing locks).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/architecture/test_audit_adapter_emitter_helper_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
from __future__ import annotations
import ast
import inspect
import tomllib
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
AUDIT_ROOT = REPO_ROOT / "backend" / "app" / "core" / "audit"
MATRIX_PATH = AUDIT_ROOT / "_audit_matrix.toml"
EMIT_PATH = AUDIT_ROOT / "_emit.py"


def _load_matrix() -> list[dict[str, str]]:
    with MATRIX_PATH.open("rb") as handle:
        return tomllib.load(handle)["adapter"]


def _module_function_source(module_name: str, function_name: str) -> str | None:
    module_path = AUDIT_ROOT / f"{module_name}.py"
    if not module_path.exists():
        return None
    tree = ast.parse(module_path.read_text())
    for node in tree.body:
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef) and node.name == function_name:
            return ast.unparse(node)
    return None


def test_emit_helper_module_exists_with_expected_signature() -> None:
    assert EMIT_PATH.exists(), "_emit.py must be created"
    from app.core.audit import _emit

    sig = inspect.signature(_emit.emit_adapter)
    expected = {
        "db",
        "entity_type",
        "entity_id",
        "entity_name",
        "safe_entity_label",
        "action",
        "actor",
        "department_id",
        "changes",
        "description",
        "log_activity_func",
    }
    assert expected <= set(sig.parameters)


def test_each_adapter_row_invokes_emit_helper() -> None:
    rows = _load_matrix()
    assert len(rows) == 37, f"expected 37 adapter rows, got {len(rows)}"
    missing = []
    for entry in rows:
        source = _module_function_source(entry["module"], entry["function"])
        if source is None:
            missing.append(f"{entry['module']}.{entry['function']} (function not found)")
            continue
        if "emit_adapter(" not in source:
            missing.append(f"{entry['module']}.{entry['function']} (no emit_adapter call)")
    assert missing == [], f"functions not yet using helper: {missing}"


def test_emit_adapter_calls_carry_safe_entity_label_kwarg() -> None:
    """Phase 6 critical: AST-parse each emit_adapter call; assert safe_entity_label kw is present."""
    offenders: list[str] = []
    for entry in _load_matrix():
        module_path = AUDIT_ROOT / f"{entry['module']}.py"
        if not module_path.exists():
            continue
        tree = ast.parse(module_path.read_text())
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "emit_adapter"
            ):
                kw_names = {kw.arg for kw in (node.keywords or []) if kw.arg}
                if "safe_entity_label" not in kw_names:
                    offenders.append(
                        f"{entry['module']}:{node.lineno} (missing safe_entity_label kw)"
                    )
    assert offenders == [], f"emit_adapter call without safe_entity_label: {offenders}"
```

> **Phase 6 correction**: cite `tests/backend/pytest/architecture/test_w7_audit_adapter_completeness_red.py:33-39` as the lines that require a `def` per row at module level — those lines are the upstream invariant the new helper MUST preserve.

Add a behavior pin in `tests/backend/pytest/test_w7_audit_*` family for one canonical adapter (e.g. `control_created`).

**Expected**: RED — helper does not exist; no row uses `emit_adapter`.

#### TDD Step 2 — Implement Change

**Files to create**:
- `backend/app/core/audit/_emit.py`:
  ```python
  from __future__ import annotations
  from collections.abc import Mapping
  from sqlalchemy.ext.asyncio import AsyncSession
  from app.core.activity_logger import log_activity
  from app.core.audit.types import AuditLogActivity
  from app.models import User
  from app.models.activity_log import ActivityAction, ActivityEntityType


  async def emit_adapter(
      db: AsyncSession,
      *,
      entity_type: ActivityEntityType,
      entity_id: int,
      entity_name: str,
      safe_entity_label: str,
      action: ActivityAction,
      actor: User,
      department_id: int | None,
      changes: dict[str, dict[str, object]] | Mapping[str, object] | None = None,
      description: str | None = None,
      log_activity_func: AuditLogActivity = log_activity,
      safe_description: str | None = None,
      safe_description_siem: str | None = None,
  ) -> None:
      kwargs: dict[str, object] = {
          "entity_type": entity_type,
          "entity_id": entity_id,
          "entity_name": entity_name,
          "safe_entity_label": safe_entity_label,
          "action": action,
          "actor": actor,
          "department_id": department_id,
      }
      if changes is not None:
          kwargs["changes"] = changes
      if description is not None:
          kwargs["description"] = description
      if safe_description is not None:
          kwargs["safe_description"] = safe_description
      if safe_description_siem is not None:
          kwargs["safe_description_siem"] = safe_description_siem
      await log_activity_func(db, **kwargs)
  ```

**Files to edit** (each adapter module — `risk.py`, `control.py`, `kri.py`, `issue.py`, `approval.py`, `vendor.py`):
- For each of the 37 `(module, function)` rows, replace the `await log_activity_func(db, entity_type=..., ...)` body with `await emit_adapter(db, entity_type=..., ...)`.
- Add `from app.core.audit._emit import emit_adapter` at the top of each module.
- **CRITICAL**: each `def`/`async def` MUST stay at module scope with name and signature unchanged. The helper invocation lives INSIDE the function body. Example:
  ```python
  # BEFORE (lines 23-39 in audit/control.py):
  async def control_created(db, *, actor, control, log_activity_func=log_activity) -> None:
      await log_activity_func(
          db,
          entity_type=ActivityEntityType.CONTROL,
          entity_id=control.id,
          entity_name=control_display_name(control),
          safe_entity_label=safe_entity_label("CTRL", control.id),
          action=ActivityAction.CREATE,
          actor=actor,
          department_id=control.department_id,
      )

  # AFTER:
  async def control_created(db, *, actor, control, log_activity_func=log_activity) -> None:
      await emit_adapter(
          db,
          entity_type=ActivityEntityType.CONTROL,
          entity_id=control.id,
          entity_name=control_display_name(control),
          safe_entity_label=safe_entity_label("CTRL", control.id),
          action=ActivityAction.CREATE,
          actor=actor,
          department_id=control.department_id,
          log_activity_func=log_activity_func,
      )
  ```

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_audit_adapter_emitter_helper_red.py -q
pytest tests/backend/pytest/architecture/test_w7_audit_adapter_completeness_red.py tests/backend/pytest/architecture/test_w7_audit_safe_entity_label_red.py -q
```

All pass; existing locks remain GREEN (no regression).

#### Lock/TOML/Contract updates (same commit)

- New `test_audit_adapter_emitter_helper_red.py`.
- `_audit_matrix.toml` rows do NOT change.
- Existing locks `test_w7_audit_adapter_completeness_red.py:33-39` and `test_w7_audit_safe_entity_label_red.py` MUST remain GREEN — verify after each module edit.
- No capability-contract change.
- No TOML allowlist edits.

#### README / doc updates (same commit)

- Optional: add a line in `backend/app/core/audit/__init__.py` docstring or create a small `backend/app/core/audit/README.md` noting that `_emit.py` owns the adapter-emit boilerplate.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_audit_adapter_emitter_helper_red.py -q` — must pass.
2. `pytest tests/backend/pytest/architecture/test_w7_audit_adapter_completeness_red.py tests/backend/pytest/architecture/test_w7_audit_safe_entity_label_red.py -q` — must remain GREEN.
3. `pytest tests/backend/pytest -q -k "audit or test_w7"` — broad audit suite green.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `ruff check backend/app/core/audit` — clean.
6. `mypy backend/app/core/audit` — clean.

#### Commit boundary

ONE commit titled: `BE-N4: extract audit adapter emit helper (additive)`. Alternative: 2-3 commits split by adapter module if individual diffs exceed ~150 LOC.

#### Rollback

- Class: **LOCK-RATCHET** (per `plan-loop-3-03-rollback-register.md:508`).
- Procedure:
  1. `git revert <SHA>` to inline helper invocations back into the 6 audit modules.
  2. Delete `tests/backend/pytest/architecture/test_audit_adapter_emitter_helper_red.py`.
  3. Verify W7 audit-adapter completeness lock still GREEN (matrix rows untouched).
- Estimated revert time: 30 min.

#### Effort & Risk

- Estimated time: 6h (helper module + 37 row rewrites + 1 architecture test + 1 behavior test + verification).
- Risk: MEDIUM — broad surface (37 rows × 6 modules); per-module diff can be large.
- Mitigations: helper preserves all keyword args including `safe_entity_label`; AST-parse RED test enforces `safe_entity_label=` kwarg presence; existing W7 locks remain in force; if per-row diff exceeds ~150 LOC, split into 2-3 commits by module family.

---

### Item #57 (Section 4) — #44 — Centralize guarded path-prefix registry

**Wave**: 5  | **Slot**: v2 Seq 60  | **Effort**: M (~5h)  | **Priority**: P3  | **Domain**: endpoints (router)

**Dependencies**: none. Must not weaken `tests/backend/pytest/architecture/test_w3_gate_snapshot.py`.
**Atomic with**: none.
**Validator?**: no.

#### Why this work

**Phase 4 verified count: 27 `include_router` calls** at `backend/app/api/v1/router.py:34-60`. **`risk_questionnaires` is registered TWICE** at `:44` (`.risk_router` under `/questionnaires` tag) and `:60` (`.router` under `/questionnaires` tag) — registry **must support `dual_router = true`** for that module. Phase 5 ships **registry + lock first**; refactor of `router.py` to read the registry and emit `include_router` calls in a loop is deferred to a follow-up commit.

**Phase 6 minor prose fix**: at recipe-03 line 926, the prior text said "`/risks tag`" — the corrected text is "`/questionnaires tag`" for both registrations. Audit ID = #44 (BE-N6); developer verdict = ACCEPT (P3).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 60 (`plan-loop-3-07-integration-v2.md:403`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `backend/app/api/v1/router.py:34-60` — confirm 27 `include_router` calls.
- [ ] Confirm `risk_questionnaires` registered twice at `:44, :60` (both under `/questionnaires` tag per Phase 6 prose fix).
- [ ] Read `tests/backend/pytest/architecture/test_w3_gate_snapshot.py` (must not be weakened).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/architecture/test_router_prefix_registry_red.py`

```python
"""BE-N6: router prefix registry parity with api_router.routes."""
from __future__ import annotations
import pytest
pytestmark = pytest.mark.contract

import tomllib
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
REGISTRY_PATH = REPO / "backend/app/api/v1/_router_registry.toml"


def test_registry_file_exists() -> None:
    assert REGISTRY_PATH.exists(), "BE-N6: registry must live at app/api/v1/_router_registry.toml"


def _load_registry() -> dict:
    return tomllib.loads(REGISTRY_PATH.read_text())


def test_registry_covers_all_includes() -> None:
    """For every entry in router.py include_router, registry has matching row.
    Dual-router modules emit two registry rows tagged with `dual_router = true`."""
    from app.api.v1.router import api_router
    registry = _load_registry()
    actual: set[tuple[str, tuple[str, ...]]] = set()
    for route in api_router.routes:
        path = getattr(route, "path", "")
        tags = tuple(sorted(getattr(route, "tags", []) or []))
        prefix = "/" + path.lstrip("/").split("/", 1)[0] if path != "/" else ""
        actual.add((prefix, tags))
    declared: set[tuple[str, tuple[str, ...]]] = set()
    for entry in registry.get("modules", []):
        declared.add((entry["prefix"], tuple(sorted(entry["tags"]))))
        if entry.get("dual_router"):
            for dual in entry.get("dual_routes", []):
                declared.add((dual["prefix"], tuple(sorted(dual["tags"]))))
    missing_in_registry = actual - declared
    extra_in_registry = declared - actual
    assert not missing_in_registry, f"BE-N6: routes missing from registry: {missing_in_registry}"
    assert not extra_in_registry, f"BE-N6: registry has stale entries: {extra_in_registry}"


def test_dual_router_supported() -> None:
    """risk_questionnaires must be declared as a dual-router module."""
    registry = _load_registry()
    rq = next(
        (m for m in registry["modules"] if m["module"] == "risk_questionnaires"),
        None,
    )
    assert rq is not None, "registry missing risk_questionnaires"
    assert rq.get("dual_router") is True, "risk_questionnaires must set dual_router = true"
    assert len(rq.get("dual_routes", [])) == 2, "risk_questionnaires has 2 routers"
```

**Expected**: RED — registry file does not exist.

#### TDD Step 2 — Implement Change

**Files to create**:
- `backend/app/api/v1/_router_registry.toml` — **25 logical entries covering all 27 `include_router` calls** (24 single-router + 1 dual = 25 logical, but 27 mounted routers because the dual contributes 2). Each entry declares `module`, `prefix` (or `prefix_owner = "module" | "aggregator"`), `tags`, and optional `dual_router = true` with a `dual_routes` array. **Per Phase 6 prose fix**, both `dual_routes` entries for `risk_questionnaires` declare `tags = ["questionnaires"]`:
  ```toml
  # backend/app/api/v1/_router_registry.toml
  # Lock for BE-N6: enumerates every include_router call in app/api/v1/router.py.

  [[modules]]
  module = "health"
  prefix = ""
  tags = ["health"]

  [[modules]]
  module = "auth"
  prefix = "/auth"
  tags = ["auth"]

  [[modules]]
  module = "users"
  prefix = "/users"
  tags = ["users"]

  [[modules]]
  module = "access"
  prefix = "/access"
  tags = ["access"]

  [[modules]]
  module = "controls"
  prefix = "/controls"
  tags = ["controls"]

  [[modules]]
  module = "risks"
  prefix = "/risks"
  tags = ["risks"]

  [[modules]]
  module = "issues"
  prefix_owner = "module"
  tags = ["issues"]

  [[modules]]
  module = "vendors"
  prefix = "/vendors"
  tags = ["vendors"]

  [[modules]]
  module = "vendor_links"
  prefix_owner = "module"
  tags = ["vendor-links"]

  [[modules]]
  module = "vendor_reports"
  prefix_owner = "module"
  tags = ["vendor-reports"]

  # DUAL-ROUTER: risk_questionnaires registers BOTH .risk_router AND .router; both under /questionnaires tag (Phase 6 prose fix).
  [[modules]]
  module = "risk_questionnaires"
  dual_router = true
  dual_routes = [
      { router_attr = "risk_router", prefix_owner = "module", tags = ["questionnaires"] },
      { router_attr = "router",      prefix_owner = "module", tags = ["questionnaires"] },
  ]

  [[modules]]
  module = "dashboard"
  prefix = "/dashboard"
  tags = ["dashboard"]

  [[modules]]
  module = "departments"
  prefix = "/departments"
  tags = ["departments"]

  [[modules]]
  module = "reports"
  prefix = "/reports"
  tags = ["reports"]

  [[modules]]
  module = "executions"
  prefix = "/executions"
  tags = ["executions"]

  [[modules]]
  module = "kris"
  prefix_owner = "module"
  tags = ["kris"]

  [[modules]]
  module = "approvals"
  prefix = "/approvals"
  tags = ["approvals"]

  [[modules]]
  module = "notifications"
  prefix = "/notifications"
  tags = ["notifications"]

  [[modules]]
  module = "admin"
  prefix = "/admin"
  tags = ["admin"]

  [[modules]]
  module = "directory"
  prefix_owner = "module"
  tags = ["directory"]

  [[modules]]
  module = "orphaned_items"
  prefix = "/orphaned-items"
  tags = ["governance"]

  [[modules]]
  module = "lookups"
  prefix = "/lookups"
  tags = ["lookups"]

  [[modules]]
  module = "activity_log"
  prefix = "/activity-log"
  tags = ["activity-log"]

  [[modules]]
  module = "riskhub"
  prefix = "/riskhub"
  tags = ["riskhub"]

  [[modules]]
  module = "riskhub_questionnaires"
  prefix_owner = "module"
  tags = ["questionnaires"]

  [[modules]]
  module = "preferences"
  prefix_owner = "module"
  tags = ["preferences"]
  ```
- The new lock test above.

(Refactor `router.py` to a registry-driven loop is a follow-up commit; Phase 5 ships TOML + parity test only — Loop 1 explicit deferral.)

**Files to edit**: none (the registry is additive metadata).

**Files to delete**: none.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_router_prefix_registry_red.py -q
pytest tests/backend/pytest/architecture/test_w3_gate_snapshot.py -q
```

All pass.

#### Lock/TOML/Contract updates (same commit)

- New TOML registry under `backend/app/api/v1/_router_registry.toml` (the lock target).
- New architecture test above.

#### README / doc updates (same commit)

- Add an "Endpoint registry" subsection in `backend/app/api/v1/endpoints/README.md` referencing the new TOML and the lock test.

#### Verification commands (run all in order)

1. `cd backend && ./venv/bin/pytest -q tests/backend/pytest/architecture/test_router_prefix_registry_red.py` — must pass.
2. `cd backend && ./venv/bin/pytest -q tests/backend/pytest/architecture/test_w3_gate_snapshot.py` — must remain GREEN.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

ONE commit titled: `feat(api): centralize guarded path-prefix registry`. RED test + TOML registry + README subsection in same commit.

#### Rollback

- Class: **TRIVIAL** (additive metadata + parity test).
- Procedure:
  1. `git revert <SHA>` — removes both. No production-routing change.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 5h (registry authoring + parity test + verification + reviewer alignment).
- Risk: LOW — additive only; no production-routing change.
- Mitigations: parity test catches drift; refactor of `router.py` to registry-driven loop deferred to a follow-up commit; `test_w3_gate_snapshot.py` (4 `(method, path) → capability` mappings) remains GREEN.

---

End of Section 4 — Per-Item Recipes (Items 27-57, Waves 4-5) — final, Phase 6 corrections applied.

---

## Section 5 — Per-Item Recipes Part 3 (Waves 6-8, Slots 59-79+) + Migration Window Detail


Phase: **7 (production-write)**. Build commit ref: `1ee872a4` on `main`.
Source: Phase 5 recipes (`recipe-01-issues.md`, `recipe-02-risks-and-endpoints.md`, `recipe-03-approvals.md`, `recipe-04-kris.md`, `recipe-05-vendor-migration.md`, `recipe-06-frontend-deadcode.md`, `recipe-07-frontend-authz.md`, `recipe-08-crosscut-adrs.md`).
Phase 6 corrections applied: see verify-recipe-01..08 reports.
Master sequence: `plan-loop-3-07-integration-v2.md:343-422` (79 items).

This section documents items in **Waves 6a, 6b, 7, and 8** of the 79-item v2 master sequence:

- **Wave 6a (slots 59-66) — P3 infrastructure + #77a**: #42, #58, #63, #46 (L+), #65 (CRITICAL: literal flat schemas), #67, #62, #77a, #45a
- **Wave 6b (slots 67-71) — P3 capability + admin**: #39, #40, #66 (CRITICAL: render-counter test), #45b
- **Wave 7 (slots 72-76) — P4 deferred**: #68, #71 (CRITICAL: single-flight preservation), #60
- **Wave 8 (slots 77-79+) — Migration + FE TS cleanup**: #69+#70 atomic (XL), #77b

Plus the **Detailed Migration Window section** for #69+#70 (the 9-step sequence, all 8 RED tests including 4 NEW Phase 4 tests, snapshot/restore procedure, postgres-lane test plan).

All recipes assume single sequential developer; TDD red→green; new architecture
tests carry `pytestmark = pytest.mark.contract`; backend integration tests use
`client_factory` from `tests/backend/pytest/conftest.py`. Quote rule: ≤15 words.

> **Phase 6 critical corrections applied to this section** (key list):
>
> - **#46**: 33 inline `queryKey: [` literals (verified by fresh grep, NOT 45);
>   per-commit budget ratchet test pattern.
> - **#65 CRITICAL**: literal flat schemas only — parser at
>   `scripts/security/authz_contract_validator/capability_catalog.py:112-126`
>   does NOT walk `.merge()` / `.extend()`. Each entity Zod schema copies
>   fields verbatim.
> - **#66**: render-counter test pattern (`useRef(0)` + `useEffect(() => { count.current += 1 })`).
> - **#71**: module-scope state at `frontend/src/services/session/sso.ts:9-11`
>   (`refreshInFlight`, `lastRefreshFailureAt`, `REFRESH_FAILURE_COOLDOWN_MS`)
>   MUST survive merge.
> - **#39**: `AdminConsoleCapabilities` is a 4-boolean static stub at
>   `backend/app/api/v1/endpoints/admin/capabilities.py:14-22` with
>   `_ = current_user` line; replace with role-aware builder.
> - **#69+#70 atomic CRITICAL fixes**:
>   1. `tests/backend/pytest/migrations/` directory does NOT exist — recipe
>      must create `__init__.py` + conftest.py with postgres fixtures.
>   2. `make -f scripts/Makefile postgres-up` does NOT exist — use
>      `TEST_DATABASE_URL=postgresql+asyncpg://... make -f scripts/Makefile test-postgres-ci`.
>   3. Include all 4 NEW Phase 4 RED tests: idempotency, concurrent-write,
>      FK-orphan precheck, partial-failure recovery.
>   4. Down_revision is `j5k6l7m8n9o0` (current head verified at
>      `backend/alembic/versions/j5k6l7m8n9o0_rename_kri_archived_by_fk.py:16`).
> - **#77a**: use literal `'active'` (NOT `VENDOR_STATUS_VALUES[0]`).
> - **#77b**: post-migration; touches `frontend/src/types/vendor.ts:1,64,94`.

---

## Wave 6a — P3 Infrastructure + #77a (Slots 59-69, 60.5h, Weeks 10-11)

Wave 6a sets up FE infrastructure for the next sub-wave; #46's L+ query-keys
factory unblocks 3 dependent items in Wave 6b/7. **Validator runs**: 0 (Wave 6a
infrastructure does NOT touch the capability contract).

---

### Item #1 (Section 5) — #42 — `ActorPayloadModel(OutboxPayloadModel)` shared base

**Wave**: 6a  | **Slot**: v2 Seq 61  | **Effort**: S (~1h)  | **Priority**: P3  | **Domain**: crosscut

**Dependencies**: none  
**Atomic with**: none  
**Validator?**: no

#### Why this work

Six outbox payload classes redeclare `actor_user_id: int` verbatim. A shared
`ActorPayloadModel(OutboxPayloadModel)` base, inserted into
`backend/app/services/outbox/payloads.py`, deduplicates the field while
preserving Pydantic serialization shape. Three approval payloads
(`ApprovalRequestCreatedPayload`, `ApprovalRequestResolvedPayload`,
`ApprovalRequestCancelledPayload`) intentionally retain direct
`OutboxPayloadModel` inheritance — they have no `actor_user_id` (cancelled has
`cancelled_by_user_id` instead). Audit ID = #42; developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 61 (`plan-loop-3-07-integration-v2.md:404`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of `backend/app/services/outbox/payloads.py` (especially `:13`, `:30-61`, `:105-121`).
- [ ] Confirm outbox call-site lock at
  `tests/backend/pytest/architecture/test_w12_outbox_enqueue_idempotency_key_present_red.py:34-49`
  scans CALL SITES, not payload classes — the base introduction is invisible.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/backend/pytest/test_outbox_actor_payload_base_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
"""BE-N2: ActorPayloadModel base introduces shared actor_user_id field."""
from __future__ import annotations
import pytest
pytestmark = pytest.mark.contract

from app.services.outbox.payloads import (
    ActorPayloadModel,
    OutboxPayloadModel,
    ApprovalRequestCreatedPayload,
    ApprovalRequestResolvedPayload,
    ApprovalRequestCancelledPayload,
    IssueAssignedPayload,
    IssueExceptionRequestedPayload,
    IssueExceptionApprovedPayload,
    QuestionnaireSentPayload,
    QuestionnaireSubmittedPayload,
    QuestionnaireClarificationRequestedPayload,
)


def test_actor_payload_model_base_shape() -> None:
    assert ActorPayloadModel.__bases__ == (OutboxPayloadModel,)
    field = ActorPayloadModel.model_fields["actor_user_id"]
    assert field.annotation is int


@pytest.mark.parametrize(
    "cls",
    [
        IssueAssignedPayload,
        IssueExceptionRequestedPayload,
        IssueExceptionApprovedPayload,
        QuestionnaireSentPayload,
        QuestionnaireSubmittedPayload,
        QuestionnaireClarificationRequestedPayload,
    ],
)
def test_actor_payload_inherits(cls) -> None:
    assert ActorPayloadModel in cls.__mro__


@pytest.mark.parametrize(
    "cls",
    [
        ApprovalRequestCreatedPayload,
        ApprovalRequestResolvedPayload,
        ApprovalRequestCancelledPayload,
    ],
)
def test_approval_payload_does_not_inherit_actor_base(cls) -> None:
    assert ActorPayloadModel not in cls.__mro__
```

**Expected result**: RED at HEAD — `ActorPayloadModel` does not exist; current
6 actor classes inherit `OutboxPayloadModel` directly.

#### TDD Step 2 — Implement Change

**File: `backend/app/services/outbox/payloads.py`**:

1. Insert immediately after line `:13`:

```python
class ActorPayloadModel(OutboxPayloadModel):
    """Shared base for outbox payloads that carry the acting user's id."""
    actor_user_id: int
```

2. At lines `:30-61`, rewrite 6 class bases:
   - `IssueAssignedPayload(OutboxPayloadModel)` → `IssueAssignedPayload(ActorPayloadModel)`; drop `actor_user_id: int` field at `:33`.
   - `IssueExceptionRequestedPayload(OutboxPayloadModel)` → `IssueExceptionRequestedPayload(ActorPayloadModel)`; drop `:38`.
   - `IssueExceptionApprovedPayload(OutboxPayloadModel)` → `IssueExceptionApprovedPayload(ActorPayloadModel)`; drop `:43`.
   - `QuestionnaireSentPayload(OutboxPayloadModel)` → `QuestionnaireSentPayload(ActorPayloadModel)`; drop `:50`.
   - `QuestionnaireSubmittedPayload(OutboxPayloadModel)` → `QuestionnaireSubmittedPayload(ActorPayloadModel)`; drop `:55`.
   - `QuestionnaireClarificationRequestedPayload(OutboxPayloadModel)` → `QuestionnaireClarificationRequestedPayload(ActorPayloadModel)`; drop `:61`.

3. At `__all__` block `:105-121`, add `"ActorPayloadModel"`.

4. Three approval payloads (`ApprovalRequestCreatedPayload:16`,
   `ApprovalRequestResolvedPayload:20`, `ApprovalRequestCancelledPayload:25`)
   UNCHANGED — they remain `OutboxPayloadModel` direct subclasses.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/test_outbox_actor_payload_base_red.py -q
```

#### Lock/TOML/Contract updates (same commit)

- None. Outbox call-site lock at
  `test_w12_outbox_enqueue_idempotency_key_present_red.py:34-49` is unaffected
  (it scans `OutboxService.enqueue(...)` keyword args, not payload classes).

#### README / doc updates (same commit)

- None — internal Pydantic refactor; not a contract surface change.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/test_outbox_actor_payload_base_red.py -q` — must pass.
2. `pytest tests/backend/pytest/architecture/test_w12_outbox_enqueue_idempotency_key_present_red.py -q` — must remain green.
3. `pytest tests/backend/pytest -q -k "outbox"` — broad outbox suite green.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `ruff check backend/app/services/outbox` — clean.
6. `mypy backend/app/services/outbox` — clean.

#### Commit boundary

Single commit titled
`refactor(outbox): introduce ActorPayloadModel shared base for actor-bearing payloads`.
RED test + base introduction + 6 inheritance edits + `__all__` update in same commit.

#### Rollback

- Class: **PURE-CODE**.
- Procedure: revert the commit. Reverting collapses 6 inheritance lines and
  restores duplicated `actor_user_id: int` declarations. Zero data implication;
  serialized payloads unchanged (Pydantic field shape is identical).
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: ~1h (small refactor + 1 architecture test + verification).
- Risk: very low — Pydantic field declarations are class-level; the change is
  inheritance-only.
- Mitigations: structural test pins the base shape and the 6/3 inheritance
  matrix; outbox call-site lock unchanged.

---

### Item #2 (Section 5) — #58 — Delete `OrphanedItemService` static-method class + facade

**Wave**: 6a  | **Slot**: v2 Seq 62  | **Effort**: M (~half-day)  | **Priority**: P3  | **Domain**: endpoints

**Dependencies**: none  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`OrphanedItemService` is a static-method class living at
`backend/app/services/_orphaned_items/service.py:20`, surfaced through a
20-line facade at `backend/app/services/orphaned_item_service.py:3`. Phase 4
verified **7 dotted call sites** in
`backend/app/api/v1/endpoints/orphaned_items.py` at lines 45, 70, 119, 120,
147, 164, 187 (NOT 8 — line 25 was the import, not a call). Underlying
module-level functions live in
`_orphaned_items/{flagging,reads,resolution,stats}.py`. Audit ID = #58;
developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 62 (`plan-loop-3-07-integration-v2.md:405`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of:
  - `backend/app/api/v1/endpoints/orphaned_items.py:25,45,70,119,120,147,164,187`
  - `backend/app/services/_orphaned_items/service.py:20`
  - `backend/app/services/orphaned_item_service.py:3`
  - `backend/app/services/_orphaned_items/{flagging,reads,resolution,stats}.py`
  - `backend/app/services/_orphaned_items/__init__.py`
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/backend/pytest/architecture/test_orphaned_item_facade_removed_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
"""Lock OrphanedItemService facade and static-method class removal."""
from __future__ import annotations

import importlib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]


def test_orphaned_item_service_facade_module_deleted() -> None:
    facade = REPO_ROOT / "backend/app/services/orphaned_item_service.py"
    assert not facade.exists()


def test_orphaned_item_service_class_removed_from_internal_package() -> None:
    try:
        service_mod = importlib.import_module(
            "app.services._orphaned_items.service"
        )
    except ModuleNotFoundError:
        return  # entire module file removed = acceptable
    assert not hasattr(service_mod, "OrphanedItemService")


def test_endpoints_do_not_reference_orphaned_item_service() -> None:
    endpoint_path = (
        REPO_ROOT / "backend/app/api/v1/endpoints/orphaned_items.py"
    )
    source = endpoint_path.read_text(encoding="utf-8")
    assert "OrphanedItemService" not in source
    assert "orphaned_item_service" not in source


def test_module_level_orphan_functions_directly_callable() -> None:
    pkg = importlib.import_module("app.services._orphaned_items")
    for name in (
        "scan_uncategorised_items",
        "get_pending_orphans_with_details",
        "get_orphan_stats",
        "get_orphan_detail",
        "resolve_orphan",
    ):
        assert callable(getattr(pkg, name, None)), name
```

**Expected result**: RED. All four assertions FAIL today.

#### TDD Step 2 — Implement Change

1. Update `backend/app/services/_orphaned_items/__init__.py` to re-export the 5
   functions consumed by the endpoint module:

```python
"""Internal implementation for orphaned item management.

Public callable surface is exposed via this package's module-level imports.
"""
from .flagging import flag_orphaned_items, scan_uncategorised_items
from .reads import (
    get_orphan_detail,
    get_pending_orphans,
    get_pending_orphans_with_details,
)
from .resolution import _get_fallback_owner_id, resolve_orphan
from .stats import get_orphan_stats

__all__ = [
    "flag_orphaned_items",
    "get_orphan_detail",
    "get_orphan_stats",
    "get_pending_orphans",
    "get_pending_orphans_with_details",
    "resolve_orphan",
    "scan_uncategorised_items",
    "_get_fallback_owner_id",
]
```

2. Edit `backend/app/api/v1/endpoints/orphaned_items.py:25`. Replace
   `from app.services.orphaned_item_service import OrphanedItemService` with:

```python
from app.services._orphaned_items import (
    get_orphan_detail,
    get_orphan_stats,
    get_pending_orphans_with_details,
    resolve_orphan,
    scan_uncategorised_items,
)
```

3. Rewrite the 7 call sites:
   - `:45` `OrphanedItemService.scan_uncategorised_items(db)` → `scan_uncategorised_items(db)`
   - `:70` `OrphanedItemService.get_pending_orphans_with_details(...)` → `get_pending_orphans_with_details(...)`
   - `:119` `OrphanedItemService.get_orphan_stats(...)` → `get_orphan_stats(...)`
   - `:120` `OrphanedItemService.get_pending_orphans_with_details(...)` → `get_pending_orphans_with_details(...)`
   - `:147` `OrphanedItemService.get_orphan_stats(...)` → `get_orphan_stats(...)`
   - `:164` `OrphanedItemService.get_orphan_detail(...)` → `get_orphan_detail(...)`
   - `:187` `OrphanedItemService.resolve_orphan(...)` → `resolve_orphan(...)`

4. Delete `backend/app/services/_orphaned_items/service.py` entirely.

5. Delete `backend/app/services/orphaned_item_service.py` entirely.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_orphaned_item_facade_removed_red.py -q
```

Verify no remaining importer outside the deleted files via:

```
grep -rn "OrphanedItemService\|orphaned_item_service" backend/ tests/
```

Expect zero hits (modulo the one inside the new test file's docstring/asserts,
which the test itself filters).

#### Lock/TOML/Contract updates (same commit)

- New architecture lock IS the contract.
- No TOML edits — the facade is not pinned in any allowlist.

#### README / doc updates (same commit)

- None required — Domain 8 confirms no README references the deleted file.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_orphaned_item_facade_removed_red.py -q` — pass.
2. `pytest tests/backend/pytest/test_admin_orphans.py -q` — regression pass.
3. `pytest tests/backend/pytest/api/v1/ -q` — broad endpoints pass.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `ruff check backend/app/services/_orphaned_items backend/app/api/v1/endpoints/orphaned_items.py` — clean.
6. `mypy backend/app/services/_orphaned_items backend/app/api/v1/endpoints/orphaned_items.py` — clean.

#### Commit boundary

Single commit titled
`refactor(orphans): delete OrphanedItemService facade and static-method class`.
Endpoint rewrite + service.py deletion + facade.py deletion + __init__ update +
new lock all ship together.

#### Rollback

- Class: **PURE-CODE**.
- Procedure: revert the single commit; restores 20-line facade + 7 call-site
  rewrites + the static-method class.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: ~half-day (7 call-site edits + 2 file deletions + package
  __init__ update + 1 architecture test + verification).
- Risk: low — pure routing through module-level functions; no behavior change.
- Mitigations: structural test pins facade absence + class absence + endpoint
  source absence + functional callability.

---

### Item #3 (Section 5) — #63 — Outbox dispatch SchedulerJobRun instrumentation

**Wave**: 6a (per Section 2 master placement)  | **Slot**: v2 Seq 63 | **Effort**: M (5-7h)  | **Priority**: P3  | **Domain**: endpoints

> Section-2 reconciliation note: Section 2 places #63 in row 73 (Wave 6b
> placeholder); the v2 sequence puts it at Seq 63 in Wave 6a. This recipe
> follows the v2 sequence slot. No semantic difference — the work is identical
> either way.

**Dependencies**: none (additive)  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`backend/app/services/outbox/dispatcher.py` runs the dispatch loop without
recording a `SchedulerJobRun` row. Operators have no observable evidence that
the dispatcher started, completed, or failed. The `SchedulerJobRun` model
already exists at `backend/app/models/scheduler_job_run.py:15-37` (no schema
change needed). The work is additive: instrument entry + success + failure
transitions, then verify admin endpoints (`/jobs/status`, `/outbox/status`)
return their existing shapes unchanged. Audit ID = #63; developer verdict =
ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 63 (`plan-loop-3-07-integration-v2.md:406`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of:
  - `backend/app/services/outbox/dispatcher.py`
  - `backend/app/models/scheduler_job_run.py:15-37`
  - `backend/app/api/v1/endpoints/admin/console.py:49,58` (admin /jobs/status, /outbox/status routes)
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Tests (RED)

**Test file 1 (architecture)**:
`tests/backend/pytest/architecture/test_w13_outbox_scheduler_instrumentation_red.py`

```python
"""BE-N7: outbox dispatcher instruments SchedulerJobRun on entry and exit."""
from __future__ import annotations

import ast
import pathlib

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]
DISPATCHER = REPO_ROOT / "backend/app/services/outbox/dispatcher.py"


def test_dispatcher_imports_scheduler_job_run() -> None:
    src = DISPATCHER.read_text()
    assert "SchedulerJobRun" in src, "dispatcher must import SchedulerJobRun"


def test_dispatcher_writes_scheduler_job_run() -> None:
    """At least one constructor call SchedulerJobRun(...) in dispatcher."""
    tree = ast.parse(DISPATCHER.read_text())
    found = False
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            f = node.func
            name = f.id if isinstance(f, ast.Name) else getattr(f, "attr", None)
            if name == "SchedulerJobRun":
                found = True
                break
    assert found, "dispatcher must construct SchedulerJobRun rows"
```

**Test file 2 (behavioral)**:
`tests/backend/pytest/test_outbox_dispatch_scheduler_run_red.py`

```python
"""BE-N7: dispatch_pending_outbox_events records a SchedulerJobRun row."""
from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models.scheduler_job_run import SchedulerJobRun
from app.services.outbox.dispatcher import dispatch_pending_outbox_events

pytestmark = pytest.mark.contract


@pytest.mark.asyncio
async def test_dispatch_records_running_then_succeeded(
    client_factory, queued_outbox_event, current_user,
) -> None:
    """One queued event → one SchedulerJobRun in 'succeeded' with events_processed=1."""
    async with client_factory(current_user=current_user) as ac:
        async with ac.app.state.db_factory() as db:
            await dispatch_pending_outbox_events(db)
            rows = await db.execute(select(SchedulerJobRun).order_by(SchedulerJobRun.id.desc()))
            run = rows.scalars().first()
    assert run is not None
    assert run.job_name == "outbox_dispatch"
    assert run.status == "succeeded"
    assert run.started_at is not None
    assert run.finished_at is not None
    assert (run.result_json or {}).get("events_processed") == 1
```

**Expected result**: RED on both files; `SchedulerJobRun` not constructed in
dispatcher; no row written.

#### TDD Step 2 — Implement Change

In `backend/app/services/outbox/dispatcher.py`, at the start of
`dispatch_pending_outbox_events`:

```python
from uuid import uuid4
from app.core.datetime_utils import utc_now
from app.models.scheduler_job_run import SchedulerJobRun
from app.core.config import settings

run = SchedulerJobRun(
    job_name="outbox_dispatch",
    run_id=str(uuid4()),
    status="running",
    trigger_type="dispatch",
    instance_id=settings.instance_id,
    started_at=utc_now(),
)
db.add(run)
await db.flush()
```

On success path (after the dispatch loop completes):

```python
run.status = "succeeded"
run.finished_at = utc_now()
run.duration_ms = int((run.finished_at - run.started_at).total_seconds() * 1000)
run.result_json = {"events_processed": events_processed}
```

On failure (within the existing except for `FatalOutboxError` /
`RetryableOutboxError`):

```python
run.status = "failed"
run.finished_at = utc_now()
run.error_message = str(exc)[:1024]
```

The persistence happens within the existing service-owned transaction (per
ADR-002). Per the recipe `recipe-08-crosscut-adrs.md:283-285`, "the
`SchedulerJobRun` write must occur within an existing service-owned scope, NOT
via a new `db.commit()` at the dispatcher seam."

Optionally extract a helper `record_scheduler_run` inside `dispatcher.py` so
the entry/success/error transitions reuse one block.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_w13_outbox_scheduler_instrumentation_red.py -q
pytest tests/backend/pytest/test_outbox_dispatch_scheduler_run_red.py -q
```

#### Lock/TOML/Contract updates (same commit)

- None new.

#### README / doc updates (same commit)

- `backend/app/services/outbox/README.md` (if exists) — note that dispatcher
  records `SchedulerJobRun` for each dispatch run.
- `docs/agent/ENDPOINT_INVARIANTS.md` — no edit needed; admin endpoint shapes
  unchanged.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_w13_outbox_scheduler_instrumentation_red.py -q` — pass.
2. `pytest tests/backend/pytest/test_outbox_dispatch_scheduler_run_red.py -q` — pass.
3. `pytest tests/backend/pytest -q -k "outbox or scheduler or admin_console"` — broad regression pass.
4. `pytest tests/backend/pytest/api/v1/admin/test_admin_console.py -q` (or equivalent) — admin shapes unchanged.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `ruff check backend/app/services/outbox` — clean.
7. `mypy backend/app/services/outbox` — clean.

#### Commit boundary

Single commit titled
`feat(outbox): instrument dispatch with SchedulerJobRun`. Architecture lock +
behavioral test + dispatcher edit + (optional) helper extraction together.

#### Rollback

- Class: **PURE-CODE** (additive, no schema change).
- Procedure: revert single commit; SchedulerJobRun model stays idle.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: 5-7h (instrumentation + 2 tests + admin endpoint regression
  verification).
- Risk: medium — touches dispatch loop; per-flush race on `finished_at` if the
  outer transaction rolls back. Mitigation: persist within service-owned tx;
  failure path sets `status="failed"` before re-raise.

---

### Item #4 (Section 5) — #46 — Promote resource query-key factories (with budget-ratchet)

**Wave**: 6a  | **Slot**: v2 Seq 64  | **Effort**: **L+ (24-28h, NOT L)**  | **Priority**: P3  | **Domain**: frontend

**Dependencies**: none  
**Atomic with**: none  
**Validator?**: no — but **gates #65 (Seq 65), #67 (Seq 66), #68 (Seq 75)**

#### Why this work

Inline `queryKey: ['...']` literals scattered across the frontend prevent
typed factories from owning each query key family; Phase 4/Phase 6 fresh grep
returned **33** inline `queryKey: [` literals (NOT 45) across ~17 source
files. The L+ effort reflects the staged 5-commit migration with a
ratcheting budget test that drops to 0 by the final commit. Audit ID = #46;
developer verdict = ACCEPT.

> **Phase 6 critical correction**: 33 inline literals (NOT 45). Distribution
> by domain: ~12 in riskHub (capabilities, global config, departments, roles,
> permissions, riskTypes, approvalScenarios, public risk types, thresholds,
> total assets value, etc.), ~13 in admin sections, ~8 in remaining domains
> (governance, dashboard, docs, users).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 64 (`plan-loop-3-07-integration-v2.md:407`).
- [ ] Confirm prerequisites complete: none.
- [ ] Run a fresh count to confirm the budget:
  `grep -rn "queryKey: \[" frontend/src --include="*.ts" --include="*.tsx" | wc -l`
  → expect 33 (lock the budget at this number).
- [ ] No concurrent feature-work conflicts on any of the 17 affected files.

#### Target factory layout (`frontend/src/lib/queryKeys/`)

| Module | Exported keys | Source files migrated |
|---|---|---|
| `riskHub.ts` | `capabilities`, `globalConfig`, `departments`, `roles`, `permissions`, `riskTypes`, `approvalScenarios`, `publicRiskTypes`, `thresholdsPublic`, `totalAssetsValue` | `useRiskHubCapabilities.ts`, `SystemSettingsPanel.tsx`, `DepartmentsPanel.tsx`, `useRolesPanelData.ts`, `RiskTypesPanel.tsx`, `ApprovalScenariosPanel.tsx`, `useRiskHubConfig.ts` |
| `admin.ts` | `adminSessions`, `adminCapabilities`, `adminAuditLogs`, `adminAuditLogUsers`, `adminHealth`, `adminSchedulerStatus`, `adminOutboxStatus`, `adminStats`, `adminLogs`, `logConfig` | `pages/admin-console/sections/**/*.tsx` |
| `users.ts` | `usersAccessDepartmentManagers` | `DepartmentsPanel.tsx:42` |
| `governance.ts` | `governanceOverview` | `pages/GovernancePage.tsx:44` |
| `dashboard.ts` | `shellSummary`, `dashboardOverview` | `layout/Sidebar.tsx:37`, `pages/dashboard/useDashboardOverviewState.ts:21` |
| `docs.ts` | `settingsDocs(lang)`, `adminDocs(lang)` | `settings/DocumentationSettings.tsx:29`, `pages/DocumentationPage.tsx:27` |

Six modules cover the 33 inline literals. The "~10 modules" target from
Loop 1 is a ceiling.

#### TDD Step 1 — Write Failing Tests (RED)

**Per-commit budget ratchet test** (single test file, `MAX_INLINE_QUERY_KEYS`
constant decreases per commit):

**Test file**: `tests/frontend/unit/src/lib/queryKeys/__tests__/queryKeys.budget.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Budget ratchet for #46: each domain-migration commit MUST decrease
 * MAX_INLINE_QUERY_KEYS. Final value: 0. Initial value (recipe-draft time): 33.
 *
 * To update after migrating a domain:
 *   1. Run the count below locally.
 *   2. Set MAX_INLINE_QUERY_KEYS to (oldValue - keysMigratedThisCommit).
 *   3. Commit MAX update + the migration in the same PR.
 */
const MAX_INLINE_QUERY_KEYS = 33; // ratchet: 33 → 21 → 8 → 0

const SRC_ROOT = path.resolve(__dirname, '../../../../../../../frontend/src');
const FACTORY_DIR = path.join(SRC_ROOT, 'lib', 'queryKeys');

function* walk(dir: string): IterableIterator<string> {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            yield* walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.[tj]sx?$/.test(entry.name)) {
            yield full;
        }
    }
}

describe('inline queryKey budget (#46 ratchet)', () => {
    it('does not exceed the current budget', () => {
        let count = 0;
        for (const file of walk(SRC_ROOT)) {
            if (file.startsWith(FACTORY_DIR)) continue;
            const txt = fs.readFileSync(file, 'utf8');
            count += (txt.match(/queryKey:\s*\[/g) ?? []).length;
        }
        expect(count).toBeLessThanOrEqual(MAX_INLINE_QUERY_KEYS);
    });

    it('eventually reaches zero', () => {
        if (MAX_INLINE_QUERY_KEYS > 0) {
            // soft-warn until final commit; CI surfaces in logs only
            // eslint-disable-next-line no-console
            console.warn(`#46 queryKey budget still ${MAX_INLINE_QUERY_KEYS}`);
        }
        expect(MAX_INLINE_QUERY_KEYS).toBeGreaterThanOrEqual(0);
    });
});
```

**Companion test** (`factories.test.ts`) ensures every factory module exports
`as const` arrays for type-stability of `useQuery({ queryKey: ... })`.

**Final-commit positive coverage test**: after `MAX_INLINE_QUERY_KEYS = 0`,
add `expect(count).toBe(0)` and assert each factory has ≥1 caller across
`frontend/src/`.

#### TDD Step 2 — Implement Change (5 commits)

**Commit A — bootstrap factories + budget test (budget = 33)**:
- Create `frontend/src/lib/queryKeys/{index.ts,riskHub.ts,admin.ts,users.ts,governance.ts,dashboard.ts,docs.ts}` (each as a `* as const` factory with typed `readonly` arrays).
- Create `tests/frontend/unit/src/lib/queryKeys/__tests__/queryKeys.budget.test.ts` (above).
- No migrations yet; budget stays at 33.

**Commit B — migrate `riskHub` domain (12 sites → budget 33→21)**:
- Edit: `useRiskHubCapabilities.ts`, `SystemSettingsPanel.tsx`,
  `DepartmentsPanel.tsx`, `useRolesPanelData.ts`, `RiskTypesPanel.tsx`,
  `ApprovalScenariosPanel.tsx`, `useRiskHubConfig.ts`.
- Replace each inline `queryKey: ['riskHubCapabilities']` →
  `queryKey: riskHubKeys.capabilities()`.
- Update `MAX_INLINE_QUERY_KEYS = 21`.

**Commit C — migrate `admin` domain (~13 sites → budget 21→8)**:
- Edit: `pages/admin-console/sections/ops/HealthPanel.tsx`, `LogsPanel.tsx`,
  `SessionsPanel.tsx`, `pages/admin-console/sections/audit/AuditLogsPanel.tsx`,
  `LogSettingsPanel.tsx`.
- Update `MAX_INLINE_QUERY_KEYS = 8`.

**Commit D — migrate remaining 4 domains (8 sites → budget 8→0)**:
- governance, dashboard, docs, users.
- Update `MAX_INLINE_QUERY_KEYS = 0`.

**Commit E — lock**: change soft-warn to `expect(count).toBe(0)`; assert
positive coverage (every factory function has ≥1 caller).

Pattern for each migration:

```diff
- const { data } = useQuery({ queryKey: ['riskHubCapabilities'], queryFn: ... });
+ const { data } = useQuery({ queryKey: riskHubKeys.capabilities(), queryFn: ... });
```

For invalidation:

```diff
- queryClient.invalidateQueries({ queryKey: ['globalConfig'] });
+ queryClient.invalidateQueries({ queryKey: riskHubKeys.globalConfig() });
```

For parameterized keys (e.g. `['users', 'access', 'department-managers', department?.id]`):

```ts
usersKeys.accessDepartmentManagers(department?.id)
// returns ['users', 'access', 'department-managers', department?.id] as const
```

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run test:run -- queryKeys
cd frontend && npm run lint && npx tsc --noEmit
cd frontend && npm run test:run
```

After Commit E: budget = 0; `factories.test.ts` asserts every factory used.

#### Lock/TOML/Contract updates (same commit)

- None of the existing backend invariant locks are touched.
- **New lock candidate**: a frontend-architecture invariant lock can ratchet
  the budget test in CI. Out of recipe scope; capture in integration log.

#### README / doc updates

- `frontend/src/lib/queryKeys/README.md` (new) — describe factory pattern and
  the per-commit budget ratchet.
- Integration log entry per commit recording the budget value.

#### Verification commands (per commit)

1. `cd frontend && npm run lint` — clean.
2. `cd frontend && npx tsc --noEmit` — clean.
3. `cd frontend && npm run test:run -- queryKeys` — budget assertion holds.
4. `cd frontend && npm run test:run` — full sweep (Commit E).

#### Commit boundary

**5 commits** in strict order A → B → C → D → E. Each commit is independently
revertable because the budget test value moves with the migration.

Per-commit titles:
- A: `feat(frontend/queryKeys): bootstrap factories + budget ratchet test`
- B: `refactor(frontend/queryKeys): migrate riskHub domain (12 sites)`
- C: `refactor(frontend/queryKeys): migrate admin domain (13 sites)`
- D: `refactor(frontend/queryKeys): migrate remaining 4 domains (8 sites)`
- E: `feat(frontend/queryKeys): lock budget at 0; add positive coverage`

#### Rollback

- Class: **STAGED** (per-commit reverts).
- Procedure: revert in order E → D → C → B → A; each commit is mechanically
  isolated.
- Estimated revert time: 5 min per commit.

#### Effort & Risk

- Estimated time: **24-28h L+** (Phase 4 promotion from L; +6 of 33 sites
  parameterized; per-commit ratchet adds review overhead; 5 commits + final
  lock pass).
- Risk: medium — `useQuery({ queryKey: factory() })` must produce array shape
  identical to current literals (otherwise React Query cache misses cascade).
- Mitigations: budget ratchet enforces strict decrease; `factories.test.ts`
  pins the array shape per factory; per-commit review catches accidental
  shape changes.

#### Handoff notes

- **Gates #65** (CRUD schema base; consumes factories).
- **Gates #67** (`useResourcePanelQuery`; takes a typed factory `queryKey`).
- **Gates #68** (`WidgetShell`; benefits from already-landed factories).
- After Commit E, integration log records: "#46 budget = 0; factories live at
  `@/lib/queryKeys/*`."

---

### Item #5 (Section 5) — #65 — Extract `crudCapabilitySchema` shared Zod base (LITERAL FLAT — NOT `.merge`)

**Wave**: 6a  | **Slot**: v2 Seq 65  | **Effort**: M (~6h)  | **Priority**: P3  | **Domain**: frontend

**Dependencies**: #46 (Seq 64; query-key factories must land first)  
**Atomic with**: none  
**Validator?**: no — but Pydantic-Zod parity contract; runs `validate_authz_capability_contract.py` smoke

> **Phase 4/Phase 6 CRITICAL CONSTRAINT**: the backend Zod parser at
> `scripts/security/authz_contract_validator/capability_catalog.py:112-126`
> uses brace-matching only. It does NOT walk `.merge()` or `.extend()`
> continuations. The recipe MUST keep each entity schema as a single
> `passthroughObject({ /* literal field list */ })` so the parser sees
> the full set. The "shared base" is a **type-level and test-level**
> contract, NOT a runtime composition.

#### Why this work

The four entity capability Zod schemas (`risks.ts`, `controls.ts`, `kris.ts`,
`vendors.ts`) all literal-include `can_read` and `can_update` plus a domain
tail. A `crudCapabilitySchema` shared base captures the common subset at the
type level and adds a structural test that pins the literal-flat shape. The
issues schema is structurally distinct (uses `can_view_*_contexts` instead of
archive/restore/create-issue) and is **explicitly NOT** built from the shared
base — Loop B confirmed.

Audit ID = #65; developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 65 (`plan-loop-3-07-integration-v2.md:408`).
- [ ] Confirm prerequisites complete: #46 Commit E green; query-key factories
  available at `@/lib/queryKeys/*`.
- [ ] Verify parser at
  `scripts/security/authz_contract_validator/capability_catalog.py:112-126` is
  brace-matched only (read the function body before drafting any test).
- [ ] Verify each entity capability schema is currently a single
  `passthroughObject({ ... })` literal:
  - `frontend/src/services/api/schemas/entities/risks.ts` — locate `riskCapabilitiesSchema`.
  - `frontend/src/services/api/schemas/entities/controls.ts` — locate `controlCapabilitiesSchema`.
  - `frontend/src/services/api/schemas/entities/kris.ts` — locate `kriCapabilitiesSchema`.
  - `frontend/src/services/api/schemas/entities/vendors.ts:21-36` — locate `vendorCapabilitiesSchema`.
- [ ] Read `frontend/src/services/api/schemas/entities/issues.ts` and confirm
  `issueCapabilitiesSchema` does NOT include `can_read` / `can_update` (or
  uses `can_view_*_contexts` instead).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Tests (RED)

**Test file 1**: `tests/frontend/unit/src/services/api/schemas/__tests__/crudCapabilitySchema.contract.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CRUD_BASE_FIELDS, crudCapabilitySchema } from
    '@/services/api/schemas/crudCapabilitySchema';

const ENTITY_DIR = path.resolve(
    __dirname, '../../../../../../../frontend/src/services/api/schemas/entities',
);

describe('crudCapabilitySchema literal-flat contract (#65)', () => {
    it('exposes CRUD_BASE_FIELDS = ["can_read", "can_update"]', () => {
        expect([...CRUD_BASE_FIELDS]).toEqual(['can_read', 'can_update']);
    });

    it('schema shape has exactly can_read and can_update', () => {
        expect(Object.keys((crudCapabilitySchema as any).shape ?? {})).toEqual(['can_read', 'can_update']);
    });

    const entityFiles = ['risks.ts', 'controls.ts', 'kris.ts', 'vendors.ts'];
    it.each(entityFiles)('%s capability schema is literal-flat (no .merge / .extend)', (rel) => {
        const src = fs.readFileSync(path.join(ENTITY_DIR, rel), 'utf8');
        // Locate the capability schema by name in the file body.
        // Each entity's capability schema includes can_read/can_update verbatim.
        expect(src).toMatch(/can_read:\s*z\.boolean\(\)/);
        expect(src).toMatch(/can_update:\s*z\.boolean\(\)/);
        // Must NOT use .merge() or .extend() against crudCapabilitySchema.
        expect(src).not.toMatch(/crudCapabilitySchema\.(merge|extend)\b/);
    });
});
```

**Test file 2**: `tests/frontend/unit/src/services/api/schemas/__tests__/crudCapabilitySchema.parser.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../../../../');
const PARSER = path.join(REPO_ROOT, 'scripts/security/authz_contract_validator/capability_catalog.py');

// Use execFileSync (argv array) to avoid shell injection.
function parseSchema(file: string, schema: string): string[] {
    const out = execFileSync('python3', [
        PARSER, '--frontend-file',
        path.join(REPO_ROOT, 'frontend/src/services/api/schemas/entities', file),
        '--schema', schema,
    ], { encoding: 'utf8' });
    return JSON.parse(out).fields;
}

describe('capability_catalog parser still extracts each entity field set', () => {
    it.each([
        ['risks.ts', 'riskCapabilitiesSchema'],
        ['controls.ts', 'controlCapabilitiesSchema'],
        ['kris.ts', 'kriCapabilitiesSchema'],
        ['vendors.ts', 'vendorCapabilitiesSchema'],
    ])('parser returns can_read + can_update for %s', (file, schema) => {
        const fields = parseSchema(file, schema);
        expect(fields).toContain('can_read');
        expect(fields).toContain('can_update');
    });
});
```

**Test file 3**: `tests/frontend/unit/src/services/api/schemas/__tests__/issuesCapabilities.distinct.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ISSUES = path.resolve(
    __dirname,
    '../../../../../../../frontend/src/services/api/schemas/entities/issues.ts',
);

describe('issueCapabilitiesSchema is structurally distinct (#65)', () => {
    it('does not import crudCapabilitySchema', () => {
        const src = fs.readFileSync(ISSUES, 'utf8');
        expect(src).not.toMatch(/from '@\/services\/api\/schemas\/crudCapabilitySchema'/);
    });

    it('does not call .merge() against crudCapabilitySchema', () => {
        const src = fs.readFileSync(ISSUES, 'utf8');
        expect(src).not.toMatch(/crudCapabilitySchema\.merge/);
    });
});
```

**Expected result**: RED on file 1 (`crudCapabilitySchema` does not exist) and
file 2 (parser cannot find module). File 3 passes today (issues already
distinct) but will continue to pin the contract.

#### TDD Step 2 — Implement Change

**New file** `frontend/src/services/api/schemas/crudCapabilitySchema.ts`:

```ts
import { passthroughObject, z } from './common';

export const CRUD_BASE_FIELDS = ['can_read', 'can_update'] as const;
export type CrudBaseField = typeof CRUD_BASE_FIELDS[number];

/**
 * Shared CRUD base — common subset across risks/controls/kris/vendors.
 *
 * NOTE: Per-entity schemas MUST NOT use `.merge()` / `.extend()` against
 * this schema, because the capability catalog Zod parser at
 * `scripts/security/authz_contract_validator/capability_catalog.py:112-126`
 * uses brace-matched literal extraction and does not walk continuations.
 * Treat this as a type-level + test-level contract only.
 */
export const crudCapabilitySchema = passthroughObject({
    can_read: z.boolean(),
    can_update: z.boolean(),
});
```

**No edits** to `risks.ts` / `controls.ts` / `kris.ts` / `vendors.ts` schema
bodies (per the literal-flat constraint). The four entity schemas keep their
flat shape; the test suite enforces the contract.

`issues.ts` UNCHANGED (structurally distinct; pin verified by Test 3).

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run test:run -- crudCapabilitySchema
cd frontend && npm run test:run -- issuesCapabilities
python scripts/security/validate_authz_capability_contract.py  # exit 0
```

#### Lock/TOML/Contract updates (same commit)

- `docs/security/capability-catalog.json` — re-snapshot per-entity field
  counts after #37/#39 land (see Section 3 / Wave 6b for #39); this commit
  uses the current per-entity field counts and locks them in the test.
- `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml` —
  verify all per-entity capability keys present (no edits expected).

#### README / doc updates (same commit)

- `frontend/src/services/api/schemas/README.md` — explain the parser-compat
  constraint and why `.merge()` is forbidden in capability schemas. Quote the
  parser line range `:112-126`.

#### Verification commands (run all in order)

1. `cd frontend && npm run test:run -- crudCapabilitySchema.contract` — pass.
2. `cd frontend && npm run test:run -- crudCapabilitySchema.parser` — pass.
3. `cd frontend && npm run test:run -- issuesCapabilities.distinct` — pass.
4. `python scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `cd frontend && npm run lint && npx tsc --noEmit` — clean.
6. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled
`feat(frontend/schemas): add crudCapabilitySchema base + literal-flat parity tests`.

#### Rollback

- Class: **PURE-CODE** (test-only; new module is referenced only by tests).
- Procedure: revert removes new module + 3 tests. Per-entity schemas were
  never edited; rollback risk-free.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: ~6h (new module + 3 tests + parser invocation + verification).
- Risk: low — type-level contract; per-entity schemas unchanged.
- Mitigations: parser-compat test invokes the actual parser; structural test
  forbids `.merge` / `.extend`; positive presence test ensures CRUD base
  fields stay literal.

---

### Item #6 (Section 5) — #67 — Extract generic `useResourcePanelQuery`

**Wave**: 6a  | **Slot**: v2 Seq 66  | **Effort**: M (~6h)  | **Priority**: P3  | **Domain**: frontend

**Dependencies**: #46 (Seq 64; consumes typed `queryKey` factory)  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`frontend/src/components/riskhub/useRiskHubConfigResource.ts:79-179` mixes
domain-agnostic query orchestration with riskhub-specific panel state. The
generic `useResourcePanelQuery<TItem, TCreate, TUpdate>` extracts the CRUD
orchestration (load / create / update / delete / restore) into a typed hook
parameterised by an `adapter` carrying a typed `queryKey` from `#46`'s
factory. The original hook becomes a thin wrapper that combines the new
generic hook + `useRiskHubConfigPanelState`. Audit ID = #67; developer
verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 66 (`plan-loop-3-07-integration-v2.md:409`).
- [ ] Confirm prerequisites complete: #46 Commit E green.
- [ ] Read latest state of:
  - `frontend/src/components/riskhub/useRiskHubConfigResource.ts:1-179`
  - `frontend/src/components/riskhub/useRiskHubConfigPanelState.ts` (panel state, kept).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Tests (RED)

**Test file 1 (behavioral contract)**:
`tests/frontend/unit/src/hooks/__tests__/useResourcePanelQuery.contract.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useResourcePanelQuery } from '@/hooks/useResourcePanelQuery';

interface FakeItem { id: number; name: string }

const def = {
    queryKey: ['fake', 'list'] as const,
    list: vi.fn(async () => [{ id: 1, name: 'A' }, { id: 2, name: 'B' }]),
    create: vi.fn(async (p: { name: string }) => ({ id: 3, name: p.name })),
    update: vi.fn(async (id: number, p: { name: string }) => ({ id, name: p.name })),
    remove: vi.fn(async () => undefined),
    restore: vi.fn(async (id: number) => ({ id, name: 'restored' })),
};

beforeEach(() => Object.values(def).forEach((m) => typeof m === 'function' && (m as any).mockClear?.()));

describe('useResourcePanelQuery contract', () => {
    it('initial → loading → items', async () => {
        const { result } = renderHook(() => useResourcePanelQuery<FakeItem, { name: string }, { name: string }>(def));
        expect(result.current.isLoading).toBe(true);
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.items).toHaveLength(2);
    });

    it('handleSave create then update', async () => {
        const { result } = renderHook(() => useResourcePanelQuery(def));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        await act(async () => { await result.current.handleSave({ id: undefined, payload: { name: 'C' } }); });
        expect(def.create).toHaveBeenCalledOnce();
        await act(async () => { await result.current.handleSave({ id: 1, payload: { name: 'A2' } }); });
        expect(def.update).toHaveBeenCalledOnce();
    });

    it('handleDelete invokes remove', async () => {
        const { result } = renderHook(() => useResourcePanelQuery(def));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        await act(async () => { await result.current.handleDelete(1); });
        expect(def.remove).toHaveBeenCalledWith(1);
    });

    it('handleRestore invokes restore', async () => {
        const { result } = renderHook(() => useResourcePanelQuery(def));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        await act(async () => { await result.current.handleRestore(1); });
        expect(def.restore).toHaveBeenCalledWith(1);
    });
});
```

**Test file 2 (structural)**:
`tests/frontend/unit/src/hooks/__tests__/useResourcePanelQuery.structural.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const TARGET = path.resolve(
    __dirname, '../../../../../../frontend/src/components/riskhub/useRiskHubConfigResource.ts',
);

describe('useRiskHubConfigResource refactored to thin wrapper (#67)', () => {
    it('file is <= 60 lines', () => {
        const src = fs.readFileSync(TARGET, 'utf8');
        expect(src.split('\n').length).toBeLessThanOrEqual(60);
    });

    it('imports useResourcePanelQuery and useRiskHubConfigPanelState', () => {
        const src = fs.readFileSync(TARGET, 'utf8');
        expect(src).toMatch(/from '@\/hooks\/useResourcePanelQuery'/);
        expect(src).toMatch(/from '\.\/useRiskHubConfigPanelState'/);
    });
});
```

**Expected result**: RED. Module does not exist; original file is 179 lines.

#### TDD Step 2 — Implement Change

**New file** `frontend/src/hooks/useResourcePanelQuery.ts`:

```ts
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface ResourcePanelQueryDefinition<TItem extends { id: number }, TCreate, TUpdate> {
    queryKey: readonly unknown[];
    list: (signal?: AbortSignal) => Promise<TItem[]>;
    create: (payload: TCreate) => Promise<TItem>;
    update: (id: number, payload: TUpdate) => Promise<TItem>;
    remove: (id: number) => Promise<void>;
    restore: (id: number) => Promise<TItem>;
}

export function useResourcePanelQuery<TItem extends { id: number }, TCreate, TUpdate>(
    definition: ResourcePanelQueryDefinition<TItem, TCreate, TUpdate>,
) {
    const qc = useQueryClient();
    const { data, isLoading, error } = useQuery({
        queryKey: definition.queryKey,
        queryFn: ({ signal }) => definition.list(signal),
    });
    const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: definition.queryKey }), [qc, definition.queryKey]);

    const handleSave = useCallback(async (input: { id?: number; payload: TCreate | TUpdate }) => {
        if (input.id === undefined) await definition.create(input.payload as TCreate);
        else await definition.update(input.id, input.payload as TUpdate);
        await invalidate();
    }, [definition, invalidate]);

    const handleDelete = useCallback(async (id: number) => { await definition.remove(id); await invalidate(); }, [definition, invalidate]);
    const handleRestore = useCallback(async (id: number) => { await definition.restore(id); await invalidate(); }, [definition, invalidate]);

    return { items: data ?? [], isLoading, error, handleSave, handleDelete, handleRestore };
}
```

**Edit** `frontend/src/components/riskhub/useRiskHubConfigResource.ts`:
collapse to a thin wrapper (≤60 lines) that constructs the
`ResourcePanelQueryDefinition` from the riskhub-specific service module and
combines `useResourcePanelQuery(...)` with `useRiskHubConfigPanelState(...)`.
Pull `queryKey` from `riskHubKeys.<resource>(...)` (per #46).

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run test:run -- useResourcePanelQuery
cd frontend && npm run test:run -- riskhub
```

#### Lock/TOML/Contract updates (same commit)

- None.

#### README / doc updates (same commit)

- `frontend/src/hooks/README.md` — add `useResourcePanelQuery` entry; cite the
  `ResourcePanelQueryDefinition<TItem, TCreate, TUpdate>` adapter shape.

#### Verification commands (run all in order)

1. `cd frontend && npm run test:run -- useResourcePanelQuery.contract` — pass.
2. `cd frontend && npm run test:run -- useResourcePanelQuery.structural` — pass.
3. `cd frontend && npm run test:run -- riskhub` — riskhub regression green.
4. `cd frontend && npm run lint && npx tsc --noEmit` — clean.

#### Commit boundary

Single commit titled
`refactor(frontend/hooks): extract generic useResourcePanelQuery from useRiskHubConfigResource`.

#### Rollback

- Class: **PURE-CODE**.
- Procedure: revert restores the 179-line hook; behavior identical (the new
  hook is purely structural).
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: ~6h (new generic + wrapper rewrite + 2 tests + verification).
- Risk: medium — react-query cache invalidation must invalidate the same key
  the inline literal previously used; the test pins this end-to-end.
- Mitigations: behavioral contract test exercises load/create/update/delete/
  restore; structural test pins file size & imports.

---

### Item #6S (Section 5) — #32 — Extract generic vendor linked-entity tab (S5.8)

**Note**: Inserted between Item #6 and Item #7 for Wave 6a. Suffix `#6S`
preserves Section 5's existing item numbering through Item #18 instead of
forcing a +1 renumber across the rest of the section. Section 2 master
sequence still pins this as Seq 66 / Wave 6a. Source:
`recipe-06-frontend-deadcode.md:498-738`.

**Wave**: 6a  | **Slot**: v2 Seq 66  | **Effort**: M  | **Priority**: P3  | **Domain**: frontend

**Dependencies**: none
**Atomic with**: none
**Validator?**: no

#### Why this work

Three vendor linked-entity tabs share ~95% structure:
`frontend/src/components/vendors/VendorLinkedRisksTab.tsx` (200 lines),
`VendorLinkedControlsTab.tsx` (203 lines), and `VendorLinkedKRIsTab.tsx`
(200 lines). Each carries the same `(linkedItems, isLoading, error,
isDialogOpen, dialogMode)` state machine, `refresh()` callback, `useEffect`
for refresh, `existingLinks` memo, `activeItems / archivedItems` partition,
`handleLink / handleUnlink`, and identical render structure (header,
loading/error/empty/grid, manage-existing button, `LinkManagementDialog`).
The 5%-different parts are: the service calls (`vendorLinkApi.getLinkedRisks`
vs `getLinkedControls` vs `getLinkedKRIs`), the card component
(`VendorLinkedRiskCard` vs `VendorLinkedControlCard` vs `KRIGaugeCard`),
the `existingLinks` mapping (which keys: `risk_id` / `control_id` /
`kri_id` and `display_name` derivation), the i18n key set
(`tabs.linked_risks` / `tabs.linked_controls` / `tabs.linked_kris` plus
matching subtitle/empty/archived/dialog/add-action keys), the
`LinkManagementDialog mode` (`'control-to-risk'` / `'risk-to-control'` /
`'vendor-to-kri'`), the icon + accent color in the header, and an optional
`dataTestIdPrefix` (KRI tab carries `data-testid` attributes the others
don't). Audit ID = #32 (S5.8); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 66 (`plan-loop-3-07-integration-v2.md`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of:
  - `frontend/src/components/vendors/VendorLinkedRisksTab.tsx`
  - `frontend/src/components/vendors/VendorLinkedControlsTab.tsx`
  - `frontend/src/components/vendors/VendorLinkedKRIsTab.tsx`
  - `frontend/src/components/vendors/LinkManagementDialog.tsx` (mode contract).
- [ ] Pre-existing tests under `tests/frontend/unit/src/components/vendors/`
  enumerate the surface to keep green after the rewrite.
- [ ] No concurrent feature-work conflicts on the three tabs.

#### TDD Step 1 — Write Failing Tests (RED)

**Hook test (new)**:
`tests/frontend/unit/src/components/vendors/useVendorLinkedEntities.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useVendorLinkedEntities, type VendorLinkedEntitiesAdapter } from
    '@/components/vendors/useVendorLinkedEntities';

interface FakeItem { id: number; name: string; is_archived: boolean }

const adapter: VendorLinkedEntitiesAdapter<FakeItem> = {
    fetch: vi.fn(async () => [
        { id: 1, name: 'A', is_archived: false },
        { id: 2, name: 'B', is_archived: true },
    ]),
    link: vi.fn(async () => undefined),
    unlink: vi.fn(async () => undefined),
    isArchived: (i) => i.is_archived,
    toExistingLink: (i) => ({ display_name: i.name, id: i.id, effectiveness: 'linked' }),
    errorLogPrefix: 'test:',
};

beforeEach(() => vi.clearAllMocks());

describe('useVendorLinkedEntities', () => {
    it('partitions active / archived items after first load', async () => {
        const { result } = renderHook(() => useVendorLinkedEntities(7, adapter));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.active).toHaveLength(1);
        expect(result.current.archived).toHaveLength(1);
        expect(adapter.fetch).toHaveBeenCalledWith(7);
    });

    it('refreshes after link', async () => {
        const { result } = renderHook(() => useVendorLinkedEntities(7, adapter));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        await act(async () => { await result.current.link(99); });
        expect(adapter.link).toHaveBeenCalledWith(7, 99);
        expect(adapter.fetch).toHaveBeenCalledTimes(2); // initial + post-link refresh
    });

    it('exposes error state when fetch throws', async () => {
        const failing: VendorLinkedEntitiesAdapter<FakeItem> = {
            ...adapter,
            fetch: vi.fn(async () => { throw new Error('boom'); }),
        };
        const { result } = renderHook(() => useVendorLinkedEntities(7, failing));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.error).toBeTruthy();
    });
});
```

**Component test (new)**:
`tests/frontend/unit/src/components/vendors/VendorLinkedEntitiesTab.test.tsx`
— render the generic with a stub adapter (MSW-backed if the adapter goes
through the api), assert header text, empty-state copy, manage button, and
dialog-open-on-link-click. Existing tests for the three concrete tabs under
`tests/frontend/unit/src/components/vendors/` continue to run unchanged
after the wrappers are reduced — they exercise the same surface.

**Expected**: RED. New module + new generic do not yet exist.

#### TDD Step 2 — Implement Change

**New file** `frontend/src/components/vendors/useVendorLinkedEntities.ts`
(≤80 lines): lift the state machine from any one of the three tabs verbatim,
replace the service/type calls with adapter calls.

```ts
export interface VendorLinkedEntitiesAdapter<T> {
    fetch: (vendorId: number) => Promise<T[]>;
    link: (vendorId: number, entityId: number) => Promise<unknown>;
    unlink: (vendorId: number, entityId: number) => Promise<unknown>;
    isArchived: (item: T) => boolean;
    toExistingLink: (item: T) => ExistingLinkItem;
    errorLogPrefix: string; // e.g. 'Failed to load linked risks:'
}

export function useVendorLinkedEntities<T>(
    vendorId: number,
    adapter: VendorLinkedEntitiesAdapter<T>,
): {
    items: T[];
    active: T[];
    archived: T[];
    existingLinks: ExistingLinkItem[];
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    link: (entityId: number) => Promise<void>;
    unlink: (entityId: number) => Promise<void>;
};
```

**New file** `frontend/src/components/vendors/VendorLinkedEntitiesTab.tsx`
(≤170 lines): lift JSX from `VendorLinkedRisksTab.tsx` and replace fixed
strings with props. Keep `motion.div` initial/animate/transition props
parameterized.

```tsx
export interface VendorLinkedEntitiesTabProps<T> {
    vendorId: number;
    adapter: VendorLinkedEntitiesAdapter<T>;
    canCreate: boolean;
    canEdit: boolean;
    onAdd: () => void;
    renderCard: (item: T, onClick: () => void) => ReactNode;
    onNavigate: (entityId: number) => void;
    icon: ReactNode;
    headerColorClass: string; // 'text-indigo-400' / 'text-emerald-400' / 'text-amber-400'
    i18nKeys: {
        tabTitle: string; // 'tabs.linked_risks'
        subtitle: string;
        empty: string;
        archived: string; // i18n key with {count}
        dialogTitle: string;
        addAction: string; // 'links.actions.add_risk'
    };
    linkDialogMode: 'control-to-risk' | 'risk-to-control' | 'vendor-to-kri';
    dataTestIdPrefix?: string; // optional, e.g. 'vendor-linked-kris'
    motionDelay?: number; // 0, 0.05, 0.1
}
```

**Edit** the three concrete tabs to thin wrappers (~30-40 lines each):

```tsx
import { LinkIcon } from 'lucide-react';
import { VendorLinkedRiskCard } from '@/components/vendors/VendorLinkedRiskCard';
import { VendorLinkedEntitiesTab } from './VendorLinkedEntitiesTab';
import { vendorLinkApi } from '@/services/vendorLinkApi';
import type { LinkedRisk } from '@/types/vendorLink';

const risksAdapter = {
    fetch: vendorLinkApi.getLinkedRisks,
    link: vendorLinkApi.linkRisk,
    unlink: vendorLinkApi.unlinkRisk,
    isArchived: (r: LinkedRisk) => r.is_archived,
    toExistingLink: (r: LinkedRisk) => ({
        display_name: `${r.risk_id_code}: ${r.name}`,
        id: r.id,
        effectiveness: 'linked' as const,
        risk_id: r.id,
    }),
    errorLogPrefix: 'Failed to load linked risks:',
};

export function VendorLinkedRisksTab(props: {
    vendorId: number; canCreateRisk: boolean; canEdit: boolean;
    onAddRisk: () => void; onNavigateToRisk: (id: number) => void;
}) {
    return (
        <VendorLinkedEntitiesTab
            vendorId={props.vendorId}
            adapter={risksAdapter}
            canCreate={props.canCreateRisk}
            canEdit={props.canEdit}
            onAdd={props.onAddRisk}
            renderCard={(item, onClick) => (
                <VendorLinkedRiskCard key={item.id} risk={item} onClick={onClick} />
            )}
            onNavigate={props.onNavigateToRisk}
            icon={<LinkIcon className="h-5 w-5 text-indigo-400" />}
            headerColorClass="text-indigo-400"
            i18nKeys={{
                tabTitle: 'tabs.linked_risks',
                subtitle: 'links.risks.subtitle',
                empty: 'links.risks.empty',
                archived: 'links.archived_risks',
                dialogTitle: 'links.dialogs.link_risks_title',
                addAction: 'links.actions.add_risk',
            }}
            linkDialogMode="control-to-risk"
        />
    );
}
```

Apply analogous wrapper rewrites to `VendorLinkedControlsTab` and
`VendorLinkedKRIsTab`. The KRI wrapper sets
`dataTestIdPrefix='vendor-linked-kris'` and `motionDelay={0.1}`.

**Files to create**:
- `frontend/src/components/vendors/useVendorLinkedEntities.ts`
- `frontend/src/components/vendors/VendorLinkedEntitiesTab.tsx`
- `tests/frontend/unit/src/components/vendors/useVendorLinkedEntities.test.tsx`
- `tests/frontend/unit/src/components/vendors/VendorLinkedEntitiesTab.test.tsx`

**Files to edit**:
- `frontend/src/components/vendors/VendorLinkedRisksTab.tsx` (reduce to wrapper)
- `frontend/src/components/vendors/VendorLinkedControlsTab.tsx` (reduce to wrapper)
- `frontend/src/components/vendors/VendorLinkedKRIsTab.tsx` (reduce to wrapper)

**Files to delete**: none.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run lint
cd frontend && npx tsc --noEmit
cd frontend && npm run test:run -- vendors
```

All vendor tests stay green; the new generic + hook tests pass.

#### Lock/TOML/Contract updates (same commit)

- None.

#### README / doc updates (same commit)

- `frontend/src/components/vendors/README.md` (describe-shell) — add the
  new generic + hook entry; cite the
  `VendorLinkedEntitiesAdapter<T>` shape.

#### Verification commands (run all in order)

1. `cd frontend && npm run test:run -- useVendorLinkedEntities` — pass.
2. `cd frontend && npm run test:run -- VendorLinkedEntitiesTab` — pass.
3. `cd frontend && npm run test:run -- vendors` — full vendor suite green.
4. `cd frontend && npm run lint && npx tsc --noEmit` — clean.

#### Commit boundary

Single commit titled
`refactor(vendors): extract generic VendorLinkedEntitiesTab + useVendorLinkedEntities`.

#### Rollback

- Class: **PURE-CODE**.
- Procedure: revert restores the three full tab implementations; behavior
  identical (the new generic is purely structural).
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: ~M (generic component + hook + 3 wrapper rewrites + 2 tests).
- Risk: low — purely structural; the three concrete tabs become thin
  wrappers and existing per-tab tests continue to enforce behavior.
- Mitigations: hook contract test pins state machine; component test
  exercises the generic's render path; pre-existing per-tab tests stay green.

#### Open questions (resolved)

- Should the generic also handle the "add new" two-button bar (Link
  existing + Add)? **Decision** (Phase 4): yes — keep both buttons in the
  generic. Use `canCreate` to gate visibility. The `onAdd` callback is
  required.
- Should we move the i18n key list into a discriminated union? **Defer** —
  string props are explicit and easier to grep than a discriminated union;
  revisit if a 4th vendor linked-entity surface appears.

---

### Item #7 (Section 5) — #62 — Relocate `kri_vendor_assignment.py` + per-row audit events

**Wave**: 6a  | **Slot**: v2 Seq 67  | **Effort**: M (~half-day to one day)  | **Priority**: P3  | **Domain**: kris

**Dependencies**: none (structurally independent of #69 per Phase 4)  
**Atomic with**: none  
**Validator?**: no — but lock-line travels with file move

#### Why this work

`backend/app/services/kri_vendor_assignment.py:81-119` mutates
`VendorRiskLink` and `VendorKRILink` directly with **0 audit events** today.
Canonical `_vendor_links/workflow.py:285,322` emits `vendor_link_created` /
`vendor_link_deleted` per row. This recipe relocates the module under
`_vendor_links/` and rewrites `assign_vendors_to_kri` to call the canonical
per-row mutators, restoring audit completeness. Audit ID = #62; developer
verdict = ACCEPT.

> **Phase 4/Phase 6 Audit-cardinality decision: PER-ROW EVENTS.** Bulk KRI/
> vendor reconciliation must emit one `vendor_link_created` /
> `vendor_link_deleted` event PER ROW, matching canonical pattern. Rationale:
> audit completeness, idempotent replay, customer-visible diff is purely
> additive (0 → N events), lock alignment with
> `test_w4_bc_c_vendor_governance_boundaries_red.py:16`.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 67 (per `plan-loop-3-07-integration-v2.md:412` legacy slot 69; renumber within Wave 6a).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of:
  - `backend/app/services/kri_vendor_assignment.py:81-119`
  - `backend/app/services/_vendor_links/workflow.py:265-333`
  - `backend/app/services/_vendor_links/workflow.py:285,322` (canonical emit sites)
  - `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py:16` (lock line)
  - 4 importers:
    - `backend/app/api/v1/endpoints/kris/crud/create.py:16-18`
    - `backend/app/services/_approval_execution/kri_generic_edit.py:16`
    - `backend/app/services/_entity_mutation_lifecycle/direct_apply.py:23`
    - `backend/app/services/_entity_mutation_lifecycle/policy.py:22`
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Tests (RED)

**Test file 1 (audit-cardinality behavioral)**:
`tests/backend/pytest/test_kri_vendor_assignment_audit_red.py`

```python
"""KRI vendor assignment emits per-row audit events (#62)."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.contract


@pytest.mark.asyncio
async def test_kri_vendor_assignment_emits_per_row_audit_events(
    client_factory, db_session, kri_with_vendors, current_user,
) -> None:
    kri = kri_with_vendors.kri
    v1, v2, v3, v4 = kri_with_vendors.vendor_ids
    async with client_factory(current_user=current_user) as ac:
        await ac.post(f"/api/v1/kris/{kri.id}/vendors", json={"vendor_ids": [v1, v2, v3]})
        await ac.post(f"/api/v1/kris/{kri.id}/vendors", json={"vendor_ids": [v1, v2, v4]})

    from tests.helpers.audit import load_kri_audit_events
    events = await load_kri_audit_events(db_session, kri.id)
    created_kri = [e for e in events if e.action == "vendor_link_created" and e.link_kind == "kri"]
    deleted_kri = [e for e in events if e.action == "vendor_link_deleted" and e.link_kind == "kri"]
    assert len(created_kri) == 4  # 3 initial + 1 add (v4)
    assert len(deleted_kri) == 1   # 1 removal (v3)
```

**Test file 2 (structural relocation)**: extend
`tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py`
to add an explicit absence assertion:

```python
def test_kri_vendor_assignment_old_path_is_removed() -> None:
    assert not (REPO_ROOT / "backend/app/services/kri_vendor_assignment.py").exists()
```

**Test file 3 (no direct table mutation)**: same architecture file or new
`tests/backend/pytest/architecture/test_kri_assignment_no_direct_mutation_red.py`:

```python
def test_kri_assignment_uses_canonical_link_mutators() -> None:
    path = REPO_ROOT / "backend/app/services/_vendor_links/kri_assignment.py"
    text = path.read_text(encoding="utf-8")
    for forbidden in ("db.add(VendorRiskLink(", "db.add(VendorKRILink(", "await db.delete(link)"):
        assert forbidden not in text, f"direct table mutation {forbidden} in {path}"
```

**Expected result**: RED on all three (file at old path; 0 audit events; 3
direct mutations at old path lines `:102,112,117`).

#### TDD Step 2 — Implement Change

1. **Move** `backend/app/services/kri_vendor_assignment.py` →
   `backend/app/services/_vendor_links/kri_assignment.py` (use `git mv`).
2. **Rewrite** `assign_vendors_to_kri` body. Replace parent-risk reconciliation
   block (old `:91-102`) with per-row
   `await link_vendor_target(db, vendor_id=..., current_user=..., kind="risk", entity_id=kri.risk_id, log_activity_func=log_activity)`
   calls (only for vendors not already linked to the parent risk).
3. **Replace** KRI link reconciliation block (old `:104-117`) with per-row
   `await unlink_vendor_target(...)` for removals + per-row
   `await link_vendor_target(..., kind="kri", entity_id=kri.id, ...)` for
   additions.
4. **Preserve** return type `list[int]`; keep `normalize_vendor_ids`,
   `validate_assignable_vendors`, `ensure_vendors_exist`,
   `get_kri_vendor_ids` signatures unchanged (non-mutating callers depend on them).
5. **Update 4 importers** to the new path:
   - `backend/app/api/v1/endpoints/kris/crud/create.py:16-18` —
     `from app.services.kri_vendor_assignment import (...)` →
     `from app.services._vendor_links.kri_assignment import (...)`.
   - `backend/app/services/_approval_execution/kri_generic_edit.py:16` — same.
   - `backend/app/services/_entity_mutation_lifecycle/direct_apply.py:23` — same.
   - `backend/app/services/_entity_mutation_lifecycle/policy.py:22` — same.
6. **Update lock line** at
   `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py:16`
   from `"backend/app/services/kri_vendor_assignment.py"` to
   `"backend/app/services/_vendor_links/kri_assignment.py"`.

> **ADR-002 caveat**: `link_vendor_target` / `unlink_vendor_target` each call
> `await db.commit()` on success (`_vendor_links/workflow.py:293,329`). The
> rewritten `assign_vendors_to_kri` MUST NOT add a redundant outer
> `db.commit()` — per-row mutators own their boundaries. Verify all 4 importers
> tolerate per-row commits (do not wrap the call in an outer transaction); if
> any does, refactor that caller in the same commit.

#### TDD Step 3 — Confirm GREEN

```
make -f scripts/Makefile test-architecture-locks
python scripts/security/validate_authz_capability_contract.py
pytest tests/backend/pytest/test_kri_vendor_assignment_audit_red.py
pytest tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py
pytest tests/backend/pytest/test_kris_rbac.py
pytest tests/backend/pytest/test_approval_workflow.py
```

#### Lock/TOML/Contract updates (same commit)

- `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py:16`
  — change the `VENDOR_SERVICE_FILES` entry path.

#### README / doc updates (same commit)

- `docs/security/authorization-capability-contract.md` — search for
  `kri_vendor_assignment.py`; update path to new location if present
  (Loop A noted near `:172`).
- `docs/security/authorization-capability-contract.json` — same.
- `backend/app/services/_vendor_links/README.md` — add `kri_assignment.py`
  inventory row.
- `backend/app/services/README.md` — remove old `kri_vendor_assignment.py`
  row if listed.

#### Verification commands

```
make -f scripts/Makefile test-architecture-locks
python scripts/security/validate_authz_capability_contract.py
pytest tests/backend/pytest/test_kri_vendor_assignment_audit_red.py \
       tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py \
       tests/backend/pytest/test_kris_rbac.py \
       tests/backend/pytest/test_approval_workflow.py
rg "VendorRiskLink|VendorKRILink" backend/app/services/_vendor_links/kri_assignment.py
rg "kri_vendor_assignment" backend/ tests/ docs/
```

Last `rg` returns no hits at the old path.

#### Commit boundary

**Single commit**. Relocation + rewrite + 4 importer rewrites + lock-line
update + doc updates + new audit-cardinality test together. Splitting risks
half-routed audit emissions in production.

#### Rollback

- Class: **PURE-CODE** (no schema change).
- Procedure: revert the single commit; old file restored at old path; old
  lock-line restored. The new behavioral test fires red on rollback as a
  safety net (intentional — documents the per-row decision).
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: ~half-day to one day M.
- Risk: medium — bulk reconciliation now emits N events instead of 0; some
  notification trigger filters may need adjustment if they aggregate per-bulk-
  call. Mitigation: per-row matches canonical pattern already in production
  for non-bulk paths.

---

### Item #8 (Section 5) — #77a — Pre-migration Vendor.status FE Zod soft-tolerate test

**Wave**: 6a  | **Slot**: v2 Seq 69  | **Effort**: S (~30 min - 1h)  | **Priority**: P3  | **Domain**: frontend

**Dependencies**: none  
**Atomic with**: paired temporally with #77b (Wave 8) and #69+#70 (Wave 8 atomic)  
**Validator?**: no

#### Why this work

#69+#70 (Wave 8 atomic) drops `Vendor.status` from the API. Between BE deploy
and FE bundle ship the response payload temporarily lacks the `status` field;
`vendorSchema` at `frontend/src/services/api/schemas/entities/vendors.ts:62`
declares `status: z.enum(['active'])` (required), so the parser would fail.
This pre-migration test relaxes `status` to `.optional()` so deploy-skew is
tolerated. The post-migration cleanup (#77b in Wave 8) removes `status`
entirely. Audit ID = #77a; developer verdict = ACCEPT.

> **Phase 6 critical**: use the literal `'active'` (NOT
> `VENDOR_STATUS_VALUES[0]`). The literal is what the parser walks; any
> indirection breaks the catalog parser.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 69 (per Section 2 final sequence).
- [ ] Confirm prerequisites complete: none. (Must precede #69+#70 Wave 8 atomic.)
- [ ] Read current state of:
  - `frontend/src/services/api/schemas/entities/vendors.ts` (especially
    `vendorSchema` `status: z.enum(['active'])` line).
  - `frontend/src/types/vendor.ts:1,64,94` (status type declarations).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/frontend/unit/src/services/api/schemas/__tests__/vendors.statusOptional.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { vendorSchema } from '@/services/api/schemas/entities/vendors';

const baseVendor = {
    id: 1,
    name: 'Acme',
    process: 'P1',
    outsourcing_owner_user_id: 1,
    linked_risks: [],
    vendor_type: 'ict' as const,
    risk_score_1_5: 3,
    supports_important_core_insurance_function: false,
    dora_relevant: false,
    is_significant_vendor: false,
    has_alternative_providers: true,
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
};

describe('vendorSchema soft-tolerates missing status (pre-migration #69+#70)', () => {
    it('accepts payload WITH status: active (literal)', () => {
        const result = vendorSchema.safeParse({ ...baseVendor, status: 'active' });
        expect(result.success).toBe(true);
    });

    it('accepts payload WITHOUT status field', () => {
        const result = vendorSchema.safeParse(baseVendor);
        expect(result.success).toBe(true); // tolerates deploy-skew
    });
});
```

**Companion sanity test**:
`tests/frontend/unit/src/services/api/schemas/__tests__/vendors.statusOptional.lookup.test.ts`
(asserts `linkedVendorSummarySchema:9` already declares
`status: z.string().nullable().optional()` — confirmed soft-tolerant).

**Expected result**: RED on `accepts payload WITHOUT status field` (today
`vendorSchema.status` is required).

#### TDD Step 2 — Implement Change

**Edit** `frontend/src/services/api/schemas/entities/vendors.ts` at the line
declaring `status: z.enum(['active'])` (currently `:62` — verify; may shift
to `:63` after Wave 6a edits land):

```diff
- status: z.enum(['active']),
+ // Pre-migration soft-tolerate (item #77a) — restored to z.enum(['active']) after #69+#70 in #77b.
+ status: z.enum(['active']).optional(),
```

**Edit** `frontend/src/types/vendor.ts:64` (the `Vendor.status` field):

```diff
- status: VendorStatus;
+ status?: VendorStatus;  // optional during pre-migration #77a; field removed entirely in #77b
```

> Use the literal `'active'` in the Zod schema. Do NOT introduce
> `VENDOR_STATUS_VALUES[0]` indirection.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run test:run -- vendors.statusOptional
cd frontend && npm run test:run -- schemas       # broad regression
cd frontend && npx tsc --noEmit
```

#### Lock/TOML/Contract updates (same commit)

- None at this stage. `_endpoint_commit_allowlist.toml` Vendor surfaces remain
  green; #69+#70 will rewrite them.

#### README / doc updates (same commit)

- `docs/migrations/vendor-status-removal.md` (new or extend) — note that #77a
  is the FE pre-test landing in this commit; #77b is the post-migration
  cleanup in Wave 8. Cross-reference Alembic revision `k6l7m8n9o0p1`.

#### Verification commands

1. `cd frontend && npm run test:run -- vendors.statusOptional` — pass.
2. `cd frontend && npm run test:run -- schemas` — broad regression pass.
3. `cd frontend && npx tsc --noEmit` — clean.
4. `cd frontend && npm run lint` — clean.

#### Commit boundary

Single commit titled
`test(frontend/vendors): soft-tolerate missing Vendor.status pre-migration #69+#70`.

#### Rollback

- Class: **CROSS-COMMIT** (sequenced with #69+#70).
- Procedure: revert restores `status: z.enum(['active'])` (required). If
  rollback happens AFTER the BE migration has landed, the FE will reject
  vendor payloads. Coordinate so rollback order is FE-rollback → BE-rollback.
- Estimated revert time: 5 min (FE only).

#### Effort & Risk

- Estimated time: ~30 min - 1h S (Phase 4 promoted to Wave 6a).
- Risk: low — purely tolerant relaxation; no consumer breaks (existing
  `status: 'active'` payloads still parse).
- Mitigations: 2 explicit tests pin both with-status and without-status paths;
  type relaxation is reverted to absent in #77b.

---

### Item #9 (Section 5) — #45a — Ownership prerequisite characterization tests

**Wave**: 6a  | **Slot**: v2 Seq 67 (per Section 2 sequence; v2 line 414 legacy 71)  | **Effort**: M (~half-day)  | **Priority**: P4  | **Domain**: crosscut

**Dependencies**: none — gate node for #45b (Wave 7)  
**Atomic with**: none  
**Validator?**: no

#### Why this work

#45b (ownership resolver factory; Wave 7 Seq 74) replaces 8 free functions in
`backend/app/core/_permissions/ownership.py:1-142` with a factory call. Before
that refactor lands, three characterization tests must pin the EXISTING
ownership behavior so the factory rewrite is provably equivalent. Phase 4
verified the KRI archived-filter asymmetry: `ownership.py:33` and `:68`
filter `is_archived.is_(False)` (risk-scope paths); `:1-13` and `:40-51`
do NOT (KRI-direct paths). Audit ID = #45a; developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 67 (Phase 6 placement; legacy 71).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of `backend/app/core/_permissions/ownership.py:1-142`,
  especially:
  - `:1-13` `is_kri_reporting_owner` (KRI-direct, no archive filter)
  - `:33` `is_risk_kri_reporting_owner` (risk-scope, archive-filtered)
  - `:40-51` `get_kri_ids_where_reporting_owner` (KRI-direct, no archive filter)
  - `:68` `get_risk_ids_where_kri_reporting_owner` (risk-scope, archive-filtered)
  - `:90-108` `is_risk_control_owner` (control join semantics)
- [ ] Confirm fixture factories exist or will be added:
  `archived_kri_with_reporting_owner`, `control_owned_by_user_linked_to_risk`,
  `control_linked_to_risk_owned_by_other`, `control_owned_by_user_unlinked`,
  `fixture_universe`.

#### TDD Step 1 — Write 3 SEPARATE Test Files (characterization; pass on current code)

**Decision**: write 3 SEPARATE test files. Each characterizes a distinct
invariant; separate files keep failure attribution tight and let #45b's
factory-equivalence test reuse fixtures.

**File 1**: `tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py`

```python
"""KRI archived asymmetry — KRI-direct does NOT filter; risk-scope DOES."""
from __future__ import annotations

import pytest

from app.core.permissions import (
    get_kri_ids_where_reporting_owner,
    get_risk_ids_where_kri_reporting_owner,
    is_kri_reporting_owner,
    is_risk_kri_reporting_owner,
)

pytestmark = pytest.mark.contract


@pytest.mark.asyncio
async def test_is_kri_reporting_owner_returns_true_for_archived_kri(
    db_session, archived_kri_with_reporting_owner,
) -> None:
    """`is_kri_reporting_owner` (ownership.py:1-13) does NOT filter is_archived."""
    user_id = archived_kri_with_reporting_owner.reporting_owner_id
    kri_id = archived_kri_with_reporting_owner.id
    assert await is_kri_reporting_owner(db_session, user_id, kri_id) is True


@pytest.mark.asyncio
async def test_get_kri_ids_where_reporting_owner_includes_archived(
    db_session, archived_kri_with_reporting_owner,
) -> None:
    """`get_kri_ids_where_reporting_owner` (ownership.py:40-51) does NOT filter is_archived."""
    user_id = archived_kri_with_reporting_owner.reporting_owner_id
    ids = await get_kri_ids_where_reporting_owner(db_session, user_id)
    assert archived_kri_with_reporting_owner.id in ids


@pytest.mark.asyncio
async def test_is_risk_kri_reporting_owner_excludes_archived(
    db_session, archived_kri_with_reporting_owner,
) -> None:
    """`is_risk_kri_reporting_owner` (ownership.py:33) DOES filter is_archived."""
    user_id = archived_kri_with_reporting_owner.reporting_owner_id
    risk_id = archived_kri_with_reporting_owner.risk_id
    assert await is_risk_kri_reporting_owner(db_session, user_id, risk_id) is False


@pytest.mark.asyncio
async def test_get_risk_ids_where_kri_reporting_owner_excludes_archived(
    db_session, archived_kri_with_reporting_owner,
) -> None:
    """`get_risk_ids_where_kri_reporting_owner` (ownership.py:68) DOES filter is_archived."""
    user_id = archived_kri_with_reporting_owner.reporting_owner_id
    risk_ids = await get_risk_ids_where_kri_reporting_owner(db_session, user_id)
    assert archived_kri_with_reporting_owner.risk_id not in risk_ids
```

**File 2**: `tests/backend/pytest/test_ownership_resolver_control_join.py`

```python
"""Control join semantics — requires both ControlRiskLink AND owner match."""
from __future__ import annotations

import pytest

from app.core.permissions import is_risk_control_owner

pytestmark = pytest.mark.contract


@pytest.mark.asyncio
async def test_is_risk_control_owner_requires_link_and_owner_match(
    db_session, control_owned_by_user_linked_to_risk, user,
) -> None:
    """ownership.py:90-108 requires BOTH ControlRiskLink row AND control_owner_id == user_id."""
    risk_id = control_owned_by_user_linked_to_risk.risk_id
    assert await is_risk_control_owner(db_session, user.id, risk_id) is True


@pytest.mark.asyncio
async def test_is_risk_control_owner_false_when_link_present_but_owner_differs(
    db_session, control_linked_to_risk_owned_by_other, user,
) -> None:
    risk_id = control_linked_to_risk_owned_by_other.risk_id
    assert await is_risk_control_owner(db_session, user.id, risk_id) is False


@pytest.mark.asyncio
async def test_is_risk_control_owner_false_when_owner_match_but_link_absent(
    db_session, control_owned_by_user_unlinked, other_risk, user,
) -> None:
    """Owner matches, no link → False (the inner-join at ownership.py:104)."""
    assert await is_risk_control_owner(db_session, user.id, other_risk.id) is False
```

**File 3**: `tests/backend/pytest/test_visible_ids_via_ownership.py`

```python
"""visible_*_ids unions department-scope and ownership-scope across 9 roles."""
from __future__ import annotations

import pytest

from app.core.permissions import (
    visible_control_ids,
    visible_kri_ids,
    visible_risk_ids,
    visible_vendor_ids,
)
from tests.factories.users import build_user_for_role

pytestmark = pytest.mark.contract


ROLES = (
    "admin",
    "cro",
    "risk_manager",
    "department_risk_owner",
    "kri_reporting_owner",
    "control_owner",
    "auditor",
    "reviewer",
    "viewer",
)


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ROLES)
async def test_visible_ids_under_role_unions_department_and_ownership(
    db_session, role, fixture_universe,
) -> None:
    user = await build_user_for_role(db_session, role=role)
    candidates = fixture_universe.kri_ids + fixture_universe.foreign_dept_kri_ids
    ids = await visible_kri_ids(db_session, user, candidates)
    assert ids == fixture_universe.expected_visible_kri_ids_for(role)
    risk_ids = await visible_risk_ids(db_session, user, fixture_universe.risk_ids)
    assert risk_ids == fixture_universe.expected_visible_risk_ids_for(role)
    control_ids = await visible_control_ids(db_session, user, fixture_universe.control_ids)
    assert control_ids == fixture_universe.expected_visible_control_ids_for(role)
    vendor_ids = await visible_vendor_ids(db_session, user, fixture_universe.vendor_ids)
    assert vendor_ids == fixture_universe.expected_visible_vendor_ids_for(role)
```

**Expected result**: GREEN on current code (these are characterization tests
pinning existing behavior). Red would mean fixtures are missing or current
ownership behavior diverges from documented invariants.

#### TDD Step 2 — No production code change

#45a is **test-only**. Production code at `ownership.py` is untouched.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py \
       tests/backend/pytest/test_ownership_resolver_control_join.py \
       tests/backend/pytest/test_visible_ids_via_ownership.py
make -f scripts/Makefile test-architecture-locks
```

After all three pass, they form the gate for #45b.

#### Lock/TOML/Contract updates (same commit)

- None.

#### README / doc updates (same commit)

- None.

#### Verification commands

1. `pytest tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py -v` — pass.
2. `pytest tests/backend/pytest/test_ownership_resolver_control_join.py -v` — pass.
3. `pytest tests/backend/pytest/test_visible_ids_via_ownership.py -v` — pass (9 parametrized cases).
4. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled
`test(permissions): characterize ownership resolver behavior (#45a gate for #45b)`.

#### Rollback

- Class: **TEST-ONLY**.
- Procedure: revert removes characterization coverage; no production behavior
  affected.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: ~half-day M (the visible-ids fixture matrix is the long pole).
- Risk: low — test-only addition.
- Mitigations: 3 separate files keep failure attribution tight; matrix
  parametrization covers 9 roles × 4 entity types.

#### Handoff notes

- **Gates #45b** (Wave 7 Seq 74). #45b's factory-equivalence test must
  reference these three files verbatim.
- After #45a lands, integration log records: "ownership characterization
  baseline locked; #45b factory-equivalence reuses these fixtures."

---

## Wave 6b — P3 Capability + Admin (Slots 70-73, 40h, Week 12)

Wave 6b completes capability and admin work; #66 unblocks #68, #71 (Wave 7).
**Validator runs**: 1 (#39 admin builder).

---

### Item #10 (Section 5) — #39 — Replace static admin capability stub with role-aware builder

**Wave**: 6b  | **Slot**: v2 Seq 67 (legacy)  | **Effort**: M (~6-8h)  | **Priority**: P3  | **Domain**: crosscut (FE+BE)

**Dependencies**: none  
**Atomic with**: none  
**Validator?**: yes — Pydantic-Zod parity contract; runs `validate_authz_capability_contract.py`

#### Why this work

`backend/app/api/v1/endpoints/admin/capabilities.py:14-22` returns a 4-`True`
literal stub:

```python
@router.get("/capabilities", response_model=AdminConsoleCapabilities)
async def get_admin_console_capabilities(
    current_user: User = Depends(require_platform_admin),
) -> AdminConsoleCapabilities:
    _ = current_user                                  # ← unused-arg eat
    return AdminConsoleCapabilities(
        can_revoke_sessions=True,
        can_run_directory_check_all=True,
        can_update_log_config=True,
        can_export_loaded_audit_logs=True,
    )
```

This recipe replaces the stub with a role-aware builder
`build_admin_capabilities(user)` that introspects role and returns the four
booleans accordingly. Pydantic-Zod parity is locked end-to-end via the
catalog parser. Audit ID = #39; developer verdict = ACCEPT.

> **Phase 6 critical**: the file currently contains the literal stub with
> `_ = current_user` placeholder line; the builder must consume `current_user`
> meaningfully and remove the placeholder.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 67 (legacy; per
  `plan-loop-3-07-integration-v2.md:410`) — Section 2 places at Wave 6b row 70.
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of:
  - `backend/app/api/v1/endpoints/admin/capabilities.py:1-22` (current 4-True stub).
  - `backend/app/api/v1/endpoints/admin/_deps.py` (`require_platform_admin`).
  - `backend/app/schemas/admin.py:99-105` (Pydantic `AdminConsoleCapabilities`, 4 fields).
  - `frontend/src/services/api/schemas/admin.ts:38-43` (Zod schema, 4 fields).
  - `app/models/role.py` `RoleType` enum.
- [ ] Confirm `docs/security/capability-catalog.json` AdminConsoleCapabilities
  surface entry lists exactly the 4 fields. Add if missing.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Tests (RED)

**Test file 1 (per-role behavioral)**:
`tests/backend/pytest/api/v1/admin/test_capabilities_builder.py`

```python
"""Admin capabilities builder — per-role booleans."""
from __future__ import annotations

import pytest

from app.services._authorization_capabilities.admin import build_admin_capabilities

pytestmark = pytest.mark.contract


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "role_fixture,expected_admin",
    [
        ("test_user_admin", True),
        ("test_user_dept_head", False),
        ("test_user_end_user", False),
        ("test_user_cro", False),
        ("test_user_risk_manager", False),
        ("test_user_compliance", False),
    ],
)
async def test_build_admin_capabilities_role_matrix(request, role_fixture, expected_admin) -> None:
    user = request.getfixturevalue(role_fixture)
    caps = build_admin_capabilities(user)
    assert caps.can_revoke_sessions is expected_admin
    assert caps.can_run_directory_check_all is expected_admin
    assert caps.can_update_log_config is expected_admin
    assert caps.can_export_loaded_audit_logs is expected_admin


@pytest.mark.asyncio
async def test_get_admin_console_capabilities_endpoint_admin_returns_true(
    client_factory, test_user_admin,
) -> None:
    async with client_factory(current_user=test_user_admin) as ac:
        resp = await ac.get("/api/v1/admin/capabilities")
    assert resp.status_code == 200
    body = resp.json()
    assert body["can_revoke_sessions"] is True


@pytest.mark.asyncio
async def test_get_admin_console_capabilities_endpoint_non_admin_blocked(
    client_factory, test_user_end_user,
) -> None:
    async with client_factory(current_user=test_user_end_user) as ac:
        resp = await ac.get("/api/v1/admin/capabilities")
    # require_platform_admin returns 401/403 before builder is reached.
    assert resp.status_code in (401, 403)
```

**Test file 2 (structural)**:
`tests/backend/pytest/api/v1/admin/test_capabilities_structural.py`

```python
"""capabilities.py uses build_admin_capabilities — no literal True stub."""
from __future__ import annotations

import pathlib

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = pathlib.Path(__file__).resolve().parents[5]
TARGET = REPO_ROOT / "backend/app/api/v1/endpoints/admin/capabilities.py"


def test_capabilities_endpoint_uses_builder() -> None:
    src = TARGET.read_text()
    assert "build_admin_capabilities" in src
    assert "_ = current_user" not in src
    body = src.split("def get_admin_console_capabilities", 1)[1]
    assert "True" not in body, "literal True must not appear in endpoint body"
```

**Test file 3 (Pydantic-Zod parity)**:
`tests/backend/pytest/api/v1/admin/test_capabilities_parity.py`

```python
"""AdminConsoleCapabilities — Pydantic field set ≡ Zod field set."""
from __future__ import annotations

import json
import pathlib
import re

import pytest
from app.schemas.admin import AdminConsoleCapabilities

pytestmark = pytest.mark.contract

REPO_ROOT = pathlib.Path(__file__).resolve().parents[5]
ZOD_FILE = REPO_ROOT / "frontend/src/services/api/schemas/admin.ts"


def _zod_field_names(src: str, schema_name: str) -> set[str]:
    # Brace-matched literal extraction equivalent to capability_catalog.py:112-126.
    m = re.search(rf"export\s+const\s+{schema_name}\s*=\s*passthroughObject\(\{{(.+?)\}}\)", src, re.DOTALL)
    assert m, f"could not locate {schema_name}"
    body = m.group(1)
    return set(re.findall(r"\b([a-z_][a-z_0-9]*)\s*:\s*z\.boolean\(\)", body))


def test_admin_capabilities_pydantic_zod_parity() -> None:
    pyd = set(AdminConsoleCapabilities.model_fields.keys())
    zod = _zod_field_names(ZOD_FILE.read_text(), "adminConsoleCapabilitiesSchema")
    assert pyd == zod, f"drift: pyd={pyd}, zod={zod}"
```

**Expected result**: RED on all three (file 1: builder doesn't exist; file 2:
`_ = current_user` and `True` in body; file 3: parser cannot extract zod fields
once builder ships if shape drifts).

#### TDD Step 2 — Implement Change

**New file** `backend/app/services/_authorization_capabilities/admin.py`:

```python
from __future__ import annotations

from app.models import User
from app.models.role import RoleType
from app.schemas.admin import AdminConsoleCapabilities


def _is_platform_admin(user: User) -> bool:
    role = getattr(user, "role", None)
    return getattr(role, "name", None) == RoleType.ADMIN.value


def build_admin_capabilities(user: User) -> AdminConsoleCapabilities:
    is_admin = _is_platform_admin(user)
    return AdminConsoleCapabilities(
        can_revoke_sessions=is_admin,
        can_run_directory_check_all=is_admin,
        can_update_log_config=is_admin,
        can_export_loaded_audit_logs=is_admin,
    )
```

**Edit** `backend/app/api/v1/endpoints/admin/capabilities.py`:

```python
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.v1.endpoints.admin._deps import require_platform_admin
from app.models import User
from app.schemas.admin import AdminConsoleCapabilities
from app.services._authorization_capabilities.admin import build_admin_capabilities

router = APIRouter()


@router.get("/capabilities", response_model=AdminConsoleCapabilities)
async def get_admin_console_capabilities(
    current_user: User = Depends(require_platform_admin),
) -> AdminConsoleCapabilities:
    return build_admin_capabilities(current_user)
```

> The placeholder `_ = current_user` line is gone; `current_user` is now
> meaningfully consumed via the builder.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/api/v1/admin/test_capabilities_builder.py
pytest tests/backend/pytest/api/v1/admin/test_capabilities_structural.py
pytest tests/backend/pytest/api/v1/admin/test_capabilities_parity.py
python scripts/security/validate_authz_capability_contract.py  # exit 0
```

#### Lock/TOML/Contract updates (same commit)

- `docs/security/capability-catalog.json` — confirm `AdminConsoleCapabilities`
  surface entry lists exactly the 4 fields; add if missing.
- `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml` —
  confirm all 4 keys present; add missing.

#### README / doc updates (same commit)

- `backend/app/services/_authorization_capabilities/README.md` — append
  `admin.py` section.
- `docs/security/authorization-capability-contract.md` — note admin console
  has a real builder.

#### Verification commands

1. `pytest tests/backend/pytest/api/v1/admin/test_capabilities_builder.py -v` — pass.
2. `pytest tests/backend/pytest/api/v1/admin/test_capabilities_structural.py -v` — pass.
3. `pytest tests/backend/pytest/api/v1/admin/test_capabilities_parity.py -v` — pass.
4. `python scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `cd frontend && npm run test:run -- schemas/admin` — parity green from FE side.
7. `mypy backend/app/services/_authorization_capabilities backend/app/api/v1/endpoints/admin` — clean.
8. `ruff check backend/app/services/_authorization_capabilities backend/app/api/v1/endpoints/admin` — clean.

#### Commit boundary

Single commit titled
`feat(backend/admin): replace static admin capability stub with role-aware builder`.

#### Rollback

- Class: **PURE-CODE** (Pydantic shape unchanged).
- Procedure: revert restores 4-`True` stub. Frontend Zod schema is unchanged
  either way; rollback is symmetric.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: ~6-8h M (builder + 3 tests + parity + verification).
- Risk: medium — admin endpoints assume non-admin paths return 401/403 from
  `require_platform_admin`; must confirm builder is reached only by admins.
- Mitigations: per-role parametrized test; structural test forbids literal
  `True`; parity test pins Pydantic ≡ Zod field sets.

---

### Item #11 (Section 5) — #40 — Re-cluster admin sub-routers (4-cluster split)

**Wave**: 6b  | **Slot**: v2 Seq 68 (legacy)  | **Effort**: M (~8-10h)  | **Priority**: P3  | **Domain**: crosscut

**Dependencies**: #39 (Wave 6b Seq 67 legacy)  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`backend/app/api/v1/endpoints/admin/console.py` carries 7 routes (Phase 4
verified count, NOT 8) at lines `:36,49,58,67,79,124,149`. The 7 routes split
naturally into 4 clusters:

- **system_status**: `/health`, `/jobs/status`, `/outbox/status`, `/stats` (`:36,49,58,67`).
- **operational_logs**: `/logs` (`:79`).
- **sessions**: `/sessions`, `/sessions/{user_id}/revoke` (`:124,149`).
- **siblings (no-op)**: `capabilities.py`, `directory_sync.py`, `docs.py`,
  `log_config.py`, `orphans.py`, `snapshots.py`, `structured_logs.py` already
  separate.

URL paths are **unchanged**; frontend has zero impact. Audit ID = #40;
developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 68 (legacy; per
  `plan-loop-3-07-integration-v2.md:411`).
- [ ] Confirm prerequisites complete: #39 merged.
- [ ] Read latest state of `backend/app/api/v1/endpoints/admin/console.py:36,49,58,67,79,124,149`.
- [ ] Read `backend/app/api/v1/endpoints/admin/__init__.py` (router include map).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/backend/pytest/architecture/test_w13_admin_subrouter_cluster_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
"""Admin sub-router 4-cluster split (#40)."""
from __future__ import annotations

import importlib
import pathlib

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]
ADMIN = REPO_ROOT / "backend/app/api/v1/endpoints/admin"


def _route_paths(module_name: str) -> set[str]:
    mod = importlib.import_module(f"app.api.v1.endpoints.admin.{module_name}")
    return {r.path for r in mod.router.routes}


def test_console_emptied_after_split() -> None:
    src = (ADMIN / "console.py").read_text()
    assert "@router.get(\"/health\"" not in src
    assert "@router.get(\"/jobs/status\"" not in src
    assert "@router.get(\"/outbox/status\"" not in src
    assert "@router.get(\"/stats\"" not in src
    assert "@router.get(\"/logs\"" not in src
    assert "@router.get(\"/sessions\"" not in src


def test_system_status_cluster() -> None:
    paths = _route_paths("system_status")
    assert {"/health", "/jobs/status", "/outbox/status", "/stats"} <= paths


def test_operational_logs_cluster() -> None:
    paths = _route_paths("operational_logs")
    assert "/logs" in paths


def test_sessions_cluster() -> None:
    paths = _route_paths("sessions")
    # /sessions and /sessions/{user_id}/revoke
    assert "/sessions" in paths
    assert any(p.endswith("/revoke") for p in paths)


def test_admin_init_exports_clusters() -> None:
    src = (ADMIN / "__init__.py").read_text()
    for name in ("system_status", "operational_logs", "sessions"):
        assert name in src
```

**Expected result**: RED. New cluster files don't exist; console.py still has
the 7 routes.

#### TDD Step 2 — Implement Change

1. **Move handlers verbatim** (preserve URL paths and tag mappings):
   - From `console.py:36,49,58,67`: `health()`, `jobs_status()`,
     `outbox_status()`, `stats()` → new file `system_status.py`.
   - From `console.py:79`: `logs()` → new file `operational_logs.py`.
   - From `console.py:124,149`: `active_sessions()`, `revoke_user_sessions()`
     → new file `sessions.py`.

2. Each new file declares its own `router = APIRouter()` and re-exports;
   handlers retain their original signatures + dependencies + tags.

3. **Update** `backend/app/api/v1/endpoints/admin/__init__.py` — mount the 3
   new routers under their existing path prefixes (no URL change). Remove the
   `console.router.get(...)` mounts.

4. **Delete** the 7 handler bodies in `console.py`. The file may remain as a
   deprecated alias; if retained, list it in `_reserved_modules.toml` per
   ADR-009.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_w13_admin_subrouter_cluster_red.py -q
```

#### Lock/TOML/Contract updates (same commit)

- None new (test enumerates clusters inline).
- If `console.py` retained as alias, add to `_reserved_modules.toml` per ADR-009.

#### README / doc updates (same commit)

- `backend/app/api/v1/endpoints/admin/README.md` (or
  `docs/agent/ENDPOINT_INVARIANTS.md`) — note the 4-cluster split.

#### Verification commands

1. `pytest tests/backend/pytest/architecture/test_w13_admin_subrouter_cluster_red.py -q` — pass.
2. `pytest tests/backend/pytest/api/v1/admin -q` — admin endpoint regression pass; URL paths unchanged.
3. `pytest tests/backend/pytest/test_protocol_contract_probe.py tests/backend/pytest/test_openapi_contract_parity.py -q` — OpenAPI parity unchanged.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `mypy backend/app/api/v1/endpoints/admin` — clean.
6. `ruff check backend/app/api/v1/endpoints/admin` — clean.

#### Commit boundary

Single commit titled
`refactor(admin): split console.py into 4 sub-router clusters`.

#### Rollback

- Class: **PURE-CODE** (URL paths unchanged → frontend untouched → snapshot
  bases under ADR-006 not affected because response shapes do not change).
- Procedure: revert the commit; the old `console.py` returns. The new lock
  test fails on rollback (intended — forces forward-only re-clustering).
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: 8-10h M.
- Risk: low — pure handler relocation; URL paths preserved.
- Mitigations: lock test enumerates each cluster inline; OpenAPI parity test
  catches any URL drift.

---

### Item #12 (Section 5) — #66 — Split `AuthContext.tsx` into independent providers (render-counter pin)

**Wave**: 6b  | **Slot**: v2 Seq 73 (legacy)  | **Effort**: M (~8h)  | **Priority**: P4  | **Domain**: frontend

**Dependencies**: #37 (Wave 2; backend `_can_view_governance` mirror swap),
#39 (Wave 6b; admin builder).  
**Soft prereq**: #35 (Wave 4) per Correction E — avoids 18-mock-file double-rewrite.  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`frontend/src/contexts/AuthContext.tsx:1-77` (verified 77 lines today) bundles
session, preferences, and auth-actions state behind one Context.Provider. Any
mutation to one slice triggers re-renders in consumers of the other two. The
recipe splits into **3 providers** wrapping a thin `AuthContext` compat shim
that exposes the union via `useAuth()`. Audit ID = #66; developer verdict = ACCEPT.

> **Phase 4 mandate**: render-counter test pattern (`useRef(0)` +
> `useEffect(() => { count.current += 1 })` + `expect(after).toBe(before)`)
> verifies that mutating the preferences slice does NOT re-render session
> consumers.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 73 (legacy; Section 2 row 72;
  see `plan-loop-3-07-integration-v2.md:416`).
- [ ] Confirm prerequisites complete: #37 + #39 merged. (#35 soft prereq.)
- [ ] Read latest state of:
  - `frontend/src/contexts/AuthContext.tsx:1-77` (verify line count via
    `wc -l`; today = 77).
  - `frontend/src/contexts/auth/usePreferenceHydration.ts`
  - `frontend/src/contexts/auth/useAuthBootstrap.ts`
  - `frontend/src/contexts/auth/useAuthActions.ts`
  - `frontend/src/services/session` (provides `useSessionSnapshot`).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Tests (RED)

**Test file 1 (render-counter pin — Phase 4 mandated)**:
`tests/frontend/unit/src/contexts/__tests__/SessionProvider.split.renderCounter.test.tsx`

```tsx
import { useEffect, useRef } from 'react';
import { render, act, screen } from '@testing-library/react';
import { SessionProvider, useSession } from '@/contexts/SessionContext';
import { PreferencesProvider, usePreferenceActions } from '@/contexts/PreferencesContext';

function SessionConsumer() {
    const count = useRef(0);
    const session = useSession();
    useEffect(() => { count.current += 1; });
    return <span data-testid="session-renders">{count.current}|{session.user?.id ?? 'none'}</span>;
}

function PrefMutator() {
    const { markPreferencesReady } = usePreferenceActions();
    return <button onClick={() => markPreferencesReady(true)}>flip</button>;
}

it('mutating preferences does NOT re-render session consumer', () => {
    render(
        <SessionProvider>
            <PreferencesProvider>
                <SessionConsumer />
                <PrefMutator />
            </PreferencesProvider>
        </SessionProvider>
    );
    const before = screen.getByTestId('session-renders').textContent;
    act(() => screen.getByText('flip').click());
    const after = screen.getByTestId('session-renders').textContent;
    expect(after).toBe(before); // render count unchanged
});
```

**Test file 2 (auth actions independent)**:
`tests/frontend/unit/src/contexts/__tests__/AuthActions.split.test.tsx`

```tsx
import { render, act } from '@testing-library/react';
import { AuthActionsProvider, useAuthActionsContext } from '@/contexts/AuthActionsContext';

function ActionsConsumer({ onReady }: { onReady: (ctx: ReturnType<typeof useAuthActionsContext>) => void }) {
    const ctx = useAuthActionsContext();
    onReady(ctx);
    return null;
}

it('exposes login/logout independently of session subtree', () => {
    let captured: ReturnType<typeof useAuthActionsContext> | null = null;
    render(
        <AuthActionsProvider>
            <ActionsConsumer onReady={(c) => { captured = c; }} />
        </AuthActionsProvider>
    );
    expect(captured).not.toBeNull();
    expect(typeof captured!.login).toBe('function');
    expect(typeof captured!.logout).toBe('function');
});
```

**Test file 3 (compat shim)**:
`tests/frontend/unit/src/contexts/__tests__/AuthContext.compatShim.test.tsx`

```tsx
import { render } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

function Probe({ onReady }: { onReady: (a: ReturnType<typeof useAuth>) => void }) {
    onReady(useAuth());
    return null;
}

it('useAuth still exposes union surface (Sidebar consumers stay green)', () => {
    let captured: ReturnType<typeof useAuth> | null = null;
    render(
        <AuthProvider>
            <Probe onReady={(a) => { captured = a; }} />
        </AuthProvider>
    );
    const a = captured!;
    expect(a).toHaveProperty('user');
    expect(a).toHaveProperty('isLoading');
    expect(a).toHaveProperty('bootstrapStatus');
    expect(a).toHaveProperty('hasPermission');
    expect(a).toHaveProperty('isAuthenticated');
    expect(a).toHaveProperty('login');
    expect(a).toHaveProperty('logout');
});
```

**Pre-existing tests** at
`tests/frontend/unit/src/contexts/__tests__/{AuthBootstrapConfig,AuthBootstrapRouteGuard,AuthLogoutFlow,AuthSessionAuthority}.test.tsx`
must continue to pass through the compat shim.

**Expected result**: RED on all 3 (modules don't exist; current 77-line
context creates a fresh value object on every render).

#### TDD Step 2 — Implement Change

**New file** `frontend/src/contexts/SessionContext.tsx` — owns session-derived
state from `useSessionSnapshot()`, `hasPermission`, `isAuthenticated`. Wrap
value in `useMemo` over
`[session.user, session.token, session.bootstrapStatus, session.bootstrapError, session.logoutPending, session.logoutErrorKey, hasPermission]`.

**New file** `frontend/src/contexts/PreferencesContext.tsx` — wraps
`usePreferenceHydration(...)` (currently `AuthContext.tsx:31-33`). Export
both `usePreferenceState()` (read) and `usePreferenceActions()` (write).
Memoise value over
`[isPreferencesHydrated, hydratePreferences, markPreferencesReady]`.

**New file** `frontend/src/contexts/AuthActionsContext.tsx` — wraps
`useAuthActions(...)`. Memoise value over `[login, logout]`.

**Rewrite** `frontend/src/contexts/AuthContext.tsx` to a compat shim:

```tsx
import type { ReactNode } from 'react';
import { SessionProvider, useSession } from './SessionContext';
import { PreferencesProvider, usePreferenceState } from './PreferencesContext';
import { AuthActionsProvider, useAuthActionsContext } from './AuthActionsContext';

export function AuthProvider({ children }: { children: ReactNode }) {
    return (
        <SessionProvider>
            <PreferencesProvider>
                <AuthActionsProvider>{children}</AuthActionsProvider>
            </PreferencesProvider>
        </SessionProvider>
    );
}

export function useAuth() {
    return { ...useSession(), ...usePreferenceState(), ...useAuthActionsContext() };
}
```

Existing `useAuth` consumers (Sidebar after #35, all 18 mocks rewritten in
#35) keep working through the shim.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run test:run -- SessionProvider.split.renderCounter
cd frontend && npm run test:run -- AuthActions.split
cd frontend && npm run test:run -- AuthContext.compatShim
cd frontend && npm run test:run -- AuthBootstrap   # regression
cd frontend && npm run test:run -- AuthLogout      # regression
cd frontend && npm run test:run -- AuthSession     # regression
```

#### Lock/TOML/Contract updates (same commit)

- None (capability contract unchanged).

#### README / doc updates (same commit)

- `frontend/src/contexts/auth/README.md` — describe the three providers and
  the compat shim.

#### Verification commands

1. `cd frontend && npm run test:run -- contexts` — broad pass.
2. `cd frontend && npx tsc --noEmit` — clean.
3. `cd frontend && npm run lint` — clean.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled
`refactor(frontend/contexts): split AuthContext into Session/Preferences/AuthActions providers`.

#### Rollback

- Class: **PURE-CODE**.
- Procedure: revert restores the 77-line monolithic `AuthContext.tsx`. Compat
  shim ensures `useAuth()` keeps the same surface either way; rollback is
  mechanical.
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: ~8h M.
- Risk: medium — render-counter assertions are sensitive to the React
  scheduler; ensure the test uses `act()` strictly and `render` with a stable
  parent; otherwise the counter may double-increment under StrictMode.
- Mitigations: render-counter pattern uses `useRef` (mutation does not trigger
  re-render); `act()` wraps the mutation; compat shim test pins the union
  surface.

#### Handoff notes

- **Gates #71** (Wave 7 Seq 76): AuthContext split is a hard prereq for the
  session module merge.
- **Soft after #35**: per Correction E, sequencing #35 before #66 avoids
  rewriting 18 mock files twice.

---

### Item #13 (Section 5) — #45b — Ownership resolver factory

**Wave**: 6b  | **Slot**: v2 Seq 72 (legacy)  | **Effort**: M (~3-4h)  | **Priority**: P4  | **Domain**: crosscut

> Section-2 reconciliation note: Section 2 places #45b at row 74 (Wave 7);
> the v2 sequence places it at Seq 72 (legacy). Both within the same
> dependency tier (after #45a). This recipe targets Wave 6b/Wave 7 boundary;
> the work is identical either way.

**Dependencies**: **#45a green** (3 characterization tests in main).  
**Atomic with**: none  
**Validator?**: no

#### Why this work

#45a pins the EXISTING ownership behavior; #45b replaces 8 free functions in
`backend/app/core/_permissions/ownership.py:1-142` with a factory call
`make_ownership_resolvers(*, model, owner_column, archived_column?, bridge?)`
that produces an `OwnershipResolvers` bundle. Public surface preserves the 8
free-function names. Phase 4 invariant: factory accepts per-method archived
filter (KRI risk-scope methods filter `is_archived=False`; KRI-direct methods
do NOT). Audit ID = #45b; developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 72 legacy / row 74 Section 2.
- [ ] Confirm prerequisites complete: **#45a tests green in main**:
  - `tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py`
  - `tests/backend/pytest/test_ownership_resolver_control_join.py`
  - `tests/backend/pytest/test_visible_ids_via_ownership.py`
- [ ] Read latest state of `backend/app/core/_permissions/ownership.py:1-142`,
  especially asymmetry at `:33,68`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/backend/pytest/test_ownership_resolver_factory_equivalence_red.py`

```python
"""RED: factory-produced resolvers are byte-equivalent to legacy free functions."""
import pytest

pytestmark = pytest.mark.contract


@pytest.mark.asyncio
async def test_kri_factory_resolvers_equivalent(client_factory, kri_fixture_matrix):
    from app.core._permissions._ownership_factory import make_ownership_resolvers
    from app.models import KeyRiskIndicator
    from app.core._permissions import ownership as legacy

    async with client_factory() as client:
        async with client.app.state.db_factory() as db:
            kri_resolvers = make_ownership_resolvers(
                model=KeyRiskIndicator,
                owner_column="reporting_owner_id",
                archived_column="is_archived",
                bridge=None,
            )
            for case in kri_fixture_matrix:
                a = await kri_resolvers.is_owner(db, case.user_id, case.kri_id)
                b = await legacy.is_kri_reporting_owner(db, case.user_id, case.kri_id)
                assert a == b, f"is_owner mismatch on {case}"

                a = await kri_resolvers.is_target_owner(db, case.user_id, case.risk_id)
                b = await legacy.is_risk_kri_reporting_owner(db, case.user_id, case.risk_id)
                assert a == b, f"is_target_owner mismatch on {case}"

                a = sorted(await kri_resolvers.ids_where_owner(db, case.user_id))
                b = sorted(await legacy.get_kri_ids_where_reporting_owner(db, case.user_id))
                assert a == b

                a = sorted(await kri_resolvers.target_ids_where_owner(db, case.user_id))
                b = sorted(await legacy.get_risk_ids_where_kri_reporting_owner(db, case.user_id))
                assert a == b


@pytest.mark.asyncio
async def test_control_factory_resolvers_equivalent(client_factory, control_fixture_matrix):
    from app.core._permissions._ownership_factory import make_ownership_resolvers
    from app.models import Control, ControlRiskLink
    from app.core._permissions import ownership as legacy

    async with client_factory() as client:
        async with client.app.state.db_factory() as db:
            control_resolvers = make_ownership_resolvers(
                model=Control,
                owner_column="control_owner_id",
                archived_column=None,
                bridge=(ControlRiskLink, "control_id", "risk_id"),
            )
            for case in control_fixture_matrix:
                a = await control_resolvers.is_owner(db, case.user_id, case.control_id)
                b = await legacy.is_control_owner(db, case.user_id, case.control_id)
                assert a == b
                a = await control_resolvers.is_target_owner(db, case.user_id, case.risk_id)
                b = await legacy.is_risk_control_owner(db, case.user_id, case.risk_id)
                assert a == b
                a = sorted(await control_resolvers.ids_where_owner(db, case.user_id))
                b = sorted(await legacy.get_control_ids_where_owner(db, case.user_id))
                assert a == b
                a = sorted(await control_resolvers.target_ids_where_owner(db, case.user_id))
                b = sorted(await legacy.get_risk_ids_where_control_owner(db, case.user_id))
                assert a == b


def test_archived_filter_applied_per_method() -> None:
    """KRI risk-scope methods filter is_archived=False; KRI-direct methods do NOT."""
    from app.core._permissions._ownership_factory import make_ownership_resolvers
    from app.models import KeyRiskIndicator
    resolvers = make_ownership_resolvers(
        model=KeyRiskIndicator, owner_column="reporting_owner_id",
        archived_column="is_archived", bridge=None,
    )
    assert resolvers.archived_filter_methods == frozenset({"is_target_owner", "target_ids_where_owner"})
```

**Expected result**: RED — `_ownership_factory` module does not exist.

#### TDD Step 2 — Implement Change

**New file** `backend/app/core/_permissions/_ownership_factory.py`:

```python
"""Factory producing ownership resolver bundles from a (model, columns, bridge) spec.

Phase 4 invariant: the factory accepts per-method archived filter selection.
KRI-direct methods (is_owner, ids_where_owner) do NOT filter archived rows;
risk-scope methods (is_target_owner, target_ids_where_owner) DO filter
``is_archived.is_(False)``.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True)
class OwnershipResolvers:
    is_owner: Callable[[AsyncSession, int, int], Awaitable[bool]]
    is_target_owner: Callable[[AsyncSession, int, int], Awaitable[bool]]
    ids_where_owner: Callable[[AsyncSession, int], Awaitable[list[int]]]
    target_ids_where_owner: Callable[[AsyncSession, int], Awaitable[list[int]]]
    archived_filter_methods: frozenset[str]


def make_ownership_resolvers(
    *,
    model: Any,
    owner_column: str,
    archived_column: Optional[str] = None,
    bridge: Optional[tuple[Any, str, str]] = None,
) -> OwnershipResolvers:
    owner_col = getattr(model, owner_column)
    archived_col = getattr(model, archived_column) if archived_column else None

    async def is_owner(db: AsyncSession, user_id: int, entity_id: int) -> bool:
        # KRI-direct path: NEVER filter archived.
        result = await db.execute(select(owner_col).where(model.id == entity_id))
        return result.scalar_one_or_none() == user_id

    async def ids_where_owner(db: AsyncSession, user_id: int) -> list[int]:
        # KRI-direct path: NEVER filter archived.
        result = await db.execute(select(model.id).where(owner_col == user_id))
        return [r[0] for r in result.all()]

    if bridge is None:
        target_attr = getattr(model, "risk_id")

        async def is_target_owner(db: AsyncSession, user_id: int, target_id: int) -> bool:
            stmt = select(model.id).where(target_attr == target_id, owner_col == user_id)
            if archived_col is not None:
                stmt = stmt.where(archived_col.is_(False))
            result = await db.execute(stmt.limit(1))
            return result.scalar_one_or_none() is not None

        async def target_ids_where_owner(db: AsyncSession, user_id: int) -> list[int]:
            stmt = select(target_attr).where(owner_col == user_id)
            if archived_col is not None:
                stmt = stmt.where(archived_col.is_(False))
            stmt = stmt.distinct()
            result = await db.execute(stmt)
            return [r[0] for r in result.all()]
    else:
        bridge_model, bridge_local_fk, bridge_target_fk = bridge
        bridge_local_col = getattr(bridge_model, bridge_local_fk)
        bridge_target_col = getattr(bridge_model, bridge_target_fk)

        async def is_target_owner(db: AsyncSession, user_id: int, target_id: int) -> bool:
            stmt = (
                select(model.id)
                .join(bridge_model, model.id == bridge_local_col)
                .where(bridge_target_col == target_id, owner_col == user_id)
                .limit(1)
            )
            if archived_col is not None:
                stmt = stmt.where(archived_col.is_(False))
            result = await db.execute(stmt)
            return result.scalar_one_or_none() is not None

        async def target_ids_where_owner(db: AsyncSession, user_id: int) -> list[int]:
            stmt = (
                select(bridge_target_col)
                .join(model, model.id == bridge_local_col)
                .where(owner_col == user_id)
                .distinct()
            )
            if archived_col is not None:
                stmt = stmt.where(archived_col.is_(False))
            result = await db.execute(stmt)
            return [r[0] for r in result.all()]

    archived_methods: frozenset[str] = (
        frozenset({"is_target_owner", "target_ids_where_owner"})
        if archived_col is not None else frozenset()
    )

    return OwnershipResolvers(
        is_owner=is_owner,
        is_target_owner=is_target_owner,
        ids_where_owner=ids_where_owner,
        target_ids_where_owner=target_ids_where_owner,
        archived_filter_methods=archived_methods,
    )
```

**Rewrite** `backend/app/core/_permissions/ownership.py`:

```python
"""Ownership resolvers (KRI + Control), produced by the shared factory.

Public surface preserves the 8 free-function names so external callers in
``entity_access.py`` keep importing the same identifiers.
"""
from __future__ import annotations

from app.core._permissions._ownership_factory import make_ownership_resolvers
from app.models import Control, ControlRiskLink, KeyRiskIndicator

_kri = make_ownership_resolvers(
    model=KeyRiskIndicator,
    owner_column="reporting_owner_id",
    archived_column="is_archived",
    bridge=None,
)
_control = make_ownership_resolvers(
    model=Control,
    owner_column="control_owner_id",
    archived_column=None,
    bridge=(ControlRiskLink, "control_id", "risk_id"),
)

is_kri_reporting_owner = _kri.is_owner
is_risk_kri_reporting_owner = _kri.is_target_owner
get_kri_ids_where_reporting_owner = _kri.ids_where_owner
get_risk_ids_where_kri_reporting_owner = _kri.target_ids_where_owner

is_control_owner = _control.is_owner
is_risk_control_owner = _control.is_target_owner
get_control_ids_where_owner = _control.ids_where_owner
get_risk_ids_where_control_owner = _control.target_ids_where_owner
```

`backend/app/core/_permissions/entity_access.py:21,23,48` — likely no edit
needed (import names preserved). Verify via grep before merge.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/test_ownership_resolver_factory_equivalence_red.py
pytest tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py
pytest tests/backend/pytest/test_ownership_resolver_control_join.py
pytest tests/backend/pytest/test_visible_ids_via_ownership.py
pytest tests/backend/pytest/architecture/test_w12_resource_permissions_keys_match_capability_contract_red.py
```

#### Lock/TOML/Contract updates (same commit)

- Cross-check `test_w12_resource_permissions_keys_match_capability_contract_red.py:46-72`
  stays green (no `MeCapabilities.resource_permissions` shape change).

#### README / doc updates (same commit)

- `backend/app/core/_permissions/README.md` (if exists; create if not) — note
  factory + asymmetry-by-design comment: "KRI risk-scope filters
  `is_archived=False`; KRI-direct does not. This is intentional."

#### Verification commands

1. `pytest tests/backend/pytest/test_ownership_resolver_factory_equivalence_red.py` — pass.
2. `pytest tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py` — green via factory.
3. `pytest tests/backend/pytest/test_ownership_resolver_control_join.py` — green via factory.
4. `pytest tests/backend/pytest/test_visible_ids_via_ownership.py` — green via factory (9 roles × 4 entity types).
5. `pytest tests/backend/pytest/architecture/test_w12_resource_permissions_keys_match_capability_contract_red.py -q` — green.
6. `make -f scripts/Makefile test-architecture-locks` — locks green.
7. `mypy backend/app/core/_permissions` — clean.

#### Commit boundary

Single commit titled
`refactor(permissions): introduce ownership resolver factory; preserve public surface`.

#### Rollback

- Class: **PURE-CODE** (no schema change).
- Procedure: revert restores 8 free functions; characterization tests
  continue to pass.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: ~3-4h M (factory + rewrite + 4 fixture-matrix tests +
  verification).
- Risk: medium — incorrect bridge wiring would break Control resolution; the
  characterization fixture matrix from #45a is the safety net.
- Mitigations: factory-equivalence test asserts byte-equivalence vs legacy;
  per-method archived filter set is locked.

---

## Wave 7 — P4 Deferred (Slots 74-77, 56h, Week 13)

Wave 7 tackles defers per user instruction. Some items have multi-prereq
convergence (#71 has 4 distinct prereqs). **Validator runs**: 0.

---

### Item #14 (Section 5) — #68 — `WidgetShell` + scoped DashboardFilter selector

**Wave**: 7  | **Slot**: v2 Seq 75 (Section 2 row 75 / legacy 73)  | **Effort**: M (~8h)  | **Priority**: P4  | **Domain**: frontend

**Dependencies**: #46 (Wave 6a — query-key factories), #66 (Wave 6b — AuthContext split for store wiring patterns).  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`frontend/src/contexts/DashboardFilterContext.tsx:32-86` exposes one Context
shape that re-renders every consumer on any mutation. Phase 4 confirmed:
**21 dashboard widgets total; 6 use `useDashboardFilters`**
(`CategoryBreakdownCharts`, `DepartmentTable`, `RiskDrilldownModal`,
`FilterBar`, `KRIStatusWidget`, `KRIBreachWidget`). The recipe introduces a
typed `WidgetShell` component encapsulating loading/error/empty/data branches
+ extends the filter context with a scoped `useDashboardFilterSelector<T>`
hook (built on `useSyncExternalStore`) so each consumer subscribes only to
its slice. Audit ID = #68; developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 75 (Section 2 row 75; per
  `plan-loop-3-07-integration-v2.md:417`).
- [ ] Confirm prerequisites complete: #46 Commit E green; #66 merged.
- [ ] Read latest state of:
  - `frontend/src/contexts/DashboardFilterContext.tsx:32-86`.
  - The 6 filter-consuming widgets (paths above).
- [ ] Confirm 6 mutators surface: `setDepartmentId`, `setRiskLevel`,
  `setControlStatus`, `setControlForm`, `setViewMode`, `resetFilters`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Tests (RED)

**Test file 1 (WidgetShell branches)**:
`tests/frontend/unit/src/components/dashboard/__tests__/WidgetShell.contract.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { WidgetShell } from '@/components/dashboard/WidgetShell';

it('renders loading skeleton', () => {
    render(<WidgetShell title="Foo" isLoading><div>data</div></WidgetShell>);
    expect(screen.getByTestId('widget-loading')).toBeInTheDocument();
});

it('renders error state', () => {
    render(<WidgetShell title="Foo" error={new Error('boom')}><div>data</div></WidgetShell>);
    expect(screen.getByTestId('widget-error')).toBeInTheDocument();
});

it('renders empty state', () => {
    render(<WidgetShell title="Foo" isEmpty emptyLabel="No data"><div>data</div></WidgetShell>);
    expect(screen.getByText('No data')).toBeInTheDocument();
});

it('renders data when none of the branches match', () => {
    render(<WidgetShell title="Foo"><div data-testid="data">data</div></WidgetShell>);
    expect(screen.getByTestId('data')).toBeInTheDocument();
});
```

**Test file 2 (scoped selector render-counter pin — Phase 4 mandated)**:
`tests/frontend/unit/src/contexts/__tests__/DashboardFilterContext.scopedSelector.renderCounter.test.tsx`

```tsx
import { useEffect, useRef } from 'react';
import { render, act, screen } from '@testing-library/react';
import {
    DashboardFilterProvider,
    useDashboardFilterSelector,
    useDashboardFilterMutators,
} from '@/contexts/DashboardFilterContext';

function DepartmentConsumer() {
    const count = useRef(0);
    const dept = useDashboardFilterSelector((s) => s.filters.departmentId);
    useEffect(() => { count.current += 1; });
    return <span data-testid="dept-renders">{count.current}|{dept ?? 'none'}</span>;
}

function RiskMutator() {
    const { setRiskLevel } = useDashboardFilterMutators();
    return <button onClick={() => setRiskLevel('high')}>mut</button>;
}

it('mutating riskLevel does NOT re-render department consumer', () => {
    render(
        <DashboardFilterProvider>
            <DepartmentConsumer />
            <RiskMutator />
        </DashboardFilterProvider>
    );
    const before = screen.getByTestId('dept-renders').textContent;
    act(() => screen.getByText('mut').click());
    const after = screen.getByTestId('dept-renders').textContent;
    expect(after).toBe(before); // render count unchanged
});
```

**Test file 3 (widget shell adoption)**:
`tests/frontend/unit/src/components/dashboard/__tests__/DashboardWidgets.shellAdoption.test.tsx`

```ts
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../../../../frontend/src/components/dashboard');

const FILTER_CONSUMERS = [
    'CategoryBreakdownCharts.tsx',
    'DepartmentTable.tsx',
    'RiskDrilldownModal.tsx',
    'FilterBar.tsx',
    'KRIStatusWidget.tsx',
    'KRIBreachWidget.tsx',
];

it.each(FILTER_CONSUMERS)('%s imports WidgetShell', (file) => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    expect(src).toMatch(/from '@\/components\/dashboard\/WidgetShell'/);
});
```

**Expected result**: RED on all three (component doesn't exist; selector
hook doesn't exist; current 6 widgets don't import WidgetShell).

#### TDD Step 2 — Implement Change

**New file** `frontend/src/components/dashboard/WidgetShell.tsx`:

```tsx
import type { ReactNode } from 'react';

interface WidgetShellProps {
    title: string;
    isLoading?: boolean;
    error?: Error | null;
    isEmpty?: boolean;
    emptyLabel?: string;
    children: ReactNode;
}

export function WidgetShell({ title, isLoading, error, isEmpty, emptyLabel, children }: WidgetShellProps) {
    if (isLoading) return <div data-testid="widget-loading">{title}: loading…</div>;
    if (error) return <div data-testid="widget-error">{title}: {error.message}</div>;
    if (isEmpty) return <div data-testid="widget-empty">{emptyLabel ?? `${title}: no data`}</div>;
    return <section aria-label={title}>{children}</section>;
}
```

**Extend** `frontend/src/contexts/DashboardFilterContext.tsx`:

- Re-implement state via `useSyncExternalStore` over an internal store with
  `subscribe`/`getSnapshot`.
- Export `useDashboardFilterSelector<T>(selector: (s: DashboardFilters) => T)`
  and `useDashboardFilterMutators()` (returns the 6 mutators).
- Keep `useDashboardFilters()` as a backward-compat facade returning the
  legacy union shape (so the 15 non-filter-consuming widgets stay valid).

**Refactor** the 6 filter consumers (`CategoryBreakdownCharts.tsx`,
`DepartmentTable.tsx`, `RiskDrilldownModal.tsx`, `FilterBar.tsx`,
`KRIStatusWidget.tsx`, `KRIBreachWidget.tsx`) to use
`useDashboardFilterSelector(s => s.filters.<slice>)` + `WidgetShell`.

The other 15 widgets adopt `WidgetShell` only (no selector); incremental —
separate commit OK.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run test:run -- WidgetShell.contract
cd frontend && npm run test:run -- DashboardFilterContext.scopedSelector
cd frontend && npm run test:run -- DashboardWidgets.shellAdoption
cd frontend && npm run test:run -- dashboard
cd frontend && npx tsc --noEmit
```

#### Lock/TOML/Contract updates (same commit)

- None.

#### README / doc updates (same commit)

- `frontend/src/components/dashboard/README.md` — describe `WidgetShell` API
  + scoped selector contract.

#### Verification commands

1. Three new test files all pass.
2. `cd frontend && npm run test:run -- contexts` — regression pass (DashboardFilter scope).
3. `cd frontend && npm run test:run -- pages/dashboard` — page-level regression pass.
4. `cd frontend && npm run lint && npx tsc --noEmit` — clean.

#### Commit boundary

Single commit titled
`refactor(frontend/dashboard): introduce WidgetShell + scoped DashboardFilter selector`.

#### Rollback

- Class: **PURE-CODE**.
- Procedure: revert restores 6 widgets' direct subscriptions; compat facade
  ensures legacy consumers keep working either way.
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: ~8h M.
- Risk: medium — `useSyncExternalStore` semantics on React 18 require a
  stable `subscribe` reference; render-counter test is the catch-all.
- Mitigations: render-counter pattern; widget-shell adoption pinned in 3rd test.

---

### Item #15 (Section 5) — #71 — Merge `frontend/src/services/session/` 8 → 4 (single-flight pin)

**Wave**: 7  | **Slot**: v2 Seq 76 (Section 2 row 77 / legacy 75)  | **Effort**: M (~8h)  | **Priority**: P4  | **Domain**: frontend

**Dependencies**: #47 (Wave 4 — session refresh policy), #66 (Wave 6b — AuthContext split), **#72 (Wave 1 — ADR-011, hard prereq)**.  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`frontend/src/services/session/` carries 8 files today (verified):
`README.md`, `bootstrap.ts`, `index.ts`, `logoutSuppression.ts`, `manager.ts`,
`refreshHint.ts`, `sso.ts`, `store.ts`, `types.ts`. The merge produces 4
runtime files + a barrel (5 entries):
- `types.ts` (kept)
- `store.ts` (kept)
- **NEW** `sessionStorage.ts` ← `refreshHint.ts` + `logoutSuppression.ts`
- **NEW** `coordinator.ts` ← `manager.ts` + `bootstrap.ts` + `sso.ts`
- **REWRITE** `index.ts` (barrel)

> **Phase 4/Phase 6 CRITICAL**: module-scope state at
> `frontend/src/services/session/sso.ts:9-11` MUST survive the merge intact:
>
> ```ts
> let refreshInFlight: Promise<string | null> | null = null;
> let lastRefreshFailureAt = 0;
> const REFRESH_FAILURE_COOLDOWN_MS = 1_000;
> ```
>
> Plus `let bootstrapPromise: ... | null = null;` from `bootstrap.ts:16`.
> A careless concatenation that reinitialises these per-file boundary will
> break single-flight semantics. The single-flight test pins this BEFORE the
> merge and must continue to pass after.

Audit ID = #71; developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 76 (per
  `plan-loop-3-07-integration-v2.md:419`; Section 2 row 77).
- [ ] Confirm prerequisites complete: #47 + #66 + **#72 (ADR-011) all merged**.
- [ ] Read latest state of:
  - `frontend/src/services/session/sso.ts:9-11` (verify the 3 module-scope
    state declarations).
  - `frontend/src/services/session/bootstrap.ts:16` (verify
    `bootstrapPromise`).
  - `frontend/src/services/session/manager.ts:138`
    (`applyAuthenticatedSession`).
  - `frontend/src/services/session/sso.ts:13` (`trySilentSessionRefresh`).
  - `frontend/src/services/session/index.ts` (current barrel exports).
- [ ] Confirm three test seams already exist:
  - `__resetSilentSessionRefreshForTests`
  - `__resetAuthSessionCoordinatorForTests`
  - `__resetBootstrapSessionCacheForTests`
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Tests (RED) — write BEFORE the merge

**Test file 1 (sessionStorage merged)**:
`tests/frontend/unit/src/services/session/__tests__/sessionStorage.merged.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
    hasRefreshSessionHint,
    clearRefreshSessionHint,
    isExplicitLogoutSuppressed,
    setExplicitLogoutSuppressed,
    clearExplicitLogoutSuppressed,
} from '@/services/session/sessionStorage';

beforeEach(() => clearExplicitLogoutSuppressed());

it('exposes refreshHint helpers', () => {
    expect(typeof hasRefreshSessionHint).toBe('function');
    expect(typeof clearRefreshSessionHint).toBe('function');
});

it('exposes logoutSuppression helpers', () => {
    setExplicitLogoutSuppressed();
    expect(isExplicitLogoutSuppressed()).toBe(true);
    clearExplicitLogoutSuppressed();
    expect(isExplicitLogoutSuppressed()).toBe(false);
});
```

**Test file 2 (coordinator merged)**:
`tests/frontend/unit/src/services/session/__tests__/coordinator.merged.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
    applyAuthenticatedSession,
    trySilentSessionRefresh,
    bootstrapAuthSession,
} from '@/services/session/coordinator';

describe('coordinator merged module', () => {
    it('exports applyAuthenticatedSession', () => expect(typeof applyAuthenticatedSession).toBe('function'));
    it('exports trySilentSessionRefresh', () => expect(typeof trySilentSessionRefresh).toBe('function'));
    it('exports bootstrapAuthSession', () => expect(typeof bootstrapAuthSession).toBe('function'));
});
```

**Test file 3 (single-flight pin — Phase 4 mandated)**:
`tests/frontend/unit/src/services/session/__tests__/coordinator.singleFlight.test.ts`

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { authApi } from '@/services/authApi';
import {
    trySilentSessionRefresh,
    __resetSilentSessionRefreshForTests,
} from '@/services/session/coordinator';
import { __setRefreshSessionHintForTests } from '@/services/session/sessionStorage';

beforeEach(() => {
    __resetSilentSessionRefreshForTests();
    __setRefreshSessionHintForTests();
    vi.restoreAllMocks();
});

it('two concurrent calls share one in-flight refresh', async () => {
    const refreshSpy = vi.spyOn(authApi, 'refresh').mockResolvedValue({
        access_token: 'tok', user: { id: 1 } as any,
    } as any);
    const [a, b] = await Promise.all([
        trySilentSessionRefresh(),
        trySilentSessionRefresh(),
    ]);
    expect(refreshSpy).toHaveBeenCalledTimes(1);   // single-flight contract
    expect(a).toBe('tok');
    expect(b).toBe('tok');
});

it('REFRESH_FAILURE_COOLDOWN_MS gates retries after failure', async () => {
    vi.spyOn(authApi, 'refresh').mockRejectedValueOnce(new Error('boom'));
    await trySilentSessionRefresh();   // failure recorded
    const second = await trySilentSessionRefresh();   // within cooldown
    expect(second).toBeNull();
});
```

**Test file 4 (structural)**:
`tests/frontend/unit/src/services/session/__tests__/coordinator.structural.test.ts`

```ts
import fs from 'node:fs';
import path from 'node:path';

const SESSION_DIR = path.resolve(__dirname, '../../../../../../frontend/src/services/session');

describe('session module 4-file post-merge layout', () => {
    it('exposes exactly the new file set', () => {
        const expected = new Set(['types.ts', 'store.ts', 'sessionStorage.ts', 'coordinator.ts', 'index.ts']);
        const actual = new Set(fs.readdirSync(SESSION_DIR).filter((f) => f.endsWith('.ts')));
        expect(actual).toEqual(expected);
    });

    it('legacy files are gone', () => {
        for (const legacy of ['bootstrap.ts', 'manager.ts', 'sso.ts', 'refreshHint.ts', 'logoutSuppression.ts']) {
            expect(fs.existsSync(path.join(SESSION_DIR, legacy))).toBe(false);
        }
    });
});
```

**Pin BEFORE the merge**: run the 4 tests against the current 8-file layout.
Test 3 (single-flight) MUST PASS today (current `sso.ts:9-11` carries the
state); the pin locks it. Tests 1, 2, 4 fail RED today.

#### TDD Step 2 — Implement Change (the merge)

1. **NEW** `frontend/src/services/session/sessionStorage.ts`: verbatim
   concatenation of `refreshHint.ts` + `logoutSuppression.ts`. Both are leaf
   primitives with no shared state. Re-export both surfaces.

2. **NEW** `frontend/src/services/session/coordinator.ts`: verbatim
   concatenation of `manager.ts` + `bootstrap.ts` + `sso.ts`. **Module-scope
   state preservation**: keep the three `sso.ts:9-11` declarations + the
   `bootstrap.ts:16` declaration at the **top of the new file** (NOT
   per-original-file boundary):

   ```ts
   // Module-scope state — preserved verbatim from sso.ts:9-11 + bootstrap.ts:16.
   // DO NOT move into a function or per-file IIFE; single-flight semantics depend
   // on the module-scope identity of these references.
   let refreshInFlight: Promise<string | null> | null = null;
   let lastRefreshFailureAt = 0;
   const REFRESH_FAILURE_COOLDOWN_MS = 1_000;
   let bootstrapPromise: Promise<unknown> | null = null;
   ```

   All three test seams (`__resetSilentSessionRefreshForTests`,
   `__resetAuthSessionCoordinatorForTests`, `__resetBootstrapSessionCacheForTests`)
   MUST stay exported.

3. **DELETE** `bootstrap.ts`, `manager.ts`, `sso.ts`, `refreshHint.ts`,
   `logoutSuppression.ts`.

4. **REWRITE** `frontend/src/services/session/index.ts`:

   ```ts
   export * from './coordinator';
   export * from './sessionStorage';
   export * from './store';
   export * from './types';
   ```

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run test:run -- sessionStorage.merged
cd frontend && npm run test:run -- coordinator.merged
cd frontend && npm run test:run -- coordinator.singleFlight
cd frontend && npm run test:run -- coordinator.structural
cd frontend && npm run test:run -- session
cd frontend && npm run test:run -- contexts   # auth context regression
cd frontend && npx tsc --noEmit
```

#### Lock/TOML/Contract updates (same commit)

- `tests/backend/pytest/architecture/_naming_allowlist.toml` — add new file
  paths if listed by name; remove the 5 deleted paths if listed.

#### README / doc updates (same commit)

- `frontend/src/services/session/README.md` — replace the 8-file map with the
  4-file map. Note the module-scope state preservation contract (single-flight
  + cooldown) and link to the singleFlight pin test path.

#### Verification commands

1. All 4 new test files pass (incl. single-flight pin).
2. `cd frontend && npm run test:run -- session contexts` — full session + AuthContext regression green.
3. `cd frontend && npm run lint && npx tsc --noEmit` — clean.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled
`refactor(frontend/services/session): merge 8 files into 4 (preserve single-flight contract)`.

#### Rollback

- Class: **PURE-CODE**.
- Procedure: revert restores the 8-file layout. Single-flight pin must
  continue to pass under rollback (state preserved either way).
- Risk vector: a careless rollback might lose the pin test if it imported
  from the merged path — keep the pin test path-stable via
  `@/services/session` (barrel) imports rather than direct
  `@/services/session/coordinator` imports.
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: ~8h M.
- Risk: HIGH — single-flight semantics break if module-scope state is
  reinitialised per concatenation boundary; cooldown gating depends on a
  stable `lastRefreshFailureAt`.
- Mitigations: single-flight test pinned BEFORE the merge; module-scope state
  preserved verbatim at top of `coordinator.ts`; 3 test-only reset seams kept.

---

### Item #16 (Section 5) — #60 — Introduce `PrivilegeContext` + `Depends(get_privilege_context)`

**Wave**: 7  | **Slot**: v2 Seq 75 (Section 2 row 76 / legacy 74)  | **Effort**: M (~8h)  | **Priority**: P4  | **Domain**: approvals

**Dependencies**: #34 (Wave 5 — `resolve_approval_privilege_tier` helper), #51 (Wave 4 — `kris/_kri_history/value_application.py` shim deletion).  
**Atomic with**: none  
**Validator?**: no — but capability contract surface; `validate_authz_capability_contract.py` smoke

#### Why this work

#34 extracted `resolve_approval_privilege_tier(...)`. #60 builds on that by
introducing a `PrivilegeContext` dataclass + `get_privilege_context()`
FastAPI dependency that endpoints declare via `Depends(...)`. Endpoints stop
re-resolving the tier per-request; tests stop building it ad-hoc. Audit ID =
#60; developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 75 (per Section 2 row 76).
- [ ] Confirm prerequisites complete: #34 (`resolve_approval_privilege_tier`)
  merged; #51 (kris/value_application shim) merged.
- [ ] Read latest state of:
  - `backend/app/services/approval_scenario_policy.py`
    (`resolve_approval_privilege_tier`).
  - `backend/app/api/v1/endpoints/approvals/*.py` (consumers).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Tests (RED)

**Test file**: `tests/backend/pytest/api/v1/approvals/test_privilege_context_dependency_red.py`

```python
"""PrivilegeContext + get_privilege_context dependency."""
from __future__ import annotations

import inspect
import pytest

pytestmark = pytest.mark.contract


def test_privilege_context_dataclass_exists() -> None:
    from app.services._approval_execution.privilege_context import PrivilegeContext
    fields = {f.name for f in PrivilegeContext.__dataclass_fields__.values()}
    assert "user" in fields
    assert "tier" in fields  # current tier resolved per-request


def test_get_privilege_context_dependency_signature() -> None:
    from app.services._approval_execution.privilege_context import get_privilege_context
    sig = inspect.signature(get_privilege_context)
    # Async dependency taking current_user + db.
    assert any(p.name == "current_user" for p in sig.parameters.values())
    assert any(p.name == "db" for p in sig.parameters.values())


@pytest.mark.asyncio
async def test_privilege_context_endpoint_uses_dependency(client_factory, test_user_admin) -> None:
    """Hit one approvals endpoint that should consume Depends(get_privilege_context)."""
    async with client_factory(current_user=test_user_admin) as ac:
        resp = await ac.get("/api/v1/approvals")  # any endpoint with Depends wired
    assert resp.status_code in (200, 204)  # not 500 (dependency wires correctly)
```

**Expected result**: RED — `PrivilegeContext` and `get_privilege_context` don't
exist yet.

#### TDD Step 2 — Implement Change

**New file** `backend/app/services/_approval_execution/privilege_context.py`:

```python
from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models import User
from app.services.approval_scenario_policy import resolve_approval_privilege_tier


@dataclass(frozen=True)
class PrivilegeContext:
    user: User
    tier: str  # 'admin' | 'cro' | ... per resolve_approval_privilege_tier


async def get_privilege_context(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PrivilegeContext:
    tier = await resolve_approval_privilege_tier(db, current_user)
    return PrivilegeContext(user=current_user, tier=tier)
```

**Edit** approvals endpoints that previously re-resolved the tier inline.
Replace:

```python
async def my_endpoint(current_user: User = Depends(get_current_user)) -> ...:
    tier = await resolve_approval_privilege_tier(db, current_user)
    ...
```

with:

```python
async def my_endpoint(ctx: PrivilegeContext = Depends(get_privilege_context)) -> ...:
    tier = ctx.tier
    user = ctx.user
    ...
```

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/api/v1/approvals/test_privilege_context_dependency_red.py
pytest tests/backend/pytest/api/v1/approvals -q
python scripts/security/validate_authz_capability_contract.py
```

#### Lock/TOML/Contract updates (same commit)

- None new.
- Verify `tests/backend/pytest/_get_db_override_whitelist.toml` does NOT
  require new entry (the new dependency uses `get_db`, not a local override).

#### README / doc updates (same commit)

- `backend/app/services/_approval_execution/README.md` — note
  `PrivilegeContext` + `get_privilege_context()` as the canonical entry for
  approvals endpoints.

#### Verification commands

1. `pytest tests/backend/pytest/api/v1/approvals/test_privilege_context_dependency_red.py` — pass.
2. `pytest tests/backend/pytest/api/v1/approvals -q` — broad regression pass.
3. `python scripts/security/validate_authz_capability_contract.py` — exit 0.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `mypy backend/app/services/_approval_execution backend/app/api/v1/endpoints/approvals` — clean.

#### Commit boundary

Single commit titled
`feat(approvals): introduce PrivilegeContext + get_privilege_context dependency`.

#### Rollback

- Class: **PURE-CODE**.
- Procedure: revert restores per-endpoint tier resolution. No data implication.
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: ~8h M.
- Risk: medium — endpoints that don't migrate to the new dep continue to
  re-resolve; over time this leads to inconsistent tier semantics.
- Mitigations: lock test asserts the dependency exists; per-endpoint
  migration audited via grep.

---

## Wave 8 — Migration + FE TS Cleanup (Slots 78-79+, 28h, Week 14)

Wave 8 is the dedicated migration window. **#69 + #70 land as a single
bundled commit** (single Alembic revision per ADR-010); **#77b lands in the
same week** to close the deploy-skew window. **Validator runs**: 0 (no
contract change; ADR-005/ADR-010 govern).

> The full 9-step sequence for #69+#70 with all 8 RED tests, snapshot/restore
> procedure, and Postgres-lane test plan lives in the **Migration Window —
> #69+#70 Atomic Bundle (Detailed Reference)** section appended at the end.
> Item #17 below is the per-item recipe summary that links into the detailed
> reference.

---

### Item #17 (Section 5) — #69 + #70 — Atomic vendor migration bundle (XL)

**Wave**: 8  | **Slot**: v2 Seq 77 + 78 (Section 2 rows 78 + 79)  | **Effort**: **XL (35-42h)**  | **Priority**: P4  | **Domain**: vendor

**Dependencies**: none structural; **#77a (Wave 6a) MUST be merged first** to
soft-tolerate deploy-skew.  
**Atomic with**: each other (single Alembic revision; bundled per ADR-010).  
**Validator?**: no (contract not touched).

#### Why this work

`Vendor.status` is a single-value enum (`'active'`) that has been a no-op
since the unify cutover; `_archivable.py:60-64` still carries a
`"vendors": ("inactive",)` legacy alias. `vendor_risk_links` and
`vendor_control_links` foreign keys are missing `ON DELETE CASCADE`
(`vendor_kri_links` already has it). The atomic migration:

1. Introduces `AbstractVendorLink` mixin (#69 Phase 1) for shared column shape.
2. Drops `Vendor.status` column + `VendorStatusEnum` (#70).
3. Rebuilds 4 FKs with `ON DELETE CASCADE` (matches kri-links).
4. Drops `_archivable.py:60-64` `"vendors": ("inactive",)` lock entry.

Single Alembic revision `k6l7m8n9o0p1` per ADR-010 forward-only contract.
Audit ID = #69+#70; developer verdict = ACCEPT.

> **Phase 6 critical fixes** (all four applied):
> 1. `tests/backend/pytest/migrations/` directory does NOT exist today —
>    recipe creates `__init__.py` + conftest.py with postgres fixtures.
> 2. `make -f scripts/Makefile postgres-up` does NOT exist — use
>    `TEST_DATABASE_URL=postgresql+asyncpg://... make -f scripts/Makefile test-postgres-ci`
>    (the existing target at `scripts/Makefile:121-122`).
> 3. **All 4 NEW Phase 4 RED tests** are required:
>    idempotency, concurrent-write, FK-orphan precheck, partial-failure recovery.
> 4. `down_revision = "j5k6l7m8n9o0"` (current head verified at
>    `backend/alembic/versions/j5k6l7m8n9o0_rename_kri_archived_by_fk.py:16`).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 77/78 (per Section 2 rows 78/79).
- [ ] Confirm prerequisites complete: **#77a merged** (vendor schema accepts
  optional `status`).
- [ ] Confirm Loop 4 (KRI domain) is NOT scheduled to touch
  `vendor_kri_link.py` in the same window.
- [ ] Capture pre-upgrade snapshot per ADR-010: see "Snapshot/Restore
  Procedure" in the Migration Window section below.
- [ ] Confirm Postgres lane is provisioned: `TEST_DATABASE_URL` env var set.

#### TDD Step 1 — Write 8 RED tests

(See **Migration Window — #69+#70 Atomic Bundle (Detailed Reference)** below
for the complete code of all 8 tests.)

The 8 tests live in two directories:

- `tests/backend/pytest/architecture/`:
  - `test_vendor_link_mixin_red.py`
  - `test_vendor_status_drop_red.py`
- `tests/backend/pytest/migrations/` (**directory does not exist; create it**):
  - `__init__.py` (new)
  - `conftest.py` (new — provides `postgres_engine`, `postgres_session`,
    `postgres_engine_pre_migration`, `seeded_vendor` fixtures)
  - `test_vendor_link_cascade_postgres_red.py`
  - `test_vendor_link_migration_forward_only_red.py`
  - `test_vendor_migration_idempotency_red.py` (Phase 4 NEW)
  - `test_vendor_link_concurrent_writes_red.py` (Phase 4 NEW)
  - `test_vendor_link_orphan_precheck_red.py` (Phase 4 NEW)
  - `test_vendor_link_partial_failure_recovery_red.py` (Phase 4 NEW)

**Postgres-lane invocation** (per Phase 6 fix; replaces non-existent
`make postgres-up`):

```bash
export TEST_DATABASE_URL="postgresql+asyncpg://localhost:5432/riskhub_test"
make -f scripts/Makefile test-postgres-ci
```

Or directly:

```bash
TEST_DATABASE_URL="..." pytest -m postgres tests/backend/pytest/migrations/
```

#### TDD Step 2-7 — see Migration Window section

Steps 2 (mixin), 3 (rebase 3 link models), 4 (Alembic revision), 5 (drop
status surface), 6 (lock collapse), 7 (doc updates) are documented in full
detail in the **Migration Window — #69+#70 Atomic Bundle (Detailed
Reference)** section at the end of this document.

#### TDD Step 8 — Final gates

```
make -f scripts/Makefile test-architecture-locks
TEST_DATABASE_URL="postgresql+asyncpg://..." make -f scripts/Makefile test-postgres-ci
pytest tests/backend/pytest/test_vendors.py tests/backend/pytest/test_vendor_links.py tests/backend/pytest/test_kris_rbac.py tests/backend/pytest/test_vendor_link_workflow_module.py tests/backend/pytest/api/v1/test_collection_grouping_api.py tests/backend/pytest/test_dashboard.py tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py tests/backend/pytest/test_e2e_seed_archive_state_red.py
ruff check backend tests
mypy backend/app
python scripts/security/validate_authz_capability_contract.py
```

#### Step 9 — Single bundled commit

**Title**: `refactor(vendor): introduce AbstractVendorLink mixin and drop Vendor.status`

**Body** (excerpt):

```
Phase: 7. Forward-only per ADR-010. Bundles #69 (Phase 1 mixin) + #70
(Vendor.status drop) into a single Alembic revision k6l7m8n9o0p1.

Bundled because:
1. Both axes touch vendor* schema in one Alembic revision.
2. Both share ADR-010 forward-only entry.
3. Both share rehearsal scope (snapshot pre-upgrade, run upgrade, verify counts).
4. Single migration window minimises operational risk.

Changes:
- New AbstractVendorLink mixin at backend/app/models/_vendor_link_mixin.py.
- 3 link models rebased onto mixin.
- Alembic k6l7m8n9o0p1: rebuilds 4 FKs with ON DELETE CASCADE; drops
  ix_vendors_status; drops vendors.status column.
- 8 prod sites + 1 seed write + 6 seed dicts cleaned of vendor.status.
- _archivable.py:60-64 vendors entry removed (legacy_values collapse).
- 7 doc updates: models/README.md, _vendor_links/README.md, ADR-005, ADR-010,
  docs/README.md, DOCUMENTATION_TREE.md, BUSINESS_LOGIC.md.

Pre-merge: snapshot captured (pre_k6l7m8n9o0p1.dump); row counts captured at
.planning/audits/_context/migration-snapshot-k6l7m8n9o0p1.txt.
```

Allow split into 2 commits if diff > 400 lines OR mypy can't type-check
intermediate state cleanly:
- C1 (mixin): mixin + 3 link model rebases + RED tests for §6.1, §6.4 + docs
  `models/README.md`, `_vendor_links/README.md`, ADR-010 mixin entry.
- C2 (status drop + cascade migration): Alembic revision + Vendor model edits
  + 8 service sites + seed scripts + remaining docs + RED tests for §6.2,
  §6.3, §6.5, §6.6, §6.7, §6.8.

Recommended: keep as **single commit** unless either condition fires.

#### Lock/TOML/Contract updates (same commit)

- `tests/backend/pytest/architecture/_archive_allowlist.toml` — verify vendor-link tables not listed (Loop B confirmed).
- `tests/backend/pytest/architecture/_naming_allowlist.toml` — verify `_vendor_link_mixin` not flagged.
- `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml` — no change.
- `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` — no change.

#### README / doc updates (same commit)

7 files (full text in Migration Window section §7):
1. `backend/app/models/README.md`
2. `backend/app/services/_vendor_links/README.md`
3. `docs/adr/ADR-005-archivable-mixin-schema-contract.md`
4. `docs/adr/ADR-010-postgres-migration-rehearsal-contract.md`
5. `docs/README.md`
6. `docs/DOCUMENTATION_TREE.md`
7. `docs/BUSINESS_LOGIC.md`

#### Rollback

- Class: **MIGRATION** (forward-only).
- Procedure: `pg_restore --clean --no-owner --jobs=4 --dbname=$DB pre_k6l7m8n9o0p1.dump`;
  redeploy prior application version; invalidate frontend bundle caches.
  `downgrade()` raises `NotImplementedError` per ADR-010.
- Estimated rollback: 30 min (pg_restore on prod-sized DB) + frontend purge.

#### Effort & Risk

- Estimated time: **35-42h XL** (mixin + 3 model rebases + Alembic revision +
  8 prod sites + 7 seed locations + 4 fixture deletions + 7 docs + 8 RED tests
  + Postgres-lane rehearsal + final gates).
- Risk: HIGH — schema change; forward-only with snapshot rollback.
- Mitigations: 8 RED tests including 4 Phase 4 (idempotency, concurrent-write,
  orphan precheck, partial-failure recovery); pre-upgrade snapshot validated
  restorable; row-count capture; staging clone rehearsal.

#### Cross-domain handoff notes

- **#77a → #69+#70**: #77a (Wave 6a Seq 69) MUST land first so FE soft-
  tolerates missing `status`. If rollback happens AFTER BE migration lands,
  rollback order is FE-rollback → BE-rollback (frontend bundles depending on
  the literal `status` field would otherwise reject responses).
- **#69+#70 → #77b**: #77b (Wave 8 Seq 79+) lands in the same week to remove
  `status?` from FE TS types entirely after BE migration completes.
- **Loop 4 (KRI domain)**: must NOT touch `vendor_kri_link.py` in the same
  window. Per Phase 5 review, KRI domain confirms no overlap.

---

### Item #18 (Section 5) — #77b — Prune `Vendor.status` from FE TS types and Zod schemas

**Wave**: 8  | **Slot**: v2 Seq 79+ (final)  | **Effort**: S (~1h)  | **Priority**: P3  | **Domain**: frontend

**Dependencies**: **#69+#70 merged + deployed** (BE migration complete; cache
invalidated).  
**Atomic with**: pair-temporal with #77a + #69+#70.  
**Validator?**: no

#### Why this work

#77a soft-tolerated missing `status`. After #69+#70 lands and the
deploy-skew window closes, `Vendor.status` is no longer in API responses.
This recipe removes the field entirely from FE TS types and Zod schemas.
Phase 6 verified the three sites: `frontend/src/types/vendor.ts:1,64,94`.
Audit ID = #77b; developer verdict = ACCEPT.

> **Phase 6 critical**: target lines `frontend/src/types/vendor.ts:1,64,94`
> are exactly:
> - `:1` `export type VendorStatus = 'active';`
> - `:64` `status: VendorStatus;` (after #77a → `status?: VendorStatus;`)
> - `:94` `status?: VendorStatus | 'inactive' | 'archived';`
>
> All three lines must be DELETED in this commit.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 79+ (per Section 2 row 80).
- [ ] Confirm prerequisites complete: #69+#70 merged + deployed; backend
  no longer returns `vendor.status`.
- [ ] Read latest state of:
  - `frontend/src/types/vendor.ts:1,64,94` (3 references).
  - `frontend/src/services/api/schemas/entities/vendors.ts` (locate the
    `status` field on `vendorSchema` — currently `.optional()` after #77a).
  - `frontend/src/components/kri/useKriModalState.ts:90,134`
  - `frontend/src/components/kri-form/useKriLookups.ts:115`
  - `frontend/src/components/vendor-form/vendorForm.types.ts:4,74`
  - `frontend/src/pages/vendors/vendorsPagePresentation.ts:3,22-23`
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/frontend/unit/src/types/vendor.types.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { Vendor, VendorListParams } from '@/types/vendor';

describe('Vendor type post-status-drop', () => {
    it('Vendor type has no status field', () => {
        const v: Vendor = {
            id: 1,
            name: 'X',
            outsourcing_owner_user_id: 1,
            linked_risks: [],
            vendor_type: 'ict',
            risk_score_1_5: 1,
            supports_important_core_insurance_function: false,
            dora_relevant: false,
            is_significant_vendor: false,
            has_alternative_providers: false,
            process: 'p',
            is_archived: false,
            created_at: 'now',
            updated_at: 'now',
        };
        // @ts-expect-error status field must not exist on Vendor
        const s = v.status;
        expect(s).toBeUndefined();
    });

    it('VendorListParams has no status query field', () => {
        const p: VendorListParams = {};
        // @ts-expect-error status query removed
        const s = p.status;
        expect(s).toBeUndefined();
    });
});
```

**Expected result**: RED — `vendor.ts:64` still declares
`status?: VendorStatus;` (after #77a) and `:94` declares
`status?: VendorStatus | 'inactive' | 'archived';`.

#### TDD Step 2 — Implement Change

**Edit** `frontend/src/types/vendor.ts`:

```diff
- export type VendorStatus = 'active';
- ...
- status?: VendorStatus;
- ...
- status?: VendorStatus | 'inactive' | 'archived';
```

Delete all three lines (`:1,64,94`). Delete any other `VendorStatus`
re-exports that survive.

**Edit** `frontend/src/services/api/schemas/entities/vendors.ts`:

```diff
- // Pre-migration soft-tolerate (item #77a) — restored to z.enum(['active']) after #69+#70 in #77b.
- status: z.enum(['active']).optional(),
```

Drop the line entirely (no `status` field on the Zod schema).

**Edit** UI display logic (delete the references):

- `frontend/src/components/kri/useKriModalState.ts:90,134` —
  delete `status: vendor.status,` lines.
- `frontend/src/components/kri-form/useKriLookups.ts:115` —
  delete `status: vendor.status,` line.
- `frontend/src/components/vendor-form/vendorForm.types.ts:4,74` —
  delete `VendorStatus` import + `normalizeVendorStatus(...)` function
  (becomes dead; remove all callers).
- `frontend/src/pages/vendors/vendorsPagePresentation.ts:3` —
  delete `VendorStatus` from import.
- `frontend/src/pages/vendors/vendorsPagePresentation.ts:22-23` —
  delete `VendorListStatusFilter` and `VendorDisplayStatus` type aliases
  (dead after removal). Audit consumers and replace with `is_archived`-based
  display.

**Frontend e2e cleanup** (NOT in this commit; flagged for Loop 6):

- `tests/frontend/e2e/vendors.spec.ts` `ensureVendorStatus(...)` helpers —
  Loop 6 owns rename to `ensureVendorArchived(...)`.
- `tests/frontend/unit/src/e2e/apiAuth.archive-state.test.ts:114` —
  Loop 6 owns.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run test:run -- vendor.types
cd frontend && npx tsc --noEmit
cd frontend && npm run lint
```

#### Lock/TOML/Contract updates (same commit)

- None.

#### README / doc updates (same commit)

- `frontend/README.md` (if mentions `vendor.status`) — strike.

#### Verification commands

1. `cd frontend && npm run test:run -- vendor.types` — pass.
2. `cd frontend && npm run test:run -- schemas/vendors` — Zod schema regression pass.
3. `cd frontend && npx tsc --noEmit` — clean.
4. `cd frontend && npm run lint` — clean.
5. `grep -rn "VendorStatus\|vendor.status" frontend/src` — should return only e2e helpers (out of scope).

#### Commit boundary

Single commit titled
`chore(frontend): drop Vendor.status references after backend column drop`.

Lands in the same week as #69+#70.

#### Rollback

- Class: **PURE-CODE** (frontend-only).
- Procedure: revert restores `status?: VendorStatus;` and the related types.
  No DB; no schema. If rollback happens, FE will treat absent `status` as
  optional (covered by #77a relaxation if still in tree).
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: ~1h S.
- Risk: low — type-only removal; no consumer breaks because BE no longer
  returns `status`.
- Mitigations: `@ts-expect-error` assertion pins absence; typecheck would
  flag any consumer that still reads `vendor.status`.

---

## Migration Window — #69+#70 Atomic Bundle (Detailed Reference)

This section contains the full 9-step sequence for the #69+#70 migration
window. It is the authoritative reference cited from Section 5 Item #17.

### Reference state confirmations

- `backend/app/models/vendor.py:22-23` — `class VendorStatus(str, PyEnum): active = "active"`.
- `backend/app/models/vendor.py:82` — `status: Mapped[str] = mapped_column(String(20), default=VendorStatus.active.value, index=True)`.
- `backend/app/models/_archivable.py:60-64` — legacy_values dict including `"vendors": ("inactive",)`.
- `backend/app/schemas/vendor.py:12-13,53,83` — `VendorStatusEnum` + 2 fields.
- `backend/app/schemas/__init__.py:115,212` — re-exports.
- Current Alembic head: `j5k6l7m8n9o0` (per `j5k6l7m8n9o0_rename_kri_archived_by_fk.py:16`).
- Forward-only precedent: `backend/alembic/versions/h3i4j5k6l7m8_unify_archive_state.py:28-31`.
- 8 prod call sites consuming `vendor.status`:
  - `backend/app/services/_register_listings/vendors.py:15,53,89,103,108,121,131,200,273,482,501`
  - `backend/app/services/_register_listings/controls.py:554`
  - `backend/app/services/_register_listings/risks.py:430`
  - `backend/app/services/_monitoring_response.py:219`
  - `backend/app/services/_reporting/exports/rows.py:120`
  - `backend/app/services/_kri_history/direct_application.py:36`

### Test infrastructure setup (Phase 6 critical fix #1)

`tests/backend/pytest/migrations/` directory does NOT exist today. The recipe
**creates** it with the following files:

**`tests/backend/pytest/migrations/__init__.py`** (new, empty):

```python
"""Postgres-lane migration tests for #69+#70 vendor migration window."""
```

**`tests/backend/pytest/migrations/conftest.py`** (new):

```python
"""Postgres-lane fixtures for vendor migration tests.

These fixtures are gated on TEST_DATABASE_URL pointing at a Postgres lane.
On sqlite or when TEST_DATABASE_URL is unset, postgres-marked tests are
skipped via the project-wide pytest mark configuration.
"""
from __future__ import annotations

import os
from typing import AsyncGenerator

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

POSTGRES_URL = os.environ.get("TEST_DATABASE_URL")


def _require_postgres() -> str:
    if not POSTGRES_URL or "postgresql" not in POSTGRES_URL:
        pytest.skip("TEST_DATABASE_URL not set to a Postgres URL; skipping postgres-lane test.")
    return POSTGRES_URL


@pytest.fixture
async def postgres_engine() -> AsyncGenerator[AsyncEngine, None]:
    """Engine connected to the post-upgrade test DB (alembic upgrade head already run)."""
    engine = create_async_engine(_require_postgres(), echo=False)
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest.fixture
async def postgres_session(postgres_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """Session bound to the post-upgrade engine."""
    factory = async_sessionmaker(postgres_engine, expire_on_commit=False)
    async with factory() as session:
        yield session


@pytest.fixture
async def postgres_engine_pre_migration() -> AsyncGenerator[AsyncEngine, None]:
    """Engine pinned at revision j5k6l7m8n9o0 (one rev before our migration).

    Use for tests that need to exercise the migration body itself (idempotency,
    partial-failure recovery, orphan-precheck) starting from a pre-upgrade DB.
    """
    pre_url = os.environ.get("TEST_DATABASE_URL_PRE_MIGRATION")
    if not pre_url:
        pytest.skip("TEST_DATABASE_URL_PRE_MIGRATION not set; skipping pre-migration test.")
    engine = create_async_engine(pre_url, echo=False)
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest.fixture
async def seeded_vendor(postgres_session: AsyncSession):
    """Insert a vendor + a linked risk so cascade-delete tests have data to delete."""
    from sqlalchemy import text
    result = await postgres_session.execute(
        text("INSERT INTO vendors (name, process, vendor_type, "
             "risk_score_1_5, supports_important_core_insurance_function, "
             "dora_relevant, is_significant_vendor, has_alternative_providers, "
             "is_archived, outsourcing_owner_user_id, created_at, updated_at) "
             "VALUES ('TestCascade', 'p', 'ict', 1, false, false, false, false, "
             "false, 1, now(), now()) RETURNING id")
    )
    vendor_id = result.scalar_one()
    await postgres_session.commit()

    class _Vendor:
        id = vendor_id
    yield _Vendor()
```

> **Phase 6 fix #2**: `make -f scripts/Makefile postgres-up` does NOT exist.
> Use `TEST_DATABASE_URL=postgresql+asyncpg://... make -f scripts/Makefile test-postgres-ci`
> (existing target at `scripts/Makefile:121-122`):
>
> ```makefile
> test-postgres-ci:
>     @test -n "$$TEST_DATABASE_URL" || (echo "TEST_DATABASE_URL is required for make test-postgres-ci" >&2; exit 1)
>     # ... runs the postgres-lane subset.
> ```

### Step 1: Write 8 RED tests

All 8 tests must be present and failing on `main` before any production code
edits.

#### 1.1 `tests/backend/pytest/architecture/test_vendor_link_mixin_red.py`

```python
"""RED: AbstractVendorLink mixin invariants. Fails until #69 mixin lands."""
import pytest
from sqlalchemy.sql.schema import Column

pytestmark = pytest.mark.contract


def test_abstract_vendor_link_marked_abstract() -> None:
    from app.models._vendor_link_mixin import AbstractVendorLink  # ImportError today
    assert getattr(AbstractVendorLink, "__abstract__", False) is True


def test_concrete_link_models_inherit_mixin() -> None:
    from app.models._vendor_link_mixin import AbstractVendorLink
    from app.models import VendorRiskLink, VendorControlLink, VendorKRILink
    for cls in (VendorRiskLink, VendorControlLink, VendorKRILink):
        assert issubclass(cls, AbstractVendorLink), cls.__name__


def test_vendor_id_fk_uniformly_cascades() -> None:
    from app.models import VendorRiskLink, VendorControlLink, VendorKRILink
    for cls in (VendorRiskLink, VendorControlLink, VendorKRILink):
        col: Column = cls.__table__.c.vendor_id
        fk = next(iter(col.foreign_keys))
        assert fk.ondelete == "CASCADE", f"{cls.__name__}.vendor_id missing cascade"


def test_unique_constraint_names_preserved() -> None:
    from app.models import VendorRiskLink, VendorControlLink, VendorKRILink
    pairs = {
        "vendor_risk_links": "uq_vendor_risk_link",
        "vendor_control_links": "uq_vendor_control_link",
        "vendor_kri_links": "uq_vendor_kri_link",
    }
    for cls in (VendorRiskLink, VendorControlLink, VendorKRILink):
        names = {c.name for c in cls.__table__.constraints if c.name and c.name.startswith("uq_")}
        assert pairs[cls.__tablename__] in names
```

**Assertions**: 4 separate tests pin: `__abstract__ = True`; subclassing;
uniform `ondelete=CASCADE` on `vendor_id`; preserved unique constraint names.

#### 1.2 `tests/backend/pytest/architecture/test_vendor_status_drop_red.py`

```python
"""RED: Vendor.status column / VendorStatusEnum / archived_clause shape."""
import inspect

import pytest
from sqlalchemy.dialects import postgresql

pytestmark = pytest.mark.contract


def test_vendor_status_column_dropped() -> None:
    from app.models import Vendor
    assert "status" not in Vendor.__table__.c, "Vendor.status column must be dropped"


def test_vendor_status_enum_class_removed() -> None:
    import app.models.vendor as vendor_module
    import app.schemas.vendor as schema_module
    assert not hasattr(vendor_module, "VendorStatus")
    assert not hasattr(schema_module, "VendorStatusEnum")


def test_archived_clause_collapsed_to_flag_only() -> None:
    from app.models import Vendor
    from app.models._archivable import archived_clause
    clause = archived_clause(Vendor, archived=True)
    sql = str(clause.compile(dialect=postgresql.dialect()))
    assert "vendors.is_archived" in sql
    assert "vendors.status" not in sql


def test_vendor_list_criteria_has_no_status_filter() -> None:
    from app.services._register_listings.vendors import VendorListCriteria
    fields = {f.name for f in VendorListCriteria.__dataclass_fields__.values()}
    assert "status_filter" not in fields
    assert "archived_status_filter" not in fields


def test_coerce_vendor_list_criteria_signature_drops_status_filter() -> None:
    from app.services._register_listings.vendors import coerce_vendor_list_criteria
    sig = inspect.signature(coerce_vendor_list_criteria)
    assert "status_filter" not in sig.parameters
```

**Assertions**: column gone; enum classes gone; `archived_clause` collapses
to `is_archived.is_(archived)`; dataclass fields dropped; coercion signature
dropped.

#### 1.3 `tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py`

```python
"""RED: postgres-lane FK CASCADE + column drop assertions on the new migration."""
import pytest
from sqlalchemy import text

pytestmark = [pytest.mark.contract, pytest.mark.postgres]


@pytest.mark.asyncio
async def test_vendor_link_fks_cascade_after_upgrade(postgres_session) -> None:
    rows = await postgres_session.execute(text("""
        SELECT conname, confdeltype FROM pg_constraint
        WHERE conname IN (
            'fk_vendor_risk_links_vendor_id_vendors',
            'fk_vendor_risk_links_risk_id_risks',
            'fk_vendor_control_links_vendor_id_vendors',
            'fk_vendor_control_links_control_id_controls',
            'fk_vendor_kri_links_vendor_id_vendors',
            'fk_vendor_kri_links_kri_id_key_risk_indicators'
        )
    """))
    by_name = {r.conname: r.confdeltype for r in rows}
    assert len(by_name) == 6, f"missing constraints: {by_name}"
    for name, deltype in by_name.items():
        assert deltype == "c", f"{name} confdeltype={deltype!r}, expected 'c' (CASCADE)"


@pytest.mark.asyncio
async def test_vendors_status_column_absent_after_upgrade(postgres_session) -> None:
    row = await postgres_session.execute(text("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'vendors' AND column_name = 'status'
    """))
    assert row.first() is None, "vendors.status column must be dropped"


@pytest.mark.asyncio
async def test_ix_vendors_status_index_absent(postgres_session) -> None:
    row = await postgres_session.execute(text("""
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'vendors' AND indexname = 'ix_vendors_status'
    """))
    assert row.first() is None, "ix_vendors_status must be dropped with the column"
```

**Assertions**: 6 FK `confdeltype = 'c'` (CASCADE); `vendors.status` absent;
`ix_vendors_status` index absent.

#### 1.4 `tests/backend/pytest/migrations/test_vendor_link_migration_forward_only_red.py`

```python
"""RED: ADR-010 forward-only contract on the new migration."""
import importlib
import inspect

import pytest

pytestmark = pytest.mark.contract


def test_downgrade_raises_not_implemented() -> None:
    module = importlib.import_module(
        "alembic.versions.k6l7m8n9o0p1_vendor_link_cascade_and_status_drop"
    )
    with pytest.raises(NotImplementedError, match="Forward-only"):
        module.downgrade()


def test_revision_chain_points_at_prior_head() -> None:
    module = importlib.import_module(
        "alembic.versions.k6l7m8n9o0p1_vendor_link_cascade_and_status_drop"
    )
    assert module.revision == "k6l7m8n9o0p1"
    assert module.down_revision == "j5k6l7m8n9o0"  # current head


def test_migration_source_cites_adr_010() -> None:
    module = importlib.import_module(
        "alembic.versions.k6l7m8n9o0p1_vendor_link_cascade_and_status_drop"
    )
    source = inspect.getsource(module)
    assert "raise NotImplementedError" in source
    assert "ADR-010" in source
```

**Assertions**: `downgrade()` raises `NotImplementedError`; revision chain
points to `j5k6l7m8n9o0`; source cites ADR-010.

#### 1.5 (Phase 4 NEW) `tests/backend/pytest/migrations/test_vendor_migration_idempotency_red.py`

```python
"""RED Phase 4: running upgrade() twice on Postgres must not corrupt state."""
import pytest
from sqlalchemy import text

pytestmark = [pytest.mark.contract, pytest.mark.postgres]


@pytest.mark.asyncio
async def test_upgrade_then_re_upgrade_is_safe(postgres_engine) -> None:
    """The migration must be idempotent: re-running upgrade() in a fresh
    session against a post-upgraded DB must either no-op or raise a clean,
    deterministic error WITHOUT half-applied state."""
    from alembic.versions.k6l7m8n9o0p1_vendor_link_cascade_and_status_drop import upgrade

    async with postgres_engine.connect() as conn:
        baseline = await conn.execute(text("SELECT COUNT(*) FROM vendors"))
        baseline_count = baseline.scalar()

        try:
            await conn.run_sync(lambda sync_conn: upgrade())
        except Exception as exc:
            # Expected: index/column already absent. Must be a deterministic
            # ProgrammingError, not a partial-state corruption.
            assert "does not exist" in str(exc).lower() or "already" in str(exc).lower(), exc

        post = await conn.execute(text("SELECT COUNT(*) FROM vendors"))
        assert post.scalar() == baseline_count, "row count drift after re-upgrade"

        col = await conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name='vendors' AND column_name='status'
        """))
        assert col.first() is None
```

**Assertions**: re-running upgrade is safe — either no-op or deterministic
ProgrammingError; row count unchanged; column stays absent.

#### 1.6 (Phase 4 NEW) `tests/backend/pytest/migrations/test_vendor_link_concurrent_writes_red.py`

```python
"""RED Phase 4: concurrent INSERT into vendor_risk_links during a CASCADE
DELETE on vendors must NOT leave orphans and must not deadlock the migration."""
import asyncio

import pytest
from sqlalchemy import text

pytestmark = [pytest.mark.contract, pytest.mark.postgres]


@pytest.mark.asyncio
async def test_cascade_serializes_with_concurrent_inserts(postgres_engine, seeded_vendor) -> None:
    """After upgrade, deleting a vendor under concurrent writes leaves no orphans."""
    vendor_id = seeded_vendor.id

    async def insert_link():
        async with postgres_engine.begin() as conn:
            await conn.execute(text(
                "INSERT INTO vendor_risk_links (vendor_id, risk_id, created_at) "
                "VALUES (:v, (SELECT id FROM risks LIMIT 1), now())"
            ), {"v": vendor_id})

    async def cascade_delete():
        async with postgres_engine.begin() as conn:
            await conn.execute(text("DELETE FROM vendors WHERE id = :v"), {"v": vendor_id})

    await asyncio.gather(
        *(insert_link() for _ in range(5)),
        cascade_delete(),
        return_exceptions=True,
    )

    async with postgres_engine.connect() as conn:
        orphans = await conn.execute(text(
            "SELECT COUNT(*) FROM vendor_risk_links l "
            "LEFT JOIN vendors v ON v.id = l.vendor_id WHERE v.id IS NULL"
        ))
        assert orphans.scalar() == 0, "orphan vendor_risk_links rows after concurrent writes"
```

**Assertions**: 5 concurrent inserts vs 1 cascade delete leaves zero orphans.

#### 1.7 (Phase 4 NEW) `tests/backend/pytest/migrations/test_vendor_link_orphan_precheck_red.py`

```python
"""RED Phase 4: before applying the migration, run an FK-orphan precheck."""
import pytest
from sqlalchemy import text

pytestmark = [pytest.mark.contract, pytest.mark.postgres]


@pytest.mark.asyncio
async def test_precheck_reports_orphans_before_migration(postgres_engine_pre_migration) -> None:
    """Hand-craft an orphan in a fixture DB at revision j5k6l7m8n9o0 (one
    rev before our new migration), then call the precheck helper exposed
    by the migration module; expect a ValueError with the orphan ids."""
    from alembic.versions.k6l7m8n9o0p1_vendor_link_cascade_and_status_drop import (
        check_no_link_orphans,
    )

    async with postgres_engine_pre_migration.begin() as conn:
        # Insert orphan vendor_risk_link (vendor_id missing in vendors).
        await conn.execute(text(
            "INSERT INTO vendor_risk_links (id, vendor_id, risk_id, created_at) "
            "VALUES (-1, 99999, (SELECT id FROM risks LIMIT 1), now())"
        ))

    with pytest.raises(ValueError, match="orphan"):
        async with postgres_engine_pre_migration.connect() as conn:
            await conn.run_sync(lambda sync: check_no_link_orphans(sync))
```

**Assertions**: precheck raises deterministic `ValueError` listing offending
row ids when pre-existing FK orphans are present, instead of letting Postgres
fail mid-FK-rebuild with an opaque error.

#### 1.8 (Phase 4 NEW) `tests/backend/pytest/migrations/test_vendor_link_partial_failure_recovery_red.py`

```python
"""RED Phase 4: if upgrade() fails partway, the transaction must roll back
to a fully PRE-upgrade state, not a half-migrated state."""
import pytest
from sqlalchemy import text
from unittest.mock import patch

pytestmark = [pytest.mark.contract, pytest.mark.postgres]


@pytest.mark.asyncio
async def test_failure_midway_rolls_back_to_pre_upgrade(postgres_engine_pre_migration) -> None:
    """Force a synthetic failure on the second op.create_foreign_key call.
    Assert that after rollback no constraint or column changes are visible."""
    from alembic.versions.k6l7m8n9o0p1_vendor_link_cascade_and_status_drop import upgrade

    call_count = {"n": 0}

    def patched_create_fk(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 2:
            raise RuntimeError("synthetic mid-upgrade failure")
        from alembic import op as real_op
        return real_op.create_foreign_key(*args, **kwargs)

    with patch("alembic.op.create_foreign_key", side_effect=patched_create_fk):
        async with postgres_engine_pre_migration.begin() as conn:
            with pytest.raises(RuntimeError, match="synthetic"):
                await conn.run_sync(lambda sync: upgrade())

    async with postgres_engine_pre_migration.connect() as conn:
        col = await conn.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='vendors' AND column_name='status'"
        ))
        assert col.first() is not None, "Partial failure left vendors.status dropped"

        delcode = await conn.execute(text(
            "SELECT confdeltype FROM pg_constraint "
            "WHERE conname='fk_vendor_risk_links_vendor_id_vendors'"
        ))
        row = delcode.first()
        assert row is not None, "FK was dropped without rebuild — partial state"
        assert row[0] != "c", "CASCADE applied despite mid-upgrade failure"
```

**Assertions**: synthetic mid-upgrade failure rolls back cleanly; column
stays present; original FK survives without CASCADE.

Run all 8 RED files; expect 4 fail on sqlite-only path (mixin / status drop
/ forward-only) and 4 skip if Postgres lane not provisioned. With Postgres
lane enabled, expect all 8 to fail/error.

### Step 2: Introduce `AbstractVendorLink` mixin

Path: `backend/app/models/_vendor_link_mixin.py` (NEW).

```python
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, declared_attr, mapped_column


class AbstractVendorLink:
    """Shared column shape for vendor link junction tables.

    Concrete subclasses keep their own ``__tablename__``, target FK column,
    and per-target unique constraint. The mixin enforces uniform shape on
    ``id``, ``vendor_id`` (with DB-level ``ON DELETE CASCADE``), and
    ``created_at`` so all three vendor-link tables stay in sync.

    Vendor-link tables are NOT archivable; this mixin is independent of
    ``ArchivableMixin``. See ADR-005 for the archivable column-shape contract.
    """

    __abstract__ = True

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    @declared_attr
    def vendor_id(cls) -> Mapped[int]:
        return mapped_column(
            ForeignKey("vendors.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
```

After this file lands and only `_vendor_link_mixin.py` is added (no DB
migration), §1.1's abstract-marker test is partly green; subclass tests
remain red until Step 3.

### Step 3: Rebase 3 link models

#### `backend/app/models/vendor_risk_link.py` (overwrite)

```python
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models._vendor_link_mixin import AbstractVendorLink

if TYPE_CHECKING:
    from app.models.risk import Risk
    from app.models.vendor import Vendor


class VendorRiskLink(AbstractVendorLink, Base):
    __tablename__ = "vendor_risk_links"
    __table_args__ = (UniqueConstraint("vendor_id", "risk_id", name="uq_vendor_risk_link"),)

    risk_id: Mapped[int] = mapped_column(
        ForeignKey("risks.id", ondelete="CASCADE"), index=True, nullable=False,
    )

    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="risk_links")
    risk: Mapped["Risk"] = relationship("Risk", back_populates="vendor_links")
```

#### `backend/app/models/vendor_control_link.py` (overwrite)

Same pattern, swap `risk_id` / `Risk` / `risks` / `uq_vendor_risk_link` for
`control_id` / `Control` / `controls` / `uq_vendor_control_link`.

#### `backend/app/models/vendor_kri_link.py` (overwrite)

Same pattern, swap to `kri_id` / `KeyRiskIndicator` / `key_risk_indicators` /
`uq_vendor_kri_link`. Note: kri-links already had `ondelete="CASCADE"` on
both FKs; the mixin formalises `vendor_id` cascade.

After Step 3, §1.1 fully green on sqlite ORM-metadata lane.

### Step 4: Generate Alembic migration

Path: `backend/alembic/versions/k6l7m8n9o0p1_vendor_link_cascade_and_status_drop.py` (NEW).

```python
"""Unify vendor link cascade and drop Vendor.status.

Revision ID: k6l7m8n9o0p1
Revises: j5k6l7m8n9o0
Create Date: 2026-05-09

Forward-only per ADR-010. Bundled changes:
  * Add ON DELETE CASCADE to vendor_risk_links FKs (vendor_id, risk_id).
  * Add ON DELETE CASCADE to vendor_control_links FKs (vendor_id, control_id).
  * Drop ix_vendors_status index.
  * Drop vendors.status column (single-value enum 'active' after unify cutover).

vendor_kri_links FKs already carry ON DELETE CASCADE per
``v2w3x4y5z6a_add_vendor_kri_links.py:28-29`` and are intentionally untouched.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


revision: str = "k6l7m8n9o0p1"
down_revision: Union[str, Sequence[str], None] = "j5k6l7m8n9o0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def check_no_link_orphans(connection) -> None:
    """Phase-4 precheck: refuse to apply if FK-orphan link rows exist.

    Surfaces a deterministic ValueError listing offending row ids instead
    of letting Postgres fail mid-FK-rebuild with an opaque error.
    """
    for table, fk_col, ref_table in (
        ("vendor_risk_links", "vendor_id", "vendors"),
        ("vendor_risk_links", "risk_id", "risks"),
        ("vendor_control_links", "vendor_id", "vendors"),
        ("vendor_control_links", "control_id", "controls"),
    ):
        rows = connection.execute(text(
            f"SELECT id FROM {table} l "
            f"WHERE NOT EXISTS (SELECT 1 FROM {ref_table} r WHERE r.id = l.{fk_col})"
        )).all()
        if rows:
            ids = [r[0] for r in rows]
            raise ValueError(f"orphan {table}.{fk_col} rows: {ids}")


def upgrade() -> None:
    if op.get_context().dialect.name == "sqlite":
        op.drop_index("ix_vendors_status", table_name="vendors", if_exists=True)
        with op.batch_alter_table("vendors") as batch:
            batch.drop_column("status")
        return

    bind = op.get_bind()
    check_no_link_orphans(bind)

    op.drop_constraint(
        "fk_vendor_risk_links_vendor_id_vendors", "vendor_risk_links", type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_vendor_risk_links_vendor_id_vendors", "vendor_risk_links", "vendors",
        ["vendor_id"], ["id"], ondelete="CASCADE",
    )
    op.drop_constraint(
        "fk_vendor_risk_links_risk_id_risks", "vendor_risk_links", type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_vendor_risk_links_risk_id_risks", "vendor_risk_links", "risks",
        ["risk_id"], ["id"], ondelete="CASCADE",
    )

    op.drop_constraint(
        "fk_vendor_control_links_vendor_id_vendors", "vendor_control_links", type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_vendor_control_links_vendor_id_vendors", "vendor_control_links", "vendors",
        ["vendor_id"], ["id"], ondelete="CASCADE",
    )
    op.drop_constraint(
        "fk_vendor_control_links_control_id_controls", "vendor_control_links", type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_vendor_control_links_control_id_controls", "vendor_control_links", "controls",
        ["control_id"], ["id"], ondelete="CASCADE",
    )

    op.drop_index("ix_vendors_status", table_name="vendors", if_exists=True)
    op.drop_column("vendors", "status")


def downgrade() -> None:
    """Forward-only per ADR-010; restore from a pre-upgrade snapshot."""
    raise NotImplementedError(
        "Forward-only migration. Restore from snapshot per ADR-010."
    )
```

#### Postgres-lane test plan (Step 4 GREEN sequence)

Bring up Postgres lane (Phase 6 fix #2):

```bash
export TEST_DATABASE_URL="postgresql+asyncpg://localhost:5432/riskhub_test"
# Optionally also TEST_DATABASE_URL_PRE_MIGRATION pointing at a DB at revision j5k6l7m8n9o0
alembic upgrade head
TEST_DATABASE_URL="$TEST_DATABASE_URL" pytest -m postgres tests/backend/pytest/migrations/
```

Specific test invocations:

```bash
TEST_DATABASE_URL="..." pytest -m postgres tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py
TEST_DATABASE_URL="..." pytest tests/backend/pytest/migrations/test_vendor_link_migration_forward_only_red.py
TEST_DATABASE_URL="..." pytest -m postgres tests/backend/pytest/migrations/test_vendor_migration_idempotency_red.py
TEST_DATABASE_URL="..." pytest -m postgres tests/backend/pytest/migrations/test_vendor_link_concurrent_writes_red.py
TEST_DATABASE_URL_PRE_MIGRATION="..." pytest -m postgres tests/backend/pytest/migrations/test_vendor_link_orphan_precheck_red.py
TEST_DATABASE_URL_PRE_MIGRATION="..." pytest -m postgres tests/backend/pytest/migrations/test_vendor_link_partial_failure_recovery_red.py
```

Pre-upgrade row-count capture (snapshot/restore — see Snapshot/Restore
Procedure below):

```sql
SELECT COUNT(*) FROM vendors;                  -- N0
SELECT COUNT(*) FROM vendor_risk_links;        -- L0
SELECT COUNT(*) FROM vendor_control_links;     -- L1
SELECT COUNT(*) FROM vendor_kri_links;         -- L2
```

Post-upgrade verification:
- All 6 FKs `confdeltype = 'c'`.
- `vendors.status` absent.
- `ix_vendors_status` absent.
- N0 / L0 / L1 / L2 unchanged.

### Step 5: Drop status surface (8 prod sites + 1 seed write + 6 seed dicts)

#### `backend/app/models/vendor.py` edits

- `:22-23` — DELETE `class VendorStatus(str, PyEnum):\n    active = "active"`.
- `:82` — DELETE `status: Mapped[str] = mapped_column(String(20), default=VendorStatus.active.value, index=True)`.
- `:5` — KEEP `from enum import Enum as PyEnum` (still used by `VendorType`
  L26 and `VendorReplaceability` L34).
- `:89-103` — KEEP three relationship declarations with
  `cascade="all, delete-orphan"`. The DB-level cascade (Step 4) is
  defense-in-depth + supports raw SQL `DELETE`. They are complementary, not
  redundant.

#### `backend/app/models/__init__.py` edits

- Drop `VendorStatus` from import line (line ~34).
- Drop `"VendorStatus"` from `__all__` (line ~80).

#### `backend/app/schemas/vendor.py` edits

- `:12-13` — DELETE `class VendorStatusEnum(str, Enum):\n    active = "active"`.
- `:53` — DELETE `status: VendorStatusEnum = VendorStatusEnum.active` from `VendorBase`.
- `:83` — DELETE `status: VendorStatusEnum | None = None` from `VendorUpdate`.
- `:4` — KEEP `from enum import Enum` (still used by `VendorTypeEnum`,
  `VendorReplaceabilityEnum`).

#### `backend/app/schemas/__init__.py` edits

- `:115` — drop `VendorStatusEnum,` from imports.
- `:212` — drop `"VendorStatusEnum"` from `__all__`.

#### 8 prod sites

- `backend/app/services/_register_listings/vendors.py`:
  - `:15` — drop `VendorStatusEnum` from the import line.
  - `:53-54` — drop `status_filter: VendorStatusEnum | None` and `archived_status_filter: bool` from the `VendorListCriteria` dataclass.
  - `:89` — drop `status_filter` parameter from `coerce_vendor_list_criteria`.
  - `:103` — drop `status_filter_value` line.
  - `:108` — drop `"status": status_filter_value` from `filter_values` defaults.
  - `:121-124` — drop `status_value` and `archived_status_filter` calculation.
  - `:129-132` — drop `status_filter=...` and `archived_status_filter=...` from the `VendorListCriteria(...)` constructor.
  - `:158-162` — drop `if criteria.archived_status_filter:` and `elif criteria.status_filter is not None:` branches in `apply_vendor_list_filters`. Keep `elif not criteria.include_archived:` (becomes `if not criteria.include_archived:`).
  - `:200` — drop `"status": Vendor.status,` from sort columns map.
  - `:273` — drop `Vendor.status.label("status"),` from `vendor_flag_membership_query` projection.
  - `:482` — drop `status_filter` parameter from `list_vendor_governance`.
  - `:501` — drop `status_filter=status_filter,` argument on the `coerce_vendor_list_criteria` call.

- `backend/app/services/_register_listings/controls.py:554` — DELETE `status=link.vendor.status,`.
- `backend/app/services/_register_listings/risks.py:430` — DELETE `status=vendor.status,`.
- `backend/app/services/_monitoring_response.py:219` — DELETE `status=vendor.status,`.
- `backend/app/services/_reporting/exports/rows.py:120` — DELETE `"status": vendor.status,`.
- `backend/app/services/_kri_history/direct_application.py:36` — DELETE `status=link.vendor.status,`.

#### Seed scripts

- `backend/scripts/seed_e2e_vendors.py`:
  - `:13` — drop `VendorStatus` from import.
  - `:35,56,77,98,119,140` — DELETE 6 `"status": VendorStatus.active.value,` keys.

- `backend/scripts/seed_e2e_archives.py:283` — replace
  `vendor.status = entry["status"]` with
  `vendor.is_archived = bool(entry.get("is_archived", False))`.

#### Test fixture deletions

- `tests/backend/pytest/test_vendors.py:436` — DELETE `assert vendor.status == "active"`.
- `tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py:7,37` —
  DELETE `VendorStatusEnum` import + `status=VendorStatusEnum.active.value` fixture line.
- `tests/backend/pytest/test_dashboard.py:960,970,980` — DELETE
  `VendorStatus.active.value` fixture lines.

### Step 6: Lock collapse

`backend/app/models/_archivable.py:60-64` — change:

```python
legacy_values = {
    "risks": ("archived",),
    "controls": ("archived",),
    "vendors": ("inactive",),
}.get(getattr(model, "__tablename__", ""))
```

to:

```python
legacy_values = {
    "risks": ("archived",),
    "controls": ("archived",),
}.get(getattr(model, "__tablename__", ""))
```

The early-return at L67 fires when `legacy_values is None`, so
`archived_clause(Vendor)` collapses to `Vendor.is_archived.is_(archived)`.

Run architecture locks:

```bash
make -f scripts/Makefile test-architecture-locks
```

### Step 7: Doc updates (7 files)

1. **`backend/app/models/README.md`** — add `AbstractVendorLink` to mixin
   inventory section; cross-link `_archivable.py`. ~3-line bullet describing
   shared shape, `__abstract__ = True`, vendor-link tables NOT archivable.

2. **`backend/app/services/_vendor_links/README.md`** — replace any line
   claiming cascade is "ORM-level only" with "DB-level via `ON DELETE CASCADE`
   on `vendor_id` and the target FK".

3. **`docs/adr/ADR-005-archivable-mixin-schema-contract.md:13-16`** — add
   paragraph noting `Vendor.status` was dropped in revision `k6l7m8n9o0p1`;
   the legacy `("inactive",)` alias is retired; vendors archive solely via
   `is_archived`. Risks and controls retain their `("archived",)` alias.

4. **`docs/adr/ADR-010-postgres-migration-rehearsal-contract.md:23-30`** —
   append bullet under "Migration Impact":

   > `vendors.status` column dropped (single-value enum `'active'` after
   > unify cutover); `vendor_risk_links` and `vendor_control_links` FKs
   > rebuilt with `ON DELETE CASCADE` to match `vendor_kri_links` semantics.
   > Bundled in revision `k6l7m8n9o0p1`.

   Append row-count target: pre-upgrade snapshot must capture
   `SELECT COUNT(*) FROM vendors` and `SELECT COUNT(*) FROM vendor_risk_links`
   (and the two siblings) for post-upgrade reconciliation.

5. **`docs/README.md:111-112`** — strike any sentence mentioning `Vendor.status`.

6. **`docs/DOCUMENTATION_TREE.md:84`** — strike `vendor.status` reference.

7. **`docs/BUSINESS_LOGIC.md:619`** — replace `Vendor.status` reference with
   note that vendor lifecycle is managed exclusively through `is_archived`
   per ADR-005.

### Step 8: Final gates

```bash
make -f scripts/Makefile test-architecture-locks
TEST_DATABASE_URL="postgresql+asyncpg://..." make -f scripts/Makefile test-postgres-ci
pytest tests/backend/pytest/test_vendors.py tests/backend/pytest/test_vendor_links.py \
       tests/backend/pytest/test_kris_rbac.py tests/backend/pytest/test_vendor_link_workflow_module.py \
       tests/backend/pytest/api/v1/test_collection_grouping_api.py tests/backend/pytest/test_dashboard.py \
       tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py \
       tests/backend/pytest/test_e2e_seed_archive_state_red.py
ruff check backend tests
mypy backend/app
python scripts/security/validate_authz_capability_contract.py
```

### Step 9: Single bundled commit

**Title**: `refactor(vendor): introduce AbstractVendorLink mixin and drop Vendor.status`

**Body**: see "Step 9 — Single bundled commit" in Item #17 above.

Bundled because:
1. Both axes touch `vendor*` schema in one Alembic revision.
2. Both share ADR-010 forward-only entry.
3. Both share rehearsal scope (snapshot pre-upgrade, run upgrade, verify counts).
4. Single migration window minimises operational risk.

Allow split into 2 commits if diff > 400 lines OR `mypy` cannot type-check
the intermediate state cleanly. See Item #17 for the C1/C2 split.

### Snapshot/Restore Procedure

Pre-merge (in staging):

```bash
# 1. Capture snapshot.
pg_dump --format=custom --jobs=4 \
  --file=pre_k6l7m8n9o0p1_$(date +%Y%m%d-%H%M).dump $STAGING_DB

# 2. Capture row counts (checked into
#    .planning/audits/_context/migration-snapshot-k6l7m8n9o0p1.txt).
psql $STAGING_DB -c "SELECT 'vendors' AS t, COUNT(*) FROM vendors
                     UNION ALL SELECT 'vendor_risk_links', COUNT(*) FROM vendor_risk_links
                     UNION ALL SELECT 'vendor_control_links', COUNT(*) FROM vendor_control_links
                     UNION ALL SELECT 'vendor_kri_links', COUNT(*) FROM vendor_kri_links;"

# 3. Run migration on staging clone.
alembic upgrade head

# 4. Verify post-state.
TEST_DATABASE_URL="$STAGING_DB" pytest -m postgres tests/backend/pytest/migrations/

# 5. Verify row counts unchanged (re-run query above; assert same).
```

**Validate restore-ability of the snapshot** before committing:

```bash
pg_restore --list pre_k6l7m8n9o0p1_<timestamp>.dump | head
# ensure non-empty toc; record line count
```

Production cutover (operational rollback):

```bash
# If post-deploy issue surfaces:
# 1. Stop application traffic.
# 2. Restore snapshot.
pg_restore --clean --no-owner --jobs=4 \
  --dbname=$PROD_DB pre_k6l7m8n9o0p1_<timestamp>.dump

# 3. Redeploy prior backend version.
# 4. Invalidate frontend bundle caches (CDN purge).
```

`downgrade()` is **never** called; it raises `NotImplementedError`.
Forward-only per ADR-010.

### Postgres-Lane Test Plan (consolidated for #69+#70)

| Test | Path | Phase | Markers |
|------|------|-------|---------|
| 1 | `tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py` | base | `[contract, postgres]` |
| 2 | `tests/backend/pytest/migrations/test_vendor_link_migration_forward_only_red.py` | base | `[contract]` (no DB) |
| 3 | `tests/backend/pytest/migrations/test_vendor_migration_idempotency_red.py` | Phase 4 NEW | `[contract, postgres]` |
| 4 | `tests/backend/pytest/migrations/test_vendor_link_concurrent_writes_red.py` | Phase 4 NEW | `[contract, postgres]` |
| 5 | `tests/backend/pytest/migrations/test_vendor_link_orphan_precheck_red.py` | Phase 4 NEW | `[contract, postgres]` |
| 6 | `tests/backend/pytest/migrations/test_vendor_link_partial_failure_recovery_red.py` | Phase 4 NEW | `[contract, postgres]` |
| 7 | `tests/backend/pytest/architecture/test_vendor_link_mixin_red.py` | base | `[contract]` |
| 8 | `tests/backend/pytest/architecture/test_vendor_status_drop_red.py` | base | `[contract]` |

**Postgres-lane invocation** (Phase 6 fix #2 — `make postgres-up` does NOT
exist):

```bash
export TEST_DATABASE_URL="postgresql+asyncpg://localhost:5432/riskhub_test"
make -f scripts/Makefile test-postgres-ci
# Or directly:
TEST_DATABASE_URL="..." pytest -m "contract and postgres" tests/backend/pytest/migrations/
```

**Sqlite-lane (architecture-only)**:

```bash
pytest -m "contract and not postgres" tests/backend/pytest/architecture/test_vendor_link_mixin_red.py \
       tests/backend/pytest/architecture/test_vendor_status_drop_red.py \
       tests/backend/pytest/migrations/test_vendor_link_migration_forward_only_red.py
```

---

End of Section 5 — Per-Item Recipes Part 3 (Waves 6-8) + Migration Window Detail — final, Phase 6 corrections applied.



---

## Section 6 — ADR Drafts (Inline)

This section contains the full text of three new architectural decision records produced by this resolution plan. They are written in the same voice and structure as ADR-001 through ADR-010 and should be committed to `docs/adr/` at the slot indicated by the per-item recipe (Sections 3-5). All three carry `## Status = Accepted` per the existing convention.

Phase 4 + Phase 6 corrections applied:

- ADR-011 §Decision pins `require_permission(resource, action)` to `backend/app/core/security.py:170` and explicitly does NOT attribute the factory to ADR-001. ADR-001 owns `Capabilities.can(action, resource, *, instance=None)`; ADR-011 elects `require_permission` as the canonical FastAPI dependency adapter satisfying ADR-001's "endpoints may keep FastAPI dependency helpers as adapters" clause (`ADR-001:13`).
- ADR-011 cross-refs are ADR-001, ADR-002, ADR-003 (cite `core/exceptions.py:68-69`), and ADR-004. ADR-006 is REJECTED — ADR-011 is a freeze, not a sweep (Loop 2 verdict).
- ADR-012 drops the top-level `## Cross-References` header (no existing ADR uses one) and folds cross-references into `## Invariant Tests` per the ADR-008:33 voice. ADR-002 cited in `## Decision`. ADR-008 wording rewritten to "ADR-008 makes `_config` the cross-cutting SSOT; ADR-012 applies SSOT discipline to a bounded-context-local anchor". ADR-009 reference narrowed (covers reserved enum/role/permission DECLARATIONS, not module-surface deprecation).
- ADR-007 amendment uses "PRIMARY classification + many-to-one for right-halves" (NOT "EXACTLY ONE"). Per-allowlist atomicity sentence included. `_orphaned_items` and `_notification_inbox` are Workflow-paired with `_identity_access_lifecycle`. The 5th category is `Cross-cutting` (NOT `Core`). Recomputed count: 32 entries / 31 packages / 1 file (`_register_listings` dual-classed; `_monitoring_response.py` file entry).

---

### ADR-011: Auth Scheme and Session Model

```markdown
# ADR-011 Auth Scheme and Session Model

## Status

Accepted

## Context

RiskHub authentication exists across `backend/app/api/v1/endpoints/auth/` and `backend/app/core/security.py` but no ADR documents the canonical scheme. Three transport surfaces coexist on protected routes: the `require_permission(resource, action)` FastAPI dependency factory, body-call `_require_*` helpers, and inline `if not has_permission: 403` checks. The mock-auth path is a fallback branch inside `backend/app/core/security.py:107-136` (the canonical `get_current_user` dependency), gated by both `settings.mock_auth_enabled` and `settings.debug`. ADR-002 records 8 auth-flow endpoint commit exemptions in `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml`, each carrying `expires_at = 2026-09-01`. SSO with Microsoft Entra is implemented at `backend/app/api/v1/endpoints/auth/sso.py:170` and `backend/app/api/v1/endpoints/auth/_sso_helpers.py:48` but its relationship to internal session lifetime is undocumented at the architecture level.

## Decision

JWT bearer access tokens with refresh-token rotation and a token-version SSOT are the canonical authentication scheme. Single-use refresh per rotation; reuse triggers full revocation through the token-version field bumped at `backend/app/api/v1/endpoints/auth/logout.py:101,132`.

The mock-auth fallback inside `backend/app/core/security.py:107-136` is permitted only when `mock_auth_enabled && debug` evaluates true — both conditions are required (the AND is load-bearing; either alone is forbidden). Production code uses `app.api.deps.get_current_user`, which delegates into `app.core.security.get_current_user`. New mock-auth call sites outside that line range are forbidden, and `MOCK_AUTH_ENABLED=true` is forbidden in non-debug environments.

Endpoint authorization uses exactly one idiom going forward — the `require_permission(resource, action)` FastAPI dependency factory defined in `backend/app/core/security.py:170`. ADR-001 §Decision names `Capabilities.can(action, resource, *, instance=None)` as the service-layer Interface and explicitly permits FastAPI dependency helpers as endpoint adapters; `require_permission` is the canonical adapter elected by this ADR. Body-call `_require_*` helpers and inline `if not has_permission` raises are frozen and may not be added on protected routes; existing call sites are tracked for migration but the count is non-increasing.

SSO with Microsoft Entra is deployment-time configuration, not a runtime branch. Entra-issued tokens are exchanged at `auth/sso.py:170` for a RiskHub access+refresh pair via `auth/_sso_helpers.py:48`; internal refresh-rotation owns session lifetime from that point forward. Logout cascade at `auth/logout.py:101,132` is the only path that bumps `token_version`, clears the refresh cookie, and removes the server-side refresh row.

The 8 auth-flow endpoint commit exemptions in `_endpoint_commit_allowlist.toml` (`auth/sso.py:170`, `auth/refresh.py:177`, `auth/logout.py:101`, `auth/logout.py:132`, `auth/password.py:128`, `auth/_sso_helpers.py:48`, `auth/demo.py:67`, `auth/password.py:161`) migrate to service-owned transactions before `2026-09-01` per ADR-002 §Hard Expiration on Auth-Flow Exemption. New entries to that allowlist for auth flows are forbidden; the lock cap drops to 0 after the sunset date. Adding a third authentication scheme on protected routes is forbidden without superseding this ADR.

## Alternatives Rejected

- Session cookies: rejected because cookie sessions do not eliminate refresh rotation and complicate cross-origin frontend operation.
- Three-idiom status quo (`require_permission` + body-call `_require_*` + inline `403`): rejected because drift detection is fragile and contract-validator coverage is partial.
- Removing mock-auth entirely: rejected because dev/test fixtures depend on the mock-auth fallback inside `core/security.py:107-136`, and removing it would force every test to mint a full token chain.
- Letting Entra own session lifetime: rejected because RiskHub refresh rotation handles permission revocation, token-version bumps, and server-side refresh-row removal more granularly than the Entra session.
- Attributing `require_permission` to ADR-001's Interface: rejected because ADR-001 names `Capabilities.can(action, resource)` (service-layer Interface) and `require_permission(resource, action)` is the FastAPI adapter, not the same surface; conflating them would erase the adapter boundary.

## Migration Impact

Each of the 8 auth-flow allowlist sites needs a service-owned transaction wrapper before `2026-09-01` (tracked under finding #76). Implementation order is sequenced under #71 (frontend session module merge) and #66 (AuthContext provider split), both gated on this ADR. Existing body-call `_require_*` and inline-`403` call sites remain during migration; new sites are forbidden by lock. SSO deployment configuration is unchanged — only the documented relationship between Entra token verification and RiskHub session issuance is added.

## Rollback Strategy

Forward-only. The token-version field already exists and logout sites already bump it. If a refresh-rotation regression appears in production, operators bump `token_version` for the affected user and re-issue. The ADR does not introduce schema or data-shape changes.

## Invariant Tests

- Hard expiration on auth-flow exemption: `tests/backend/pytest/architecture/test_w5_endpoint_commit_ratchet_red.py::test_auth_commit_allowlist_entries_are_complete_and_unexpired` already enforces `expires_at = 2026-09-01`. After `2026-09-01` the same lock is extended to cap allowlist size at 0; new entries fail the test.
- New `tests/backend/pytest/architecture/test_w12_auth_idiom_ratchet_red.py` scans `backend/app/api/v1/endpoints/` for body-call `_require_*` patterns and inline `if not has_permission` raises and asserts the count is non-increasing against `_auth_idiom_baseline.toml`.
- New `tests/backend/pytest/architecture/test_w12_get_current_user_isolation_red.py` forbids `from app.core.security import get_current_user` outside `backend/app/core/security.py` and `backend/app/api/deps.py`; production importers route through `app.api.deps.get_current_user`.
- New `tests/backend/pytest/architecture/test_w12_mock_auth_guard_red.py` parses `backend/app/core/security.py:107-136` and asserts the mock-auth branch is reached only when `mock_auth_enabled and settings.debug` (both conjuncts present in the AST).
- New `tests/backend/pytest/architecture/test_w12_sso_token_exchange_boundary_red.py` asserts every SSO->RiskHub token exchange routes through `backend/app/api/v1/endpoints/auth/sso.py:170` calling into `backend/app/api/v1/endpoints/auth/_sso_helpers.py:48`; no other endpoint mints a RiskHub access+refresh pair from an Entra token.
- Cross-reference verified: every `AUTHZ-` action in `docs/security/authorization-capability-contract.json` records a `frontend_gate` and `backend_authority` that resolve through `require_permission` per `scripts/security/validate_authz_capability_contract.py:170-175`.
- ADR-001 — Capabilities surface: ADR-001 §Decision names `Capabilities.can(action, resource, *, instance=None)` as the service-layer Interface and permits FastAPI dependency adapters at the endpoint seam. `require_permission(resource, action)` at `backend/app/core/security.py:170` is the canonical adapter elected by this ADR; the argument orders are deliberately distinct (service Interface is `(action, resource)`; adapter factory is `(resource, action)`).
- ADR-002 — Service-owned transactions: the 8 auth-flow allowlist entries evolve to 0 by 2026-09-01 per ADR-002 §Hard Expiration on Auth-Flow Exemption. The `test_w5_endpoint_commit_ratchet_red.py` lock at `tests/backend/pytest/architecture/` enforces both the expiration date and the post-sunset cap-0.
- ADR-003 — Domain exception taxonomy: `AuthorizationError` and `AuthenticationError` are projected via `EXCEPTION_REGISTRY` at `backend/app/core/exceptions.py:68-69`; the FastAPI handler maps them to 403/401 with the documented `WWW-Authenticate` header. Auth endpoints raise these domain types, not raw `HTTPException`.
- ADR-004 — UTC-aware datetime SSOT: JWT `exp`/`iat` derive from `utc_now()` at `backend/app/core/security.py:68`; all timestamp fields on refresh-token rows use `UtcAwareDatetime` at the schema boundary.

## Hard Expiration on Auth-Flow Exemption

Auth-flow exemptions in `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` carry `expires_at = 2026-09-01` (8 entries). The architecture lock at `architecture/test_w5_endpoint_commit_ratchet_red.py::test_auth_commit_allowlist_entries_are_complete_and_unexpired` will fail after that date until each entry is re-justified or the underlying commit is migrated to a service-owned transaction. After the sunset, the same lock asserts the allowlist is empty for auth flows; the cap drops from 8 to 0. The 8 sites and their owning files:

- `backend/app/api/v1/endpoints/auth/sso.py:170` — SSO exchange commit, migrating to `app.services._auth_session.session_lifecycle.complete_sso_login`.
- `backend/app/api/v1/endpoints/auth/_sso_helpers.py:48` — SSO helper commit, folded into the same `_auth_session` service method.
- `backend/app/api/v1/endpoints/auth/refresh.py:177` — Refresh rotation commit, migrating to `app.services._auth_session.session_lifecycle.rotate_refresh_token`.
- `backend/app/api/v1/endpoints/auth/logout.py:101` — Single-session logout commit, migrating to `app.services._auth_session.session_lifecycle.logout_session`.
- `backend/app/api/v1/endpoints/auth/logout.py:132` — All-sessions logout commit, migrating to the `logout_all_sessions` variant of the same service method.
- `backend/app/api/v1/endpoints/auth/password.py:128` — Password change commit, migrating to `app.services._identity_access_lifecycle.password.update_password`.
- `backend/app/api/v1/endpoints/auth/password.py:161` — Password reset commit, wrapping into the same identity-access service.
- `backend/app/api/v1/endpoints/auth/demo.py:67` — Demo-session commit, migrating to `app.services._identity_access_lifecycle.demo.create_demo_session`.

## SSO Token-Exchange Boundary

Entra-issued tokens reach `backend/app/api/v1/endpoints/auth/sso.py:170` for verification. The exchange in `backend/app/api/v1/endpoints/auth/_sso_helpers.py:48` mints a RiskHub access+refresh pair and persists the refresh row; from that point forward the RiskHub session owns lifetime. New SSO providers attach at the same exchange point; they do not bypass refresh rotation or token-version invalidation. Bound to lock `tests/backend/pytest/architecture/test_w12_sso_token_exchange_boundary_red.py`.
```

---

### ADR-012: KRI Time-Series Period Algebra

```markdown
# ADR-012 KRI Time-Series Period Algebra

## Status

Accepted

## Context

KRI deadline notifications, history corrections, and dashboard summaries all reach the same period-algebra primitives: `period_bounds_for_date`, `latest_closed_period_for_date`, `is_period_end_boundary`, `due_date`, and `is_within_reporting_window`. These primitives currently live in `backend/app/services/_kri_history/periods.py` (canonical), but cross-package callers reach them through three `KRIHistoryService` static-method bridges in `backend/app/services/kri_deadline_service.py:64,77,78`. The reporting-grace constant `REPORTING_GRACE_DAYS = 15` is duplicated: the canonical declaration is `backend/app/services/_kri_history/constants.py:2`; a copy lives in `backend/app/services/_config/lookup.py:26 ConfigDefaults.REPORTING_GRACE_DAYS`, reached from `kri_deadline_service.py:52` and `kri_deadline_support.py:36`. The duplicate is silent — the two values agree today — but it can drift and there is no enforcement that the bounded context owns its own constant.

The five KRI states recorded by `BUSINESS_LOGIC.md §2.3` (`new`, `not_submitted`, `breach`, `warning`, `optimal`) are computed from period algebra plus the breach-status check; today the resolution is split across `_resolve_period_end`, `_due_date`, and the breach evaluator inside `KRIDeadlineService`, with the period-end and due-date arithmetic re-derived at three separate static-method reaches.

## Decision

`backend/app/services/_kri_history/periods.py` is the SSOT for the period-algebra primitives `(period_bounds_for_date, latest_closed_period_for_date, is_period_end_boundary, due_date, is_within_reporting_window)`. `backend/app/services/_kri_history/constants.py` is the SSOT for `REPORTING_GRACE_DAYS = 15`. Cross-package callers import these directly from the SSOT modules, or from the `KRIHistoryService` re-export when a single named entry point reduces coupling. Per ADR-002, `KRIDeadlineService` is the transaction-owning service entrypoint for deadline notifications and outbox dispatch; classification logic does not commit, but the surrounding notification dispatch does.

The `ConfigDefaults.REPORTING_GRACE_DAYS` duplicate at `backend/app/services/_config/lookup.py:26` is removed; consumers import from `_kri_history.constants` directly. The three `KRIHistoryService.*` static-method reaches in `kri_deadline_service.py:64,77,78` collapse into a single `KRIDeadlineService.classify(kri, *, today)` helper that returns a frozen `KriDeadlineClassification` dataclass with `(period_end, due, reporting_owner_id, is_breached)`.

The five KRI states (`new`, `not_submitted`, `breach`, `warning`, `optimal`) defined in `BUSINESS_LOGIC.md §2.3` are computed from the period algebra plus the canonical breach evaluator. State precedence is `new -> not_submitted -> breach -> warning -> optimal` per the documented ordering. The state vocabulary is registered in `tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml` and bound to a lock test that pins the period-algebra consumers, the single-definition `REPORTING_GRACE_DAYS`, and the single `KRIHistoryService.*` reach inside `kri_deadline_service.py`.

## Alternatives Rejected

- **Promote `ConfigDefaults` to authoritative**: rejected because the grace-days constant is package-internal period algebra, not CRO-managed runtime config. Promoting it would invert the bounded-context-ownership direction.
- **Keep three independent static-method reaches**: rejected because every additional reach broadens the API surface that the lock test must enforce, and changes to period algebra ripple into three call sites instead of one.
- **Delete the `KRIHistoryService` re-export entirely**: rejected because the static-method bridges remain a compatibility seam for the public service-class import; only the cross-package call sites are consolidated.
- **Inline the five KRI states inside `KRIDeadlineService`**: rejected because the state vocabulary is shared with dashboards, breach-trend exports, and the public KRI listing surfaces; centralizing the state names in the period-algebra module preserves single-Interface discipline.

## Migration Impact

The collapse touches `kri_deadline_service.py` (single file, isolated change), `kri_deadline_support.py:36` (one fallback removed), and removes one line from `_config/lookup.py:26`. Snapshot rebaselines are not required: classifications use the same period algebra before and after. A snapshot rebaseline for the affected listing/dashboard surfaces is taken under ADR-006 only if the parametric output-equality test reveals a behavioural drift.

## Rollback Strategy

Rollback restores the `ConfigDefaults.REPORTING_GRACE_DAYS = 15` line, the three static-method reaches, and the previous fallback at `kri_deadline_support.py:36`. The parametric output-equality test at `tests/backend/pytest/test_kri_deadline_classify_red.py` prevents silent regression of the per-call semantics.

## Invariant Tests

- `REPORTING_GRACE_DAYS = 15` may appear in EXACTLY ONE source-of-truth location: `backend/app/services/_kri_history/constants.py`. The lock test `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py::test_reporting_grace_days_has_single_definition` enforces this.
- No module outside `_kri_history/` and the allowlist in `tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml` may import `period_bounds_for_date`, `latest_closed_period_for_date`, `due_date`, `is_period_end_boundary`, or `is_within_reporting_window`. Enforced by `test_period_algebra_consumers_are_in_allowlist`.
- `kri_deadline_service.py` may contain at most one `KRIHistoryService.*` reference (the collapsed `classify_for_today` entrypoint). Enforced by `test_kri_deadline_service_uses_single_classify_call`.
- `kri_deadline_service.py` may not reference `ConfigDefaults.REPORTING_GRACE_DAYS`. Enforced by `test_kri_deadline_service_does_not_use_config_defaults_for_grace`.
- A parametric output-equality test (`tests/backend/pytest/test_kri_deadline_classify_red.py`) pins the `(period_end, due, reporting_owner_id, is_breached)` contract of the new `KRIDeadlineService.classify` helper against representative `(frequency, last_period_end, today)` tuples covering monthly, quarterly, and annual cadences.
- The five KRI states (`new`, `not_submitted`, `breach`, `warning`, `optimal`) are recorded with their precedence in `BUSINESS_LOGIC.md §2.3` and `_kri_state_vocabulary_allowlist.toml`; lock tests enforce that consumers refer to the registered names.
- ADR-001 — capabilities module unification, single public Interface for capabilities; ADR-012 follows the same single-Interface discipline for period algebra.
- ADR-002 — service-owned transactions; `KRIDeadlineService` is the transaction-owning service entrypoint for deadline notifications, ensuring no orphan rows after rollback.
- ADR-006 — snapshot equivalence-class testing covers listing/dashboard surfaces. ADR-012 introduces a parametric output-equality test for `classify`, which is a different shape from a snapshot fixture and is not subject to ADR-006 redaction rules; the §Migration Impact rebaseline trigger reuses ADR-006 mechanically without conflating vocabulary.
- ADR-007 — bounded-context taxonomy; the `_kri_history` package owns its own grace-days constant, consistent with the bounded-context-local-SSOT direction. ADR-007 amendment registers `_kri_history` as a write-side context; ADR-012 refines the internal SSOT without re-classifying the context.
- ADR-008 — uses `ConfigDefaults` as the cross-cutting SSOT for risk thresholds. ADR-012 applies SSOT discipline to a bounded-context-local anchor (`_kri_history.constants`); the two anchors coexist deliberately because risk thresholds are CRO-managed runtime config, while the grace-days constant is package-internal period algebra.
- ADR-009 — reserved surfaces convention. ADR-009 governs reserved enum/role/permission DECLARATIONS; ADR-012 does not introduce reserved surfaces and does not extend `_reserved_modules.toml`. The `_kri_state_vocabulary_allowlist.toml` registry is a separate convention covering bounded-context-local SSOT, not reserved surfaces.
```

---

### ADR-007 Amendment: Read-Shape, Workflow-Paired, Adapter, and Cross-cutting Categories

The amendment is appended to `docs/adr/ADR-007-bounded-context-taxonomy.md` after the existing `## Invariant Tests` section. It does not rewrite the canonical seven-context list; it extends it.

```markdown
## Amendment 1 — Read-Shape, Workflow-Paired, Adapter, and Cross-cutting Contexts

### Status

Accepted

### Context

ADR-007 names seven write-side bounded contexts but the codebase carries 31 underscore-prefixed packages under `backend/app/services/`. The unnamed remainder falls into four coherent shapes: read-shape projections, workflow-paired companions, adapter contexts that translate external systems, and a small set of cross-cutting modules that supply policy primitives to every other context. Without an explicit secondary taxonomy, reviewers read the seven-context list as exhaustive and misclassify new packages.

### Decision

ADR-007's taxonomy is extended with three secondary categories (read-shape, workflow-paired, adapter) and one cross-cutting category. The seven-context list at ADR-007 §Decision remains the canonical write-side enumeration. Each package has a PRIMARY classification (exactly one of the five lists) and may additionally appear as the right-half of a workflow pair when paired with another context; the disjointness lock permits this many-to-one membership for workflow-pair right-halves. Each allowlist must be atomic — entries are written as a single contiguous list per TOML file and may not span across multiple lists.

1. **Read-shape contexts** project pre-existing rows. They inherit transaction rules from the underlying write-side context and may not commit. Read-shape contexts are not separate sweep units. Examples: `_register_listings` (dual-class — also write-side), `_monitoring_status`, `_dashboard_metrics`, `_quarterly_comparison`, `_reporting`, `_org_chart`. The single-file `backend/app/services/_monitoring_response.py` is the read-shape complement of `_monitoring_status` and is registered in the read-shape allowlist as a file (not a package).

2. **Workflow-paired contexts** sweep together as one rollback unit. A sweep that touches one half must also cover the other. The pairs are:
   - `_approval_queue` ↔ `_approval_execution`
   - `_issue_register` ↔ `_issue_workflow`
   - `_vendor_links` ↔ `_vendor_governance`
   - `_access_workflow` ↔ `_identity_access_lifecycle`
   - `_control_execution` ↔ `_entity_mutation_lifecycle`
   - `_deadline_execution` ↔ `_kri_history`
   - `_auth_session_workflow` ↔ `_auth_session`
   - `_risk_questionnaires` ↔ `_vendor_governance`
   - `_vendor_workflow` ↔ `_vendor_governance`
   - `_orphaned_items` ↔ `_identity_access_lifecycle`
   - `_notification_inbox` ↔ `_identity_access_lifecycle`

3. **Adapter contexts** are exempt from the per-context HTTPException ban only at the adapter boundary. Translation from external-system exceptions to RiskHub `DomainError` subclasses is the adapter's job per ADR-003. Adapters: `_directory_identity`, `_directory_sync`, `_graph_directory` (after the package move planned under finding 61), `_admin_telemetry`, `_activity_log_query`, `_auth_session`.

4. **Cross-cutting contexts** are policy modules reached by every other context. They own canonical primitives (capability builders, configuration defaults) and are subject to ADR-001 and ADR-008 SSOT discipline rather than the per-context atomicity sweeps. Cross-cutting contexts: `_authorization_capabilities`, `_config`.

### Classification Table

The full classification of the 31 underscore-prefixed packages plus the `_monitoring_response.py` file entry. Workflow-pair right-halves carry their PRIMARY classification (whichever of write-side, adapter applies); their workflow-pair membership is recorded separately in `_bounded_context_workflow_pairs.toml`.

| Package | Category | Rationale | Enforcement TOML |
|---|---|---|---|
| `_riskhub_config` | Write-side | ADR-007 §Decision context #1 | `_bounded_context_write_side.toml` |
| `_identity_access_lifecycle` | Write-side | ADR-007 §Decision context #2 | `_bounded_context_write_side.toml` |
| `_vendor_governance` | Write-side | ADR-007 §Decision context #3 | `_bounded_context_write_side.toml` |
| `_register_listings` | Write-side + Read-shape (dual; explicitly allowed) | ADR-007 + listing planner | `_bounded_context_write_side.toml` + `_bounded_context_read_shape.toml` |
| `_approval_execution` | Write-side | ADR-007 §Decision context #5 | `_bounded_context_write_side.toml` |
| `_entity_mutation_lifecycle` | Write-side | ADR-007 §Decision context #6 | `_bounded_context_write_side.toml` |
| `_kri_history` | Write-side | ADR-007 §Decision context #7 | `_bounded_context_write_side.toml` |
| `_monitoring_status` | Read-shape | Status projection (no commits) | `_bounded_context_read_shape.toml` |
| `_dashboard_metrics` | Read-shape | Dashboard metric projection | `_bounded_context_read_shape.toml` |
| `_quarterly_comparison` | Read-shape | Quarterly metric projection | `_bounded_context_read_shape.toml` |
| `_reporting` | Read-shape | Reporting export projection | `_bounded_context_read_shape.toml` |
| `_org_chart` | Read-shape | Org-chart traversal | `_bounded_context_read_shape.toml` |
| `_monitoring_response.py` | Read-shape (file entry) | File-level read-shape complement of `_monitoring_status` | `_bounded_context_read_shape.toml` |
| `_approval_queue` | Workflow-paired (`_approval_execution`) | Queue side of approval | `_bounded_context_workflow_pairs.toml` |
| `_issue_register` | Workflow-paired (`_issue_workflow`) | Register side | `_bounded_context_workflow_pairs.toml` |
| `_issue_workflow` | Workflow-paired (`_issue_register`) | Workflow side | `_bounded_context_workflow_pairs.toml` |
| `_vendor_links` | Workflow-paired (`_vendor_governance`) | Link mutators | `_bounded_context_workflow_pairs.toml` |
| `_access_workflow` | Workflow-paired (`_identity_access_lifecycle`) | Identity workflow | `_bounded_context_workflow_pairs.toml` |
| `_control_execution` | Workflow-paired (`_entity_mutation_lifecycle`) | Control execution | `_bounded_context_workflow_pairs.toml` |
| `_deadline_execution` | Workflow-paired (`_kri_history`) | Deadline jobs | `_bounded_context_workflow_pairs.toml` |
| `_auth_session_workflow` | Workflow-paired (`_auth_session`) | Session workflow | `_bounded_context_workflow_pairs.toml` |
| `_risk_questionnaires` | Workflow-paired (`_vendor_governance`) | Questionnaire lifecycle | `_bounded_context_workflow_pairs.toml` |
| `_vendor_workflow` | Workflow-paired (`_vendor_governance`) | Vendor workflow | `_bounded_context_workflow_pairs.toml` |
| `_orphaned_items` | Workflow-paired (`_identity_access_lifecycle`) | Orphan detection during deactivation | `_bounded_context_workflow_pairs.toml` |
| `_notification_inbox` | Workflow-paired (`_identity_access_lifecycle`) | Notification dispatch on identity events | `_bounded_context_workflow_pairs.toml` |
| `_directory_identity` | Adapter | External directory identity | `_bounded_context_adapters.toml` |
| `_directory_sync` | Adapter | Directory sync sweep | `_bounded_context_adapters.toml` |
| `_graph_directory` (post-#61) | Adapter | Microsoft Graph adapter | `_bounded_context_adapters.toml` |
| `_admin_telemetry` | Adapter | Admin telemetry projection | `_bounded_context_adapters.toml` |
| `_activity_log_query` | Adapter | Activity-log query adapter | `_bounded_context_adapters.toml` |
| `_auth_session` | Adapter | Session-token primitive | `_bounded_context_adapters.toml` |
| `_authorization_capabilities` | Cross-cutting | ADR-001 capability builder SSOT | `_bounded_context_cross_cutting.toml` |
| `_config` | Cross-cutting | ADR-008-style config defaults SSOT | `_bounded_context_cross_cutting.toml` |

Count summary: 7 write-side + 6 read-shape (incl. `_register_listings` dual + `_monitoring_response.py` file entry) + 11 workflow-pair-left-halves + 6 adapters + 2 cross-cutting = **32 entries across 31 packages and 1 file** (because `_register_listings` is dual-classed and `_monitoring_response.py` is a separate file entry). Workflow-pair right-halves are NOT counted separately in the primary tally — their PRIMARY classification appears under whichever of write-side or adapter they belong to, and their right-half membership is recorded in `_bounded_context_workflow_pairs.toml`.

### Alternatives Rejected

- Expand the seven-context list to all 31 packages: rejected because it loses sweep meaning and produces 31 separate atomicity tests for what are really seven transactions.
- Document elsewhere (`CONVENTIONS.md`, `AGENTS.md`): rejected because Loop 3 review showed reviewers read ADR-007 as exhaustive when classifying new packages.
- Merge workflow-paired contexts into a single context per pair: rejected because the splits reflect real read-vs-write boundaries (queue vs execution, register vs workflow, links vs governance).
- Three categories without `Cross-cutting`: rejected because `_authorization_capabilities` and `_config` would be force-fit into adapter or read-shape, neither of which captures their cross-cutting policy role; the lock would either fire on day 1 or accept silent miscategorization.
- Naming the fifth category `Core` instead of `Cross-cutting`: rejected because `Core` overloads "domain core" used elsewhere in DDD vocabulary; `Cross-cutting` precisely names the role (policy primitives reached by every other context).
- "EXACTLY ONE" disjointness without many-to-one for workflow-pair right-halves: rejected because it would force right-halves out of their primary write-side or adapter allowlist, breaking sweep semantics. The Phase 4 disjointness lock semantics (PRIMARY classification + workflow-pair right-half exception) is the corrected formulation.

### Migration Impact

Five new TOMLs added under `tests/backend/pytest/architecture/`: `_bounded_context_write_side.toml`, `_bounded_context_read_shape.toml`, `_bounded_context_workflow_pairs.toml`, `_bounded_context_adapters.toml`, `_bounded_context_cross_cutting.toml`. Existing per-context boundary tests (`test_w4_bc_a_riskhub_config_boundaries_red.py` through `test_w4_bc_g_kri_history_boundaries_red.py`) continue to operate on the seven canonical write-side contexts. Adapter contexts and cross-cutting contexts gain new exception-ban exemption holders; existing adapters did not raise HTTPException at adapter boundaries because they were not previously in scope of the per-context ban. `_graph_directory` is created by finding #61 (the four `graph_directory_*.py` modules move into the package) and recorded in the adapter TOML at the same commit as the package move.

### Rollback Strategy

Documentation amendment plus five new TOMLs and one extended disjointness lock. Rollback consists of removing the TOMLs and the disjointness extension; the seven-context core remains operational without the amendment.

### Invariant Tests

- New or extended `tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py` validates that every underscore-prefixed package under `backend/app/services/` (excluding `__pycache__`) has a PRIMARY classification in exactly one allowlist, with the documented exception of `_register_listings` which is dual-classed (write-side AND read-shape) for sweep-order reasons. Workflow-pair right-halves additionally appear in the workflow-pair allowlist; the lock permits this many-to-one membership only for documented pairs. New packages must be classified at introduction; the lock fails on unclassified packages.
- `_bounded_context_write_side.toml` enumerates the seven canonical contexts.
- `_bounded_context_read_shape.toml` enumerates read-shape secondaries plus the `_monitoring_response.py` file entry.
- `_bounded_context_workflow_pairs.toml` enumerates ordered pairs (`(left, right)`); the lock asserts a sweep that touches one half also covers the other, and that each pair's right-half is also recorded under its PRIMARY allowlist.
- `_bounded_context_adapters.toml` enumerates adapter packages; the lock allows HTTPException translation only at the adapter boundary and asserts ADR-003 `DomainError` projection inside.
- `_bounded_context_cross_cutting.toml` enumerates cross-cutting packages and binds them to ADR-001 (capabilities) and ADR-008 (config-default SSOT) lock chains.
- Per-allowlist atomicity asserted: each TOML file is parsed as a single contiguous list; entries spanning multiple files trigger lock failure.
- Cross-reference: ADR-003 `DomainError` taxonomy governs adapter exception translation; ADR-001 governs `_authorization_capabilities` SSOT; ADR-008 governs `_config` SSOT pattern.
```

---

End of Section 6.

---

## Section 7 — Registers and Supporting References

Working dir: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Anchor commit: `1ee872a4`.
Mode: PRODUCTION-WRITE. FINAL plan output (Phase 5 + Phase 6 corrections applied).
This section is the dev's reference book — all registers (READMEs/locks, risks,
rollback, gates, CI, validator, effort, open questions) consolidated as the single
source of truth for "what does item #N change beyond code, when does it land, what
breaks if it goes wrong, and what runs on every commit?".

Sources: Phase 3 Loop 3 + Phase 4 Loop 1/2 corrections + Phase 6 corrections
(Vocabulary line cite `:43-54` not `:119`/`:131`; the 3 README paths
previously flagged as fabricated — `backend/app/api/README.md`,
`tests/backend/pytest/api/v1/README.md`, `frontend/src/contexts/README.md` —
were re-verified at commit `1ee872a4` and DO exist; original cross-references
restored; #59 single README clarification; `make test-postgres-ci` not
`make postgres-up`).

---

### Section 7 Overview — Registers and Supporting References

### 7.1 README & Lock Change Register

The dedicated register listing every README, doc, lock test, TOML, and
contract artifact touched by the plan, grouped by item. This is the single
source of truth for "what does item #N change beyond code?".

Per `plan-loop-3-05-readme-lock-register.md:8-19`, the constraints honored:
single sequential developer; TDD red→green; doc/lock-only Reject is
INVALID (orchestrator override); Defers planned (not skipped); READMEs
and locks are **outputs**, not constraints — every code change ratchets
its README + lock into the same commit.

#### Top-level totals (Phase 6 corrected)

- **Docs touched**: 58 (per `plan-loop-3-05-readme-lock-register.md:2402-2602`).
- **Locks touched**: 24 (10 lock-test files + 14 TOML registries — per `plan-loop-3-05-readme-lock-register.md:2602-2735`).
- **New files to create**: 98+ (per `plan-loop-3-05-readme-lock-register.md:2759-2818` + 2 v2 items #76/#77).
- **Files to delete**: 48 (32 backend + 16 frontend, per `plan-loop-3-05-readme-lock-register.md:2884-2886`).

#### Phase 6 corrections applied

1. **§Vocabulary line cites**: Items #34 ("privilege tier") and #60
   ("privilege context") add §Vocabulary entries to
   `docs/security/authorization-capability-contract.md`. The Vocabulary
   section is at **lines 43-54** (verified at the file). Loop 3 register
   at `:936` cited `:119` for #34 (which is the AUTHZ-APPROVALS matrix
   row, NOT the Vocabulary block), and at `:1770` cited `:131` for #60
   (AUTHZ-AUTH-SESSION row). **Phase 6 correction**: when the items
   APPEND to §Vocabulary (the table at `:43-54`), cite `:43-54`. When
   they EDIT a matrix row body that mentions a Vocabulary term, cite
   the row line (`:119` for AUTHZ-APPROVALS body, `:131` for
   AUTHZ-AUTH-SESSION body). Both items do BOTH (add Vocabulary entry +
   edit matrix row); citations must reflect the dual surface.

2. **Three READMEs previously flagged as "fabricated" are RESTORED as existing**: 
   Loop 2 re-verification at commit `1ee872a4` confirmed all three paths
   exist on disk and are correctly cited in Loop 3 register entries. The
   original cross-references stand:

   - `backend/app/api/README.md` (referenced for #60 at L:1748) — **EXISTS**
     at commit `1ee872a4`; original cross-reference restored.
   - `tests/backend/pytest/api/v1/README.md` (referenced for #10 at
     L:2561) — **EXISTS** at commit `1ee872a4`; original cross-reference
     restored.
   - `frontend/src/contexts/README.md` (referenced for #66 at L:2525) —
     **EXISTS** at commit `1ee872a4`; original cross-reference restored.
     (The earlier Phase 6 redirect to `frontend/src/contexts/auth/README.md`
     is REVERSED — the parent contexts README is the canonical anchor.)

3. **#59 cannot create `_monitoring_response/README.md` as separate file**:
   per Phase 6 audit of `plan-loop-3-05-readme-lock-register.md:2497-2498`,
   #59 is documented as creating
   `backend/app/services/_monitoring_response/README.md` (NEW). On
   anchor commit `1ee872a4`, the package `_monitoring_response/` does
   exist but holds NO README. Phase 6 correction: #59's README is a
   **single file create** atomic with the package consolidation; not a
   batch of files. If `_monitoring_response/__init__.py` already
   contains the docstring header, the README is the only NEW doc.

4. **`make postgres-up` does NOT exist**: per Phase 6 verification of
   `scripts/Makefile:6`, the available targets are `test`, `test-fast`,
   `test-db-contracts`, `test-postgres-ci`, `test-architecture-locks`
   — there is **no `postgres-up` target**. Item #69+#70's gate command
   is:

   ```bash
   TEST_DATABASE_URL=postgresql+asyncpg://… make -f scripts/Makefile test-postgres-ci
   ```

   per `scripts/Makefile:121-125`. The previous Loop 3 reference to
   `make postgres-up` was a fabrication.

#### 7.1.1 Per-item READMEs/locks/files (79 items)

[Each entry: READMEs touched · locks touched · files created · files deleted ·
capability contract artifacts. 79 items total = 77 from Loop 3 register
+ #76 + #77a/b from v2 integration. Source: `plan-loop-3-05-readme-lock-register.md:31-2391`
+ `plan-loop-3-07-integration-v2.md:159-291`. Only Phase 6-confirmed
locations cited. Compact format — full entries at source register.]

| # | Audit-tag | READMEs | Locks/TOMLs | Files create | Files delete | Cap-contract |
|---:|---|---|---|---|---|---|
| 1 | A-N1 | `02-backend-endpoints.md` | `test_architecture_deepening_contracts.py` (NEW assertion) | `test_risks_crud_public_surface_red.py` | (none) | (none) |
| 2 | B-N1 | `_issue_workflow/README.md` | deepening contract NEW assertion | `test_issue_workflow_no_underscored_self_aliases_red.py` | (none) | (none) |
| 3 | S3.11 | `kri-form/README.md` | `test_w4_bc_g_kri_history_boundaries_red.py` (append) | `EntityFormWorkflow.test.ts` ext | `kri-form/kriFormWorkflow.ts` | (none) |
| 4 | FE-deadcode-1 | `control-form/README.md` (strike-line) | `_naming_allowlist.toml` (scrub if listed) | `controlFormWorkflow.deleted.test.ts` | `control-form/controlFormWorkflow.ts` | (none) |
| 5 | FE-deadcode-2 | `governance/README.md` (strike-line) | `_naming_allowlist.toml` (scrub if listed) | `orphanResolutionPresentation.deleted.test.ts` | `governance/orphanResolutionPresentation.ts` | (none) |
| 6 | FE-deadcode-3 | `notifications/README.md` (strike-line) | `_naming_allowlist.toml` (scrub if listed) | `resourcePath.deleted.test.ts` | `notifications/resourcePath.ts` | (none) |
| 7 | C-N1 | (none) | deepening contract NEW assertion | (none) | endpoint shim `_get_approval_department_id` | (none) |
| 8 | B-N2 | `_issue_workflow/README.md` (add-line) | deepening contract `:1192-1206` (`:1193` import shrink) + NEW assertion | (none) | `_issue_workflow/source_validation.py` (recommended) | `authorization-capability-contract.md:128` add-token; `.json:368` parallel |
| 9 | S6.5 | (none) | deepening contract NEW assertion | (none) | duplicate `can_user_view_approval_resource` | (none) |
| 10 | S8.5 | `riskhub_questionnaires/README.md` (verify); `endpoints/README.md`; AGENTS.md (verify) | (none — KEEP item) | `test_riskhub_questionnaires_module_present_red.py` | (none) | (none) |
| 11 | S2.7 | `01-backend-services.md` (add-line); `06-test-surface.md` (add-cross-ref) | deepening contract `:178` unchanged | (none — fix-in-place) | (none) | (none) |
| 12 | D-N3 | (none) | (none) | `test_users_summary_blanket_except_red.py` + opt narrow-excepts test | (none) | (none) |
| 13 | S5.1/C-N2 | `_vendor_links/README.md` (verify) | (none) | `test_vendor_link_helpers_shim_removed_red.py` | `vendor_link_helpers.py` | `.md:121-122` remove-token; `.json:55,479,502` parallel; **validator** |
| 14 | S4.4 | `issues/_shared/README.md` (verify); `_issue_workflow/README.md` (verify) | deepening contract NEW assertion | (extends existing tests) | (none) | (none) |
| 15 | D-N2 | (none) | (none) | `test_capability_catalog_access_user_surface_red.py` | (none) | `.md:132` add-row; `.json:113,229` add-key; `capability-catalog.json` add 8th surface; **validator** |
| 16 | S8.10 | `reports/contract-drift-remediation-2026-02-21.md`; `deep-scan-remediation-2026-02-20.md` | deepening contract NEW assertion | `test_reports_legacy_excel_tombstones_removed_red.py` | `endpoints/reports/legacy_excel.py` | (none) |
| 17 | S2.1 | `_monitoring_status/README.md` (verify) | deepening contract NEW assertion | `test_monitoring_response_endpoint_shim_removed_red.py` | `endpoints/_monitoring_response.py` | (none) |
| 18 | S6.2 | (none) | deepening contract `:1029` unchanged + NEW assertion; `_endpoint_commit_allowlist.toml` verify-no-change | (none) | endpoint `_build_approval_read` | (none) |
| 19 | S1.4 | `01-backend-services.md` (add-line); `02-backend-endpoints.md` (replace-line); `06-test-surface.md` (add-cross-ref) | (none — service consolidation) | `test_validate_risk_type_single_owner_red.py` + `test_risks_validation_parity.py` | `risks/crud/_shared.py` (if empty) | (none) |
| 20 | S1.6 | `02-backend-endpoints.md` (record-decision); `docs/agent/ENDPOINT_INVARIANTS.md` date-bump `:21-22` | (none — DOC-ONLY) | `test_risks_required_reexports_red.py` | (none) | (none) |
| 21 | S2.6 | (none) | deepening contract NEW assertion | `test_control_risk_link_loader_collapsed_red.py` | (none) | (none) |
| 22 | S2.8 | `control-form/README.md` (declare-canonical); `03-frontend-architecture.md` (remove-shim) | `_naming_allowlist.toml` (scrub) | `ControlForm.shim.deleted.test.ts` | `components/ControlForm.tsx` | (none) |
| 23 | S2.9 | `control-form/README.md` (note-inlined) | (none) | `controlFormUtils.inline.test.ts` | `control-form/controlFormUtils.ts` | (none) |
| 24 | S3.4 | (atomic with #51) | deepening contract `:976,979,980,997-1002` (#50+#51 cluster); `test_w4_bc_g_kri_history_boundaries_red.py` (append) | (extends existing tests) | `endpoints/kris/linked_vendors.py` | `.md:116-118` remove-token; `.json:106,111,113,229,388,389,410,411` parallel; **validator** |
| 25 | S3.7 | (none) | deepening contract NEW assertion; `test_w4_bc_g_kri_history_boundaries_red.py` (append) | `test_kris_department_scope_helper_red.py` | (none) | (none) |
| 26 | S3.9 | `kri-form/README.md` (remove-prose) | `test_w4_bc_g_kri_history_boundaries_red.py` (append); ESLint pin | FE mirror test for `KRIForm.tsx` deletion | `components/KRIForm.tsx` | (none) |
| 27 | S4.2 | `issues/_shared/README.md` (remove-line) | deepening contract NEW assertion | (extends existing tests) | `issues/_shared/loading.py` | (none) |
| 28 | S4.3 | `issues/_shared/README.md` (remove-line); `_issue_register/README.md` (add-line) | deepening contract NEW assertion | (extends existing tests) | `issues/_shared/links.py` | `.md:128` retoken; `.json` parallel |
| 29 | S4.6 | `_issue_register/README.md` (append-line) | deepening contract NEW assertion | `test_issue_source_type_value.py` | (none) | (none) |
| 30 | S4.10 | `issues/_shared/README.md` (refresh-list) | deepening contract NEW assertion | (extends existing tests) | (none) | (none) |
| 31 | S5.5 | `_vendor_governance/README.md` (add-line) | deepening contract NEW assertion | `test_vendor_governance_reports_red.py` + `test_vendor_reports_endpoint_no_row_builders_red.py` | (none) | (none) |
| 32 | S5.8 | `vendors/README.md` (describe-shell) | (none) | `useVendorLinkedEntityTab.contract.test.tsx` + `VendorLinkedEntityTab.duplication.test.ts` + 2 NEW prod files | (none) | (none) |
| 33 | S6.4 | `forms/README.md` (note-canonical); `kri-form/README.md` (verify) | (none) | `KRIFormContainer.approval-banner.test.tsx` + `no-kri-banner-duplicate.test.ts` | `kri-form/KriApprovalQueuedBanner.tsx` | (none) |
| 34 | S6.6 | `_authorization_capabilities/README.md` (verify); `_approval_execution/README.md` (optional cross-ref); AGENTS.md `:80-83` verify | deepening contract NEW assertion (16-file string-search lock) | `test_approval_privilege_tier.py` | (none) | `.md:43-54` (Vocabulary "privilege tier", **Phase 6 cite**) + `:119` (AUTHZ-APPROVALS body); `.json:629` parallel; **validator** |
| 35 | S7.3 | `frontend/src/hooks/README.md` (remove-entry); `03-frontend-architecture.md` (note-removal) | `_naming_allowlist.toml` drop `usePermissions` if listed; `useAuthz.invariant.test.ts` verify | `usePermissions.deleted.test.ts` + `Sidebar.usePermissions.replaced.test.tsx` | `hooks/usePermissions.ts` | **FE local-gate registry** entry remove |
| 36 | S7.4 | `frontend/src/authz/README.md` (describe-factory) | (none — `useAuthz.invariant.test.ts:46-48` unrelated) | `BusinessRouteGuards.factory.test.tsx` | (none) | (none) |
| 37 | S7.10 | (none) | deepening contract NEW assertion (`endpoints/users/summary.py` 3-way) | `test_summary_can_view_governance.py` | (none) | (none) |
| 38 | S8.6 | AGENTS.md (verify); `endpoints/ENDPOINT_INVARIANTS.md` KEEP | deepening contract NEW assertion | `test_endpoint_inline_pydantic_evicted_red.py` + 2 NEW schema files | (none) | (none) |
| 39 | S8.7 | (none) | `_capabilities_all_allowlist.toml` add-entry potential (order strict) | `test_capabilities_builder.py` + 1 NEW prod (`_authorization_capabilities/admin.py`) | `endpoints/admin/capabilities.py` | `.md:132` rewrite-row; `.json` parallel; **validator (parity-bearing)** |
| 40 | S8.11 | `endpoints/admin/README.md` (rewrite); AGENTS.md `:80-83` verify; `endpoints/README.md` (add-subsection) | `_endpoint_commit_allowlist.toml` verify-no-change; `02-backend-endpoints.md` refresh-table | `test_w12_admin_subrouter_clustering_red.py` + `test_admin_route_table_snapshot_red.py` + 3 NEW endpoints | 7 admin files (console/directory_sync/structured_logs/orphans/snapshots/log_config + capabilities) | (none) |
| 41 | B-N3 | `_issue_workflow/README.md` (verify) | deepening contract NEW assertion | (extends existing tests) | (none) | (none) |
| 42 | BE-N2 | (none) | deepening contract NEW assertion | `test_outbox_actor_payload_base_red.py` + 1 ext (`outbox/payloads.py`) | (none) | (none) |
| 43 | BE-N4 | (none) | `_audit_matrix.toml` additive (no row change) | `test_audit_adapter_emitter_helper_red.py` + 1 NEW (`audit/_emit.py`) | (none) | (none) |
| 44 | BE-N6 | `endpoints/README.md` (add-subsection); AGENTS.md verify | `_router_registry.toml` (NEW) | `test_router_prefix_registry_red.py` + 1 NEW TOML | (none) | (none) |
| 45a | BE-N8a | (none) | (test additions; no lock change) | 3 characterization tests (`test_ownership_resolver_*`) | (none) | (none) |
| 45b | BE-N8b | `_permissions/README.md` (verify-line); AGENTS.md `:84-87` verify | deepening contract NEW assertion | `test_ownership_resolver_factory_equivalence_red.py` + 1 NEW (`_ownership_factory.py`) | (none) | (none) |
| 46 | FE-N1 | `frontend/src/lib/README.md` (add-index) | `_naming_allowlist.toml` (FE candidate) | `queryKeys.invariant.test.ts` + ~10 NEW domain modules | (none) | (none) |
| 47 | FE-N4 | `frontend/src/services/api/README.md` (note-policy) | (none) | `sessionRefreshPolicy.test.ts` + 1 NEW prod | (none) | (none) |
| 48 | FE-N6 | `frontend/src/i18n/README.md` (note-merge) | `_naming_allowlist.toml` (drop) | `errorKeys.merged.test.ts` + 1 NEW (`errorKeys.ts`) | `i18n/getErrorMessageKey.ts` + `i18n/errorCodeMap.ts` | (none) |
| 49 | S2.2 | `_monitoring_response/README.md` (NEW reference per #59) | deepening contract `:188,192` DROP | `test_control_execution_monitoring_inlined_red.py` | `_control_execution/monitoring.py` | (none) |
| 50 | S3.2 | `_kri_history/README.md` (remove-line) | deepening contract `:997-1002` (cluster); `test_w4_bc_g_kri_history_boundaries_red.py` (append) | (extends tests) | `_kri_history/submission.py` | `.md:117-118,161` remove-token; `.json` parallel; **validator** |
| 51 | S3.3 | `_kri_history/README.md` (remove-line) | deepening contract `:976,979,980,997-1002` (atomic w/ #24+#50); W4-bc-g (append) | (extends tests) | `_kri_history/value_application.py` | `.md:117-118,161` remove-token; `.json` parallel; **validator** |
| 52 | S3.5 | `_kri_history/README.md` (verify-line) | deepening contract `:956,962` drop tuple+hasattr; W4-bc-g (append); `test_w11b_test_infra_polish_red.py` reference | (extends tests) | `_kri_history/correction_plans.py` | (none) |
| 53 | S4.1 | `_issue_workflow/README.md` (refresh-list) | deepening contract `:1192-1206` (further shrink) + `:1237` unchanged | (extends tests) | `issue_workflow_service.py` + `_issue_workflow/service.py` | (none) |
| 54 | S6.3 | `_approval_queue/README.md` (drop reference) | deepening contract `:1005,1025,1041` REWRITE | (extends tests) | `_approval_queue/lifecycle.py` | (none) |
| 55 | S7.5 | `services/README.md` (remove-row) | deepening contract `:243-272` (`:246-257`) DELETE/REWRITE; `test_authz_capability_contract_validator.py:502` fixture remove | `test_access_user_service_removed_red.py` | `access_user_service.py` | `.md:109` remove-token; `.json` parallel; **validator** |
| 56 | S7.6 | `services/README.md` (remove-row) | deepening contract `:227-238` DELETE/REWRITE; `test_authz_capability_contract_validator.py:500` fixture remove | `test_directory_identity_service_removed_red.py` | `directory_identity_service.py` | `.md:109` remove-token; `.json` parallel; **validator** (atomic w/ #61) |
| 57 | S8.1 | `_quarterly_comparison/README.md:16` (orchestrator override REWRITE-section); `.planning/codebase/CONVENTIONS.md:22`; `CONCERNS.md:14`; `STRUCTURE.md`/`ARCHITECTURE.md` (verify); AGENTS.md (implicit) | deepening contract `:559-569` REWRITE | `test_quarterly_comparison_facade_removed_red.py` | `quarterly_comparison_service.py` | (none) |
| 58 | S8.3 | (none) | deepening contract NEW assertion | `test_orphaned_item_facade_removed_red.py` | `orphaned_item_service.py` + `_orphaned_items/service.py` | (none) |
| 59 | S2.10 | `_monitoring_response/README.md` (NEW — Phase 6: single file create); `_monitoring_status/README.md` (sharpen-line) | deepening contract NEW assertion | `test_monitoring_packages_separated_red.py` | (none) | (none) |
| 60 | PrivilegeContext | `_authorization_capabilities/README.md` (verify); AGENTS.md `:88-90` verify; `backend/app/api/README.md` Phase 6 NOTE: not present today | deepening contract NEW assertion (`get_privilege_context` hasattr) | `test_privilege_context.py` | (none) | `.md:43-54` (Vocabulary "privilege context", **Phase 6 cite**) + `:131` (AUTHZ-AUTH-SESSION body); `.json:629,692` parallel; **validator** |
| 61 | S7.7 | `services/README.md:23` (rewrite-row); `_graph_directory/README.md` (NEW) | `test_authz_capability_contract_validator.py:504` path rewrite | `test_graph_directory_package_move_red.py` + 5 NEW package files | 4 top-level `graph_directory_*.py` files | `.md:109` path-rewrite; `.json` parallel; **validator** (atomic w/ #56) |
| 62 | S5.9 | `_vendor_links/README.md` (extend); `STRUCTURE.md` (verify path) | deepening contract `test_w4_bc_c_vendor_governance_boundaries_red.py:16` rename-line; `_audit_matrix.toml` verify rows | `test_kri_vendor_assignment_audit_red.py` + 1 NEW (`_vendor_links/kri_assignment.py`) | `services/kri_vendor_assignment.py` (relocated) | `.md:172` perimeter-pass note; **validator** |
| 63 | BE-N7 | `outbox/README.md` (append-note) | (none — additive instrumentation) | `test_outbox_dispatch_scheduler_job_run_red.py` | (none) | (none) |
| 64 | FE-N2 | `frontend/src/services/api/README.md` (note-singleton) | (none) | `queryClient.defaults.test.ts` + 1 NEW (`queryClient.ts`) | (none) | (none) |
| 65 | FE-N3 | `frontend/src/services/api/schemas/README.md` (describe-base) | `_capabilities_all_allowlist.toml` verify-only | `crudCapabilitySchema.snapshot.test.ts` + 1 NEW (`crudCapabilitySchema.ts`) | (none) | `capability-catalog.json` pin-counts; **validator (parity-bearing — DOMINANT failure)** |
| 66 | FE-N5 | `frontend/src/contexts/auth/README.md` (rewrite-line, Phase 6: parent README is the verified one); AGENTS.md `:88-90` verify | `_naming_allowlist.toml` (FE candidate) | `SessionProvider.split.test.tsx` + `AuthActions.split.test.tsx` + `AuthActions.callbackStability.test.tsx` + 3 NEW context files | (none) | `.md:131` path-rewrite; **validator (FE local-gate)** |
| 67 | FE-N7 | `frontend/src/hooks/README.md` (describe-hook) | (none) | `useResourcePanelQuery.contract.test.tsx` + 1 NEW prod | (none) | (none) |
| 68 | FE-N8 | `frontend/src/components/dashboard/README.md` (rewrite-contents) | (none) | `WidgetShell.contract.test.tsx` + `DashboardFilterContext.scopedSelector.test.tsx` + 1 NEW (`WidgetShell.tsx`) | (none) | (none) |
| 69 | S5.2 | `_vendor_links/README.md` (rewrite); `models/README.md` (add-line); ADR-005 (append); ADR-010 (append-revision) | `_archive_allowlist.toml` verify; `_vendor_governance_service_commit_allowlist.toml` verify | `test_vendor_link_mixin_red.py` + `test_vendor_link_cascade_postgres_red.py` (postgres) + 1 NEW (`_vendor_link_mixin.py`) | (none) | (none — bundle low validator concern) |
| 70 | S5.7 | `models/README.md` (verify); `docs/README.md`; `DOCUMENTATION_TREE.md`; `BUSINESS_LOGIC.md:619` remove-line; ADR-005 rewrite-section; ADR-010 append-revision | `_archive_allowlist.toml` review/no-op; `_vendor_governance_service_commit_allowlist.toml` verify | `test_vendor_status_drop_red.py` + `test_vendor_status_column_dropped_postgres_red.py` (postgres) + 1 alembic migration | (none) | (none — bundle low validator concern) |
| 71 | S7.8 | `frontend/src/services/session/README.md` (rewrite-section); `frontend/src/contexts/auth/README.md` (update-paths); `.planning/codebase/CONCERNS.md:40` verify | `_naming_allowlist.toml` (FE candidate) | `sessionStorage.merged.test.ts` + `coordinator.merged.test.ts` + `coordinator.singleFlight.test.ts` + 2 NEW prod | 5 session files (`bootstrap.ts`, `manager.ts`, `sso.ts`, `refreshHint.ts`, `logoutSuppression.ts`) | `.md:131` path-rewrite |
| 72 | S7.9 | AGENTS.md `:92` add-line; `docs/README.md`; `DOCUMENTATION_TREE.md`; CLAUDE.md (consider cross-link); `docs/adr/README.md` add-row | `_endpoint_commit_allowlist.toml` reference-only | `test_adr_011_present_red.py` + 1 NEW ADR file | (none) | (none) |
| 73 | ADR-012 | `_kri_history/README.md` (append-line); `DOCUMENTATION_TREE.md` add-anchor; `docs/adr/README.md` add-row; `_reserved_modules.toml` reference | `_kri_state_vocabulary_allowlist.toml` (NEW) | `test_kri_period_algebra_ssot_red.py` + `test_kri_deadline_classify_red.py` + 1 NEW ADR + 1 NEW TOML | (none) | (none) |
| 74a | ADR-007(a) | `STRUCTURE.md` (verify); `ADR-007` (verify) | 4-5 NEW bounded-context TOMLs (`_bounded_context_{write_side,read_shape,workflow_pairs,adapters,policy}.toml`) | `test_bounded_context_classification_complete_red.py` + opt `test_w7_bounded_context_disjointness.py` + 4-5 NEW TOMLs | (none) | (none) |
| 74b | ADR-007(b) | AGENTS.md `:94-95` add-line; `DOCUMENTATION_TREE.md` verify; `docs/adr/README.md` add-line; `docs/adr/ADR-007` (append-amendment); CONTEXT.md cross-ref | (none) | `test_adr_007_amendment_present_red.py` | (none) | (none) |
| 75 | Bonus | `_approval_execution/README.md` (optional cross-reference) | deepening contract NEW assertion | (extends tests for `_auto_reject_kri_approval`) | duplicate `_auto_reject_kri_approval` | (none) |
| 76 | NEW (Phase 4 v2) | (auth-flow READMEs cross-cut) | `_endpoint_commit_allowlist.toml` (8 auth/* `expires_at` rows MIGRATE before 2026-09-01) | `test_auth_flow_db_commit_migrated_red.py` (calendar-tracked) | (none) | (none) |
| 77a | NEW (Phase 4 v2) | `frontend/src/services/api/schemas/` (verify) | (none) | `vendor.status.optional.test.ts` (FE-soft) | (none) | (none — pre #70) |
| 77b | NEW (Phase 4 v2) | `frontend/src/services/api/schemas/` (rewrite) | (none) | `vendor.status.removed.test.ts` (FE-cleanup) | (FE TS schema field `vendor.status`) | (none — post #70) |

**Per-item coverage**: 79 items × (≥1 README, ≥1 lock, ≥1 NEW or DELETED file
when applicable) — 100% coverage. The cells `(none)` reflect items where
the surface is genuinely empty (e.g., #20 DOC-ONLY with stable re-export).

#### 7.1.2 Doc × items inverse index (most-touched docs)

[Source: `plan-loop-3-05-readme-lock-register.md:2402-2602` aggregated.
Top docs ranked by item count, with Phase 6 corrections applied.]

| Doc path | Item count | Items |
|---|---:|---|
| `tests/backend/pytest/test_architecture_deepening_contracts.py` | 15+ items at distinct line ranges | #2, #7, #8, #9, #11 (`:178`), #14, #18 (`:1029`), #27, #28, #29, #30, #34, #41, #49 (`:188,192`), #50+#51 (`:997-1002`), #51 (`:976,979,980`), #52 (`:956,962`), #53 (`:1192-1206,:1237`), #54 (`:1005,1025,1041`), #55 (`:243-272`), #56 (`:227-238`), #57 (`:559-569`), #60, #75 |
| `docs/security/authorization-capability-contract.md` | 17 items touch; 11 actively edit; 6 verify | #8 (`:128` add-token), #13 (`:121-122` remove-token), #15 (`:132` add-row), #24 (`:116-118` remove-token), #28 (`:128` retoken), **#34 (`:43-54` Vocabulary "privilege tier" + `:119` AUTHZ-APPROVALS body — Phase 6 dual cite)**, #37 (note SoT), #39 (`:132` rewrite-row), #50 (`:117-118,161` remove-token), #51 (`:117-118,161` remove-token), #55 (`:109` remove-token), #56 (`:109` remove-token), **#60 (`:43-54` Vocabulary "privilege context" + `:131` AUTHZ-AUTH-SESSION body — Phase 6 dual cite)**, #61 (`:109` path-rewrite), #62 (`:172`), #66 (`:131`), #71 (`:131`) |
| `docs/security/authorization-capability-contract.json` | 17 items (parallel to .md) | Same 17 items at lines 55, 106, 111, 113, 229, 368, 388, 389, 410, 411, 479, 502, 629, 692, 719 |
| `AGENTS.md` | 9 items reference; 2 add lines | #10 (`:75-79` verify), #38 (verify), #40 (`:80-83` verify), #44 (verify), #45b (`:84-87` verify), #57 (implicit), #66 (`:88-90` verify), #72 (`:92` add-line), #74b (`:94-95` add-line) |
| `docs/DOCUMENTATION_TREE.md` | 4 | #70 (verify `:255-256`), #72 (add-anchor `:258-260`), #73 (add-anchor `:260-261`), #74b (verify `:262-263`) |
| `backend/app/api/v1/endpoints/issues/_shared/README.md` | 4 | #14 (verify), #27 (remove-line), #28 (remove-line), #30 (refresh-list) |
| `backend/app/services/_kri_history/README.md` | 4 | #50 (remove-line), #51 (remove-line), #52 (verify-line), #73 (append-line) |
| `backend/app/services/_issue_workflow/README.md` | 5 | #2 (verify), #8 (add-line), #14 (verify), #41 (verify), #53 (refresh-list) |
| `docs/adr/README.md` | 3 | #72 (add-row), #73 (add-row), #74b (add-line) |
| `backend/app/services/_vendor_links/README.md` | 3 | #13 (verify), #62 (extend), #69 (rewrite) |
| `frontend/src/components/control-form/README.md` | 3 | #4 (strike-line), #22 (declare-canonical), #23 (note-inlined) |

**Secondary doc-touch surface (counts < 4)** — per
`plan-loop-3-05-readme-lock-register.md:2473-2600`:

- `backend/app/services/README.md` — 3 (#55 remove-row, #56 remove-row, #61 rewrite-row).
- `backend/app/services/_issue_register/README.md` — 2 (#28 add-line, #29 append-line).
- `backend/app/services/_authorization_capabilities/README.md` — 2 (#34 verify, #60 verify).
- `backend/app/models/README.md` — 2 (#69 add-line, #70 verify).
- `backend/app/api/v1/endpoints/README.md` — 2 (#10, #44).
- `frontend/src/contexts/auth/README.md` — 2 (#66 rewrite-line, #71 update-paths). **Phase 6: this is the verified parent README, not `frontend/src/contexts/README.md`.**
- `frontend/src/services/api/README.md` — 2 (#47, #64).
- `frontend/src/hooks/README.md` — 2 (#35, #67).
- `.planning/codebase/CONVENTIONS.md` — 2 (#57 `:22`, #66 `:43`).
- `.planning/codebase/CONCERNS.md` — 3 (#57 `:14`, #66 verify `:9`, #71 verify `:40`).
- `.planning/codebase/STRUCTURE.md` — 3 (#57, #62, #74a).
- `.planning/audits/_context/01-backend-services.md` — 2 (#11, #19).
- `.planning/audits/_context/02-backend-endpoints.md` — 4 (#1, #19, #20, #40).
- `.planning/audits/_context/03-frontend-architecture.md` — 3 (#22, #35, #66).
- `.planning/audits/_context/06-test-surface.md` — 2 (#11, #20).
- `docs/agent/ENDPOINT_INVARIANTS.md` — 3 (#10 KEEP, #20 date-bump `:21-22`, #38 KEEP).
- `docs/security/capability-catalog.json` — 3 (#15 add-surface, #39 pin-truth-table, #65 pin-counts).
- `docs/adr/ADR-005-archivable-mixin-schema-contract.md` — 2 (#69 append, #70 rewrite-section).
- `docs/adr/ADR-010-postgres-migration-rehearsal-contract.md` — 2 (#69 append-revision, #70 append-revision).
- `docs/adr/ADR-007-bounded-context-taxonomy.md` — 2 (#74a verify, #74b append-amendment).
- `docs/README.md` — 2 (#70 remove-line, #72 add-line).
- `docs/BUSINESS_LOGIC.md` — 1 (#70 `:619` remove).
- `frontend/src/lib/README.md` — 1 (#46 add-index).
- `frontend/src/services/api/schemas/README.md` — 1 (#65 describe-base).
- `frontend/src/i18n/README.md` — 1 (#48 note-merge).
- `frontend/src/authz/README.md` — 1 (#36 describe-factory).
- `frontend/src/services/session/README.md` — 1 (#71 rewrite-section).
- `frontend/src/components/dashboard/README.md` — 1 (#68 rewrite-contents).
- `frontend/src/components/governance/README.md` — 1 (#5 strike-line).
- `frontend/src/components/notifications/README.md` — 1 (#6 strike-line).
- `frontend/src/components/kri-form/README.md` — 2 (#26 remove-prose, #33 verify).
- `frontend/src/components/forms/README.md` — 1 (#33 note-canonical).
- `frontend/src/components/vendors/README.md` — 1 (#32 describe-shell).
- `backend/app/services/_quarterly_comparison/README.md` — 1 (#57 rewrite-section, `:16`).
- `backend/app/services/_approval_execution/README.md` — 2 (#34, #75 — optional cross-reference).
- `backend/app/services/_approval_queue/README.md` — 1 (#54 drop reference).
- `backend/app/services/_vendor_governance/README.md` — 1 (#31 add-line).
- `backend/app/services/outbox/README.md` — 1 (#63 append-note).
- `backend/app/services/_monitoring_response/README.md` — 1 (#59 NEW — Phase 6: single-file create).
- `backend/app/services/_monitoring_status/README.md` — 1 (#59 sharpen-line).
- `backend/app/services/_graph_directory/README.md` — 1 (#61 NEW; created).
- `backend/app/api/v1/endpoints/admin/README.md` — 1 (#40 rewrite-contents §:9-19).
- `backend/app/core/_permissions/README.md` — 1 (#45b verify-line).
- `backend/app/api/v1/endpoints/risk_questionnaires/README.md` — 1 (#10 verify only).
- `backend/app/api/v1/endpoints/riskhub/README.md` — 1 (#10 verify only).
- `docs/security/reports/contract-drift-remediation-2026-02-21.md` — 1 (#16).
- `docs/security/reports/deep-scan-remediation-2026-02-20.md` — 1 (#16).

**Phase 6 retraction — these 3 READMEs are RESTORED as existing**:
`backend/app/api/README.md`, `tests/backend/pytest/api/v1/README.md`,
and `frontend/src/contexts/README.md` were re-verified at commit
`1ee872a4` and DO exist on disk. The earlier "fabricated paths NOT
counted" framing was wrong; these READMEs are correctly cited and
counted in the docs-touched surface. Original cross-references stand.

**Total docs-touched surface**: 58 (including AGENTS.md, CLAUDE.md,
CONTEXT.md, docs/README.md, all package READMEs, all `.planning/codebase/`,
all `.planning/audits/_context/`, all `docs/adr/`, all
`docs/security/`, all `docs/agent/`).

#### 7.1.3 Lock × items inverse index (most-touched locks)

[Source: `plan-loop-3-05-readme-lock-register.md:2602-2735` and
`plan-loop-2-03-lock-conflict-matrix.md` cross-referenced. Per Phase 4
adversarial corrections, the strict ordering on
`test_architecture_deepening_contracts.py` is mandatory.]

| Lock / TOML | Items | Status |
|---|---|---|
| `tests/backend/pytest/test_architecture_deepening_contracts.py` | 15+ items at specific lines (see 7.1.2) | various edits — strict ordering required (`plan-loop-3-04-risk-register.md:265-275`): #52 first → #50 → #24+#51 cluster → #57 → #54 → #49 → #56 → #55 → #8 → #53 |
| `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py` | 7 items (KRI deletes/extracts) | append-only — #3, #24, #25, #26, #50, #51, #52 |
| `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml` | 3 items | verify/conditional — #37 (verify-only), #39 (add-entry potential — order strict per `plan-loop-2-03-lock-conflict-matrix.md:46-52`), #65 (verify-only) |
| `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` | 4 items | verify-no-change — #18, #40, #72; **#76 ratchet (8 auth/* `expires_at` rows MIGRATE before 2026-09-01 sunset)**. **Cap-pressure**: per `plan-loop-2-03-lock-conflict-matrix.md:34` quote `"NO room for additional auth/* commits before 2026-09-01 expiry"` — `cap is 8; current is 8` |
| `tests/backend/pytest/architecture/_archive_allowlist.toml` | 5 items | verify/scrub — #69 (verify), #70 (review), #4-#6 (scrub if listed) |
| `tests/backend/pytest/architecture/_naming_allowlist.toml` | 7 items | conditional adds (FE flagged misidentified per `plan-loop-2-03-lock-conflict-matrix.md:79-86`) — #46, #66, #71 (FE candidate), #48 (drop), #22, #35, #4-#6 (scrub) |
| `tests/backend/pytest/test_authz_capability_contract_validator.py` | 3 items | line edits — #55 (line 502 fixture remove), #56 (line 500 fixture remove), #61 (line 504 path rewrite) |
| `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py` | 1 item | rename-line — #62 (`:16` path) |
| `backend/app/core/audit/_audit_matrix.toml` | 2 items | additive — #43 (no row change), #62 (verify rows exist) |
| `backend/app/api/v1/endpoints/_reserved_modules.toml` | 1 item | reference-only — #73 |
| `tests/backend/pytest/architecture/_vendor_governance_service_commit_allowlist.toml` | 3 items | verify-no-add — #62, #69, #70 |

**New TOMLs (7)**:
- `tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml` (#73).
- `backend/app/api/v1/_router_registry.toml` (#44).
- `tests/backend/pytest/architecture/_bounded_context_write_side.toml` (#74a).
- `tests/backend/pytest/architecture/_bounded_context_read_shape.toml` (#74a).
- `tests/backend/pytest/architecture/_bounded_context_workflow_pairs.toml` (#74a).
- `tests/backend/pytest/architecture/_bounded_context_adapters.toml` (#74a).
- `tests/backend/pytest/architecture/_bounded_context_policy.toml` (#74a optional 5th).

**Total locks-touched surface**: 24 (10 lock-test files + 14 TOML registries
including 7 NEW + 7 EXISTING).

#### 7.1.4 New files to create (98+)

Categorized list — production code, tests, docs, TOMLs, ADRs, migrations.
Source: `plan-loop-3-05-readme-lock-register.md:2759-2818` + `plan-loop-3-07-integration-v2.md:159-291`.

##### Backend production source (~16 files)

- `backend/app/services/_authorization_capabilities/admin.py` (#39).
- `backend/app/api/v1/endpoints/admin/telemetry.py` (#40).
- `backend/app/api/v1/endpoints/admin/sessions.py` (#40).
- `backend/app/api/v1/endpoints/admin/data_quality.py` (#40).
- `backend/app/services/outbox/payloads.py` extension `ActorPayloadModel` (#42 — additive within existing file).
- `backend/app/core/_permissions/_ownership_factory.py` (#45b).
- `backend/app/core/audit/_emit.py` (#43).
- `backend/app/services/_graph_directory/__init__.py` (#61).
- `backend/app/services/_graph_directory/service.py` (#61).
- `backend/app/services/_graph_directory/auth.py` (#61).
- `backend/app/services/_graph_directory/transport.py` (#61).
- `backend/app/services/_graph_directory/errors.py` (#61).
- `backend/app/services/_vendor_links/kri_assignment.py` (#62 — relocated).
- `backend/app/models/_vendor_link_mixin.py` (#69).
- `backend/app/schemas/health.py` (#38).
- `backend/app/schemas/preferences.py` (#38).

##### Frontend production source (~14 files)

- `frontend/src/lib/queryKeys/<domain>.ts` modules (#46) — per-domain factories, ~10 modules per `plan-loop-1-06-frontend.md:290`.
- `frontend/src/services/api/sessionRefreshPolicy.ts` (#47).
- `frontend/src/i18n/errorKeys.ts` (#48).
- `frontend/src/services/api/queryClient.ts` (#64).
- `frontend/src/services/api/schemas/crudCapabilitySchema.ts` (#65).
- `frontend/src/contexts/SessionContext.tsx` (#66).
- `frontend/src/contexts/PreferencesContext.tsx` (#66).
- `frontend/src/contexts/AuthActionsContext.tsx` (#66).
- `frontend/src/hooks/useResourcePanelQuery.ts` (#67).
- `frontend/src/components/dashboard/WidgetShell.tsx` (#68).
- `frontend/src/services/session/sessionStorage.ts` (#71).
- `frontend/src/services/session/coordinator.ts` (#71).
- `frontend/src/components/vendors/useVendorLinkedEntityTab.ts` (#32).
- `frontend/src/components/vendors/VendorLinkedEntityTab.tsx` (#32).

##### Backend tests — architecture + integration (~41 files)

Per `plan-loop-3-05-readme-lock-register.md:2680-2735`:

- #1: `test_risks_crud_public_surface_red.py`.
- #2: `test_issue_workflow_no_underscored_self_aliases_red.py` (or appended to deepening contract).
- #10: `test_riskhub_questionnaires_module_present_red.py`.
- #12: `test_users_summary_blanket_except_red.py` + optional `test_users_summary_narrow_excepts_red.py`.
- #13: `test_vendor_link_helpers_shim_removed_red.py`.
- #15: `test_capability_catalog_access_user_surface_red.py`.
- #16: `test_reports_legacy_excel_tombstones_removed_red.py`.
- #17: `test_monitoring_response_endpoint_shim_removed_red.py`.
- #19: `test_validate_risk_type_single_owner_red.py` + `test_risks_validation_parity.py`.
- #20: `test_risks_required_reexports_red.py`.
- #21: `test_control_risk_link_loader_collapsed_red.py`.
- #25: `test_kris_department_scope_helper_red.py`.
- #29: `test_issue_source_type_value.py`.
- #31: `test_vendor_governance_reports_red.py` + `test_vendor_reports_endpoint_no_row_builders_red.py`.
- #34: `test_approval_privilege_tier.py`.
- #37: `test_summary_can_view_governance.py`.
- #38: `test_endpoint_inline_pydantic_evicted_red.py`.
- #39: `test_capabilities_builder.py`.
- #40: `test_w12_admin_subrouter_clustering_red.py` + `test_admin_route_table_snapshot_red.py`.
- #42: `test_outbox_actor_payload_base_red.py`.
- #43: `test_audit_adapter_emitter_helper_red.py`.
- #44: `test_router_prefix_registry_red.py`.
- #45a: `test_ownership_resolver_kri_archived_asymmetry.py` + `test_ownership_resolver_control_join.py` + `test_visible_ids_via_ownership.py`.
- #45b: `test_ownership_resolver_factory_equivalence_red.py`.
- #49: `test_control_execution_monitoring_inlined_red.py`.
- #55: `test_access_user_service_removed_red.py`.
- #56: `test_directory_identity_service_removed_red.py`.
- #57: `test_quarterly_comparison_facade_removed_red.py`.
- #58: `test_orphaned_item_facade_removed_red.py`.
- #59: `test_monitoring_packages_separated_red.py`.
- #60: `test_privilege_context.py`.
- #61: `test_graph_directory_package_move_red.py`.
- #62: `test_kri_vendor_assignment_audit_red.py`.
- #63: `test_outbox_dispatch_scheduler_job_run_red.py`.
- #69: `test_vendor_link_mixin_red.py` + `test_vendor_link_cascade_postgres_red.py` (postgres marker).
- #70: `test_vendor_status_drop_red.py` + `test_vendor_status_column_dropped_postgres_red.py`.
- #72: `test_adr_011_present_red.py`.
- #73: `test_kri_period_algebra_ssot_red.py` + `test_kri_deadline_classify_red.py`.
- #74a: `test_bounded_context_classification_complete_red.py` + optional `test_w7_bounded_context_disjointness.py`.
- #74b: `test_adr_007_amendment_present_red.py`.
- #76: `test_auth_flow_db_commit_migrated_red.py` (Phase 4 v2 calendar-tracked).

**Total NEW backend lock-tier files: ~41 distinct test files.**

##### Frontend tests (~22 files)

Per `plan-loop-3-05-readme-lock-register.md:2704-2705` + per-item entries:

- #3: `EntityFormWorkflow.test.ts` (or extended).
- #4: `controlFormWorkflow.deleted.test.ts`.
- #5: `orphanResolutionPresentation.deleted.test.ts`.
- #6: `resourcePath.deleted.test.ts`.
- #22: `ControlForm.shim.deleted.test.ts`.
- #23: `controlFormUtils.inline.test.ts`.
- #26: frontend mirror test for `KRIForm.tsx` deletion.
- #32: `useVendorLinkedEntityTab.contract.test.tsx` + `VendorLinkedEntityTab.duplication.test.ts`.
- #33: `KRIFormContainer.approval-banner.test.tsx` + `no-kri-banner-duplicate.test.ts`.
- #35: `usePermissions.deleted.test.ts` + `Sidebar.usePermissions.replaced.test.tsx`.
- #36: `BusinessRouteGuards.factory.test.tsx`.
- #46: `queryKeys.invariant.test.ts`.
- #47: `sessionRefreshPolicy.test.ts`.
- #48: `errorKeys.merged.test.ts`.
- #64: `queryClient.defaults.test.ts`.
- #65: `crudCapabilitySchema.snapshot.test.ts`.
- #66: `SessionProvider.split.test.tsx` + `AuthActions.split.test.tsx` (+ recommended `AuthActions.callbackStability.test.tsx` per Phase 4 risk additions).
- #67: `useResourcePanelQuery.contract.test.tsx`.
- #68: `WidgetShell.contract.test.tsx` + `DashboardFilterContext.scopedSelector.test.tsx`.
- #71: `sessionStorage.merged.test.ts` + `coordinator.merged.test.ts` + `coordinator.singleFlight.test.ts`.
- #77a: `vendor.status.optional.test.ts` (FE-soft).
- #77b: `vendor.status.removed.test.ts` (FE-cleanup).

##### Migrations (1 file)

- `backend/alembic/versions/k6l7m8n9o0p1_unify_vendor_link_cascade_and_drop_vendor_status.py` (#69 + #70 atomic, per `plan-loop-2-06-migration-window.md:228-231`).

##### Docs (4 files)

- `docs/adr/ADR-011-auth-scheme-and-session-model.md` (#72).
- `docs/adr/ADR-012-kri-time-series-period-algebra.md` (#73).
- `backend/app/services/_graph_directory/README.md` (#61).
- `backend/app/services/_monitoring_response/README.md` (#59 — **Phase 6: single file create**).

##### TOMLs (7 files)

Per `plan-loop-3-05-readme-lock-register.md:2664-2680`:

- `tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml` (#73).
- `backend/app/api/v1/_router_registry.toml` (#44).
- `tests/backend/pytest/architecture/_bounded_context_write_side.toml` (#74a).
- `tests/backend/pytest/architecture/_bounded_context_read_shape.toml` (#74a).
- `tests/backend/pytest/architecture/_bounded_context_workflow_pairs.toml` (#74a).
- `tests/backend/pytest/architecture/_bounded_context_adapters.toml` (#74a).
- `tests/backend/pytest/architecture/_bounded_context_policy.toml` (#74a optional 5th).

**Total NEW files**: 16 (BE prod) + 14 (FE prod) + 41 (BE tests) + 22 (FE tests) +
1 (migration) + 4 (docs) + 7 (TOMLs) = **~105 NEW files** (≥98 floor).

#### 7.1.5 Files to delete (48)

Per `plan-loop-3-05-readme-lock-register.md:2820-2887`. Total: **~48**.

##### Backend (~32 files)

- `backend/app/api/v1/endpoints/vendor_link_helpers.py` (#13).
- `backend/app/services/access_user_service.py` (#55).
- `backend/app/services/directory_identity_service.py` (#56).
- `backend/app/services/quarterly_comparison_service.py` (#57).
- `backend/app/services/orphaned_item_service.py` (#58).
- `backend/app/services/_orphaned_items/service.py` (#58).
- `backend/app/services/issue_workflow_service.py` (#53).
- `backend/app/services/_issue_workflow/service.py` (#53).
- `backend/app/services/_issue_workflow/source_validation.py` (#8 — recommended end-state).
- `backend/app/services/kri_vendor_assignment.py` (#62 — relocated).
- `backend/app/services/_kri_history/submission.py` (#50).
- `backend/app/services/_kri_history/value_application.py` (#51).
- `backend/app/services/_kri_history/correction_plans.py` (#52).
- `backend/app/services/_approval_queue/lifecycle.py` (#54).
- `backend/app/services/_control_execution/monitoring.py` (#49).
- `backend/app/api/v1/endpoints/_monitoring_response.py` (#17).
- `backend/app/api/v1/endpoints/kris/linked_vendors.py` (#24).
- `backend/app/api/v1/endpoints/issues/_shared/loading.py` (#27).
- `backend/app/api/v1/endpoints/issues/_shared/links.py` (#28).
- `backend/app/api/v1/endpoints/reports/legacy_excel.py` (#16).
- `backend/app/api/v1/endpoints/admin/capabilities.py` (#40).
- `backend/app/api/v1/endpoints/admin/console.py` (#40 — merged).
- `backend/app/api/v1/endpoints/admin/directory_sync.py` (#40 — renamed).
- `backend/app/api/v1/endpoints/admin/structured_logs.py` (#40 — merged).
- `backend/app/api/v1/endpoints/admin/orphans.py` (#40 — merged).
- `backend/app/api/v1/endpoints/admin/snapshots.py` (#40 — merged).
- `backend/app/api/v1/endpoints/admin/log_config.py` (#40 — merged).
- `backend/app/api/v1/endpoints/risks/crud/_shared.py` (#19 — if empty).
- `backend/app/services/graph_directory_service.py` (#61).
- `backend/app/services/graph_directory_auth.py` (#61).
- `backend/app/services/graph_directory_transport.py` (#61).
- `backend/app/services/graph_directory_errors.py` (#61).

##### Frontend (~16 files)

- `frontend/src/components/kri-form/kriFormWorkflow.ts` (#3).
- `frontend/src/components/control-form/controlFormWorkflow.ts` (#4).
- `frontend/src/components/governance/orphanResolutionPresentation.ts` (#5).
- `frontend/src/components/notifications/resourcePath.ts` (#6).
- `frontend/src/components/ControlForm.tsx` (#22).
- `frontend/src/components/control-form/controlFormUtils.ts` (#23).
- `frontend/src/components/KRIForm.tsx` (#26).
- `frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx` (#33).
- `frontend/src/hooks/usePermissions.ts` (#35).
- `frontend/src/i18n/getErrorMessageKey.ts` (#48).
- `frontend/src/i18n/errorCodeMap.ts` (#48).
- `frontend/src/services/session/bootstrap.ts` (#71).
- `frontend/src/services/session/manager.ts` (#71).
- `frontend/src/services/session/sso.ts` (#71).
- `frontend/src/services/session/refreshHint.ts` (#71).
- `frontend/src/services/session/logoutSuppression.ts` (#71).

**Total backend file deletes**: ~32. **Total frontend file deletes**: ~16.
**Grand total**: **48** (within Phase 6 spec exactly).

#### Reject-anchor doc updates (orchestrator override) — atomic with #57

Per `plan-loop-3-05-readme-lock-register.md:2741-2756`, the 3 reject-anchor
docs MUST be updated atomically with #57:

1. `backend/app/services/_quarterly_comparison/README.md:16` — REMOVE the lock-line
   `"Keep …quarterly_comparison_service.py as the public service entrypoint."`
   Replace with pointer at `dashboard/quarterly.py` consuming `_quarterly_comparison.composition` directly.
2. `.planning/codebase/CONVENTIONS.md:22` — REMOVE `quarterly_comparison_service.py` from blessed-facade list.
3. `.planning/codebase/CONCERNS.md:14` — REWRITE the line that names the facade as load-bearing concern.

In the same commit as #57:
- Lock at `tests/backend/pytest/test_architecture_deepening_contracts.py:559-569` REWRITTEN.
- New `tests/backend/pytest/architecture/test_quarterly_comparison_facade_removed_red.py` ADDED.

Plus: **#10 reaffirms questionnaires module purpose** at `AGENTS.md:162` +
`docs/agent/ENDPOINT_INVARIANTS.md:13` in the same commit as #38's schema move.

---

### 7.2 Risk Register

[62 distinct risks per `review-loop-2-05-risk-adversarial.md:309-333`.
Sources: Loop 3 A4 (34) + Loop 1 A5 surviving (22) + Loop 2 A5 new (13) − 7 dedups = 62.]

Mathematical breakdown (per `review-loop-2-05-risk-adversarial.md:315-321`):
- Loop 3 original: 34 ✅
- Loop 1 additions: 28 → 22 survive (6 dropped)
- Loop 2 adversarial NEW: 13
- Total proposed: 34 + 22 + 13 = 69
- Dedup adjustments: -7 (worktree-state ≡ partial-migration; build-cache; #71 parallel suite; #36 PWA; #43 import cycle; #73 ADR TOML schema; mock-staleness overlap)
- **FINAL: 62 distinct risks**

#### 7.2.1 Top 15 highest-priority risks

Per `review-loop-2-05-risk-adversarial.md:336-356`, ranked by Likelihood ×
Impact (HIGH/HIGH > HIGH/MEDIUM > MEDIUM/HIGH), ties broken by blast radius.

| Rank | Risk | Category | L × I | Severity | Affected items | Detection | Mitigation |
|---:|---|---|---|---:|---|---|---|
| 1 | ADR-011 #72 → 2026-09-01 auth/* allowlist sunset | CI lane regression | HIGH × HIGH | 9 | #72, #76 | Calendar tracking; CI red on `expires_at` past today | Calendar issue + #76 P1; migrate 8 `db.commit` sites before sunset (Mitigation #3) |
| 2 | #69+#70 deploy-skew → FE Zod parse failure (3-deploy required) | Migration safety | HIGH × MEDIUM-HIGH | 8 | #69+#70, #77a, #77b | E2E smoke; `vendor.status` parse error counter | 3-deploy: FE-soft → BE-migrate → FE-cleanup (Mitigation #6) |
| 3 | #34 Approvals hub partial migration (22+ sites) | Cross-domain coordination | MEDIUM × HIGH | 7 | #34, #9, #60 | `grep -rn "can_resolve_approvals" backend/` post-fix | Pre-commit grep gate + Round-2 adversarial (Mitigations #4, #7) |
| 4 | #69+#70 surviving `Vendor.status` query references | Migration safety | MEDIUM × HIGH | 7 | #69+#70, #77a/b | `grep -rn "vendor.status\|vendor_status" backend/ frontend/` | 3-deploy seq + pre-flight git grep (Mitigation #9) |
| 5 | #71 single-flight `sso.ts:9-11` module-scope state | Behavior regression | MEDIUM × HIGH | 7 | #71 | Vitest mock-isolation tests; module-scope reset | `coordinator.singleFlight.test.ts` + Round-2 adversarial |
| 6 | #66 AuthContext split memo dependencies | Behavior regression | MEDIUM × HIGH | 7 | #66, #37, #39 | `AuthActions.callbackStability.test.tsx` re-render count | Add stability test (Mitigation #16 fuzz) |
| 7 | #11 fix-without-test-inversion | Behavior regression | MEDIUM × HIGH | 7 | #11, #19 | Pre-commit grep `risk.process` in `_register_listings/` | Grep gate (Mitigation #7) |
| 8 | #66 AuthActions callback stability re-renders | Test brittleness | MEDIUM × HIGH | 7 | #66 | Re-render count test | Stability test addition |
| 9 | Hot-fix collision during cleanup window | Cross-domain coordination | MEDIUM × HIGH | 7 | All in-flight items | `origin/main` push not by cleanup dev | Hot-fix-pause protocol (Mitigation #12) |
| 10 | Reviewer cognitive overload across 79 items × 18 weeks | Test brittleness / process | HIGH × MEDIUM | 6 | Cross-cut all | Review cycle time growth | 18-week pacing + 1.5-round cadence |
| 11 | Plan-citation staleness as commits land (week-8 staleness) | Plan-time/exec drift | HIGH × MEDIUM | 6 | All wave B+ items | Citation diff-check at wave boundary | Wave-boundary re-baselining (Mitigation #11) |
| 12 | #74a "exactly 31 packages" assertion drift after #61 | Lock churn race | HIGH × MEDIUM | 6 | #74a, #61 | CI red after #61 lands if hard-coded `== 31` | Use `>= 31` allowlist or sequence #74a→#61 (Mitigation #20) |
| 13 | Capability-contract validator across 16 commits | Validator brittleness | HIGH × MEDIUM | 6 | All validator-touching | Validator subprocess > 5s per commit | Pre-commit hook + budget consolidation (Mitigation #1, #17) |
| 14 | #62 audit-log volume regression (per-row N events) | Behavior regression | HIGH × MEDIUM | 6 | #62 | 7-day baseline + 2× growth alert | Baseline capture (Mitigation #10) |
| 15 | #69+#70 ADR-010 forward-only (snapshot-only rollback) | Migration safety | LOW × HIGH | 6 | #69+#70 | Pre-merge snapshot validation; rehearsal | Snapshot strategy §7.3.3 |

(Honorable mention: Postgres lane catches issues post-merge; concurrent feature
work conflict; #46 query-key partial refactor.)

#### 7.2.2 Risks by category (12 categories — Phase 4 expanded)

Per `plan-loop-3-04-risk-register.md:683-691` + Loop 1/Loop 2 additions:

| Category | Count | Items / triggers |
|---|---:|---|
| Behavior regression | 4 | #11, #34 hub, #66 memo, #71 single-flight |
| Lock churn race | 8 | #74a count, deepening contracts cluster, #62 path, #39 order, naming TOML, #74b, new TOMLs, #56+#61 rewrite |
| Doc churn | 8 | cap-contract md/json, #34/#60 vocabulary, #24+#51 cluster, doc-only Reject, ADR-003 cross-link, ADR-005/010 atomic, issues `_shared/README`, contexts README |
| Migration safety | 3 | #69+#70 forward-only, post-upgrade row count, ADR-010 atomic |
| Cross-domain coordination | 6 | #34 hub, `users/summary.py` 3-way, #46 query-keys, FE Vendor.status, #38 BatchSend, mock files double-rewrite, issues critical path |
| Hub additivity | 1 | #34 22+ sites — overlapping with behavior regression |
| Test brittleness | 6 | #45a tight coupling, #45a→#45b weakening, contract marker, #14→#30 weak dep, snapshot order, characterization-test surface |
| Validator brittleness | 3 | 16-item validator, catalog snapshot churn, ADR vocabulary drift |
| CI lane regression | 5 | Postgres lane, 2026-09-01 sunset, cap-pressure, BE collection, FE collection |
| Plan-time/exec drift (Loop 2 NEW) | 4 | code-review burnout, plan-citation staleness, hot-fix collision, concurrent feature work conflict |
| Test infra / fuzz coverage (Loop 2 NEW) | 4 | test-fixture mutation bleeding, cumulative CI memory/time pressure, permission-boundary fuzz coverage gap, distributed-tracing correlation loss |
| External / process (Loop 2 NEW) | 5 | 3rd-party API consumer backwards incompat, pg_dump format compat, postgres-lane txn discipline, pre-commit hook proliferation budget, scheduler timing race |
| Loop 1 surviving sub-risks | 5 | Time-zone regression (#69 created_at), Audit-log volume (#62), MSAL token cache (#71/#72), DB pool exhaustion, Allowlist-discipline drift |

**Loop 1 dropped (per `review-loop-2-05-risk-adversarial.md:516-523`)**:
1. Worktree dirty-state hazard (DUPLICATE of Loop 3 #2 partial-migration).
2. Build-cache poisoning (Vite hash collisions; vanishing).
3. #71 parallel-suite single-flight (Vitest module isolation handles).
4. #36 service-worker cache (no PWA in RiskHub).
5. #43 audit emitter import cycle (Loop 1 self-contradicts: "additive").
6. #73 ADR-012 TOML schema (covered by atomic-commit invariant).

For each risk: Likelihood × Impact, Detection, Mitigation, Owner role.
Detail entries are at `plan-loop-3-04-risk-register.md` Section 1 + Loop 1/2 additions.

#### 7.2.3 Global mitigations (#1-#20)

Per `plan-loop-3-04-risk-register.md:746-786` (5 from Loop 3) +
`review-loop-2-05-risk-adversarial.md:364-440` (8 NEW Loop 2 §5) +
Loop 1 mitigations 6-12 = 20 total.

**1. Per-commit pre-commit script enforcing locks + validator.** Per
`plan-loop-2-05-validator-schedule.md:483-495`, add `scripts/dev/precommit.sh`
running architecture-locks + validator together. Enforce as a pre-commit
hook so the developer cannot accidentally skip it.

**2. Strict ordering on `test_architecture_deepening_contracts.py`.**
Per `plan-loop-2-03-lock-conflict-matrix.md:334-345`:
#52 → #50 → cluster A (#24+#51) → #57 → #54 → #49 → #56 → #55 → #8 → #53.
Bake the order into master sequence.

**3. Calendar-tracked sunset issue for 2026-09-01 auth/* expiry.** Per
Loop 2 Missing-dep #D (`plan-loop-2-07-hidden-prereqs.md:597-603`).
Add #76 to v2 master sequence (per
`plan-loop-3-07-integration-v2.md:159-198`). Owner: cross-cut domain.

**4. Round-2 adversarial review on every contract-touching commit.** Per
CLAUDE.md `## Adversarial rounds for high-stakes work`. Fresh agents,
each instructed "Round 1 produced false flags; verify each finding by
reading the current file". For #34 specifically: a fresh agent runs
`grep -rn "can_resolve_approvals" backend/` and confirms zero matches in
production code outside `approval_scenario_policy.py`.

**5. Atomic-commit invariant: code + lock + contract + README same commit.**
Per `AGENTS.md` and `plan-loop-2-04-doc-touch-matrix.md:11-15`. Doc/lock-only
Reject is invalid (orchestrator override). For high-doc-churn commits
(#24+#51 atomic = 5 md cells + 5 json strings), run the validator TWICE:
once after staging the file deletes, once after staging the doc edits, to
catch incomplete sweeps (`plan-loop-2-05-validator-schedule.md:516-520`).

**6. Three-deploy sequence for #69+#70 (FE-soft → BE-migrate → FE-cleanup).**
Per `plan-loop-2-06-migration-window.md:693` quote
`"no mid-deployment skew tolerated"`. Frontend code referencing
`vendor.status` must redeploy in lockstep. The 3-deploy sequence isolates
the deploy-skew window and provides a clean rollback path at each step.
Implementation: #77a (pre, FE-soft optional) → #69+#70 (atomic) → #77b
(post, FE-cleanup ratchet).

**7. Pre-commit grep gates for #11 and #34.** For #11: grep `risk\.process`
in `backend/app/services/_register_listings/_control_execution/` confirming
zero post-fix. For #34: grep `can_resolve_approvals` in `backend/` outside
`approval_scenario_policy.py` confirming zero.

**8. Mandatory `git stash` NEW-vs-pre-existing triage discipline.** Per
CLAUDE.md `## Dispatch rules`. When lint/type-check fails, dispatch an
agent that does `git stash` → re-run → `git stash pop` → diff. Always
verify the working tree is restored before returning.

**9. Pre-flight `git grep` for cross-domain stale references before
delete/relocate.** For every file delete (#13, #16, #17, #22, #23, #24,
#26, #27, #28, #33, #35, #48, #49, #50, #51, #52, #53, #54, #55, #56,
#57, #58, #61, #62 file moves, #71 deletes), dispatch agent with brief:
"find any unimported reference to the deleted file by grep; flag if found".

**10. Audit-log baseline capture for 7 days before #62; alert on 2× growth.**
Per Loop 1 `review-loop-1-05-risk-completeness.md:286-308`. The per-row
event emission for KRI vendor assignment changes the audit log volume
profile; a 2× growth is the early signal for the runaway-write failure mode.

**11. Wave-boundary plan re-baselining.** Per Loop 2 §2.2
(`review-loop-2-05-risk-adversarial.md:367-377`). At the start of each
wave (B/C/D/E/F/G per `plan-loop-2-08-master-sequence.md:316-324`),
dispatch a fresh agent with this brief: "Re-verify all `file:line`
citations in remaining-wave plan items against the current commit. Patch
the plan in-place if any citation has drifted."

**12. Hot-fix-pause protocol.** Per Loop 2 §2.3
(`review-loop-2-05-risk-adversarial.md:380-389`). When a P0 production
hot-fix is detected (e.g. by tracker label or `origin/main` push not
authored by the cleanup developer), the cleanup developer MUST: (a)
Stash any in-flight cleanup commit; (b) Wait for the hot-fix to land;
(c) Re-baseline against the new `main` head; (d) Re-verify the next
planned cleanup commit's `file:line` citations.

**13. Concurrent-feature-work tagging.** Per Loop 2 §2.4
(`review-loop-2-05-risk-adversarial.md:392-399`). Tech lead tags any
feature-work PR touching the 15 hot files (per Loop 2 lock-conflict
matrix `plan-loop-2-03-lock-conflict-matrix.md`) with label
`cleanup-rebase-required`. The cleanup developer's pre-flight checklist
consults the label list before starting each commit.

**14. Test ordering hardening (`pytest --randomly-seed`).** Per Loop 2
§2.5 (`review-loop-2-05-risk-adversarial.md:402-407`). Run with at least
3 distinct N values on every contract-touching commit; differing
results = order-dependent test; fix before commit.

**15. CI memory/time budget review at end of Wave C and Wave E.** Per
Loop 2 §2.6 (`review-loop-2-05-risk-adversarial.md:410-415`). At end of
Wave C (Seq 43) and Wave E (Seq 69), dispatch agent to compare CI
duration vs. start-of-cleanup baseline. If ≥ 20% increase, parallelize
via `pytest-xdist`.

**16. Property-based authz fuzz tests.** Per Loop 2 §2.7
(`review-loop-2-05-risk-adversarial.md:418-422`). For #34, #45b, #66 —
add ONE `hypothesis`-based test asserting authz invariant per refactor.
Total 3 new tests across the plan.

**17. Pre-commit hook budget consolidation.** Per Loop 2 §2.12
(`review-loop-2-05-risk-adversarial.md:425-431`). Consolidate ALL
pre-commit hooks into ONE `scripts/dev/precommit.sh`. The script runs
locks + validator + ruff + mypy in parallel with total budget ≤ 10s.
Hook ordering: cheap checks first (grep for forbidden tokens), expensive
checks last (mypy).

**18. External API consumer survey before Wave G.** Per Loop 2 §2.9
(`review-loop-2-05-risk-adversarial.md:434-440`). BEFORE starting Wave G
(Seq 76 #69+#70), confirm with stakeholders whether RiskHub exposes any
external API consumers. If yes, schedule a deprecation cycle (≥ 1
release) for `vendor.status` BEFORE landing #70.

**19. README 3-hop reachability path filter for `backend/app/**` and
`frontend/src/**`.** Per CI strategy gap analysis. The
`maintenance-governance.yml:docs-governance` lane is path-filtered;
items that touch new READMEs (e.g. #61 `_graph_directory/`, #62
`_vendor_links/kri_assignment.py`, #74a/b new bounded-context TOMLs)
must verify the path filter activates the docs invariants.

**20. Bounded-context census TOML lock (#74a).** Per Loop 2 hidden-prereq
#B at `plan-loop-2-07-hidden-prereqs.md:551-558`. Amend #74a TDD shape
to use `>= 31`, OR sequence #74a strictly before #56+#61 and pre-list
`_graph_directory` in `_bounded_context_adapters.toml` with a "post-#61"
comment.

---

### 7.3 Rollback Register

Per `plan-loop-3-03-rollback-register.md`. 77 items + 2 splits = 79
total in v2; class distribution sums verified.

#### 7.3.1 Class distribution

Per direct count of `Rollback class:` markers in
`plan-loop-3-03-rollback-register.md` (77 items in primary register;
+2 from #76, #77 v2 integration):

| Class | Items | Count | % |
|---|---|---:|---:|
| TRIVIAL | #4, #5, #6, #64 | 4 | 5.1% |
| DOC-ONLY | #10, #20, #57, #72, #74b | 5 | 6.3% |
| TEST-ONLY | #45a | 1 | 1.3% |
| MIGRATION | #69, #70 (atomic) | 2 | 2.5% |
| LOCK-RATCHET | #1, #2, #7, #9, #12, #14, #18, #21, #25, #27, #29, #31, #41, #42, #43, #47, #58, #67, #75 | 19 | 24.1% |
| CROSS-DOMAIN | #3, #8, #11, #13, #15, #16, #17, #19, #22, #23, #24, #26, #28, #30, #32, #33, #34, #35, #36, #37, #38, #39, #40, #44, #45b, #46, #48, #49, #50, #51, #52, #53, #54, #55, #56, #59, #60, #61, #62, #63, #65, #66, #68, #71, #73, #74a + #76 + #77a + #77b | 48 | 60.8% |
| **Total** | | **79** | 100% |

(With v2 integration adding #76 + #77a + #77b as MEDIUM-RISK CROSS-DOMAIN,
counts adjust to 79 total. Loop 3 register original was 77.)

Class definitions (per `plan-loop-3-03-rollback-register.md:10-15`):
- **TRIVIAL**: pure code revert (`git revert`); no DB / external state change.
- **DOC-ONLY**: revert touches docs only.
- **TEST-ONLY**: revert touches test files only (no production behaviour change).
- **MIGRATION**: requires snapshot restore (ADR-010 forward-only).
- **LOCK-RATCHET**: revert must restore allowlist entries / lock-test bodies.
- **CROSS-DOMAIN**: revert must coordinate across multiple files; risk of leaving the codebase in a broken intermediate state.

#### 7.3.2 Top 10 highest-risk reverts

Per `plan-loop-3-03-rollback-register.md:1083-1098`. Ranked by combined
criterion: revert time × CROSS-DOMAIN scope × validator obligation ×
dependency-chain depth.

| Rank | Item | Class | Why high-risk | Revert time | Procedure |
|---:|---|---|---|---|---|
| 1 | **#69 + #70** | MIGRATION (atomic) | Forward-only Postgres migration; only path is snapshot-restore (ADR-010). FK constraints, dropped column, `_archivable.py` legacy_values entry, 8 prod sites, 6 seed scripts, 4 lock files, 7 docs. App must be down during DB restore; "no mid-deployment skew tolerated" (per `plan-loop-2-06-migration-window.md:693`). | **4–8 hours** | See §7.3.3 |
| 2 | **#34** | CROSS-DOMAIN | 22+ callsites across 16 files (per `plan-loop-1-03-approvals.md:14,138`). Largest authorization-pathway change. Partial revert leaves privilege-tier dataclass and legacy boolean coexisting → silent ACL divergence. Capability-validator must re-pass. Dependency chain `#9 → #34 → #60` (per `plan-loop-2-08-master-sequence.md:165`). | **90 min** | `git revert <#34-sha>`; validator; lock-test; `grep -rn "ApprovalPrivilegeTier" backend/` confirms zero post-revert. |
| 3 | **#46** | CROSS-DOMAIN | 22 FE files holding 45 inline `queryKey:` literals (per `plan-loop-1-06-frontend.md:282`). Revert leaves test code stale across all 22 — npm run test:run fails everywhere. Blocks revert of #65, #67, #68. | **75 min** | Revert downstream (#65/#67/#68) first, then `git revert <#46-sha>`; npm run test:run in the affected directories; `_naming_allowlist.toml` adjust. |
| 4 | **#74a** | CROSS-DOMAIN | 4 NEW TOMLs + 1 NEW lock; package-count drift sensitive (depends on whether `>= 31` mitigation in place per `plan-loop-2-07-hidden-prereqs.md:551-553`). Cross-dep with #61. | **60 min** | Remove 4 TOMLs; revert lock body; verify `>= 31` ratchet; cross-check #61. |
| 5 | **#66** | CROSS-DOMAIN | Splits AuthContext into 3 providers; gates #68 + #71. Validator allowlist must be re-edited; FE re-render-isolation tests; 4 README diffs; backend prereqs #37 + #39. | **75 min** | Revert downstream first; restore AuthContext; FE re-render tests; capability-contract md/json path-rewrite. |
| 6 | **#39** | CROSS-DOMAIN | Capability-builder real implementation; validator parity-check on 4 NEW catalog fields; `_capabilities_all_allowlist.toml` order-strict; gates #40 and #66. | **60 min** | `git revert <#39-sha>`; validator; allowlist order check. |
| 7 | **#65** | CROSS-DOMAIN | 4 entity Zod schemas re-fanned; capability-catalog snapshot pin; validator parity-check is dominant failure mode (per `plan-loop-2-05-validator-schedule.md:344-349`). | **60 min** | `git revert <#65-sha>`; capability-catalog re-pin; npm run test:run for all entity schemas. |
| 8 | **#24 + #51** | CROSS-DOMAIN (atomic bundle) | Highest doc-edit volume in any single commit — 5 contract-md cells + 5 contract-json strings + 5 deepening-contract lines + 1 W4-bc-g lock + 1 README listing. Validator must re-pass. | **45 min** | Single `git revert <bundle-sha>`; validator twice (post-deletes + post-edits). |
| 9 | **#56 + #61** | CROSS-DOMAIN (atomic bundle) | Cross-import dependency between `directory_identity_service.py` and `graph_directory_service.py` (per `plan-loop-1-08-crosscut.md:362-368`). Deepening-contract test body rewrite + 11 callsite repoints + new package README + capability contract md/json path-rewrites. | **50 min** | Single `git revert <bundle-sha>`; validator; `_capabilities_all_allowlist.toml` order. |
| 10 | **#62** | CROSS-DOMAIN | W4-bc-c lock at `:16` lists exact path (per `plan-loop-2-03-lock-conflict-matrix.md:356`). Lock test crashes on `ast.parse()` if path missing. Audit-event behaviour must be restored; capability-contract perimeter-pass note must be reset. | **45 min** | `git revert <#62-sha>`; W4-bc-c `:16` rename-line; `_audit_matrix.toml` rows; baseline 7-day audit-volume re-check. |

#### 7.3.3 Snapshot strategy for #69+#70

Per `plan-loop-3-03-rollback-register.md:944-1060` and ADR-010
(`docs/adr/ADR-010-postgres-migration-rehearsal-contract.md:30`) quote
`"Production rollback is restoring the pre-upgrade database snapshot."`.

The migration `k6l7m8n9o0p1_unify_vendor_link_cascade_and_drop_vendor_status.py`
explicitly raises:

```python
raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
```

In-place rollback via `alembic downgrade -1` is impossible. The full
snapshot-restore procedure follows.

##### Pre-merge requirements

Per `plan-loop-2-06-migration-window.md:684-688`:

1. **Pre-upgrade snapshot of production DB** captured immediately before
   `alembic upgrade head` runs against production. The snapshot MUST be
   validated as restorable on a staging clone before the production upgrade.
2. **Row-count capture** for the four affected tables, persisted alongside
   the snapshot:
   - `SELECT COUNT(*) FROM vendors`
   - `SELECT COUNT(*) FROM vendor_risk_links`
   - `SELECT COUNT(*) FROM vendor_control_links`
   - `SELECT COUNT(*) FROM vendor_kri_links`
3. **Migration rehearsal** on a refreshed staging clone (per ADR-010 line
   13 quote `"rehearse them on a refreshed staging clone"`), with monitoring
   of locks and statement duration.
4. **Application redeploy plan** verifying frontend + backend are deployable
   in lockstep — `plan-loop-2-06-migration-window.md:693` quote
   `"no mid-deployment skew tolerated"`.

##### Snapshot capture (immediately before upgrade)

```bash
# 1. Quiesce writes (drain traffic / put app in read-only mode if available).
# 2. Capture row counts.
psql -U "$PG_USER" -h "$PG_HOST" -d "$PG_DB" -A -t \
     -c "SELECT 'vendors' AS table, COUNT(*) FROM vendors
         UNION ALL SELECT 'vendor_risk_links', COUNT(*) FROM vendor_risk_links
         UNION ALL SELECT 'vendor_control_links', COUNT(*) FROM vendor_control_links
         UNION ALL SELECT 'vendor_kri_links', COUNT(*) FROM vendor_kri_links;" \
     > "/snapshots/k6l7m8n9o0p1_pre_counts.txt"

# 3. Take a Postgres snapshot. For RDS / managed Postgres, use a provider-native
#    snapshot. For self-hosted Postgres, use pg_dump in custom format:
pg_dump -U "$PG_USER" -h "$PG_HOST" -d "$PG_DB" \
        --format=custom --jobs=4 --verbose \
        --file="/snapshots/k6l7m8n9o0p1_pre_upgrade.dump"

# 4. Verify the snapshot restores cleanly on a disposable database BEFORE
#    running the upgrade in production:
createdb -U "$PG_USER" -h "$PG_HOST" k6l7_verify
pg_restore -U "$PG_USER" -h "$PG_HOST" -d k6l7_verify \
           --jobs=4 --verbose "/snapshots/k6l7m8n9o0p1_pre_upgrade.dump"
psql -U "$PG_USER" -h "$PG_HOST" -d k6l7_verify -c \
     "SELECT COUNT(*) FROM vendors;" \
     | tee /snapshots/k6l7m8n9o0p1_verify_counts.txt
diff /snapshots/k6l7m8n9o0p1_pre_counts.txt /snapshots/k6l7m8n9o0p1_verify_counts.txt
dropdb -U "$PG_USER" -h "$PG_HOST" k6l7_verify
```

##### Upgrade execution (in production)

```bash
alembic upgrade head
# Capture post-upgrade row counts; must match pre-upgrade counts (no DML).
psql -U "$PG_USER" -h "$PG_HOST" -d "$PG_DB" -A -t \
     -c "SELECT 'vendors' AS table, COUNT(*) FROM vendors
         UNION ALL SELECT 'vendor_risk_links', COUNT(*) FROM vendor_risk_links
         UNION ALL SELECT 'vendor_control_links', COUNT(*) FROM vendor_control_links
         UNION ALL SELECT 'vendor_kri_links', COUNT(*) FROM vendor_kri_links;" \
     > "/snapshots/k6l7m8n9o0p1_post_counts.txt"
diff /snapshots/k6l7m8n9o0p1_pre_counts.txt /snapshots/k6l7m8n9o0p1_post_counts.txt
# Expected: zero diff (the migration is DDL-only; no DML on these tables).
```

##### Rollback (if upgrade went wrong)

```bash
# 1. Stop application servers (no in-flight DDL).
systemctl stop riskhub-backend  # or k8s scale to 0

# 2. Drop the corrupted DB and restore from the pre-upgrade snapshot.
#    For RDS: use point-in-time-restore to the moment immediately before
#    `alembic upgrade head` started. For self-hosted:
dropdb -U "$PG_USER" -h "$PG_HOST" "$PG_DB"
createdb -U "$PG_USER" -h "$PG_HOST" "$PG_DB"
pg_restore -U "$PG_USER" -h "$PG_HOST" -d "$PG_DB" \
           --jobs=4 --verbose --exit-on-error \
           "/snapshots/k6l7m8n9o0p1_pre_upgrade.dump"

# 3. Verify row counts match pre-upgrade.
psql -U "$PG_USER" -h "$PG_HOST" -d "$PG_DB" -A -t \
     -c "SELECT 'vendors' AS table, COUNT(*) FROM vendors
         UNION ALL SELECT 'vendor_risk_links', COUNT(*) FROM vendor_risk_links
         UNION ALL SELECT 'vendor_control_links', COUNT(*) FROM vendor_control_links
         UNION ALL SELECT 'vendor_kri_links', COUNT(*) FROM vendor_kri_links;" \
     | diff - /snapshots/k6l7m8n9o0p1_pre_counts.txt

# 4. Revert the application code (mixin file + 3 link-model rebases + 8 service
#    edits + 6 seed scripts + 4 NEW lock test files):
git revert <bundled-commit-sha>

# 5. Redeploy the reverted application BEFORE allowing traffic.
systemctl start riskhub-backend  # or k8s scale to N
```

##### Post-rollback validation

1. Confirm `alembic current` shows revision `j5k6l7m8n9o0` (per
   `_context/07-migrations-schema.md:24-27`), not `k6l7m8n9o0p1`.
2. Confirm `vendors.status` column is restored:
   `SELECT column_name FROM information_schema.columns WHERE table_name='vendors' AND column_name='status';`
   returns one row.
3. Confirm `ix_vendors_status` index restored:
   `SELECT indexname FROM pg_indexes WHERE tablename='vendors' AND indexname='ix_vendors_status';`
   returns one row.
4. Confirm vendor link FKs do NOT have `ON DELETE CASCADE` (4 of 6 should be
   `confdeltype='a'` — no action — per pre-#69 baseline; the 2
   `vendor_kri_links` FKs retain `'c'` as set by
   `v2w3x4y5z6a_add_vendor_kri_links.py:28-29`).
5. Confirm the application boots: ORM imports `VendorStatusEnum` successfully;
   `_archivable.py` `vendors: ("inactive",)` legacy_values entry present.

##### Estimated revert time (#69 + #70 bundle)

- Snapshot capture: 5–30 min (dataset-size dependent).
- Snapshot validation (restore to disposable DB): 10–60 min.
- Production upgrade: 1–5 min (DDL-only).
- Rollback (if needed): 10–60 min restore + 5 min app revert + 5 min redeploy
  = **20 min – 2 hr** for the DB operation, plus git revert and validator +
  lock-test re-run = **4–8 hours total**.

#### 7.3.4 Coordination strategy for CROSS-DOMAIN reverts (3 tiers)

Per `plan-loop-3-03-rollback-register.md:1119-1165`. The 46+ CROSS-DOMAIN
items split into three coordination tiers based on the structure of
`plan-loop-2-08-master-sequence.md` and the dependency chains in
`plan-loop-2-03-lock-conflict-matrix.md`.

##### Tier 1 — chain-bound reverts (reverse-order constraint)

Reverts MUST go in the reverse order of forward landings. If a downstream
item already merged, revert it first or the upstream revert leaves a
broken intermediate state.

- **Issues chain** `#2 → #8 → #28 → #30` (length 4 — per
  `plan-loop-2-08-master-sequence.md:181`): revert in reverse
  `#30 → #28 → #8 → #2`. Each revert restores its own slice of
  `_shared/__init__.py`, `_issue_workflow/`, and `:1193` of
  `test_architecture_deepening_contracts.py`.
- **Risks chain** `#1 → #19 → #11`: revert `#11 → #19 → #1`.
- **Approvals chain** `#9 → #34 → #60`: revert `#60 → #34 → #9`.
  **#34's revert touches 22+ sites**; this is the highest single-revert
  effort outside the migration bundle.
- **Monitoring chain** `#17 → #49 → #59`: revert `#59 → #49 → #17`. Each
  revert touches the deepening-contract `:188, :192` cells (#49) plus
  their own README and shim files.
- **FE auth/session chain** `#37 → #66 → #71`, `#39 → #66 → #71`,
  `#46 → #65/#67/#68`, `#72 → #71`, `#47 → #71`: revert in reverse, with
  `#71` first (depth-4 sink).
- **ADR-007 chain** `#74a → #74b`: revert `#74b → #74a`. #74a is sensitive
  to package count drift; if #61 is still landed, the count is 32, and
  #74a's lock must be edited to `>= 31` not `== 31`.
- **Vendor.status FE-skew chain** `#77a → #69+#70 → #77b`: revert `#77b →
  #69+#70 (Tier 2 bundle) → #77a`. This is the 3-deploy migration mirror.

##### Tier 2 — atomic bundle reverts (single-commit rollback)

These items were forward-landed as one atomic commit. Their revert is also a single `git revert <bundled-sha>`:

- **#24 + #51** (KRI history barrel + value_application shim) — `plan-loop-2-08-master-sequence.md:252`.
- **#56 + #61** (directory shim + graph_directory move) — `plan-loop-2-08-master-sequence.md:253`.
- **#69 + #70** (vendor mixin + status drop) — `plan-loop-2-08-master-sequence.md:254`.

Reverting half of an atomic bundle is forbidden; the bundle's
deepening-contract assertions and contract-validator paths assume both
halves landed together.

##### Tier 3 — cross-area collisions

Items that touch the same file but are not directly in a chain:

- **#12 + #34** — both edit `endpoints/users/summary.py` (per
  `plan-loop-2-07-hidden-prereqs.md:511-516`). #12 narrows excepts; #34
  swaps privileged-predicate. If #34 already landed, the #12 revert must
  be re-rebased.
- **#37 + #12 + #34** — all three edit `users/summary.py`; recommended
  forward order `#37 → #12 → #34` (per
  `plan-loop-2-07-hidden-prereqs.md:531`); revert order
  `#34 → #12 → #37`.
- **#50 + #51** — both edit deepening-contract tuple `:997-1002` (per
  `plan-loop-2-03-lock-conflict-matrix.md:478`). #50 leaves a clean tuple
  for the #24+#51 bundle to subset-edit. Revert in reverse: #24+#51
  atomic bundle first, then #50.
- **#13 + #69** — both touch
  `authorization-capability-contract.{md:121,122, .json:55,479,502}`.
  #13 deletes the shim from the cells; #69 verifies the backend authority
  remains accurate. If both landed, revert #69+#70 first (Tier 2 bundle),
  then #13.
- **#3, #24, #25, #26, #50, #51, #52** — seven items append to
  `test_w4_bc_g_kri_history_boundaries_red.py` (per
  `plan-loop-2-03-lock-conflict-matrix.md:482`). Append-only on this file
  is safe; per-item revert removes its own stanza. Order matters only
  inasmuch as the forward-time order of file deletions matches.
- **#15 + #39 + #65** — all three edit `docs/security/capability-catalog.json`.
  Each pins a different sub-tree (per
  `plan-loop-2-04-doc-touch-matrix.md:226-233`). Revert each in reverse
  forward-order to keep the
  `validate_authz_capability_contract.py` script GREEN at every revert step.

##### Coordination protocol (single-developer)

For any CROSS-DOMAIN revert:

1. **Identify dependents**: cross-reference
   `plan-loop-2-08-master-sequence.md` "Pre-req" + "Atomic with" columns
   and `plan-loop-2-07-hidden-prereqs.md` cross-domain matrix.
2. **Block until dependents are reverted** (or NONE landed).
3. **Read the original commit's diff in full** before issuing `git revert`
   — the lock-test edits + README edits + capability-contract edits all
   sit in the same commit, and `git revert` will replay all of them.
4. **Run the validator** `python3 scripts/security/validate_authz_capability_contract.py`
   after every revert that touches `sensitive_change_paths`. This is
   non-negotiable for items #13, #15, #24, #34, #37, #39, #50, #51, #55,
   #56, #60, #61, #62, #65, #66 (the validator-gated subset per
   `plan-loop-2-05-validator-schedule.md:443-446`).
5. **Run** `make -f scripts/Makefile test-architecture-locks` after every
   revert that touches a lock or TOML.
6. **Run** `pytest -m postgres` after #69+#70 revert (snapshot restore validation).
7. **Tag the revert commit** with the original commit SHA for audit traceability.

##### Aggregate revert effort

| Class | Mean revert time | Total time (sum across items in class) |
|---|---:|---:|
| TRIVIAL | 6 min | 24 min |
| DOC-ONLY | 16 min | 80 min |
| TEST-ONLY | 10 min | 10 min |
| MIGRATION | 6 hr | 12 hr (one bundle, two items) |
| LOCK-RATCHET | 17 min | 5 hr 23 min |
| CROSS-DOMAIN | 36 min | 28 hr 48 min |
| **Total** | — | **~47 hr** (single sequential developer, 79 items) |

These numbers exclude:
- Production redeploy (~20 min per revert).
- Stakeholder communication / change-management process.
- Re-rebasing dependents if they landed in the wrong order.

For comparison, the forward effort is ~727 hours (per Phase 4 Loop 2
adversarial); the all-79-revert effort is ~6.5% of that. The dominant cost
is the **migration bundle** (12 hr nominally) and **#34 + #46** (each ≥1
hr) — three reverts account for ~30% of the total backwards budget.

---

### 7.4 Pre-commit Gate Runbook

[Per `plan-loop-3-01-precommit-gates.md:1-50`. Standard 7-step gate
sequence per item type + per-domain gate distribution.]

#### 7.4.1 Standard 7-step gate sequence

Per `plan-loop-3-01-precommit-gates.md` and `plan-loop-2-05-validator-schedule.md`:

1. **RED test confirmation** — `pytest <new test path> -q` confirms FAIL
   before any production edit (write test, see RED).
2. **Implement the change** — code + lock + doc edits land in the worktree.
3. **GREEN test confirmation** — re-run the same `pytest` command; it
   must PASS.
4. **Domain test suite** — run the broader pytest/vitest folder for the
   touched domain to detect regressions.
5. **Architecture locks** — `make -f scripts/Makefile test-architecture-locks`
   (the canonical invariant-lock runner; covers TOMLs, `_red.py`, and
   deepening contracts).
6. **Capability contract validator** (only when item touches authz surface) —
   `python3 scripts/security/validate_authz_capability_contract.py` MUST
   exit 0.
7. **Lint + type** (delta-only) — `ruff check <touched paths>`,
   `mypy <touched paths>`, and for FE items
   `cd frontend && npx tsc --noEmit`.

Frontend command correction (post-implementation review, 2026-05-10):
the repository has no root `package.json`, so root workspace commands that
target `tests/frontend/unit` with `npm -w` are historical only and must not
be used for local gates. Run frontend gates from `frontend/`:

```bash
cd frontend && npx tsc --noEmit
cd frontend && npm run test:run
cd frontend && npm run lint
```

For focused unit tests under `tests/frontend/unit`, pass the relative test
path to the frontend Vitest script, for example:

```bash
cd frontend && npm run test:run -- ../tests/frontend/unit/src/lib/capabilities.test.ts
```

##### Variants by item type

- For the **migration bundle (#69 + #70)**, the gate is the **9-step
  migration sequence** drawn from `plan-loop-2-06-migration-window.md:577-633`.
- For **ADR items (#72, #73, #74b)**, the gate is just `validator +
  architecture-locks + 3-hop reachability check via
  scripts/tools/docs_tree_audit.py` (see `make docs-tree-audit`).
- For **doc-only Reject items (#10, #57)**, Step 1 is a structural
  "module-must-exist" red test; Step 7 reduces to a doc-tree audit.

##### Standard time budget

- Per-gate run wall-clock: **~5-12 min** (M-effort items at the high end).
- Validator-touching items add **~1-3 min** for validator subprocess.
- Postgres-lane items add **~5-8 min** for `pytest -m postgres`.
- Cumulative gate budget per commit: **~10-25 min** (TDD cycles double this).

#### 7.4.2 Postgres-lane items

**Items**: #69 + #70 (atomic) + downstream verification by #62 (low-volume
audit baseline check).

**Phase 6 correction — `make postgres-up` does NOT exist.** Per
`scripts/Makefile:6,121-125`, the canonical Postgres-lane gate command is:

```bash
TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub@localhost:5432/riskhub_test \
    make -f scripts/Makefile test-postgres-ci
```

This requires the `TEST_DATABASE_URL` env var to be set; the Makefile
guard at `:122` rejects the call otherwise. The 4 routine guard files
run as part of `make test-postgres-ci`:
`test_postgres_schema_contracts.py`, `test_outbox_approval_flow.py`,
`test_approval_workflow.py`, `test_health.py` (Makefile `:128-132`).

**Migration-specific RED tests** (added by #69+#70):
- `tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py`
  (per `plan-loop-2-06-migration-window.md:451-496`).
- `tests/backend/pytest/migrations/test_vendor_status_column_dropped_postgres_red.py`.

Both include `pytestmark = pytest.mark.postgres` to gate the run on the
TEST_DATABASE_URL discriminator.

#### 7.4.3 Validator-touching items (42 per Phase 4 Loop 2)

Per `review-loop-2-04-validator-adversarial.md:445-460`, the 42-item
validator-touching schedule:

##### HIGH (18 items — CERTAIN validator surfaces NEW finding)

#8, #13, #15, #24, #28, #34, #35, #38, #39, #45b, #50, #51, #55, #56, #60,
#61, #65, #66.

##### MEDIUM (~24 items — LIKELY Check 7a sweep)

#1, #5, #6, #7, #11, #12, #14, #16, #17, #18, #19, #21, #22, #25, #26, #27,
#29, #30 (conditional), #31, #36, #37, #40, #46, #49, #52, #54, #58, #62,
#67, #70, #73, #75 (33 nominally; ~24 net after final triage).

##### LOW (6 items — defence-in-depth only)

#45a, #57, #59, #69, #72, #74b.

##### OUT-OF-SCOPE (~22 items — no validator concern)

#2, #3, #4, #9, #10, #20, #23, #32, #33, #41, #42, #43, #44, #47, #48, #53,
#63, #64, #68, #71 (downgraded), #74a, #76 (calendar gate), #77a, #77b.

#### 7.4.4 Recommended `scripts/dev/precommit.sh` template

Per `plan-loop-2-05-validator-schedule.md:483-510` + Phase 4 Loop 2
mitigation #17 (parallel budget ≤ 10s):

```sh
#!/usr/bin/env bash
# scripts/dev/precommit.sh
# Total budget: ≤ 10s parallel.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# 1. Cheap forbidden-token greps first (subsecond).
if git diff --cached --name-only | grep -q "^backend/"; then
    if git diff --cached -- backend/ | grep -q "can_resolve_approvals"; then
        if ! git diff --cached -- backend/ | grep -q "approval_scenario_policy.py"; then
            echo "ERROR: 'can_resolve_approvals' present outside approval_scenario_policy.py" >&2
            exit 1
        fi
    fi
fi

# 2. Architecture locks + capability validator in parallel (~5s + ~3s).
echo "==> Running architecture locks…"
make -f scripts/Makefile test-architecture-locks &
LOCKS_PID=$!

echo "==> Running capability contract validator…"
python3 scripts/security/validate_authz_capability_contract.py &
VALIDATOR_PID=$!

# 3. ruff + mypy for staged files only (delta-only).
STAGED_PY=$(git diff --cached --name-only --diff-filter=ACM | grep '\.py$' || true)
if [ -n "$STAGED_PY" ]; then
    ruff check $STAGED_PY &
    RUFF_PID=$!
fi

# 4. wait for parallel checks.
wait $LOCKS_PID
LOCKS_RESULT=$?
wait $VALIDATOR_PID
VALIDATOR_RESULT=$?
[ -n "$STAGED_PY" ] && wait $RUFF_PID
RUFF_RESULT=$?

if [ "$LOCKS_RESULT" -ne 0 ] || [ "$VALIDATOR_RESULT" -ne 0 ] || \
   [ -n "$STAGED_PY" -a "$RUFF_RESULT" -ne 0 ]; then
    echo "ERROR: pre-commit gate failed" >&2
    exit 1
fi

# 5. mypy on staged files (slowest; expensive last).
if [ -n "$STAGED_PY" ]; then
    cd backend && ./venv/bin/mypy $STAGED_PY
fi

echo "==> All pre-commit gates passed."
```

For the items requiring validator, the developer's local pre-commit
checklist is:

1. `pytest <new-RED-test>.py` — confirm RED.
2. Implement fix.
3. `pytest <new-RED-test>.py` — confirm GREEN.
4. `pytest <full domain test suite>` — no regressions.
5. **`python3 scripts/security/validate_authz_capability_contract.py`** —
   exit 0 required.
6. `make -f scripts/Makefile test-architecture-locks` — exit 0 required.
7. `git add` + `git commit` (pre-commit hook re-runs steps 5 + 6 + ruff/mypy).

The validator is the **gate** between `pytest` and `git commit` for every
item in the validator schedule. CI re-runs the validator (per AGENTS.md)
but is a backstop, not the gate.

---

### 7.5 CI Strategy

[Per `plan-loop-3-02-ci-strategy.md`. 8 GitHub workflows mapped;
mandatory vs advisory matrix; 6 recommended new gates.]

#### 7.5.1 Existing CI lanes

Per `plan-loop-3-02-ci-strategy.md`, the 8 workflows:

- **`lint.yml`** (3 jobs): `frontend-unit-tests` (vitest coverage),
  `backend-quality` (ruff + mypy + suppression-budget),
  `lint` (FE lint + tsc + build + repo-contracts including authz validator + production-contract-docs + deprecated-imports).
- **`backend-postgres.yml`** (2 jobs): `sqlite-tests` (default backend
  regression), `postgres-tests` (`pytest -m postgres`). Both BLOCKING.
- **`maintenance-governance.yml`** (3 jobs):
  `docs-governance` (path-filtered), `frontend-maintenance`
  (path-filtered), `backend-maintenance-informational` (advisory).
- **`e2e.yml`** (2 jobs): `e2e-tests` (BLOCKING — out-of-scope per user),
  `production-profile-smoke` (BLOCKING).
- **`security.yml`** (9 jobs): `public-repo-hygiene`, `workflow-pin-validation`,
  `python-security` (bandit + pip-audit), `frontend-security` (npm audit),
  `frontend-i18n`, `redis-resilience-integration` (advisory cron-only),
  `container-security` (Trivy + Grype), `secrets-detection` (Gitleaks),
  `security-headers`.
- **`startup-smoke.yml`**: non-PR (push/cron); existing post-merge safety net.
- **`release-parity-{pr,fast}.yml`**: manual / nightly; out of plan scope.
- **`release.yml`**: tag-only; out of plan scope.

#### 7.5.2 Mandatory vs advisory matrix

For the 79-item plan, classify each lane as **MANDATORY** (must pass
before merge) or **ADVISORY** (informational, doesn't block).

| Lane (workflow:job) | Current gate | Plan-gate proposal | Why |
|---|---|---|---|
| `lint.yml:frontend-unit-tests` | BLOCKING | **MANDATORY** | FE coverage threshold (lines ≥58, branches ≥47) is a ratchet — every FE item (~19 frontend items + #37/#39 capability builders + auth-related items) must keep coverage from sliding. |
| `lint.yml:backend-quality` (ruff + mypy + suppression-budget) | BLOCKING | **MANDATORY** | Every backend file change touches ruff + mypy. Suppression budget is a ratchet allowlist that no plan item should breach. |
| `lint.yml:lint` (FE lint + tsc + build + repo-contracts including authz validator + production-contract-docs + deprecated-imports) | BLOCKING | **MANDATORY** | This is where the **capability-contract validator runs**. Validator-touching items (16+ from Loop 2 A5 / 42 corrected) gate here. |
| `backend-postgres.yml:sqlite-tests` | BLOCKING | **MANDATORY** | Default backend regression. Every backend code/test change needs this. |
| `backend-postgres.yml:postgres-tests` | BLOCKING | **MANDATORY** | The migration bundle (#69+#70) and the new postgres-marked tests in `tests/backend/pytest/migrations/` (per `plan-loop-2-06-migration-window.md:451-496`) MUST land green. |
| `maintenance-governance.yml:docs-governance` | BLOCKING (path-filtered) | **MANDATORY when path-touched** | Items that touch READMEs, ADRs, or `.planning/**` activate this. ALL ADRs (#72/#73/#74b), all bounded-context README adds (#61/#62/#74a/b), all doc-touch items per Loop 2 A4 trigger it. |
| `maintenance-governance.yml:frontend-maintenance` | BLOCKING (path-filtered) | **MANDATORY when path-touched** | FE debt-budget + cleanup audit. All FE items (~19) gate here. |
| `maintenance-governance.yml:backend-maintenance-informational` | ADVISORY (`continue-on-error: true`) | **ADVISORY** (keep) | Full-tree ruff/mypy noise; informational only. |
| `e2e.yml:e2e-tests` | BLOCKING | **OUT OF SCOPE per user** — leave as-is | User decision. Plan introduces no e2e specs. |
| `e2e.yml:production-profile-smoke` | BLOCKING | **MANDATORY** | Production auth/CORS/CSP smoke; #66 AuthContext split could regress this. Keep mandatory. |
| `security.yml:public-repo-hygiene` | BLOCKING | **MANDATORY** | All items. |
| `security.yml:workflow-pin-validation` | BLOCKING | **MANDATORY** | All items. |
| `security.yml:python-security` (bandit + pip-audit) | BLOCKING | **MANDATORY** | All backend items. |
| `security.yml:frontend-security` (npm audit) | BLOCKING | **MANDATORY** | All FE items. |
| `security.yml:frontend-i18n` | BLOCKING | **MANDATORY** | FE items that touch i18n strings (likely #66, #68, possibly #36, #48). |
| `security.yml:redis-resilience-integration` | ADVISORY (cron-only) | **ADVISORY** (keep) | Nightly only; not relevant to plan items. |
| `security.yml:container-security` (Trivy + Grype) | BLOCKING | **MANDATORY** | All items (catches dep drift, esp. requirements changes from validator/test work). |
| `security.yml:secrets-detection` (Gitleaks) | BLOCKING | **MANDATORY** | All items. |
| `security.yml:security-headers` | BLOCKING | **MANDATORY** | Items that touch FastAPI middleware (#37 governance, #66 AuthContext indirectly via prod-profile, #44 path-prefix registry). |
| `startup-smoke.yml` | non-PR (push/cron) | **N/A for PRs** | Existing post-merge safety net. |
| `release-parity-{pr,fast}.yml` | manual / nightly | **N/A for PRs** | Out of plan scope. |
| `release.yml` | tag-only | **N/A for PRs** | Out of plan scope. |

#### 7.5.3 Recommended new gates (6)

##### 1. README 3-hop reachability path filter for `backend/app/**` and `frontend/src/**`

Per CI strategy gap analysis. The
`maintenance-governance.yml:docs-governance` lane is currently
path-filtered; for new READMEs from #61, #62, #74a/b, ensure the path
filter activates the docs invariants. Expand the path filter to
explicitly include `backend/app/**` and `frontend/src/**` if the
existing pattern misses any of the new locations.

##### 2. Bounded-context census TOML lock (#74a)

Per Loop 2 hidden-prereq #B at `plan-loop-2-07-hidden-prereqs.md:551-558`.
Add CI step that verifies `_bounded_context_*.toml` count `>= 31` (or
`== 32` after #61) and that every `backend/app/services/*` package is
classified into exactly ONE of the 4-5 TOMLs.

##### 3. ADR index parity

Per Phase 4 Loop 2. Add CI step that verifies `docs/adr/README.md` has
exactly N rows where N = count of `docs/adr/ADR-*.md` files. After #72,
#73, #74b: N = 12.

##### 4. Postgres-lane convention check

Per Phase 4 Loop 2 — verify all `tests/backend/pytest/migrations/` files
have `pytestmark = pytest.mark.postgres` at module top. Add CI step
parsing every `.py` in the directory.

##### 5. Capability-catalog ordered equality

Per `plan-loop-2-05-validator-schedule.md:344-349`. Add CI step that
verifies `docs/security/capability-catalog.json` is a stable canonical
order (alphabetical sort by surface, then by capability key) — pin via
`jq -S` round-trip equality.

##### 6. Path-prefix registry lock (#44)

Per `plan-loop-1-08-crosscut.md:600-630`. After #44 lands: add CI step
that verifies `backend/app/api/v1/_router_registry.toml` enumerates ALL
router prefixes loaded by `app.include_router(...)` calls in the
codebase. Drift = CI red.

---

### 7.6 Capability Contract Validator Schedule

[Per Phase 4 Loop 2 adversarial — `review-loop-2-04-validator-adversarial.md:445-487`. 42 items.]

#### 7.6.1 Items requiring validator (HIGH/MEDIUM/LOW tiers)

##### HIGH (18 items — CERTAIN validator surfaces NEW finding)

#8, #13, #15, #24, #28, #34, #35, #38, #39, #45b, #50, #51, #55, #56, #60,
#61, #65, #66.

Validator concerns by check:

- **Check 4 (Pydantic ↔ Zod parity)**: #15 (NEW 8th surface), #39
  (NEW admin surface), #65 (4-entity refactor — DOMINANT failure mode).
- **Check 2 (sensitive_change_paths)**: #13, #15, #24, #38, #50, #51,
  #55, #56, #61, #62, #66.
- **Check 5 (markdown matrix 9 sections)**: #15, #24, #28, #34
  (Vocabulary "privilege tier" — Phase 6 cite `:43-54` + `:119`), #50,
  #51, #56, #60 (Vocabulary "privilege context" — Phase 6 cite `:43-54`
  + `:131`), #66.
- **Check 7a (atomic doc-touch)**: ALL 18 (sensitive prefix changes).
- **Check 7b (FE local-gate allowlist)**: #35 (deletes
  `usePermissions.ts` from FRONTEND_LOCAL_GATE_CLASSIFICATIONS), #66
  (NEW context files may trigger).

##### MEDIUM (~24 items — LIKELY Check 7a sweep)

#1, #5, #6, #7, #11, #12, #14, #16, #17, #18, #19, #21, #22, #25, #26, #27,
#29, #30 (conditional), #31, #36, #37, #40, #46, #49, #52, #54, #58, #62,
#67, #70, #73, #75.

(33 listed; some flip to LOW after final review — net ~24.)

These items run validator as **defence-in-depth**: backend file change in
a sensitive prefix triggers Check 7a sweep, but no md/json edit is
expected. The validator passes if no authz token is co-edited with the
file change.

##### LOW (6 items — defence-in-depth only)

#45a, #57, #59, #69, #72, #74b.

These items do NOT trigger any validator check naturally; the validator
runs as a safety check.

##### OUT-OF-SCOPE (~22 items — no validator concern)

#2, #3, #4, #9, #10, #20, #23, #32, #33, #41, #42, #43, #44, #47, #48, #53,
#63, #64, #68, #71 (downgraded), #74a, #76, #77a, #77b.

Per Phase 4 adversarial verifications, these paths are NOT in
`sensitive_change_paths` (136 entries verified).

#### 7.6.2 Pydantic ↔ Zod parity items (3 highest risk)

Per `plan-loop-2-05-validator-schedule.md:448-454`:

##### #15 — `access_user` NEW 8th catalog surface (7 fields)

Backend: `class AccessUserCapabilities` at `backend/app/schemas/access.py:66-72`.
Frontend: `accessUserCapabilitiesSchema` at `frontend/src/types/access.ts:51`.
Parser brittleness: must use `passthroughObject({...})` not `z.object({...})`.

##### #39 — `AdminConsoleCapabilities` builder NEW catalog fields (4 fields)

Plan: promotes static stub at `endpoints/admin/capabilities.py:14-22`
to a real builder via `_authorization_capabilities/admin.py`.

##### #65 — `crudCapabilitySchema` 4 entity refactor (DOMINANT failure)

Refactors `frontend/src/services/api/schemas/entities/{risks,controls,kris,vendors}.ts`.

**CRITICAL parser limitation**: `_extract_typescript_schema_body`
(`capability_catalog.py:112-126`) walks brace-matched body but does NOT
chase `.merge(...)` continuation. If refactor uses
`crudCapabilitySchema.merge(...)`, parser sees only inner
`passthroughObject({...})` body. Plan literal:
`passthroughObject({ can_read, can_update }).merge(...)` — parser would
emit `capability_catalog_frontend_field_missing` for ALL merged fields.

**Mitigation**: inline composed object; do not use `.merge(...)`; OR
extend the parser; OR reformulate `crudCapabilitySchema` so each entity's
`passthroughObject` call literally contains all fields textually.

#### 7.6.3 Validator run cadence

##### Per-item, no exceptions

The validator subprocess runs in **<1s** for the corrected schedule
(per `plan-loop-2-05-validator-schedule.md:495`). There is no commit-cost
argument for skipping it. **EVERY validator-touching commit MUST run the
validator before `git commit`.**

##### Double-run for atomic clusters (#24+#51)

Per Mitigation #5. For atomic bundles with high doc-edit volume:

1. First run: AFTER staging the file deletes / code edits, BEFORE staging
   the doc/contract edits. The validator should report the missing
   doc-side updates as DETECTED but NOT-YET-FIXED.
2. Second run: AFTER staging the doc/contract edits. The validator
   should now exit 0.

This catches the "incomplete sweep" failure mode where the developer
forgets a doc edit. Applies to: **#24+#51** (5 md cells + 5 json strings),
**#56+#61** (path-rewrite atomic), **#69+#70** (low validator concern but
applied for diligence).

##### Special validator considerations

###### #34 / #60 — duplicate listing reminder

Both edit `## Vocabulary` markdown section. Sequence #34 (C10) before
#60 (C11) to keep markdown deltas additive; running the validator after
each ensures the 9-section invariant
(`markdown_validation.py:11-21`) is intact.

###### #69+#70 bundle — low validator concern

Per `plan-loop-2-05-validator-schedule.md:399-405`:
- `VendorCapabilities` field-shape parity is unaffected by the Vendor
  model column drop.
- Bundle's primary risk is Postgres migration safety (ADR-010), not
  capability contract.
- Validator runs as defence-in-depth (Check 2 + 7a verify-only).

---

### 7.7 Effort & Pacing

[Per Phase 4 Loop 2 adversarial — `review-loop-2-06-effort-adversarial.md`. 727h with cushion.]

#### 7.7.1 Per-domain effort breakdown

Per `review-loop-2-06-effort-adversarial.md:265-272` + Loop 1 master
sequence domain split:

| Domain | Item count | Effort range | Notes |
|---|---:|---|---|
| Issues | 9 | ~50-70h | Chain `#2 → #8 → #28 → #30`; doc-heavy |
| Risks | 4 | ~25-35h | #1, #11, #19, #20 |
| Approvals | 8 | ~70-100h | Includes #34 XL (28-32h escalation) |
| KRI | 9 | ~75-95h | Includes #24+#51 atomic, #45a/b factor |
| Vendor | 7 | ~85-110h | Includes #69+#70 XL bundle (35-42h) |
| Frontend | 19 | ~135-180h | Includes #46 escalation (24-28h), #66 (M-large) |
| Endpoints | 11 | ~70-95h | Admin reorg (#40), #44 router registry, #38 schemas |
| Crosscut | 10 | ~95-120h | Includes #74a XL (26-30h), 3 NEW ADRs |
| **Total** | **77** (or **79** with #76+#77) | **727h ± 5%** | Range 675-753h per Phase 4 Loop 2 |

#### 7.7.2 Per-wave effort breakdown

Mapping per-wave totals from `review-loop-2-06-effort-adversarial.md:388-395`
combined with the 18-week cadence:

| Wave | Weeks | Items | Effort (h) | Description |
|---|---|---|---:|---|
| Wave A | 1-2 | #72, #73, #74a, #10 | 14h | ADRs + P1 quick wins |
| Wave B | 2-3 | #57, #12, #1, #19, #11, #14, #15, #2, #3, #4 | 44h | P1/P2 first wave (FE-soft + risks) |
| Wave C | 4-7 | 30 P2 quick-win items (#5-#7, #18, #20, #21, #25, #26, #29, #33, #35, #36, #41, #47, #48, #50, #52, #64) | 56h | P2 cluster |
| Wave D | 8-11 | #22, #23, #16, #38, #24+#51, #56+#61, #17, #49, #59, #9, #34 (start) | 60h | P3 medium tier + atomic clusters |
| Wave E | 11-13 | #34 (finish), #46, #76 (NEW), #30, #27, #28, #8, #37, #39, #65, #66 (start) | 88h | Hub waves + auth flow |
| Wave F | 14-15 | #45a, #45b, #60, #66 (finish), #40, #42, #43, #44, #58, #63 | 60.5h | Permissions + admin + middleware |
| Wave G (mig) | 16 | #69+#70 + #77 (NEW) | 40h | Migration window (full week) |
| Wave H | 17 | #67, #68, #71 | 56h | Frontend finish |
| Wave I | 18 | #74b, #75, #62, #31, #32, #53, #54, #55 | 28h | Closeout / contingency |

**Wave totals**: 14 + 44 + 56 + 60 + 88 + 60.5 + 40 + 56 + 28 = **446.5h**
core + ~280h overhead (gate runs, code review, validator iteration,
context switching) = **727h total**.

#### 7.7.3 Pacing recommendation

##### STANDARD — 18 dev-weeks @ 40h/week (RECOMMENDED)

Per `review-loop-2-06-effort-adversarial.md:378-395`:

**Match the adversarial total (727h ÷ 40 = 18.2 weeks).** This pace:
- Allows full 2-round reviewer cadence per PR.
- Permits the Postgres rehearsal cycle without operational stress.
- Builds in the 10% tech-debt cushion organically (allocate 1 day/week to
  "discovered work" as it surfaces).
- Aligns with single-sequential-developer constraint without compression.
- 18 weeks ≈ **4.5 calendar months**.

**Suggested cadence**:
- Weeks 1-2: Group A (ADRs #72/#73/#74a) + Group B (P1 quick wins).
- Weeks 3-7: Group C (P2 quick wins, 30 items).
- Weeks 8-11: Group D (P3 medium tier) + #46 phased rollout.
- Weeks 12-13: Group E (#76/#77 auth-flow + FE TS sync).
- Weeks 14-15: Group F start (#45a/b, #60, #66).
- Week 16: #69+#70 single migration window (full week dedicated).
- Weeks 17-18: #68, #71, #74b, contingency / tech-debt overflow.

##### Conservative — 22 dev-weeks @ 33h/week

Per `review-loop-2-06-effort-adversarial.md:397-401`:

For risk-averse execution accounting for vacation, on-call rotations, or
shared reviewer bandwidth. **Buffer: 4 dev-weeks (160h)** absorbs
unforeseen scope creep without sliding the milestone.

##### REJECTED variants

###### Intensive — 8 dev-weeks (~91h/week)

Per `review-loop-2-06-effort-adversarial.md:361-368`:

**REJECTED as unrealistic.** A 91h/week pace double-books a single
developer. Even with parallel reviewer turnaround, the gate stack,
context switching, and Postgres rehearsal are bottlenecks that cannot be
shortened by working harder. **Risk: dev burnout, quality drop,
audit-finding regressions** of the kind flagged in
`memory/feedback_audits_validate_current_code.md`.

###### Aggressive — 12 dev-weeks (~60h/week)

Per `review-loop-2-06-effort-adversarial.md:370-376`:

**REJECTED for sustained execution.** 60h/week is sustainable for ~3
weeks, not 12. After ~weeks 4-5, code review cycles slow as reviewer
attention wanes, validator false-positives compound, and tech-debt
discoveries accumulate. **Risk: audit-debt fatigue; high probability of
needing a second corrective sprint.**

#### 7.7.4 Multipliers applied (727h breakdown)

Per `review-loop-2-06-effort-adversarial.md:277-293`:

| Source | Hours |
|---|---:|
| Loop 1 strict revised baseline | 520 |
| Per-item escalation (#34 M→XL, +20) | +20 |
| Per-item escalation (#74a L→XL, +12) | +12 |
| Per-item escalation (#69+#70 L+→XL, +12) | +12 |
| Per-item escalation (#46 L→L+/XL, +6) | +6 |
| Per-item small (#35 +1) | +1 |
| Gate-run wall time (3.1) | +20 |
| Code review cycles (3.2) | +30 |
| Validator iteration (3.3) | +20 |
| Lock-test interactions (3.4) | +15 |
| Doc-tree audit (3.6) | +1 |
| ADR review (3.7) | +6 |
| Hidden tech debt 10% (3.8) | +52 |
| Context switching (3.9) | +12 |
| **Adversarial total** | **727** |

The dominant single multiplier is **hidden tech debt (+52h)**, which is
the lesson from `memory/feedback_audits_validate_current_code.md`.

---

### 7.8 Open Questions Register

[Per Phase 3 Loop 3 A6/A7 + Phase 4 Loop 1 A8 + Phase 4 Loop 2 B8.]

#### 7.8.1 Resolved (Phase 4 Loop 2)

##### ADR status: Accepted

ADR-007 amendment (#74b), ADR-011 (#72), ADR-012 (#73) are all marked
**Accepted** at landing. Per Loop 1 A8 + Loop 2 B8 confirmation.

##### 5th category: Cross-cutting

The proposed 5th bounded-context category is **Cross-cutting** (covers
items that span multiple bounded contexts but are not adapters). Per
Loop 1 A8 + `plan-loop-1-08-crosscut.md:668-674`.

##### `_orphaned_items`: Workflow-paired with `_identity_access_lifecycle`

The `_orphaned_items` package is workflow-paired with
`_identity_access_lifecycle` for the bounded-context taxonomy. Both
participate in the workflow_pairs TOML row. Per Loop 1 A8 +
`plan-loop-1-08-crosscut.md:655-663`.

##### `_notification_inbox`: Workflow-paired with `_identity_access_lifecycle`

The `_notification_inbox` package is workflow-paired with
`_identity_access_lifecycle`. Per Loop 1 A8 +
`plan-loop-1-08-crosscut.md:655-663`.

##### `_register_listings`: dual-class allowed

The `_register_listings` package is dual-classed (read_shape AND adapters)
under the bounded-context taxonomy. Per Loop 1 A8 +
`plan-loop-1-08-crosscut.md:650-654`.

##### REPORTING_GRACE_DAYS: `_kri_history/constants.py:2` is SSOT

The single source of truth for `REPORTING_GRACE_DAYS` is
`backend/app/services/_kri_history/constants.py:2`. Per Loop 1 A8 +
ADR-012 (`docs/adr/ADR-012-kri-time-series-period-algebra.md`).

##### Mock-auth phrasing: AND of `mock_auth_enabled && debug`

The mock-auth check in `auth/refresh.py` and related modules uses **AND**
logic: `mock_auth_enabled && debug`. Both flags must be true for mock
auth to be active. Per Loop 1 A8.

##### #76 effort: L (12-16h)

Per Loop 2 B8 + `plan-loop-3-07-integration-v2.md:197`. The auth-flow
db.commit migration (#76) is rated **L (12-16h)** for 8 distinct
`db.commit` site migrations.

##### #76 priority: P1 (calendar deadline)

Per Loop 2 B8 + `plan-loop-3-07-integration-v2.md:413`. Auth-flow
migration is **P1** (high priority due to 2026-09-01 expiry).

##### #74a allowlist: "exists OR planned-with-citation"

Per Loop 1 A8 + `plan-loop-2-07-hidden-prereqs.md:551-558`. The #74a
allowlist criterion is "exists OR planned-with-citation" rather than
"exists today". This accommodates the post-#61 count of 32 packages
without requiring #74a to land after #61.

##### Validator partial-removal tolerance: yes, Loop-4 dry-run

Per Loop 2 B8. The validator tolerates partial removal during Loop-4
dry-run (developer commits work-in-progress with partial doc edits).
The pre-commit hook re-runs validator before final commit; partial states
are acceptable mid-development.

##### Soft-edge schema: yes, add to DAG yaml

Per Loop 2 B8. The DAG yaml at
`.planning/audits/_context/plan-loop-2-01-master-dag.yaml` accepts
soft-edge fields:

```yaml
in_domain_deps: ['37', '39']  # hard
in_domain_soft_deps: ['35']   # soft (avoid 18-mock-file rewrite)
```

Per Loop 2 Missing-dep #E recommendation
(`plan-loop-2-07-hidden-prereqs.md:606-622`).

##### 2026-09-01 deadline: feasible at standard 18-week pacing if start ≤ 2026-05-15

Per Loop 1 A8 + Loop 2 B8 cross-check. At standard 18-week pacing
(40h/week), the plan completes at ~2026-09-19 if started 2026-05-15.
Tight but feasible. Earlier start (2026-05-09 = today's date) provides
~2 weeks of buffer. Per Loop 2 §2.3 hot-fix-pause protocol, buffer is
critical.

##### #77 split: yes, #77a (pre) + #77b (post)

Per Loop 2 B8 + `plan-loop-3-07-integration-v2.md:265-291`. Item #77
splits into:

- **#77a (pre)** — FE TS schema reads `vendor.status?: string` (optional)
  before #70 lands; kept backwards-compatible with the pre-migration shape.
- **#77b (post)** — FE TS schema removes `vendor.status` field after
  #70 lands; ratchet to clean shape.

Sequence: #77a → #70 (atomic with #69) → #77b. Hard edge `#70 → #77b`
per `plan-loop-3-07-integration-v2.md:291-292`.

#### 7.8.2 Unresolved (Phase 5+)

Three open questions remain for Phase 5+ resolution:

##### 1. Validator partial-removal dry-run (verify before doc-contract wave)

Phase 5 task: dispatch a fresh agent to perform a Loop-4 dry-run of the
validator against a hypothetical mid-state (e.g. half of #24+#51 atomic
deletes applied, half of doc-contract edits applied). Confirm the
validator reports DETECTED but does not block the commit. If it blocks,
adjust the validator's tolerance for partial states or change the
sequencing.

##### 2. #76 calendar tracking (actual start date determines feasibility)

Phase 5 task: confirm with project lead the actual start date for the
cleanup window. If start ≤ 2026-05-15, 18-week pacing is feasible. If
start > 2026-06-15, tighten pacing OR drop optional items (e.g.
optional 5th bounded-context TOML in #74a, optional cross-references).

##### 3. #77a/#77b ID formalization (decision: split per consistency)

Per Phase 4 Loop 2 — accept the split as ID-stable: #77a and #77b are
distinct items in the v2 master sequence. Phase 5 task: ensure all
references in plan documents use `#77a` and `#77b` as ID strings, NOT
ambiguous `#77`.

---

### 7.9 Appendix — Source Materials Index

[Reference list of all `.planning/audits/_context/*.md` files used to
produce this plan, organized by phase.]

#### 7.9.1 Phase 1 — Codebase exploration (8 files)

Verified-current code state at anchor `1ee872a4`:

- `01-backend-services.md` — backend service inventory (32 packages).
- `02-backend-endpoints.md` — endpoint route table + audit.
- `03-frontend-architecture.md` — FE component tree + diagram.
- `04-architecture-locks.md` — TOML registries + invariant tests.
- `05-adrs-capability-contract.md` — ADR-001..010 + capability catalog.
- `06-test-surface.md` — pytest + vitest test inventory.
- `07-migrations-schema.md` — Alembic chain + schema.
- `08-documentation-surface.md` — README + ADR + planning docs.

#### 7.9.2 Phase 2 — Item recipes (8 files)

Per-domain item proposals:

- `recipe-01-issues.md` — 9 items.
- `recipe-02-risks-and-endpoints.md` — risks + endpoints overlap.
- `recipe-03-approvals.md` — 8 items.
- `recipe-04-kris.md` — 9 items.
- `recipe-05-vendor-migration.md` — vendor migration + #69+#70.
- `recipe-06-frontend-deadcode.md` — FE deletes.
- `recipe-07-frontend-authz.md` — FE authz refactors.
- `recipe-08-crosscut-adrs.md` — cross-cut + ADRs.

#### 7.9.3 Phase 2 verification (24 files)

- `verify-loop-a-01-issues.md` through `verify-loop-a-08-crosscut.md`
  (Loop A — initial verification).
- `verify-loop-b-01-issues.md` through `verify-loop-b-08-crosscut.md`
  (Loop B — adversarial verification).
- `verify-recipe-01-issues.md` through `verify-recipe-08-crosscut-adrs.md`
  (recipe-level verification).

#### 7.9.4 Phase 3 Loop 1 — Domain-level item plans (8 files)

- `plan-loop-1-01-issues.md` — 9 issues items detailed.
- `plan-loop-1-02-risks.md` — 4 risks items.
- `plan-loop-1-03-approvals.md` — 8 approvals items (incl #34 hub).
- `plan-loop-1-04-kris.md` — 9 KRI items (incl #24+#51 atomic).
- `plan-loop-1-05-vendor-quarterly.md` — vendor + quarterly + #69+#70.
- `plan-loop-1-06-frontend.md` — 19 frontend items (incl #46, #66).
- `plan-loop-1-07-endpoints.md` — 11 endpoints items.
- `plan-loop-1-08-crosscut.md` — 10 crosscut items (incl #72, #74).

#### 7.9.5 Phase 3 Loop 2 — Cross-domain analysis (8 files)

- `plan-loop-2-01-master-dag.md` (+ `.yaml`) — DAG of all 77 items.
- `plan-loop-2-02-execution-order.md` — sequenced execution order.
- `plan-loop-2-03-lock-conflict-matrix.md` — lock×item matrix.
- `plan-loop-2-04-doc-touch-matrix.md` — doc×item matrix.
- `plan-loop-2-05-validator-schedule.md` — 16-item validator schedule
  (corrected to 42 in Phase 4).
- `plan-loop-2-06-migration-window.md` — #69+#70 migration window plan.
- `plan-loop-2-07-hidden-prereqs.md` — 7 missing-dep findings.
- `plan-loop-2-08-master-sequence.md` — final sequenced 77 items.

#### 7.9.6 Phase 3 Loop 3 — Synthesis (8 files)

- `plan-loop-3-01-precommit-gates.md` — 7-step gate per item.
- `plan-loop-3-02-ci-strategy.md` — mandatory/advisory CI matrix.
- `plan-loop-3-03-rollback-register.md` — 77-item rollback procedures.
- `plan-loop-3-04-risk-register.md` — 34-risk register (Phase 3).
- `plan-loop-3-05-readme-lock-register.md` — 77-item doc/lock register.
- `plan-loop-3-06-adr-drafts.md` — ADR-007/011/012 drafts.
- `plan-loop-3-07-integration-v2.md` — v2 with #76+#77.
- `plan-loop-3-08-cohesion.md` — final cohesion check.

#### 7.9.7 Phase 4 Loop 1 — Constructive completeness review (8 files)

- `review-loop-1-01-test-gaps.md` — TDD gap audit.
- `review-loop-1-02-sequence.md` — sequencing audit.
- `review-loop-1-03-register-completeness.md` — register completeness.
- `review-loop-1-04-validator-completeness.md` — validator schedule
  expanded 16→44.
- `review-loop-1-05-risk-completeness.md` — risk register expanded 34→62.
- `review-loop-1-06-effort-audit.md` — effort revised 484→520-538h.
- `review-loop-1-07-adr-coherence.md` — ADR cross-references.
- `review-loop-1-08-cohesion-resolution.md` — cohesion resolution.

#### 7.9.8 Phase 4 Loop 2 — Adversarial review (8 files)

- `review-loop-2-01-test-gaps-adversarial.md` — TDD adversarial.
- `review-loop-2-02-sequence-adversarial.md` — sequence adversarial.
- `review-loop-2-03-register-adversarial.md` — register adversarial.
- `review-loop-2-04-validator-adversarial.md` — validator corrected 44→42
  (HIGH 18 + MEDIUM 24).
- `review-loop-2-05-risk-adversarial.md` — risk corrected to 62 final.
- `review-loop-2-06-effort-adversarial.md` — effort revised 538→727h.
- `review-loop-2-07-adr-adversarial.md` — ADR adversarial.
- `review-loop-2-08-cohesion-adversarial.md` — cohesion adversarial.

#### 7.9.9 Phase 7 — Final synthesis (this document, Sections 1-7)

- `final-section-1-header.md` — header + executive summary + methodology + scope + glossary (Section 1).
- `final-section-2-sequence.md` — master sequence + 9 waves + critical path + atomic clusters + hub waves (Section 2).
- `final-section-3-recipes-wave-1-3.md` — per-item recipes for slots 1-28, Waves 1-3 (Section 3).
- `final-section-4-recipes-wave-4-5.md` — per-item recipes for slots 29-58, Waves 4-5 (Section 4).
- `final-section-5-recipes-wave-6-8.md` — per-item recipes for slots 59-79+, Waves 6-8, plus migration window detail (Section 5).
- `final-section-6-adrs.md` — full ADR-011, ADR-012, ADR-007 amendment drafts (Section 6).
- `final-section-7-registers.md` — registers, gate runbook, CI strategy, validator schedule, effort/pacing, open questions, appendix (Section 7, this section).

#### 7.9.10 Memory and project context (3 files)

- `/Users/stefanlesnak/.claude/projects/-Users-stefanlesnak-Antigravity-RiskHubOSS/memory/MEMORY.md`
  — auto-memory index.
- `/Users/stefanlesnak/.claude/projects/-Users-stefanlesnak-Antigravity-RiskHubOSS/memory/feedback_audits_validate_current_code.md`
  — feedback file: re-verify every audit finding against current repo
  state; staleness from recent "Deepen architecture..." commits is the
  dominant failure mode.
- `/Users/stefanlesnak/Antigravity/RiskHubOSS/CLAUDE.md` +
  `/Users/stefanlesnak/Antigravity/RiskHubOSS/AGENTS.md` — project
  guidance and conventions.

---

End of Section 7 — Registers and Supporting References.

[Cross-link to Section 1: top of this document — header + executive summary + methodology + scope + glossary.]
[Cross-link to Section 2: master sequence + 9 waves + critical path + atomic clusters + hub waves.]
[Cross-link to Section 3: per-item recipes Waves 1-3 (slots 1-28).]
[Cross-link to Section 4: per-item recipes Waves 4-5 (slots 29-58).]
[Cross-link to Section 5: per-item recipes Waves 6-8 (slots 59-79+) + migration window detail.]
[Cross-link to Section 6: ADR-011, ADR-012, ADR-007 amendment drafts.]

Phase 6 corrections applied:
- Vocabulary cite `:43-54` (NOT `:119` for #34, NOT `:131` for #60) — Section 7.1 + 7.6.1.
- 3 README paths re-verified as EXISTING on `1ee872a4` (`backend/app/api/README.md`, `tests/backend/pytest/api/v1/README.md`, `frontend/src/contexts/README.md`) — earlier "fabricated/NOT-existing" framing reversed; original cross-references restored — Section 7.1 prefix + 7.1.2.
- #59 single-file create for `_monitoring_response/README.md` — Section 7.1 + 7.1.4.
- `make test-postgres-ci` (NOT `make postgres-up`) — Section 7.4.2.
- Top-level totals: 58 docs, 24 locks, 98+ new files, 48 deletions — Section 7.1.
