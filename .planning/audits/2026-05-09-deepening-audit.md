# RiskHub Deepening Architecture Audit

| Field | Value |
| --- | --- |
| Date | 2026-05-09 |
| Method | `improve-codebase-architecture` skill, 5-loop orchestration |
| Orchestrator | Claude Opus 4.7 (1M context) |
| Subagent budget | 10 pre-planning + 5 × 8 loop agents = up to 50 Opus subagents |
| Mode | Read-only across the audit; no worktrees; no destructive commands |
| Excluded gates | Playwright E2E and Postgres-marked pytest (per user scope decision) |
| ADR-conflict policy | Surface ADR-contradicting candidates only when friction warrants reopening; mark explicitly |

---

## Table of Contents

0. [Methodology](#0-methodology)
1. [Pre-planning Recon](#1-pre-planning-recon)
2. [Loop 0 — Domain-sliced Candidate Enumeration](#2-loop-0--domain-sliced-candidate-enumeration)
3. [Loop 1 — Adversarial Cross-Domain Re-review](#3-loop-1--adversarial-cross-domain-re-review)
4. [Loop 2 — Empirical Gates + Deletion-Test Stress](#4-loop-2--empirical-gates--deletion-test-stress)
5. [Loop 3 — Cross-cutting Integration & Sequencing](#5-loop-3--cross-cutting-integration--sequencing)
6. [Loop 4 — Final Synthesis](#6-loop-4--final-synthesis)
7. [Final Numbered List of Deepening Opportunities](#7-final-numbered-list-of-deepening-opportunities)

---

## 0. Methodology

This audit applies the `improve-codebase-architecture` skill. Architecture vocabulary is fixed:

- **Module** — anything with an interface and an implementation (function, class, package, slice).
- **Interface** — everything a caller must know (types, invariants, error modes, ordering, config).
- **Implementation** — the code inside.
- **Depth** — leverage at the interface (small interface, large behavior). **Deep** = high leverage. **Shallow** = interface ≈ implementation.
- **Seam** — where an interface lives.
- **Adapter** — a concrete satisfier of an interface at a seam.
- **Leverage** — what callers get from depth.
- **Locality** — what maintainers get from depth (change/bug/knowledge concentrated in one place).

Three operative tests:

1. **Deletion test** — imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.
2. **The interface is the test surface.**
3. **One adapter = hypothetical seam. Two adapters = real seam.**

The audit honors the load-bearing ADRs (`docs/adr/ADR-001..ADR-010`) and the architecture-lock TOML registries under `tests/backend/pytest/architecture/`. Every candidate is annotated with its ADR/lock impact and explicitly marked "consistent with" / "strengthens" / "contradicts ADR-N because…".

The five loops:

1. **Loop 0** — Domain-sliced candidate enumeration (8 slices × 1 Opus agent in parallel).
2. **Loop 1** — Adversarial cross-domain re-review (4 verifier quartiles + 2 gap-finders + ADR conformance + lock awareness).
3. **Loop 2** — Empirical gates (architecture locks, lint+mypy, authz contract, fast pytest) + deletion-test stress.
4. **Loop 3** — Cross-cutting integration (capability impact, transactions, archive, contexts, frontend authz, vocabulary, test-surface, sequencing).
5. **Loop 4** — Final synthesis (tier 1/2/3 ranking, risk register, out-of-scope register, process gaps, vocabulary report).

The final deliverable is a numbered list of deepening opportunities in the skill's exact template (Files / Problem / Solution / Benefits) and a "Which of these would you like to explore?" prompt to drop into the grilling step.

---

## 1. Pre-planning Recon

Ten parallel Opus subagents established the codebase shape and lock landscape before Loop 0. Synthesized facts:

### Codebase shape

- **Backend** — `~115` endpoint .py + `~140` service .py + 27 SQLAlchemy models + 24 Pydantic schema modules. FastAPI 0.129.2 + SQLAlchemy 2.0.46 (asyncio) + Pydantic 2.12.5 + Alembic 1.18.4. Python 3.12-3.13. 28 routers / 215 routes mounted under `/api/v1`. App entry: `backend/app/main.py:390`. Aggregator: `backend/app/api/v1/router.py`.
- **Frontend** — `~93` pages + `~250` components + `~69` services + 11 hooks + 7 contexts + 20 types modules. React 19.2 + React Router 7.13 + TanStack Query 5.90 + Vite 7 + Vitest 4 + Playwright 1.57 + Zod 4.3 + MSAL 5.2.
- **Migrations** — 88 forward-only Alembic revisions per ADR-010 (downgrades raise `NotImplementedError`).
- **Tests** — 34 architecture-lock test files + 9 TOML allowlists; 17 api/v1 integration test files; ~190 root-level pytest files; ~5,791 `def test_` occurrences. Frontend: ~149 unit + ~46 e2e.

### Architecture locks already in place

- ADR-001 capability unification (Capabilities.can; per-row `*Read.capabilities`; useAuthz strict; `validate_authz_capability_contract.py`).
- ADR-002 service-owned transactions (`outbox/store.py` flush-only; `outbox/dispatcher.py` owns commits; endpoint-commit allowlist ratchets to 0; `OutboxService.enqueue` requires non-empty `idempotency_key`; auth-flow exemptions expire 2026-09-01).
- ADR-003 DomainError taxonomy (`NotFoundError`, `ConflictError`, `AuthorizationError`, `AuthenticationError`, `ValidationError`, `PreconditionFailed`); `HTTPException` only at API edge.
- ADR-004 UTC-aware datetime SSOT (`UtcAwareDatetime`; `utc_now()`/`coerce_utc()`; `datetime.utcnow()` BANNED).
- ADR-005 `ArchivableMixin` (`is_archived`, `archived_at`, `archived_by_id`); `ControlStatus.inactive` retained as non-archive lifecycle.
- ADR-006 snapshot equivalence-class testing.
- ADR-007 seven bounded contexts: `_riskhub_config`, `_identity_access_lifecycle`, `_vendor_governance`, `_register_listings`, `_approval_execution`, `_entity_mutation_lifecycle`, `_kri_history`.
- ADR-008 risk threshold SSOT (`get_config_int + ConfigDefaults`; FE `useRiskThresholds()` / `riskScoreVariantClass()`).
- ADR-009 reserved surfaces convention (`_reserved_modules.toml`).
- ADR-010 forward-only Postgres migrations.

TOML allowlists / invariant tests already in force:

| Lock | Path | What it asserts (selected) |
| --- | --- | --- |
| `_archive_allowlist.toml` | `tests/backend/pytest/architecture/` | Files allowed to touch archive-state columns directly |
| `_naming_allowlist.toml` | same | Currently empty (`paths = []`) |
| `_capabilities_all_allowlist.toml` | same | Frozen ordered `__all__` of `_authorization_capabilities/__init__.py` |
| `_endpoint_commit_allowlist.toml` | same | `await *.commit()` sites under `endpoints/auth/` (cap ≤ 8; expires 2026-09-01) |
| `_riskhub_config_service_commit_allowlist.toml` | same | `_riskhub_config` service commit ratchet (≤ 2) |
| `_vendor_governance_service_commit_allowlist.toml` | same | Vendor-governance service commit ratchet (≤ 4) |
| `_get_db_override_whitelist.toml` | `tests/backend/pytest/` | Files allowed to define `dependency_overrides[get_db]` (currently only conftest.py) |
| `_audit_matrix.toml` | `backend/app/core/audit/` | Audit adapter registry |
| `_reserved_modules.toml` | `backend/app/api/v1/endpoints/` | Reserved roles/permissions/entities |

### Friction signals already visible (before Loop 0 ran)

- `~10` backend "compatibility facade" services in `services/<context>_service.py` co-existing with the real implementations in `services/_<context>/`. Endpoints often bypass the facade.
- 4 frontend form re-export shims (`RiskForm.tsx`, `ControlForm.tsx`, `KRIForm.tsx`, `VendorForm.tsx`).
- 3 authz idioms (`require_permission`, `require_business_permission`, bespoke `_require_*`) plus ~14 endpoints whose `Depends` only authenticates and pushes authz into the body.
- No formal repository layer; data access is mixed inline across service modules.
- Vendor-link semantics split across `vendor_links.py`, `risks/vendor_links.py`, `kris/linked_vendors.py`.
- 3 endpoint files declare Pydantic models inline (`health.py`, `preferences.py`, `riskhub_questionnaires.py`) — bypass `app/schemas/`.
- **Architecture-lock tests are not wired into CI** — local-only `make test-architecture-locks`. Process seam, not a code seam.
- `usePermissions.ts:4-20` aliases 6 fields off `useAuthz()` — competes with the strict-capabilities path.
- 4 BusinessRouteGuards near-identical in `BusinessRouteGuards.tsx:18-36`.
- Inconsistent Pydantic model placement and inconsistent router prefix conventions.

### Domain vocabulary

No consolidated `CONTEXT.md`. Domain language lives in three places:
- `docs/BUSINESS_LOGIC.md` — ~1,000 lines, no top-level term index, but the de-facto ubiquitous-language source.
- `docs/GLOSSARY.md` — Czech/English UI translation glossary, **not** a domain glossary.
- `docs/security/authorization-capability-contract.md` — a small "Vocabulary" section for actor/resource/action/guard/policy/response capability/frontend gate/access scope.

Terms with drift / ambiguity:

- **Owner** — used inconsistently for `owner_id` (Risk), `control_owner_id` (Control), `reporting_owner_id` (KRI), `manager_id` (Department); not unified.
- **Capability** — three meanings: route-level `Capabilities.can(action, resource)`, per-row `*Read.capabilities`, and the `capability-catalog.json` field shape.
- **archived vs inactive** — Vendor archive truth is `is_archived=true`; `status='inactive'` persists as legacy alias; `ControlStatus.inactive` is non-archive lifecycle (per ADR-005). Sources of confusion.
- **Source (for Issues)** — `manual / audit / control_execution / kri_breach`; relationship between contextual source vs `IssueLink` is subtle.
- **Orphan**, **Break-glass**, **Priority risk vs high-risk**, **Scenario** — used in code without canonical glossary entries.

### ADR gaps

These 8 areas have no governing ADR (and recur as friction in Loop 0/1):

1. Frontend architecture (no ADR; per-row capabilities only mentioned in passing).
2. API versioning (no decision recorded for `/api/v1/` prefix policy).
3. Authentication / session model (no ADR for token model, session lifetime, mock-auth boundary).
4. Audit-log entity shape, retention, redaction.
5. Outbox / event-bus (subsection of ADR-002, but no standalone record).
6. KRI history / time-series (period algebra, grace constants, breach detection).
7. Notification transport, template ownership, delivery guarantees.
8. Internationalization / L10n.

### CI/process gaps

- `make test-architecture-locks` is local-only; not wired into any GitHub workflow or pre-commit hook.
- Black is in pre-commit but never invoked by CI.
- `maintenance-governance.yml` backend lint job is `continue-on-error: true`.
- `release-parity-pr.yml` is `workflow_dispatch` only despite the filename.
- Mypy is NOT strict (no `strict = True`); only `app/` is type-checked.
- `changed_quality_targets.py` exists in `scripts/tools/` but is unreferenced by any Make target, workflow, or pre-commit hook.

---

## 2. Loop 0 — Domain-sliced Candidate Enumeration

Eight Opus agents in parallel. Each produced a numbered list with the skill's template (Files / Problem / Solution / Benefits / Deletion test / Adapter count / Caller count / ADR-lock impact) plus a "✅ Verified clean" subsection. **83 total candidates surfaced.**

### 2.1 Slice 1: Risk register

**1. `risk_questionnaire_service.py` re-export facade**
- **Files**: `backend/app/services/risk_questionnaire_service.py:1-83`; quote: `"""Compatibility exports for risk questionnaire business rules."""`; 41 names re-exported from `_risk_questionnaires`.
- **Problem**: Pure SHALLOW compat facade — Interface (41 names) is identical to the underlying package's public surface. Depth ≈ 0; Adapter renames the import path only.
- **Solution**: Pick a canonical import home (the package or the service file) and migrate ~11 callers. Delete the indirection.
- **Benefits**: One less file in the dependency graph; better Locality; reduces grep noise.
- **Deletion test**: MOVES.
- **Adapter count**: 1.
- **Caller count**: 11.
- **ADR/lock impact**: ADR-007 — consistent with bounded-context naming; not in any TOML allowlist.

**2. `risks/__init__.py` and `risks/crud/__init__.py` two-level router compositors**
- **Files**: `backend/app/api/v1/endpoints/risks/__init__.py:1-8`; `risks/crud/__init__.py:1-24`. Quote: `router.include_router(detail.router) ... update.router) ... archive.router) ... restore.router)`.
- **Problem**: Each CRUD verb owns its own `APIRouter()` then bubbles back via two nested `__init__.py` files. No middleware/auth/prefix is applied at the seam — HYPOTHETICAL_SEAM.
- **Solution**: Collapse to a single `risks/router.py` that imports decorated handlers and registers them.
- **Benefits**: One file to read the route surface; eliminates the "where does the prefix come from?" puzzle.
- **Deletion test**: HYPOTHETICAL_SEAM.
- **Adapter count**: 1.
- **Caller count**: 1.
- **ADR/lock impact**: No architecture-lock TOML pins this layout.

**3. Inconsistent transaction-boundary idiom across risk CRUD**
- **Files**: `risks/crud/create.py:84` `await commit_service_transaction(db)`; `crud/restore.py:62` same; `crud/update.py:29` delegates to `update_risk_detail`; `crud/archive.py:28` delegates; `_entity_mutation_lifecycle/direct_apply.py:111` `await db.commit()`; `archive_plans.py:118` same.
- **Problem**: Three commit idioms in the same lifecycle layer. The seam between API and service layer leaks: callers must know which path commits where. Locality is poor.
- **Solution**: Move create/restore commits into `_entity_mutation_lifecycle` siblings; swap bare `db.commit()` for `commit_service_transaction` to keep the gate uniform.
- **Benefits**: One place to debug commit/rollback; thinner endpoints; enables an architecture-lock to assert "no commit in endpoints/risks".
- **Deletion test**: REAL_SEAM.
- **Adapter count**: 2 (endpoint commit + service commit; the inconsistency *is* the smell).
- **Caller count**: 4 verb endpoints + 1 archive_plans + 1 direct_apply.
- **ADR/lock impact**: **Contradicts ADR-002** because create/restore endpoints commit directly. Obvious place to add an `_endpoint_commit_allowlist.toml` tightening.

**4. `_shared.validate_risk_type` duplicated in service-layer policy**
- **Files**: `endpoints/risks/crud/_shared.py:8-20` (raises `HTTPException`); `services/_entity_mutation_lifecycle/policy.py:29-39` (raises `ValidationError`).
- **Problem**: Two functions with identical bodies; differ only in raised exception class. SHALLOW: Interface and Implementation match exactly except for error class — that's an Adapter concern.
- **Solution**: Have the policy version raise `ValidationError`; let the global FastAPI exception handler translate to 400. Delete the endpoint copy.
- **Benefits**: Risk-type validation has one definition; ADR-003 DomainError gets its real win.
- **Deletion test**: MOVES.
- **Adapter count**: 1.
- **Caller count**: 1.
- **ADR/lock impact**: Consistent with ADR-003 (improves domain-error coverage).

**5. `riskOverviewHelpers.groupLinkedControls` is a pure-fn microtest helper**
- **Files**: `frontend/src/components/risks/detail-overview/riskOverviewHelpers.ts:3-11`. Quote: `return { activeControls: linkedControls.filter(... !== 'draft' && ... is_archived !== true) ...`.
- **Problem**: 9-line helper with three trivial filter predicates, extracted into its own file with its own test. Depth ≈ 0; the test value is "I tested .filter() works." If the predicates were wrong, the bug surface is in `RiskDetailOverviewTab.tsx`.
- **Solution**: Inline three `useMemo` filters; delete helper + dedicated test. Or lift predicates into a shared `controlStatus.ts` if the taxonomy keeps growing.
- **Benefits**: Removes pure-fn microtest; attention lands at the real bug locus.
- **Deletion test**: MOVES.
- **Adapter count**: 1.
- **Caller count**: 1 component; 1 test file.
- **ADR/lock impact**: None.

**6. `id_generation.generate_risk_id_code` lives outside `crud/` despite being a `crud/create` private utility**
- **Files**: `endpoints/risks/id_generation.py:1-42`; `endpoints/risks/__init__.py:3` re-exports; `endpoints/risks/crud/create.py:19` imports from `..id_generation`.
- **Problem**: Single private helper invoked by exactly one endpoint, sitting at the parent package level and re-exported to nobody. The retry loop using it lives in create.py — half the algorithm.
- **Solution**: Move to `crud/create.py` (or `crud/_id_generation.py`). Drop the package-level re-export.
- **Benefits**: ID-generation and retry policy co-locate.
- **Deletion test**: MOVES.
- **Adapter count**: 1.
- **Caller count**: 1.
- **ADR/lock impact**: None.

**7. `RiskBase` schema and `Risk` model duplicate field shape with subtle drift**
- **Files**: `schemas/risk.py:52-82` `RiskBase`; `models/risk.py:53-118` ORM; `schemas/risk.py:91-108` `RiskUpdate` repeats every field optionally.
- **Problem**: Risk field shape declared in three places. Each new field requires three edits; bug class: any column added is silently absent from RiskUpdate.
- **Solution**: Generate `RiskUpdate` programmatically from `RiskBase` via a make-optional helper. Or accept the duplication but add a contract test asserting RiskUpdate fields == RiskBase fields.
- **Benefits**: Locality of change; eliminates a class of silent bugs.
- **Deletion test**: REAL_SEAM (the model/schema/mapper boundary is real; fix is a generation rule or test, not deletion).
- **Adapter count**: 3.
- **Caller count**: many.
- **ADR/lock impact**: Consistent with ADR-006 snapshot tests; new lock could mirror `_archive_allowlist.toml` style.

**8. `risk_to_summary` mapper uses backend-specific `is_archived`/`status` enum coupling**
- **Files**: `backend/app/api/mappers/risk.py:32-57`; `_register_listings/risks.py:444`.
- **Problem**: Mapper does trivial attribute copying with one enum coercion and a `has_breach` reduction. Interface ≈ Implementation. Sits in `mappers/risk.py` while the only meaningful adapter logic lives in the calling service.
- **Solution**: Either fold linked-vendor visibility filtering and capability resolution into the mapper, or inline via `RiskSummary.model_validate(risk, ...)` and delete the mapper.
- **Benefits**: Forces a design choice about presentation ownership.
- **Deletion test**: HYPOTHETICAL_SEAM as currently shaped.
- **Adapter count**: 1.
- **Caller count**: 2.
- **ADR/lock impact**: ADR-001 capabilities pass-through correct here.

**9. `RisksPage` ↔ `useRisksPageState` ↔ `risksPagePresentation` triangle**
- **Files**: `pages/RisksPage.tsx:12-144`; `pages/risks/useRisksPageState.ts:1-250`; `pages/risks/risksPagePresentation.ts:1-151`.
- **Problem**: State hook exposes ~40 named values; the page passes ~30 straight to four child components. Wide seam, low Leverage (one consumer). Bouncing among three files required to add a single filter.
- **Solution**: Either narrow the hook return shape to grouped per-component blocks, or merge into one file.
- **Benefits**: Adding a filter touches 1-2 files.
- **Deletion test**: MOVES.
- **Adapter count**: 1.
- **Caller count**: 1.
- **ADR/lock impact**: None.

#### ✅ Verified clean (Slice 1)

- `endpoints/risks/crud/list.py:48-86` — assembles `build_list_context` + `RiskListingCriteria`; thin but the Adapter is real (legacy filters → CollectionQuery), Caller-Count = 1 with reusable downstream.
- `services/_register_listings/risks.py:208-460` — `plan_risk_listing` is genuinely Deep: visibility, vendor join, sort dispatch, group resolution, two serializer paths.
- `services/_authorization_capabilities/risks.py:21-103` — one cohesive policy hub computing 19 capability flags from preloadable inputs; ADR-001 home.
- `endpoints/risks/control_links.py:20-58` — three real seams (visibility 404, monitoring serializer, control_execution service); not shallow.
- `endpoints/risks/vendor_links.py:15-46` — anti-enumeration 404 + vendor visibility filtering is non-trivial policy.
- `services/_entity_mutation_lifecycle/policy.py:136-154` — `prepare_risk_update` sequences four checks with cross-cutting policy; Deep.
- `services/_entity_mutation_lifecycle/approval_plans.py:62-151` — `create_risk_edit_approval_if_required` carries policy_scenario, sensitivity, priority, dedupe, snapshot — earns 90 lines.
- `frontend/src/lib/riskScoreTheme.ts:1-60` — ADR-008 SSOT for thresholds; 5 callers.
- `frontend/src/components/risk-form/riskFormWorkflow.ts:102-242` — `useRiskFormWorkflow` orchestrates create-vs-update, approval branching; Deep state machine.
- `endpoints/risks/id_generation.py:7-42` — algorithm itself is non-trivial; only the placement is the smell (#6).

### 2.2 Slice 2: Controls + Executions + Monitoring

**1. `_monitoring_response` shim re-export adds zero value**
- **Files**: `backend/app/api/v1/endpoints/_monitoring_response.py:1-26`. Quote: `"""Compatibility Adapter for monitoring response projection helpers."""`; pure `from app.services._monitoring_response import (...)` re-exports.
- **Problem**: Pure pass-through Adapter. INTERFACE ≈ IMPLEMENTATION; every name re-exported verbatim.
- **Solution**: Delete the shim; let endpoints import directly from `app.services._monitoring_response`.
- **Benefits**: One fewer file; clearer that `serialize_control_read` lives in services.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 1.
- **Caller count**: ~14 endpoint files.
- **ADR/lock impact**: Consistent with ADR-006/009.

**2. `_control_execution/monitoring.py` is a one-liner wrapper**
- **Files**: `backend/app/services/_control_execution/monitoring.py:9-11`. Quote: `return await load_monitoring_response_context(db, now=now, today=now.date())`.
- **Problem**: 3-line body. SHALLOW. Adapter count = 1. Sole caller: `link_governance.py` (3 sites).
- **Solution**: Inline the two-line idiom; or default `now` in `load_monitoring_response_context`.
- **Benefits**: Fewer indirection hops.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 1.
- **Caller count**: 3.
- **ADR/lock impact**: Consistent with ADR-002/004.

**3. `_control_execution/capabilities.py` is a 3-line re-export**
- **Files**: `backend/app/services/_control_execution/capabilities.py:1-3`. Quote: `from app.services.authorization_capabilities import control_capabilities`.
- **Problem**: Pure re-export. 0 production callers; the `__init__.py` already imports `control_capabilities`, but real callers go directly to `app.services.authorization_capabilities`.
- **Solution**: Delete the file and the line in `__init__.py`. Drop from `_control_execution.__all__`.
- **Benefits**: Removes a misleading "controls authz lives here" signal.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 1.
- **Caller count**: 0 production.
- **ADR/lock impact**: Consistent with ADR-001.

**4. Two parallel "log a control execution" entry points produce different shapes**
- **Files**: `endpoints/controls/executions.py:18-31` (`POST /controls/{id}/executions`, returns `ControlExecutionRead`); `endpoints/executions.py:74-90` (`POST /executions`, returns `schemas.ControlExecution`).
- **Problem**: Two endpoints, two service entry points, two response schemas, same domain operation. Callers must remember which URL hands back which shape.
- **Solution**: Pick one canonical create path (the projection-based one is richer). The control-scoped router calls the same service.
- **Benefits**: Locality; one schema for client codegen.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 2 (real seam, redundantly so).
- **Caller count**: Frontend `ExecutionLogModal` uses `controlApi.logExecution`; executions list page uses the global one.
- **ADR/lock impact**: Consistent with ADR-002.

**5. `serialize_control_brief_for_link` exported but only-internally used**
- **Files**: `endpoints/_monitoring_response.py:8` (re-exported); `services/_monitoring_response.py:171-182`.
- **Problem**: Public callable used only internally by `serialize_control_risk_link`. Premature seam.
- **Solution**: Make module-private (`_serialize_control_brief_for_link`); drop from `__all__` and shim.
- **Benefits**: Smaller public surface.
- **Deletion test**: HYPOTHETICAL_SEAM.
- **Adapter count**: 1.
- **Caller count**: 1 internal.
- **ADR/lock impact**: None.

**6. Dual link-load helpers `load_link_for_control` / `load_link_for_risk` are shape-identical**
- **Files**: `services/_control_execution/link_policy.py:22-45`. Quote: `.where(ControlRiskLink.control_id == control_id).where(ControlRiskLink.risk_id == risk_id)` vs the other order.
- **Problem**: Two functions doing the same SELECT in different argument orders. Same for `reload_link_for_control_response` vs `reload_link_for_risk_response`.
- **Solution**: Collapse to `load_link(db, *, control_id, risk_id)` and `reload_link(db, link_id)`.
- **Benefits**: Half the surface.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 2 cosmetic pairs.
- **Caller count**: 2 each.
- **ADR/lock impact**: Consistent with ADR-002.

**7. `linked_risk_names_for_visible_ids` returns risks' `process` instead of `name`**
- **Files**: `services/_control_execution/workflow.py:145-156`. Quote: `names.append(risk.process)`.
- **Problem**: Function name promises risk *names*; implementation returns `risk.process`. Truth-in-naming bug.
- **Solution**: Rename to match implementation, OR change to `risk.name`/`risk.risk_id_code`. Confirm against `BUSINESS_LOGIC.md`.
- **Benefits**: Removes a confusing observable.
- **Deletion test**: REAL_SEAM (called from list and read projections).
- **Adapter count**: 2.
- **Caller count**: 2.
- **ADR/lock impact**: Consistent ADR-007/009.

**8. Frontend `ControlForm.tsx` shim re-export**
- **Files**: `frontend/src/components/ControlForm.tsx:1`. Quote: `export { ControlForm } from './control-form/ControlFormContainer';`.
- **Problem**: One-line re-export. Pure Adapter. Per Loop-1 verification: 2 prod + 3 test callers (correcting Loop-0's "0 detected callers" miscount).
- **Solution**: Delete shim; migrate 5 imports.
- **Benefits**: Removes a misleading "this is the canonical entry" signal.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 1.
- **Caller count**: 5 (2 prod + 3 test).
- **ADR/lock impact**: None.

**9. `controlFormUtils.ts` is two unrelated tiny helpers**
- **Files**: `frontend/src/components/control-form/controlFormUtils.ts:3-12`. Quote: `export function formatFrequencyLabel(value: string)`; `export function getControlFormErrorKey(error: unknown, ...)`.
- **Problem**: Grab-bag module with two unrelated 1–4 line utilities. Mixed concerns under a generic name.
- **Solution**: Move `formatFrequencyLabel` next to the only step that renders it; `getControlFormErrorKey` next to the workflow that owns submission errors (or fold into `apiClient.toUiMessageKey`).
- **Benefits**: Eliminates a generic-utils sink.
- **Deletion test**: CONCENTRATES (TRIVIAL).
- **Adapter count**: 1.
- **Caller count**: ~2.
- **ADR/lock impact**: None.

**10. Control monitoring concept is split across three sibling packages**
- **Files**: `services/_monitoring_status/controls.py:37-46` (facts); `services/_monitoring_status/queries.py:39-75` (status filter); `services/_monitoring_response.py:115-128` (`build_control_monitoring_fields`); `services/_control_execution/monitoring.py:9-11` (load context wrapper).
- **Problem**: One domain concept ("is this control's monitoring fresh, failed, passed, etc.") spread across three packages. Readers hop three modules to mentally reconstruct the rule. New monitoring facts touch all three.
- **Solution**: Consolidate into a `monitoring/` package with `controls.py`, `kris.py`, `serialize.py`, `queries.py`.
- **Benefits**: One mental model; one place to add a new monitoring status.
- **Deletion test**: MOVES.
- **Adapter count**: 3 packages.
- **Caller count**: many.
- **ADR/lock impact**: Consistent with ADR-006; may need `_naming_allowlist.toml` updates.

#### ✅ Verified clean (Slice 2)

- `services/_control_execution/access.py` — focused, single-purpose.
- `services/_control_execution/projection.py` — meaty projection logic with real visibility filtering.
- `services/_control_execution/workflow.py` — `create_execution_record` does real work.
- `models/control.py:39-65` — `ControlStatus` docstring correctly explains `inactive` retention per ADR-005.
- `endpoints/controls/_helpers.py` — three real helpers, all used by ≥1 CRUD module.
- `frontend/src/lib/monitoringStatus.ts` — table-driven enum metadata.
- `frontend/src/lib/executionResult.ts` — clean lookup table.
- `frontend/src/components/control-form/useControlFormWorkflow.ts` — owns real state + submit + link-side-effect.
- `frontend/src/types/control.ts` — only mild duplication; not worth a rewrite.
- `services/_monitoring_status/types.py` — pure dataclass/enum file; load-bearing for ADR-006.

### 2.3 Slice 3: KRIs (history + breaches + deadlines)

**1. `KRIHistoryService` static-method facade is a pass-through wrapper**
- **Files**: `services/_kri_history/service.py:32-120`; `services/kri_history_service.py:1-15`. Quote: `_end_of_month = staticmethod(_end_of_month)`.
- **Problem**: Eight methods either wrap a `staticmethod(...)` re-bind or `await _internal_func(**same_args)`.
- **Solution**: Drop the class; let callers import `record_value`, `get_history`, `apply_history_correction`, `period_bounds_for_date`, `due_date` directly.
- **Benefits**: Locality; LEVERAGE (drop one whole layer of mocks); fewer architecture-lock entries.
- **Deletion test**: CONCENTRATES (per Loop 1 reverification — 12 staticmethod re-binds, not 8).
- **Adapter count**: 1.
- **Caller count**: ~6.
- **ADR/lock impact**: ADR-007 — consistent with module home.

**2. `submission.py` is a dead alias module**
- **Files**: `services/_kri_history/submission.py:1-22`.
- **Problem**: Underscore-prefixed wrapper that just forwards to `approval_intake.create_kri_submission_approval`. Zero production callers; only architecture-lock test references it.
- **Solution**: Delete; remove its line from architecture-lock test and README.
- **Benefits**: −1 file, −1 indirection.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 1 (architecture test only).
- **Caller count**: 0 production.
- **ADR/lock impact**: Touches `test_architecture_deepening_contracts.py:998`. Lock encodes dead code as a seam.

**3. `value_application.py` is a re-export shim with locked tripwires**
- **Files**: `services/_kri_history/value_application.py:1-7`; `tests/backend/pytest/test_architecture_deepening_contracts.py:976-1000`.
- **Problem**: 6-line barrel re-exporting three names from `direct_application`. Callers (`_register_listings/kris.py`, `_entity_mutation_lifecycle/direct_apply.py`, `kris/linked_vendors.py`) import via the shim.
- **Solution**: Have call sites import directly from `direct_application`; delete the shim and corresponding lock entries.
- **Benefits**: −1 indirection layer; −5 architecture-lock asserts.
- **Deletion test**: HYPOTHETICAL_SEAM.
- **Adapter count**: 1.
- **Caller count**: 4.
- **ADR/lock impact**: Lock test would shrink.

**4. `linked_vendors.py` endpoint barrel re-exports the re-export**
- **Files**: `backend/app/api/v1/endpoints/kris/linked_vendors.py:1-5`. Quote: `from app.services._kri_history.value_application import visible_linked_vendors`.
- **Problem**: 5-line API module re-exporting one helper. Forms a 4-hop chain `endpoint → linked_vendors → value_application → direct_application`.
- **Solution**: Inline; let endpoints depend directly on `direct_application`.
- **Benefits**: Removes a 4-hop chain.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 1.
- **Caller count**: 4.
- **ADR/lock impact**: None.

**5. `correction_plans.py` is a 1-line dataclass with 1-line builder consumed only by an architecture test**
- **Files**: `services/_kri_history/correction_plans.py:7-14`; `tests/backend/pytest/test_architecture_deepening_contracts.py:956-962`.
- **Problem**: Pure microtest scaffolding; no production importers.
- **Solution**: Delete the file and the lock test that pins it. If a correction-plan abstraction is desired later, build it for `approval_intake.create_kri_history_correction_approval`.
- **Benefits**: Removes a fake seam.
- **Deletion test**: HYPOTHETICAL_SEAM.
- **Adapter count**: 1.
- **Caller count**: 0 production.
- **ADR/lock impact**: Lock would shrink.

**6. `_kri_history/__init__.py` docstring claims a public-API contract that diverges from reality**
- **Files**: `services/_kri_history/__init__.py:1-5`; `services/kri_history_service.py:1-15`.
- **Problem**: Documented "internal" boundary breached widely — ~15 production modules import from `_kri_history.*`.
- **Solution**: Either expose a public API in `kri_history_service.py` and rewrite the underscore importers, or drop the docstring claim and admit `_kri_history` is the bounded-context surface (per ADR-007).
- **Benefits**: Truth-in-naming.
- **Deletion test**: MOVES.
- **Adapter count**: 2.
- **Caller count**: ~12 underscore importers.
- **ADR/lock impact**: ADR-007 — consistent with admitting `_kri_history` as the home.
- **Loop 1 status**: Marked PRE-EXISTING-AND-OUT-OF-SCOPE — refactor magnitude (~15 files) too large for audit-repair scope.

**7. `crud/overdue.py` and `crud/due_soon.py` duplicate department filtering logic**
- **Files**: `endpoints/kris/crud/overdue.py:14-50`; `endpoints/kris/crud/due_soon.py:14-51`. Quote: `if dept_ids is not None: filtered = [item for item in overdue if item.get("department_id") in dept_ids]`.
- **Problem**: Byte-identical post-filter blocks. The `list[dict]` shape forces in-Python filtering after the service call.
- **Solution**: Push department scope into `get_overdue_kris`/`get_due_soon_kris` queries (or shared helper); type the response with a `KRIDeadlineRow` schema.
- **Benefits**: DB-side filtering; locality of department-scope rules.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 1.
- **Caller count**: 2.
- **ADR/lock impact**: Consistent with ADR-001/009.

**8. `_int_sort_value` helper is a 2-line shim around `dict.get`** [Loop 1: FALSE — local utility, not shim]

**9. `KRIForm.tsx` is a 2-line re-export shim with an over-tight ESLint rule**
- **Files**: `frontend/src/components/KRIForm.tsx:1-2`; `frontend/src/components/kri-form/KRIFormContainer.tsx:20-229`.
- **Problem**: Barrel preserving an old import path. Per-file ESLint `max-lines: 25, complexity: 2` is enforcement of triviality, not architecture.
- **Solution**: Move all importers to `KRIFormContainer` and delete the shim, OR remove the per-file ESLint rule.
- **Benefits**: One canonical name.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 1.
- **Caller count**: ~6.
- **ADR/lock impact**: None.

**10. `kriForm.selectors.ts` is a stack of pure single-call adapters** [Loop 1: FALSE — file contains 7 meaningful pure functions, real selector module]

**11. `kriFormWorkflow.ts` is a 14-line module with one fn used in one place**
- **Files**: `frontend/src/components/kri-form/kriFormWorkflow.ts:1-14`.
- **Problem**: Pure-function microhelper with one production caller and a microtest.
- **Solution**: Inline into `useKriModalState.ts` or merge with `kriForm.utils.ts`.
- **Benefits**: −1 file.
- **Deletion test**: CONCENTRATES (TRIVIAL).
- **Adapter count**: 1.
- **Caller count**: 1.
- **ADR/lock impact**: None.

**12. `kri_deadline_service.py` reaches into `KRIHistoryService` for static date helpers — leaky seam**
- **Files**: `services/kri_deadline_service.py:62-81`; `services/_kri_history/service.py:35-44`. Quote: `_, current_period_end = KRIHistoryService.period_bounds_for_date(today, kri.frequency)`.
- **Problem**: Two indirections to reach a pure function. No ADR governs time-series semantics for KRI deadlines; period algebra is duplicated between `_kri_history.constants` and `ConfigDefaults`.
- **Solution**: Import `period_bounds_for_date`, `latest_closed_period_for_date`, `due_date` directly from `_kri_history.periods`. Consider an ADR for KRI period/grace SSOT.
- **Benefits**: Locality (one home for period algebra); reveals duplication between the two grace constants.
- **Deletion test**: MOVES.
- **Adapter count**: 2 (real seam — KRIDeadlineService is a separate cron-driven consumer).
- **Caller count**: 1.
- **ADR/lock impact**: No ADR governs KRI time-series. Recommend new ADR or extension of ADR-007.

**13. `_kri_history/__init__.py` import order vs `kri_history_service.py` re-export creates duplicate "facades"**
- **Files**: `services/kri_history_service.py:8-14`; `services/_kri_history/service.py:32-44`.
- **Problem**: Two layers both claim to be the public facade — module + class — both pure pass-throughs over `_kri_history`.
- **Solution**: Delete one (preferably the class — see #1). Keep one facade or none.
- **Benefits**: Cuts maintenance fan-out 3→1.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 2.
- **Caller count**: split ~50/50.
- **ADR/lock impact**: ADR-007 — consistent. **Loop 1**: DUPLICATE-OF-S3.1.

#### ✅ Verified clean (Slice 3)

- `services/_kri_history/recording.py` (`record_value`) — coherent with real period/window/breach logic.
- `services/_kri_history/corrections.py` (`apply_history_correction`) — proper transactional flow.
- `services/_kri_history/governance.py` (mutation-snapshot helpers) — three real consumers; REAL_SEAM.
- `services/_kri_history/approval_intake.py` — non-trivial business logic.
- `services/_authorization_capabilities/kris.py` — dense capability matrix; governs frontend invariants.
- `endpoints/kris/crud/breaches.py` — endpoint-only filtering after listing; no abstraction overreach.
- `services/kri_deadline_decisions.py` — clean pure-function plan builders.
- `services/_kri_history/periods.py` — true SSOT for period algebra.

### 2.4 Slice 4: Issues (workflow + exceptions + remediation)

**1. `issue_workflow_service.py` facade is a SHALLOW re-export shim**
- **Files**: `services/issue_workflow_service.py:1-5`; `services/_issue_workflow/service.py:33-41`; `_issue_workflow/__init__.py:1-3`.
- **Problem**: Three modules cooperate to deliver one class whose only behavior is forwarding eight free functions as staticmethods. `_issue_workflow.execution` even imports the facade just to re-call its own siblings — circular indirection.
- **Solution**: Drop the class; have callers import the eight functions from `_issue_workflow.lifecycle`.
- **Benefits**: Removes a layer of dispatch; transitions/closure/exceptions become the obvious unit of analysis.
- **Deletion test**: HYPOTHETICAL_SEAM.
- **Adapter count**: 3.
- **Caller count**: 1 (only `execution.py`).
- **ADR/lock impact**: `test_w12_issue_status_automation_lock_red.py:40` excludes `/_issue_workflow/`, so collapsing is safe.

**2. Triple-duplicated `_get_issue_with_relations` / `_get_*_issue_or_404`**
- **Files**: `endpoints/issues/_shared/loading.py:22-66` and `services/_issue_workflow/loading.py:22-70` define the same selectinload graph and 404 helpers.
- **Problem**: Same SQL/permission logic in two places. Forks will diverge silently. Used by 4 endpoint files + 7 service call sites.
- **Solution**: Keep one canonical loader in `_issue_workflow/loading.py`; have `_shared/__init__.py` import from there.
- **Benefits**: One eager-load graph = one source of N+1 truth.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 2 modules + 3 underscored aliases.
- **Caller count**: 11.
- **ADR/lock impact**: No TOML change.

**3. Triple-duplicated `_resolve_vendor_department_and_access` / `issue_link_department_ids`**
- **Files**: `endpoints/issues/_shared/links.py:11-81` (full impl), `services/_issue_workflow/source_validation.py:45-114` (full impl), `services/_issue_register/source_mutation.py:28-97` (full impl).
- **Problem**: Three byte-identical `Vendor + outsourcing_owner` SELECTs and three identical `issue_link_department_ids` walks. `source_validation.py` imports from `_issue_register.source_mutation` *then* re-defines the same function locally.
- **Solution**: Keep the implementation in `_issue_register/source_mutation.py`; have other modules import from there.
- **Benefits**: ~80 lines deleted; one place to add archived-vendor / scope rules.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 3.
- **Caller count**: 3.
- **ADR/lock impact**: None.

**4. Dead `_notify_issue_assigned`/`_notify_exception_*` helpers**
- **Files**: `endpoints/issues/_shared/notifications.py:24,43,80`; tests at `test_issue_workflow.py:679,685`.
- **Problem**: Zero production callers; the registered transport is the outbox plan (`_issue_workflow/outbox.py`). Tests hold them alive.
- **Solution**: Delete the helpers; rewrite tests to assert outbox enqueues (the real seam).
- **Benefits**: Removes a phantom code path; ~80 lines gone.
- **Deletion test**: REAL_SEAM (outbox is the seam).
- **Adapter count**: 1 file, 3 functions.
- **Caller count**: 0 production, 2 tests.
- **ADR/lock impact**: ADR-002 outbox lock is the actual contract.

**5. Three state machines smeared across `transitions.py`, `assignment.py`, `closure.py`, `remediation.py`, `exceptions.py`** [Loop 1: FALSE — there is ONE `ISSUE_TRANSITIONS` dict and ONE `REMEDIATION_TRANSITIONS` dict, both centralized in `transitions.py`. Status-literal checks elsewhere are not separate FSMs.]

**6. `update_plans.py` re-implements `source_type` value coercion**
- **Files**: `_issue_workflow/update_plans.py:19-21`; `_issue_register/linked_context.py:103-104`; `_issue_register/source_mutation.py:24-25`; `transitions.py:15-17`.
- **Problem**: SHALLOW utility duplicated 4× ("Enum-or-str → str"). `CONCRETE_SOURCE_TYPES = {"control_execution", "kri_breach"}` also lives nowhere else.
- **Solution**: One `app/models/issue.py` (or `_issue_register/constants.py`) helper + one constant.
- **Benefits**: Single grep target; canonical home for source_type taxonomy.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 4.
- **Caller count**: ~12.
- **ADR/lock impact**: None.

**7. `frontend/src/lib/issueQueryKeys.ts` shallow but earns its keep**
- **Files**: `frontend/src/lib/issueQueryKeys.ts:1-17`; callers in `useIssueDetail.ts:16`, `useIssueHistory.ts:24`, `useRemediationPlanWorkflow.ts:89-100`.
- **Problem**: `toIssueSessionScope` indirection is the only enforcement of "anonymous user → 'anonymous' literal" across 4 call sites.
- **Solution**: Keep but inline trivially; standardize on a `*QueryKeys` idiom.
- **Benefits**: Standardizes query-key shape.
- **Deletion test**: REAL_SEAM (anonymous-fallback contract).
- **Adapter count**: 1.
- **Caller count**: 4.
- **ADR/lock impact**: None. **Loop 1**: Verified clean — keep.

**8. `IssueLink.source_type` implicit, not a column — link department resolution lives 5×**
- **Files**: `models/issue.py` (no `source_type` column on `IssueLink`; 5 nullable FKs); branching in `endpoints/issues/links.py:29-70`, `_shared/links.py:39-81`, `source_mutation.py:56-97,156-204`, `linked_context.py:62-100`.
- **Problem**: "Which FK is this link about?" decision is open-coded in ~5 places.
- **Solution**: Add a derived property `IssueLink.target_kind: Literal['risk','control','execution','kri','vendor']` plus a small `resolve_link_department(db, link)` helper.
- **Benefits**: Centralizes source-typing; new linkable entities become a one-table edit.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 5 chain sites.
- **Caller count**: 5.
- **ADR/lock impact**: ADR-001 capability checks per kind retained.

**9. `_authorization_capabilities/issues.py` re-derives status logic the workflow already encodes** [Loop 1: FALSE — capability predicates legitimately read state to gate UI; not an FSM redefinition]

**10. `_shared/__init__.py` aggregates 30+ underscored re-exports — adapter inflation**
- **Files**: `endpoints/issues/_shared/__init__.py:1-79`; `_issue_workflow/serialization.py:18,41` aliases.
- **Problem**: Each underscored alias is a backward-compat marker; together they hide that `_issue_register` is the real source.
- **Solution**: Endpoints import directly from `app.services._issue_register` and `_issue_workflow/loading`. Delete the shared barrel.
- **Benefits**: ~120 lines removed.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 30+.
- **Caller count**: 6 endpoint modules.
- **ADR/lock impact**: None.

#### ✅ Verified clean (Slice 4)

- `IssueWorkflowOutcome[T]` (`contracts.py:12-14`) — generic single-field response wrapper used by 8 detail-functions.
- `select_exception_for_approval/revocation` (`exception_selection.py`) — clean, query-only.
- Outbox plan factories (`outbox.py:20-59`) — three event types, all carry stable idempotency keys per ADR-002.
- `endpoints/issues/lookups.py` — narrow read-only endpoints.
- `useRemediationPlanWorkflow.ts` — thick custom hook owning state for one screen.
- `endpoints/issues/__init__.py` — minimal sub-router aggregator.
- `IssueRegisterPlan` / `IssueLinkedVisibility` (`linked_context.py:28-46`) — small dataclasses with real consumers.
- `frontend/src/services/issuesApi.ts` — flat API surface, one method per endpoint.

### 2.5 Slice 5: Vendors (governance + links + DORA reports)

**1. Duplicate vendor-link primitives in `vendor_link_helpers.py` and `_vendor_governance/links.py`**
- **Files**: `endpoints/vendor_link_helpers.py:14-107` (HTTPException, `commit_service_transaction`); `services/_vendor_governance/links.py:14-118` (DomainError, `flush()`).
- **Problem**: Two parallel link-helper modules. Quote: `"VendorLink: TypeAlias = VendorRiskLink | VendorControlLink | VendorKRILink"` exists in both. Loop 1 confirmed `vendor_link_helpers.py` has zero production callers (per grep) but is referenced by `docs/security/authorization-capability-contract.json:55,502`.
- **Solution**: Delete `vendor_link_helpers.py`; the `_vendor_governance.links` version is the live one used by `_vendor_links/workflow.py:36-39`.
- **Benefits**: Removes drift risk on archive guards, link-already-exists semantics, commit boundary discipline.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 2 → 1.
- **Caller count**: 0 (helpers); live one has many.
- **ADR/lock impact**: Aligns ADR-007 + ADR-002.

**2. Three near-identical link-table models**
- **Files**: `models/vendor_risk_link.py:16-28`, `vendor_control_link.py:16-28`, `vendor_kri_link.py:16-26`. Quote: `"created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())"` repeated verbatim. KRI variant adds `ondelete="CASCADE"` (asymmetry).
- **Problem**: SHALLOW per-target tables differing only in second FK. All three hand off to `VendorLinkTarget` adapter at `_vendor_links/workflow.py:53-76`.
- **Solution**: Long-term: collapse to one `vendor_links` table with `(target_kind, target_id)` columns. Short-term: shared `AbstractVendorLink` mixin so column drift cannot widen.
- **Benefits**: Locality — one migration site for new target kinds.
- **Deletion test**: REAL_SEAM (real DB tables; migration cost is real).
- **Adapter count**: 3 → 1.
- **Caller count**: 27 backend files reference one or more of the three names.
- **ADR/lock impact**: Touches ADR-010 (forward-only); `_archive_allowlist.toml` and `_naming_allowlist.toml` may need updates.

**3. Vendor-link endpoints fragmented across three router modules**
- **Files**: `endpoints/vendor_links.py:28-151`, `risks/vendor_links.py:15-46`, `kris/linked_vendors.py:1-5`.
- **Problem**: Reverse-direction link reads (risk→vendors, control→vendors, kri→vendors) live in three places. `risks/vendor_links.py:42-44` re-implements vendor visibility filtering inline instead of routing through `_vendor_links` workflow.
- **Solution**: Move all reverse-direction reads to a single `_vendor_links/inverse.py`; have all three endpoint modules call it.
- **Benefits**: One vendor-visibility code path.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 3 → 1.
- **Caller count**: see file map.
- **ADR/lock impact**: ADR-007 bounded-context coherence.

**4. `_vendor_governance/reports.py` is a 9-line dataclass with zero callers** [Loop 1: FALSE — the dataclass is the architecture-deepening contract anchor at `test_architecture_deepening_contracts.py:1082`. PRE-EXISTING-AND-OUT-OF-SCOPE.]

**5. Annual report and DORA register row-mappers live in the router**
- **Files**: `endpoints/vendor_reports.py:36-119` defines `_annual_report_rows` and `_dora_register_rows` inside the FastAPI module. Quote: `"headers = ['Vendor ID', 'Name', 'Legal Name', 'Vendor Type', ...]"`.
- **Problem**: Regulatory column ordering for the DORA Register of Information sits in HTTP-layer code.
- **Solution**: Move both row-mappers into a service module. Router becomes a 4-line orchestration.
- **Benefits**: Locality — DORA register column changes touch a single domain file.
- **Deletion test**: MOVES.
- **Adapter count**: unchanged.
- **Caller count**: 1.
- **ADR/lock impact**: Aligned with `_vendor_workflow` README's "vendor report exports should use this package".

**6. `vendor_report_policy.py` and `_vendor_workflow/policy.py` split vendor reporting concerns** [Loop 1: FALSE — different layers (RBAC vs row-visibility); merging would conflate access policy with query scope]

**7. `Vendor.status` enum has only one value but is still gated/filtered**
- **Files**: `models/vendor.py:22-23` (`'class VendorStatus(str, PyEnum):\n    active = "active"'`); `_register_listings/vendors.py:122-124,158-164`; `_vendor_governance/policy.py:58`.
- **Problem**: ADR-005 normalized `status='inactive'` into `is_archived`, but `status` survives as a single-value column with filter plumbing, restricted-field guard, and an enum.
- **Solution**: Drop `Vendor.status` (forward-only migration); delete `VendorStatus` enum; remove status from filter coercion and restricted set; stop emitting it in row-mappers.
- **Benefits**: Removes a fake degree of freedom.
- **Deletion test**: REAL_SEAM only at the DB layer; CONCENTRATES at every other layer.
- **Adapter count**: removes 1 enum + 3 filter rules + 1 restricted-field rule.
- **Caller count**: see filter/projection sites.
- **ADR/lock impact**: ADR-005 is the parent ADR; pure simplification consistent with it. Update `_archive_allowlist.toml` if column referenced.

**8. Frontend link tabs duplicate ~80% of structure across risk/control/KRI**
- **Files**: `components/vendors/VendorLinkedRisksTab.tsx:23-202`, `VendorLinkedControlsTab.tsx:23-203`, `VendorLinkedKRIsTab.tsx`. Quote: identical state-machine across three files.
- **Problem**: ADAPTER COUNT — three near-twin React components.
- **Solution**: Extract `useVendorLinkedTab<T>({ vendorId, fetcher, linker, unlinker })` plus `<VendorLinkedTabShell>`. Each tab becomes ~30 lines.
- **Benefits**: Bug-fixes propagate once.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 3 → 1 hook + 3 thin tabs.
- **Caller count**: 3.
- **ADR/lock impact**: None.

**9. KRI vendor assignment lives outside `_vendor_links`**
- **Files**: `services/kri_vendor_assignment.py:81-119`. Quote: `"db.add(VendorRiskLink(vendor_id=vendor_id, risk_id=kri.risk_id))"` and `"db.add(VendorKRILink(vendor_id=vendor_id, kri_id=kri.id))"`.
- **Problem**: Bypasses `create_vendor_link` and audit emission.
- **Solution**: Route bulk KRI reconciliation through `create_vendor_link`/`delete_vendor_link` (or a `reconcile_vendor_links_bulk` primitive).
- **Benefits**: Closes an audit-emission gap.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 1 added; 1 inline-mutation path removed.
- **Caller count**: 3 KRI crud files.
- **ADR/lock impact**: ADR-002 transaction discipline.

#### ✅ Verified clean (Slice 5)

- `endpoints/vendors/{crud,lifecycle}.py` — thin orchestration; correctly delegates.
- `services/_vendor_governance/lifecycle.py:100-142` — archive/restore correctly use `mark_archived`/`mark_restored` per ADR-005.
- `services/_authorization_capabilities/vendors.py:26-50` — capability surface aligned with contract.
- `services/_vendor_workflow/policy.py:20-46` — visibility scope correctly handles GLOBAL users and NULL departments.
- `services/_vendor_links/workflow.py:265-333` — link/unlink wrap commit/rollback per ADR-002.
- Frontend `vendorApi.ts`, `vendorLinkApi.ts`, `vendorReportApi.ts` — clean schemas.
- `endpoints/vendors/_shared.py` — single eager-loading helper.
- `services/_vendor_governance/projection.py:33-79` — risk-summary projection cleanly separates visibility from serialization.

### 2.6 Slice 6: Approvals + Outbox + Transactions

**1. `transaction_boundary.commit_service_transaction`**
- **Files**: `services/transaction_boundary.py:6-8`. Quote: `async def commit_service_transaction(db): await db.commit()`. ~17 endpoint callers.
- **Problem**: SHALLOW one-line wrapper labeled "transitional"; pure rename of `db.commit()`.
- **Solution**: Inline at the 17 callsites, OR if marking matters, replace with a static-analysis grep-target comment and let the endpoint commit allowlist tooling enforce ratchet.
- **Benefits**: −1 module, −17 imports, locality.
- **Deletion test**: MOVES.
- **Adapter count**: 1.
- **Caller count**: 18 endpoints.
- **ADR/lock impact**: Touches ADR-002 cosmetically; the load-bearing invariant is the *endpoint commit allowlist ratchet*, not this helper. **Loop 1**: load-bearing transitional shim — keep until ratchet expires.

**2. Two parallel `build_approval_read` projections**
- **Files**: `endpoints/approvals/_shared.py:34-61` (`_build_approval_read`); `services/_approval_queue/projection.py:13-39` (`build_approval_read`).
- **Problem**: Duplicate projection logic. A future `scenario_key` addition would have to be applied twice.
- **Solution**: Delete `_shared._build_approval_read`; have `detail.py` and `resolve.py` import `build_approval_read` from `_approval_queue.projection`.
- **Benefits**: Single source of truth.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 2 → 1.
- **Caller count**: 3.
- **ADR/lock impact**: Test at `test_architecture_deepening_contracts.py:1029` already pins `projection.build_approval_read` as the contract.

**3. `_approval_queue/lifecycle.py` is a re-export façade**
- **Files**: `services/_approval_queue/lifecycle.py:1-7`; `__init__.py:1-9`.
- **Problem**: 7-line aggregator + re-aggregator. HYPOTHETICAL_SEAM.
- **Solution**: Delete `lifecycle.py`; let `__init__.py` import directly from `contracts`/`counts`/`execution`/`queries`.
- **Benefits**: One less indirection.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 2 → 1.
- **Caller count**: 0 external.
- **ADR/lock impact**: Lock test at `test_architecture_deepening_contracts.py:1064` references `lifecycle.py` source — co-update needed.

**4. `ApprovalQueuedBanner` 5-prop wrapper around static markup**
- **Files**: `components/forms/ApprovalQueuedBanner.tsx:4-10`; sibling `KriApprovalQueuedBanner.tsx:11-50` reproduces same layout, hardcoding translation calls.
- **Problem**: 4 of 5 props are translation strings the parent looked up; KRI variant demonstrates the simpler form.
- **Solution**: Adopt KRI variant pattern; delete duplicate; pass only `approvalId` and `onClose`.
- **Benefits**: Removes 3 i18n-key-prop ceremonies; converges on one banner.
- **Deletion test**: MOVES.
- **Adapter count**: 2 → 1.
- **Caller count**: 3.
- **ADR/lock impact**: None.

**5. `_notification_approval_helpers.can_user_view_approval_resource` duplicates `approval_scenario_policy.can_view_approval_resource`**
- **Files**: `services/_notification_approval_helpers.py:72-79`; `approval_scenario_policy.py:134-142`. Bodies identical.
- **Problem**: Two private helpers with identical implementations.
- **Solution**: Delete the helper in `_notification_approval_helpers.py`; import from `approval_scenario_policy`.
- **Benefits**: One fewer divergence risk.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 2 → 1.
- **Caller count**: 1 internal.
- **ADR/lock impact**: ADR-001 capability surface unchanged.

**6. Privileged-tier approval logic split between three sites**
- **Files**: `_approval_execution/authorization.py:36-57` (`assert_can_approve`); `:60-116` (`apply_status_transition`); `approval_execution_service.py:215-238` (`_assert_can_reject`).
- **Problem**: Touching `requires_privileged_approval` semantics requires editing three sites.
- **Solution**: Extract a single `assert_can_resolve(db, approval, current_user, *, intent)` in `_approval_execution/authorization.py`. Have both workflows call it.
- **Benefits**: Single audit point for tier policy.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 3 → 1.
- **Caller count**: 2.
- **ADR/lock impact**: ADR-001 + scenario-policy contract; consistent.

**7. `scenario_roles_for_approval` triplet** [Loop 1: FALSE — three small functions with distinct semantics (`list[str] | None` vs `bool | None`); collapsing into one dataclass would force callers to recompute]

**8. `finalize_approval_resolution` doublet** [Loop 1: FALSE — `finalize_approval_resolution_plan` is a deliberate plan-shaped wrapper; removing it would force callers to unpack the plan inline, *increasing* risk of breaking outbox-then-commit ordering. ADR-002 LOAD-BEARING — leave alone.]

**9. Approval-created enqueue lives in `core/approval_helpers.py`, NOT in `_approval_execution/resolution.py`**
- **Files**: `core/approval_helpers.py:286-294` (`OutboxService.enqueue` + `await db.commit()`); `_approval_execution/resolution.py:80-88` (structured `finalize_approval_resolution(_plan)`).
- **Problem**: Two distinct outbox-enqueue+commit code paths in approvals. Inconsistent locality.
- **Solution**: Move `create_approval_request_with_audit` into `_approval_execution/resolution.py` (or sibling `creation.py`).
- **Benefits**: All 4 approval lifecycle events share one commit/enqueue helper.
- **Deletion test**: MOVES.
- **Adapter count**: 2 commit-owners → 1.
- **Caller count**: ~2 service callers.
- **ADR/lock impact**: **ADR-002 LOAD-BEARING**. Strengthening refactor *if* the IntegrityError branch (lines 296-300) moves with the body.

**10. Approval frontend `useTranslation` decision split between banner and form-container parents** [Loop 1: DUPLICATE-OF-S6.4]

#### ✅ Verified clean (Slice 6)

- `services/outbox/store.py:32-58` — `enqueue` is genuinely flush-only; idempotency_key required as positional kwarg. ADR-002 contract HOLDS.
- `services/outbox/dispatcher.py:24-110` — Dispatcher owns `claim_session.begin()`, per-event `session.begin()`, retry/dead-letter sessions. ADR-002 contract HOLDS.
- `services/outbox/payloads.py:10-87` — Strict `extra="forbid"` Pydantic models per event type.
- `services/outbox/registry.py:22-32` — Single dict mapping event_type → handler.
- `services/outbox/errors.py:6-28` — Clean `Retryable/Fatal/Dependency/PayloadError` taxonomy.
- `services/_approval_execution/results.py:9-37` — `SideEffectResult` value object + `apply_auto_rejection`.
- `services/_approval_execution/side_effects.py:14-37` — Dispatch table on `(action_type, resource_type)`.
- `services/_approval_queue/contracts.py:9-37` — Three immutable dataclasses with one method.
- `endpoints/approvals/_delete_authorization.py:20-82` — Three thin "mirror the delete-route" assertions.
- `services/_approval_execution/staleness.py:24-56` — Stale-pending-change detection is genuinely policy-bearing.

### 2.7 Slice 7: Identity / Auth / Departments / Directory

**1. Three authz idioms competing across endpoints**
- **Files**: `core/security.py:170-205` `require_permission`/`require_business_permission`; `endpoints/access.py:23-55` `_require_privileged`; `directory.py:27-31` `_require_directory_admin`; `users/_lifecycle.py:13-19` `require_admin_user_lifecycle`; `users/summary.py:45-50` `_can_view_governance`.
- **Problem**: Three near-identical authz idioms (capability dependency, body-resident `_require_*`, ad-hoc `if not has_permission: 403`) duplicate the same shape.
- **Solution**: Promote one capability/role policy registry; have `require_business_permission` accept a role-set argument so `_require_directory_admin` and `require_admin_user_lifecycle` collapse into `require_business_permission("users","write", roles={"admin"})`-style dependencies.
- **Benefits**: Locality (gate visible in `Depends`); leverage (one well-tested factory feeds OpenAPI capability-extraction tooling).
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 3.
- **Caller count**: ~20 endpoints.
- **ADR/lock impact**: ADR-001; `_capabilities_all_allowlist.toml`, `_endpoint_commit_allowlist.toml`.

**2. Endpoints that authenticate-only and push authz into the body**
- **Files**: `users/crud.py:26,46`; `detail.py:23,40,55,74`; `lookup.py:24-26`; `summary.py:84`; `org.py:19`; `users/directory.py:64,68-69`; `access.py:102-106,131,171,194-206`.
- **Problem**: Authz invisible at function signature, breaking OpenAPI extraction and the `_endpoint_commit_allowlist` ratchet. Bypasses the `setattr(..., "required_capability", ...)` machinery.
- **Solution**: Replace `Depends(get_current_user)` + first-line `_require_*` calls with explicit `Depends(require_…)` factories.
- **Benefits**: Locality (route reads as `(payload, db, current_user=Depends(require_users_admin))`); capability catalog scan reliably.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 1 surplus per endpoint.
- **Caller count**: ~14 routes.
- **ADR/lock impact**: ADR-001, `_endpoint_commit_allowlist.toml` (auth-flow expiry 2026-09-01).

**3. `usePermissions` is a SHALLOW pass-through hook**
- **Files**: `frontend/src/hooks/usePermissions.ts:1-21` aliases nine `authz.*` fields one-for-one; only `Sidebar.tsx:25` consumes it.
- **Problem**: Every line forwards `authz.*`; `useAuth().hasPermission` is already exposed.
- **Solution**: Delete the hook; switch `Sidebar.tsx` to `useAuth()` for `hasPermission` and `useAuthz()` for the booleans.
- **Benefits**: Locality; strict-capability path becomes the only path.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 1.
- **Caller count**: 1 component.
- **ADR/lock impact**: useAuthz invariant pinned — consistent (no fallback drift).

**4. Four near-identical `BusinessRouteGuards`**
- **Files**: `frontend/src/authz/BusinessRouteGuards.tsx:18-36` — four guards differ only by which `authz.*` boolean they read.
- **Problem**: SHALLOW duplication.
- **Solution**: One parametric `<RouteGuard allow={(a) => a.canViewGovernance}>`.
- **Benefits**: Locality; new gates need no new component.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 4.
- **Caller count**: ~4 routes.
- **ADR/lock impact**: ADR-001 — consistent.

**5. `access_user_service.py` is a single-call compat facade**
- **Files**: `services/access_user_service.py:10-26` — one function delegating to `update_access_profile`.
- **Problem**: HYPOTHETICAL_SEAM — facade adds an extra hop and an extra symbol for no behavior.
- **Solution**: Have `access.py` import `update_access_profile` directly; delete the file.
- **Benefits**: Locality.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 1.
- **Caller count**: 1 endpoint.
- **ADR/lock impact**: ADR-007 — consistent.

**6. `directory_identity_service.py` is a re-export shim**
- **Files**: `services/directory_identity_service.py:1-35`. "Compatibility exports for directory identity lifecycle decisions."
- **Problem**: HYPOTHETICAL_SEAM — pure re-export.
- **Solution**: Delete; update ~9 importers (per Loop 1 grep).
- **Benefits**: Locality; bounded-context name `_directory_identity` becomes load-bearing.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 1.
- **Caller count**: ~9.
- **ADR/lock impact**: ADR-007; `_naming_allowlist.toml` — consistent.

**7. `graph_directory_*` four-module split**
- **Files**: `services/graph_directory_service.py`, `graph_directory_auth.py`, `graph_directory_transport.py`, `graph_directory_errors.py`.
- **Problem**: Borderline REAL_SEAM — auth and transport legitimately separable, but four top-level modules in `app/services/` for one provider is fragmented.
- **Solution**: Move into `backend/app/services/_graph_directory/{__init__,service,auth,transport,errors}.py`.
- **Benefits**: Locality; provider abstraction discoverable.
- **Deletion test**: MOVES.
- **Adapter count**: 0 (rename only).
- **Caller count**: ~3.
- **ADR/lock impact**: `_naming_allowlist.toml` — consistent.

**8. Frontend `services/session/` split into 8 files**
- **Files**: `frontend/src/services/session/{store,manager,bootstrap,sso,refreshHint,logoutSuppression,types,index}.ts`.
- **Problem**: SHALLOW LOCALITY — apply/clear/bootstrap all mutate the same store; split per concern but each holds 2-3 functions.
- **Solution**: Merge `manager.ts` + `bootstrap.ts` + `refreshHint.ts` + `logoutSuppression.ts` into `session/lifecycle.ts`. 8 → ~4.
- **Benefits**: Locality; ordering bugs collapse to local reasoning.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 4 small modules → 1.
- **Caller count**: 3 (`index.ts`, `AuthContext`, `useAuthBootstrap`).
- **ADR/lock impact**: useAuthz invariant unaffected.

**9. ADR gap: no auth-scheme record**
- **Files**: `core/security.py:107-136` mock-auth + JWT path; `auth/password.py:72-73` SSO mode toggle.
- **Problem**: REAL_SEAM but undocumented — token model, session lifetime, mock-auth carve-out, allowlist expiry have no ADR home.
- **Solution**: Author ADR-011 "Auth scheme & session model".
- **Benefits**: Locality; allowlist ratchet has a target.
- **Deletion test**: REAL_SEAM (cannot delete; only document).
- **Adapter count**: 0.
- **ADR/lock impact**: New ADR; ratchets `_endpoint_commit_allowlist.toml`.

**10. `_can_view_governance` reimplements `me_capabilities.can_view_governance`**
- **Files**: `endpoints/users/summary.py:45-50`; `frontend/src/authz/policy.ts:117` already reads `meCapabilities.can_view_governance`; backend authoritative builder is `services.authorization_capabilities.build_me_capabilities`.
- **Problem**: SHALLOW — drift risk; governance gating in two places.
- **Solution**: Have `_build_shell_summary` call `build_me_capabilities(current_user).can_view_governance`; or extract once in `core/_permissions/`.
- **Benefits**: Locality.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 2.
- **Caller count**: 1.
- **ADR/lock impact**: ADR-001 — strengthens.

#### ✅ Verified clean (Slice 7)

- `services/_auth_session/` — clear bounded module.
- `services/_auth_session_workflow/admin_sessions.py` — single-file workflow.
- `services/_identity_access_lifecycle/` — sub-modules carry distinct responsibilities.
- `services/_access_workflow/policy.py` — small, single-purpose.
- `endpoints/auth/refresh.py`, `auth/sso.py` — orchestration only.
- `frontend/src/authz/useAuthz.ts` — three-line memo around `buildAuthz`; pinned by invariant test.
- `core/_permissions/` — focused per-domain helpers.
- `endpoints/departments/` — uses `require_permission` consistently.
- `services/_directory_identity/lifecycle.py` — frozen dataclasses + decisions.

### 2.8 Slice 8: Cross-cutting

**1. Quarterly comparison facade re-exports four symbols**
- **Files**: `services/quarterly_comparison_service.py:1-20` — facade. Only caller: `dashboard/quarterly.py:12`.
- **Problem**: SHALLOW — 20-line facade wraps `_quarterly_comparison.composition` plus a `parse_quarter` redefinition.
- **Solution**: Inline-import `build_quarterly_comparison` directly; delete facade.
- **Benefits**: One fewer file; kills the "compatibility facade" comment.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 1.
- **Caller count**: 1 production.
- **ADR/lock impact**: None.

**2. Report service facade re-exports two helpers**
- **Files**: `services/report_service.py:5-11`; used by `audit_trail_excel.py:16`, `summary_excel.py:11`, `unified_exports/render.py`.
- **Problem**: SHALLOW — 11-line passthrough.
- **Solution**: Either delete and import from `_reporting.counts`/`tabular`, or move the two functions into `_reporting/__init__.py` and rename the package.
- **Benefits**: One canonical import path.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 1.
- **Caller count**: ~6 production + tests.
- **ADR/lock impact**: None.

**3. Orphaned-item service facade is a 7-line passthrough wrapping a 80-line static-method shim**
- **Files**: `services/orphaned_item_service.py:1-7`; `_orphaned_items/service.py:20-81`.
- **Problem**: DOUBLE SHALLOW — facade re-exports a class whose only purpose is to namespace 7 free functions.
- **Solution**: Delete the class plus the facade. Update 6 callers to import functions directly.
- **Benefits**: Two layers of indirection removed.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 2.
- **Caller count**: ~8.
- **ADR/lock impact**: None.

**4. Risk-questionnaire facade re-exports 38 names verbatim**
- **Files**: `services/risk_questionnaire_service.py:3-83`; `_risk_questionnaires/__init__.py:1-89`.
- **Problem**: SHALLOW — 38-name re-export with zero transformation. **Loop 1**: DUPLICATE-OF-S1.1 (same finding, larger blast radius).
- **Solution**: Drop the facade; rename `_risk_questionnaires` → `risk_questionnaires` (or expose both names).
- **Benefits**: One package, one import path.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 1.
- **Caller count**: ~25.
- **ADR/lock impact**: Capability tests stay green.

**5. Two questionnaire mounts bifurcate the URL surface**
- **Files**: `endpoints/risk_questionnaires/__init__.py:7-15`; `endpoints/riskhub_questionnaires.py:14`.
- **Problem**: 3 mounts for one feature. Frontend must query three trees; OpenAPI tags split.
- **Solution**: Collapse into one router with sub-prefixes.
- **Benefits**: One feature, one OpenAPI tag.
- **Deletion test**: MOVES.
- **Adapter count**: 3.
- **Caller count**: 1 frontend feature client.
- **ADR/lock impact**: Capability per-row capabilities preserved.

**6. Inline Pydantic models in three endpoint files break the `app/schemas/` invariant**
- **Files**: `endpoints/preferences.py:15-40`; `health.py:16-35`; `riskhub_questionnaires.py:17-34`.
- **Problem**: LOCALITY VIOLATION — every other endpoint imports from `app.schemas.*`.
- **Solution**: Move models to `app/schemas/preferences.py`, `app/schemas/health.py`, and `app/schemas/risk_questionnaire.py`. **Loop 1**: PARTIAL — keep `health.py` inline (response-only DTOs for ops/probes are conventionally local).
- **Benefits**: Consistent contributor expectation.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 0.
- **Caller count**: 1 each.
- **ADR/lock impact**: Could justify a new architecture-lock test.

**7. Admin console capabilities endpoint returns hardcoded constants**
- **Files**: `endpoints/admin/capabilities.py:12-22`. Quote: `return AdminConsoleCapabilities(can_revoke_sessions=True, can_run_directory_check_all=True, ...)`.
- **Problem**: HYPOTHETICAL_SEAM — the response does no work.
- **Solution**: Either delete the endpoint and have the frontend infer from platform-admin status, or wire booleans to actual feature toggles.
- **Benefits**: Removes dead conditional fanout.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 1.
- **Caller count**: 1 frontend admin-console page.
- **ADR/lock impact**: **Load-bearing for capability contract** — changes pair with `docs/security/capability-catalog.json` and useAuthz invariant.

**8. Dashboard router fans out 14+ routes across 9 modules with overlapping shapes**
- **Files**: `endpoints/dashboard/__init__.py:5-26`; `dashboard/overview.py:34-135`; `dashboard/risks.py:155-197` runs SQL inline.
- **Problem**: LOCALITY MIXED — "compute one widget" sometimes lives in the endpoint module, sometimes in `_dashboard_metrics/lifecycle.py`, sometimes in `_quarterly_comparison/composition.py`.
- **Solution**: Push *all* widget builders into `_dashboard_metrics/<widget>.py` with uniform signature `(db, current_user, scope) -> WidgetResponse`. Endpoints become thin.
- **Benefits**: HIGH LEVERAGE — same shape for every widget makes caching, telemetry, snapshot-vs-live decisions composable.
- **Deletion test**: MOVES.
- **Adapter count**: 0 facades; 9 endpoint modules each carry their own logic.
- **Caller count**: 1 frontend dashboard + 1 internal `overview` consolidator.
- **ADR/lock impact**: ADR-008 risk thresholds preserved.

**9. Notification service is split across four modules with inconsistent naming**
- **Files**: `services/notification_service.py`; `notification_creation_helpers.py`; `_notification_approval_helpers.py`; `_notification_inbox/lifecycle.py`; `notification_visibility.py`.
- **Problem**: ADAPTER COUNT 5 with no clear seam. Naming convention varies.
- **Solution**: Consolidate into a single `_notifications` package with `creation.py`, `approvals.py`, `inbox.py`. **Loop 1**: framing slightly off — refactor to "responsibilities live in both flat `services/notification_*.py` modules and `_notification_inbox/` package — concentrate into one package".
- **Benefits**: One package, one mental model.
- **Deletion test**: MOVES.
- **Adapter count**: 5 → 3.
- **Caller count**: ~15 importers.
- **ADR/lock impact**: Could trigger an architecture-lock to ban new top-level `notification*.py` files outside the package.

**10. Reports tree carries dead "legacy_excel" + "summary_excel" + "audit_trail_excel" routes that all return 410**
- **Files**: `endpoints/reports/legacy_excel.py:14-29`; `summary_excel.py:97-103`; `audit_trail_excel.py:133-139`.
- **Problem**: ADAPTER BLOAT — `*_excel.py` modules each pair a live "/export" endpoint with a deprecated "/excel" tombstone.
- **Solution**: Delete `legacy_excel.py` entirely; remove `/excel` routes from siblings. Rename `summary_excel.py` → `summary.py` etc.
- **Benefits**: Live and dead routes stop cohabiting.
- **Deletion test**: CONCENTRATES.
- **Adapter count**: 5 dead endpoints across 3 files.
- **Caller count**: 0 (all return 410).
- **ADR/lock impact**: None.

**11. Admin sub-router fans out into 8 modules; some are 1-endpoint shells**
- **Files**: `endpoints/admin/__init__.py:7-18` mounts 8 routers; `admin/capabilities.py` is 22 lines (one dead endpoint, see #7); `admin/snapshots.py:1-114` is 3 endpoints; `admin/log_config.py:1-40+` is 2.
- **Problem**: SHALLOW SUBMODULES — splitting was done by URL noun.
- **Solution**: Re-cluster by topic: `admin/diagnostics.py` (health, stats, logs), `admin/sessions.py`, `admin/snapshots.py`, `admin/directory.py`, `admin/governance.py`. Drop `capabilities.py` (#7).
- **Benefits**: 8 → 5 modules.
- **Deletion test**: MOVES.
- **Adapter count**: 8 sub-routers.
- **Caller count**: 1 admin-console frontend.
- **ADR/lock impact**: None.

**12. RiskHub config sub-package uses lazy `__getattr__` adapter while peers use direct imports**
- **Files**: `services/_riskhub_config/__init__.py:1-42`. Quote: `_EXPORTS = {…}; def __getattr__(name): …`.
- **Problem**: ADAPTER STYLE INCONSISTENCY — `_riskhub_config` is the only bounded-context package using lazy import dispatch.
- **Solution**: Convert to plain re-exports if the commit-ratchet rationale no longer applies, or document the convention in `AGENTS.md` and make peer packages adopt it.
- **Benefits**: One idiom for bounded-context `__init__.py`s.
- **Deletion test**: HYPOTHETICAL_SEAM. **Loop 1**: LIKELY-FALSE — deliberate lazy-loader pattern, not anti-pattern.
- **Adapter count**: 1 dispatcher.
- **Caller count**: ~12 (riskhub endpoints).
- **ADR/lock impact**: Coordinate with `_riskhub_config_service_commit_allowlist.toml` rationale.

#### ✅ Verified clean (Slice 8)

- `services/_activity_log_query/` — proper package with criteria/policy/projection/query split.
- `endpoints/notifications.py:15-23` — imports directly from `_notification_inbox.lifecycle`; no facade.
- `endpoints/dashboard/_shared.py:1-19` — tiny helper for `month_period_expr`/`week_period_expr`; legitimate dialect adapter.
- `endpoints/reports/_streaming.py` — narrow, well-scoped.
- `endpoints/admin/snapshots.py:31-114` — three endpoints share `_snapshot_response` helper.
- `services/_dashboard_metrics/__init__.py` — explicit named exports.
- `services/_riskhub_config/lifecycle.py:18-42` — well-shaped dataclasses backing the ADR-007 audit pipeline.
- `endpoints/lookups.py` — single 36-line endpoint.
- `endpoints/orphaned_items.py` — endpoint-level cache + clear governance gate.
- `services/_admin_telemetry/projections.py` — projection helpers used by `console.py`.
- `_riskhub_config_service_commit_allowlist.toml` — bounded-context ratchet enforced.
- `endpoints/dashboard/quarterly.py` — clean delegation.

---

## 3. Loop 1 — Adversarial Cross-Domain Re-review

Eight Opus agents in parallel: 4 verifier quartiles + 2 gap-finders + ADR conformance + lock awareness.

### 3.1 Verifier verdicts

#### Quartile A (Slices 1+2, 19 candidates)

| ID | R0 verdict | Loop-1 verdict | Notes |
| --- | --- | --- | --- |
| S1.1 | MOVES | **REAL** but lock-mediated | 19 callers (verified) |
| S1.2 | HYPOTHETICAL_SEAM | **FALSE** | `create.py` and `list.py` share one router; only 4 verbs (not "every CRUD verb") own own APIRouter |
| S1.3 | REAL_SEAM, contradicts ADR-002 | **REAL** | Confirmed at all cited lines |
| S1.4 | MOVES | **REAL** | True duplication |
| S1.5 | MOVES | **REAL (TRIVIAL)** | 11-line helper |
| S1.6 | MOVES | **REAL** | Pure DB logic in endpoint dir |
| S1.7 | REAL_SEAM | **REAL** | Test, don't refactor |
| S1.8 | HYPOTHETICAL_SEAM | **FALSE** | Encodes business policy: active-KRIs, breach detection, kri/control counts |
| S1.9 | MOVES | **REAL but PRE-EXISTING idiom** | Standard separation; not defect |
| S2.1 | CONCENTRATES | **REAL** | Pure compat re-export confirmed |
| S2.2 | CONCENTRATES | **REAL** | 3-line wrapper, 1 prod caller |
| S2.3 | CONCENTRATES | **REAL** | 0 prod callers |
| S2.4 | CONCENTRATES | **REAL** | Two API surfaces for same action |
| S2.5 | HYPOTHETICAL_SEAM | **FALSE** | Used cross-module by `_vendor_links/workflow.py:182` |
| S2.6 | CONCENTRATES | **REAL** | Symmetric duplicate |
| S2.7 | REAL_SEAM | **REAL** | Truth-in-naming bug confirmed |
| S2.8 | CONCENTRATES | **REAL but mis-counted** | 2 prod + 3 test callers (not 0) |
| S2.9 | CONCENTRATES | **REAL (TRIVIAL)** | 13 lines, 2 unrelated exports |
| S2.10 | MOVES | **REAL** | Boundaries blurry across 3 packages |

**Quartile A new candidates (Round 0 missed):**
- **A-N1**: `endpoints/risks/crud/__init__.py:23` re-export of `validate_risk_type` alongside ADR-mismatched dual implementations — drop the public re-export, mark `_shared.validate_risk_type` private.
- **A-N2**: `services/_control_execution/__init__.py` re-exports the 3-line wrappers, hiding cost from callers — inline the helpers; trim `__init__.py`.
- **A-N3**: `endpoints/executions.py` vs `endpoints/controls/executions.py` POST duplication is also a *capability surface duplication* — pick one POST route; converge service helpers.

#### Quartile B (Slices 3+4, 23 candidates)

| ID | R0 verdict | Loop-1 verdict | Notes |
| --- | --- | --- | --- |
| S3.1 | HYPOTHETICAL_SEAM | **REAL** | 12 staticmethod re-binds (not 8) |
| S3.2 | CONCENTRATES | **REAL but TRIVIAL** | 0 prod callers; only architecture test |
| S3.3 | HYPOTHETICAL_SEAM | **REAL** | Locked by negative-assertion contract |
| S3.4 | CONCENTRATES | **REAL** | 4-hop import chain |
| S3.5 | HYPOTHETICAL_SEAM | **REAL** | 14 lines, 0 prod |
| S3.6 | MOVES | **PRE-EXISTING-AND-OUT-OF-SCOPE** | Refactor magnitude too large |
| S3.7 | CONCENTRATES | **REAL** | Byte-identical 22-line blocks |
| S3.8 | MOVES | **FALSE** | Local utility, not shim |
| S3.9 | CONCENTRATES | **REAL** | 2-line shim |
| S3.10 | HYPOTHETICAL_SEAM | **FALSE** | 7 meaningful pure functions |
| S3.11 | CONCENTRATES | **REAL but TRIVIAL** | 14 lines |
| S3.12 | MOVES (new ADR for KRI time-series) | **REAL** | Cross-service static-method coupling |
| S3.13 | CONCENTRATES | **REAL but DUPLICATE-OF-S3.1** | Dual facade |
| S4.1 | HYPOTHETICAL_SEAM | **REAL** | Triple-facade chain confirmed |
| S4.2 | CONCENTRATES | **REAL** | Identical 25-line selectinload graphs |
| S4.3 | CONCENTRATES | **REAL** | 3 byte-identical implementations |
| S4.4 | REAL_SEAM | **REAL** | Outbox is the live path |
| S4.5 | CONCENTRATES | **FALSE** | One central FSM dict each; status-literal checks elsewhere are not separate FSMs |
| S4.6 | CONCENTRATES | **REAL** | 4 isomorphic coercers |
| S4.7 | REAL_SEAM (verify-and-keep) | **FALSE — verified clean** | Keep |
| S4.8 | CONCENTRATES | **REAL but partly DUPLICATE-OF-S4.3** | Distinct concern: link-type dispatch chain |
| S4.9 | CONCENTRATES | **FALSE** | Capability predicates legitimately read state, not FSM redefinition |
| S4.10 | CONCENTRATES | **REAL** | 33-name underscored `__all__` |

**Quartile B new candidates:**
- **B-N1**: `_issue_workflow/source_validation.py:117-120` re-aliases its own functions to underscored copies for backward compat — same anti-pattern as S4.10, in services/.
- **B-N2**: `_issue_workflow/source_validation.py:9` half-merged refactor — imports some helpers from `_issue_register.source_mutation`, redefines others locally.
- **B-N3**: `_issue_workflow/serialization.py:18,41` defines bidirectional underscore-aliasing in 41 lines.

#### Quartile C (Slices 5+6, 19 candidates)

| ID | R0 verdict | Loop-1 verdict | Notes |
| --- | --- | --- | --- |
| S5.1 | CONCENTRATES (delete) | **REAL** | But contract anchor — coordinate with `authorization-capability-contract.json` |
| S5.2 | REAL_SEAM (mixin first) | **REAL** | KRI variant has `ondelete="CASCADE"` (asymmetry) |
| S5.3 | CONCENTRATES | **REAL (downgrade)** | Semantically related surface, not literal duplication |
| S5.4 | HYPOTHETICAL_SEAM | **FALSE** | Architecture-deepening contract anchor |
| S5.5 | MOVES | **REAL** | Pure tabular shaping, no HTTP concerns |
| S5.6 | MOVES | **FALSE** | Different layers (RBAC vs query scope) |
| S5.7 | REAL_SEAM (forward migration) | **REAL** | Single-value enum + filter plumbing |
| S5.8 | CONCENTRATES | **REAL** | Identical state machines, identical scaffolds |
| S5.9 | CONCENTRATES (audit emission gap) | **REAL (placement)** | Audit-emission claim needs caller-side verification |
| S6.1 | MOVES | **REAL but LOAD-BEARING** | Keep as transition shim; ADR-002 |
| S6.2 | CONCENTRATES | **REAL** | Identical projections |
| S6.3 | CONCENTRATES | **REAL** | But lock test references `lifecycle.py` source |
| S6.4 | MOVES | **REAL** | Markup structurally identical |
| S6.5 | CONCENTRATES | **REAL** | Byte-identical helpers |
| S6.6 | CONCENTRATES | **REAL** | 3-way split |
| S6.7 | MOVES | **FALSE** | 3 distinct functions with different return semantics |
| S6.8 | CONCENTRATES (load-bearing) | **FALSE — OUT-OF-SCOPE (ADR-002)** | Plan-shaped wrapper is deliberate |
| S6.9 | MOVES (load-bearing) | **REAL but LOAD-BEARING** | Strengthening if IntegrityError branch moves with body |
| S6.10 | MOVES | **DUPLICATE-OF-S6.4** | Don't double-count |

**Quartile C new candidates:**
- **C-N1**: Two parallel approval-resource-id-to-department resolvers — `endpoints/approvals/_shared.py:17-31` `_get_approval_department_id` and `services/_approval_execution/loading.py` `get_approval_department_id`. Endpoint helper duplicates the service-side resolver.
- **C-N2**: Vendor archive precedence inconsistency in `require_vendor_access` — `vendor_link_helpers.py:44-50` raises 409 (archived) before 403 (write); `_vendor_governance/links.py:54-60` raises 403 first. Two divergent error orderings.
- **C-N3**: `commit_service_transaction` used inside `vendor_link_helpers.py` while the service-side counterpart only flushes — ADR-002 transaction ownership ambiguity until S5.1 is resolved.

#### Quartile D (Slices 7+8, 22 candidates)

| ID | R0 verdict | Loop-1 verdict | Notes |
| --- | --- | --- | --- |
| S7.1 | CONCENTRATES | **REAL** | Three distinct authz idioms; capability marker introspection blind spot |
| S7.2 | CONCENTRATES | **REAL** | Bypasses `required_capability` machinery |
| S7.3 | CONCENTRATES | **REAL but TRIVIAL** | 9-key passthrough |
| S7.4 | CONCENTRATES | **REAL** | Trivial concentrate |
| S7.5 | CONCENTRATES | **REAL** | 1-call wrapper |
| S7.6 | CONCENTRATES | **REAL** | 9 importers; mechanical |
| S7.7 | MOVES | **REAL** | Legitimate seam |
| S7.8 | CONCENTRATES | **REAL** | 8-way split |
| S7.9 | REAL_SEAM (document) | **REAL_SEAM** | High value |
| S7.10 | CONCENTRATES | **REAL** | LOAD-BEARING for capability contract |
| S8.1 | CONCENTRATES | **REAL** | 1 prod caller |
| S8.2 | CONCENTRATES | **REAL** | 5 importers |
| S8.3 | CONCENTRATES | **REAL** | Static-method class wrapper |
| S8.4 | CONCENTRATES | **REAL but DUPLICATE-OF-S1.1** | Same shape, larger blast radius |
| S8.5 | MOVES | **REAL** | 2 mount surfaces |
| S8.6 | CONCENTRATES | **PARTIAL** | REAL for preferences/riskhub_questionnaires; FALSE/TRIVIAL for health.py |
| S8.7 | HYPOTHETICAL_SEAM | **REAL — LOAD-BEARING** | Touches capability contract |
| S8.8 | MOVES | **REAL** | 9 sub-modules confirmed |
| S8.9 | MOVES | **REAL but REFRAMED** | Not "4-module split"; flat + package mix |
| S8.10 | CONCENTRATES | **REAL** | 3 tombstone modules confirmed |
| S8.11 | MOVES | **REAL** | 8 sub-routers confirmed |
| S8.12 | HYPOTHETICAL_SEAM | **LIKELY-FALSE** | Deliberate lazy-loader pattern, not anti-pattern |

**Quartile D new candidates:**
- **D-N1**: Capability-marker introspection blind spot — endpoints in S7.2 bypass `required_capability` markers, so the capability-contract validator can't see them. Real downstream cost.
- **D-N2**: `endpoints/access.py:81` `AccessUserRead.capabilities` may not be in the per-row capability allow-list (`docs/security/capability-catalog.json`) — verify potential contract drift.
- **D-N3**: `endpoints/users/summary.py:62-63` blanket `except Exception` swallows questionnaire-inbox errors silently — cross-cutting reliability seam.

### 3.2 Backend coverage gap-finder

Eight orthogonal candidates Round 0 missed:

**BE-N1. Outbox handler recipient-fanout duplication** — three near-identical "fetch active RM/CRO with permission, exclude actor, then per-recipient `can_read_*`" loops in `outbox/handlers/issues.py:55-89`, `handlers/questionnaires.py:55-66`, `issue_deadline_service.py:86-100`. **REAL_SEAM** (Adapter count = 1, callers = 3). ADR-001 capability contract.

**BE-N2. Outbox payload base + handler signature compaction** — every handler re-implements load+null-check+visibility+i18n+notify; `payloads.py` shares `actor_user_id` but no shared base. **CONCENTRATES** with 9 payload models, 9 handlers. ADR-002 transactional outbox.

**BE-N3. Mapper coverage parity** — `api/mappers/__init__.py` only contains `risk.py` + `vendor.py`; controls/KRIs/issues/approvals do `.model_validate()` ad-hoc. **MOVES** (4 new mapper modules; ~25 endpoints inline ORM-to-schema). ADR-001 alignment with `useAuthz.invariant.test.ts` per-row capability rule.

**BE-N4. Audit display-name + safe-label adapter dedup** — each entity invents its own `*_display_name`; the safe-label rule is enforced by `test_w7_audit_safe_entity_label_red.py`, but boilerplate appears 30+ times. **CONCENTRATES** (Adapter count = 1, ~33 adapter functions). Reinforces `_audit_matrix.toml`.

**BE-N5. Domain exception → FastAPI handler registration seam** — `core/exceptions.py:66-95` `EXCEPTION_REGISTRY` claims to drive HTTP+retryable+audit, but `audit_log_payload` may have zero callers; status-code source-of-truth duplicated. **HYPOTHETICAL_SEAM**. ADR-003.

**BE-N6. Protocol-guard & rate-limit policy table consolidation** — path-prefix policy lives in three independent string tuples (`security_protocol.py:22-86`, `rate_limit/policy.py:9-16`, `settings/protocol_guard.py:10-15`). **REAL_SEAM**. New cross-cutting lock test.

**BE-N7. Scheduler tracked-job + outbox dispatcher convergence** — `scheduler_tracking.py:92-148` `execute_tracked_job` (status/error/duration) but outbox dispatcher reinvents per-event status without `SchedulerJobRun` instrumentation. **REAL_SEAM**. ADR-005 (outbox), ADR-002 (audit observability).

**BE-N8. Permission ownership-resolver duplication** — `core/_permissions/ownership.py:1-142` has KRI quartet + Control quartet (same shape, different model class). **CONCENTRATES** (Adapter = 1, 8 functions today). ADR-001.

**Confirmed already covered**: settings/config layer, permissions evaluation core. **Confirmed absent**: `_helpers.py` in alembic versions; `tests/backend/pytest/snapshots/`.

### 3.3 Frontend coverage gap-finder

Eight orthogonal candidates Round 0 missed:

**FE-N1. TanStack Query key module** — extract a typed `queryKeys` registry. Only `issueQueryKeys.ts` is a factory; ~45 inline literals across 22 files (e.g., `SessionsPanel.tsx:23` `queryKey: ['adminSessions']` repeated four times). **CONCENTRATES**. No ADR impact.

**FE-N2. `QueryClient` defaults centralization** — extract `App.tsx:11-18` defaults into `services/api/queryClient.ts` with a `RESOURCE_POLICY` map. **MOVES**. None.

**FE-N3. Zod schema base helpers** — collapse `passthroughObject({...})` (156 invocations) into a typed registry. Add `crudCapabilitySchema = passthroughObject({ can_create, can_update, can_delete, can_restore })` shared across entities. **CONCENTRATES** (~12 entity schemas). Touches authz capability surface — must preserve `Read.capabilities` shape.

**FE-N4. `ApiClient` retry/refresh seam** — 401-refresh-retry policy entangled with `executeRequest`; `authApi.ts` reimplements body parsing. **REAL_SEAM** (Adapter=1, callers=2). None.

**FE-N5. `AuthContext` value memoization** — provider value object freshly allocated each render; ThemeProvider re-reads localStorage on auth change. **CONCENTRATES** by splitting into `AuthSessionContext` + `AuthActionsContext`. Must preserve `me_capabilities` reachability via `useAuth`.

**FE-N6. i18n error-key registry** — fold `getErrorMessageKey.ts` + `errorCodeMap.ts` into `errorKeys.ts`. **CONCENTRATES** (-1 file). None.

**FE-N7. Admin/RiskHub query+mutation panels** — `useRiskHubConfigResource.ts` is a clean CRUD template, but admin-console panels (sessions, log settings, health, audit logs) re-implement the pattern by hand. **CONCENTRATES** (~10 panels). None.

**FE-N8. Dashboard widget data plumbing** — 22 widgets each re-import filters/theme/translation; `DashboardFilterContext` has 7 setters causing over-broad re-renders. Add `WidgetShell.tsx` and split context. **CONCENTRATES**. None.

### 3.4 ADR conformance map

**Strengthens an ADR (15)**: S1.1 (ADR-007), S1.4 (ADR-003), S2.1 (ADR-007), S2.2 (ADR-007), S2.3 (ADR-001), S3.1 (ADR-007), S3.2 (ADR-007), S3.3 (ADR-007), S3.13 (ADR-007), S5.6 (ADR-007), S6.1 (ADR-002), S6.2 (ADR-001), S7.5 (ADR-007), S7.10 (ADR-001), S8.4 (ADR-007).

**Contradicts an ADR (verified, 2)**:
- **S1.3** — endpoint commits in risk CRUD contradict ADR-002 (service-owned transactions). **Worth reopening**: real and creates new entries in `_endpoint_commit_allowlist.toml`.
- **S7.10** — endpoint `_can_view_governance` reimplements visibility logic that ADR-001 says should flow through Capabilities. **Worth reopening**: real drift risk.

**Untouched by any ADR (gap candidates for new ADR)**: 8 patterns identified — public-facade convention; router composition convention; frontend authz idiom; issue/workflow taxonomy; vendor link primitive convention; endpoint inline Pydantic model rule; FE util-file scope; notification module boundary.

### 3.5 Architecture-lock impact map

**Move TOML allowlist entries**:
- S2.x archive deepenings → `_archive_allowlist.toml` (4 entries today).
- S6.x auth-flow / endpoint-commit → `_endpoint_commit_allowlist.toml` (cap 8; expires 2026-09-01).
- S6.x in `_riskhub_config/` → `_riskhub_config_service_commit_allowlist.toml` (≤2).
- S6.x in `_vendor_governance/` → `_vendor_governance_service_commit_allowlist.toml` (≤4).
- Capabilities renames → `_capabilities_all_allowlist.toml` (frozen ordered `__all__`).
- New get_db override → `_get_db_override_whitelist.toml` (currently only conftest.py).
- Audit adapter rename → `core/audit/_audit_matrix.toml`.

**Change invariant-test assertions**:
- S2.x archive → `test_w8b_archivable_encapsulation_red.py` symbol set.
- S6.x endpoint-commit removal → ratchet `<= 8` down per PR.
- S3.x/S4.x issue-status automation → `test_w12_issue_status_automation_lock_red.py:13-16` whitelist.
- S1.x outbox idempotency → `test_w12_outbox_enqueue_idempotency_key_present_red.py:49` (`call_count >= 5`).
- S6.x outbox-store → `test_w4b_outbox_no_commit_in_store_red.py:25` (`offenders == []`).
- S5.x register-listing → `test_w6_bc_d_register_listing_centralization.py`.
- S3.x approval-execution → `test_w12_committee_authz_parity_red.py:31-34`.
- S7.x schemas → `test_w9_schema_datetime_ban.py`.
- FE invariant → `useAuthz.invariant.test.ts:19-22, 28, 34, 47`.

**Warrant a NEW lock**:
- Generic service-commit ratchet for non-allowlisted services (e.g., `_entity_mutation_lifecycle/lifecycle.py`, `_approval_queue/lifecycle.py`).
- Register-listing centralization for `risks` / `issues` (currently only `kris`/`controls` covered).
- `ArchivableMixin` adoption registry parameterized over a TOML.
- Approval-queue intake commit ban.
- Outbox idempotency-key floor ratchet (`>= 6`).
- Schema typing — ban `Any` in schemas (currently only `import datetime` banned).

**Conflict with `test_architecture_deepening_contracts.py`**:
- KRI history candidates (S3.x) conflict with assertions on lines 974-1000.
- Approval-queue candidates (S6.3) conflict with lines 1041-1071.
- Register-listing candidates (S5.x) conflict with lines 779-823.
- Identity/access split candidates (S7.x) conflict with lines 275-309.
- Auth-session candidates conflict with lines 365-407.

**Out of scope of any current lock**:
- Pure FE refactors that don't touch `policy.ts`, `routing/business.tsx`, or pinned doc paths.
- FE-only docs/translation cleanups.
- Type-cleanup outside `audit/types.py`.
- Additions to non-locked services (`_quarterly_comparison/`, `_notification_inbox/`, `_admin_telemetry/`).
- Dead-code removal.

---

## 4. Loop 2 — Empirical Gates + Deletion-Test Stress

Five gate-runners + three deletion-test agents in parallel.

### 4.1 Empirical gate results

| Gate | Status | Wall-clock | Detail |
| --- | --- | --- | --- |
| Architecture-locks (`make test-architecture-locks`) | ✅ **PASS** | 1.46s | 65/65 invariant tests + W0 harness + snapshot all green |
| Backend lint (`make lint-backend` → ruff + suppression budget) | ✅ **PASS** | 0.16s | Ruff `All checks passed!`; budget `Observed=0, Max=0, Unmatched=0, Expired=0`. Mypy is not invoked by this target. |
| Frontend lint+tsc+build (`make lint-frontend`) | ✅ **PASS** | 29s | ESLint 0 errors / 0 warnings; tsc clean; vite built 3,928 modules in 4.53s; debt-budget passed. cleanup:deadcode flagged 4 unreachable modules (informational). |
| Authz capability contract (`scripts/security/validate_authz_capability_contract.py`) | ✅ **PASS** | 0.32s | All seven gates green. ADR-001 contract is in sync. |
| Fast pytest (`make test-fast` excluding postgres + benchmark) | ✅ **PASS** | 223.88s | 1784 passed, 3 skipped (SQLite-cannot-run-concurrent-writes — deferred to Postgres), 30 deselected (out-of-scope by design), 0 failed, 0 errors. Coverage 88.24% (gate 69%). |

**Conclusion**: every quality gate available locally passes on `main`. No NEW vs PRE-EXISTING triage was needed (working tree clean). The repo is in **excellent health**; the deepening proposals address depth/locality/leverage friction, not bugs.

### 4.2 Notable observations from gate runs

- **Bundle observation**: `dist/assets/main-UiSPUtup.js` is 711.02 kB raw / 207.27 kB gzip. Vite did not emit a `chunks larger than 500 kB` warning, suggesting `build.chunkSizeWarningLimit` is configured to suppress it. Worth flagging.
- **`pytest --durations=5` instrumentation defect**: reported epoch-style timestamps (~1.778e9 s) for `setup` phase rather than real elapsed time. Likely a fixture leaks `time.time()` into the timer. Out-of-scope here but worth tracking.
- **Cleanup:deadcode informational**: `controlFormWorkflow.ts`, `governance/orphanResolutionPresentation.ts`, `kri-form/kriFormWorkflow.ts`, `notifications/resourcePath.ts` flagged as `proven-unused` (matches Loop-0 candidate **S3.11** and surfaces three NEW dead modules).
- **Pre-existing benign warnings**: 1 `PytestUnknownMarkWarning` for `pytest.mark.benchmark`; 16 `DeprecationWarning` for Python 3.12+ deprecated default sqlite3 datetime adapter from `test_open_questionnaire_unique_index_migration.py`.

### 4.3 Deletion-test stress verdicts

Three agents grepped callers across 80+ candidates to judge whether deletion would CONCENTRATE complexity (callers absorb >3 lines each), MOVE complexity (single-caller pass-through), be HYPOTHETICAL_SEAM (only one adapter today), or stand as REAL_SEAM (≥2 adapters / load-bearing).

#### A. Deletion-safe (0 production callers — pure DELETE)

| ID | File | Notes |
| --- | --- | --- |
| **S5.1** | `backend/app/api/v1/endpoints/vendor_link_helpers.py` | 0 prod, 0 test Python callers; ~107 lines duplicating `_vendor_governance/links.py`; only referenced by `docs/security/authorization-capability-contract.json:55,502` (update those entries simultaneously) |
| **S4.4** | `endpoints/issues/_shared/notifications.py` (`_notify_issue_assigned`, `_notify_exception_*`) | 0 prod callers; outbox is the live transport; tests hold them alive |
| **S3.11** | `frontend/src/components/kri-form/kriFormWorkflow.ts` | 0 prod callers; only `tests/frontend/unit/.../EntityFormWorkflow.test.ts:8`. Confirmed by `cleanup:deadcode` audit. |
| **A-N1** | `endpoints/risks/crud/__init__.py:23` re-export of `validate_risk_type` | 0 importers reference `app.api.v1.endpoints.risks.crud.validate_risk_type` |
| **B-N1** | `_issue_workflow/source_validation.py:117-120` underscored aliases (`_ensure_owner_assignable` etc.) | 0 external callers — dead aliases |
| **B-N2** | `_issue_workflow/source_validation.py:9` half-merged refactor | services-side defs have 0 prod importers; endpoints use `endpoints/issues/_shared/` versions |
| **C-N1** | `endpoints/approvals/_shared.py:17 _get_approval_department_id` | 0 visible callers; service-side `get_approval_department_id` has 4 |
| **FE-deadcode-1** | `frontend/src/components/control-form/controlFormWorkflow.ts` | 0 callers per cleanup:deadcode audit |
| **FE-deadcode-2** | `frontend/src/components/governance/orphanResolutionPresentation.ts` | 0 callers per cleanup:deadcode audit |
| **FE-deadcode-3** | `frontend/src/components/notifications/resourcePath.ts` | 0 callers per cleanup:deadcode audit |
| **S1.3** | "inconsistent risk-CRUD commit boundary" | **STALE** — Loop 2 confirmed 0 `await db.commit()` in `endpoints/risks/`. Drop the candidate. |

These 10 deletions are immediately actionable.

#### B. Real consolidation (CONCENTRATES — multiple consumers, mechanical inline)

| ID | File | Consumers | Inline cost |
| --- | --- | --- | --- |
| **S1.4** | `endpoints/risks/crud/_shared.py:8-20 validate_risk_type` (HTTPException copy) | 1 prod | Trivial — change one import; drop 13 lines |
| **S1.6** | `endpoints/risks/id_generation.py` | 1 prod + 2 script | Relocate to `services/_risks/id_generation.py` |
| **S2.1** | `endpoints/_monitoring_response.py` shim | 14 importers | Mechanical 14-import rewrite + 25-line file delete |
| **S2.6** | `_control_execution/link_policy.py:22-45` (load_link_for_control / load_link_for_risk) | 2 callers each | Collapse to one helper; coordinate with `test_architecture_deepening_contracts.py:213-216` |
| **S2.8** | `frontend/src/components/ControlForm.tsx` shim | 3 importers | 3 path rewrites; 1-line file delete |
| **S2.9** | `frontend/src/components/control-form/controlFormUtils.ts` | 3 callers / 2 exports | Inline; remove file |
| **S3.4** | `endpoints/kris/linked_vendors.py` barrel | 4 importers | Rewrite 4 imports; delete barrel; update authz contract JSON |
| **S3.7** | `endpoints/kris/crud/{overdue,due_soon}.py` dept filter | 2 sites, ~36 dup lines | Extract `_filter_by_user_departments` helper |
| **S3.9** | `frontend/src/components/KRIForm.tsx` shim | 1 importer | 1 path rewrite |
| **S4.2** | issue triple-loaders | 11 callers | Delete endpoint copy; repoint imports |
| **S4.3** | triple vendor-resolve+sweep | 5 import sites | Keep `_issue_register/source_mutation.py` as canonical |
| **S4.6** | `source_type_value` 3 verified defs | ~12 sites | Extract canonical helper |
| **S4.10** | `endpoints/issues/_shared/__init__.py` 30 underscored re-exports | ~12-15 used | Drop unused half; rename remaining to public |
| **S5.5** | `endpoints/vendor_reports.py:36-119` row-mappers in router | 1 caller each | Relocate to service module |
| **S5.8** | `frontend/src/components/vendors/Vendor*Tab.tsx` triplet | ~280 dup lines | Extract `<VendorLinkedEntityTab kind="...">` |
| **S6.2** | dual `build_approval_read` projections | 4 endpoint callers | Repoint to service projection; delete endpoint copy |
| **S6.4** | `ApprovalQueuedBanner` vs `KriApprovalQueuedBanner` | 3 consumers | Unify into prop-driven component |
| **S6.5** | `_notification_approval_helpers.can_user_view_approval_resource` (duplicate of `approval_scenario_policy.can_view_approval_resource`) | 1 internal caller | Delete duplicate |
| **S7.3** | `frontend/src/hooks/usePermissions.ts` | 1 (Sidebar.tsx) | Replace with `useAuth() + useAuthz()` directly |
| **S7.4** | `frontend/src/authz/BusinessRouteGuards.tsx` (4 near-identical guards) | 4 routes | Single parametric `<RouteGuard capability="X">` |
| **S7.10** | `endpoints/users/summary.py:_can_view_governance` | 1 caller | Read from `me_capabilities.can_view_governance` |
| **S8.5** | `endpoints/riskhub_questionnaires.py` | 0 routes (file is dead) | Drop empty file + router mount |
| **S8.6** | inline Pydantic in `preferences.py` + `riskhub_questionnaires.py` | 5 models | Move to `app/schemas/`; keep `health.py` inline |
| **S8.7** | `endpoints/admin/capabilities.py` hardcoded | 1 FE consumer | Either delete and infer from platform-admin, or wire to actual feature toggles. **LOAD-BEARING for capability contract**. |
| **S8.10** | `endpoints/reports/legacy_excel.py` (3 routes, all 410) | 0 live | Delete entire file. (Note: `summary_excel.py` and `audit_trail_excel.py` mix live + tombstones — surgical removal of `/excel` routes only.) |
| **S8.11** | admin sub-router 1-route shells (`capabilities.py`, `docs.py`) | n/a | Fold into `console.py` |
| **C-N2** | `require_vendor_access` archive-precedence inconsistency | 2 implementations | **Real bug**: `_vendor_governance/links.py:38-62` orders read-cap→entity-cap→vendor-lookup→write-cap→archive; `vendor_link_helpers.py:24-52` checks archive before write-cap. Resolved by S5.1 deletion. |
| **B-N3** | `_issue_workflow/serialization.py:18,41` bidirectional aliasing | 4 sites | Converge on a single name |

#### C. Real seams — DO NOT delete (load-bearing)

| ID | Reason to keep |
| --- | --- |
| **S1.7** | RiskBase/Risk/RiskUpdate parity needed at 3 layers; address via contract test |
| **S1.9** | `risksPagePresentation.ts` has 5 distinct consumers across pages and detail |
| **S2.4** | Two POST execution endpoints have disjoint URL surfaces; FE depends on each |
| **S2.7** | `linked_risk_names_for_visible_ids` returns `risk.process` — **REAL BUG**, fix in `workflow.py:155` (do not refactor the seam) |
| **S2.10** | Three monitoring packages serve three layers (status/response/execution) |
| **S3.1** | `KRIHistoryService` class — ~80+ test consumers; the class IS the public test contract |
| **S3.13** | `kri_history_service.py` module — ~22 consumers |
| **S5.2** | Three vendor link tables — ADR-010 forward-only migration is high cost |
| **S5.3** | Vendor-link endpoint fragmentation — 3 distinct mount surfaces; FE depends |
| **S5.7** | `Vendor.status` enum — wide reach across BE+FE+tests |
| **S5.9** | `kri_vendor_assignment.py` outside `_vendor_links` — relocate, not delete (4 importers) |
| **S6.1** | `transaction_boundary` — ADR-002 transitional anchor; 18 callers |
| **S6.6** | Privileged-tier 3-way split is genuinely cross-cutting; collapse parameters into `PrivilegeContext` rather than delete |
| **S6.9** | **ADR-002 LOAD-BEARING** — both outbox-then-commit sites verified safe; do NOT collapse |
| **S7.7** | `graph_directory_*` — security-sensitive, separate seams |
| **S7.8** | `services/session/` 8-file — documented state-machine layer |
| **S8.2** | `report_service.py` — 5+ adapters across reports + exports + vendor_reports |
| **S8.3** | `OrphanedItemService` — 6+ adapters; static-method class is the inlining smell, not facade |
| **S8.8** | Dashboard 9-module fanout — mostly 1.5 routes/file but each file has cohesive purpose |
| **S8.9** | Notification 4-module split — refraime as "responsibilities live in flat + package mix; concentrate into one package" |
| **BE-N6** | Protocol-guard prefix tables — appropriate env-driven settings |

#### D. ADR-pinned (deletion requires updating `test_architecture_deepening_contracts.py`)

These 10 candidates are held in place by the deepening contract test; any change pairs with same-commit edits to that test:

| ID | Pin (file:line) |
| --- | --- |
| **S2.2** | `test_architecture_deepening_contracts.py:192` asserts the import string |
| **S2.6** | `test_architecture_deepening_contracts.py:213-216` pins `load_link_for_*` and `reload_link_for_*_response` names |
| **S3.2** | `test_architecture_deepening_contracts.py:998` (negative-assertion list) |
| **S3.3** | `test_architecture_deepening_contracts.py:976-980` constrains forbidden symbols |
| **S3.5** | `test_architecture_deepening_contracts.py:962` `hasattr(correction_plans, "build_kri_correction_plan")` |
| **S4.1** | `test_architecture_deepening_contracts.py:1237` forbids method leak |
| **S6.3** | `test_architecture_deepening_contracts.py:789` forbids cross-package re-import |
| **S7.5** | `test_architecture_deepening_contracts.py:246-257` reads source |
| **S7.6** | `test_architecture_deepening_contracts.py:227-238` asserts identity-of-symbols facade |
| **S8.1** | `test_architecture_deepening_contracts.py:559-568` requires composition-facade shape |
| **S8.3** | `test_architecture_deepening_contracts.py:269,305` references forbidden-import symbol |

#### E. Disconfirmed (drop from candidate list)

| ID | Disconfirmation |
| --- | --- |
| **S1.3** | 0 `await db.commit()` calls in `endpoints/risks/` — claim was stale |
| **S5.4** | `_vendor_governance/reports.py` is the architecture-deepening contract anchor at `:1082` |
| **S6.7** | `scenario_roles_for_approval` triplet has 3 distinct return semantics — not collapsible |
| **S6.8** | `finalize_approval_resolution_plan` is deliberate plan-shaped wrapper; ADR-002 LOAD-BEARING |
| **D-N1** | "capability marker introspection" — the named `required_capability` token doesn't exist as a marker; finding mis-scoped |
| **BE-N3** | "mapper coverage parity" — codebase doesn't use a mapper-module pattern; 0 hits |
| **BE-N1** | "outbox handler recipient-fanout" — named pattern absent; needs concrete file:line |
| **S3.6** | `_kri_history` docstring drift — refactor magnitude (~15 underscore importers) too large for audit-repair scope |
| **S1.8** | `risk_to_summary` mapper — encodes business policy (active KRIs, breach detection); not trivial |
| **S1.2** | Two-level router compositors — only 4 verbs (not 5) own own APIRouter; description partly inaccurate |
| **S2.5** | `serialize_control_brief_for_link` — used cross-module by `_vendor_links/workflow.py:182` |
| **S3.8** | `_int_sort_value` — local utility, not shim |
| **S3.10** | `kriForm.selectors.ts` — 7 meaningful pure functions, real selector module |
| **S4.5** | "three FSMs cross-coupled" — one central `ISSUE_TRANSITIONS` dict; status-literal checks are not separate FSMs |
| **S4.7** | `issueQueryKeys.ts` — verified clean (anonymous-fallback contract) |
| **S4.9** | `_authorization_capabilities/issues.py` re-derives FSM — capability predicates legitimately read state |
| **S5.6** | `vendor_report_policy` split — different layers (RBAC vs query scope) |
| **S6.10** | banner i18n split — DUPLICATE-OF-S6.4 |
| **S8.12** | `_riskhub_config` lazy `__getattr__` — deliberate lazy-loader pattern |

#### F. Real bugs surfaced (NOT deepening — fix-and-go)

These are bugs the audit incidentally found:

1. **S2.7** — `linked_risk_names_for_visible_ids` returns `risk.process` where the function name and consumers expect `risk.name` (`backend/app/services/_control_execution/workflow.py:155`).
2. **C-N2** — `require_vendor_access` archive-precedence inconsistency: divergent ordering between `_vendor_governance/links.py:38-62` and `vendor_link_helpers.py:24-52`. Resolved by S5.1 deletion.
3. **D-N3** — `endpoints/users/summary.py:46-49,60-63` two `except Exception:` blanket-clauses both swallow signal — should narrow to `(SQLAlchemyError, AuthorizationError)`.
4. **D-N2** — `AccessUserRead.capabilities` (`endpoints/access.py:81`, `schemas/access.py:58`) is **not** registered in `docs/security/capability-catalog.json` — contract gap.

---

---

## 5. Loop 3 — Cross-cutting Integration & Sequencing

Eight Opus agents in parallel: capability/transaction/archive/context impact maps, frontend authz cohesion, domain vocabulary, test-surface impact, and sequencing DAG.

### 5.1 Capability contract impact map (ADR-001)

**Touches `*Read.capabilities` schemas**: only D-N2 (`AccessUserCapabilities` at `backend/app/schemas/access.py:64` not registered in `capability-catalog.json`); no surviving candidate changes field-counts on the 6 catalog-registered surfaces (`me_capabilities=18, risk=19, control=20, kri=23, issue=28, vendor=14`).

**Touches `MeCapabilities` builders**: S7.10 `_can_view_governance` reimpl (must route through `services/_authorization_capabilities/me.py:33-74`); S8.7 admin/capabilities.py hardcoded (touches `AdminConsoleCapabilities` semantics — parallel to MeCapabilities, separate response model documented at contract MD line 132 / JSON line 717).

**Touches contract docs / catalog JSON**:
- **S5.1 vendor_link_helpers.py DELETE** — referenced at `authz contract JSON:55,479,502` and `contract MD:121,122` (AUTHZ-VENDORS-READ/WRITE service_policy lines). **Requires removing 4 contract citations**.
- **S3.4 kris/linked_vendors.py barrel** — referenced at `authz contract JSON:368,388,410` and `contract MD:116,117,118` (AUTHZ-KRIS-READ/WRITE/HISTORY backend_authority). **6 citations must update** in lockstep.
- **D-N2** — `capability-catalog.json` has NO `access_user` surface; adding it is a NEW catalog entry (~+15-25 lines).

**Touches frontend `useAuthz` invariant test**: S7.3 `usePermissions` deletion and S7.4 BusinessRouteGuards consolidation must preserve the four invariants asserted by `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts:14-79` (no `?? hasPermission` fallback; `business.tsx` uses `authz.can('read', resource)`; strict reads `meCapabilities.resource_permissions[key] === true`; closed enumeration `{controls, risks, issues, vendors, departments}`).

**Touches `validate_authz_capability_contract.py`**: no code change to the validator itself; the validator runs whenever contract MD/JSON or capability catalog edits land, which happens for S5.1, S3.4, and D-N2.

**Ordering constraints**:
1. **D-N2**: catalog JSON → validator run → frontend Zod schema check.
2. **S5.1**: contract MD edit + JSON edit (4 citations) → file deletion → validator run.
3. **S3.4**: contract MD edit (3 lines) + JSON edit (3 citations) → barrel removal → validator.
4. **S7.10**: route through `build_me_capabilities` → run shell-summary tests → no doc/catalog edit (field set unchanged).
5. **S8.7**: wire endpoint to a real builder → keep field set stable → validator.
6. **S7.3 + S7.4**: policy.ts/useAuthz.ts edits → business.tsx edits → run `useAuthz.invariant.test.ts` LAST (test reads both files via `readFileSync`).

**Net contract delta**: 0 new/removed/renamed capability fields; +1 catalog surface (`access_user` from D-N2); ~-4 contract JSON path-string entries; 0 expected edits to the FE invariant test.

### 5.2 Transaction-ownership impact map (ADR-002)

**Verified counts on current main**:
- `_endpoint_commit_allowlist.toml`: 8 entries (cap `<= 8`)
- `_vendor_governance_service_commit_allowlist.toml`: 4 entries (cap `<= 4`)
- `_riskhub_config_service_commit_allowlist.toml`: 2 entries (cap `<= 2`)
- `OutboxService.enqueue` call sites: 6 (floor `>= 5` with margin 1)

**Strengthens ADR-002**:
- **S4.4** — eliminates parallel non-outbox notification path (outbox is already the live transport).
- **S5.1** — removes 2 endpoint-side `commit_service_transaction` callers (`vendor_link_helpers.py:91,107`).
- **S6.6** — split into 3 narrower helpers preserves outbox-then-commit invariant in each.
- **BE-N7** — converging scheduler tracking on dispatcher's `session.begin()` pattern would retire 4 explicit `db.commit()` calls.

**Risks weakening ADR-002 (mitigations required)**:
- **S6.9** — both sites verified outbox-then-commit; recommend a contract test asserting outbox-call linenum precedes commit-call linenum within `core/approval_helpers.py:286-294` and `_approval_execution/resolution.py:80-88`.
- **BE-N2** — signature compaction must keep `idempotency_key=` keyword-only and not drop call-count below 5.
- **S6.1 inline (REJECTED)** — would create 18 raw `await db.commit()` sites across endpoints, blowing the cap from 8 → 26. **Hold KEEP** decision.

**Allowlist delta after surviving candidates land**: zero change to all three TOML registries.

**Net ADR-002 verdict**: backlog **strengthens** ADR-002 on net; outbox-store flush-only invariant preserved (`test_w4b_outbox_no_commit_in_store_red.py:25` `offenders == []` floor holds).

### 5.3 Archive-semantics impact map (ADR-005)

**Allowlist (`_archive_allowlist.toml`)** — 4 current entries (`_archivable.py`, `key_risk_indicator.py`, two alembic migrations). No surviving candidate adds or removes rows except the S5.7 unify-finalization migration (transient +1 until backfill verified, then -1).

**`archived_clause(...)` consumers**:
- **S5.5 vendor_reports** — preserves predicate by importing `archived_clause` in the relocated mapper module.
- **S5.7 Vendor.status enum drop** — touches `archived_clause` itself (`_archivable.py:58-71`); removes the legacy `vendors → ('inactive',)` branch. Predicate **simplification**, not replacement; callers untouched.
- **S5.1, S5.2, S5.8, S3.7, S2.7, S6.6** — no `archived_clause` interaction.

**Legacy compat aliases**:
- Vendor `status='inactive'` already unreachable from new writes (enum collapsed to `{active}`); S5.7 finalizes the cleanup.
- Risk/Control `status='archived'` aliases — untouched by this backlog.

**Sequencing with ADR-010**:
S5.7 is the only ADR-005 × ADR-010 intersection. Sequence: staging rehearsal → forward-only migration (drop column or CHECK constraint) → code change. S5.2 (vendor link tables) requires migration but doesn't touch archive columns.

**Net ADR-005 verdict**: **strengthens**. S5.1 collapses two divergent `require_vendor_access` orderings; S5.7 cleanly amputates one of two legacy compat branches in `archived_clause` itself.

### 5.4 Bounded-context cohesion (ADR-007)

**Per-context candidates**:
- `_riskhub_config`: S8.7, S8.12 (LIKELY-FALSE).
- `_identity_access_lifecycle`: S7.5, S7.6, S7.7 (proposed `_directory_adapter` sub-context), S7.10.
- `_vendor_governance` / `_vendor_links`: S5.1, S5.2, S5.3, S5.5, S5.7, S5.9.
- `_register_listings`: S3.7, S5.5 (cross).
- `_approval_execution` / `_approval_queue`: S6.2, S6.3, S6.5, S6.6, S6.9.
- `_entity_mutation_lifecycle`: S1.4, S1.6, S6.6 (consumer), S2.7.
- `_kri_history`: S3.1, S3.2, S3.3, S3.4, S3.5, S3.7, S3.12, S3.13.

**Cross-context straddlers (coordinate as one cross-cutting effort, not split)**:
- **S2.10** — monitoring 3-package split spans `_control_execution` + `_monitoring_status` + `_monitoring_response`.
- **S2.4** — dual POST execution spans `_control_execution` + endpoints layer.
- **S4.3** — triple vendor-resolve spans `_issue_workflow` + `_issue_register` + endpoints.
- **S6.6** — privileged-tier 3-way spans `_approval_execution` + `_kri_history` + `_entity_mutation_lifecycle`.

**Context naming consistency**: codebase has ~35 underscore-prefixed packages; ADR-007 names only 7. New names implied by the backlog: `_directory_adapter` (S7.7), `_vendor_links` enriched (S5.9 host).

**Suggested ADR-007 amendment** (3 short additions):
1. **Adapter contexts**: "Directory and identity adapters (`_directory_adapter`, currently `graph_directory_*`) sit beneath `_identity_access_lifecycle` and own external-system integration."
2. **Read-shape contexts**: "Listing/projection contexts (`_register_listings`, `_monitoring_status`, `_monitoring_response`) compose read-shape from the seven core contexts; they do not own write-side invariants."
3. **Workflow contexts**: "Workflow-paired contexts (`_approval_queue`/`_approval_execution`, `_issue_register`/`_issue_workflow`, `_vendor_links`/`_vendor_governance`) form intake/execution pairs and ship together for atomicity."

**Net ADR-007 verdict**: ADR-007 captures write-side business contexts but the codebase has organically grown read-shape, workflow-paired, and adapter contexts that the ADR silently relies on. Most surviving candidates strengthen one of these unnamed contexts — ADR-007 should be amended to name the three additional context categories.

### 5.5 Frontend authz cohesion

**Verified safe (preserve invariants 1-4)**: S2.8, S3.9, S6.4, S2.9, S3.11, S1.5, S1.9, S5.5, FE-N1, FE-N2, FE-N4, FE-N6, FE-N7, FE-N8.

**Risk candidates (mitigation required)**:
- **S5.8** — Vendor*Tab consolidation must keep `entity.capabilities` per-row capability resolver via `resolveCapabilityFlag` (`frontend/src/lib/capabilities.ts:5-10`). Do not collapse to a boolean union.
- **S7.3** — usePermissions deletion is safe iff caller migration uses `authz.can(...)` rather than re-introducing `hasPermission(` in `business.tsx`.
- **S7.4** — BusinessRouteGuards consolidation must keep the closed enumeration `{controls, risks, issues, vendors, departments}` (asserted as `Set` equality at `useAuthz.invariant.test.ts:46-48`). New parametric API must avoid emitting new `authz.can('read', …)` literals into `business.tsx`.
- **S7.8** — `services/session/` consolidation must keep `SessionSnapshot.user.me_capabilities` reachable; otherwise `buildAuthz` falls into legacy branch.
- **FE-N3** — zod base helper must produce exact field counts (catalog: `me_capabilities=18, risk=19, control=20, kri=23, issue=28, vendor=14`). Use `z.object({ ... }).strict()` per surface; lock with snapshot test against catalog JSON.
- **FE-N5** — AuthContext split must keep `user.me_capabilities` reachable via `useAuth()` for non-strict callers and via `useAuthz()` for strict path. Memoization must preserve referential stability.

**Net useAuthz invariant impact**: zero literal-changes to the four pinned assertions if the mitigations above are honored.

### 5.6 Domain vocabulary alignment

**Concepts canonical in BUSINESS_LOGIC.md** (already authoritative): Role, Access Scope, Risk Owner / Control Owner / Reporting Owner / Department Manager, Pending_Privileged, Tiered Approval, Approval Scenario, Sensitive Field, Priority Risk vs High-Risk threshold, Cross-Department Ownership, Archived/Restored, Orphan, Issue Lifecycle states, source_type taxonomy, Linked Vendor, Monitoring Status, Break-glass.

**Concepts proposed by the backlog needing glossary entries**:
- "Escalation roster" (BE-N1) → BL §5.7 (new).
- "Actor payload" (BE-N2) → BL §9.4 (new sub-section).
- "Display name" + "Safe label" (BE-N4) → BL §9.2 sub-section.
- "Guarded prefix" / "API surface registry" (BE-N6) → ADR-009 amendment.
- "Outbox dispatcher convergence with SchedulerJobRun" (BE-N7) → ADR-002 §Outbox extension.
- "Owned entity" (BE-N8) → BL §2 preamble (new).
- "Privilege context" (S6.6) → authorization-capability-contract.md §Vocabulary.
- "Vendor link reconciliation" (S5.9) → BL §11.5 sub-section.
- "Monitoring fact" (S2.10) → BL §2.2/§2.3 extension.
- "Graph directory" (S7.7) → authz contract Vocabulary row.
- "Query keys registry" (FE-N1) → frontend ADR or DOCUMENTATION_TREE.md.
- "CRUD capability shape" (FE-N3) → authz contract Vocabulary.
- "Dashboard widget" / "WidgetShell" (FE-N8) → BL §10.4.

**Concepts with active drift (resolve as audit prerequisite)**:
- **"Owner"** disambiguation → BL §2 (canonical four named roles; ban bare "Owner" in new code/docs).
- **"Capability"** three meanings → authorization contract §Vocabulary; adopt `RouteCapability` / `RowCapability` / `CatalogCapability`.
- **"archived vs inactive"** → ADR-005 + BL §10.5; label "Inactive" only as `ControlStatus.inactive`.
- **"Orphan"** → promote to BL §3.3 subsection.
- **"Break-glass"** → BL §1.4 sub-section consolidating BL:125 + authz lines 107,109.
- **"Priority risk vs high-risk"** → BL §6.2 + §8.4 disambiguation.
- **"Scenario"** → distinguish Approval Scenario (BL §6.3) from "Risk scenario" (questionnaire content).

**Suggested `docs/CONTEXT.md` skeleton** (single ubiquitous-language entry point linking out to canonical sources):
1. Roles → BL §1.1-1.3, GLOSSARY.md:10-22.
2. Core Entities → BL §2 + GLOSSARY.md:23-34.
3. Workflow Verbs → BL §5 + §11.1 + §8.5/§8.6 + ADR-002 §Outbox.
4. Access Vocabulary → authz contract §Vocabulary + ADR-001 + CLAUDE.md.
5. State Machines → BL §5.1 + §11.1 + §8.4 + ADR-005.
6. Capability Surfaces → authz contract Matrix + capability-catalog.json + per-resource Read schemas.

**Net vocabulary verdict**: backlog modestly **muddies** language unless landed with the targeted glossary additions. Recommend gating any deepening PR introducing a new public-name concept on a same-PR Glossary/CONTEXT.md edit; treat the seven drift items as a prerequisite cleanup before the rest of the backlog lands.

### 5.7 Test-surface impact

**Tests that survive unchanged**: all `tests/backend/pytest/api/v1/test_*.py` integration tests using `client_factory`; the FE `useAuthz.invariant.test.ts` (assuming mitigations); architecture-lock TOMLs (allowlists update via cited candidates only).

**Tests that change shape**:
- `tests/backend/pytest/test_architecture_deepening_contracts.py` — same-commit edits required for S2.2, S2.6, S3.2, S3.3, S3.5, S4.1, S6.3, S7.5, S7.6, S8.1, S8.3 (the 10 ADR-pinned candidates). Becomes the **load-bearing single coordination point** for shape changes.
- `_endpoint_commit_allowlist.toml` and `_capabilities_all_allowlist.toml` rows re-pointed at canonical service modules.
- `tests/backend/pytest/test_dashboard.py:960` and `test_e2e_seed_archive_state_red.py:13` — under S5.7, `VendorStatus` import becomes a compat-shim import (one-line shape change).

**Tests that become unnecessary**:
- `tests/frontend/unit/src/components/risks/__tests__/riskOverviewHelpers.test.ts:1-37` — S1.5 inline.
- `tests/frontend/unit/src/components/kri-form/kriForm.selectors.test.ts:1-64` — S3.10 inline (but S3.10 is FALSE-flagged; tests likely stay).
- `tests/frontend/unit/src/components/__tests__/EntityFormWorkflow.test.ts:1-34` — S3.11 inline. Note: deletion competes with `test_frontend_workflow_helpers_are_used_by_production_code` (`test_architecture_deepening_contracts.py:1330`) — must relax in same commit.
- BE pure-function microtests paired with inlined helpers.

**New architecture-lock invariants enabled by the backlog** (8 proposed):
- `test_no_endpoint_commits_under_risks_red.py` (S1.3 codification — vacuously true today).
- `test_no_parallel_vendor_link_primitives_red.py` (S5.1).
- `test_single_can_view_approval_resource_red.py` (S6.5).
- `test_single_approval_queued_banner_red.py` (S6.4).
- `test_no_use_permissions_reexport_red.py` (S7.3).
- `test_no_pydantic_basemodel_in_endpoints_red.py` (S8.6 — currently 3 violators: `health.py`, `riskhub_questionnaires.py`, `preferences.py`).
- `test_no_vendor_status_enum_outside_compat_shim_red.py` (S5.7 post-migration).
- `test_dept_filter_consolidation_red.py` (S3.7 — currently violated in `lookups.py:32`, `departments/list.py:43,49`, `dashboard/departments.py`).

**Net delta**: architecture-lock invariants 34 → projected **42**. ~−4 FE microtests, +8 architecture invariants, ~11 contract-pin clauses re-shaped. Coverage may drop −1.5 to −3pp on inlined modules unless edge-case branches are folded into surviving page/component tests in the same PR.

**Net test-surface verdict**: improves test surface in line with "interface = test surface" principle, contingent on (a) folding microtest edge cases into higher-level tests during the same PR, and (b) treating `test_architecture_deepening_contracts.py` as the single coordination point for shape changes.

### 5.8 Sequencing graph (DAG)

**Tier 0 — Independent leaves**: S5.1, S4.4, S3.11, A-N1, B-N1, B-N2, C-N1, FE-deadcode-{1,2,3}, S1.4, S1.6, S2.1, S2.6, S2.8, S2.9, S3.7, S3.9, S4.2, S4.6, S5.5, S5.8, S6.2, S6.4, S6.5, S7.3, S7.4, S8.5, S8.6, S8.10, S8.11, B-N3, BE-N2, BE-N4, BE-N6, BE-N8, FE-N1, FE-N4, FE-N6, S7.9 (ADR doc), S3.12 (ADR doc), S6.6, S7.7.

**Tier 1 — Depends on Tier 0**:
- C-N2 ← S5.1
- S4.3 ← canonical-home decision
- S4.10 ← S4.2, S4.3
- S3.4 ← capability-contract JSON update
- S7.10 ← capability-builder layer
- S8.7 ← capability-contract docs
- FE-N2, FE-N3, FE-N7 ← FE-N1
- S2.10 ← S2.1
- S3.12 implementation ← S3.12 ADR

**Tier 2 — Depends on Tier 1**:
- BE-N7 ← BE-N2
- FE-N5 ← S8.7 + S7.10
- FE-N8 ← FE-N5
- S5.9 ← S5.2 mixin

**Tier 3 — Migration-coupled or LOAD-BEARING (dedicated windows)**:
- S5.2 (ADR-010 forward-only migration)
- S5.7 (bundled with S5.2 migration window)
- S7.8 (LOAD-BEARING; defer until S7.9 ratified, FE-N5 stable)

**Cycle check**: no cycles detected.

**Recommended landing buckets**:
1. **Bucket A** (≈1 day) — Tier 0 deletions and trivial inlines: S5.1, S4.4, S3.11, A-N1, B-N1, B-N2, C-N1, FE-deadcode, S8.5, S8.10, S8.11, C-N2 (with S5.1).
2. **Bucket B** — Tier 0/1 consolidations needing same-commit contract-test edits: S1.4, S1.6, S2.1, S2.6, S2.8, S2.9, S3.7, S3.9, S4.2, S4.3, S4.6, S5.5, S5.8, S6.2, S6.4, S6.5, S8.6, B-N3, BE-N2, BE-N4, BE-N6, BE-N8 (S4.10 trails S4.2/S4.3 within this bucket).
3. **Bucket C** — Tier 1 frontend refactors: FE-N1 → FE-N2/FE-N3/FE-N7 (parallel); FE-N4, FE-N6 alongside; S7.3, S7.4.
4. **Bucket D** — Cross-cutting refactors: S2.10 (after S2.1), S6.6, S7.7, S7.9 (ADR doc), S3.12 ADR + cleanup, S3.4 (after capability-contract JSON sync), S7.10 (after capability builder), S8.7 (LOAD-BEARING), BE-N7 (after BE-N2).
5. **Bucket E** — Tier 3 migration-coupled: S5.2 (ADR-010 migration window), S5.9 (after S5.2 mixin), S5.7 (bundled with S5.2 migration), S7.8 (after S7.9 + FE-N5), FE-N5 (LOAD-BEARING), FE-N8 (after FE-N5).

```
TIER 0 (leaves)                          TIER 1                       TIER 2/3
---------------                          ------                       ----------

S5.1 ───────────────────────► C-N2

S2.1 ──────────────────────► S2.10

S4.2 ─┐
      ├──────────────────► S4.10
S4.3 ─┘

cap-contract docs ──► S8.7 ──► S7.10 ──► FE-N5 ──► FE-N8
                  └─► S3.4

FE-N1 ─┬──► FE-N2
       ├──► FE-N3
       └──► FE-N7

BE-N2 ───────────────────────► BE-N7

S3.12-ADR ───────────────────► S3.12-impl

ADR-010 migration window ──► S5.2 ─┬──► S5.9
                                   └──► S5.7   (bundled)

S7.9 (ADR-011) ──────────────► S7.8
```

---

---

## 6. Loop 4 — Final Synthesis

Eight Opus agents in parallel produced the final write-up: three domain-triplet agents (Tier 1 / Tier 2 / Tier 3) using the skill's exact template, a ranking + risk register, an out-of-scope register, a process / CI gap report, three ADR drafts, and a domain-vocabulary report with a `CONTEXT.md` skeleton.

### 6.1 Tier 1 — Immediate-action candidates (skill template)

The deliverable for the first sprint. 19 entries; aggregate effort estimate ~3-5 engineer-days; aggregate risk low.

#### 1. `validate_risk_type` re-export drop (A-N1)

- **Files**: `backend/app/api/v1/endpoints/risks/crud/__init__.py:23`
- **Problem**: Module surface advertises a name with zero importers — pure Interface bloat. The re-export creates a phantom Seam that suggests `crud.__init__` is a meaningful integration point when callers reach into the underlying modules directly. No Leverage, no Locality benefit.
- **Solution**: Remove the line from `__init__.py`. The underlying `_shared.validate_risk_type` (or its policy successor — see entry 19) remains; only the package-level re-export disappears.
- **Benefits**: One less symbol in the public crud surface; readers stop wondering whether `from .crud import validate_risk_type` is a sanctioned import path. No test churn.
- **ADR/lock**: Consistent with ADR-005 module-cohesion intent.
- **Tier**: 1 / **Effort**: trivial / **Risk**: low.

#### 2. Underscored alias cleanup in source-validation (B-N1)

- **Files**: `backend/app/services/_issue_workflow/source_validation.py:117-120`
- **Problem**: Underscored aliases shadow the canonical names with zero external callers. Pure Interface duplication that violates truth-in-naming.
- **Solution**: Delete the four alias lines. Keep canonical names only.
- **Benefits**: Smaller module surface; eliminates "which spelling is the real one?" ambiguity.
- **ADR/lock**: Consistent with ADR-005 and `_naming_allowlist.toml`.
- **Tier**: 1 / **Effort**: trivial / **Risk**: low.

#### 3. Frontend `kriFormWorkflow.ts` delete (S3.11)

- **Files**: `frontend/src/components/kri-form/kriFormWorkflow.ts` (14 lines), `tests/frontend/unit/src/components/__tests__/EntityFormWorkflow.test.ts:1-34`, `tests/backend/pytest/test_architecture_deepening_contracts.py:1330`
- **Problem**: 14-line Module with one consumer — its own test. The "workflow" name implies orchestration Depth, but the Implementation is a thin pass-through.
- **Solution**: Delete the workflow file and the corresponding test. In the same commit, relax the deepening-contract ratchet at `:1330` so the lock matches reality.
- **Benefits**: Removes a fictional KRI form Seam; tests stop being tautological.
- **ADR/lock**: Same-PR contract update; not a contradiction.
- **Tier**: 1 / **Effort**: trivial / **Risk**: low.

#### 4. Frontend `controlFormWorkflow.ts` delete (FE-deadcode-1)

- **Files**: `frontend/src/components/control-form/controlFormWorkflow.ts`
- **Problem**: Mirror of entry 3 in the controls domain — module exists; production callers do not.
- **Solution**: Delete the file and any test-only imports.
- **Benefits**: Locality — control form workflow lives in the form component.
- **ADR/lock**: Consistent with ADR-005.
- **Tier**: 1 / **Effort**: trivial / **Risk**: low.

#### 5. Frontend `orphanResolutionPresentation.ts` delete (FE-deadcode-2)

- **Files**: `frontend/src/components/governance/orphanResolutionPresentation.ts`
- **Problem**: Presentation helper for orphan-resolution flows with no live consumers.
- **Solution**: Delete the file.
- **Benefits**: Smaller governance surface; one canonical orphan-resolution rendering path.
- **ADR/lock**: Consistent with ADR-005.
- **Tier**: 1 / **Effort**: trivial / **Risk**: low.

#### 6. Frontend `resourcePath.ts` delete (FE-deadcode-3)

- **Files**: `frontend/src/components/notifications/resourcePath.ts`
- **Problem**: Notification path-resolution helper with zero importers.
- **Solution**: Delete the file.
- **Benefits**: Notifications module stops advertising two ways to compute resource paths.
- **ADR/lock**: Consistent with ADR-005.
- **Tier**: 1 / **Effort**: trivial / **Risk**: low.

#### 7. Approvals `_get_approval_department_id` shim delete (C-N1)

- **Files**: `backend/app/api/v1/endpoints/approvals/_shared.py:17`
- **Problem**: Endpoint-local helper with no visible callers; the service-side equivalent has four. Classic duplicated Implementation across the endpoint/service Seam.
- **Solution**: Delete the endpoint-side helper. Future callers import the service-side version.
- **Benefits**: Single source of truth for approval-department resolution.
- **ADR/lock**: Consistent with ADR-002 + ADR-005.
- **Tier**: 1 / **Effort**: trivial / **Risk**: low.

#### 8. Duplicate source-validation impls delete (B-N2)

- **Files**: `backend/app/services/_issue_workflow/source_validation.py:9-114`
- **Problem**: Services-side validation routines duplicate the endpoints-side `endpoints/issues/_shared/` versions; service copies have zero production importers.
- **Solution**: Delete the duplicated implementation block. The endpoints `_shared` versions remain the live path.
- **Benefits**: Issue-domain validation has one home.
- **ADR/lock**: Consistent with ADR-002 + ADR-005.
- **Tier**: 1 / **Effort**: trivial / **Risk**: low.

#### 9. Approvals `can_user_view_approval_resource` duplicate delete (S6.5)

- **Files**: `backend/app/services/_notification_approval_helpers.py:72-79`, `backend/app/services/approval_scenario_policy.py:134-142`
- **Problem**: Two byte-identical Implementations of approval-visibility policy.
- **Solution**: Delete the endpoint-side function. Repoint the single internal caller to the `approval_scenario_policy` version.
- **Benefits**: Approval-visibility policy obeys the capability contract from one Module.
- **ADR/lock**: Strengthens ADR-005 (capability ownership).
- **Tier**: 1 / **Effort**: trivial / **Risk**: low.

#### 10. Questionnaires endpoint module delete (S8.5)

- **Files**: `backend/app/api/v1/endpoints/riskhub_questionnaires.py` and its router mount
- **Problem**: Module exposes zero routes; nothing routes traffic through it.
- **Solution**: Delete the file and remove its `include_router` mount.
- **Benefits**: API surface in `api.py` matches the live OpenAPI document.
- **ADR/lock**: Consistent with ADR-005.
- **Tier**: 1 / **Effort**: trivial / **Risk**: low.

#### 11. Risk-execution `risk.process` truth-in-naming fix (S2.7)

- **Files**: `backend/app/services/_control_execution/workflow.py:155`
- **Problem**: Implementation returns `risk.process` where consumers expect `risk.name`. Real bug — the Adapter lies about what it returns.
- **Solution**: Change the return to `risk.name`. Add a regression test.
- **Benefits**: Control-execution notifications and audit entries display the correct name. Bug-fix locality.
- **ADR/lock**: Consistent with ADR-002. No lock change required.
- **Tier**: 1 / **Effort**: trivial / **Risk**: low.

#### 12. Users-summary blanket-except narrowing (D-N3)

- **Files**: `backend/app/api/v1/endpoints/users/summary.py:46-49,60-63`
- **Problem**: Two `except Exception:` blocks swallow every error and convert them to silent zeros.
- **Solution**: Narrow to `(SQLAlchemyError, AuthorizationError)`. Let everything else propagate.
- **Benefits**: Operational visibility returns; integrity errors and authz denials surface.
- **ADR/lock**: Consistent with ADR-003 (uniform error mapping).
- **Tier**: 1 / **Effort**: trivial / **Risk**: low.

#### 13. Vendor-link helpers shim delete + contract sync (S5.1 + C-N2)

- **Files**: `backend/app/api/v1/endpoints/vendor_link_helpers.py` (107 lines), `docs/security/authorization-capability-contract.md:121,122`, `docs/security/authorization-capability-contract.json:55,479,502`
- **Problem**: 107-line endpoint module duplicates `_vendor_governance/links.py` with zero production callers. The capability contract still cites the dead Module (4 citations). C-N2 archive-precedence inconsistency surfaces in the contract.
- **Solution**: Delete `vendor_link_helpers.py`. In the same PR, update the four contract citations to point at `_vendor_governance/links.py`. Run `validate_authz_capability_contract.py`.
- **Benefits**: Vendor-link authorization has one Implementation. Resolves archive-precedence inconsistency in one shot.
- **ADR/lock**: Strengthens ADR-005 + ADR-001.
- **Tier**: 1 / **Effort**: low / **Risk**: low.

#### 14. Issues outbox-only notification cleanup (S4.4)

- **Files**: `backend/app/api/v1/endpoints/issues/_shared/notifications.py` (`_notify_issue_assigned`, `_notify_exception_*`), `tests/backend/pytest/api/v1/test_issue_workflow.py:679,685`
- **Problem**: Three notification helpers with zero production callers — outbox is the live transport. Direct-send Adapters maintain a parallel Seam contradicting the outbox contract.
- **Solution**: Delete the three functions. Rewrite the two test sites to assert outbox enqueues — production already does this.
- **Benefits**: Issue notifications have exactly one delivery path; transactional ordering preserved.
- **ADR/lock**: Strengthens ADR-002 (transactional outbox ownership).
- **Tier**: 1 / **Effort**: low / **Risk**: low.

#### 15. `access_user` capability catalog gap (D-N2)

- **Files**: `docs/security/capability-catalog.json`, `backend/app/schemas/access.py:64` (`AccessUserCapabilities`)
- **Problem**: Schema defines `AccessUserCapabilities` but the catalog Interface omits it.
- **Solution**: Add the `access_user` capability surface (~15-25 lines) mirroring the schema fields.
- **Benefits**: Closes the contract gap; validator covers all capability surfaces; frontend `useAuthz` invariant tests can pin access-user capabilities.
- **ADR/lock**: Strengthens ADR-005 + ADR-001 capability-contract regime.
- **Tier**: 1 / **Effort**: low / **Risk**: low.

#### 16. Reports legacy-excel tombstone removal (S8.10)

- **Files**: `backend/app/api/v1/endpoints/reports/legacy_excel.py` (3 routes, all 410), `summary_excel.py:97-103`, `audit_trail_excel.py:133-139`
- **Problem**: Tombstone routes return HTTP 410 indefinitely; dead Interface preserved past deprecation window.
- **Solution**: Delete `legacy_excel.py` and unmount it. Surgically remove the `/excel` tombstone blocks at `summary_excel.py:97-103` and `audit_trail_excel.py:133-139`. Verify `_endpoint_commit_allowlist.toml` entries removed in same PR.
- **Benefits**: Reports surface matches what's exposed; OpenAPI clients stop seeing tombstones.
- **ADR/lock**: Consistent with ADR-005.
- **Tier**: 1 / **Effort**: low / **Risk**: low.

#### 17. `_monitoring_response` shim consolidation (S2.1)

- **Files**: `backend/app/api/v1/endpoints/_monitoring_response.py`, 14 endpoint import sites
- **Problem**: Endpoint-side shim re-exports from the service-side Module with no transformation. Phantom Seam suggesting endpoint-layer ownership of monitoring-response shaping.
- **Solution**: Delete the endpoint shim. Mechanically rewrite the 14 endpoint imports to point at `app.services._monitoring_response`.
- **Benefits**: Monitoring-response shaping has one canonical home; one fewer "where do I add a new monitoring field?" ambiguity.
- **Tier**: 1 / **Effort**: low / **Risk**: low.

#### 18. Approvals `_build_approval_read` consolidation (S6.2)

- **Files**: `endpoints/approvals/_shared.py:34-61`, `services/_approval_queue/projection.py:13-39`, callers `detail.py:56`, `resolve.py:61,85,102`, lock `test_architecture_deepening_contracts.py:1029`
- **Problem**: Endpoint-side `_build_approval_read` duplicates the canonical service-side `build_approval_read`. Drift waiting to happen.
- **Solution**: Delete the endpoint helper. Repoint the four callers. Confirm the existing contract pin still passes.
- **Benefits**: Approval read projection has one source of truth.
- **ADR/lock**: Strengthens ADR-005 + ADR-002.
- **Tier**: 1 / **Effort**: low / **Risk**: low.

#### 19. Risk-type validation policy unification (S1.4)

- **Files**: `endpoints/risks/crud/_shared.py:8-20`, `endpoints/risks/crud/create.py:35`, `services/_entity_mutation_lifecycle/policy.py:29-39`
- **Problem**: Two `validate_risk_type` Implementations behind the same name — endpoint copy raises `HTTPException`, service copy raises `ValidationError`. ADR-003 mandates uniform error mapping.
- **Solution**: Delete the endpoint copy. Update `create.py:35` to import from `_entity_mutation_lifecycle/policy.py`. Rely on the global `ValidationError → 400` mapping.
- **Benefits**: Risk-domain mutation policy has one home.
- **ADR/lock**: Strengthens ADR-005 + ADR-003.
- **Tier**: 1 / **Effort**: low / **Risk**: medium (verify HTTP behavior parity).

### 6.2 Tier 2 — Bucket-B/C consolidations (skill template)

Consolidations that touch `test_architecture_deepening_contracts.py` and TOML registries. ~30 entries.

#### 20. Risk ID generation co-location (S1.6)
- **Files**: Move `endpoints/risks/id_generation.py` → `services/_entity_mutation_lifecycle/id_generation.py` (1 endpoint + 2 script importers).
- **Problem**: Pure ID-generation utility lives under `endpoints/`, violating the endpoint-as-orchestration lock.
- **Solution**: Move into the entity-mutation-lifecycle service package. Rewrite three import sites.
- **ADR/lock**: ADR-002. **Effort**: trivial / **Risk**: low.

#### 21. Control-Risk link loader unification (S2.6)
- **Files**: `services/_control_execution/link_policy.py:22-45`; lock `test_architecture_deepening_contracts.py:213-216`.
- **Problem**: Two specialized loaders (`load_link_for_control`, `load_link_for_risk`) wrap the same SELECT in different argument orders.
- **Solution**: Collapse into one keyword-only `load_link(db, *, control_id, risk_id)`. Update the lock in same commit.
- **ADR/lock**: ADR-005. **Effort**: low / **Risk**: low.

#### 22. ControlForm shim deletion (S2.8)
- **Files**: Delete `frontend/src/components/ControlForm.tsx`; update 3 importers.
- **Problem**: Compatibility shim re-exporting `ControlFormContainer`.
- **Solution**: Delete; rewrite 3 import sites.
- **Effort**: trivial / **Risk**: low.

#### 23. controlFormUtils inlining (S2.9)
- **Files**: Delete `frontend/src/components/control-form/controlFormUtils.ts`; update 3 callers.
- **Problem**: Bundles 2 unrelated helpers — low-cohesion utilities barrel.
- **Solution**: Inline each helper into its sole consumer.
- **Effort**: trivial / **Risk**: low.

#### 24. KRI linked-vendors barrel removal (S3.4)
- **Files**: Delete `endpoints/kris/linked_vendors.py`; update 4 importers; coordinate `authorization-capability-contract.json:368,388,410` and `.md:116,117,118`.
- **Problem**: 5-line barrel re-exporting from `_kri_history/value_application.py`. Endpoint barrel cross-layer leak.
- **Solution**: Delete the barrel. Rewrite 4 KRI CRUD endpoints to import from the service module. Update 6 capability-contract citations atomically.
- **ADR/lock**: ADR-001. **Effort**: low / **Risk**: medium (atomic doc/code commit).

#### 25. KRI department-scope helper extraction (S3.7)
- **Files**: `endpoints/kris/crud/{overdue,due_soon}.py`; new `_filter_by_user_departments` + `KRIDeadlineRow` schema.
- **Problem**: ~36 duplicated lines filtering KRI deadline rows by user department scope.
- **Solution**: Extract helper, push filter into queries, type response with Pydantic schema.
- **ADR/lock**: ADR-001. **Effort**: low / **Risk**: low-medium.

#### 26. KRIForm shim deletion (S3.9)
- **Files**: Delete `frontend/src/components/KRIForm.tsx`; update `pages/KRINewPage.tsx:5`.
- **Problem**: Same pattern as #22 in KRI domain. One importer.
- **Effort**: trivial / **Risk**: low.

#### 27. Issue loading duplicate deletion (S4.2)
- **Files**: Delete `endpoints/issues/_shared/loading.py:22-66`; keep `services/_issue_workflow/loading.py:22-70`; repoint 11 callers.
- **Problem**: Byte-identical Issue-loader implementation in both modules.
- **Solution**: Delete endpoint copy; repoint 4 endpoint + 7 service callers.
- **ADR/lock**: ADR-002. **Effort**: low / **Risk**: low.

#### 28. Issue source-mutation triplicate collapse (S4.3)
- **Files**: Keep `services/_issue_register/source_mutation.py:28-97` as canonical; delete `services/_issue_workflow/source_validation.py:45-114` and `endpoints/issues/_shared/links.py:11-81`.
- **Problem**: Three byte-identical implementations.
- **Solution**: Promote `_issue_register/source_mutation.py` as canonical; delete the two other copies.
- **ADR/lock**: ADR-002. **Effort**: low / **Risk**: low.

#### 29. Source-type vocabulary canonicalization (S4.6)
- **Files**: Add `services/_issue_register/constants.py` `source_type_value(source_type) -> str`; replace 3 local defs; update ~12 use sites.
- **Problem**: Three competing local definitions across Issue services.
- **Solution**: Create canonical helper; replace all 3 local defs with imports.
- **ADR/lock**: ADR-002. **Effort**: low / **Risk**: low.

#### 30. Issue `_shared/__init__.py` underscore re-export pruning (S4.10)
- **Files**: `endpoints/issues/_shared/__init__.py:1-79`.
- **Problem**: 30 underscored re-exports; only ~12-15 actually consumed.
- **Solution**: Drop unused re-exports; rename survivors to public.
- **Effort**: low / **Risk**: low. Sequence after #27, #28.

#### 31. Vendor reporting service extraction (S5.5)
- **Files**: Move `endpoints/vendor_reports.py:36-119` (`_annual_report_rows`, `_dora_register_rows`) → `services/vendor_reporting_service.py`.
- **Problem**: ~84 lines of Vendor reporting row-shaping logic embedded in the HTTP router.
- **Solution**: Move into a service module. Router becomes 4-line orchestration.
- **Effort**: medium / **Risk**: low-medium.

#### 32. Vendor linked-entity tab generic (S5.8)
- **Files**: Add `frontend/src/components/vendors/VendorLinkedEntityTab.tsx` + `useVendorLinkedTab<T>`; replace `VendorLinkedRisksTab.tsx`, `VendorLinkedControlsTab.tsx`, `VendorLinkedKRIsTab.tsx`.
- **Problem**: ~280 duplicated lines across three tabs.
- **Solution**: Extract `<VendorLinkedEntityTab kind="risk|control|kri">` parametric component + hook.
- **Effort**: medium / **Risk**: low-medium.

#### 33. Approval queued banner unification (S6.4)
- **Files**: Unify `forms/ApprovalQueuedBanner.tsx` + `kri-form/KriApprovalQueuedBanner.tsx`.
- **Problem**: Two near-identical banner components.
- **Solution**: Make canonical banner accept `approvalId` + `onClose`; call `useTranslation` itself; delete KRI variant.
- **Effort**: low / **Risk**: low.

#### 34. Privileged-tier resolve authorization helper (S6.6)
- **Files**: Add `services/_approval_execution/authorization.py:assert_can_resolve(db, approval, current_user, *, intent)`; replace checks at `authorization.py:36-57,60-116` and `approval_execution_service.py:215-238`.
- **Problem**: Privileged-tier approve/reject expressed as three near-parallel inline checks.
- **Solution**: One assertion entry point. Helper stays read-only; caller owns transaction.
- **ADR/lock**: ADR-002 + ADR-001. **Effort**: medium / **Risk**: medium (load-bearing — adversarial review required).

#### 35. usePermissions hook removal (S7.3)
- **Files**: Delete `frontend/src/hooks/usePermissions.ts`; update `Sidebar.tsx:25`.
- **Problem**: Standalone permissions hook with one consumer.
- **Solution**: Delete hook; switch Sidebar to `useAuth()` for `hasPermission` and `useAuthz()` for boolean shortcuts.
- **Effort**: trivial / **Risk**: low.

#### 36. BusinessRouteGuards parametric refactor (S7.4)
- **Files**: `frontend/src/authz/BusinessRouteGuards.tsx:18-36`. Constraint: do NOT mutate `useAuthz.invariant.test.ts:46-48` enumeration.
- **Problem**: Four near-identical route guards differing only by capability key.
- **Solution**: Single `<RouteGuard capability="X">` parametrized by typed union `'governance'|'activityLog'|'users'|'userLifecycle'`.
- **ADR/lock**: ADR-001 useAuthz invariant — closed enumeration. **Effort**: low / **Risk**: medium.

#### 37. Governance capability read from canonical builder (S7.10)
- **Files**: `endpoints/users/summary.py:45-50` → read from `services/_authorization_capabilities/me.py:33-74`.
- **Problem**: `summary.py` defines a local `_can_view_governance` mirror.
- **Solution**: Delete the parallel; read `can_view_governance` from `me_capabilities`.
- **ADR/lock**: ADR-001. **Effort**: low / **Risk**: medium (LOAD-BEARING).

#### 38. Endpoint-layer Pydantic model eviction (S8.6)
- **Files**: Move `endpoints/preferences.py:15-40` → `app/schemas/preferences.py`; `endpoints/riskhub_questionnaires.py:17-34` → `app/schemas/risk_questionnaire.py`. Keep `health.py:16-35` inline. Add architecture-lock test banning new `class X(BaseModel)` in `endpoints/`.
- **Problem**: Inline schemas should live in `app/schemas/` for reuse.
- **Solution**: Move + add lock. Health probes are documented exception (response-only ops/probes).
- **Effort**: low-medium / **Risk**: low-medium.

#### 39. AdminConsoleCapabilities real builder (S8.7)
- **Files**: `endpoints/admin/capabilities.py:12-22`; new `build_admin_console_capabilities` in `services/_authorization_capabilities/`. Coordinate `authorization-capability-contract.md:132`, `.json:717`.
- **Problem**: Hardcoded `True` placeholders. LOAD-BEARING capability fork.
- **Solution**: Implement real builder mirroring `build_me_capabilities`.
- **ADR/lock**: ADR-001. **Effort**: medium / **Risk**: medium-high (role-matrix test fixtures + adversarial review).

#### 40. Admin sub-router re-clustering (S8.11)
- **Files**: `endpoints/admin/__init__.py:7-18`. Re-cluster into `admin/{diagnostics,sessions,snapshots,directory,governance}.py`. Drop `capabilities.py` (per #39). Verify `docs.py` fallback alias dict.
- **Problem**: Flat 8-module list with overlapping concerns.
- **Solution**: 5-module topical re-cluster. Update `_endpoint_commit_allowlist.toml` atomically.
- **Effort**: medium / **Risk**: medium.

#### 41. Issue workflow serialization alias removal (B-N3)
- **Files**: `services/_issue_workflow/serialization.py:18,41` (4 sites).
- **Problem**: Bidirectional underscore aliasing.
- **Solution**: Pick the public name per symbol; delete underscore aliases.
- **Effort**: trivial / **Risk**: low.

#### 42. ActorPayloadModel outbox boilerplate reduction (BE-N2)
- **Files**: Add `ActorPayloadModel(OutboxPayloadModel)` with `actor_user_id`; refactor handlers.
- **Problem**: Per-handler boilerplate redeclaring `actor_user_id` on every payload.
- **Solution**: Shared base. Constraint: keep `idempotency_key=` keyword-only; call-count >= 5.
- **ADR/lock**: ADR-002 outbox-then-commit lock. **Effort**: medium / **Risk**: medium.

#### 43. Audit adapter-emitter helper (BE-N4)
- **Files**: Add `services/audit/_adapter_emitter.py`; refactor `audit/{issue,risk,control,kri,vendor}.py` (~30+ repetitions).
- **Problem**: 30+ repetitions of `safe_entity_label + log_activity` boilerplate.
- **Solution**: Single helper for the boilerplate pair.
- **Effort**: medium / **Risk**: low-medium.

#### 44. API surface path-prefix registry (BE-N6)
- **Files**: Add `core/api_surface.py` registry; refactor `middleware/security_protocol.py:22-86`, `middleware/rate_limit/policy.py:9-16`, `core/settings/protocol_guard.py:10-15`. Add invariant test "every guarded prefix is in registry".
- **Problem**: Path-prefix policy fragmented across three modules.
- **Solution**: Centralize with category tags.
- **Effort**: medium / **Risk**: medium.

#### 45. Ownership resolver factory (BE-N8)
- **Files**: Refactor 8 ownership-resolver functions for KRI and Control into 1 factory + 4 named wrappers per entity.
- **Problem**: Eight near-identical functions parameterized only by entity model.
- **Solution**: `make_ownership_resolvers(model_class, owner_column, archived_column?)` factory.
- **ADR/lock**: ADR-001 (load-bearing for row-level authz; adversarial review). **Effort**: medium / **Risk**: medium.

#### 46. Frontend query-keys factory (FE-N1)
- **Files**: Promote `frontend/src/lib/issueQueryKeys.ts` → `frontend/src/lib/queryKeys.ts`; migrate 33 inline literals across 17 files.
- **Problem**: 33 inline `queryKey` literals.
- **Solution**: Typed factories per resource.
- **Effort**: medium / **Risk**: low-medium (large fan-out).

#### 47. RetryPolicy extraction (FE-N4)
- **Files**: Extract `frontend/src/services/api/ApiClientCore.ts:25-30,49-95` → `apiRequestBuilder.ts` `RetryPolicy`.
- **Problem**: Retry semantics + auth-bypass entangled in client class.
- **Solution**: Extract policy as a dependency.
- **Effort**: low-medium / **Risk**: low-medium.

#### 48. Error-key module consolidation (FE-N6)
- **Files**: Consolidate `frontend/src/i18n/getErrorMessageKey.ts` + `errorCodeMap.ts` → `errorKeys.ts`.
- **Problem**: "API-error → translation key" logic split across two modules.
- **Solution**: Merge into one file.
- **Effort**: trivial / **Risk**: low.

### 6.3 Tier 3 — Cross-cutting + ADR-pinned + Migration-coupled

#### Group A — ADR-pinned consolidations (10 entries; same-commit lock edits)

These ten items each delete a thin facade or shim. Every one requires a same-commit edit to `tests/backend/pytest/architecture/test_architecture_deepening_contracts.py`.

#### 49. Control execution monitoring wrapper inline (S2.2)
- `backend/app/services/_control_execution/monitoring.py:9-11` (3-line wrapper); callers in `link_governance.py` (3 sites); lock `:192`.
- Inline into the 3 sites; delete module; advance lock. **Tier 3 / low / low**. After: independent. Sequence before #49 (S2.10) consolidation.

#### 50. KRI submission alias deletion (S3.2)
- `_kri_history/submission.py` (22-line alias); lock `:998`. Delete file; advance lock. **low / low**.

#### 51. KRI value-application shim deletion (S3.3)
- `_kri_history/value_application.py` (7-line shim); rewrite 3 prod callers (`_register_listings/kris.py:31`, `_entity_mutation_lifecycle/direct_apply.py:21`, `kris/linked_vendors.py:3`); lock `:976-980`. **low / low**. Sequence before S6.6 PrivilegeContext.

#### 52. KRI correction-plans fake seam deletion (S3.5)
- `_kri_history/correction_plans.py` (14-line fake-seam); lock `:962`. Delete; advance lock. **low / low**.

#### 53. Issue workflow service collapse (S4.1)
- `services/issue_workflow_service.py` + `_issue_workflow/service.py:33-41` (8 staticmethod re-binds); caller `_issue_workflow/execution.py:49`; lock `:1237`. Have execution.py import from `_issue_workflow.lifecycle` directly. **low / low**.

#### 54. Approval queue aggregator deletion (S6.3)
- `services/_approval_queue/lifecycle.py` (7-line aggregator); lock `:789`. Move imports into `__init__.py`; delete. **low / low**.

#### 55. Access user service facade deletion (S7.5)
- `services/access_user_service.py`; caller `endpoints/access.py:209`; lock `:246-257`. Inline `update_access_profile` import. **low / low**.

#### 56. Directory identity service shim deletion (S7.6)
- `services/directory_identity_service.py`; 9 importers; lock `:227-238`. Rewrite 9 importers; delete; advance lock range. **low / low**. Pair with #51 (graph_directory move).

#### 57. Quarterly comparison facade deletion (S8.1)
- `services/quarterly_comparison_service.py`; caller `dashboard/quarterly.py:12`; lock `:559-568`. Inline-import; delete. **low / low**. Pair with #58.

#### 58. Orphaned item facade + static-method class deletion (S8.3)
- `services/orphaned_item_service.py`; `_orphaned_items/service.py:20-81` (62-line static-method class); 6+ callers; lock `:269,305`. Delete both layers; rewrite callers to import functions directly. **low / low**.

#### Group B — Cross-cutting refactors (medium risk)

#### 59. Control monitoring package consolidation (S2.10)
- Consolidate `_monitoring_status/controls.py:37-46` + `queries.py:39-75` + `_monitoring_response.py:115-128` + `_control_execution/monitoring.py:9-11` into single `monitoring/` package. **medium / low**. AFTER S2.1 + #49.

#### 60. PrivilegeContext request-scoped object (S6.6 — deeper architectural form)
- New `_authz/privilege_context.py`; replace boolean parameter chains in `_kri_history/{direct_application,approval_intake,recording}.py`. **medium / medium** (every privileged KRI write path). AFTER #51.

#### 61. graph_directory adapter package move (S7.7)
- Move `services/graph_directory_{service,auth,transport,errors}.py` → `services/_graph_directory/`. **medium / low**. Same wave as #56.

#### 62. KRI vendor assignment consolidation (S5.9)
- Move `kri_vendor_assignment.py:81-119` into `services/_vendor_links/`; route bulk reconciliation through `create_vendor_link`/`delete_vendor_link`. **medium / medium** (audit emission cardinality). After S5.2 mixin.

#### 63. Outbox dispatch SchedulerJobRun instrumentation (BE-N7)
- Wrap `dispatch_pending_outbox_events` in `execute_tracked_job`. **low / low**. AFTER BE-N2.

#### 64. QueryClient defaults centralization (FE-N2)
- Extract `App.tsx:11-18` defaults into `services/api/queryClient.ts` with `RESOURCE_POLICY` map. **low / low**. AFTER FE-N1.

#### 65. CRUD capability schema reuse (FE-N3)
- `services/api/schemas/common.ts` `crudCapabilitySchema`; reuse across 12 entity schemas. Lock with snapshot test against `capability-catalog.json` (`me_capabilities=18, risk=19, control=20, kri=23, issue=28, vendor=14`). **medium / low**. AFTER FE-N1.

#### 66. AuthContext provider split (FE-N5)
- Split `AuthContext.tsx:50-67` into `AuthSessionContext` + `AuthActionsContext`. Preserve `user.me_capabilities` reachability via `useAuth()`. **medium / medium** (LOAD-BEARING). AFTER S8.7 + S7.10.

#### 67. useResourcePanelQuery generic hook (FE-N7)
- Extract `useResourcePanelQuery<T>` from `components/riskhub/useRiskHubConfigResource.ts`. **medium / low**. AFTER FE-N1.

#### 68. WidgetShell + dashboard scoped query (FE-N8)
- Add `WidgetShell.tsx`, split `DashboardFilterContext`, add `useDashboardScopedQuery`. **high / medium** (22 widgets). AFTER FE-N5.

#### Group C — Migration-coupled (high risk; dedicated migration windows)

#### 69. Vendor link tables → AbstractVendorLink mixin → polymorphic merge (S5.2)
- Phase 1: introduce mixin in `_vendor_link_mixin.py`; rebase three tables to force consistent columns + `ondelete`. Phase 2: full polymorphic-table merge with forward-only migration.
- ADR-010 + ADR-005. **high / high** (Phase 2 touches every vendor-link row).

#### 70. Vendor.status enum drop (S5.7)
- Drop `Vendor.status` enum, remove `archived_status_filter` `'inactive'` literal, collapse `archived_clause(Vendor)` legacy branch. Bundle with #69 migration window.
- ADR-010 + ADR-005. **high / medium**. Pre-migration: confirm no row depends on `status='inactive' AND is_archived=false`.

#### 71. Frontend session module merge (S7.8)
- Merge 8 session files into ~4 (`session/lifecycle.ts` consolidates manager + bootstrap + refreshHint + logoutSuppression).
- **medium / high** (LOAD-BEARING). AFTER #72 ratified, #66 stable.

#### Group D — ADR documents (no code)

#### 72. ADR-011 "Auth scheme & session model" (S7.9)
- New `docs/adr/ADR-011-auth-scheme-and-session-model.md`. **medium / none**. Should ratify before #71.

#### 73. ADR-012 "KRI time-series period algebra & deadline classification" (S3.12)
- New `docs/adr/ADR-012-kri-time-series.md`. **medium / none**. Document phase first; implementation cleanup of `kri_deadline_service.py:62-81` is a separate Tier-3 follow-up.

#### 74. ADR-007 amendment — three context categories
- Amend `docs/adr/ADR-007-bounded-context-taxonomy.md` per Loop-3 §5.4. **low / none**. Should ratify before or with #61.

### 6.4 Ranking + Risk Register

Five-axis rubric (Leverage / Locality / Tests / ADR-Lock-cost-inverted / Sequencing-risk-inverted; max 25). Tier 1 ≥ 20, Tier 2 = 15-19, Tier 3 < 15.

**Top 15 by total score:**

| ID | Lev | Loc | Tests | ADR/Lock | Seq | Total | Tier |
|---|---|---|---|---|---|---|---|
| S5.1 | 5 | 5 | 5 | 5 | 5 | **25** | 1 |
| S4.4 | 5 | 5 | 5 | 5 | 5 | **25** | 1 |
| FE-deadcode-{1,2,3} | 4 | 5 | 5 | 5 | 5 | 24 | 1 |
| A-N1, B-N1, B-N2, C-N1, S3.11 | 4 | 5 | 5 | 5 | 5 | 24 | 1 |
| S2.7, D-N3, D-N2 (bugs) | 5 | 5 | 4 | 5 | 5 | 24 | 1 |
| S2.1 | 5 | 4 | 5 | 5 | 4 | 23 | 1 |
| S6.5, S6.2 | 4 | 5 | 5 | 5 | 4 | 23 | 1 |
| S1.4 | 4 | 5 | 5 | 4 | 5 | 23 | 1 |
| S8.5, S8.10 | 4 | 4-5 | 5 | 4 | 4-5 | 22 | 1 |
| S8.7, S7.10 (LOAD-BEARING) | 5 | 4 | 5 | 3 | 3 | 20 | 1 |
| S6.4, S4.2, S4.3, S2.6, BE-N4, BE-N6, FE-N1 | 4 | 4 | 4 | 4 | 4 | 20 | 1 |

**Tier counts**: Tier 1 = 28, Tier 2 = 30, Tier 3 = 16.

**Risk Register (selected high-attention entries; full register in agent output):**

| ID | Regression Vector | Customer-Visible | Migration | Lock Churn |
|---|---|---|---|---|
| S5.1 | Removed dead helper imported via stale `__all__` | None | None | `_capabilities_all_allowlist.toml` re-snapshot if helper was exported |
| S2.7 | Bug fix — wrong return field | Surfaces previously-swallowed validation error to UI | None | None |
| D-N3 | Bug fix — narrowed except | Errors now propagate; possible 1-day shift in archive cutoff if wrapped path was load-bearing | None | None |
| D-N2 | Bug fix — adds catalog surface | None | None | `capability-catalog.json` re-snapshot |
| S8.7 | LOAD-BEARING — capability contract; same-commit edit to `authz contract md/json` | None — invariants hold by test | None | Architecture-deepening contract test edit |
| S7.10 | LOAD-BEARING — coordinate with S8.7 | None | None | Same as S8.7 |
| S6.9 | ADR-002 outbox-then-commit invariant must hold | None | None | None |
| FE-N5 | LOAD-BEARING AuthContext refactor; logout-on-reload regression vector | High — touches every authenticated screen | None | None — but adversarial review required |
| S5.2/S5.7 | Forward-only Postgres migration (ADR-010) | KRI/Vendor read paths | New migrations; no down-migration | `_archive_allowlist.toml` if archive cutoff schema touched |
| S7.8 | LOAD-BEARING session state machine | Workflow transitions visible; correctness-critical | New migration; backfill state column | Deepening contract test + ADR-005 |

### 6.5 Out-of-Scope Register

Candidates considered and rejected, recorded so future audits don't re-suggest them.

#### Disconfirmed by re-verification (original framing was wrong)

- **S1.2** — "Two-level router compositors" — only 4 verbs (not 5) own own APIRouter; description partly inaccurate. ADR-worthy: NO.
- **S1.3** — "Inconsistent risk-CRUD txn boundary" — Loop-2 grep returned 0 `await db.commit()` in `endpoints/risks/`; claim stale. ADR-worthy: NO.
- **S1.5** — "riskOverviewHelpers microtest" — 11 lines, one caller; trivial. ADR-worthy: NO.
- **S1.8** — "risk_to_summary mapper triviality" — encodes business policy. ADR-worthy: **YES — "Mappers may carry business policy when callers share it."**
- **S2.5** — "serialize_control_brief_for_link unused" — used cross-module by `_vendor_links/workflow.py:182`. ADR-worthy: NO.
- **S3.6** — "_kri_history docstring drift" — refactor magnitude (~15 underscore importers) too large. ADR-worthy: NO.
- **S3.8** — "_int_sort_value 2-line shim" — local utility, idiomatic mypy-driven helper. ADR-worthy: NO.
- **S3.10** — "kriForm.selectors.ts pure-fn adapter stack" — 7 meaningful pure functions. ADR-worthy: NO.
- **S4.5** — "Three FSMs cross-coupled" — one central `ISSUE_TRANSITIONS` dict. ADR-worthy: NO.
- **S4.7** — "issueQueryKeys.ts shallow" — verified clean (anonymous-fallback contract). ADR-worthy: NO.
- **S4.9** — "Capabilities re-derive FSM" — capability predicates legitimately read state. ADR-worthy: NO.
- **S5.4** — "_vendor_governance/reports.py 9-line dataclass" — architecture-deepening contract anchor at `:1082`. ADR-worthy: NO.
- **S5.6** — "vendor_report_policy + _vendor_workflow/policy split" — different layers. ADR-worthy: **YES — "RBAC and query-scope policies stay separate by layer."**
- **S6.7** — "scenario_roles_for_approval triplet" — 3 distinct return semantics. ADR-worthy: NO.
- **S6.8** — "finalize_approval_resolution doublet" — `_plan` form is deliberate; ADR-002 LOAD-BEARING. ADR-worthy: NO (covered by ADR-002).
- **S6.10** — DUPLICATE-OF-S6.4. ADR-worthy: NO.
- **S8.12** — "_riskhub_config lazy `__getattr__`" — deliberate lazy-loader pattern. ADR-worthy: NO.
- **D-N1** — "capability marker introspection" — token doesn't exist as a marker. ADR-worthy: NO.
- **BE-N1** — "outbox handler recipient-fanout" — named pattern absent. ADR-worthy: NO.
- **BE-N3** — "mapper coverage parity" — codebase doesn't use mapper-module pattern. ADR-worthy: **YES — "Mapper-module pattern is intentionally not used."**

#### Real seams — KEEP, do not delete

- **S1.7, S1.9, S2.4, S2.7, S3.1, S3.13, S5.3, S6.1, S6.9, S8.2, S8.8, S8.9, BE-N6** — see Loop 3 §5 for full verification.
- ADR-worthy umbrellas: **YES — "Real seams keep their facades"** (covers S6.1, S8.2, S3.1); **YES — "Per-row capability schemas live on `*Read.capabilities` only"** (covers S1.7); **YES — "Disjoint URL surfaces for the same logical action are intentional"** (covers S2.4, S5.3).

#### Suggested ADRs to stop re-suggestion

1. **ADR — "Real seams keep their facades"** (covers S6.1, S8.2, S3.1, S3.13, S6.9).
2. **ADR — "Per-row capability schemas live on `*Read.capabilities` only"** (covers S1.7).
3. **ADR — "Disjoint URL surfaces for the same logical action are intentional"** (covers S2.4, S5.3).
4. **ADR — "Mapper-module pattern is intentionally not used"** (covers BE-N3, S1.8).
5. **ADR — "RBAC capability gates and query-scope filters stay separate"** (covers S5.6).

### 6.6 Process / CI Gap Report

12 process gaps surfaced during recon and Loop 2 gate runs.

#### Critical (architecture invariants drift if not fixed)

- **C1**. Architecture-lock suite is local-only. `make test-architecture-locks` runs 65 invariants in 1.46s but is not in `lint.yml` or pre-commit. **Effort: trivial** (10 lines YAML).
- **C2**. Mypy is not strict and never blocks PRs. `mypy.ini` lacks `strict = True`; `lint-backend` doesn't invoke mypy; `maintenance-governance.yml:123` runs full-tree mypy under `continue-on-error: true`. **Effort: low** (incremental — start non-strict on `app/`, ratchet `_*` packages first).

#### Medium

- **M1**. Black in pre-commit but not CI. **Effort: trivial** (replace with `ruff format --check`).
- **M2**. `maintenance-governance.yml` backend lint is `continue-on-error: true`. **Effort: low** (split job; promote ruff + mypy-on-`app/` to blocking).
- **M3**. `release-parity-pr.yml` is `workflow_dispatch` only. **Effort: trivial** (add `pull_request:` trigger or rename).
- **M4**. `_endpoint_commit_allowlist.toml` carries `expires_at = 2026-09-01` for auth-flow exemptions. ~3.7 months runway. **Effort: medium** (depends on ADR-011 feasibility).

#### Low (hygiene)

- **L1**. `changed_quality_targets.py` unreferenced. **Effort: trivial** (wire up or delete).
- **L2**. `pytest --durations=5` reports epoch timestamps (broken instrumentation). **Effort: low** (diagnostic).
- **L3**. Vite bundle-size warning suppressed (`main-*.js` 711kB raw). **Effort: low** (audit) / medium (split).
- **L4**. Frontend dead-code audit advisory only — 4 modules currently flagged (`controlFormWorkflow.ts`, `governance/orphanResolutionPresentation.ts`, `kri-form/kriFormWorkflow.ts`, `notifications/resourcePath.ts`). **Effort: medium** (introduce allowlist gate).
- **L5**. `pytest.mark.benchmark` not registered. **Effort: trivial** (add to `pytest.ini`).
- **L6**. ADR template/dating convention missing. 10 ADRs lack `Date`, `Deciders`, `Supersedes`, `Superseded-by`. **Effort: trivial** (template) / low (backfill opportunistic).

**Recommended sequencing**: C1 + M3 batched first (one-line YAML); C2 + M2 second (incremental mypy promotion); L1, L5, L6 third (hygiene); L2, L3, L4 last (whoever next touches `vite.config.ts` or runs cleanup audit). Estimated total: ~1-1.5 engineer-days.

### 6.7 ADR drafts

#### ADR-011 — Auth Scheme & Session Model (DRAFT)

**Status**: Proposed.

**Context**: RiskHub authentication is implemented but undocumented at ADR level. JWT bearer + refresh-token rotation across `auth/{login,refresh,logout,sso}`; mock-auth path co-resident in `core/security.py:107-136` gated by `MOCK_AUTH_ENABLED + DEBUG`. Three authz idioms coexist: `require_permission` factory, body-call `_require_*`, inline `if not has_permission: 403`. ADR-002 records 8 auth-flow endpoint commit exemptions in `_endpoint_commit_allowlist.toml` expiring 2026-09-01. No prior ADR captures the canonical scheme.

**Decision**:
1. JWT bearer access tokens + refresh-token rotation + token-version invalidation are the canonical authn scheme.
2. The mock-auth path is permitted only when `mock_auth_enabled && debug`, isolated to `core/security.py:107-136`. Production code uses `app.api.deps.get_current_user`.
3. Endpoint authorization uses exactly one idiom going forward — the `require_permission(action, resource)` FastAPI dependency factory from ADR-001. Body-call helpers and inline raises are frozen and may not be added to.
4. The 8 auth-flow endpoint commit exemptions are migrated to service-owned transactions before 2026-09-01.
5. SSO-only mode is deployment-time configuration, not a runtime branch.

**Consequences**: One documented authn scheme; auditable mock-auth boundary; auth-flow loses commit-allowlist on 2026-09-01; nine roles per BL §1.1-1.3 remain authoritative.

**Alternatives Considered**: Session cookies (rejected — cookie sessions don't eliminate refresh rotation); three-idiom status quo (rejected — drift detection is fragile); removing mock-auth entirely (rejected — dev/test fixtures depend on `X-Mock-User-Id`).

**Forbidden**: New mock-auth call sites outside `core/security.py:107-136`; third authn scheme on protected routes; new body-call `_require_*`/inline `if not has_permission`; new entries to `_endpoint_commit_allowlist.toml` for auth flows; `MOCK_AUTH_ENABLED` in non-debug environments.

**Enforcement**: Extend `test_w5_endpoint_commit_ratchet_red.py` to forbid new auth-flow allowlist entries; new architecture-lock scanning `endpoints/` for body-call `_require_*` patterns; new lock forbidding `app.core.security.get_current_user` imports outside `app.core.security`; cross-reference `authorization-capability-contract.md` and `capability-catalog.json` (ADR-001); 2026-09-01 deadline.

#### ADR-012 — KRI Time-Series Period Algebra & Deadline Classification (DRAFT)

**Status**: Proposed.

**Context**: KRI period-based submissions per BL §2.3 with five states (`new`, `not_submitted`, `breach`, `warning`, `optimal`). Period algebra lives in `_kri_history/periods.py`. `REPORTING_GRACE_DAYS` is duplicated between `_kri_history.constants` and `ConfigDefaults`. Deadline classification is distributed: `kri_deadline_service.py:62-81` reaches into three `KRIHistoryService` static methods; logic also lives in `kri_deadline_decisions.py` and `_kri_history.queries`. Loop 2 deletion-test confirmed period-algebra is load-bearing without being labeled.

**Decision**:
1. `_kri_history/periods.py` is the single source of truth for KRI period algebra.
2. `ConfigDefaults.REPORTING_GRACE_DAYS` is the only config-key read path; `_kri_history.constants.REPORTING_GRACE_DAYS` is removed (or aliased for one release).
3. Deadline classification consolidates behind `KRIDeadlineService.classify(submission, *, now)`. Callers must not reach into `KRIHistoryService.due_date`/`period_bounds_for_date`/`latest_closed_period_for_date` from outside `_kri_history`.
4. The five KRI states in BL §2.3 are the only states deadline classification may emit.

**Consequences**: One module-of-record for period algebra; one grace constant; `kri_deadline_service.py:62-81`'s three-static-method reach collapses to one boundary call; KRI state vocabulary pinned to BL §2.3.

**Alternatives Considered**: Distributed algebra (rejected — Loop 2 proved invisible dependency chain); move classification out of `_kri_history` (rejected — period algebra is intrinsic to ADR-007 bounded context); two grace constants with precedence rule (rejected — two constants always drift).

**Forbidden**: Imports of `KRIHistoryService.due_date/period_bounds_for_date/latest_closed_period_for_date` outside `_kri_history/`; second grace-days constant; KRI states outside BL §2.3 from deadline classification; duplicate period-bound computation.

**Enforcement**: New `test_kri_period_algebra_ssot.py` asserts the three functions defined exactly once and only inside `_kri_history.periods`; import scan forbids `KRIHistoryService` imports outside `_kri_history/`; `_kri_state_vocabulary_allowlist.toml` pins five state strings; cross-reference BL §2.3, §8.5.

#### ADR-007 Amendment — Read-Shape, Workflow-Paired, and Adapter Contexts (DRAFT)

**Status**: Proposed (amends ADR-007).

**Context**: ADR-007 names 7 write-side contexts but the codebase has ~35 underscore-prefixed packages. The unnamed remainder falls into three coherent shapes: read-shape (`_register_listings`, `_monitoring_status`, `_monitoring_response`), workflow-paired (`_approval_queue`/`_approval_execution`, `_issue_register`/`_issue_workflow`, `_vendor_links`/`_vendor_governance`), and adapter (`_directory_identity`, `_directory_sync`, `graph_directory_*`, `_admin_telemetry`, `_activity_log_query`).

**Decision**: ADR-007's taxonomy is extended with three secondary categories. Read-shape contexts inherit transaction rules from underlying write-side contexts. Workflow-paired contexts sweep together as one rollback unit. Adapter contexts are exempt from the per-context exception ban only at the adapter boundary. The seven-context list remains the canonical write-side enumeration.

**Consequences**: Seven-context list becomes write-side core with three secondary shapes covering ~28 remaining packages; workflow-paired sweeps roll back as a pair; new packages must be classified at introduction.

**Alternatives Considered**: Expand seven-context list to all 35 (rejected — loses sweep meaning); document elsewhere (rejected — Loop 3 showed reviewers read ADR-007 as exhaustive); merge workflow pairs (rejected — splits reflect real boundaries).

**Forbidden**: New underscore-prefixed package without classification; splitting a workflow-paired context across two architecture-sweep checkpoints; HTTPException ban applied to adapter boundaries (translation to domain exceptions is the adapter's job); treating read-shape contexts as write-side for atomicity tests.

**Enforcement**: Extend `test_w7_bounded_context_disjointness.py` to validate every underscore-prefixed package is in one of four allowlists. New TOMLs: `_bounded_context_write_side.toml`, `_bounded_context_read_shape.toml`, `_bounded_context_workflow_pairs.toml`, `_bounded_context_adapters.toml`.

### 6.8 Domain vocabulary report + CONTEXT.md skeleton

#### Proposed `docs/CONTEXT.md` (~52 canonical entries across 6 sections + architecture vocabulary + drift watch)

```markdown
# RiskHub Domain Context

> **Version**: 0.1 (skeleton)
> **Purpose**: Index of RiskHub's domain language. Each term links to its canonical home; this file does not inline definitions.

## 1. Roles
- Admin / CRO / CFO / CEO / COO → BL §1.1
- Risk Manager / Compliance / Legal / Internal Audit / Actuarial → BL §1.1
- Department Head / Employee / Viewer / CONTROL_OWNER (Reserved) → BL §1.1, ADR-009
- Risk Owner / Control Owner / Reporting Owner → BL §2.1-§2.3, §7.1
- Czech translations → GLOSSARY.md:10-22

## 2. Core Entities
- Risk → BL §2.1 / Control → BL §2.2 / KRI → BL §2.3 / Department → BL §2.4 + §3
- Vendor / Vendor SLA → BL §4.1, §11.5
- Issue / IssueLink / IssueRemediation / IssueException → BL §11
- Approval Request → BL §5 / Risk Questionnaire → BL §12
- Activity Log → BL §9 / Notification → BL §8.7 / Orphan record → BL §4

## 3. Workflow Verbs
- Submit / Approve / Reject / Cancel → BL §5.1, §5.6
- Archive / Restore → BL §8.2, §8.3, ADR-005
- Link / Unlink → BL §7.3, §11.5 / Execute → BL §8.6
- Submit KRI Value / Correct KRI History → BL §8.5, §2.3 History
- Send / Open / Save Draft / Submit / Request Clarification → BL §12
- Assign / Start Remediation / Update Progress / Close → BL §11.1
- Revoke Exception → BL §11.3 / Break-glass enable → BL §1.4 / Triage → BL §11

## 4. Access Vocabulary
- Actor / Resource / Action → AUTHZ Vocabulary
- Access Scope (global/department/manager) → BL §1.2
- Privileged vs Non-Privileged → BL §1.3
- Capability → AUTHZ + Drift Watch §8 (split into Route/Row/Catalog capability)
- Permission → BL §4.1
- Backend guard / Service policy / Frontend gate / Test evidence → AUTHZ
- Capabilities Module / MeCapabilities → AUTHZ + ADR-001
- Approval-resolution authority → BL §5.5 / Self-approval prevention → BL §5.4

## 5. State Machines
- Approval status flow → BL §5.1
- Issue / Remediation / Exception status → BL §11.1
- Control / KRI monitoring status → BL §2.2 / §2.3
- Questionnaire lifecycle → BL §12.2
- Archive states (Risk/Control vs KRI/Vendor/Vendor SLA) → BL §8.2
- Outbox event states → ADR-002 §Outbox

## 6. Capability Surfaces
- Per-row capabilities (`*Read.capabilities`) → AUTHZ + capability-catalog.json
- Collection capabilities (`*ListResponse.capabilities`) → AUTHZ Contract Matrix
- Session capabilities (MeCapabilities) → AUTHZ
- Access user capabilities → BL §1.4 + AUTHZ
- Dashboard / Approval / Questionnaire / KRI history capabilities → BL + AUTHZ

## 7. Architecture Vocabulary (improve-codebase-architecture skill)
- Module / Interface / Implementation / Depth / Seam / Adapter / Leverage / Locality
- Maps via ADR-001/002/003/005/007/009

## 8. Drift Watch
| # | Term | Drift | Resolution |
|---|------|-------|-----------|
| 1 | Owner | Risk/Control/Reporting Owner + audit-fields | BL §2 — define **Owned entity** |
| 2 | Capability | Route/row/catalog overlap | AUTHZ Vocabulary — split into Route/Row/Catalog capability |
| 3 | archived vs inactive | Multiple aliases | BL §8.2 + ADR-005 |
| 4 | Source | source_type/id/display/link/is_source_link overload | BL §11.5 |
| 5 | Orphan | "orphan record" vs "orphan target" | BL §4 |
| 6 | Break-glass | verb/flag/state used interchangeably | BL §1.4 |
| 7 | Priority risk vs high-risk | both privileged-approval triggers | BL §6.2 + §8.4 — define **Escalation-eligible risk** |
| 8 | Scenario | approval scenario vs product scenario | BL §6.3 |
```

#### New vocabulary additions (15 concepts proposed by surviving candidates)

Selected high-priority entries (full table in Loop 4 agent output):

- **Escalation roster** (BE-N1) → BL §5.7
- **Actor payload** (BE-N2) → BL §9.4
- **Display name + Safe label** (BE-N4) → BL §9.2
- **Owned entity** (BE-N8) → BL §2 preamble
- **Privilege context** (S6.6) → AUTHZ Vocabulary
- **Vendor link reconciliation** (S5.9) → BL §11.5
- **Monitoring fact** (S2.10) → BL §2.2/§2.3
- **Graph directory** (S7.7) → AUTHZ Vocabulary
- **Query keys registry** (FE-N1) → frontend ADR / DOCUMENTATION_TREE.md
- **CRUD capability shape** (FE-N3) → AUTHZ Vocabulary
- **Dashboard widget / WidgetShell** (FE-N8) → BL §10.4
- **Route / Row / Catalog capability** (drift #2 resolution) → AUTHZ Vocabulary
- **Escalation-eligible risk** (drift #7 resolution) → BL §6.2 + §8.4

#### Drift resolution

| # | Term | Recommended canonical form | Doc home |
|---|------|----------------------------|----------|
| 1 | Owner | "Owner" reserved for Owned-entity functional roles; audit-fields use "Creator"/"Last updater" | BL §2 preamble |
| 2 | Capability | Split into Route capability / Row capability / Catalog capability | AUTHZ Vocabulary |
| 3 | archived vs inactive | `is_archived=true` is archive truth on KRI/Vendor; Risk/Control retain `status='archived'`; `'inactive'` documented as legacy alias | BL §8.2 + ADR-005 |
| 4 | Source | `(source_type, source_id)` is provenance; **Source link** is `IssueLink.is_source_link=true` | BL §11.5 |
| 5 | Orphan | **Orphan record** = row with missing/invalid FK target awaiting resolution | BL §4 |
| 6 | Break-glass | **Break-glass re-enable** is the canonical phrase | BL §1.4 |
| 7 | Priority vs high-risk | **Escalation-eligible risk** = `is_priority OR net_score >= threshold` | BL §6.2 + §8.4 |

**Net vocabulary verdict**: Backlog modestly muddies language unless landed with the targeted glossary additions. Recommend gating any deepening PR introducing a new public-name concept on a same-PR Glossary/CONTEXT.md edit; treat drift items as a prerequisite cleanup.

---

## 7. Final Numbered List of Deepening Opportunities

This is the deliverable. The audit ran 50 Opus subagents across 5 loops to produce this list. The repo passes every locally-runnable quality gate, so the proposals address depth/locality/leverage friction, not bugs (with four bug-fix exceptions called out).

### Top 5 immediate-action picks (Tier 1, score ≥24)

1. **#13 (S5.1) Vendor-link helpers shim delete + contract sync** — 107 lines dead; resolves C-N2 archive-precedence bug; updates 4 capability-contract citations atomically. *Effort: low / Risk: low.*
2. **#14 (S4.4) Issues outbox-only notification cleanup** — 3 dead helpers; outbox is already the live transport; rewrites 2 test sites. *Effort: low / Risk: low. Strengthens ADR-002.*
3. **#11 (S2.7) `risk.process` → `risk.name` truth-in-naming fix** — real bug at `_control_execution/workflow.py:155`. One-line fix + regression test. *Effort: trivial / Risk: low.*
4. **#15 (D-N2) `access_user` capability catalog gap** — closes ADR-001 contract gap; ~+15-25 lines in `capability-catalog.json`. *Effort: low / Risk: low.*
5. **#19 (S1.4) `validate_risk_type` policy unification** — collapses HTTPException copy + ValidationError copy; honors ADR-003. *Effort: low / Risk: medium (verify HTTP behavior parity).*

### High-leverage Tier-2 picks

- **#34 (S6.6) PrivilegeContext** + **#37 (S7.10) governance capability** + **#39 (S8.7) AdminConsoleCapabilities** — three capability-contract LOAD-BEARING moves; sequence S8.7 → S7.10 → FE-N5 (dashboard widget split).
- **#45 (BE-N8) ownership resolver factory** + **#46 (FE-N1) query-keys factory** — high leverage (8+ functions / 33+ literals).
- **#36 (S7.4) BusinessRouteGuards parametric** — one parametric `<RouteGuard capability="X">` replaces 4 near-identical guards; closed enumeration `{controls, risks, issues, vendors, departments}` preserved.

### Tier-3 highlights (ADR documents to ratify in parallel)

- **#72 ADR-011 Auth Scheme & Session Model** — codifies the auth idiom; gates the 2026-09-01 endpoint-commit allowlist sunset.
- **#73 ADR-012 KRI Time-Series Period Algebra** — codifies `_kri_history.periods` as SSOT; eliminates duplicate `REPORTING_GRACE_DAYS`.
- **#74 ADR-007 amendment** — names read-shape, workflow-paired, and adapter context categories; closes the gap between 7 ADR contexts and ~35 actual packages.
- **#69 (S5.2) + #70 (S5.7)** — vendor-link mixin + `Vendor.status` enum drop; require ADR-010 forward-only Postgres migration window.

### Aggregate effort & rollout

- **Tier 1 sprint**: ~3-5 engineer-days. 19 candidates, mostly trivial-to-low effort.
- **Tier 2**: 30 candidates; ~2-3 weeks across multiple PRs grouped by domain (Issue PR, Vendor PR, KRI PR, frontend-shim PR, capability-contract PR).
- **Tier 3**: 16 candidates; mix of ADR docs (parallel-to-Tier-1, no code), ADR-pinned consolidations (paired with same-commit lock edits), cross-cutting refactors (load-bearing — adversarial Round-2 review per PR), and migration-coupled work (dedicated windows with replica rehearsal).

### Process gaps to fix in parallel

- **C1**: wire `make test-architecture-locks` into `lint.yml` (10 lines YAML).
- **C2**: add `mypy app` to `lint-backend` non-strict, then ratchet `strict = True` per-package starting with `app/services/_*`.
- **M3**: add `pull_request:` trigger to `release-parity-pr.yml`.
- **M4**: pair with ADR-011 drafting; ~3.7 months runway to 2026-09-01 endpoint-commit allowlist expiry.

### Prerequisite drift cleanups

Before any deepening that introduces a new public-name concept, resolve the seven drift terms (Owner, Capability, archived-vs-inactive, Source, Orphan, Break-glass, Priority-vs-high-risk) per §6.8. Recommend creating `docs/CONTEXT.md` with the skeleton above as the same-PR landing point.

### ADRs to record before re-suggestions reappear

1. "Real seams keep their facades" (covers S6.1, S8.2, S3.1, S3.13, S6.9).
2. "Per-row capability schemas live on `*Read.capabilities` only" (covers S1.7).
3. "Disjoint URL surfaces for the same logical action are intentional" (covers S2.4, S5.3).
4. "Mapper-module pattern is intentionally not used" (covers BE-N3, S1.8).
5. "RBAC capability gates and query-scope filters stay separate" (covers S5.6).

---

### Final question (Step 3 of the `improve-codebase-architecture` skill)

The audit stops short of designing interfaces — that's the next step.

**Which of these would you like to explore?**

The skill recommends picking one Tier-1 or one LOAD-BEARING Tier-2 candidate and dropping into a grilling conversation: walk the design tree together, name the constraints, sharpen what sits behind the seam, decide what tests survive. Side effects (CONTEXT.md / ADR / new architecture-lock) happen inline as decisions crystallize.

Suggested first picks:
- **#13 (S5.1)** for a clean win on the vendor-link surface (closes a real bug).
- **#34 (S6.6) PrivilegeContext** for a deeper architectural deepening (touches `_kri_history` write paths; high leverage).
- **#39 (S8.7) AdminConsoleCapabilities** for a capability-contract surface tightening (LOAD-BEARING; high test-surface improvement).
- **#72 ADR-011** for a document-only ratification that unblocks #71 (session module merge) and the 2026-09-01 endpoint-commit allowlist sunset.

Tell me which to grill, and I'll start at Step 3 of the skill.
