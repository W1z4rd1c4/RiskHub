# RiskHub Verified Architecture Improvement Plan

| Field | Value |
| --- | --- |
| Date | 2026-05-17 |
| Source audit | Latest 2026-05-17 architecture deepening audit from the current Codex thread |
| Scope | Full-repo architecture improvement planning only; no production code change in this document |
| Method | `improve-codebase-architecture` vocabulary, `superpowers:test-driven-development`, `code-simplifier` |
| Verification mode | Static evidence plus bounded non-mutating checks |
| Current branch check | `git status --short --branch` -> `## main...origin/main` |
| Current architecture lock check | `make -f scripts/Makefile test-architecture-locks` -> `197 passed`, `1 snapshot passed` |
| Current authz contract check | `python3 scripts/security/validate_authz_capability_contract.py` -> passed |

## Summary

This document turns the latest architecture audit into an implementation-ready
plan for improving RiskHub's Module Depth. It is intentionally separate from
`.planning/audits/resolution-plan.md`; this plan covers the latest audit only
and does not merge or supersede the 2026-05-09 resolution plan.

The implementation rule for every future code change is strict TDD:

1. RED: write the smallest failing test for the behavior or architecture lock.
2. Verify RED: run the targeted command and confirm the failure is expected.
3. GREEN: make the minimal production change that passes the test.
4. Verify GREEN: rerun the targeted command and the nearest relevant gate.
5. REFACTOR: apply `code-simplifier` to touched code only, preserving behavior.
6. Verify after refactor: rerun the same targeted command.

No new production Interface is designed in this document. Each wave describes
what should become deeper in plain implementation terms. Concrete Interface
design waits until a specific candidate is selected for implementation.

## Claim Ledger

| Claim | Evidence | Verification method | Status |
| --- | --- | --- | --- |
| The working tree was on `main` before this plan was written. | `git status --short --branch` -> `## main...origin/main` | Command run during document creation | Verified |
| Architecture locks currently pass. | `make -f scripts/Makefile test-architecture-locks` -> `197 passed`, `1 snapshot passed` | Command run during document creation | Verified |
| Authz contract validation currently passes. | `python3 scripts/security/validate_authz_capability_contract.py` -> `Authorization capability contract validation passed.` | Command run during document creation | Verified |
| KRI history has a Shallow service facade and separate direct/approval execution paths. | `backend/app/services/_kri_history/service.py:32`, `backend/app/services/_kri_history/direct_application.py:91`, `backend/app/services/_approval_execution/kri_value_submission.py:29` | `rg -n` and targeted reads | Verified |
| KRI vendor assignment behavior is shared but callers still perform KRI approval/edit reconciliation around it. | `backend/app/services/_vendor_links/kri_assignment.py:85`, `backend/app/services/_approval_execution/kri_generic_edit.py:25` | `rg -n` and targeted reads | Verified |
| Direct archive and approval delete/archive side effects duplicate entity-specific archive behavior. | `backend/app/services/_entity_mutation_lifecycle/archive_plans.py:100`, `:176`, `:245`; `backend/app/services/_approval_execution/delete_side_effects.py:26` | `rg -n` and targeted reads | Verified |
| Register listing planning currently forwards a broad callback surface. | `backend/app/services/_register_listings/lifecycle.py:45` | `rg -n` and targeted reads | Verified |
| Reporting exporters use `ReportExportDefinition`, while lifecycle aliases the underlying pipeline definition. | `backend/app/services/_reporting/exports/lifecycle.py:15`, `backend/app/services/_reporting/exports/risks.py:52` | `rg -n` and targeted reads | Verified |
| Monitoring status behavior is split across derivation, SQL predicates, response projection, and export row mutation. | `backend/app/services/_monitoring_status/controls.py:56`, `backend/app/services/_monitoring_status/kris.py:62`, `backend/app/services/_monitoring_status/queries.py:39`, `backend/app/services/_monitoring_response.py:121`, `backend/app/services/_reporting/exports/monitoring.py:45` | `rg -n` and targeted reads | Verified |
| Architecture lock tests include source-string and symbol-name assertions. | `tests/backend/pytest/test_architecture_deepening_contracts.py:470`, `:886`, `:954`, `:1330` | `rg -n` and targeted reads | Verified |
| Release parity runtime orchestration has a facade and a wide Protocol over private audit methods. | `scripts/security/release_parity_audit/facade.py:19`, `scripts/security/release_parity_audit/runtime.py:9` | `rg -n` and targeted reads | Verified |
| Access users frontend workflow exists, but rows still call the builders directly. | `frontend/src/components/access/useAccessUsersWorkflow.ts:48`, `:71`; `frontend/src/components/access/AccessUserRow.tsx:110` | `rg -n` and targeted reads | Verified |
| Approval pending-change visibility has backend/schema capability metadata, while the page maps raw pending changes directly. | `frontend/src/types/approval.ts:17`, `frontend/src/services/api/schemas/entities/approvalRequest.ts:10`, `frontend/src/pages/approvals/ApprovalList.tsx:217`, `:228` | `rg -n` and targeted reads | Verified |
| Issue remediation card recomputes capability gates and uses a broad workflow hook. | `frontend/src/components/issues/RemediationPlanCard.tsx:17`, `:19`; `frontend/src/components/issues/remediation/useRemediationPlanWorkflow.ts:18` | `rg -n` and targeted reads | Verified |
| Authz contract names access users, questionnaires, and issue remediation as authoritative capability surfaces. | `docs/security/authorization-capability-contract.md:126`, `:148`, `:149` | `rg -n` and targeted reads | Verified |
| ADR-002 says service entrypoints own transaction completion. | `docs/adr/ADR-002-service-owned-transactions.md:13` | Targeted ADR read | Verified |
| ADR-006 requires snapshot equivalence protection for listing/audit refactors. | `docs/adr/ADR-006-snapshot-equivalence-class-testing-policy.md:13`, `:32` | Targeted ADR read | Verified |
| ADR-007 classifies write-side, read-shape, workflow-paired, Adapter, and cross-cutting contexts. | `docs/adr/ADR-007-bounded-context-taxonomy.md:13`, `:49`, `:51`, `:64`, `:66` | Targeted ADR read | Verified |

