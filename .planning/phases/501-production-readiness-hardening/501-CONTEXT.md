# Phase 501 Context: Production Readiness Hardening

## Why This Phase Exists

A deep production-readiness scan identified remaining hardening debt across compile gates, dependency vulnerability posture, JWT internals, stale artifacts, and CI enforcement gaps. The release posture requirement for this phase is explicit:

1. Execute full hardening scope (not release blockers only).
2. Enforce CI security gates that block at least high-risk findings.
3. Remove `ecdsa` exposure by replacing `python-jose` now.

## Locked Decisions

- No external REST API contract changes are introduced by this phase.
- JWT claim contract remains stable (`sub`, `user_id`, `exp`) while implementation library changes.
- Frontend generic table utilities are hardened for object-safe access without forcing index signatures on domain types.
- CI security results are blocking by default; exceptions require explicit allowlisting.

## Scope

- Frontend strict TypeScript/build remediation and dependency audit cleanup.
- Backend auth/JWT refactor from `python-jose` to `PyJWT`.
- Dead/stale code removal with regression validation.
- Tests/scripts lint debt cleanup for configured Ruff classes (`E,F,W,I`).
- CI workflow and local quality gate hardening.
- Phase closeout with auditable evidence and planning-state reconciliation.

## Out of Scope

- Feature-level business behavior expansion.
- Endpoint schema changes.
- Non-targeted architecture rewrites beyond hardening needs.

## Definition of Done

- `frontend` build/type/lint/test/audit gates pass.
- `backend` lint/test/security gates pass for required matrix.
- `python-jose` removed from runtime requirements; SSO + auth tests pass with `PyJWT`.
- Stale code artifacts removed with no regressions.
- CI definitions updated to fail on actionable security and quality issues.
- Roadmap/state and phase summaries reflect implemented evidence.
