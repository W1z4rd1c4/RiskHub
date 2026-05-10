# Microsoft Entra ID Integration Audit — RiskHubOSS

> **Audit date:** 2026-04-20
> **Branch:** `main` @ `51851b77`
> **Auditor:** Claude (automated audit pass, w1z4rd1c4 commissioning)
> **Scope:** Backend, frontend, configuration, infra, CI/CD, tests, docs
> **Benchmarks:** OIDC Core §3/§5/§12, Microsoft Entra app-registration guidance, OWASP ASVS v4 §2/§3/§4, and the project's own `docs/deployment/security-checklist.md` and `docs/deployment/production.md`.

---

## 1. Executive summary

**Posture: Ready with caveats.**

The Entra integration is mature, well-hardened, and production-ready for the single-tenant profile it targets. Startup invariants, CSRF, origin validation, JWKS caching, tenant pinning, nonce/state binding, token-version revocation, refresh rotation, challenge consumption, and preflight tooling are all in place and cover the OWASP ASVS authentication controls that matter. The remaining gaps are operational and observability-focused, not exploitable.

**Top 5 risks to address next:**

1. **F-01 (S2) — Incomplete audit trail for refresh + logout.** SSO login success and failure events reach both the DB `activity_log` and the SIEM `audit.json.log` stream; refresh-token rotation and logout do not. ([backend/app/api/v1/endpoints/auth/refresh.py:127](../../backend/app/api/v1/endpoints/auth/refresh.py), [backend/app/api/v1/endpoints/auth/logout.py:82](../../backend/app/api/v1/endpoints/auth/logout.py), [backend/app/api/v1/endpoints/auth/_shared.py:149](../../backend/app/api/v1/endpoints/auth/_shared.py))
2. **F-04 (S2) — No push-based logout; deprovision lag of up to 15 min.** When an admin disables a user in Entra, the scheduled directory-deprovision job closes RiskHub sessions (deactivate user, bump `token_version`, revoke refresh tokens), but only on its next run — the interval is driven by `AD_DEPROVISION_CHECK_INTERVAL_MINUTES` (15 min in production per [docs/deployment/production.md:82](../deployment/production.md)). No OIDC back-channel logout endpoint closes the window immediately.
3. **F-05 (S2) — JWKS telemetry and proactive-refresh gap.** Cache refresh is reactive-only — it fires on unknown-KID *and* on signature failure ([backend/app/services/sso_token_service.py:193-207](../../backend/app/services/sso_token_service.py)) — so a key rotation is self-healing on first failing token. Gap is observability: operators can't distinguish "JWKS was stale for one token" from "real attack", and there's no scheduled refresh to catch unused paths.
4. **F-03 (S2) — No Infrastructure-as-Code for Entra.** App registration, redirect URIs, API permissions, and the `riskhubBusinessRole` directory extension are manual operator steps — drift risk, no declarative source of truth.
5. **F-02 (S3) — `/auth/refresh` has no dedicated rate limit.** Refresh currently inherits the default `200/60s` bucket instead of a tighter cookie-auth budget, so refresh spray noise is bounded only by the shared default policy. ([backend/app/middleware/rate_limit/policy.py:9-16](../../backend/app/middleware/rate_limit/policy.py), [backend/app/api/v1/endpoints/auth/refresh.py:1-161](../../backend/app/api/v1/endpoints/auth/refresh.py))

**Findings by severity:**

| Severity | Count |
|---|---|
| S0 Critical | 0 |
| S1 High | 0 |
| S2 Medium | 4 |
| S3 Low | 3 |
| Info | 3 |
| Pass (validated) | 8 |

---

## 2. Scope & methodology

Each of the 19 scope areas below was graded against OIDC Core, MS Entra best-practice guidance, OWASP ASVS v4 authentication/session/communications controls, and the project's own production-readiness checklist. Findings cite `file:line`; preliminary-phase claims were each re-verified with a fresh read before entry. No live-Entra traffic was exercised during the audit — behavior is inferred from code and the existing test suite (which mocks Entra end-to-end).

**Out of scope:** MFA policies (delegated to Entra), conditional-access rules (delegated to Entra), network-level protection of `login.microsoftonline.com` egress, and Graph API rate-limit behavior under directory sync.

---

## 3. Current implementation overview

**Flow shape — server-orchestrated authorization code with PKCE**

```
Frontend                      Backend                      Entra
────────                      ───────                      ─────
handleSsoLogin
  → authApi.ssoStart   ──────▶ /sso/start
                                 · generate nonce/state/challenge_id (secrets.token_urlsafe(32))
                                 · store challenge (InMemory OR Redis)
                                 · set httpOnly cookie `riskhub_sso_challenge`
                       ◀──────   { nonce, state, expires_in }
  entraAuth.loginRedirect
  (MSAL v5 public client, PKCE handled by library)
                                                    ──────▶ authorize
                                                             (user consents/auths)
                                                    ◀────── redirect /auth/sso/callback?id_token=...&state=...
SsoCallbackPage
  → entraAuth.handleRedirect (extracts id_token, state)
  → authApi.ssoExchange ─────▶ /sso/exchange
                                 · verify id_token (RS256 against JWKS)
                                 · assert tid == ENTRA_TENANT_ID
                                 · extract oid, email, name, nonce
                                 · consume challenge, check state + nonce
                                 · resolve or JIT-provision user
                                 · sync profile (name, email, business_role)
                                 · issue refresh token (HS256) + record in DB
                                 · issue access token (HS256)
                                 · set httpOnly refresh cookie, CSRF cookie, session hint
                       ◀──────   { access_token, user, post_login_redirect_to }
  applyAuthenticatedSession
  (token held in memory, navigate)
```

**Library stack**

- Backend: PyJWT for ID/access/refresh token verification; `msal` (Python) only for Graph client-credentials token acquisition.
- Frontend: `@azure/msal-browser@^5.2.0` configured as `PublicClientApplication` with `cacheLocation: "sessionStorage"`.
- No `@azure/msal-react` provider wrapper; custom React context + memory-only app-token store.

**Key files**

