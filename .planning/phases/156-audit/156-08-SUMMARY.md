# 156-08 Summary: JWT Storage & Timezone Decisions

## Status

**Deferred** — User chose to skip these architectural decisions for now.

## Decisions Pending

### 1. Browser Auth Storage Strategy

Options presented:

- **spa-msal**: SPA with MSAL (browser obtains tokens)
- **bff-oidc**: Backend-for-frontend (httpOnly cookies)
- **keep-current-dev-temporarily**: Keep localStorage for dev/demo

### 2. Timezone Consistency Strategy

Options presented:

- **api-normalize-only**: Normalize at API boundary only
- **db-migrate-timezone-aware**: Standardize DB columns

## Next Steps

When ready to implement Microsoft/Entra login or address timezone consistency, revisit this plan and make the architectural decisions.

## Commit

No commit — decision deferred.
