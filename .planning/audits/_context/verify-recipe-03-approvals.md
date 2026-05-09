# Phase 6 — Empirical verification of recipe-03-approvals (10 items)

Working dir: `/Users/stefanlesnak/Antigravity/RiskHubOSS`
Source recipe: `.planning/audits/_context/recipe-03-approvals.md`
Mode: empirical — every claim re-checked against current HEAD code; quote ≤15 words.

---

## Verdict matrix

| # | Item | Recipe claim | Empirical | Verdict |
|---|---|---|---|---|
| 7 | DELETE `_get_approval_department_id` shim | shim at `_shared.py:17-31`; 0 production callers; 4 callers use canonical | confirmed | GREEN |
| 9 | DELETE-AND-REDIRECT `can_user_view_approval_resource` | byte-identical bodies at `_notification_approval_helpers.py:72-79` and `approval_scenario_policy.py:134-142` | confirmed (diff: docstring only) | GREEN |
| 18 | REPOINT-AND-DELETE `_build_approval_read` | 19-field-for-field identical; 4 callers `resolve.py:61,85,102` + `detail.py:56` | confirmed | GREEN |
| 33 | UNIFY frontend approval-queued banners | KRI variant has extra `<div>` + class-order drift | confirmed | GREEN |
| 34 | EXTRACT `resolve_approval_privilege_tier` | **25 sites in 16 files** | **AST scan confirms 25 / 16** | GREEN |
| 54 | INLINE `_approval_queue/lifecycle.py` | 17-line re-export module; lock lines `:1005, :1025, :1041` | confirmed | GREEN |
| 60 | `PrivilegeContext` via `Depends(get_privilege_context)` | backend-only, no FE dep | confirmed (FE has no PrivilegeContext refs) | GREEN |
| 75 | DELETE-AND-CONSOLIDATE `_auto_reject_kri_approval` | byte-identical at `kri_history_correction.py:23` + `kri_value_submission.py:23` | confirmed | GREEN |
| 42 | `ActorPayloadModel(OutboxPayloadModel)` shared base | 6 classes redeclare `actor_user_id: int` at `:33,38,43,50,55,61` | confirmed | GREEN |
| 44 | Centralize guarded path-prefix registry | 27 `include_router` calls; `risk_questionnaires` registered TWICE at `:44,:60` | confirmed | GREEN |

---

## Per-item verification blocks

### #7 — `_get_approval_department_id` endpoint shim

**Recipe claim.** Dead shim at `backend/app/api/v1/endpoints/approvals/_shared.py:17-31`; canonical `get_approval_department_id` serves all 4 production callers.

**Empirical.**

Shim still defined:

```
backend/app/api/v1/endpoints/approvals/_shared.py:17:async def _get_approval_department_id(db: AsyncSession, approval: ApprovalRequest) -> int | None:
```

Callers searched via `grep -rn "_get_approval_department_id\|get_approval_department_id" backend/`:

```
backend/app/api/v1/endpoints/approvals/_shared.py:17  (the shim itself)
backend/app/services/approval_execution_service.py:25  (canonical import)
backend/app/services/approval_execution_service.py:84,128,193  (3 canonical callers)
backend/app/services/_approval_execution/loading.py:31  (canonical definition)
backend/app/services/_approval_execution/logging.py:6,16  (4th canonical caller)
```

Search for the underscore-prefixed shim returns only its own definition site — **0 production callers** of `_get_approval_department_id`.

**Verdict.** GREEN. Recipe matches HEAD exactly. Test would RED at HEAD because `hasattr(shared, "_get_approval_department_id")` is True. Production deletion of lines 17-31 makes it pass.

---

### #9 — `can_user_view_approval_resource` duplicate

**Recipe claim.** Bodies at `_notification_approval_helpers.py:72-79` and `approval_scenario_policy.py:134-142` are byte-identical; only canonical carries a docstring.

**Empirical.** Both bodies read against HEAD:

`_notification_approval_helpers.py:72-79`:
```
async def can_user_view_approval_resource(db: AsyncSession, user: User, approval: ApprovalRequest) -> bool:
    if approval.resource_type == ApprovalResourceType.RISK:
        return await can_read_risk_id(db, user, approval.resource_id)
    if approval.resource_type == ApprovalResourceType.CONTROL:
        return await can_read_control_id(db, user, approval.resource_id)
    if approval.resource_type == ApprovalResourceType.KRI:
        return await can_read_kri_id(db, user, approval.resource_id)
    return False
```

