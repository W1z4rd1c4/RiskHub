# Production Code Quality Review — 2026-03-05

## Scope and Guardrails
- Scope: repo-wide low-quality-code audit optimized for an external professional review.
- Guardrails: behavior-preserving refactors only; no intentional API, RBAC, route-contract, or schema changes.
- Baseline date: 2026-03-05.

## Audit Rubric
Each finding was ranked on:
- Reviewer visibility
- Correctness / risk
- Blast radius
- Fix cost
- Verification cost

Disposition buckets:
- `Must Fix Before Review`
- `Should Fix If Time Allows`
- `Defer With Rationale`

## Baseline Revalidation (2026-03-05)

### Gate Commands
1. Backend Ruff
```bash
cd backend \
  && ./venv/bin/python -m ruff check app ../tests/backend/pytest scripts
```
Status: PASS.

2. Frontend ESLint
```bash
cd frontend && npm run lint
```
Status: PASS.

3. Frontend TypeScript
```bash
cd frontend && npx tsc --noEmit
```
Status: PASS.

4. Frontend debt budget
```bash
cd frontend && npm run quality:debt -- --report-json
```
Status: PASS.

5. Frontend dead-code scan
```bash
cd frontend && npm run cleanup:deadcode
```
Status: PASS.

6. Backend suppression budget
```bash
cd  && python3 scripts/tools/suppression_budget.py
```
Status: PASS (`Observed=2, Max=2, Unmatched=0, Expired=0, StaleAllowlist=0`).

### Baseline Read
- The repo still has a strong mechanical baseline: lint, typecheck, dead-code, debt-budget, and suppression-budget checks are green.
- The remaining reviewer risk is structural and readability-oriented rather than obvious lint debt.

## Wave A Completion Across March 5 Sweeps

### 1. Activity log page decomposition
- Extracted presentation logic from the page into:
  - `frontend/src/components/activity-log/ActivityLogEntries.tsx`
  - `frontend/src/components/activity-log/ActivityLogPagination.tsx`
  - `frontend/src/components/activity-log/activityLogPresentation.ts`
- Updated `tests/frontend/unit/src/pages/__tests__/ActivityLogPage.test.tsx` to import the real helper logic instead of re-implementing it in the test.
- Result: `frontend/src/pages/ActivityLogPage.tsx` reduced from `419` lines to `128` lines.
- Reviewer impact: the page now reads as orchestration only; helper logic and leaf presentation no longer inflate page complexity.

### 2. Vendor SLA deadline service orchestration cleanup
- Extracted query/config/context-loading helpers into `backend/app/services/vendor_sla_deadline_support.py`.
- Reduced top-level orchestration noise in `backend/app/services/vendor_sla_deadline_service.py`.
- Fixed a correctness leak: `check_vendor_sla_deadlines(..., now=...)` now derives `today` from the supplied `now`, not machine-local `date.today()`.
- Added regression coverage in `tests/backend/pytest/test_vendor_slas.py`.
- Result: service file reduced from `476` lines to `463` lines; more importantly, the top-level method now reads as context assembly plus workflow execution instead of one long mixed-responsibility block.

### 3. Approvals page decomposition
- Extracted page-local state and presentation into:
  - `frontend/src/pages/approvals/useApprovalsPageState.ts`
  - `frontend/src/pages/approvals/approvalsPresentation.ts`
  - `frontend/src/pages/approvals/ApprovalsTabs.tsx`
  - `frontend/src/pages/approvals/ApprovalList.tsx`
  - `frontend/src/pages/approvals/QuestionnaireInboxList.tsx`
  - `frontend/src/pages/approvals/ApprovalResolutionDialog.tsx`
- Kept the route and default export stable in `frontend/src/pages/ApprovalsPage.tsx`.
- Added focused helper coverage in `tests/frontend/unit/src/pages/__tests__/ApprovalsPage.presentation.test.ts`.
- Result: `frontend/src/pages/ApprovalsPage.tsx` reduced from `557` lines to `110` lines.
- Reviewer impact: queue/history/questionnaire rendering is no longer tangled with loading and mutation state, so the page reads as orchestration instead of an all-in-one feature file.

