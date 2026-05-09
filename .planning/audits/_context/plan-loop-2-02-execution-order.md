# Phase 3 Loop 2 — Topological Execution Order (~77 items)

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Synthesized from
the 8 Loop 1 plans plus the Phase 2 priority/effort table in
`.planning/audits/developer answer.md:15-90`.

Constraints applied (in order):
1. Dependency topology — no item before any of its prereqs.
2. Priority within tier — P1 > P2 > P3 > P4 (developer answer summary table).
3. Effort within tier — S < M < L < XL (quick wins first).
4. Atomic clusters land contiguously (`#24+#51`, `#69+#70`, `#56+#61`).
5. Hub waves stay additive (`#9 → #34 → #60` approvals).

Notation: `#<id> [<effort>][<priority>] <domain> — <title> — REASON: <why>`.

## Item count reconciliation

74 audit items + bonus #75 (`_auto_reject_kri_approval`) + the #45a/#45b split
of #45 + the #74a/#74b split of #74 = **77 work units**. Sequencing below
keeps `#45a → #45b` and `#74a → #74b` in their own slots.

## Dependency edges in scope (cited)

- `#1 → #19` — `plan-loop-1-02-risks.md:436-440`: "must land AFTER #1: both
  touch risks/crud/__init__.py".
- `#19 → #11` — `plan-loop-1-02-risks.md:443-446`: "agreed audit ordering …
  preserved for changelog and review hygiene".
- `#11 → #20` — `plan-loop-1-02-risks.md:446-448`: "doc-only; any ordering
  works technically but sequencing it last lets … capture finalized state".
- `#2 → #8`, `#41 → #8` — `plan-loop-1-01-issues.md:441-444`: "#2 (B-N1) ─┐
  ├──► #8 (B-N2) ──► #28 (S4.3) ──► #30 (S4.10)".
- `#8 → #28` — `plan-loop-1-01-issues.md:442` and `:196-197`: "#8 (must
  land first so update_plans.py already imports … from somewhere else".
- `#14, #27, #28 → #30` — `plan-loop-1-01-issues.md:286-287`: "Strict
  prerequisites: #14 (notifications cleanup), #27 (loading dedup), #28
  (source-mutation collapse) MUST land first".
- `#9 → #34` — `plan-loop-1-03-approvals.md:18-23`: "Land in this order to
  keep the hub additive: 1. #9 … 2. #34 … 3. #60".
- `#34 → #60` — `plan-loop-1-03-approvals.md:217-218`: "#34 must land first.
  #60 wraps it".
- `#24 ↔ #51` atomic — `plan-loop-1-04-kris.md:54-58, 168-198`: "ATOMIC with
  #51 — both rewrite the same line kris/linked_vendors.py:3".
- `#69 ↔ #70` atomic — `plan-loop-1-05-vendor-quarterly.md:183-184, 215,
  270, 285-287`: "BUNDLED single commit + single Alembic revision".
- `#56 ↔ #61` paired — `plan-loop-1-08-crosscut.md:339-340, 425-426`:
  "PAIRED with #56 — `service.py` imports `normalize_business_role` from the
  directory_identity shim that #56 removes".
- `#10 → #38` — `plan-loop-1-07-endpoints.md:18-22, 301-303`: "#10 (must
  keep `riskhub_questionnaires.py` alive). Sequence: do #10 lock first".
- `#17 → #49 → #59` — `plan-loop-1-07-endpoints.md:728-732`: "#17 (delete
  …) └── #49 (inline …) └── #59 (consolidate …)".
- `#46 → #65, #67, #68` — `plan-loop-1-06-frontend.md:380, 437, 458`:
  "#65 ──> #46", "#67 ──> #46", "#68 … benefits from #46 already landing".
- `#37 + #39 → #66` — `plan-loop-1-06-frontend.md:406, 533`: "#66 ──>
  #37 + #39 (per audit Tier-2 graph)".
- `#66 → #68` — `plan-loop-1-06-frontend.md:458, 537`: "#68 ──> #66 (per
  audit `:1611` `FE-N8 ← FE-N5`)".