## Wave 1: Backend Write-Side Seams

Target Modules:

- `_kri_history`, `_approval_execution`, `_vendor_links`, `_entity_mutation_lifecycle`
- Primary files: `backend/app/services/_kri_history/service.py`, `_kri_history/direct_application.py`, `_approval_execution/kri_value_submission.py`, `_approval_execution/kri_generic_edit.py`, `_vendor_links/kri_assignment.py`, `_entity_mutation_lifecycle/archive_plans.py`, `_approval_execution/delete_side_effects.py`

Verified problem:

- KRI history value/correction behavior is split across direct and approval execution paths.
- KRI vendor assignment exposes too much low-level reconciliation to callers.
- Approval delete/archive handlers duplicate entity lifecycle archive behavior.

TDD RED tests:

- Add a KRI history execution regression proving direct submission and approved submission produce equivalent period validation, audit mutation changes, and reload/capability behavior for the same payload.
- Add a KRI vendor assignment regression proving create/update/approval paths converge on one reconciliation behavior for link, unlink, stale old value, and parent-risk vendor linking.
- Add archive side-effect tests proving direct archive and approved delete/archive produce the same entity archive state and audit change shape for Risk, Control, and KRI.

Minimal GREEN direction:

- Move shared KRI value/correction execution behavior into `_kri_history` while keeping approval execution as an Adapter over approved changes.
- Keep generic vendor-link helpers separate, but move full KRI vendor set reconciliation behind the existing KRI assignment Module.
- Route approved delete/archive side effects through entity lifecycle archive behavior instead of re-encoding Risk/Control/KRI mutations inside `_approval_execution`.

`code-simplifier` REFACTOR checklist:

- Remove pass-through aliases only when callers have moved.
- Prefer explicit small functions over dense conditionals.
- Keep transaction boundaries service-owned per ADR-002.
- Preserve existing exception semantics until a RED test justifies changing them.

Verification commands:

- Targeted pytest for KRI history, approval workflow, vendor links, and archive behavior.
- `make -f scripts/Makefile test-architecture-locks`
- `python3 scripts/security/validate_authz_capability_contract.py` if capability fields or authz docs change.

Rollback notes:

- Roll back per Module pair, not per file. `_approval_execution` and `_entity_mutation_lifecycle` changes must remain synchronized.

ADR and contract impact:

- ADR-002, ADR-005, ADR-007, and ADR-012 are directly relevant.
- Update authz contract only if capability semantics or action visibility change.

## Wave 2: Backend Read-Shape Seams

Target Modules:

- `_register_listings`, `_collection_contracts`, `_reporting/exports`, `_dashboard_metrics`, `_monitoring_status`, `_monitoring_response.py`

Verified problem:

- Register listing planning has a broad callback Interface and entity-specific grouping/filtering duplication.
- Report exporters hand-assemble replay, rehydrate, final-scope, criteria, and row rendering.
- Monitoring status rules are split between Python derivation, SQL predicates, response projection, and export mutation.
- Dashboard metrics still have endpoint-owned query/suppression behavior in some surfaces.

TDD RED tests:

