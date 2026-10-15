# CPython 3.13 / Alpine 3.24 amd64 locks

The four generated inputs are `manifest.json`, `requirements-runtime.lock`,
`requirements-dbtasks.lock` and `requirements-pip.lock`. They target CPython
3.13.16 on Alpine 3.24, musl and linux/amd64; regenerate them through hosted CI.

The [canonical lock contract](../../../scripts/tools/RUNTIME_DEPENDENCY_LOCK.md)
records the imported artifact and verification requirements. CI compares every
generated input byte-for-byte with fresh native output. This README is the sole
documentation exception to that directory comparison.