### 4. Control form decomposition
- Preserved the public re-export in `frontend/src/components/ControlForm.tsx`.
- Extracted form-local helpers into:
  - `frontend/src/components/control-form/useControlFormLookups.ts`
  - `frontend/src/components/control-form/controlFormFilters.ts`
  - `frontend/src/components/control-form/controlFormValidation.ts`
- Normalized lookup/risk load failures and submit failures through shared error-key handling in `frontend/src/components/control-form/controlFormUtils.ts`.
- Added helper coverage in `tests/frontend/unit/src/components/__tests__/ControlForm.helpers.test.ts`.
- Result: `frontend/src/components/control-form/ControlFormContainer.tsx` reduced from `598` lines to `498` lines while keeping the existing step flow, approval-queued edit behavior, and submit contract stable.
- Reviewer impact: data loading, filtering, and validation are now explicit seams instead of hidden inline branches inside the wizard container.

### 5. Oversized backend API test modularization
- Replaced `tests/backend/pytest/test_kris_history_api.py` with behavior-focused modules:
  - `tests/backend/pytest/test_kris_value_submission_api.py`
  - `tests/backend/pytest/test_kris_history_listing_api.py`
  - `tests/backend/pytest/test_kris_due_status_api.py`
  - `tests/backend/pytest/test_kris_submission_rbac_api.py`
  - `tests/backend/pytest/test_kris_department_filters_api.py`
  - `tests/backend/pytest/test_kris_history_corrections_api.py`
- Shared KRI fixtures now live in `tests/backend/pytest/kri_history_api_support.py`.
- Replaced `tests/backend/pytest/api/v1/test_issues_api.py` with behavior-focused modules:
  - `tests/backend/pytest/api/v1/test_issues_crud_api.py`
  - `tests/backend/pytest/api/v1/test_issues_rbac_api.py`
  - `tests/backend/pytest/api/v1/test_issues_owner_validation_api.py`
  - `tests/backend/pytest/api/v1/test_issues_contextual_api.py`
  - `tests/backend/pytest/api/v1/test_issues_lookup_filter_api.py`
- Shared issues helpers and fixtures now live in:
  - `tests/backend/pytest/api/v1/issues_api_helpers.py`
  - `tests/backend/pytest/api/v1/issues_api_support.py`
- Reviewer impact: the test suite now signals behavior by filename and keeps fixture/setup noise out of the main contract assertions.

### 6. Canonical-gate cleanup
- Fixed a backend Ruff line-wrap failure in `backend/app/core/security.py`.
- Fixed import ordering in `tests/backend/pytest/test_seed_rbac_parity.py`.
- These were not part of the original structural sweep, but they were required to restore the repo’s canonical `make lint` gate to green.

## Wave B Completion Across March 5 Sweeps

### 7. KRI deadline service orchestration cleanup
- Extracted shared config/query/recipient loading into `backend/app/services/kri_deadline_support.py`.
- Kept `KRIDeadlineService.check_kri_deadlines(db)` stable while reducing `backend/app/services/kri_deadline_service.py` from `406` lines to `362` lines.
- Fixed a real defect: in-scope risk managers now receive `kri_breach_detected` notifications because the notification block is no longer unreachable under `continue`.
- Added regression coverage in `tests/backend/pytest/test_kri_deadline_service.py`.
- Reviewer impact: the remaining deadline orchestration now reads as workflow logic instead of mixed config/query setup, and the breach-notification path no longer has a reviewer-visible correctness hole.

### 8. Vendor detail page decomposition
- Extracted page-local state and presentation into:
  - `frontend/src/pages/vendors/useVendorDetailState.ts`
  - `frontend/src/pages/vendors/vendorDetailPresentation.ts`
  - `frontend/src/pages/vendors/VendorFormView.tsx`
  - `frontend/src/pages/vendors/VendorDetailHeader.tsx`
  - `frontend/src/pages/vendors/VendorSummaryCards.tsx`
  - `frontend/src/pages/vendors/VendorTabs.tsx`
  - `frontend/src/pages/vendors/VendorTabPanel.tsx`
- Kept the route and export stable in `frontend/src/pages/VendorDetailPage.tsx`.
- Result: `frontend/src/pages/VendorDetailPage.tsx` reduced from `551` lines to `129` lines.
- Reviewer impact: mode switching, tab/query-param behavior, restore handling, and issue quick-create entry now sit behind explicit seams instead of one large page file.