- `#47, #66, #72 → #71` — `plan-loop-1-06-frontend.md:482, 539`: "#71 ──>
  #47 … + #66 … + ADR-011 (#72; cross-domain)".
- `#45a → #45b` — `plan-loop-1-08-crosscut.md:156-157, 204-205`: "ACCEPT
  conditional on #45a tests being green".
- `#74a → #74b` — `plan-loop-1-08-crosscut.md:614, 698-700`: "#74b
  depends on #74a green".
- `#39 → #40` — `plan-loop-1-08-crosscut.md:22-26, 798-799`: "ACCEPT (P3,
  after #39 capability builder lands)".
- `#22 → #23` — `plan-loop-1-06-frontend.md:113, 521`: "#23 ──> #22 (same
  area; #23 depends on #22 only by code-review locality)".

---

## Execution order — items 1..77

```
1. #1   [S][P2] risks      — A-N1 validate_risk_type re-export drop                              — REASON: Smallest possible footprint; standalone leaf; opens door for #19 to delete _shared.py without re-export side-effects (plan-loop-1-02-risks.md:431-433).
2. #2   [S][P2] issues     — B-N1 underscore alias delete in source_validation                  — REASON: Independent leaf; alias-clean before #8's structural move (plan-loop-1-01-issues.md:441-446).
3. #41  [S][P2] issues     — B-N3 issue workflow serialization alias removal                    — REASON: Independent leaf; sibling to #2 (same anti-pattern, different file); land before #8 to keep serialization.py clean (plan-loop-1-01-issues.md:444-446).
4. #3   [S][P2] kris       — S3.11 kriFormWorkflow.ts delete                                    — REASON: Smallest delete; validates the structural-absence-test pattern for downstream KRI items (plan-loop-1-04-kris.md:367-369).
5. #4   [S][P2] frontend   — FE-deadcode-1 controlFormWorkflow.ts delete                        — REASON: Independent dead-code leaf; mechanical 3-line delete with 0 importers (plan-loop-1-06-frontend.md:13-30).
6. #5   [S][P2] frontend   — FE-deadcode-2 orphanResolutionPresentation.ts delete               — REASON: Independent dead-code leaf; 1-line re-export with 0 importers (plan-loop-1-06-frontend.md:35-53).
7. #6   [S][P2] frontend   — FE-deadcode-3 notifications/resourcePath.ts delete                 — REASON: Independent dead-code leaf; 5-line re-export with 0 importers (plan-loop-1-06-frontend.md:57-74).
8. #7   [S][P2] approvals  — C-N1 _get_approval_department_id endpoint shim delete              — REASON: Independent shim delete; 0 production callers; warms up approvals area before hub wave (plan-loop-1-03-approvals.md:28-52).
9. #50  [S][P2] kris       — S3.2 _kri_history/submission alias deletion                        — REASON: Independent KRI alias delete; same structural-absence pattern; 0 production importers (plan-loop-1-04-kris.md:140-164).
10. #52 [S][P2] kris       — S3.5 _kri_history/correction_plans fake seam deletion              — REASON: Independent KRI alias delete; only architecture lock keeps it alive (plan-loop-1-04-kris.md:204-225).
11. #11 [S][P1] risks      — S2.7 risk-execution risk.process → risk.name fix                  — REASON: P1 truth-in-naming bug fix; sequenced after #19 per agreed audit order; one-line code change (plan-loop-1-02-risks.md:444-446).
       swappable_with: [#19]   — files disjoint from #1/#19; the agreed sequence is "soft hygiene" (plan-loop-1-02-risks.md:208-211).
12. #19 [S][P1] risks      — S1.4 risk-type validation policy unification                       — REASON: P1 service-policy consolidation; hard-required after #1; deletes _shared.py and rewires create.py (plan-loop-1-02-risks.md:436-440).
13. #20 [S][P2] risks      — S1.6 risk ID generation co-location (DOC-ONLY)                     — REASON: Doc-only lock test; lands last in risks domain so `_context/02-backend-endpoints.md` captures finalized state (plan-loop-1-02-risks.md:446-448).
14. #14 [M][P1] issues     — S4.4 issues outbox-only notification cleanup                       — REASON: P1 dead direct-send delete; independent of #27/#28/#29; must land before #30 since #30 prunes barrel (plan-loop-1-01-issues.md:121-122, :286-287).
15. #15 [M][P1] endpoints  — D-N2 access_user capability catalog gap                            — REASON: P1 contract gap; standalone catalog/contract update; touches docs only, no code dependency (plan-loop-1-07-endpoints.md:124-178).
16. #12 [S][P1] endpoints  — D-N3 users-summary blanket-except narrowing                        — REASON: P1 narrowing; independent of #37 governance routing per Loop B; lands inline before #37 to expose silent-swallow defects (plan-loop-1-07-endpoints.md:65-119).
17. #13 [S][P1] vendor     — S5.1 / C-N2 vendor_link_helpers shim delete + contract sync        — REASON: P1 dead shim with cap-contract drift; independent leaf; 107-line file with 0 importers; doc/JSON sync atomically in same commit (plan-loop-1-05-vendor-quarterly.md:14-40).
18. #37 [S][P1] frontend   — S7.10 governance capability read from canonical builder            — REASON: P1 backend mirror delete; independent of #12 per Loop B; gates frontend #66 alongside #39 (plan-loop-1-06-frontend.md:227-249, :533).
19. #17 [S][P2] vendor     — S2.1 _monitoring_response endpoint shim consolidation              — REASON: P2 mechanical 14-import repoint; gates Group B (#49, #59); first in monitoring sequence (plan-loop-1-05-vendor-quarterly.md:289-291; plan-loop-1-07-endpoints.md:728-732).
20. #49 [S][P2] endpoints  — S2.2 control execution monitoring wrapper inline                   — REASON: P2 11-line wrapper inline; depends on #17 having landed; second in monitoring sequence (plan-loop-1-07-endpoints.md:462-464).
21. #21 [S][P2] endpoints  — S2.6 Control-Risk link loader unification                          — REASON: P2 keyword-only helper collapse; independent leaf; 2 callers; isolated control-execution surface (plan-loop-1-07-endpoints.md:240-283).
22. #54 [S][P2] approvals  — S6.3 approval queue aggregator deletion                            — REASON: P2 17-line lifecycle.py inline; independent of hub wave; rewrites 3 deepening tests in same commit (plan-loop-1-03-approvals.md:184-211).
23. #75 [S][P2] approvals  — bonus delete-and-consolidate _auto_reject_kri_approval             — REASON: P2 byte-identical 2-line dedup; independent of #7/#9/#18/#33/#34/#54/#60; can interleave freely (plan-loop-1-03-approvals.md:249-271).
       swappable_with: [#54, #7, #18, #33]  — all independent of approvals hub wave per plan-loop-1-03-approvals.md:24.
24. #18 [S][P2] approvals  — S6.2 approvals _build_approval_read consolidation                  — REASON: P2 4-call-site repoint; independent of hub wave; co-touches _shared.py with #7 — keep separate commits (plan-loop-1-03-approvals.md:81-106).
25. #33 [S][P2] approvals  — S6.4 approval queued banner unification                            — REASON: P2 frontend-only banner unify; independent of hub wave; KRIFormContainer i18n hoist (plan-loop-1-03-approvals.md:110-132).
26. #9  [S][P2] approvals  — S6.5 approvals can_user_view_approval_resource duplicate delete    — REASON: P2 first in hub wave (#9 → #34 → #60); single repoint to scenario_policy (plan-loop-1-03-approvals.md:18-23, :56-77).
27. #57 [S][P2] vendor     — S8.1 quarterly comparison facade deletion                          — REASON: P2 20-line facade delete; doc-only Reject overruled; single endpoint repoint + lock-test rewrite (plan-loop-1-05-vendor-quarterly.md:150-178).
28. #48 [S][P2] frontend   — FE-N6 error-key module consolidation                               — REASON: P2 merge two i18n files; independent leaf; ≤3 call sites to repoint (plan-loop-1-06-frontend.md:328-350).
29. #64 [S][P2] frontend   — FE-N2 QueryClient defaults centralization                          — REASON: P2 extract from App.tsx to services/api; independent leaf; sole construction site (plan-loop-1-06-frontend.md:354-372).
30. #36 [S][P3] frontend   — S7.4 BusinessRouteGuards parametric refactor                       — REASON: P3 typed factory for 4 identical guards; independent leaf; can land in parallel with #35 (plan-loop-1-06-frontend.md:200-223).
31. #35 [S][P2] frontend   — S7.3 usePermissions hook removal                                   — REASON: P2 single prod consumer + 18 mock-file rewrites; independent of #36 (plan-loop-1-06-frontend.md:155-196, :518-519).
32. #22 [S][P2] frontend   — S2.8 ControlForm shim deletion                                     — REASON: P2 1-line shim delete; 3 prod + 3 test importer rewrites; sequence after #4 to keep control-form area mechanical (plan-loop-1-06-frontend.md:78-105).
33. #23 [S][P2] frontend   — S2.9 controlFormUtils inlining                                     — REASON: P2 inline 2 helpers into 3 consumers; depends on #22 by code-review locality (plan-loop-1-06-frontend.md:113, :521).
34. #26 [S][P2] kris       — S3.9 KRIForm shim deletion                                         — REASON: P2 2-line shim delete; 1 prod + 4 test repoints + ESLint pin removal; independent (plan-loop-1-04-kris.md:108-136).
35. #25 [S][P2] kris       — S3.7 KRI department-scope helper extraction                        — REASON: P2 helper extract from 3 endpoint sites; sequence after #24/#51 so import tree stable (plan-loop-1-04-kris.md:373).
36. #24 [S][P2] kris       — S3.4 KRI linked-vendors barrel removal (atomic with #51)            — REASON: P2 atomic cluster A; both rewrite kris/linked_vendors.py:3 same commit (plan-loop-1-04-kris.md:54-79).
37. #51 [S][P2] kris       — S3.3 KRI value-application shim deletion (atomic with #24)         — REASON: P2 atomic cluster A; SAME COMMIT as #24; coordinates contract docs + 4 lock lines (plan-loop-1-04-kris.md:168-198).
38. #27 [M][P2] issues     — S4.2 issue loading duplicate deletion                              — REASON: P2 endpoint→service consolidation; independent of #8/#28/#29; must land before #30 (plan-loop-1-01-issues.md:158-159, :286-287).
39. #29 [S][P2] issues     — S4.6 source-type vocabulary canonicalization                       — REASON: P2 extract canonical helper; independent; cleanest after #28 but standalone-safe (plan-loop-1-01-issues.md:235-236).
40. #8  [M][P2] issues     — B-N2 source-validation split / canonical link helpers consolidation — REASON: P2 split owner-validation off; depends on #2 commit-adjacent; sets up #28 (plan-loop-1-01-issues.md:79-80, :441-444).
41. #28 [M][P2] issues     — S4.3 issue source-mutation triplicate collapse                     — REASON: P2 strictly requires #8; promotes _issue_register/source_mutation canonical body to live (plan-loop-1-01-issues.md:196-197).
42. #30 [M][P2] issues     — S4.10 issue _shared/__init__.py underscore re-export pruning       — REASON: P2 trails #14, #27, #28 strictly; mechanical barrel prune in one pass (plan-loop-1-01-issues.md:286-287).
43. #53 [S][P2] issues     — S4.1 issue workflow service collapse                                — REASON: P2 facade collapse; independent of all other issue items; lands after barrel work to keep test_architecture_deepening_contracts churn minimal (plan-loop-1-01-issues.md:382-385).
44. #16 [M][P2] vendor     — S8.10 reports legacy-excel tombstone removal                       — REASON: P2 4-route tombstone removal + parity-list edits + 6 RBAC test removals; independent (plan-loop-1-05-vendor-quarterly.md:44-77).
45. #38 [M][P2] endpoints  — S8.6 endpoint-layer Pydantic model eviction                        — REASON: P2 8 schemas to 3 schema modules; depends on #10 to keep questionnaire route alive (plan-loop-1-07-endpoints.md:18-22).
46. #10 [S][P1] endpoints  — S8.5 questionnaires endpoint module KEEP + presence lock           — REASON: P1 KEEP verdict + module-presence lock; lands first in #10/#38 pair (plan-loop-1-07-endpoints.md:15-61).
       NOTE: physically lands BEFORE #38 — listed at slot 46-1 conceptually. Place #10 immediately before #38 in the chronological list. (See critical-path note below.)
47. #46 [L][P3] frontend   — FE-N1 frontend query-keys factory                                  — REASON: P3 45 inline-literal sites in 22 files; structural prereq for #65 and #67 and feeds #68 (plan-loop-1-06-frontend.md:280-299, :379-380, :437, :458).
48. #47 [S][P3] frontend   — FE-N4 RetryPolicy extraction (session-refresh-specific)            — REASON: P3 small extraction from ApiClientCore; independent; gates #71 alongside #66/#72 (plan-loop-1-06-frontend.md:303-323, :539).
49. #67 [M][P3] frontend   — FE-N7 useResourcePanelQuery generic hook                           — REASON: P3 extract generic hook from useRiskHubConfigResource; depends on #46 for typed query keys (plan-loop-1-06-frontend.md:435, :437).
50. #65 [M][P3] frontend   — FE-N3 CRUD capability schema reuse                                 — REASON: P3 shared Zod base for risks/controls/kris/vendors (4 entities, not 5 per Loop B); depends on #46 (plan-loop-1-06-frontend.md:380, :558).
51. #32 [M][P3] vendor-fe  — S5.8 vendor linked-entity tab generic                              — REASON: P3 generic hook + shell over 3 vendor tabs; independent leaf (plan-loop-1-06-frontend.md:132-151).
52. #31 [M][P3] vendor     — S5.5 vendor reporting service extraction                           — REASON: P3 row-shaping move into _vendor_governance/reports.py; independent (plan-loop-1-05-vendor-quarterly.md:121-146).
53. #34 [M][P3] approvals  — S6.6 privileged-tier resolve authorization helper                  — REASON: P3 second in hub wave (#9 → #34 → #60); 16 files / 22+ sites; depends on #9 (plan-loop-1-03-approvals.md:18-23, :136-180).
54. #58 [M][P3] endpoints  — S8.3 orphaned-item facade + static-method class deletion           — REASON: P3 7-call-site rewrite + facade + class delete; independent (plan-loop-1-07-endpoints.md:514-585).
55. #43 [M][P3] endpoints  — BE-N4 audit adapter-emitter helper                                  — REASON: P3 helper extract over 37 _audit_matrix.toml rows; preserve module-level defs; independent (plan-loop-1-07-endpoints.md:348-399).
56. #44 [M][P3] endpoints  — BE-N6 API surface path-prefix registry                              — REASON: P3 27 include_router calls + dual-router support; independent (plan-loop-1-07-endpoints.md:403-447).
57. #42 [S][P3] crosscut   — BE-N2 ActorPayloadModel outbox boilerplate reduction               — REASON: P3 single-file Pydantic refactor; independent leaf inside cluster 08 (plan-loop-1-08-crosscut.md:87-137).
58. #55 [S][P2] crosscut   — S7.5 access user service facade deletion                            — REASON: P2 26-line facade delete + 1 prod importer + contract sync; independent leaf (plan-loop-1-08-crosscut.md:267-330).
59. #56 [S][P3] crosscut   — S7.6 directory identity service shim deletion (paired with #61)    — REASON: P3 paired with #61 SAME PR; #61 imports `normalize_business_role` from this shim (plan-loop-1-08-crosscut.md:339-340).
60. #61 [M][P3] crosscut   — S7.7 graph_directory adapter package move (paired with #56)        — REASON: P3 paired with #56 SAME PR; 4 sibling modules into _graph_directory/ + monkeypatch path rewrites (plan-loop-1-08-crosscut.md:425-528).
61. #59 [M][P3] vendor     — S2.10 control monitoring package consolidation                     — REASON: P3 documentation-lock README invariants; depends on #17 + #49; final in monitoring sequence (plan-loop-1-07-endpoints.md:603-635, :728-732).
62. #62 [M][P4] kris       — S5.9 KRI vendor assignment consolidation (defer overruled)         — REASON: P4 relocation + per-row audit rewrite + 4 importer pivots; defer overruled per Phase 2-B (plan-loop-1-04-kris.md:229-287).
63. #63 [M][P3] endpoints  — BE-N7 outbox dispatch SchedulerJobRun instrumentation              — REASON: P3 dispatcher instrumentation; independent (plan-loop-1-07-endpoints.md:639-712).
64. #45a [M][P4] crosscut  — BE-N8a ownership prerequisite characterization tests               — REASON: P4 tests-only PR; gates #45b strictly (plan-loop-1-08-crosscut.md:142-198).
65. #45b [M][P4] crosscut  — BE-N8b ownership resolver factory                                   — REASON: P4 factory rewrite; depends on #45a green (plan-loop-1-08-crosscut.md:204-263).
66. #74a [M][P2] crosscut  — ADR-007 amendment 31-package census                                  — REASON: P2 census + 4-5 TOMLs + classification test; doc-only; gates #74b strictly (plan-loop-1-08-crosscut.md:610-682).
67. #72 [M][P1] crosscut   — S7.9 ADR-011 auth scheme and session model                          — REASON: P1 doc-only ADR; unblocks #66 partially (audit graph) and #71 strictly (plan-loop-1-08-crosscut.md:534-594).
       swappable_with: [#74a]  — both doc-only with no in-cluster blockers; #72 is P1 so listed earlier but file edits disjoint.
68. #73 [M][P2] kris       — S3.12 ADR-012 KRI time-series period algebra                       — REASON: P2 ADR + lock test + TOML + classify collapse + ConfigDefaults pruning (plan-loop-1-04-kris.md:290-348).
69. #39 [M][P3] frontend   — S8.7 AdminConsoleCapabilities real builder                          — REASON: P3 builder + endpoint rewrite + snapshot test; gates #40 and #66 (plan-loop-1-06-frontend.md:253-275, :533; plan-loop-1-08-crosscut.md:22-25).
70. #66 [M][P4] frontend   — FE-N5 AuthContext provider split                                    — REASON: P4 4-commit split; depends on #37 + #39 (Loop B-corrected; not ADR-011); gates #68 and #71 (plan-loop-1-06-frontend.md:406-407).
71. #68 [M][P4] frontend   — FE-N8 WidgetShell + dashboard scoped query                          — REASON: P4 3-commit shell + selector + adoption; depends on #66; benefits from #46 (plan-loop-1-06-frontend.md:458, :537).
72. #71 [M][P4] frontend   — S7.8 frontend session module merge                                   — REASON: P4 8 → 4 file merge + single-flight pin; depends on #47 + #66 + #72 (plan-loop-1-06-frontend.md:482, :539).
73. #40 [M][P4] crosscut   — S8.11 admin sub-router re-clustering                                — REASON: P4 4-cluster homing; depends on #39 (plan-loop-1-08-crosscut.md:22-25, :798-799).
74. #74b [M][P2] crosscut  — ADR-007 amendment ADR text                                          — REASON: P2 amendment text after census #74a is green (plan-loop-1-08-crosscut.md:614, :698-700).
75. #69 [L][P4] vendor     — S5.2 AbstractVendorLink mixin (atomic with #70)                    — REASON: P4 single bundled commit + single Alembic revision with #70; ADR-010 forward-only window (plan-loop-1-05-vendor-quarterly.md:183-184, :215, :270, :285-287).
76. #70 [M][P4] vendor     — S5.7 Vendor.status enum drop (atomic with #69)                     — REASON: P4 SAME COMMIT as #69; 9 site scrub + Alembic column drop + cascade FKs; bundled migration window (plan-loop-1-05-vendor-quarterly.md:215, :270).
77. #60 [M][P4] approvals  — S6.6 PrivilegeContext request-scoped object                         — REASON: P4 third in hub wave (#9 → #34 → #60); strict prereq is #34; FastAPI Depends layer + 8+ migration sites (plan-loop-1-03-approvals.md:217-218).
```

