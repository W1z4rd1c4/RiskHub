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
