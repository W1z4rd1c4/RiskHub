# backend/app/middleware/rate_limit

## Purpose

Split the rate-limit boundary into policy, backend, response, and wrapper concerns.

## Contents

- `policy.py`
  - Default rules, settings merge, and deterministic path matching.
- `backend.py`
  - Redis sliding-window backend plus bounded in-memory fallback state.
- `responses.py`
  - Shared 429/503 response payloads.
- `middleware.py`
  - Thin Starlette middleware wrapper.

## Notes

- `app.middleware.rate_limit.RateLimitMiddleware` is the canonical import surface.
- Every rate-limited request consumes a per-client aggregate allowance and a canonical endpoint-family allowance.
- Configured prefixes are route buckets; unmatched paths share one default bucket, and Redis hashes bucket names.
- The in-memory backend is a bounded fallback for Redis outages, not a distributed equivalent to the Redis limiter.
- Preserve existing production/runtime contract behavior documented in rate-limit tests before changing module boundaries.