### 9. Issues page decomposition
- Extracted page-local parsing/state/rendering into:
  - `frontend/src/pages/issues/issuesPagePresentation.ts`
  - `frontend/src/pages/issues/useIssuesPageState.ts`
  - `frontend/src/pages/issues/IssuesPageHeader.tsx`
  - `frontend/src/pages/issues/IssuesFilterBar.tsx`
  - `frontend/src/pages/issues/IssuesTableSection.tsx`
- Kept the route and export stable in `frontend/src/pages/IssuesPage.tsx`.
- Result: `frontend/src/pages/IssuesPage.tsx` reduced from `551` lines to `118` lines.
- Reviewer impact: URL-driven initialization, filtering, export submission, pagination, sorting, and table presentation are now separated into reviewable units rather than hidden inside one page component.

### 10. Docs sync for Wave B
- Updated user-facing manuals with real workflow clarifications in:
  - `docs/user/vendors.md`
  - `docs/user-cs/vendors.md`
  - `docs/user/issues.md`
  - `docs/user-cs/issues.md`
- Added source-of-truth metadata for the new page-local folders and clarified:
  - vendor detail tabs are linkable via `?tab=...`
  - issues filters can be pre-applied from inbound links and should be treated as the starting view
- Reviewed `docs/BUSINESS_LOGIC.md`, `docs/user/kris.md`, `docs/user/notifications.md`, and Czech counterparts for KRI breach-notification drift.
- Result: no content drift found in KRI/notifications docs, so those manuals were left unchanged and the review outcome is recorded here instead of creating timestamp-only churn.

## Wave C Completion Across March 5 Sweeps

### 11. Vendor SLA deadline service completion
- Extracted deadline-evaluation policy into:
  - `backend/app/services/vendor_sla_deadline_support.py`
  - `backend/app/services/vendor_sla_notification_policy.py`
- Kept `VendorSLADeadlineService.check_vendor_sla_deadlines(db, *, now=None)` stable while reducing `backend/app/services/vendor_sla_deadline_service.py` from `463` lines to `130` lines.
- Added focused regression coverage in `tests/backend/pytest/test_vendor_slas.py` for:
  - due notification counter behavior
  - near-breach counter behavior
  - breach duplicate suppression
- Reviewer impact: the service now reads as context assembly plus per-SLA orchestration instead of carrying duplicate lookup, recipient loading, and notification composition inline.

### 12. Controls page decomposition
- Extracted page-local state and presentation into:
  - `frontend/src/pages/controls/useControlsPageState.ts`
  - `frontend/src/pages/controls/controlsPagePresentation.ts`
  - `frontend/src/pages/controls/ControlsPageHeader.tsx`
  - `frontend/src/pages/controls/ControlsFilterBar.tsx`
  - `frontend/src/pages/controls/ControlsTableSection.tsx`
- Kept the route and export stable in `frontend/src/pages/ControlsPage.tsx`.
- Result: `frontend/src/pages/ControlsPage.tsx` reduced from `489` lines to `80` lines.
- Reviewer impact: grouped/all-view fetching, restore/export handling, filter state, and render branches are now reviewable seams instead of one mixed register page.

### 13. Risks page decomposition
- Extracted page-local state and presentation into:
  - `frontend/src/pages/risks/useRisksPageState.ts`
  - `frontend/src/pages/risks/risksPagePresentation.ts`
  - `frontend/src/pages/risks/RisksPageHeader.tsx`
  - `frontend/src/pages/risks/RisksFilterBar.tsx`
  - `frontend/src/pages/risks/RisksTableSection.tsx`
- Kept the route and export stable in `frontend/src/pages/RisksPage.tsx`.
- Result: `frontend/src/pages/RisksPage.tsx` reduced from `485` lines to `121` lines.
- Reviewer impact: one-time inbound query-param initialization, grouped/all-view data loading, restore/export handling, sorting, and grouped rendering no longer compete inside one page file.