- Add listing equivalence snapshots for grouped register behavior before changing listing internals.
- Add export snapshots proving as-of replay, final-row scope, and criteria order remain stable for risks, controls, KRIs, vendors, and issues.
- Add monitoring status equivalence tests proving SQL filters and projected/exported status agree for representative control and KRI rows.
- Add dashboard metric behavior tests for scoped issue metrics and dashboard endpoint Adapter thinness.

Minimal GREEN direction:

- Deepen register listing execution so entity Modules supply domain facts, not listing mechanics.
- Deepen report export lifecycle around the full replay/scope/filter/render sequence.
- Centralize monitoring status derivation/filter/projection decisions in one read-shape Module.
- Move remaining dashboard query Implementation behind `_dashboard_metrics`; leave endpoints as HTTP Adapters.

`code-simplifier` REFACTOR checklist:

- Keep row facts explicit and readable.
- Delete duplicate grouping/filter helpers only after equivalence tests pass.
- Avoid adding a generic abstraction that hides domain vocabulary.
- Keep snapshots redacted per ADR-006.

Verification commands:

- `make -f scripts/Makefile test-architecture-locks`
- Targeted backend pytest for register listings, report exports, monitoring status, and dashboard metrics.
- Snapshot review with explicit justification for any changed output.

Rollback notes:

- Preserve old read-shape behavior behind tests until each entity surface has equivalent coverage.

ADR and contract impact:

- ADR-006 and ADR-007 govern this wave.
- Authz contract updates are required if report/export/dashboard visibility semantics change.

## Wave 3: Authz, Capability, and Frontend Workflow Seams

Target Modules:

- `_access_workflow`, `_identity_access_lifecycle`, frontend access users workflow, approval list presentation, issue remediation workflow, questionnaire detail workflow, register page workflow

Verified problem:

- Backend read capability facts and write authorization can drift in access management.
- `useAccessUsersWorkflow` owns builders, but production rows still call those builders directly.
- Approval pending-change display maps raw field/value pairs despite capability metadata.
- Issue remediation card recomputes capability gates and exposes a broad workflow hook.
- Questionnaire and register page flows are partially deepened but still repeat page-local state and mutation choreography.

TDD RED tests:

- Add backend capability/write consistency tests for access-user authority decisions.
- Add frontend tests proving access rows consume workflow-provided action/presentation models.
- Add approval list tests proving `can_view_pending_changes=false` suppresses pending-change detail and labels remain display-safe.
- Add issue remediation tests proving section visibility derives from backend capability metadata through one workflow projection.
- Add questionnaire/register workflow tests for status/capability transitions before moving page-local state.

Minimal GREEN direction:

- Derive access read capabilities and write authorization from the same policy facts while keeping mutation ownership in `_identity_access_lifecycle`.
- Make frontend rows/cards consume workflow projections instead of rebuilding action facts locally.
- Move pending-change presentation into an approval display/action Module.
- Keep frontend gates as mirrors of backend capability metadata, not new authority.

`code-simplifier` REFACTOR checklist:

- Do not introduce frontend-only protected mutation gates.
- Prefer named projections over passing many booleans through components.
- Keep touched React components explicit, with readable branch structure and no nested ternaries.
- Remove redundant state only after tests prove equivalent behavior.

Verification commands:

- `python3 scripts/security/validate_authz_capability_contract.py`
- Backend access and issue workflow pytest targets.
- Frontend Vitest targets for access users, approvals, issue remediation, questionnaires, and register page state.
- `cd frontend && npx tsc --noEmit` for type-safety after frontend moves.

Rollback notes:

- Roll back frontend workflow changes per surface. Do not leave a page half-consuming old local gates and half-consuming the new projection.

ADR and contract impact:

- ADR-001 and ADR-011 are relevant for capability/session authority.
- `docs/security/authorization-capability-contract.md`, its JSON mirror, and `docs/security/capability-catalog.json` must be updated for any capability semantic change.

## Wave 4: Architecture Locks and Runtime/Script Seams

Target Modules:

- Architecture lock tests, ADR transaction policy text, release parity audit, deploy/runtime script helpers, scheduler/logging compatibility facades

Verified problem:

- Several architecture tests assert filenames, source strings, and symbol names rather than behavior-level facts.
- ADR-002 and ADR-011 describe auth endpoint commit migration history; implementation and locks may have moved past parts of that history.
- Release parity orchestration exposes a broad private-method Protocol and Shallow phase facade.
- Script/runtime command facts are duplicated across audit helpers, shell scripts, and docs.

TDD RED tests:

- Add behavior-level architecture tests for transaction ownership, endpoint Adapter responsibilities, reserved-surface parity, and release phase facts.
- Add tests that fail on stale transaction-policy documentation when allowlists and locks disagree.
- Add release parity tests around phase fact ownership and runtime evidence production rather than private method names.
- Add deploy secret lifecycle tests around library helpers before moving shell logic.

