# backend/app/services/_admin_telemetry

## Purpose

Internal projection helpers for admin operations telemetry.

## Contents

- `projections.py` - scheduler/outbox/session/log payload serialization helpers.

## Notes

Admin routes remain responsible for platform-admin guards. This package should only shape already-authorized operational telemetry payloads.