### 14. Docs sync for Wave C
- Reviewed `docs/BUSINESS_LOGIC.md` plus the touched workflow manuals:
  - `docs/user/controls.md`
  - `docs/user/risks.md`
  - `docs/user/vendors.md`
  - `docs/user/notifications.md`
  - `docs/user-cs/controls.md`
  - `docs/user-cs/risks.md`
  - `docs/user-cs/vendors.md`
  - `docs/user-cs/notifications.md`
- Result: no content drift found in those docs for this sweep, so only this audit packet was updated and the manuals were left unchanged.

## Findings

### Must Fix Before Review

- None remain from the March 5 Wave A, Wave B, or Wave C lists.
- Retired across the March 5 sweeps:
  - `frontend/src/pages/ApprovalsPage.tsx`
  - `frontend/src/components/control-form/ControlFormContainer.tsx`
  - `tests/backend/pytest/test_kris_history_api.py`
  - `tests/backend/pytest/api/v1/test_issues_api.py`
  - `backend/app/services/kri_deadline_service.py`
  - `backend/app/services/vendor_sla_deadline_service.py`
  - `frontend/src/pages/VendorDetailPage.tsx`
  - `frontend/src/pages/IssuesPage.tsx`
  - `frontend/src/pages/ControlsPage.tsx`
  - `frontend/src/pages/RisksPage.tsx`

### Should Fix If Time Allows

1. `frontend/src/pages/DashboardPage.tsx`
- Evidence: still `517` lines and remains the default landing page for most reviewer sampling.
- Why reviewers will care: this is now the most visible remaining example of data-fetching, orchestration, and page rendering living together.
- Safe fix: apply the same orchestration-first split used for `VendorDetailPage.tsx`, `IssuesPage.tsx`, `ControlsPage.tsx`, and `RisksPage.tsx`.
- Verification: targeted dashboard Playwright coverage plus frontend lint/typecheck.

2. Secondary large detail/register surfaces
- Evidence: deeper-review files like `frontend/src/pages/RiskDetailPage.tsx` (`466` lines), `frontend/src/pages/KRIsPage.tsx` (`462` lines), and `frontend/src/pages/DepartmentDetailPage.tsx` (`442` lines) are now the next-largest reviewer-visible UI hotspots.
- Why reviewers will care: these are no longer the first files a reviewer is likely to sample, but they still reflect accumulated orchestration and presentation logic in one place.
- Safe fix: continue the page-local state/presentation extraction pattern as time allows.
- Verification: targeted page tests plus frontend lint/typecheck.

### Defer With Rationale

1. Broad cross-browser Playwright expansion
- Rationale: the highest-value reviewer-visible flows are now covered in targeted `chromium` runs for approvals and controls; broader three-browser expansion is useful but no longer the blocking pre-review item.
- Action: keep as a later reliability pass unless browser-specific regressions appear.

2. Lower-priority suite and polish audits
- Rationale: the codebase now presents a stronger structure on the surfaces most likely to be sampled in review, so remaining suite-shape cleanups can defer behind service-layer follow-up.
- Action: leave for a later test-optimization pass unless execution time or flakiness becomes a problem before review.

## Remediation Order

### Wave A — Reviewer-visible must-fix
- Complete. The original Wave A must-fix list is retired.

### Wave B — Structural cleanup
- Complete for `kri_deadline_service.py`, `VendorDetailPage.tsx`, and `IssuesPage.tsx`, including docs sync.

### Wave C — Structural cleanup
- Complete for `vendor_sla_deadline_service.py`, `ControlsPage.tsx`, and `RisksPage.tsx`, with docs review recorded in this report.

### Wave D — Deferred debt
- `DashboardPage.tsx`.
- Secondary large detail/register surfaces (`RiskDetailPage.tsx`, `KRIsPage.tsx`, `DepartmentDetailPage.tsx`, other `pages/*` files near 400+ lines).
- Cross-browser suite expansion and lower-urgency E2E maintainability work.

## Verification Performed For This Pass
- `cd frontend && npm run test:run -- ../tests/frontend/unit/src/pages/__tests__/ApprovalsPage.presentation.test.ts ../tests/frontend/unit/src/components/__tests__/ControlForm.helpers.test.ts ../tests/frontend/unit/src/__tests__/approval_ui_rendering.spec.tsx ../tests/frontend/unit/src/__tests__/approval_edit_update_handling.spec.ts`
  - Result: PASS (`32` tests).
