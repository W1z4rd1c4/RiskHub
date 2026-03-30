# scripts/release

## Purpose

Release packaging helpers for supported production distribution artifacts.

## Contents

- `build_linux_bundle.sh`: stages the Linux release bundle as a repo-shaped mini checkout with `backend/`, frontend `dist`, bundled `scripts/deploy.sh`, the full `scripts/deploy/` tree, and the shared Python wheelhouse

## Notes

- The Linux bundle layout now keeps one backend lane:
  - `backend/` for runtime code, Alembic assets, bootstrap scripts, and requirements
  - `scripts/deploy.sh` plus `scripts/deploy/` so operators can run the bundled deploy CLI from the extracted artifact
  - shared wheels used to create one `venv` during install
- Keep this README updated when responsibilities or structure in this folder change.
