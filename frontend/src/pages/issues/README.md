# frontend/src/pages/issues

## Purpose

Page-local modules for `frontend/src/pages/IssuesPage.tsx`.

## Contents

- `IssuesFilterBar.tsx`
- `IssuesPageHeader.tsx`
- `IssuesTableSection.tsx`
- `issuesPagePresentation.ts`
- `useIssuesPageState.ts`

## Notes

Keep route orchestration in `IssuesPage.tsx` and move query parsing, local
state, and leaf rendering into this folder.