`approval_scenario_policy.py:134-142`:
```
async def can_view_approval_resource(db: AsyncSession, user: User, approval: ApprovalRequest) -> bool:
    """Return whether a user can read the approval's underlying business resource."""
    if approval.resource_type == ApprovalResourceType.RISK:
        return await can_read_risk_id(db, user, approval.resource_id)
    ...same body...
    return False
```

Bodies match line-for-line; only differences are (a) the function name (`can_user_view_approval_resource` vs `can_view_approval_resource`) and (b) the docstring on canonical. Caller at `_notification_approval_helpers.py:98` invokes the local duplicate.

**Verdict.** GREEN. Recipe correct. RED test would fail today (`hasattr(helpers, "can_user_view_approval_resource")` is True).

---

### #18 — `_build_approval_read` repoint

**Recipe claim.** 19-field-for-field identical with canonical `build_approval_read` in `_approval_queue/projection.py`. 4 callers: `resolve.py:61, 85, 102` and `detail.py:56`.

**Empirical.** Side-by-side comparison:

`_shared.py:34-61` and `projection.py:13-39` both build the identical 19-key `ApprovalRequestRead.model_validate({...})` dict. Only difference is the docstring `"""Build ApprovalRequestRead dict from model with user names."""` on `_shared.py:35`.

Caller sites confirmed at recipe-cited lines:
```
backend/app/api/v1/endpoints/approvals/resolve.py:18:from ._shared import _build_approval_read, logger
backend/app/api/v1/endpoints/approvals/resolve.py:61:    return _build_approval_read(approval, current_user)
backend/app/api/v1/endpoints/approvals/resolve.py:85:    return _build_approval_read(approval, current_user)
backend/app/api/v1/endpoints/approvals/resolve.py:102:    return _build_approval_read(approval, current_user)
backend/app/api/v1/endpoints/approvals/detail.py:15:from ._shared import _build_approval_read
backend/app/api/v1/endpoints/approvals/detail.py:56:    return _build_approval_read(approval, current_user)
```

4 call sites + 2 import statements. Imports at `resolve.py:18` and `detail.py:15` (recipe quotes line `:18` and `:15` correctly).

**Verdict.** GREEN. Recipe matches HEAD exactly. RED test fails today (shim exists; endpoints import it).

---

### #33 — Frontend approval-queued banner unify

**Recipe claim.** Both files exist at `frontend/src/components/forms/ApprovalQueuedBanner.tsx` and `frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx`. KRI variant has extra wrapper `<div>` and class-order drift.

**Empirical.** Both files exist (`ls -la` returns both). Importers of `KriApprovalQueuedBanner`:

```
frontend/src/components/kri-form/KRIFormContainer.tsx:7:import { KriApprovalQueuedBanner } from './KriApprovalQueuedBanner';
frontend/src/components/kri-form/KRIFormContainer.tsx:159:                        <KriApprovalQueuedBanner
```

Markup comparison:

Canonical (`ApprovalQueuedBanner.tsx:20-22`) — single root flex:
```
<div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3 ...">
  <Clock className="..." />
  <div className="flex-1">...
```

KRI variant (`KriApprovalQueuedBanner.tsx:18-21`) — extra wrapper:
```
<div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 ...">
  <div className="flex items-start gap-3">     # <-- extra <div>
    <Clock className="..." />
    <div className="flex-1">...
```

Class-order drift confirmed:
- canonical: `mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl`
- KRI: `mb-6 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4`

(rearrangement of `p-4`, `bg-*`, `rounded-xl`, `border-*` order).

**Verdict.** GREEN. Recipe correct on both points (extra `<div>` and class-order drift).

---

### #34 — `resolve_approval_privilege_tier` extraction (CENTERPIECE)

**Recipe claim.** **25 call sites across 16 files** — Loop 1 said "22+" was a hedge; AST scan confirms 25.

**Empirical — fresh grep + AST scan.**

`grep -rn "can_resolve_approvals(current_user)" backend/ | wc -l` → **25**

Distinct files (count): **16**

```
backend/app/api/v1/endpoints/approvals/detail.py
backend/app/api/v1/endpoints/notifications.py
backend/app/api/v1/endpoints/users/summary.py
backend/app/services/_approval_execution/authorization.py
backend/app/services/_approval_queue/counts.py
backend/app/services/_approval_queue/queries.py
backend/app/services/_authorization_capabilities/approvals.py
backend/app/services/_authorization_capabilities/controls.py
backend/app/services/_authorization_capabilities/kris.py
backend/app/services/_authorization_capabilities/risks.py
backend/app/services/_entity_mutation_lifecycle/approval_plans.py
backend/app/services/_entity_mutation_lifecycle/archive_plans.py
backend/app/services/_kri_history/governance.py
backend/app/services/_kri_history/intake.py
backend/app/services/approval_execution_service.py
backend/app/services/notification_visibility.py
```