- `cd backend && ./venv/bin/pytest ../tests/backend/pytest/test_kris_value_submission_api.py ../tests/backend/pytest/test_kris_history_listing_api.py ../tests/backend/pytest/test_kris_due_status_api.py ../tests/backend/pytest/test_kris_submission_rbac_api.py ../tests/backend/pytest/test_kris_department_filters_api.py ../tests/backend/pytest/test_kris_history_corrections_api.py -q`
  - Result: PASS (`26` tests).
- `cd backend && ./venv/bin/pytest ../tests/backend/pytest/api/v1/test_issues_crud_api.py ../tests/backend/pytest/api/v1/test_issues_rbac_api.py ../tests/backend/pytest/api/v1/test_issues_owner_validation_api.py ../tests/backend/pytest/api/v1/test_issues_contextual_api.py ../tests/backend/pytest/api/v1/test_issues_lookup_filter_api.py -q`
  - Result: PASS (`26` tests).
- `cd frontend && npm run test:e2e -- --project=chromium ../tests/frontend/e2e/approval-workflows/status-flow.spec.ts ../tests/frontend/e2e/approval-workflows/self-approval.spec.ts ../tests/frontend/e2e/approval-workflows/tiered-approval.spec.ts ../tests/frontend/e2e/permissions/approvals-access.spec.ts ../tests/frontend/e2e/sensitive-fields/control-sensitive.spec.ts ../tests/frontend/e2e/controls.spec.ts ../tests/frontend/e2e/permissions/controls-crud.spec.ts`
  - Result: PASS (`41` passed, `4` skipped).
- `make -f scripts/Makefile verify`
  - Result: PASS.
- `make -f scripts/Makefile lint`
  - Result: PASS.
- `cd frontend && npm run test:run -- ../tests/frontend/unit/src/pages/__tests__/VendorDetailPage.issue-entry.test.tsx ../tests/frontend/unit/src/pages/__tests__/VendorDetailPage.presentation.test.ts ../tests/frontend/unit/src/pages/__tests__/IssuesPage.layout-parity.test.tsx ../tests/frontend/unit/src/pages/__tests__/IssuesPage.url-params.test.tsx ../tests/frontend/unit/src/pages/__tests__/IssuesPage.naming.test.tsx ../tests/frontend/unit/src/pages/__tests__/IssuesPage.table-navigation.test.tsx`
  - Result: PASS (`11` tests).
- `cd backend && ./venv/bin/pytest ../tests/backend/pytest/test_kri_deadline_service.py ../tests/backend/pytest/test_global_config_usage.py -q`
  - Result: PASS (`22` tests).
- `python3 scripts/check_docs_contract.py`
  - Result: PASS.
- `cd frontend && npm run test:e2e -- --project=chromium ../tests/frontend/e2e/vendors.spec.ts ../tests/frontend/e2e/permissions/vendor-slas-crud.spec.ts ../tests/frontend/e2e/issues-contextual-create.spec.ts ../tests/frontend/e2e/issues-workflow.spec.ts`
  - Result: PASS (`9` tests).
- `cd backend && ./venv/bin/pytest ../tests/backend/pytest/test_vendor_slas.py -q`
  - Result: PASS (`9` tests).
- `cd frontend && npm run test:run -- ../tests/frontend/unit/src/pages/__tests__/ControlsPage.archived-visibility.test.tsx ../tests/frontend/unit/src/pages/__tests__/ControlsPage.presentation.test.ts ../tests/frontend/unit/src/pages/__tests__/RisksPage.archived-visibility.test.tsx ../tests/frontend/unit/src/pages/__tests__/RisksPage.presentation.test.ts ../tests/frontend/unit/src/pages/__tests__/rbac_gating.test.tsx`
  - Result: PASS (`20` tests).
- `cd frontend && npm run test:e2e -- --project=chromium ../tests/frontend/e2e/controls.spec.ts ../tests/frontend/e2e/permissions/controls-crud.spec.ts ../tests/frontend/e2e/risks.spec.ts ../tests/frontend/e2e/permissions/risks-crud.spec.ts`
  - Result: PASS (`25` tests).
- `make -f scripts/Makefile verify`
  - Result: PASS.
