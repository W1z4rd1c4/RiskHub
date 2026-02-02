# 18-10 — External signals (optional integrations) — Summary

## What Shipped

- Connector abstraction for external vendor signals.
- Storage model for signal snapshots with timestamps + failure states (`VendorExternalSignal`).
- MVP “public registry” connector using a configurable base URL (optional; safe-by-default).
- Vendor Signals API + Vendor detail “Signals” tab with manual refresh.
- Daily scheduler job to refresh signals for vendors with `registration_id` (skips when not configured).

## API

- `GET /vendors/{id}/signals`
- `POST /vendors/{id}/signals/refresh`

## Configuration

- `VENDOR_SIGNALS_PUBLIC_REGISTRY_BASE_URL` (when unset, refresh stores an error signal instead of failing the system)

## Tests

- Connector tests verify both “not configured → error signal” and “configured → OK signal” with mocked HTTP.