- Backend: [sso.py](../../backend/app/api/v1/endpoints/auth/sso.py), [_sso_helpers.py](../../backend/app/api/v1/endpoints/auth/_sso_helpers.py), [refresh.py](../../backend/app/api/v1/endpoints/auth/refresh.py), [logout.py](../../backend/app/api/v1/endpoints/auth/logout.py), [_shared.py](../../backend/app/api/v1/endpoints/auth/_shared.py), [_request_protection.py](../../backend/app/api/v1/endpoints/auth/_request_protection.py), [deps.py](../../backend/app/api/deps.py), [sso_token_service.py](../../backend/app/services/sso_token_service.py), [sso_challenge_store.py](../../backend/app/services/sso_challenge_store.py), [_graph_directory/auth.py](../../backend/app/services/_graph_directory/auth.py), [_graph_directory/service.py](../../backend/app/services/_graph_directory/service.py), [tokens.py](../../backend/app/core/tokens.py), [security.py](../../backend/app/core/security.py), [settings/auth.py](../../backend/app/core/settings/auth.py), [main.py](../../backend/app/main.py), [models/user.py](../../backend/app/models/user.py), [models/refresh_token.py](../../backend/app/models/refresh_token.py).
- Frontend: [entraAuth.ts](../../frontend/src/services/entraAuth.ts), [authApi.ts](../../frontend/src/services/authApi.ts), [authConfig.ts](../../frontend/src/services/authConfig.ts), [session/store.ts](../../frontend/src/services/session/store.ts), [api/apiRequestBuilder.ts](../../frontend/src/services/api/apiRequestBuilder.ts), [api/ApiClientCore.ts](../../frontend/src/services/api/ApiClientCore.ts), [SsoCallbackPage.tsx](../../frontend/src/pages/SsoCallbackPage.tsx), [LoginPage.tsx](../../frontend/src/pages/LoginPage.tsx), [useAuthActions.ts](../../frontend/src/contexts/auth/useAuthActions.ts), [useLoginActions.ts](../../frontend/src/pages/login/useLoginActions.ts).
- Config/ops: [.env.example](../../.env.example), [docker-compose.yml](../../docker-compose.yml), [docs/deployment/security-checklist.md](../deployment/security-checklist.md), [docs/deployment/production.md](../deployment/production.md), [scripts/prod/lib/preflight.sh](../../scripts/prod/lib/preflight.sh), [.github/workflows/e2e.yml](../../.github/workflows/e2e.yml).

---

## 4. Coverage matrix

| # | Area | Status | Severity if gap | Evidence |
|---|---|---|---|---|
| 1 | OIDC/OAuth flow | **Pass** | — | [sso.py:77-87](../../backend/app/api/v1/endpoints/auth/sso.py), [entraAuth.ts:93-108](../../frontend/src/services/entraAuth.ts) |
| 2 | ID token validation | **Pass** | — | [sso_token_service.py:150-214](../../backend/app/services/sso_token_service.py) |
| 3 | Access + refresh tokens | **Pass** | — | [security.py:47-102](../../backend/app/core/security.py), [tokens.py:33-86](../../backend/app/core/tokens.py), [refresh.py:110-161](../../backend/app/api/v1/endpoints/auth/refresh.py) |
| 4 | Claims & user provisioning | **Pass** | — | [_sso_helpers.py:137-239](../../backend/app/api/v1/endpoints/auth/_sso_helpers.py), [main.py:104-115](../../backend/app/main.py) |
| 5 | Session lifecycle | **Pass** | — | [tokens.py:147-174](../../backend/app/core/tokens.py), [_shared.py:86-130](../../backend/app/api/v1/endpoints/auth/_shared.py) |
| 6 | Logout & revocation | **Gap** | S2 (F-04) | [logout.py:55-102](../../backend/app/api/v1/endpoints/auth/logout.py); client-initiated only + scheduled 15-min deprovision ([ad_deprovision_service.py:265-276](../../backend/app/services/ad_deprovision_service.py)); no push-based revocation |
| 7 | Secrets management | **Pass** | — | [auth.py:81-107](../../backend/app/core/settings/auth.py), [docs/deployment/production.md:77](../deployment/production.md), [docs/deployment/runbooks/entra-credential-rotation.md:1](../deployment/runbooks/entra-credential-rotation.md) |
| 8 | Multi-tenant posture | **Info (F-10)** | — | [sso_token_service.py:209-211](../../backend/app/services/sso_token_service.py); single-tenant by design |
| 9 | Middleware & guards | **Pass** | — | [deps.py:27-109](../../backend/app/api/deps.py) |
| 10 | CSRF / Origin / CORS | **Pass** | — | [_request_protection.py:32-47](../../backend/app/api/v1/endpoints/auth/_request_protection.py), [main.py:44-45](../../backend/app/main.py) |
| 11 | Graph API | **Pass** | — | [_graph_directory/auth.py](../../backend/app/services/_graph_directory/auth.py), [_graph_directory/service.py](../../backend/app/services/_graph_directory/service.py) |
| 12 | Frontend MSAL | **Pass** | — | [entraAuth.ts:24-56](../../frontend/src/services/entraAuth.ts), [session/store.ts:17](../../frontend/src/services/session/store.ts) |
| 13 | Frontend protected routes | **Pass** | — | [App.tsx:20-40](../../frontend/src/App.tsx), [ApiClientCore.ts:61-82](../../frontend/src/services/api/ApiClientCore.ts) |
| 14 | Logging & audit | **Gap** | S2 (F-01) | [sso.py:201-221](../../backend/app/api/v1/endpoints/auth/sso.py), [activity_logger.py:207](../../backend/app/core/activity_logger.py), [refresh.py:127-138](../../backend/app/api/v1/endpoints/auth/refresh.py) |
| 15 | Rate limiting & abuse | **Gap** | S3 (F-02, F-08) | [policy.py:9-16](../../backend/app/middleware/rate_limit/policy.py); `/auth/refresh` falls to default, no SSO lockout |
| 16 | Data model & migrations | **Pass** | — | [models/user.py:36-90](../../backend/app/models/user.py), [models/refresh_token.py:15-36](../../backend/app/models/refresh_token.py) |
| 17 | Tests | **Pass with caveat (F-19)** | Info | `test_sso_exchange.py`, `test_sso_token_service.py`, `test_entra_confidential_credentials.py`, `entraAuth.test.ts` — no live-Entra e2e (mocked, intentional) |
| 18 | Infrastructure-as-Code | **Gap** | S2 (F-03) | No `.tf`/`.bicep` for Entra app in repo |
| 19 | CI/CD | **Pass** | — | [.github/workflows/e2e.yml:182-275](../../.github/workflows/e2e.yml); placeholders only, `production-profile-smoke` asserts invariants |

