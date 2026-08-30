# frontend/src/pages/notifications

## Purpose

Page-local URL query state for `frontend/src/pages/NotificationsPage.tsx`.

## Contents

- `useNotificationsPageQuery.ts`

## Notes

This module parses and normalizes the notification `tab` and one-based `page`
query parameters while preserving unrelated URL state. The page entrypoint
continues to own data loading, request outcomes, mutations, and presentation;
authorization policy remains in its canonical backend and frontend authz
layers.
