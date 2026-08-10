# ICT Register — frontend design/UX audit, findings ledger

_Audit baseline: `dora` @ `db0826e0`, 2026-07-11. Method: 7 explorer agents over the design
system, forms, vendor sections, ICT committee/DQ, list/tables, IA/nav, and i18n/a11y; every
🔴/🟡 finding re-verified against source. Backs
[FRONTEND-UX-REMEDIATION-CAPTURE.md](./FRONTEND-UX-REMEDIATION-CAPTURE.md); `file:line`
anchors are verbatim where a specific offending line exists; some rows reference a whole surface
(e.g. "add a link to page X") and cite the file without a line. "Target phase" maps to the capture's
Execution phases._

**Correction (during grilling):** the original audit listed "no register export" as
critical. This is **wrong** — export exists on `VendorReportsPage` /
`download_vendor_dora_register`. Re-scoped to **S2** below (readiness screens don't *link* to
it).

## 🔴 Critical

| ID | Area | Source (file:line) | Finding | New/Shared | Phase | Acceptance |
|----|------|--------------------|---------|-----------|-------|-----------|
| C1 | Forms — labels + selects | `assets/AssetForm.tsx:207,228`; `processes/ProcessForm.tsx:181,201`; `threats/ThreatForm.tsx:107,133`; `vendors/VendorContractsSection.tsx:209`; `vendor-form/VendorRegisterSection.tsx:130`; `ui/ThemedSelect.tsx:89` | `<label>` not associated (no `htmlFor`/`id`); many selects derive their name from a repeated "Not set" placeholder (a few call sites do pass explicit labels) | DORA-NEW | 2 | axe + SR walkthrough: each field has a unique programmatic name |
| C2 | `SortableTable` keyboard | `components/tables/SortableTable.tsx:132,144,125` | Sort headers + rows mouse-only; no `scope`/`aria-sort`; chevron not a control → no keyboard path to detail | SHARED→main | 3 | keyboard-nav e2e: sort + open-detail by keyboard; `aria-sort` present |
| C3 | Loading shows wrong info | `AssetsPage.tsx:135`, `ProcessesPage.tsx:135`, `ThreatsPage.tsx:135`; `components/tables/SortableTable.tsx:51`; `IctRegisterDqPage.tsx:155` | Lists flash "No data available"; DQ summary shows 0/0/0 during load | DORA-NEW | 3 | skeleton/`aria-busy` during load; no false empty/zero state |
| C4 | Fetch error = empty | `vendors/VendorContractsSection.tsx:202`; `VendorSubOutsourcingSection.tsx:95`; `VendorRegisterLinksSection.tsx:152`; `assets/AssetForm.tsx:116` | `.isError` never read → dropped request renders as "no data"/empty dropdown | DORA-NEW | 3 (2 for forms) | error state + retry on fetch failure |
| C5 | Native `required` preempts banner | `assets/AssetForm.tsx:239,252`; `ProcessForm.tsx:226`; `ThreatForm.tsx:139` | No `noValidate` + `required` → browser tooltip fires, styled i18n banner never shows | DORA-NEW | 2 | `noValidate`; JS validation shows styled per-field error |
| C6 | No sub-`lg` operability | `components/layout/Sidebar.tsx:106`; `components/layout/MainLayout.tsx:12` | Sidebar `hidden lg:flex`, no fallback → app unnavigable below `lg` (and a hard gate would fail AA reflow) | SHARED→main | 4 | desktop-only: neutral informational notice below `lg`; SC 1.4.10 / 1.4.4 recorded as **accepted exceptions** per ADR-014 (no AA-scope claim, no reflow shell) — see Dispositions |

## 🟡 Should-fix

