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
Section 8.

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
- **Section 8+ — Ancillary references**. Pre-commit gate runbook
  (`plan-loop-3-01-precommit-gates.md`), CI strategy
  (`plan-loop-3-02-ci-strategy.md`), validator schedule
  (`plan-loop-2-05-validator-schedule.md`), migration window plan
  (`plan-loop-2-06-migration-window.md`), doc-touch matrix
  (`plan-loop-2-04-doc-touch-matrix.md`), lock-conflict matrix
  (`plan-loop-2-03-lock-conflict-matrix.md`).

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
