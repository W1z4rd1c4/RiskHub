# scripts/tools

## Purpose

Folder for `scripts/tools` implementation assets.

## Contents

- `docs_tree_audit.py`
- `readme_coverage.py`
- `structure_metrics_guard.py` — reports the fixed declared Git-index inventory in stdout and JSON; rejects stale numeric claims, invalid/duplicate inventory declarations and inconsistent topology dates
- `suppression_budget.py`
- `probe_python_tooling.py` - explicit PostgreSQL plugin, Filelock and virtualenv compatibility probes

## Python tooling compatibility probes

After installing the canonical development requirements on Python 3.13, run from
the repository root against a disposable PostgreSQL 14+ server. The database user
must be able to create databases. Supply that server's host, port and user through
pytest-postgresql's options; if required, supply its password through `PGPASSWORD`.
The probe creates and removes randomly named `riskhub_tooling_*` databases and
templates. It does not start a service or use the application's database name.

```bash
RISKHUB_TOOLING_PROBE_POSTGRES=1 python -m pytest \
  -c backend/pytest.ini scripts/tools/probe_python_tooling.py -o addopts='' \
  --postgresql-host=127.0.0.1 --postgresql-port=55432 \
  --postgresql-user=riskhub_tooling_probe -q
```

Expect four passing cases: two tests receive independent databases seeded by the
v9 keyword-only loader with `autocommit=True`; Filelock excludes another process
and releases the file; and the retained virtualenv creates a Python 3.13
environment with the installed Filelock. Without the PostgreSQL opt-in, those two
cases are reported as skipped; that is not PostgreSQL compatibility evidence.
The probe does not replace the application's migration/snapshot tests or full
backend suites. Save its stdout alongside the tested commit and installed versions.

## Notes

Legacy PDF helper scripts were retired from tracked source because they were broken placeholder utilities, not part of the supported toolchain.
Keep this README updated when responsibilities or structure in this folder change.