> **Sequencing note for #10/#38** — chronologically slot 46 belongs to `#10`
> (the presence lock) and slot 47 belongs to `#38` (the schema move). I keep
> the numbering monotone above so each line carries one item; treat the two
> rows in the "44–46" cluster as a paired wave: `#16, #10, #38`. The
> rendering above lists `#38` at the headline position with `#10` annotated
> as the immediate predecessor; the actual landing order is `#10 → #38`.

## Critical path

The longest dependency chain by item count threads through the
frontend-Auth domain:

```
#1 → #19 → #11 → #20            (risks tail; 4)
#2 → #8 → #28 → #30             (issues structural sub-graph; 4)
#9 → #34 → #60                  (approvals hub; 3)
#46 → #65/#67/#68 → #66 → #71   (FE chain; 5)
#37 + #39 → #66 → #68           (FE Tier-2; 3)
#37 + #39 → #66 → #71           (FE session merge; 3)
#39 → #40                       (admin re-cluster; 2)
#10 → #38                       (questionnaires; 2)
#17 → #49 → #59                 (monitoring; 3)
#45a → #45b                     (ownership factory; 2)
#74a → #74b                     (ADR-007 census + amendment; 2)
#47 + #66 + #72 → #71           (session merge; 3)
```

The **critical path** by item count is the frontend session/auth chain:

