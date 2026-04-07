# Phase 252 Context: Quality Closure Loop

## Objective

Close the remaining current quality issues with a repo-wide professionalism pass: data and migration safety, backend workflow decomposition, frontend decomposition, artifact hygiene, and systemic quality gates.

## Expansion Areas

1. Data and migration safety: destructive imports, nondeterministic matching, and weak seed contracts.
2. Backend workflow decomposition: approvals, SSO, KRI update, scheduler/runtime, dashboard aggregates, and unified exports.
3. Frontend decomposition: route controllers, large forms/modals, duplicated modal infrastructure, and duplicated documentation-library UI.
4. Repo professionalism: broken checked-in utilities, placeholder product-surface docs, generated/archive artifacts in tracked source, and missing README coverage.
5. Systemic quality gates: broader blocking static analysis, artifact hygiene contracts, and smaller more maintainable tests.

## Completed Waves To Preserve

- `252-00`: phase scaffolding and fast sanity lock
- `252-01`: activity-log redaction hardening
- `252-02`: gate ratchets and coverage floors
- `252-03`: KRI form decomposition
- `252-10`: artifact hygiene cleanup and baseline repair
- `252-11`: repo-contract gate hardening for artifact hygiene
- `252-12`: deterministic migration script safety

The expansion must preserve the sanitized activity-log metadata behavior and the stricter frontend/backend quality baselines already landed.

## Explicitly Out Of Scope

- Repo-wide schema redesign or API contract churn without a concrete blocker
- Broad auth/session architecture replacement beyond touched quality/decomposition work
- Unrelated feature work or design changes not needed to close the five quality areas

## Local Structural Exemplars

- `frontend/src/components/control-form/*`
- `frontend/src/components/risk-form/*`
- `frontend/src/pages/VendorDetailPage.tsx`
- `frontend/src/pages/vendors/useVendorDetailState.ts`

## Execution Rules

- Run waves serially.
- Use `research -> analyze -> baseline test capture -> implementation waves`.
- Each implementation wave follows `analyze -> patch -> review -> targeted test`.
- Do not start the next wave until the current wave is green and summarized.
- Preserve public routes/imports/contracts unless a wave explicitly changes them.
- Keep top-level hotspot files as facades or orchestration layers only.
- Add or expand focused regression tests whenever behavior or safety guarantees change.
