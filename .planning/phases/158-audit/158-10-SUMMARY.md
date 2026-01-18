---
phase: 158-audit
plan: "10"
status: complete
---

# 158-10 Summary: Production Hardening

## Objective

Harden production behavior: fail-closed webhook verification, scheduler singleton, safer rate limiting, and tighter CSP.

## What Was Built

### Task 1: Fail-Closed Webhook Verification

**File:** `backend/app/api/v1/endpoints/directory.py`

| Mode | WEBHOOK_SECRET Empty | Behavior |
|------|---------------------|----------|
| Debug (DEBUG=true) | Yes | Skip verification with warning |
| Production (DEBUG=false) | Yes | **Reject with HTTP 500** |
| Any | Valid signature | Accept |
| Any | Invalid signature | Reject with HTTP 401 |

**Change:** Added `settings.debug` check in `_verify_webhook_signature()`. Production rejects webhooks if secret not configured.

---

### Task 2: Scheduler Singleton

**File:** `backend/app/core/scheduler.py`

**Approach:** Environment toggle (Option B)

- Added `ENABLE_SCHEDULER` env var check
- Scheduler only starts if `ENABLE_SCHEDULER=true`
- Defaults to `false` - safe for multi-worker deployments

**Deployment:** Set `ENABLE_SCHEDULER=true` on exactly ONE backend instance.

**File:** `docker-compose.prod.yml` - Added env var with documentation.

---

### Task 3: Rate Limiting Hardening

**File:** `backend/app/middleware/security.py`

**Trusted Proxies:**

- Only trust X-Forwarded-For from known proxies (127.0.0.1, Docker networks)
- Direct clients cannot spoof IP via XFF headers

**Bounded Memory:**

- Added `last_seen` timestamp to `RateLimitState`
- TTL eviction: entries not seen in 10 minutes are evicted
- Max key cap: 10,000 unique IP:path combinations
- Eviction runs every 60 seconds (low overhead)

---

### Task 4: CSP Tightening

**Backend:** `backend/app/middleware/security.py`

| Mode | `unsafe-eval` | `connect-src` |
|------|--------------|---------------|
| Debug | Yes | `'self' http://localhost:* https://*` |
| Production | **No** | `'self'` only |

**Frontend:** `frontend/nginx.conf`

- Removed `unsafe-eval` from script-src
- Restricted `connect-src` to `'self' http://backend:*`
- Added `upgrade-insecure-requests`

---

## Configuration Reference

**Production docker-compose.prod.yml vars:**

```yaml
- DEBUG=false
- WEBHOOK_SECRET=${WEBHOOK_SECRET:?required}  # Code enforces at runtime
- ENABLE_SCHEDULER=${ENABLE_SCHEDULER:-false}  # Set true on one instance
```

## Verification

- [x] Backend files compile (py_compile)
- [ ] Manual: webhook rejects when DEBUG=false and secret empty
- [ ] Manual: only one scheduler runs with multi-worker
- [ ] Manual: XFF spoofing blocked from untrusted sources
- [ ] Manual: app works with tighter CSP (browser console check)