| ID | Area | Source (file:line) | Finding | New/Shared | Phase | Acceptance |
|----|------|--------------------|---------|-----------|-------|-----------|
| S1 | Committee priority | `IctRegisterCommitteePage.tsx:515` | Blocking counts styled `text-white`, same as neutral inventory counts | DORA-NEW | 5 | readiness/blocking number visually prioritized |
| S2 | Export discoverability (was "no export") | `frontend/src/pages/VendorReportsPage.tsx:21,172`; `backend/app/services/vendor_report_policy.py:20`; `frontend/src/pages/IctRegisterDqPage.tsx`, `frontend/src/pages/IctRegisterCommitteePage.tsx` | Export exists but readiness screens don't link to it | DORA-NEW | 5 | committee/DQ link to export, **gated on `can_download_dora_register`** (test allowed + denied) |
| S3 | Sidebar active state | `components/layout/Sidebar.tsx:132` | `location.pathname === item.href` exact-match → no active highlight on any `:id`/edit route | SHARED→main | 4 | active nav item on detail routes |
| S4 | Nav IA / routing | `routing/business.tsx:161`; `routing/types.ts`; `App.tsx:72`; `navigation.json:13` vs `dashboard.json:74` | Flat 18-item nav, no grouping; bare `/ict-register` bounces; "Risk Committee"/"ICT Risk Committee" collision | DORA-NEW | 4 | grouped sections; `/ict-register` redirect; names disambiguated |
| S5 | No status tokens | `index.css` (`:root`); `ConfirmDialog.tsx:23`; `StepIndicator.tsx:53`; `vendorRoute.css:14`; `committeePresentation.ts:62` | Only `--destructive` tokenized; ≥3 rival status palettes incl. Excel pastels | SHARED→main | 1 (tokens) / 5 (migrate) | one token set; all palettes migrated |
| S6 | `Select` bypasses tokens | `components/ui/select.tsx:23,25,85` | Hardcoded colors; `focus:` (not `focus-visible:`); `ring-accent` vs `ring-ring` | SHARED→main | 2 | token-driven; focus-visible only |
| S7 | Dialogs not standardized | **Dialog surfaces inventoried by interaction contract** (Phase 2c): named `*Modal`/`*Dialog` files + non-filename dialogs `riskhub/panelPrimitives.tsx:11` `RiskHubModalFrame` (Departments/RiskTypes/ApprovalScenarios), inline delete dialogs `riskhub/DepartmentsPanel.tsx:313` + `riskhub/RiskTypesPanel.tsx:310`, `risks/risk-questionnaire-detail/RiskQuestionnaireDetailContainer.tsx:58`, `users/ADUserPicker.tsx:13`. **Not dialogs (excluded):** loading overlays e.g. `pages/ControlDetailPage.tsx:292` `isLoadingRisk`, and popovers/menus | Only **2** (`ConfirmDialog`, `ArchiveConfirmDialog`) use `DialogShell`; the rest lack the **complete** standardized contract (some implement parts — `role=dialog` in `LinkManagementDialog`/`IssueQuickCreateModal`/`ExportDialog`, Escape in `RiskDrilldownModal`) | SHARED→main | 2 | all **dialog/alert-dialog** surfaces on `DialogShell`; loading overlays use `aria-busy`/status; exact render-site inventory by contract is Phase 2c's first task |
| S8 | Icon-only actions | `assets/assetColumns.tsx:106`; `processColumns.tsx:117`; `threatColumns.tsx:81`; `vendorContractsPresentation.tsx:199` | Rely on `title`, not `aria-label` | DORA-NEW+shared | 5 | `aria-label` on every icon action |
| S9 | Archived rows / formatting | `vendors/VendorContractsSection.tsx:202`; `vendorContractsPresentation.tsx:159,166` | Archived not demoted; raw ISO dates; currency left-aligned | DORA-NEW | 4 (demote) / 5 (format) | archived dimmed; dates via `formatDateValue`; currency right-aligned |
| S10 | Empty states | `assets.json`/`processes.json`; `AssetsPage.tsx:135`; `IctRegisterDqPage.tsx:270` | "no data" == "no results"; DQ 0-findings has no all-clear state | DORA-NEW | 5 | distinct copy; positive DQ all-clear |
| S11 | Form feedback | `threats/ThreatForm.tsx:195`; `processes/ProcessForm.tsx:129` | ThreatForm lacks submit pulse; no `aria-invalid`; two required fields collapsed into one message | DORA-NEW | 2 | per-field errors; submit feedback |
| S12 | DQ scoped vs global count | `IctRegisterDqPage.tsx:261` | Header count global, `violating_rows` RBAC-scoped smaller, no messaging | DORA-NEW | 5 | "N of M shown" when scoped |
| S13 | Sub-outsourcing chain | `vendors/vendorSubOutsourcingPresentation.tsx:74` | Flattened, always-expanded, no per-contract header/collapse | DORA-NEW | 4 | grouped headers + expand/collapse |

