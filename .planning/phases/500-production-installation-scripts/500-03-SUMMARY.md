# Plan 500-03 Summary: Frontend Install (No Nginx Templating)

## Completed: 2026-02-16

### Scope Delivered

- Added a frontend installer that:
  - attaches the container to `riskhub-network`,
  - publishes only `FRONTEND_HOST_PORT` on the host,
  - relies on the Docker network alias `backend` for `/api/*` proxying (no nginx.conf templating required).

### Files Changed

| File | Change |
|------|--------|
| `scripts/prod/install_frontend.sh` | NEW |
| `frontend/nginx.conf` | (no change; upstream remains `http://backend:8000`) |

### Verification

- `bash -n scripts/prod/install_frontend.sh` → success

### Outcome

Frontend deployment remains deterministic and same-host-friendly: backend traffic stays internal to the Docker network and is routed via `proxy_pass http://backend:8000;`.