Site-by-site cross-check of recipe's table (table starts at recipe line 424):

| Recipe row | Recipe lines | Empirical lines | Match |
|---|---|---|---|
| `endpoints/approvals/detail.py` | :47 | :47 | yes |
| `endpoints/notifications.py` | :127 | :127 | yes |
| `endpoints/users/summary.py` | :26 | :26 | yes |
| `services/_approval_execution/authorization.py` | :30 | :30 | yes |
| `services/_approval_queue/counts.py` | :12 | :12 | yes |
| `services/_approval_queue/queries.py` | :28, :33 | :28, :33 | yes |
| `services/_authorization_capabilities/approvals.py` | :15 | :15 | yes |
| `services/_authorization_capabilities/controls.py` | :54 | :54 | yes |
| `services/_authorization_capabilities/kris.py` | :74 | :74 | yes |
| `services/_authorization_capabilities/risks.py` | :54 | :54 | yes |
| `services/_entity_mutation_lifecycle/approval_plans.py` | :69, :162, :267 | :69, :162, :267 | yes |
| `services/_entity_mutation_lifecycle/archive_plans.py` | :110, :186, :255 | :110, :186, :255 | yes |
| `services/_kri_history/governance.py` | :238 | :238 | yes |
| `services/_kri_history/intake.py` | :42 | :42 | yes |
| `services/approval_execution_service.py` | :116, :222, :235, :237 | :116, :222, :235, :237 | yes |
| `services/notification_visibility.py` | :78, :207 | :78, :207 | yes |

**Total empirical: 25 sites in 16 files. Recipe claim matches exactly.**

AST-scan code from recipe (at `recipe-03-approvals.md:1218-1262`) verified by running an inline Python snippet against `backend/app/`:

```
TOTAL OFFENDERS (Call nodes outside allowed): 25
```

