# Frontend nginx security headers

## Ownership

`security-headers.conf` owns the shared response-security header policy for the
frontend container. [The nginx configuration](../nginx.conf) includes it at HTTP
scope and in the static-asset location, whose local `add_header Cache-Control`
otherwise replaces inherited headers. Any new location with its own `add_header`
must include this snippet too. Keep `always` on security headers so error responses
remain protected. The health location uses `default_type` and inherits the HTTP
policy without introducing another `add_header`.

[The Dockerfile](../Dockerfile) installs the snippet at
`/etc/nginx/snippets/security-headers.conf`. This explicit include approach works
with the pinned runtime image without newer nginx inheritance directives. Native
Linux deployment templates remain separately owned under `scripts/deploy/`.

## Verification

[Frontend nginx Security CI](../../.github/workflows/frontend-nginx-security.yml)
builds the production frontend image and runs
[the response verifier](../../scripts/security/verify_frontend_nginx.py). It checks
nginx configuration, HTML/SPA, JS/CSS caching, HEAD/304, missing assets, health and
hidden-file denial, retaining configuration and response evidence.

To run against an already-built image from the repository root:

```sh
python3 scripts/security/verify_frontend_nginx.py --image riskhub-frontend:headers
```

See the [testing guide](../../docs/TESTING.md) for the broader CI matrix.