---

## 5. Findings

### F-01 — SSO refresh and logout are not audit-logged (S2)

**Evidence:** [backend/app/api/v1/endpoints/auth/sso.py:201-221](../../backend/app/api/v1/endpoints/auth/sso.py), [backend/app/core/activity_logger.py:189-210](../../backend/app/core/activity_logger.py), [backend/app/api/v1/endpoints/auth/refresh.py:127-138](../../backend/app/api/v1/endpoints/auth/refresh.py), [backend/app/api/v1/endpoints/auth/logout.py:82](../../backend/app/api/v1/endpoints/auth/logout.py), [backend/app/api/v1/endpoints/auth/_shared.py:149-157](../../backend/app/api/v1/endpoints/auth/_shared.py).

**Impact:** SSO login success and failure DO reach the SIEM audit stream — `log_activity()` writes to both the DB `activity_log` table *and* the dedicated `audit.json.log` structured logger ([activity_logger.py:207](../../backend/app/core/activity_logger.py)). However, `/auth/refresh` on success emits only a `structlog.info` line and `/auth/logout` calls `_invalidate_user_sessions` without any call to `log_activity`. Operators investigating "whose session rotated at T?" or "who logged out when?" have no canonical audit entry. IP/user-agent changes on refresh ([refresh.py:127-138](../../backend/app/api/v1/endpoints/auth/refresh.py)) are logged only as `structlog.warning`, not routed through the SIEM channel.

**Recommendation:** Extend `refresh.py:175` and `logout.py:84, 100` to call `log_activity()` with new `ActivityAction` values (`REFRESH`, `LOGOUT`, `LOGOUT_ALL`). Include the refresh-token `jti`, SHA-256-truncated IP/UA, and the revocation reason. Add a STRUCTURED-logs → AUDIT promotion for the existing `refresh_session_context_changed` warning so drift from the original session context is durable.

**Effort:** S (small — 2 call sites + 1 enum extension + 1 activity log migration to add the new action enum values).

---

### F-02 — `/auth/refresh` has no dedicated rate limit (S3)

**Evidence:** [backend/app/middleware/rate_limit/policy.py:9-16](../../backend/app/middleware/rate_limit/policy.py).

**Impact:** The generic rate-limit middleware sets:
- `/api/v1/auth/login` → 5/60s
- `/api/v1/auth/sso`   → 10/60s (prefix match covers both `/sso/start` and `/sso/exchange`)
- `/api/v1/auth/demo-login` → 10/60s
- `default` → 200/60s

`/api/v1/auth/refresh` is not explicitly listed, so it falls to the default 200/60s per-IP limit ([policy.py:44-50](../../backend/app/middleware/rate_limit/policy.py)). That's generous for a legitimate single-tab client but tolerates refresh-spray patterns that would otherwise show up as SIEM anomalies.

**Recommendation:** Add `"/api/v1/auth/refresh": (30, 60)` to `DEFAULT_RATE_LIMIT_RULES` — generous enough for real clients including silent-refresh on 401 retry, tight enough to flag abuse.

**Effort:** S (one-line change + test).

---

### F-03 — No Infrastructure-as-Code for the Entra app registration (S2)

**Evidence:** Repo contains no `.tf`, `.bicep`, or `.yaml` (Pulumi) files. [docs/deployment/security-checklist.md:44-49](../deployment/security-checklist.md) requires Enterprise App assignment, redirect-URI validation, and callback registration as manual steps. [docs/deployment/production.md:73-75](../deployment/production.md) documents the `riskhubBusinessRole` directory extension as an operator task.

**Impact:** Drift between what the code expects (redirect URIs, scopes, directory extension, token version, optional ID claims) and what actually exists in Entra. No deterministic rollback path for Entra-side changes. No pre-merge diff when someone changes expected scopes in code without updating the app registration.

**Recommendation:** Add a Bicep or Terraform module under `infra/entra/` that declares the Application, redirect URIs (`/auth/sso/callback`, `/login`), API permissions (`openid`, `profile`, `email`, `User.Read` for Graph), and the `riskhubBusinessRole` directory extension. Wire it into the release checklist. If tenant ownership blocks automation, add a CI check that hits the auth-config endpoint and asserts the published `authority` matches the registered tenant — so at least a mismatch surfaces early.

**Effort:** M (one module + CI gate).

---

### F-04 — No OIDC back-channel logout; deprovision lag up to 15 min (S2)

**Evidence:** [backend/app/api/v1/endpoints/auth/logout.py](../../backend/app/api/v1/endpoints/auth/logout.py) exposes only client-initiated `/logout` and `/logout-all`. No endpoint accepts a logout token from Entra. [frontend/src/services/entraAuth.ts:121-130](../../frontend/src/services/entraAuth.ts) calls `logoutRedirect` which sends the user through Entra's end-session endpoint but the trip is one-way — RiskHub never receives a server-to-server notification. **Existing mitigation:** the scheduled `ad_deprovision_check` job ([backend/app/core/scheduler_jobs.py:170-176](../../backend/app/core/scheduler_jobs.py)) runs every `AD_DEPROVISION_CHECK_INTERVAL_MINUTES` (15 min in production per [docs/deployment/production.md:82](../deployment/production.md)) and calls [`backend/app/services/ad_deprovision_service.py`](../../backend/app/services/ad_deprovision_service.py) (`_deprovision_user`, lines 265-276), which sets `is_active=False`, bumps `token_version`, and revokes every live refresh token. Auth dependencies reject inactive users at [deps.py:54](../../backend/app/api/deps.py) and stale token versions at [deps.py:59](../../backend/app/api/deps.py).