Minimal GREEN direction:

- Rework brittle string locks into behavior or metadata locks while preserving current architectural protections.
- Reconcile ADR text with the current lock state, keeping migration history separate from current truth.
- Move runtime command facts into reusable script Modules consumed by release parity, prod readiness, and docs checks.
- Keep public shell scripts as Adapters.

`code-simplifier` REFACTOR checklist:

- Do not weaken architecture locks while making them less brittle.
- Prefer parsed metadata and AST checks over raw substring checks where practical.
- Keep shell entrypoints small and readable.
- Preserve existing public command behavior.

Verification commands:

- `make -f scripts/Makefile test-architecture-locks`
- Targeted tests for release parity and install/deploy script contracts.
- `python3 scripts/security/validate_authz_capability_contract.py` if authz docs are touched.

Rollback notes:

- Change locks and docs in the same commit as the behavior they protect.
- If a lock rewrite becomes ambiguous, keep the old lock and add the new one first; remove the old lock only after GREEN verification.

ADR and contract impact:

- ADR-002, ADR-004, ADR-006, ADR-009, ADR-010, and ADR-011 are relevant.
- ADR edits must cite the current lock or command that enforces the claim.

## Wave 5: Lower-Priority Follow-Up Backlog

The latest audit surfaced these candidates, but this document does not promote
them for immediate implementation because this pass did not re-verify every
line anchor needed for code work. Treat each as a pre-implementation
verification task. Promote the item only after fresh anchors confirm the
problem still exists.

| Candidate | Current evidence status | Future RED test direction | Gate to promote |
| --- | --- | --- | --- |
| Deadline execution dedupe | Needs fresh line anchors before implementation. | Prove KRI, issue, and questionnaire deadlines share dedupe/notification decisions where intended. | Promote only after `_deadline_execution` and caller services are re-read. |
| Issue workflow HTTP error translation | Needs fresh line anchors before implementation. | Add service-level tests that assert domain outcomes without HTTP exceptions. | Promote only if ADR-003 direction still makes current HTTP coupling actionable. |
| Frontend register/list workflow duplication | `frontend/src/pages/shared/useRegisterPageController.ts:80` and `frontend/src/pages/controls/useControlsPageState.ts:85` verify the shared controller exists and one page consumes it. | Add page-state transition tests before moving risks/KRIs/vendors/issues. | Promote after risks/KRIs/vendors/issues hooks are re-read. |
| Contextual issue quick-create | `frontend/src/pages/detail/ContextualIssueAction.tsx:18` verifies the shared action exists. | Prove KRI/vendor/execution entrypoints use one action-gating path. | Promote after all candidate entrypoints are re-read. |
| Activity log workflow | `docs/security/authorization-capability-contract.md:151` verifies the authz surface; frontend helper anchors need re-check. | Prove filter/view/capability transitions through one workflow Module. | Promote after backend `_activity_log_query` and frontend hook are re-read. |
| Quarterly metrics catalog | Needs fresh line anchors before implementation. | Prove metric names, availability, and period retrieval stay consistent. | Promote only with ADR-006 snapshot coverage. |
| Reserved-surface parity | Needs fresh registry/docs/code anchors before implementation. | Add registry/docs/code parity test before changing endpoint reservations. | Promote when new reserved endpoint packages or drift are found. |

## Acceptance Criteria for Future Implementation

- Every production change has a RED test that fails for the expected reason before implementation.
- Every GREEN pass is minimal and followed by a `code-simplifier` refactor pass on touched code only.
- Every behavior-preserving refactor reruns the same test that was used for GREEN.
- Architecture locks are updated only when they continue to protect the same or stronger behavior.
- Capability or authz behavior changes update the markdown contract, JSON mirror, capability catalog when applicable, and validator coverage.
- No future implementation introduces new frontend-only authority for protected backend mutations.
- No future implementation designs new public Interfaces before the selected candidate has been grilled and scoped.

## Verification Commands Run While Creating This Document

```bash
git status --short --branch
make -f scripts/Makefile test-architecture-locks
python3 scripts/security/validate_authz_capability_contract.py
```

Results:

- `git status --short --branch`: `## main...origin/main`
- `make -f scripts/Makefile test-architecture-locks`: `197 passed in 2.80s`; snapshot summary: `1 snapshot passed`
- `python3 scripts/security/validate_authz_capability_contract.py`: `Authorization capability contract validation passed.`

## Explicit Non-Claims

- This document does not claim full backend, frontend, Postgres, or E2E test suites pass.
- This document does not claim the lower-priority backlog has enough current line anchors to implement without a fresh pre-implementation verification pass.
- This document does not claim to supersede `.planning/audits/resolution-plan.md`.
- This document does not change runtime behavior, public APIs, schemas, or production Interfaces.
