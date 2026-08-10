# ICT-GOV-00 governed-register implementation baseline

_Ticket: [#72](https://github.com/W1z4rd1c4/RiskHub/issues/72) · Captured: 2026-07-15 · Branch: `dora`._

## Result

The frontend remediation tracked by #54 and #55–#70 is present and green in the
current dirty `dora` worktree. The governed-register stream must reuse those
foundations rather than reimplement them. This reconciliation adds no #71
product behavior and does not stage or rewrite the pre-existing user changes.

The remaining work is correctly owned by #73–#91: canonical responsibility
relationships, the generalized register query/shell contract, protected and
Composite approvals, Department operational views, and release documentation.

## Overlap classification

| Issue | Classification | Current evidence and #71 disposition |
|---|---|---|
| #55 | Complete | Semantic status tokens and Tailwind wiring are present; contrast tests cover all themes. Reuse. |
| #56 | Complete | Strict-zero JSX accessibility and Playwright axe collection are present. Extend state coverage only when new #71 surfaces land. |
| #57 | Complete | Product metadata and non-blocking repository-local fonts are present; dead chart tokens remain absent. No further #71 prerequisite. |
| #58 | Complete | `Field`, `Input`, and `ThemedSelect` expose the visible-label and ARIA contract, including the open-listbox test. Direct prerequisite for #74–#76. |
| #59 | Complete | Existing Process, Asset, Threat, and Vendor forms use the shared field/validation contract. New relationship fields remain ticket-owned by #73–#76. |
| #60 | Complete | `DialogShell` owns dialog/alert-dialog focus, Escape, restoration, stacking, and portalled-select behavior; the render-site inventory is executable. Reuse for #84–#88. |
| #61 | Complete | `SortableTable` owns keyboard sorting/detail navigation, loading skeletons, and the shared error contract. Reuse in #77–#82. |
| #62 | Complete | ICT Data Quality and ICT Committee have explicit loading/error behavior. No additional #71 prerequisite. |
| #63 | Complete | Grouped navigation, visibility preservation, detail-route active state, and routing-manifest coverage are present. Reuse for new CISO and Department surfaces. |
| #64 | Complete | ICT Committee is addressable at `/?view=ict-committee` with the legacy redirect and authorization gate. No new #71 behavior. |
| #65 | Complete | Archived-row presentation, expandable Sub-outsourcing chains, and confirmation for link removal are implemented and tested. Reuse for governed link UX. |
| #66 | Complete | Rival palettes use semantic tokens and committee contrast is covered. Presentation reference only. |
| #67 | Complete | The desktop advisory and horizontal scrolling are implemented as the documented C6 limitation. It is not a blanket exemption for explicitly responsive #71 surfaces. |
| #68 | Complete | Date/currency/truncation, empty-state, DQ, committee-priority, and heatmap presentation fixes are present. Reuse. |
| #69 | Complete | Capability-gated export discovery and the residual accessible-name sweep are present with allowed/denied coverage. Reuse the capability pattern. |
| #70 | Complete | The localized table error/stale-data/retry contract is implemented and consumed by #61/#62. Reuse unchanged. |

The implementation history contains explicit commits for every overlap, from
`2ad9f3f7` (#55) through `23ec3bdf` (#69), followed by strict-zero and
interaction hardening through `17b0f8d2`. The GitHub issues remain open, but
their code must not be duplicated by #71.

## Verified shared seams

| Seam | Verified source/test anchors | Boundary for the governed-register stream |
|---|---|---|
| Field and select | `frontend/src/components/ui/field.tsx`, `frontend/src/components/ui/ThemedSelect.tsx`, `tests/frontend/unit/src/components/ui/` | Extend the relationship fields in #73–#76. |
| Dialog | `frontend/src/components/DialogShell.tsx`, `tests/frontend/contracts/dialog-surfaces.json`, `tests/frontend/unit/src/components/DialogShell.test.tsx` | Reuse for approval and pending-mutation flows in #84–#88. |
| Sortable table | `frontend/src/components/tables/SortableTable.tsx`, `tests/frontend/unit/src/components/tables/__tests__/SortableTable.test.tsx` | Reuse through the declarative register framework from #77. |
| Loading/error | `frontend/src/components/tables/tableError/`, its unit tests, and the DQ/Committee loading-error tests | Reuse for all register and Department collection surfaces. |
| Semantic filters | `frontend/src/pages/shared/ictRegisterSemanticFilters.ts` and its unit test | Existing committee drill-down semantics are complete; the generalized addable-filter registry, Boolean/range algebra, scoped facets/lookups, and URL serialization belong to #77. |
| Register presentation | `frontend/src/pages/shared/useRegisterPageController.ts` and register page-state hooks | Current controller remains local-state based. Declarative configuration and URL restoration are intentionally #77 work, not a missing #54 prerequisite. |

## Native dependency frontier

Closing #72 unblocks the four independent responsibility foundations #73, #74,
#75, and #76. The verified safe order is:

1. `#73`, `#74`, `#75`, and `#76` (independent frontier).
2. `#74 -> #77`; then #77 unlocks `#78`–`#82` and contributes to #84.
3. `#78`–`#82 -> #83` for eight-register parity and legacy contraction.
4. `#74 + #77 -> #84 -> #85 -> #86 -> #87 -> #88` for the approval tracer and complete cascade.
5. `#83 + #88 -> #89 -> #90`; finally `#83 + #88 + #90 -> #91`.

No additional dependency on #55–#70 is required.

## Verification on the reconciled dirty worktree

| Gate | Exact result |
|---|---|
| `cd frontend && npm run lint` | Pass: ESLint; JSX a11y strict-zero with 0 findings, 0 baseline entries, 0 suppressions; dialog inventory 26 owners, 48 render sites, 5 non-dialog surfaces, 29 cases. |
| `cd frontend && npx tsc --noEmit` | Pass. |
| Focused Vitest seam suite | Pass: 11 files, 104 tests. |
| `cd frontend && npm run i18n:test` | Pass: parity across 20 namespaces, usage across 633 source files, no hardcoded UI strings, 8 files and 44 i18n tests. |
| `cd frontend && npm run e2e:a11y:collect` | Pass: accessibility smoke, stateful DORA, and dialog-render-site specifications verified in the collection. |
| `BACKEND_URL=http://localhost:8010 FRONTEND_URL=http://localhost:5174 npx playwright test -c playwright.config.ts ../tests/frontend/e2e/dora-ux-stateful-a11y.spec.ts --project=ci --workers=1 --retries=0` | Pass: 4 tests on the canonical `localhost` frontend origin. |
| `python3 scripts/security/validate_authz_capability_contract.py --base-ref origin/main` | Pass. |
| `make -f scripts/Makefile quality-repo-contracts AUTHZ_CONTRACT_BASE_REF=origin/main` | Pass: shell/Python contracts and 19 repository-hygiene tests. |
| `make -f scripts/Makefile docs-topology-consistency` | Pass: documentation contract, README coverage, canonical reachability, and structure metrics. |
| `git diff --check` | Pass. |

The live Playwright command uses the already-running isolated `dora` demo stack
(`8010` backend, `5174` frontend). The repository-wide final gates remain #91's
responsibility after behavior is implemented.
