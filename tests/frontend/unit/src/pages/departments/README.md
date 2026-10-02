# tests/frontend/unit/src/pages/departments

Focused unit contracts for immutable Department register scope and URL-backed
pagination/history behavior shared by Department detail tabs.

`DepartmentsPage.cards.test.tsx` covers the department cards (one native button per department, `Badge` status
counts, shared entity icons, NAV-03).

`DepartmentsPage.refresh.test.tsx` covers the exposure page's shared
`RefreshButton` (FB-02): translated name, `aria-busy`, no mid-fetch refetch.
