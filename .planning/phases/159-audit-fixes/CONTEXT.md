# Phase 159: Audit Fixes — Context

Phase 159 is intentionally “minimal changes, maximum effect”. It fixes audit findings (test reliability, security hardening, and small polish) with automated verification only.

## Cross-Cutting Decisions

### Verification (No Manual Testing)
- Prefer targeted automated checks (unit/integration tests, grep/static checks, small scripts).
- Avoid steps that require manual UI validation (browser console checks, click-through smoke tests).

### Security Logging
- Use structured logging for security-relevant rejections/blocks.
- Prefer the dedicated audit logger (`app.core.logging.get_audit_logger`) for security events (SIEM-ready).
- Log metadata, not secrets: include IDs and counts; avoid logging rejected values or raw payloads.
- Avoid log flooding: aggregate to one log event per request/approval when possible.

### Backward Compatibility
- When tightening validation/whitelists, handle in-flight data safely:
  - Filter to allowed fields at execution time.
  - Apply allowed changes; ignore disallowed keys.
  - Emit a single audit log event listing rejected field names (no values).

### Error Responses
- Client responses should be minimal/generic for security enforcement.
- Detailed diagnostics belong in logs (prefer audit log where appropriate).

## Phase-Specific Notes from Code Scan
- `frontend/nginx.conf` contains a CSP `connect-src` entry `http://backend:*` which browsers cannot resolve; prefer `'self'`.
- `backend/app/api/v1/endpoints/directory.py` fails closed when `WEBHOOK_SECRET` is missing in production, but still returns HTTP 200 on processing failures (preventing upstream retries).
- `backend/app/middleware/security.py` trusted proxy CIDR matching uses string prefix logic and should be replaced with `ipaddress`-based matching.
- `backend/app/services/approval_execution_service.py` applies `pending_changes` by iterating keys and using `hasattr`/`setattr`; add an explicit field whitelist to prevent arbitrary writes.

