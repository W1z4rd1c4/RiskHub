# Frontend Display Guardrails

Canonical frontend UI display guardrails for RiskHub.

- Do not render raw database numeric IDs in user-facing UI surfaces.
- Prefer business identifiers: names, titles, codes, or human-readable labels.
- If a related entity cannot be resolved, show `Unknown <entity>` text (for example, `Unknown user`) and never expose numeric IDs as fallback.
- Technical IDs are acceptable in logs, telemetry, and developer tooling only, not in end-user screens.

Verification date:
- 2026-02-16

