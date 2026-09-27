# Frontend Display Guardrails

Canonical frontend UI display guardrails for RiskHub.

- Do not render raw database numeric IDs in user-facing UI surfaces.
- Prefer business identifiers: names, titles, codes, or human-readable labels.
- If a related entity cannot be resolved, show `Unknown <entity>` text (for example, `Unknown user`) and never expose numeric IDs as fallback.
- Technical IDs are acceptable in logs, telemetry, and developer tooling only, not in end-user screens.
- For workflow actions that expose backend `capabilities`, resolve visibility through `frontend/src/lib/capabilities.ts`: backend capability metadata wins, and local permission checks are a compatibility fallback only when the backend field is absent.
- Keep capability and raw-ID regressions covered by frontend unit tests near the affected page/component and the shared raw-ID display guard.

Verification date:
- 2026-04-25

## Creation access checks

The shared creation gate is fail-closed: only explicit backend capability `true`
permits the form. Network/server read failures show a localized access-check
failure and Retry, not a permission denial. HTTP 403/404 share the same non-leaky
denial; HTTP 401 retains the API client's session-loss handling. Retry reloads
only failed required checks and suppresses overlapping or obsolete-route results.
For composed checks the precedence is denied, loading, error, then allowed.

Consumers are RiskNewPage, ControlNewPage, KRINewPage, and the creation modes of
AssetDetailPage, ProcessDetailPage, ThreatDetailPage, and VendorDetailPage. The
three new-page linked-vendor checks use the same contract. Existing edit-page
loading/denial presentation remains supported. No frontend role implies access.
