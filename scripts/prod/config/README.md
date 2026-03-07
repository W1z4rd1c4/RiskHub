# Legacy Docker Runtime Env Templates

This directory is maintained only for the internal Docker executor behind `./scripts/deploy.sh --target docker`.

- `backend.env.example` documents the rendered backend runtime contract.
- `frontend.env.example` documents the rendered frontend runtime contract.

Public production setup no longer asks operators to edit these files directly. Use:

```bash
./scripts/deploy.sh init --target docker
./scripts/deploy.sh secrets-edit --target docker
```

Key rules for the internal Docker runtime contract:

- PostgreSQL stays external.
- `backend.env` must contain non-secret settings plus `*_FILE` references only.
- Raw secret values live under `/etc/riskhub/secrets` and derived runtime files under `/etc/riskhub/runtime`.
- Redis uses a dedicated wrapper image and reads its password from a mounted secret file.
