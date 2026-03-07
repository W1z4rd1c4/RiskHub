# Deprecated External PostgreSQL Install Script Guide

External PostgreSQL remains the only supported production database model, but the operator flow moved to:

- [production.md](./production.md)
- [reference.md](./reference.md)

The old `scripts/prod/*` material is now internal implementation detail behind `./scripts/deploy.sh`.

Retired orchestration wrappers such as `scripts/prod/setup.sh`, `scripts/prod/deploy.sh`, `scripts/prod/upgrade.sh`, and `scripts/prod/stop.sh` must not be used as operator entrypoints.
