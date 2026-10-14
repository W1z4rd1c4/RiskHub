# Native Alpine runtime dependency locks

## Status and scope

The runtime/DB-task lock workflow is a candidate-generation gate. **T4 remains
open until its exact generated files and the verified Docker cutover are reviewed
and committed.** No hashes or platform-resolution results are checked in by this
preparation change. The production Dockerfile still uses the existing install
flow until that evidence exists; the workflow creates a separate, hash-enforced
candidate Dockerfile and builds both production targets without publishing them.

This work deliberately leaves the human-owned requirements, development lock,
audit mirror, development refresh generator, and open draft #291 unchanged.
Dependabot #283's unrelated upgrades are not included. The existing version and
security pins constrain every candidate, including protobuf 6.33.6 and bcrypt
4.1.3. A newly required package absent from the baseline fails for explicit review.
The development lock is passed only as constraints; test/security tools are never
installed into the runtime graph.

## Canonical target and commands

Generation and install verification require native CPython **3.13.16**, **Alpine
3.24**, **musl**, **linux/amd64**, and pip **26.2.1** in the digest-pinned Python
image already used by `backend/Dockerfile`. The current release workflows build
on amd64 Ubuntu runners without a multi-platform matrix. This lock makes no
claim about arm64, Windows, macOS, or the separate glibc Linux release bundle.
Those platforms need their own resolution, artifact hashes, and install evidence.

The `Python Runtime Lock` workflow handles the expensive steps in CI:

1. Build the existing production `builder-base` stage, retaining OS security pins
2. Resolve runtime, DB tasks, and the pip bootstrap independently, twice
3. Require byte-identical canonical locks and provenance across both resolutions
4. Install each production lane into two clean temporary environments with
   `--require-hashes --only-binary=:all:` and run `pip check`
5. Compare the exact installed package inventory with the expected reachable graph
6. Build both production targets using a generated candidate Dockerfile that
   mandates hash enforcement, including the pinned pip bootstrap
7. Check native imports and exact production inventories, including pip removal
8. Upload candidate files, source commit, resolver image ID, run URL, and logs

There is no source-distribution fallback. Missing compatible wheels, resolver
conflicts, newly introduced packages, changed retained pins, mismatched hashes,
stale inputs, or failed imports block the candidate. Do not relax the checks or
upgrade packages just to make this pass; report the exact missing wheel or pin
and review a separate bounded change. A failed run's partial artifact is diagnostic
evidence only and must not be imported as a valid lock.

Commands inside the supported environment:

```sh
python scripts/tools/runtime_dependency_lock.py generate --lock-dir /tmp/locks
python scripts/tools/runtime_dependency_lock.py validate --lock-dir /tmp/locks
python scripts/tools/runtime_dependency_lock.py verify --lock-dir /tmp/locks
python scripts/tools/runtime_dependency_lock.py dockerfile --lock-dir /tmp/locks --output /tmp/Dockerfile.candidate
```

Validation is offline and can run on other platforms. It checks the requirements
and baseline fingerprints, generator fingerprint, Docker image identity, platform
markers, exact pins, extras-aware transitive closure, no unreachable dev packages,
canonical hashes, and the identical runtime subset within the DB-task graph.
Generation and verification fail before package access on the wrong platform.

## Reviewing and activating a successful candidate

Use a successful workflow for the exact source commit being reviewed. Confirm
both clean-install repetitions, both image builds, and both smoke checks passed.
Inspect the package/version diff, PyPI wheel names and SHA256 values in the
manifest, complete extras graph, and the recorded source/image provenance.

Copy the artifact's `first/` directory to
`backend/locks/cpython313-alpine324-x86_64/` and replace `backend/Dockerfile` with
its `Dockerfile.candidate` in the same reviewed change. Run offline validation and
CI again against that commit before approval. The workflow compares committed
locks byte-for-byte against a fresh native resolution after activation. Do not
commit the redundant `second/` directory or verification logs as dependency inputs.
Never replace a missing/stale lock with an unlocked resolver fallback.

The cutover only replaces the two builder install blocks. It preserves pinned
base images, OS security checks, image users, runtime contents, and pip removal.
Every runtime/DB-task dependency is pinned and hashed; bootstrap tooling remains
outside the final production image. This gives Python artifact reproducibility,
not complete image reproducibility: `apk upgrade` and OS package repositories
still change independently and require the existing vulnerability/image checks.

## Focused local regression checks

```sh
python3 -m unittest discover -s scripts/tools/tests -p test_runtime_dependency_lock.py -v
python3 scripts/tools/validate_python_dependency_lock.py
```

These tests use synthetic report/hash fixtures only; they prove rejection and
rendering behavior, not production resolution, artifact availability, or image
compatibility. No local dependency installs, Docker builds, or full suites are
needed for this preparation change.

References: [pip installation reports](https://pip.pypa.io/en/stable/reference/installation-report/)
and [hash-enforced wheel-only installs](https://pip.pypa.io/en/stable/topics/secure-installs/).
