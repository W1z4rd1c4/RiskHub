# Detail Page Test Helpers

Vitest coverage and utilities for shared detail-page primitives.

Use this directory for route-detail shell behavior shared across domains. Entity-specific workflow assertions should remain in the owning domain page tests.

`DetailLoadState.test.tsx` covers the unavailable state's destination-labelled
`BackButton` and Retry action.

`DetailActionBanner.test.tsx` covers the banner's `InlineMessage` roles (alert
for failures, status for queued approvals) and the approvals link.

`EntityDetailHeader.test.tsx` also covers the D7 title recipe, the labelled
`back` link, breadcrumbs, the default separator name and `document.title`;
`EditBlockedState.test.tsx` covers the blocked-edit route (one `h1`, labelled
back, warning reason, en/cs) and `DetailField` `dl`/`dt`/`dd` semantics.
