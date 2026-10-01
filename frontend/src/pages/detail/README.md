# Detail Page Primitives

Shared primitives for route-level detail pages.

Use this directory for layout and interaction pieces that are reused across entity detail screens, such as page shells, section composition, and common loading/error handling.

Header and state primitives (audit 2026-09-30 §4.14, D7, D14):

- `EntityDetailHeader.tsx` — canonical entity detail header: the page `h1` on the shared
  `PAGE_TITLE_CLASS` recipe, a destination-labelled `back` (`BackButton`), `breadcrumbs`, and
  `document.title` via `usePageTitle` (`documentTitle`, else a string `title`). Every entity detail
  page (Risk, Control, KRI, Issue, Vendor, Asset, Process, Threat, Department) renders it.
- `EditBlockedState.tsx` — the edit route of a record whose business edits are blocked: `PageHeader`
  (one `h1`, labelled back, breadcrumbs), a warning `InlineMessage` reason and the module's
  pending-change panel as children (SM-05). Used by the Threat, Process, Asset and Vendor edit routes.
- `DetailField.tsx` — `DetailFieldList` (`dl` grid) and `DetailField` (`dt` with `.text-eyebrow`,
  `dd` value; empty values show a hidden dash announced as `common:fallbacks.not_set`).

Keep domain behavior in the owning page or service layer. These primitives should not decide RBAC, workflow transitions, or approval policy.

`useKriDetailState` owns KRI detail presentation. Its `useKriRestore` helper keeps
restore request/outcome state scoped to that record and session, consumes the
existing authoritative KRI response, and reconciles uncertain outcomes through
`useDetailQuery.refetchOutcome`. It does not introduce restore permissions or
approval rules. The older shared mutation wrapper does not distinguish uncertain
commit outcomes; the KRI-specific flow avoids changing other entity workflows.
