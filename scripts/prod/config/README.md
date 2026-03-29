# Legacy Docker Runtime Env Templates

This directory is maintained only for the internal Docker executor behind `./scripts/deploy.sh --target docker`.

- `backend.env.example` documents the rendered backend runtime contract.
- `frontend.env.example` documents the rendered frontend runtime contract.

Public production setup no longer asks operators to edit these files directly. Use:

- `scripts/deploy/templates/riskhub.env.example` for `/etc/riskhub/riskhub.env`
- `scripts/deploy/templates/secrets/README.md` plus the matching `*.example` files for `/etc/riskhub/secrets/*`
- `./scripts/deploy.sh install --target docker ...`
- `./scripts/deploy.sh doctor --target docker ...`

Key rules for the internal Docker runtime contract:

- PostgreSQL stays external.
- `backend.env` must contain non-secret settings plus `*_FILE` references only.
- Raw secret values live under `/etc/riskhub/secrets` and derived runtime files under `/etc/riskhub/runtime`.
- Runtime env may use `ENTRA_CLIENT_SECRET_FILE` or the certificate pair `ENTRA_CLIENT_CERTIFICATE_THUMBPRINT` + `ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE`.
- Redis uses a dedicated wrapper image and reads its password from a mounted secret file.