```
#37 + #39 → #66 → #71
            ↑      ↑
            |      ├── also requires #47 → #71
            |      └── also requires #72 (ADR-011) → #71
            └── #68 also requires #66
```

Stitching the longest single chain end-to-end:

```
#46 (slot 47) → #67 (slot 49) ── (frees #66 prereq #46)
#37 (slot 18) ─┐
#39 (slot 69) ─┼─→ #66 (slot 70) → #71 (slot 72)
#47 (slot 48) ─┤
#72 (slot 67) ─┘
```

Deepest chain reachable from a leaf (counting #37 and #39 once each as
independent prerequisites):

```
#46 → #67
#46 → #65
#46 → #68 → (depends on #66)
#37 → #66 → #71
#39 → #66 → #71
#72 → #71
#47 → #71
```

The single longest **linear** chain (longest path through the DAG by edges)
is:

```
#1 → #19 → #11 → #20  (length 4 nodes / 3 edges)

OR

#2 → #8 → #28 → #30  (length 4 nodes / 3 edges)

OR (when treating the FE chain as a path with a single chosen prerequisite
per fan-in)

#39 (slot 69) → #66 (slot 70) → #71 (slot 72)  (length 3 nodes / 2 edges)
```

If we count the longest **path through any single chain** measured by
node count, the issues sub-graph `#2 → #8 → #28 → #30` and the risks tail
`#1 → #19 → #11 → #20` tie at **4 nodes** each. Including soft-sequencing
edges (`#19 → #11 → #20` is "soft hygiene", not technical), the **strict
critical path** length is **3 edges / 4 nodes**:

