# ADR-011 Auth Scheme and Session Model

## Status

Accepted

## Context

RiskHub authentication is implemented across `backend/app/api/v1/endpoints/auth/`, `backend/app/core/security.py`, and `backend/app/services/_auth_session/`. Protected endpoint authorization currently has three idioms in the codebase: the `require_permission(resource, action)` FastAPI dependency factory, body-call `_require_*` helpers, and inline `if not has_permission` branches that raise 403 responses.

The mock-auth fallback in `backend/app/core/security.py` is intentionally available for local demo and test flows only. It must remain gated by both `settings.mock_auth_enabled` and `settings.debug`.

ADR-002 records that the endpoint commit allowlist is empty. Microsoft Entra SSO enters through `backend/app/api/v1/endpoints/auth/sso.py`, while transport-neutral SSO challenge, identity, and session-lifetime decisions live under `backend/app/services/_auth_session/` and `_auth_session_workflow/`.

## Decision

JWT bearer access tokens, refresh-token rotation, and the user `token_version` field are the canonical authentication scheme. Refresh tokens are single-use per rotation; replay and logout paths revoke server-side refresh state and rely on token-version checks for access-token invalidation.

Production code imports authenticated-user dependencies from `app.api.deps`. `app.core.security.get_current_user` remains the lower-level implementation boundary and local mock-auth fallback, not the import target for protected endpoints. The mock-auth branch is valid only when `mock_auth_enabled and debug` are both true.

Endpoint authorization uses `require_permission(resource, action)` from `backend/app/core/security.py` as the canonical FastAPI adapter. ADR-001 keeps `Capabilities.can(action, resource, *, instance=None)` as the service-layer interface; this ADR elects `require_permission(resource, action)` as the endpoint adapter. Body-call `_require_*` helpers and inline `if not has_permission` 403 branches are frozen and must be non-increasing.

Microsoft Entra SSO is a deployment-time authentication option, not a separate RiskHub session model. Entra tokens are verified and resolved by `app.services._auth_session.resolve_sso_exchange`; `auth/sso.py` then issues the RiskHub access token through `_build_token_response` and the refresh row/cookies through `_issue_refresh_session`. New SSO providers must attach to the same exchange and refresh-rotation boundary instead of minting an alternate session.

Auth/session workflow commit adapters use `commit_auth_transaction`, and `commit_auth_transaction` delegates to `commit_service_boundary` with an `auth.` boundary prefix. New auth-flow entries in `_endpoint_commit_allowlist.toml` are forbidden unless this ADR and ADR-002 are superseded.

## Alternatives Rejected

- Cookie-session authority: rejected because it does not remove refresh rotation and complicates the existing API/frontend split.
- Three-idiom endpoint authorization as a permanent policy: rejected because mixed adapters make drift detection fragile.
- Removing local mock auth: rejected because supported demo and test flows depend on it; the debug-plus-mock guard is the production safety boundary.
- Letting Entra own RiskHub session lifetime: rejected because RiskHub permission revocation, token-version invalidation, refresh-row revocation, and audit behavior remain local responsibilities.

## Migration Impact

Finding `#76` migrated auth-flow endpoint commits to service-owned transactions. Existing `_require_*` body-call helpers and inline `has_permission` 403 branches remain during migration, but new occurrences fail the architecture ratchet.

SSO deployment configuration is unchanged. This ADR documents and locks the current exchange boundary: Entra identity verification resolves into a RiskHub session outcome, then RiskHub issues and rotates its own tokens.

## Endpoint Commit Allowlist

The endpoint commit allowlist is empty. `tests/backend/pytest/architecture/test_w5_endpoint_commit_ratchet_red.py` fails on any endpoint `await db.commit()` that is not backed by a superseding ADR. Auth/session flows use `_auth_session_workflow` service adapters and the shared service transaction boundary instead of endpoint commits.

## Rollback Strategy

Forward-only as documentation and lock policy. No schema or runtime behavior changes are introduced by this ADR. If a future implementation regresses refresh rotation or token-version invalidation, operators can revoke affected server-side refresh rows and bump the affected users' `token_version` values.

## Invariant Tests

- `tests/backend/pytest/architecture/test_w5_endpoint_commit_ratchet_red.py` enforces the empty endpoint commit allowlist.
- `tests/backend/pytest/architecture/test_service_commit_boundary_ratchet_red.py` tracks remaining service-side raw commits as ADR-002 adoption work.
- `tests/backend/pytest/architecture/test_w12_auth_idiom_ratchet_red.py` keeps `_require_*` body calls and inline `has_permission` 403 branches non-increasing.
- `tests/backend/pytest/architecture/test_w12_get_current_user_isolation_red.py` forbids direct endpoint imports of `app.core.security.get_current_user`.
- `tests/backend/pytest/architecture/test_w12_mock_auth_guard_red.py` asserts mock auth is gated by both mock mode and debug mode.
- `tests/backend/pytest/architecture/test_w12_sso_token_exchange_boundary_red.py` locks the current SSO exchange boundary through `app.services._auth_session.resolve_sso_exchange`, `_build_token_response`, and `_issue_refresh_session`.

## ADR Cross-References

- ADR-001: keeps the service-layer capability interface separate from the FastAPI adapter elected here.
- ADR-002: governs service-owned transaction boundaries and the empty endpoint commit allowlist.
- ADR-003: keeps authentication and authorization failures mapped through the domain exception taxonomy.
- ADR-004: keeps token and refresh-session timestamps UTC-aware.