(Same 25 offending lines, identical to grep output. AST detection mode = `ast.Call` whose `func` is `Name('can_resolve_approvals')` — current code only uses bare `Name` form, no `Attribute('can_resolve_approvals')`. Recipe's belt-and-suspenders for `Attribute` is harmless.)

`parents[3]` from `tests/backend/pytest/test_architecture_deepening_contracts.py` resolves to repo root `/Users/stefanlesnak/Antigravity/RiskHubOSS`, so `REPO / "backend" / "app"` rglob is correct.

**Phase 5 P5-A3 site-count reconciliation.** Phase 5 P5-A3 reportedly claimed 25; current empirical = 25. **NO DRIFT.**

**Verdict.** GREEN. Recipe site count and file paths fully accurate. AST snippet works as written.

---

### #54 — Inline `_approval_queue/lifecycle.py`

**Recipe claim.** `_approval_queue/lifecycle.py` is 17 lines of pure re-exports; deepening test lock lines at `test_architecture_deepening_contracts.py:1005, :1025, :1041`.

**Empirical.**

`_approval_queue/lifecycle.py` (17 lines, all re-exports):

```
1: from __future__ import annotations
2: (blank)
3: from .contracts import ApprovalQueuePage, ApprovalQueueProjection, ApprovalRequestIntakePlan
4: from .counts import count_pending_approval_queue
5: from .execution import create_delete_approval_request
6: from .queries import list_approval_queue_page, list_my_approval_queue_page
7: (blank)
8-16: __all__ block
17: (closing bracket)
```

Pure re-export module — matches recipe.

Lock test lines:
```
test_architecture_deepening_contracts.py:1005:def test_approval_queue_routes_use_queue_lifecycle_module() -> None:
test_architecture_deepening_contracts.py:1025:def test_approval_queue_lifecycle_uses_service_owned_helpers() -> None:
test_architecture_deepening_contracts.py:1041:def test_approval_queue_lifecycle_delegates_intake_query_projection() -> None:
```

All three at exact recipe-cited lines.

**Verdict.** GREEN. Recipe accurate.

---

### #60 — `PrivilegeContext` via `Depends(get_privilege_context)`

**Recipe claim.** Backend-only; Loop B confirmed no FE prereq.

**Empirical.**

`grep -rn "PrivilegeContext\|get_privilege_context" backend/ frontend/` returns **no matches** in either tree. Neither symbol exists today. The recipe builds on top of #34 (which extracts `resolve_approval_privilege_tier`); after #34 lands, this is a thin FastAPI wrapper at `backend/app/api/deps.py`. Frontend consumes only HTTP responses (capability fields) — no FE refactor needed.

**Verdict.** GREEN. Recipe accurate; backend-only confirmed.

---

### #75 — Consolidate `_auto_reject_kri_approval`

**Recipe claim.** Byte-identical 2-line `_auto_reject_kri_approval` at `kri_history_correction.py:23` and `kri_value_submission.py:23`.

**Empirical.**

`kri_history_correction.py:23-24`:
```
def _auto_reject_kri_approval(approval: ApprovalRequest, reason: str) -> SideEffectResult:
    return SideEffectResult.auto_rejected(reason)
```

`kri_value_submission.py:23-24`:
```
def _auto_reject_kri_approval(approval: ApprovalRequest, reason: str) -> SideEffectResult:
    return SideEffectResult.auto_rejected(reason)
```

Identical signatures and bodies (no docstring on either).

Caller lines (recipe says 5 in `kri_history_correction.py` at `:50, :56, :67, :78, :119`; 1 in `kri_value_submission.py` at `:97`):

```
kri_history_correction.py:50:        return _auto_reject_kri_approval(
kri_history_correction.py:56:        return _auto_reject_kri_approval(
kri_history_correction.py:67:        return _auto_reject_kri_approval(
kri_history_correction.py:78:        return _auto_reject_kri_approval(
kri_history_correction.py:119:        return _auto_reject_kri_approval(
kri_value_submission.py:97:        return _auto_reject_kri_approval(
```

Six callers at exactly the recipe-cited lines.

**Verdict.** GREEN. Recipe matches HEAD line-for-line.

---

### #42 — `ActorPayloadModel(OutboxPayloadModel)` shared base

**Recipe claim.** 6 actor-bearing payload classes at `outbox/payloads.py:33, 38, 43, 50, 55, 61` redeclare `actor_user_id: int`.

**Empirical.** Reading `backend/app/services/outbox/payloads.py`:

```
30: class IssueAssignedPayload(OutboxPayloadModel):
31:     issue_id: int
32:     owner_user_id: int
33:     actor_user_id: int        # <-- :33
36: class IssueExceptionRequestedPayload(OutboxPayloadModel):
37:     issue_id: int
38:     actor_user_id: int        # <-- :38
41: class IssueExceptionApprovedPayload(OutboxPayloadModel):
42:     issue_id: int
43:     actor_user_id: int        # <-- :43
48: class QuestionnaireSentPayload(OutboxPayloadModel):
49:     questionnaire_id: int
50:     actor_user_id: int        # <-- :50
53: class QuestionnaireSubmittedPayload(OutboxPayloadModel):
54:     questionnaire_id: int
55:     actor_user_id: int        # <-- :55
58: class QuestionnaireClarificationRequestedPayload(OutboxPayloadModel):
59:     clarification_id: int
60:     questionnaire_id: int
61:     actor_user_id: int        # <-- :61
```

All 6 actor-bearing classes carry `actor_user_id: int` at exactly the recipe-cited lines `:33, :38, :43, :50, :55, :61`.

Approval payloads at `:16, :20, :25` correctly do NOT carry `actor_user_id` (cancelled has `cancelled_by_user_id`). `__all__` at `:105-121` does not currently export `ActorPayloadModel` — addition required.

**Verdict.** GREEN. Recipe matches HEAD exactly.

---

### #44 — Centralize guarded path-prefix registry

**Recipe claim.** **27 `include_router` calls** at `router.py:34-60`; **`risk_questionnaires` registered TWICE** at `:44` and `:60`.

**Empirical.**

`grep -c "include_router" backend/app/api/v1/router.py` → **27**

`risk_questionnaires` occurrences:
```
router.py:22:    risk_questionnaires,
router.py:44:api_router.include_router(risk_questionnaires.risk_router, tags=["questionnaires"])
router.py:60:api_router.include_router(risk_questionnaires.router, tags=["questionnaires"])
```

`:44` mounts `.risk_router` (recipe says under `/risks` tag; actual `tags=["questionnaires"]` — recipe is slightly imprecise here, but the dual-router fact is correct).

`:60` mounts `.router` under `tags=["questionnaires"]`.

Both registrations have **NO `prefix=`** kwarg — the routers carry their own path prefixes. Recipe's `prefix_owner = "module"` is correct in the registry TOML draft.

`include_router` calls span lines :34 to :60 (27 calls confirmed). Recipe's range `:34-60` is exact.

**Minor recipe quibble.** Recipe line 44 says `risk_questionnaires.risk_router` is under `/risks` tag — actually tag is `questionnaires` for both registrations (same tag). The recipe's TOML draft at line 1064-1065 hard-codes `tags = ["questionnaires"]` for both dual_routes, which IS correct. So the prose mistake at recipe line 926 (`/risks tag`) is a documentation slip, not a registry bug.

**Verdict.** GREEN with one prose nit. Recipe's count + dual-registration fact is empirically correct; the `:44 (.risk_router under /risks tag)` prose at recipe line 926 should read `tags=["questionnaires"]` to match HEAD. The TOML body the recipe ships is correct.

---

## Issues found (yellow flags)

### Y1 — #44 prose drift (minor)

**Severity.** Low (documentation).

**Where.** `recipe-03-approvals.md:926` reads:

> `risk_questionnaires` is registered TWICE at `:44` (`.risk_router` under `/risks` tag) and `:60` (`.router` under `/questionnaires` tag)

**Empirical.** Both registrations use `tags=["questionnaires"]`:

```
router.py:44:api_router.include_router(risk_questionnaires.risk_router, tags=["questionnaires"])
router.py:60:api_router.include_router(risk_questionnaires.router, tags=["questionnaires"])
```

**Impact.** None — the recipe's actual TOML draft (lines 1063-1066) correctly tags both as `["questionnaires"]`. Just the prose paragraph misnames `:44` as `/risks tag`.

**Recommendation.** Fix prose at recipe line 926 from `under /risks tag` to `under /questionnaires tag`. Zero impact on TDD test or registry contents.

### Y2 — #34 AST snippet `Attribute` branch is dead code at HEAD (informational only)

**Severity.** Trivial.

**Where.** Recipe AST snippet at `recipe-03-approvals.md:1235-1240` checks both `ast.Name` and `ast.Attribute` for `can_resolve_approvals` calls.

**Empirical.** All 25 current call sites use bare `Name('can_resolve_approvals')` — none use module-qualified `permissions.can_resolve_approvals(...)`. The `Attribute` branch in the AST scanner detects nothing today.

**Impact.** None. The dual-mode scanner is correct future-proofing (some refactor could introduce `permissions.can_resolve_approvals(...)`); no code change needed. Just noting for awareness.

### Y3 — None other

No other yellow flags. Recipe items #7, #9, #18, #33, #54, #60, #75, #42 are pixel-perfect against HEAD.

---

## Recommendations

1. **Proceed with all 10 items as written.** Site counts, line numbers, file paths, body-identity claims are all empirically accurate. Tests (RED at HEAD, GREEN after edits) will behave as the recipe predicts.

2. **Fix Y1 prose nit** in recipe line 926 before commit (`/risks tag` → `/questionnaires tag`). One-character documentation change; zero behavioral impact.

3. **Hub-wave ordering still valid.** #9 → #34 → #60 sequence remains correct: #9 establishes `approval_scenario_policy` as the single import home for `can_view_approval_resource`; #34 extends that home with `resolve_approval_privilege_tier` and migrates the 25 sites; #60 layers FastAPI request-scoped Depends on top.

4. **#34 is the centerpiece.** 25-site migration over 16 files; 28-32h estimate (Phase 4 effort revision) stands. Recipe's AST-based deepening lock is correct and necessary — string-search would have missed nothing today, but is brittle for future refactors.

5. **#54 has soft dependency on #34.** If #54 lands first, the existing deepening lock at `test_architecture_deepening_contracts.py:1005-1041` still passes against current `lifecycle.py`. The rewrite that #54 ships is what enables `lifecycle.py` deletion. No interleave hazard.

6. **#42 is fully independent.** Outbox payload base-class introduction does not touch any of the architecture-lock TOMLs (`_archive_allowlist.toml`, `_capabilities_all_allowlist.toml`, `_endpoint_commit_allowlist.toml`, `_naming_allowlist.toml`). Free-order anywhere.

---

## Phase 6 conclusion

10/10 items GREEN against HEAD. **#34 site count: 25 actual = 25 claimed, exact match.** Recipe is empirically faithful; tests will RED at HEAD and GREEN after the prescribed edits. One prose nit (Y1) does not block any item. Recipe is ready for Phase 7.
