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
