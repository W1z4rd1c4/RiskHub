# Detail Page Primitives

Shared primitives for route-level detail pages.

`useProtectedDetailShell` owns Threat/Vendor/Asset/Process load presentation, stale-read retry,
register return context, archive confirmation/outcomes and pending-change cancellation.
It composes `PendingChangePanel`, `PendingChangeCancellationDialog`, `useApprovalQueued`
and `governedMutationOutcome`. Dialogs capture the named target when opened; requests
and their continuations belong to the committed record, route and principal generation.
Reopening an archive clears its prior error. Backend `can_cancel` and `can_view_diff`
remain authoritative. Adapters supply the existing archive API and reason policy;
Threat continues to omit a reason entirely.

`useProtectedDetailState` shares reads, cache updates, capability projection and
restore through `useRestoreWithFeedback`. Failed restores retain visible action feedback and a Retry that captures the original record. Canonical session generation and eligibility from `useSessionMutationOwner` preserve silent refresh while rejecting fresh-login, logout and stale-route continuations. Entity state adapters keep their public
names and Vendor's issue/link capability state. Forms, link sections and ownership
guidance stay in their entity pages. The rendered MSW contract suite is
`tests/frontend/unit/src/pages/detail/protectedDetailLifecycle.test.tsx`.
DEF-15 did not reproduce: failed restores already displayed a toast at the saved
checkpoint. The suite preserves that behavior and verifies the independently
reproduced late-archive and duplicate-cancellation fixes across all four adapters.

Use this directory for layout and interaction pieces that are reused across entity detail screens, such as page shells, section composition, and common loading/error handling.

Header and state primitives (audit 2026-09-30 §4.14, D7, D14):

- `EntityDetailHeader.tsx` — canonical entity detail header: the page `h1` on the shared
  `PAGE_TITLE_CLASS` recipe, a destination-labelled `back` (`BackButton`), `breadcrumbs`, and
  `document.title` via `usePageTitle` (`documentTitle`, else a string `title`). Every entity detail
  page (Risk, Control, KRI, Issue, Vendor, Asset, Process, Threat, Department) renders it.
- `EditBlockedState.tsx` — the edit route of a record whose business edits are blocked: `PageHeader`
  (one `h1`, labelled back, breadcrumbs), a warning `InlineMessage` reason and the module's
  pending-change panel as children (SM-05). Used by the Threat, Process, Asset and Vendor edit routes.
- `DetailSection.tsx` — titled section card (`Card` + `CardHeader`, section `h2`) for the field groups of a detail page.
- `OwnershipGovernanceAlert.tsx` — ownership / stewardship banner (orphaned, unassigned, invalid owner) on warning
  tokens, with an optional governance action; used by the Asset, Process and Threat detail and edit routes (SM-05).
- `DetailField.tsx` — `DetailFieldList` (`dl` grid) and `DetailField` (`dt` with `.text-eyebrow`,
  `dd` value; empty values show a hidden dash announced as `common:fallbacks.not_set`).

Keep domain behavior in the owning page or service layer. These primitives should not decide RBAC, workflow transitions, or approval policy.

`useKriDetailState` owns KRI detail presentation. Its `useKriRestore` helper keeps
restore request/outcome state scoped to that record and session, consumes the
existing authoritative KRI response, and reconciles uncertain outcomes through
`useDetailQuery.refetchOutcome`. It does not introduce restore permissions or
approval rules. The older shared mutation wrapper does not distinguish uncertain
commit outcomes; the KRI-specific flow avoids changing other entity workflows.
