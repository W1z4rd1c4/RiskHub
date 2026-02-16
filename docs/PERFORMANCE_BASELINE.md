# Performance Baseline Report

> **Version**: 1.1
> **Last Updated**: 2026-02-16
> **Audience**: Engineering, DevOps, QA
> **Source of Truth**: `backend/tests/test_api_benchmarks.py`, Playwright CI artifacts

This baseline captures practical performance expectations for the current MVP operating profile.

## Target Operating Profile

- Expected users: ~30
- Expected concurrent active sessions: ~10
- Deployment model: containerized backend + frontend with PostgreSQL

## Baseline Targets

| Surface | Target |
|---|---|
| Dashboard summary API | p95 < 1s |
| Core list endpoints (risks/controls/kris/vendors) | p95 < 600ms |
| Standard write operations | p95 < 500ms |
| Login/session checks | p95 < 400ms |

## Regression Signals

Investigate immediately when any of these appear:

- Sustained p95 latency increase > 30% over baseline
- Repeated timeouts in deterministic Playwright packs
- Slow-query logs repeatedly above expected thresholds
- E2E flakiness tied to slow backend responses

## Recommended Checks

- Backend benchmark or targeted timing tests for changed endpoints
- Playwright targeted suites with stable seed data
- DB query profiling for high-latency routes

## Operational Guidance

- Keep instrumentation enabled for API latency and error rates.
- Use targeted packs for fast feedback, then run broader regression before release candidates.
- Track baseline changes explicitly when major features or infrastructure changes land.
