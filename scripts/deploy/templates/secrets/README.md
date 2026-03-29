# Deployment Secret File Examples

Use these files as the starting layout for `/etc/riskhub/secrets/`.

Copy the example that matches each required secret to the same filename without the `.example` suffix:

- `database_url.example` -> `/etc/riskhub/secrets/database_url`
- `secret_key.example` -> `/etc/riskhub/secrets/secret_key`
- `redis_password.example` -> `/etc/riskhub/secrets/redis_password`

Choose one Entra confidential credential mode:

- client secret mode:
  - `entra_client_secret.example` -> `/etc/riskhub/secrets/entra_client_secret`
- certificate mode:
  - `entra_client_certificate_private_key.example` -> `/etc/riskhub/secrets/entra_client_certificate_private_key`
  - set `ENTRA_CLIENT_CERTIFICATE_THUMBPRINT` in `/etc/riskhub/riskhub.env`

Rules:

- Do not keep the `.example` suffix in `/etc/riskhub/secrets/`.
- Replace every placeholder before `install`, `upgrade`, or `doctor`.
- Store PEM material only in `entra_client_certificate_private_key`, never in `riskhub.env`.
- `database_url`, `secret_key`, and `redis_password` are always required.
- The unused Entra file may be absent.
- If both Entra files are present, certificate mode is preferred when `ENTRA_CLIENT_CERTIFICATE_THUMBPRINT` is set in `/etc/riskhub/riskhub.env`.
- Keep production secret files at `0440` and `/etc/riskhub/secrets/` at `0750`, ideally owned by `root:riskhub`.
