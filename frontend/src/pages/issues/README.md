# frontend/src/pages/issues

## Purpose

Page-local modules for `/Users/stefanlesnak/Antigravity/Risk App 2/frontend/src/pages/IssuesPage.tsx`.

## Contents

- `IssuesFilterBar.tsx`
- `IssuesPageHeader.tsx`
- `IssuesTableSection.tsx`
- `issuesPagePresentation.ts`
- `useIssuesPageState.ts`

## Notes

Keep route orchestration in `IssuesPage.tsx` and move query parsing, local
state, and leaf rendering into this folder.

`issuesPagePresentation.ts` now supports grouped `By Vendor` review. Issues can
appear in multiple vendor groups when they have multiple readable vendor
contexts, including contextual issues created directly from vendor detail.
