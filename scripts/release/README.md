# scripts/release

## Purpose

Release packaging helpers for supported production distribution artifacts.

## Contents

- `build_linux_bundle.sh`: stages the Linux release bundle with `backend/`, frontend `dist`, deploy templates, and the shared Python wheelhouse

## Notes

- The Linux bundle layout now keeps one backend lane:
  - `backend/` for runtime code, Alembic assets, bootstrap scripts, and requirements
  - shared wheels used to create one `venv` during install
- Keep this README updated when responsibilities or structure in this folder change.
