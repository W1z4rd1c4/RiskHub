# Detail Page Primitives

Shared primitives for route-level detail pages.

Use this directory for layout and interaction pieces that are reused across entity detail screens, such as page shells, section composition, and common loading/error handling.

Keep domain behavior in the owning page or service layer. These primitives should not decide RBAC, workflow transitions, or approval policy.

`useKriDetailState` owns KRI detail presentation. Its `useKriRestore` helper keeps
restore request/outcome state scoped to that record and session, consumes the
existing authoritative KRI response, and reconciles uncertain outcomes through
`useDetailQuery.refetchOutcome`. It does not introduce restore permissions or
approval rules. The older shared mutation wrapper does not distinguish uncertain
commit outcomes; the KRI-specific flow avoids changing other entity workflows.