- `make -f scripts/Makefile lint`
  - Result: PASS.
- `python3 scripts/check_docs_contract.py`
  - Result: PASS.

## Evidence Map
- Prior baseline shape and previous quality hardening: `docs/quality/production-code-quality-review-2026-02-22-round3.md`
- Current gate contract: `scripts/Makefile`
- Implemented March 5 frontend decomposition:
  - `frontend/src/pages/ActivityLogPage.tsx`
  - `frontend/src/components/activity-log/ActivityLogEntries.tsx`
  - `frontend/src/components/activity-log/ActivityLogPagination.tsx`
  - `frontend/src/components/activity-log/activityLogPresentation.ts`
  - `frontend/src/pages/ApprovalsPage.tsx`
  - `frontend/src/pages/approvals/useApprovalsPageState.ts`
  - `frontend/src/pages/approvals/ApprovalList.tsx`
  - `frontend/src/components/control-form/ControlFormContainer.tsx`
  - `frontend/src/components/control-form/useControlFormLookups.ts`
  - `frontend/src/components/control-form/controlFormFilters.ts`
  - `frontend/src/components/control-form/controlFormValidation.ts`
- Implemented backend cleanup and test modularization:
  - `backend/app/services/vendor_sla_deadline_service.py`
  - `backend/app/services/vendor_sla_deadline_support.py`
  - `tests/backend/pytest/test_vendor_slas.py`
  - `tests/backend/pytest/kri_history_api_support.py`
  - `tests/backend/pytest/test_kris_value_submission_api.py`
  - `tests/backend/pytest/api/v1/issues_api_helpers.py`
  - `tests/backend/pytest/api/v1/test_issues_crud_api.py`
- Implemented Wave B cleanup and docs sync:
  - `backend/app/services/kri_deadline_service.py`
  - `backend/app/services/kri_deadline_support.py`
  - `frontend/src/pages/VendorDetailPage.tsx`
  - `frontend/src/pages/vendors/*`
  - `frontend/src/pages/IssuesPage.tsx`
  - `frontend/src/pages/issues/*`
  - `tests/backend/pytest/test_kri_deadline_service.py`
  - `tests/frontend/unit/src/pages/__tests__/VendorDetailPage.presentation.test.ts`
  - `docs/user/vendors.md`
  - `docs/user-cs/vendors.md`
  - `docs/user/issues.md`
  - `docs/user-cs/issues.md`
- Implemented Wave C cleanup:
  - `backend/app/services/vendor_sla_deadline_service.py`
  - `backend/app/services/vendor_sla_deadline_support.py`
  - `backend/app/services/vendor_sla_notification_policy.py`
  - `frontend/src/pages/ControlsPage.tsx`
  - `frontend/src/pages/controls/*`
  - `frontend/src/pages/RisksPage.tsx`
  - `frontend/src/pages/risks/*`
  - `tests/backend/pytest/test_vendor_slas.py`
  - `tests/frontend/unit/src/pages/__tests__/ControlsPage.presentation.test.ts`
  - `tests/frontend/unit/src/pages/__tests__/RisksPage.presentation.test.ts`
- Docs reviewed with no content drift:
  - `docs/BUSINESS_LOGIC.md`
  - `docs/user/controls.md`
  - `docs/user/risks.md`
  - `docs/user/vendors.md`
  - `docs/user/kris.md`
  - `docs/user/notifications.md`
  - `docs/user-cs/controls.md`
  - `docs/user-cs/risks.md`
  - `docs/user-cs/vendors.md`
  - `docs/user-cs/kris.md`
  - `docs/user-cs/notifications.md`
- Remaining top-priority deferred hotspots:
  - `frontend/src/pages/DashboardPage.tsx`
  - `frontend/src/pages/RiskDetailPage.tsx`
  - `frontend/src/pages/KRIsPage.tsx`
  - `frontend/src/pages/DepartmentDetailPage.tsx`

## Summary
The reviewer-visible March 5 Wave A, Wave B, and Wave C lists are now complete. The repo’s remaining pre-review quality risk is concentrated in the dashboard landing page and a smaller set of secondary large detail/register surfaces, with docs review now operating as part of the same quality workflow instead of trailing behind code changes.
