# Concerns & Technical Debt

## Security (Critical - Penetration Test 2026-01-08)
- **Webhook endpoint allows user injection** - `/api/v1/directory/webhook` skips signature verification when `WEBHOOK_SECRET` is empty. Attacker can create users without authentication. **Confirmed exploitable with fake signatures.**
- Default `SECRET_KEY` in config.py - production MUST override via environment
- OpenAPI/Swagger docs publicly exposed at `/docs` and `/openapi.json`
- Database port 5432 exposed to host in docker-compose.yml
- Rate limiting disabled when `DEBUG=true`
- Demo login endpoint works in debug mode (`/auth/demo-login/{id}`)

## Security (Low Severity)
- **Null byte in email causes 500 error** - potential DoS vector
- **Excel exports vulnerable to formula injection** - Cell values starting with `=`, `+`, `-`, `@` not sanitized
- **Verbose Pydantic errors** - reveal field names, types, and constraints
- JWT stored in localStorage (no httpOnly cookie option)
- No token refresh flow - tokens expire and require re-login

## Security (Verified Secure - Elite Attacks Blocked)
- Production startup check: fails if `SECRET_KEY` not set and `DEBUG=false`
- `MOCK_AUTH_ENABLED` blocked in production mode
- All API endpoints require valid JWT (unauthenticated access blocked)
- SQL injection prevented (parameterized queries via SQLAlchemy)
- Blind SQL timing attacks blocked (queries return instantly)
- JWT `alg: none` attack blocked (explicit `algorithms=["HS256"]`)
- JWT `kid` path traversal rejected
- JWT secret brute-force failed (not using common secrets)
- Path traversal blocked
- Security headers properly configured (CSP, X-Frame-Options, HSTS, XSS protection)
- HTTP Request Smuggling rejected ("Invalid HTTP request")
- CRLF header injection handled gracefully
- Log injection handled (newlines treated as literal strings)
- NoSQL injection blocked by Pydantic type validation
- Mass assignment with nested objects ignored (role unchanged)
- Race conditions on approvals properly blocked
- XSS payloads stored but safely rendered (React escapes, PDF/Excel shows raw text)
- SSRF via PDF not exploitable (URLs rendered as text, not fetched)
- Privilege escalation blocked (users cannot modify own role)
- IDOR blocked (cross-department access denied)

## Reliability
- APScheduler runs in-process; multi-worker deployments can double-run jobs
- Log rotation configured but no external log aggregation
- No health check alerting system

## Deployment
- `.env.example` documents all required vars but manual copy is needed
- Docker builds can be slow on Apple Silicon due to arm64 compilation
- AD Emulator needs separate database initialization

## Code Quality
- `frontend/src/pages/DashboardPage.tsx` is large (~400 lines)
- Some backend endpoints have complex permission logic in endpoints rather than services
- Legacy SQLite files (`risk_management.db`, `risk_app.db`) may exist alongside Postgres

## Data Integrity
- Activity log ensures audit trail via same-transaction writes
- `name` column on Risk/Control models now enforces NOT NULL
- Historical snapshots used for quarterly metrics (retroactive accuracy)

## Known Gaps
- No Azure AD/Entra ID integration (AD Emulator is placeholder)
- No WebSocket/real-time updates for notifications
- PDF exports don't include charts (text/table only)

*Updated: 2026-01-08 (Final Elite Penetration Test Results)*