**Impact:** When an admin disables a user in Entra, RiskHub closes the session on the next deprovision cycle — worst case ~15 min, plus the access-token TTL of any token issued just before the cycle (default 60 min via `access_token_expire_minutes` at [settings/auth.py:19](../../backend/app/core/settings/auth.py); however, refresh becomes impossible the moment the deprovision job runs, so the practical window is bounded by access-token lifetime, not refresh-token lifetime). Acceptable for routine deprovisioning. Insufficient for break-glass scenarios where seconds matter (e.g. account compromise, immediate termination).

**Recommendation:** Implement [OIDC Back-Channel Logout 1.0](https://openid.net/specs/openid-connect-backchannel-1_0.html) for sub-minute revocation. Add a `/api/v1/auth/sso/logout-token` endpoint that accepts a logout token, verifies it against the same JWKS (RS256, tenant-scoped, expects `events` claim), then calls `_invalidate_user_sessions(user, reason="backchannel_logout")`. Register the endpoint in the Entra app's `backChannelLogoutUri` manifest field (requires app-registration update — see F-03). Until then, document the 15-min deprovision lag in the security checklist so operators know the SLA for "removed in Entra → revoked in RiskHub".

**Effort:** M (new endpoint + verifier extension + app-registration change + tests).

---

### F-05 — JWKS refresh is reactive-only; no telemetry signal (S2)

**Evidence:** [backend/app/services/sso_token_service.py:139-207](../../backend/app/services/sso_token_service.py). JWKS cache TTL is 1 h (line 67). Force-refresh fires on **both** paths: when a token's `kid` is absent from cache ([line 193-194](../../backend/app/services/sso_token_service.py)) and when signature verification fails on a known `kid` ([line 199-207](../../backend/app/services/sso_token_service.py)). So a key rotation is self-healing on the first token that would otherwise fail — even in the rare case where Entra rotates material under an existing `kid`, the signature-failure path triggers a refresh and retries `_decode_claims` exactly once.

**Impact:** Correctness is fine. The gap is operational observability and proactivity: (a) refresh is triggered on demand by a real request, so low-traffic deployments can hold stale keys longer than they need to; (b) there's no structured signal distinguishing "stale JWKS hit → refresh recovered" from "real signature forgery attempt" — both surface as a retry. Post-incident review and anomaly detection are weaker than they could be.

**Recommendation:** (1) Shorten the JWKS TTL to 15 min (industry common). (2) Add a scheduled background refresh so rotation absorbs in idle windows, not on the first user after rotation. (3) Emit a structured SIEM event (`jwks_unknown_kid_refresh` vs. `jwks_signature_fail_refresh` vs. `jwks_fallback_exhausted`) so detection rules can treat the three separately.

**Effort:** S (constant change + one scheduler job + three log fields).

---

### F-06 — Credential-rotation procedure is documented (Pass)

**Evidence:** [backend/app/core/settings/auth.py:53](../../backend/app/core/settings/auth.py) exposes `ENTRA_CREDENTIAL_FINGERPRINT` for cache-busting. [backend/app/services/_graph_directory/auth.py](../../backend/app/services/_graph_directory/auth.py) keys the Graph token cache on fingerprint + credential material. [docs/deployment/production.md:77](../deployment/production.md) points operators at the dedicated runbook [docs/deployment/runbooks/entra-credential-rotation.md](../deployment/runbooks/entra-credential-rotation.md), which covers overlapping-credential rollout, fingerprint bumping, rolling restart, verification, and old-credential removal.

**Impact:** Rotation is documented well enough for the current rolling-restart model. The remaining limitation is architectural rather than documentation-related: this pass does not provide a hot-reload endpoint, so process restart remains part of the credential-cutover contract.

**Recommendation:** Keep the runbook in sync if a future hot-reload path or reload endpoint is added.

**Effort:** None for current scope.

---

### F-07 — No replay-detection cache beyond challenge one-time use (S3)

**Evidence:** [backend/app/services/sso_challenge_store.py:35-43](../../backend/app/services/sso_challenge_store.py) (in-memory) and [sso_challenge_store.py:78-85](../../backend/app/services/sso_challenge_store.py) (Redis, atomic `EVAL`). Challenge is consumed once; if consume wins, the challenge is deleted. No global replay-tracking on the token itself.

**Impact:** A stolen ID token re-submitted against a fresh challenge would be caught by `nonce` mismatch (since the fresh challenge has a different nonce). The practical attack surface is minimal. The defense-in-depth gap: if the ID token has a legitimate `nonce` and state but the attacker controls the RiskHub session (e.g. XSS on the SPA), there's nothing comparing the ID token's `jti`/`exp` against a seen-tokens cache. Low realistic risk given the memory-only token storage posture ([session/store.ts:17](../../frontend/src/services/session/store.ts)).

**Recommendation:** Defer unless a specific threat emerges; document as accepted residual risk in the security checklist.

**Effort:** Not recommended at this time.

---

### F-08 — SSO endpoints have no account-lockout throttling (S3)

**Evidence:** [backend/app/services/account_lockout_service.py](../../backend/app/services/account_lockout_service.py) implements a 5-attempt / 15-min-lockout / 10-min-window policy. Only `password.py` invokes it ([password.py:75-142](../../backend/app/api/v1/endpoints/auth/password.py)). `sso.py` and `refresh.py` do not call it.

**Impact:** Repeated failures at `/sso/exchange` — e.g. replaying an expired ID token, or supplying a wrong tenant `tid` — only trigger SIEM `FAILED_LOGIN` entries, not per-user lockout. Low realistic risk because (a) rate limiting already caps at 10/60s per IP and (b) an attacker without a valid ID token cannot produce one. The gap is observability symmetry, not exploitability.

**Recommendation:** When F-01 is implemented, include a per-identity (oid) counter in the SIEM that can feed a detection rule. Formal lockout is overkill here.

**Effort:** Not recommended as a code change; wire into detection rules instead.

---

### F-09 — Bootstrap env-file surfaces are aligned (Pass)

**Evidence:** Root [.env.example:71](../../.env.example) documents `ENTRA_BUSINESS_ROLE_ATTRIBUTE_NAME`, and [.env.example:87](../../.env.example) documents `ENTRA_CREDENTIAL_FINGERPRINT`. The production template [scripts/deploy/templates/riskhub.env.example:14-16](../../scripts/deploy/templates/riskhub.env.example) includes both settings as well. Both variables map to live settings in [backend/app/core/settings/auth.py:50,53](../../backend/app/core/settings/auth.py).

**Impact:** Operators starting from either bootstrap surface can discover the Entra business-role attribute and the credential-fingerprint cache-bust knob without cross-referencing deployment docs.

**Recommendation:** Keep the env examples synchronized if new Entra settings are introduced.

**Effort:** None for current scope.

---

### F-10 — Single-tenant posture is by design (Info)

**Evidence:** [backend/app/services/sso_token_service.py:209-211](../../backend/app/services/sso_token_service.py) enforces exact `tid` match. [backend/app/core/settings/auth.py:25](../../backend/app/core/settings/auth.py) holds a single `entra_tenant_id: str | None`. Main startup guard at [backend/app/main.py:90-93](../../backend/app/main.py) requires it when `DEBUG=false`.

**Impact:** Multi-tenant deployments (e.g. SaaS offering with B2B customers on their own tenants) require code-level changes. The current design is correct for the stated product shape — single-tenant on-prem or single-tenant managed.

**Recommendation:** Flag in SaaS-roadmap planning. No code change today.

---

### F-11 — `entra_business_role` is read-only metadata, verified (Info)

**Evidence:** [backend/app/models/user.py:41-42](../../backend/app/models/user.py) comment:
> *"Entra-owned organizational metadata. This must never drive RiskHub authorization."*

Grep across the codebase confirms no authorization predicate reads `entra_business_role`. It appears in: schema serializers ([schemas/user.py:82,105](../../backend/app/schemas/user.py)), the `_build_token_response` DTO ([_shared.py:66](../../backend/app/api/v1/endpoints/auth/_shared.py)), activity-log safe allowlist ([activity_redaction.py:115](../../backend/app/core/activity_redaction.py)), directory sync writers ([_directory_identity/lifecycle.py](../../backend/app/services/_directory_identity/lifecycle.py)), and display endpoints ([me.py:36](../../backend/app/api/v1/endpoints/auth/me.py), [access.py:85](../../backend/app/api/v1/endpoints/access.py)). No `if user.entra_business_role ==` anywhere.

**Impact:** Zero. This is a well-implemented trust boundary: Entra-owned data is displayed but not trusted for authorization decisions.

**Recommendation:** Keep the comment at `models/user.py:41` in place as the canonical contract. Consider adding a pytest lint that greps for `entra_business_role` in conditionals under `app/core/permissions.py` and asserts empty.

---

### F-12 — Token storage posture (Pass)

**Evidence:** [frontend/src/services/session/store.ts:17](../../frontend/src/services/session/store.ts) holds the bearer token in a module-scope variable, never persisted. [frontend/src/services/entraAuth.ts:42](../../frontend/src/services/entraAuth.ts) sets MSAL's `cacheLocation: "sessionStorage"`. Refresh/CSRF cookies are `HttpOnly` and `Secure` (when not debug) at [backend/app/core/tokens.py:147-174](../../backend/app/core/tokens.py).

**Impact:** XSS can exfiltrate nothing useful — no bearer token in DOM-reachable storage, no refresh token in JS-readable cookies. MSAL's `sessionStorage` cache is only consulted by MSAL's own logic, not the app. Good posture.

**Recommendation:** Keep it. Add a test asserting `localStorage` is empty of auth-related keys at any point in the auth flow.

---

### F-13 — Production startup invariants (Pass)

**Evidence:** [backend/app/main.py:48-115](../../backend/app/main.py) enforces at boot when `DEBUG=false`:
- `SECRET_KEY` ≥ 32 chars and not in `KNOWN_WEAK_SECRET_KEYS`
- explicit `DATABASE_URL`, `CORS_ORIGINS`, `ALLOWED_HOSTS`
- `AUTH_MODE == microsoft_sso`
- `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `entra_confidential_credential` present
- `DIRECTORY_PROVIDER == graph`
- `AD_EMULATOR_BASE_URL` unset
- `ENTRA_JIT_PROVISIONING_ENABLED == false`
- `AUTH_SSO_ALLOW_EMAIL_LINK == false`
- `TRUSTED_PROXIES` narrow (or explicit broad-range waiver)

**Impact:** Misconfiguration is caught at startup, not at runtime. Excellent defense against operator error.

---

### F-14 — No committed secrets (Pass)

**Evidence:** Greps across `.env*`, `*.yml`, `*.yaml`, `*.sh`:
- [.env.example:51-54](../../.env.example) — all-zero placeholder GUIDs.
- [docker-compose.yml:23-30](../../docker-compose.yml) — `${…:-}` defaults only; no literal secrets.
- [.github/workflows/e2e.yml:190-192](../../.github/workflows/e2e.yml) — placeholder GUIDs `000...`, `111...`, and the literal string `production-entra-client-secret` which is a test fixture, not a real secret. (Note: this literal looks secret-ish to scanners; consider changing to `PLACEHOLDER_ENTRA_CLIENT_SECRET_FOR_CI_SMOKE` to reduce SAST noise.)
- [scripts/deploy/lib/common.sh:237-238](../../scripts/deploy/lib/common.sh) — `CHANGE_ME_*` scaffold values.
- [scripts/prod/lib/preflight.sh:150, 161](../../scripts/prod/lib/preflight.sh) — actively rejects deployments where the secret file still holds the `CHANGE_ME_…` placeholder.

**Impact:** Strong. Rotation path is file-based (secret dir) and the deploy preflight prevents placeholder-in-prod boots.

---

### F-15 — Token-version revocation (Pass)

**Evidence:** [backend/app/models/user.py:45](../../backend/app/models/user.py) has `token_version` on the user. [backend/app/api/deps.py:59-62](../../backend/app/api/deps.py) and [backend/app/api/v1/endpoints/auth/refresh.py:110-119](../../backend/app/api/v1/endpoints/auth/refresh.py) compare issued `token_version` against current. [backend/app/api/v1/endpoints/auth/_shared.py:149-157](../../backend/app/api/v1/endpoints/auth/_shared.py) bumps the user's `token_version` *and* marks every live refresh-token row as revoked in one transaction.

**Impact:** Global per-user revocation works — an admin action bumping `token_version` invalidates every outstanding access and refresh token atomically. Refresh tokens also carry `replaced_by_jti` for rotation lineage ([models/refresh_token.py:31](../../backend/app/models/refresh_token.py)).

---

### F-16 — Rate-limit scope for SSO endpoints (Pass)

**Evidence:** [backend/app/middleware/rate_limit/policy.py:9-16](../../backend/app/middleware/rate_limit/policy.py) maps `/api/v1/auth/sso` → 10 req/60 s (prefix match covers both `/sso/start` and `/sso/exchange`) and `/api/v1/auth/login` → 5 req/60 s. [backend/app/middleware/rate_limit/backend.py](../../backend/app/middleware/rate_limit/backend.py) backs limits with Redis in production. `RATE_LIMIT_FAIL_CLOSED_ON_BACKEND_ERROR=true` ([docs/deployment/security-checklist.md:70](../deployment/security-checklist.md)) means Redis outage returns 503 rather than silently degrading.

**Impact:** SSO start/exchange spam is bounded. Refresh endpoint limit is the only remaining gap — see F-02.

---

### F-17 — Operator preflight hardening (Pass)

**Evidence:** [scripts/prod/lib/preflight.sh:96-97, 141-169](../../scripts/prod/lib/preflight.sh):
- Refuses boot if `ENTRA_CLIENT_SECRET` or `ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY` appear in the non-secret `backend.env`.
- Validates exactly one confidential credential is selected.
- Rejects secret files that still contain the `CHANGE_ME_…` placeholder value.
- Warns when both credential modes are set (certificate wins by code path, but operators should know).

**Impact:** Excellent. Catches configuration mistakes before they become runtime bugs.

---

### F-18 — Frontend scope list is backend-provided (Pass with note)

**Evidence:** [backend/app/api/v1/endpoints/auth/config.py:104](../../backend/app/api/v1/endpoints/auth/config.py) hardcodes `scopes: ["openid", "profile", "email"]` in the auth-config response. Frontend ([entraAuth.ts:55](../../frontend/src/services/entraAuth.ts)) honors it with fallback to the same three scopes.

**Impact:** If future work requires requesting `User.Read` for frontend-side Graph calls (not currently needed), the scope list will need a code change. Fine today.

**Note:** Document this as an intentional constraint — frontend must not request additional Graph scopes without a backend config change.

---

### F-19 — No live-Entra e2e test coverage (Info)

**Evidence:** [tests/backend/pytest/test_sso_exchange.py](../../tests/backend/pytest/test_sso_exchange.py), [test_sso_token_service.py](../../tests/backend/pytest/test_sso_token_service.py), and [test_entra_confidential_credentials.py](../../tests/backend/pytest/test_entra_confidential_credentials.py) stub `verify_entra_id_token` and `msal.ConfidentialClientApplication`. Frontend e2e ([tests/frontend/e2e/auth.spec.ts](../../tests/frontend/e2e/auth.spec.ts)) uses demo login, not live Entra. The CI "Production Profile Smoke" at [.github/workflows/e2e.yml:182-275](../../.github/workflows/e2e.yml) boots in `microsoft_sso` mode with placeholder credentials and asserts only the auth-config contract.

**Impact:** Regressions that only manifest against a real tenant (wrong audience, missing optional claim, clock-skew edge, v1 vs v2 token-version issues) won't be caught before first production smoke. Intentional trade-off — living Entra tests require a dedicated test tenant and persistent secrets.

**Recommendation:** Keep the current mocked coverage. If budget permits, add a nightly or on-demand workflow that exercises a dedicated `*.onmicrosoft.com` test tenant with a headless OIDC client (device code or client credentials). Not blocking.

---

## 6. Prioritized remediation roadmap

### Next sprint (S2 — fix before next prod change touches auth)

| Order | Finding | Suggested PR title | Files | Effort |
|---|---|---|---|---|
| 1 | F-01 | `feat(auth): audit-log refresh and logout events` | `refresh.py`, `logout.py`, `_shared.py`, `activity_log.py` enum | S |
| 2 | F-05 | `fix(sso): add JWKS refresh telemetry + proactive refresh` | `sso_token_service.py`, scheduler registration, SIEM signals | S |
| 3 | F-04 | `feat(sso): implement OIDC back-channel logout receiver` | new `sso.py` endpoint, `sso_token_service.py` extension, Entra app-registration update; interim: document the existing 15-min deprovision SLA in the security checklist | M |
| 4 | F-03 | `infra(entra): declarative Entra app registration (Bicep)` | new `infra/entra/`, CI parity check | M |

### Backlog (S3 — nice-to-have)

| Order | Finding | Suggested PR title | Effort |
|---|---|---|---|
| 6 | F-02 | `fix(rate-limit): tighten /auth/refresh budget` | S |
| 7 | F-14 | `chore(ci): rename literal test secret to reduce scanner noise` | XS |
| 8 | F-08 | `feat(detection): per-identity SSO failure counter` | S (detection-only) |

### Accepted residual risk

- F-07 (replay cache beyond one-time challenge) — defended in depth by nonce + token lifetime.
- F-10, F-18, F-19 — intentional scope of the product today.

---

## 7. Appendix A — Config reference

Every Entra/auth env var, with load site:

| Variable | Purpose | Required in prod | Load site |
|---|---|---|---|
| `AUTH_MODE` | `password` \| `microsoft_sso` \| `hybrid_dev` | `microsoft_sso` | [settings/auth.py:22](../../backend/app/core/settings/auth.py) |
| `ENTRA_TENANT_ID` | Single-tenant GUID | ✅ | [auth.py:25](../../backend/app/core/settings/auth.py) |
| `ENTRA_CLIENT_ID` | App registration GUID | ✅ | [auth.py:26](../../backend/app/core/settings/auth.py) |
| `ENTRA_CLIENT_SECRET` | Client secret (legacy mode) | ⚠ one of secret/cert | [auth.py:27](../../backend/app/core/settings/auth.py) |
| `ENTRA_CLIENT_SECRET_FILE` | File-backed client secret | ⚠ one of secret/cert | [auth.py:28-33](../../backend/app/core/settings/auth.py) |
| `ENTRA_CLIENT_CERTIFICATE_THUMBPRINT` | Certificate thumbprint | ⚠ preferred | [auth.py:34](../../backend/app/core/settings/auth.py) |
| `ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY` | Certificate PEM (inline) | ⚠ preferred | [auth.py:35](../../backend/app/core/settings/auth.py) |
| `ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE` | Certificate PEM (file) | ⚠ preferred | [auth.py:36-44](../../backend/app/core/settings/auth.py) |
| `ENTRA_JIT_PROVISIONING_ENABLED` | Auto-create user on first SSO | must be `false` | [auth.py:45](../../backend/app/core/settings/auth.py) |
| `ENTRA_ALLOWED_EMAIL_DOMAINS` | Email domain allowlist (also `ENTRA_ALLOWED_DOMAINS`) | optional | [auth.py:46-49](../../backend/app/core/settings/auth.py) |
| `ENTRA_BUSINESS_ROLE_ATTRIBUTE_NAME` | Custom directory-extension name for read-only role | optional | [auth.py:50](../../backend/app/core/settings/auth.py) |
| `ENTRA_CLOCK_SKEW_SECONDS` | JWT leeway | optional (default 60) | [auth.py:51](../../backend/app/core/settings/auth.py) |
| `ENTRA_OIDC_DISCOVERY_URL` | Override discovery endpoint | optional | [auth.py:52](../../backend/app/core/settings/auth.py) |
| `ENTRA_CREDENTIAL_FINGERPRINT` | Graph-token-cache key hint for rotation | optional | [auth.py:53](../../backend/app/core/settings/auth.py) |
| `AUTH_SSO_ALLOW_EMAIL_LINK` | Allow first-login email-to-OID link | must be `false` | [auth.py:54](../../backend/app/core/settings/auth.py) |
| `AUTH_SSO_CHALLENGE_TTL_SECONDS` | Challenge lifetime | optional (default 300) | [auth.py:55](../../backend/app/core/settings/auth.py) |
| `AUTH_SSO_REQUIRE_CHALLENGE` | Legacy flag, now always enforced | n/a | [auth.py:57](../../backend/app/core/settings/auth.py) |
| `DIRECTORY_PROVIDER` | `graph` \| `ad_emulator` \| `auto` | must be `graph` | [auth.py:58](../../backend/app/core/settings/auth.py) |
| `MOCK_AUTH_ENABLED` | Development `X-Mock-User-Id` header | must be `false` | [auth.py:18](../../backend/app/core/settings/auth.py), [main.py:49-57](../../backend/app/main.py) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access-JWT lifetime | optional (default 60) | [auth.py:19](../../backend/app/core/settings/auth.py) |
| `SECRET_KEY` / `SECRET_KEY_FILE` | HS256 shared secret for RiskHub JWTs | ✅ min 32 chars | [auth.py:11-17](../../backend/app/core/settings/auth.py) |

**Session cookies** (set at [tokens.py:147-174](../../backend/app/core/tokens.py)):

| Cookie | HttpOnly | Secure | SameSite | Domain | Path |
|---|---|---|---|---|---|
| `riskhub_refresh_token` | ✅ | ✅ (non-debug) | configurable (`lax` default) | configurable | `/api/v1/auth` |
| `riskhub_csrf_token` | ❌ (needs JS read) | ✅ (non-debug) | configurable | configurable | `/` |
| `riskhub_sso_challenge` | ✅ | ✅ (non-debug) | configurable | configurable | `/api/v1/auth` |
| `riskhub_refresh_hint` | ❌ | ✅ (non-debug) | configurable | configurable | `/` |

---

## 8. Appendix B — STRIDE threat model (keyed to findings)

| Threat | Category | Mitigation | Residual | Finding |
|---|---|---|---|---|
| Attacker replays ID token | Spoofing | Nonce bound to server challenge, one-time consume | Low | — |
| Attacker forges ID token | Tampering | RS256 JWKS verification, tenant `tid` match | Low | — |
| Stolen access token | Spoofing | 60-min default lifetime, `token_version` bump invalidates globally, scheduled deprovision cycle bumps token_version when Entra disables the user | Low–Medium — bounded by access-token TTL plus one 15-min deprovision cycle; push-based logout would shrink further | F-04 |
| Stolen refresh token | Spoofing | HttpOnly, Secure, rotated on every refresh, revoked on context change (logged) | Low | — |
| User deprovisioned in Entra keeps RiskHub access | Repudiation | Scheduled `ad_deprovision_check` job (15 min default) deactivates user, bumps `token_version`, revokes refresh tokens ([ad_deprovision_service.py:265-276](../../backend/app/services/ad_deprovision_service.py)) | Medium — up to one 15-min cycle + access-token TTL; no push revocation | F-04 |
| Operator loses audit trail of a session rotation | Repudiation | SSO login/failure logged; refresh/logout not | Medium | F-01 |
| JWKS rollover window exposes signature bypass | Tampering | Reactive refresh on unknown-KID | Low | F-05 |
| Credential compromise during rotation | Information disclosure | File-backed credentials, documented overlapping-credential runbook, fingerprint cache-bust, rolling restart verification | Low | — |
| CSRF against authenticated endpoints | Tampering | Double-submit token with constant-time compare, origin check | Low | — |
| Session hijack via XSS | Information disclosure | Bearer in memory only, MSAL cache in sessionStorage, HttpOnly cookies | Low | — |
| Refresh-spray DoS | Denial of service | Default rate limit 200/60s | Low | F-02 |
| `/sso/exchange` spam | Denial of service | 10/60s per-IP | Low | — |
| Committed secret | Information disclosure | `.env.example` placeholders; preflight rejects placeholders | Low | — |

---

## 9. Appendix C — `docs/deployment/security-checklist.md` cross-check

| Checklist item | Current state | Evidence |
|---|---|---|
| `DEBUG=false` | enforced | [main.py:64-115](../../backend/app/main.py) |
| `MOCK_AUTH_ENABLED=false` | enforced | [main.py:49-57](../../backend/app/main.py) |
| `AUTH_MODE=microsoft_sso` | enforced | [main.py:88-89](../../backend/app/main.py) |
| `DIRECTORY_PROVIDER=graph` | enforced | [main.py:94-101](../../backend/app/main.py) |
| `SECRET_KEY` ≥ 32 chars, not weak default | enforced | [main.py:69-72](../../backend/app/main.py) |
| External PostgreSQL `database_url` secret file | enforced | [main.py:73-74](../../backend/app/main.py) |
| Explicit `CORS_ORIGINS` | enforced, no `*` | [main.py:75-83](../../backend/app/main.py) |
| Reachable `REDIS_URL` | required | [main.py:73-74](../../backend/app/main.py), app state readiness |
| `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, one credential | enforced | [main.py:90-103](../../backend/app/main.py) |
| `ENTRA_JIT_PROVISIONING_ENABLED=false` | enforced | [main.py:104-109](../../backend/app/main.py) |
| `AUTH_SSO_ALLOW_EMAIL_LINK=false` | enforced | [main.py:110-115](../../backend/app/main.py) |
| `TRUSTED_PROXIES` reviewed | enforced with explicit waiver | [main.py:117-131](../../backend/app/main.py) |
| Enterprise App assignment required | operator task | [docs/deployment/security-checklist.md:44](../deployment/security-checklist.md) |
| Sign-in callback + post-logout URIs registered | operator task | [docs/deployment/security-checklist.md:46](../deployment/security-checklist.md) |
| Bootstrap users pre-linked to Entra `oid` | script provided | [backend/scripts/bootstrap_sso_user.py](../../backend/scripts/bootstrap_sso_user.py) |
| Every SSO login starts with backend challenge | enforced | [sso.py:116-125](../../backend/app/api/v1/endpoints/auth/sso.py), [_sso_helpers.py:242-316](../../backend/app/api/v1/endpoints/auth/_sso_helpers.py) |
| Post-login redirect resolved server-side | enforced | [sso.py:184](../../backend/app/api/v1/endpoints/auth/sso.py) |
| Normal logout invalidates all sessions for user | enforced | [_shared.py:149-157](../../backend/app/api/v1/endpoints/auth/_shared.py) |
| Cookie-auth endpoints require same-origin + CSRF | enforced | [_request_protection.py:32-47](../../backend/app/api/v1/endpoints/auth/_request_protection.py) |
| Cert credential preferred over client secret | code prefers cert | [settings/auth.py:93-107](../../backend/app/core/settings/auth.py) |
| `ENTRA_CREDENTIAL_FINGERPRINT` for rotation | supported and documented in the rotation runbook | [docs/deployment/production.md:77](../deployment/production.md), [docs/deployment/runbooks/entra-credential-rotation.md](../deployment/runbooks/entra-credential-rotation.md) |
| Cert PEM only in `/etc/riskhub/secrets/` | enforced | [scripts/prod/lib/preflight.sh:96-97](../../scripts/prod/lib/preflight.sh) |

---

## 10. Appendix D — Auth-hardening commit timeline

| SHA | Message | What it changed |
|---|---|---|
| `fd50b25f` | Add Entra business role metadata sync | Introduced read-only `entra_business_role` + sync field; migration `y5z6a7b8c9d0`. |
| `d01739d3` | Harden Entra SSO session and directory flows | Session lifecycle + directory-provider hardening; refresh-token table migration `p1q2r3s4t5u6`. |
| `4e68661d` / `9e0137f3` | Harden auth tokens, proxy trust, email canonicalization | Lowercase email canonicalization; proxy-trust guardrails. |
| `f4e1599c` / `bfc11f8d` | Harden auth session logout and CSRF flows | Constant-time CSRF compare; logout cookie clearing. |
| `a26a953a` | Harden approval auth and enforce SSO challenge flow | Made SSO challenge flow mandatory; removed legacy bypass. |
| `b20647f8` | Refine readiness contracts and auth logout recovery | Post-logout recovery UX; `Complete Microsoft Sign Out` retry. |
| `60409dbe` | Tighten refresh-token migration grace | Legacy tokens accepted only when *both* `aud` and `iss` are absent; new `test_auth_refresh.py` coverage. |
| `64a3dba3` | Extract auth and scheduler helpers | `_sso_helpers.py` and `_shared.py` extracted from `sso.py` for maintainability. |
| `f9ddc2f1` | Address orphan and activity log issues | Review follow-ups. |
| `51851b77` | Complete backend audit remediation (253.1) | Latest remediation batch — audit baseline. |

---

## 11. Verification

This audit was produced by:

- Reading every file cited above; no claim rests on agent summary alone.
- Grepping for: `ENTRA_CLIENT_SECRET`, `ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY`, `onmicrosoft.com`, `microsoftonline.com`, `entra_business_role`, `account_lockout`, `rate_limit`, `preferred_username|upn|oid|tid|nonce` — confirming no real secrets and cross-walking every env var to its load site.
- Re-verifying each draft finding against file:line evidence.

**To re-run the operational verification before closing the audit:**

```bash
# Confirm no committed secrets match real patterns
rg -n 'ENTRA_CLIENT_SECRET=[^p]' .env.example docker-compose.yml .github/workflows/

# Backend auth test suite (SSO, refresh, Entra credentials, auth config, lockout)
cd backend && pytest tests -k "sso or refresh or auth or entra or lockout"

# Frontend auth unit tests
cd tests/frontend/unit && pnpm test -- --run entraAuth SsoCallbackPage LoginPage.auth-modes AuthLogoutFlow

# Local smoke in hybrid_dev — walk demo-login → refresh → logout
./scripts/compose.sh up --profile full
# then browse to http://localhost

# Production-profile smoke (in CI)
# .github/workflows/e2e.yml::production-profile-smoke asserts the invariants from appendix C
```

---

*End of audit. Findings F-01 through F-19 are the complete set; no further gaps were surfaced in the verification pass.*
