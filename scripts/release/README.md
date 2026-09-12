# scripts/release

## Purpose

Release packaging helpers for supported production distribution artifacts.

## Contents

- `build_linux_bundle.sh`: stages the Linux release bundle with `backend/`, `backend_db/`, frontend `dist`, deploy templates, and the shared Python wheelhouse

## Notes

- The Linux bundle layout now mirrors the Wave 2 split:
  - `backend/` for the runtime lane
  - `backend_db/` for DB/bootstrap tasks
  - shared wheels used to create `venv` and `db-venv` during install
- Keep this README updated when responsibilities or structure in this folder change.

## Identity DB tasks

Release DB artifacts include the operator-only `scripts.identity_installation` module.
Fresh bootstrap initializes/verifies an empty installation before Entra users are
created. Populated unbound installations require explicit maintenance adoption;
managed upgrades stop API/scheduler writers before migrations. Follow
[identity foundations](../../docs/security/identity-foundations.md) for adoption, failure recovery and replica draining.
Native identity selection remains staged work; preserve production admission checks.