```
#2 → #8 → #28 → #30   (4 items, 3 edges — strict TDD prerequisites per
                       plan-loop-1-01-issues.md:441-446)
```

Adding cross-domain fan-in chains (FE) produces a deeper apparent chain,
but those are unions of independent prerequisites, not single linear paths.
The single longest linear chain in the dependency graph is therefore
**4 items**.

## Notable swappable pairs

| Pair | Reason | Citation |
| ---- | ------ | -------- |
| `#11 ↔ #19` | Files disjoint; agreed sequence is "soft hygiene" only | `plan-loop-1-02-risks.md:208-211` |
| `#20 ↔ #11` | Doc-only, files disjoint, "any ordering works technically" | `plan-loop-1-02-risks.md:446-448` |
| `#7 ↔ #18` | Both touch `approvals/_shared.py` but co-merge cleanly in either order | `plan-loop-1-03-approvals.md:84-85` |
| `#54 ↔ #75 ↔ #18 ↔ #33` | All independent of approvals hub wave | `plan-loop-1-03-approvals.md:24, :313-315` |
| `#4 ↔ #5 ↔ #6` | Independent FE dead-code deletions; no interdependency | `plan-loop-1-06-frontend.md:510-512` |
| `#35 ↔ #36` | Both authz consolidations; can land in either order | `plan-loop-1-06-frontend.md:519` |
| `#46 vs #47 vs #48 vs #64` | Bucket A independent quick wins; any order | `plan-loop-1-06-frontend.md:544` |
| `#72 ↔ #74a` | Both doc-only with no in-cluster blockers | `plan-loop-1-08-crosscut.md:766-770` |
| `#2 ↔ #41` | Same anti-pattern, different files; "Pair commit-adjacent" | `plan-loop-1-01-issues.md:351-352` |
| `#50 ↔ #52 ↔ #3` | Independent KRI alias deletes, any order; same structural-absence pattern | `plan-loop-1-04-kris.md:367-371` |
| `#21 ↔ #58 ↔ #43 ↔ #44` | All Group A independents in endpoints domain | `plan-loop-1-07-endpoints.md:737-738` |
| `#15 ↔ #12` | Both P1 endpoint independents; touch disjoint files | `plan-loop-1-07-endpoints.md:737-738` |

