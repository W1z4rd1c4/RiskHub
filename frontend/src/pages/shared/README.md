# frontend/src/pages/shared

## Purpose

Small shared helpers for page-level collection state that are reused by list pages without introducing a broad generic page framework.

## Contents

- `collectionPageState.ts`

## Notes

Keep domain-specific filters, API calls, and error behavior in each page hook. Shared helpers should stay narrow and pure.
