# frontend/src/pages/issues

## Purpose

Page-local modules for `frontend/src/pages/IssuesPage.tsx`.

## Contents

- `IssuesFilterBar.tsx`
- `issueColumns.tsx`
- `issueRegisterConfig.ts`
- `issuesPagePresentation.ts`
- `useIssuesPageState.ts`

## Notes

`IssuesPage.tsx` supplies Issue vocabulary and rows to the shared
`RegisterListShell`; query serialization, filters, and columns remain here.

`issuesPagePresentation.ts` now supports grouped `By Vendor` review. Issues can
appear in multiple vendor groups when they have multiple readable vendor
contexts, including contextual issues created directly from vendor detail.
