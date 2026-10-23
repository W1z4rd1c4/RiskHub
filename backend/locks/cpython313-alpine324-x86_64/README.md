# CPython 3.13 / Alpine 3.24 amd64 locks

The four generated inputs are `manifest.json`, `requirements-runtime.lock`,
`requirements-dbtasks.lock` and `requirements-pip.lock`. They target CPython
3.13.16 on Alpine 3.24, musl and linux/amd64; regenerate them through hosted CI.

The [canonical lock contract](../../../scripts/tools/RUNTIME_DEPENDENCY_LOCK.md)
records the imported artifact and verification requirements. CI compares every
generated input byte-for-byte with fresh native output. This README is the sole
documentation exception to that directory comparison.

## Security refresh: 2026-10-23

The current generated inputs include certifi 2026.10.19 (compromised emSign
root removal) and the coherent OpenTelemetry 1.45.1 / 0.66b1 family
(tracestate parser denial of service fix). Existing runtime pins outside this
bounded security batch remain unchanged. The new OpenTelemetry exporter requires
two additional upstream packages: `opentelemetry-exporter-http-transport` and
`opentelemetry-exporter-otlp-common`.

This refresh was generated twice on the exact pinned CPython 3.13.16 / Alpine
3.24 / musl / linux/amd64 platform. The outputs were byte-identical, and both
production lanes passed two clean, wheel-only, hash-enforced installs, `pip check`
and exact package inventory verification. The runtime graph contains 63 packages;
DB tasks add only `psycopg2-binary` (64 packages). The separately hashed pip
bootstrap now uses pip 26.2.2, whose vendored certifi bundle also excludes the
compromised emSign ECC Root CA - G3. The native generator checks this independent
trust store before resolution and after every clean installation. The generated
Dockerfile matches the committed Dockerfile byte-for-byte. Hosted CI must repeat
validation against the final commit before merge.
