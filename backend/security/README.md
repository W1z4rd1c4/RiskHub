# Container runtime security

The backend builder, runtime and DB-task targets use the official
`python:3.13.18-alpine3.24` image, pinned to multi-platform manifest digest
`sha256:9ef1a599f863231c3d91e941389bfdc4a2d6070557243d54df1a4e57015b960e`. The official image was pulled and verified
on November 13, 2026, before regenerating the native Alpine locks.

## Fixed upstream releases

- CPython 3.13.18 rejects compromised eMudhra intermediate CA keys
  (CVE-2026-115557). See the
  [Python release](https://www.python.org/downloads/release/python-31318/).
- dnspython 2.9.0 bounds DNS name decompression work (CVE-2026-114605).
  Both production lanes and the development/audit lock use that reviewed version.
- CPython 3.13.16 fixes CVE-2026-82049 (tarfile hard-link-to-symlink extraction),
  CVE-2026-19445 (SNI callback context lifetime), and CVE-2026-19553 (missing
  hostname validation in `SSLContext.wrap_bio`). See the
  [Python release](https://www.python.org/downloads/release/python-31316/),
  [versioned release notes](https://github.com/python/cpython/blob/v3.13.16/Misc/NEWS.d/3.13.16.rst)
  and [official image source](https://github.com/docker-library/python/blob/d2a898cb88e46203577eabc62cdcf6e92aaee176/3.13/alpine3.24/Dockerfile).
- Alpine 3.24's `zlib 1.3.2-r1` fixes CVE-2026-85091. The
  [Alpine security database](https://secdb.alpinelinux.org/v3.24/main.json) and
  [package recipe](https://gitlab.alpinelinux.org/alpine/aports/-/blob/0afa2da0e8c8051c6f8f64a7a388e5a259904245/main/zlib/APKBUILD)
  record that fix. Every image lane requires `zlib>=1.3.2-r1` through `apk`, so
  an unavailable fixed package fails construction. This is necessary because
  the pinned Python base predates the October 6 Alpine package update.

## Build-time regression checks

Both final targets execute `verify_runtime_security.py`. It requires the fixed
Python 3.13 release and checks:

- Missing and empty TLS verification hostnames raise `ValueError`, while a
  supplied hostname is accepted
- An SNI callback can switch context, release the original application reference
  and raise without use-after-free; the expected callback error is observed
- Both `data` and `tar` extraction filters keep outside-file contents private
- CPython and the normal `libz.so.1` soname load the same library, with a
  compression/decompression round trip

Alpine backports the zlib fix without changing its upstream runtime version
string (`1.3.2`); the package revision is enforced by the Dockerfile, not inferred
from `zlibVersion()`.

## PostgreSQL-only production images

The runtime and DB-task images omit the unused SQLite Python modules and Alpine
`sqlite-libs` package. Alpine 3.24 still supplied SQLite 3.53.4-r0 on November 13,
2026, with unresolved HIGH findings CVE-2026-119373, CVE-2026-119374,
CVE-2026-119379 and CVE-2026-119586. RiskHub's container deployment uses PostgreSQL;
SQLite remains available to the separate development/test and lock-resolution
environments.

The removal helper preserves every other dependency from the official Python
image's virtual runtime package, then uninstalls that package through `apk`.
Image construction fails if SQLite modules, binaries or the package remain.
The PostgreSQL deployment, migration and onboarding checks must pass on both
production lanes. No scanner exception is added.

## Retired source overlays

The temporary Python `tarfile.py` edit and custom zlib shared-object overlay
were removed after these official fixes became available. Both exact scanner
exceptions were removed before their October 10 review deadline. The active
Grype policy is `ignore: []`; no expiry was extended. All HIGH/CRITICAL findings
remain blocking. Rebuild and scan both runtime and DB-task images before release.

Do not run `apk upgrade` inside a deployed container: deploy a rebuilt,
rescanned immutable image instead. `pip-audit-allowlist.txt` remains the separate
Python-package audit policy.
