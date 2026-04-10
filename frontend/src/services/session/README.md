## Session Services

This package is the single frontend boundary for auth-session state and
session-specific side effects.

Use it for:
- storing and reading the current auth session
- bootstrap-time session hydration
- refresh and logout suppression hints
- refresh-only silent session recovery behavior

Keep transport concerns in `frontend/src/services/api/` and `authApi.ts`.
Keep React-specific orchestration in `frontend/src/contexts/auth/`.