## 🟢 Polish

| ID | Source (file:line) | Finding | New/Shared | Phase |
|----|--------------------|---------|-----------|-------|
| P1 | `index.html:5,7` | `<title>frontend</title>`, vite favicon, no meta description | SHARED→main | 1 |
| P2 | `index.css:1` | Blocking font `@import`, no preconnect | SHARED→main | 1 |
| P3 | `tailwind.config.js:52` | Dead `--chart-1..5` tokens (referenced, undefined, unused) — **remove** (no `chart-*` utility or `var(--chart-*)` in source; Recharts uses inline colours) | SHARED→main | 1 |
| P4 | `index.css:411` vs `vendorRoute.css` | Light-theme `!important` input rule kills `.vendor-input` theming (dead) | SHARED→main | 5 |
| P5 | `components/tables/Pagination.tsx:82` | Page-number buttons have no `aria-label` | SHARED→main | 5 |
| P6 | `assets/AssetLinkSections.tsx:366` | Link removal one-click, no confirm | DORA-NEW | 4 |
| P7 | `ui/SearchableEntitySelect.tsx:39` | Search input placeholder-only name; two-control (not one combobox) | DORA-NEW | 2/5 |
| P8 | `processes/processColumns.tsx:70` | Numeric columns not aligned; grouping/`ViewSwitcher` unused | DORA-NEW | 5 |
| P9 | `threats/threatColumns.tsx:36` | Truncated text with no `title`/hover cue | DORA-NEW | 5 |
| P10 | `IctRegisterCommitteePage.tsx:625,247` | Heatmaps lack legend; RoI readiness bar has no colour threshold | DORA-NEW | 5 |
| P11 | `vendorRoute.css` | Untokenized radius / z-index / motion durations | SHARED→main | 5 |
| P12 | `cs/navigation.json:13` | Committee label left in English | DORA-NEW | 4 |

## Dispositions

Every finding reaches one of: **resolved** (fixed + verified at its phase checkpoint),
**accepted limitation** (known, documented, not fixed), or **deferred** (explicitly out of
pre-merge scope, with rationale). Non-default dispositions:

- **C6 — accepted limitation.** Desktop-only (ADR-014): below `lg` gets an informational notice,
  not a reflow shell; SC 1.4.10 / 1.4.4 remain documented AA exceptions. Excluded from Phase 5's
  "zero un-triaged findings" gate (it is triaged, as accepted).
- **S2 — re-scoped.** The original "no export" finding was wrong (export exists); re-scoped to
  discoverability via capability-gated links.

All other findings default to **resolved** by their target phase unless a phase checkpoint
records a different disposition.

## ✅ Verified done well (no remediation)

i18n coverage (0 hardcoded strings, AST-scanner-verified); colour never the sole status
carrier; disciplined capability-gating; `DialogShell` is a genuinely accessible modal where
used; drill-down + deep-linking work end-to-end; consistent card/section/button conventions;
Inter+Outfit type pairing; new pages follow the newer house conventions.