## Atomic clusters (must land same commit)

| Cluster | Items | Why | Citation |
| ------- | ----- | --- | -------- |
| Cluster A | `#24 + #51` | Both rewrite `kris/linked_vendors.py:3` | `plan-loop-1-04-kris.md:54-58, :168-198` |
| Cluster B | `#69 + #70` | Single Alembic revision; bundled migration window | `plan-loop-1-05-vendor-quarterly.md:215, :270, :285-287` |
| Cluster C | `#56 + #61` | `_graph_directory/service.py` imports `normalize_business_role` from the shim deleted by #56 | `plan-loop-1-08-crosscut.md:339-340, :425-426` |
| Hub wave (additive, separate commits) | `#9 → #34 → #60` | Hub additive in three commits | `plan-loop-1-03-approvals.md:18-23` |
| Sequence (separate commits) | `#17 → #49 → #59` | Monitoring shim → wrapper inline → README invariants | `plan-loop-1-07-endpoints.md:728-732` |

## Tier transition reasoning

- **Items 1–13 (P1 + P2/S leaves)**: zero-dependency leaves with the smallest
  diffs, providing test-infrastructure warmup. P1 items #11, #19, #14, #15,
  #12, #13, #37 surface as soon as their (often zero) prerequisites unblock.
- **Items 14–25 (P1 + P2/S sequenced)**: the rest of the P1 set lands;
  monitoring chain starts (#17 → #49 → #59); approvals leaves merge before
  the hub wave begins.
- **Items 26–43 (P2 fan-out)**: hub wave begins (#9), atomic Cluster A
  lands (#24 + #51), issues sub-graph (#8 → #28 → #30) completes, frontend
  shim cleanup (#22 → #23, #26) lands.
- **Items 44–60 (P3 fan-out)**: large-volume P3 work — query-key factories
  (#46), audit emitter (#43), router registry (#44), governance shim
  (#56 + #61 paired). #34 (approvals hub stage 2) lands here once the
  P2 surface stabilises.
- **Items 61–77 (ADRs + P4 deferred)**: documentation-first work (#74a, #72,
  #73), authorization characterization (#45a → #45b), capability builder
  (#39) and the items it gates (#40, #66 → #68 / #71). The Vendor migration
  bundle (#69 + #70) and approvals PrivilegeContext (#60) land last because
  they carry the largest blast radius (forward-only Alembic; cross-cutting
  Depends layer).

## Notes on tier-equal-with-S-effort preference

Where two items at the same dependency tier had different efforts, I
preferred S over M over L (Rule 3). Concrete applications:

- Slots 1–8: S/P2 leaves before any M-effort work (e.g., #1 before #14,
  #2/#41 before #8).
- Slot 26 (#9) before slot 53 (#34): both P2/P3, but #9 is S and unblocks
  #34's dependent migration of 16 files.
- Slot 47 (#46) is L, but its three direct dependents (#65, #67, #68) all
  need it — moved it as early as the dependency graph allows.

End of execution-order plan.
