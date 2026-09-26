# Container security backports

The pinned Python 3.13.15 / Alpine 3.24 image requires two upstream corrections
reported by the September 26, 2026 container scan. Both runtime and DB-task images
apply the same fixes. These are source corrections, not acceptance of vulnerable
runtime behavior. Grype's package metadata cannot identify these corrections, so
exact package/CVE/match rules expire on October 10, 2026.

- CPython CVE-2026-82049: apply the one-line Python 3.13 upstream fix from
  [b8f23e3](https://github.com/python/cpython/commit/b8f23e307097552eaea2604383a12ab280520d0d).
  The patch requires the exact Python version and one expected source occurrence.
  Every final image executes the hard-link-to-symlink archive regression with both
  `data` and `tar` filters. External contents must remain outside the extracted tree.
- zlib CVE-2026-85091: build upstream commit
  [d81c2d7](https://github.com/madler/zlib/commit/d81c2d7eb705c62294ba03299255672078e89115),
  which includes [df84af2](https://github.com/madler/zlib/commit/df84af25dc1942490e1d1c899a07619152a46148)
  and subsequent return/blocked-write corrections. Docker verifies the archive's
  SHA-256 before compiling. `make check` must pass. Only the fixed shared object
  and its license enter the final image; compiler/source stay in the build stage.
  CPython and a direct system-soname load must both report `1.3.2.1-motley`.

Alpine's installed-package record remains `zlib 1.3.2-r0`; the overlay is explicitly
recorded here and in the Dockerfile. Rebuilding with another base/package layout
requires re-evaluating the overlay. Do not run `apk upgrade` inside a deployed
container: deploy a rebuilt, rescanned immutable image instead.

Retire each overlay and its exact scanner rule as soon as its official fixed
package is available. Any version mismatch, failed regression, expired rule, or
additional vulnerability blocks the build/release. The scanner still records its
ignored matches for audit; unrelated HIGH/CRITICAL findings remain blocking.

`pip-audit-allowlist.txt` remains the separate Python-package audit policy.
