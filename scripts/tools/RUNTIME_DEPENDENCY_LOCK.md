# Native Alpine runtime dependency locks

## Status and scope

The production Dockerfile consumes the committed native runtime/DB-task locks
with forced, wheel-only, hash-enforced installs. These inputs and the Docker
cutover come from the successful hosted native run recorded below. **T4 delivery
remains pending independent review and final activated-head CI**, including a
fresh native comparison, startup and both production image security checks.
The workflow continues to generate and verify candidates without publishing them.
The platform-independent pip 26.2.1 resolver wheel remains pinned to its reviewed
official-PyPI hash, and CI verifies its downloaded bytes before executing it.

This work deliberately leaves the human-owned requirements, development lock,
audit mirror, development refresh generator, and open draft #291 unchanged.
Dependabot #283's unrelated upgrades are not included. The existing version and
security pins constrain every candidate, including protobuf 6.33.6 and bcrypt
4.1.3. A newly required package absent from the baseline fails for explicit review.
The development lock is passed only as constraints; test/security tools are never
installed into the runtime graph.

## Imported candidate provenance

- Source commit: `9d00a84a96c63c69bbfa7d9523377e196e536d75`
- Source tree: `62faa3f2614d9ad986c8048ad2aee7b84c103d5f`
- Successful native run: [38629308859](https://github.com/W1z4rd1c4/RiskHub/actions/runs/38629308859)
- Artifact: [11925072378](https://github.com/W1z4rd1c4/RiskHub/actions/runs/38629308859/artifacts/11925072378),
  `runtime-lock-candidate-9d00a84a96c63c69bbfa7d9523377e196e536d75`
- Artifact ZIP SHA256, matched to GitHub's recorded digest:
  `45a6ee9c8ba92f83ac42a9c4a9a92a2bf4d58e4a9b3b1dd3b7b5c946a678b79c`
- Generator SHA256:
  `c10aba93d4bd57e9a5cfa6b42c3c87bc4ebf4b3d706fef4dfe2151e7d2fae155`
- Resolver image ID:
  `sha256:5a655e3c7b09cc8de7ff31e8517cdef8e63f1d333d2eff266ee30cbd6900811c`

Both resolutions produced byte-identical manifests and locks. The runtime lane
contains 61 packages; DB tasks contain the identical runtime graph plus
`psycopg2-binary` (62 packages). The separate pip bootstrap contains one package
and matches the reviewed hash. Both lanes passed two clean forced hash installs,
`pip check`, candidate image builds, native imports and exact package inventories
with pip absent from production. Offline provenance/closure validation and the
downloaded artifact digest check passed before import. Only the four generated
`first/` inputs and `Dockerfile.candidate` were imported as dependency/build
inputs. These generation results do not certify the final activated source tree.
The subsequent platform repair adds a fail-fast target guard in `builder-base`,
outside the renderer's install-block replacement. The four generated inputs
remain byte-identical to the original artifact; final CI must compare the
guarded production Dockerfile with its freshly rendered candidate.

## Canonical target and commands

Generation and install verification require native CPython **3.13.16**, **Alpine
3.24**, **musl**, **linux/amd64**, and pip **26.2.1** in the digest-pinned Python
image already used by `backend/Dockerfile`. The current release workflows build
on amd64 Ubuntu runners without a multi-platform matrix. This lock makes no
claim about arm64, Windows, macOS, or the separate glibc Linux release bundle.
Those platforms need their own resolution, artifact hashes, and install evidence.

Public Docker Compose selects `linux/amd64` for bootstrap, backend and scheduler
build/run operations. Production backend pull/run commands and release builds
also select it explicitly. ARM hosts, including Apple Silicon Docker Desktop,
must provide amd64 emulation for this profile; PostgreSQL, Redis and frontend
services retain native platform selection. Direct backend Docker builds require
`--platform linux/amd64` and fail before package installation for another target.
The hosted ARM compatibility job exercises the amd64 locked images and canonical
demo under emulation. It does not generate or certify native ARM dependency locks.

The `Python Runtime Lock` workflow handles the expensive steps in CI:

1. Build the existing production `builder-base` stage, retaining OS security pins
2. Force-reinstall the resolver from the committed hash-enforced bootstrap pin,
   then resolve runtime, DB tasks, and the pip bootstrap independently, twice
3. Require byte-identical canonical locks and provenance across both resolutions
4. Install each production lane into two clean temporary environments with
   `--force-reinstall --require-hashes --only-binary=:all:` and run `pip check`
5. Compare the exact installed package inventory with the expected reachable graph
6. Build both production targets using a generated candidate Dockerfile that
   mandates hash enforcement, including the pinned pip bootstrap
7. Check native imports and exact production inventories, including pip removal
8. Upload candidate files, verified source commit/tree, event commit/name,
   resolver image ID, run URL, and logs

Pull-request runs explicitly check out and verify the PR head SHA before any
candidate work. The artifact name uses that same SHA; provenance records the
event SHA separately because a pull-request event normally identifies GitHub's
synthetic merge commit. Before this workflow exists on the default branch, use
the PR's `opened` or `synchronize` trigger to generate candidates;
[`workflow_dispatch` requires the workflow file on the default branch](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch).

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
The generated pip lane must match the independently reviewed bootstrap hash.
All hashed installs force artifact consumption, even when the same version is
already supplied by ensurepip or the base image; pip otherwise skips hash checks
for already-satisfied requirements.

## Reviewing and activating a successful candidate

Use a successful workflow for the exact source commit being reviewed. Confirm
both clean-install repetitions, both image builds, and both smoke checks passed.
Inspect the package/version diff, PyPI wheel names and SHA256 values in the
manifest, complete extras graph, and the recorded source/image provenance.

Copy the artifact's `first/` directory to
`backend/locks/cpython313-alpine324-x86_64/` and replace `backend/Dockerfile` with
its `Dockerfile.candidate` in the same reviewed change. Run offline validation and
CI again against that commit before approval. The workflow compares committed
locks byte-for-byte against a fresh native resolution after activation and
requires the committed production Dockerfile to equal the hash-enforced candidate.
Only the authored directory `README.md` is excluded from that comparison; all
four generated inputs and any other unexpected files remain checked.
That equality gate prevents a secure rewritten candidate from hiding a hash
bypass in the real production install flow. Before generated files are copied
into the checkout, an activation preflight requires the committed lock directory
and valid provenance whenever production references a lock. Deleting that directory
cannot silently return an activated build to initial-generation mode. Candidate
artifacts from a failed check are available only for diagnosis and reviewed repair.
Do not commit the redundant `second/` directory or verification logs as dependency inputs.
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
python3 scripts/tools/runtime_dependency_lock.py validate
python3 scripts/tools/runtime_dependency_lock.py preflight
```

These tests use synthetic report/hash fixtures, including an offline real-pip
same-version/wrong-hash dry run. They prove rejection and rendering behavior, not production resolution, artifact availability, or image
compatibility. Dependency installs, Docker builds and full suites run in hosted CI.

References: [pip installation reports](https://pip.pypa.io/en/stable/reference/installation-report/)
and [hash-enforced wheel-only installs](https://pip.pypa.io/en/stable/topics/secure-installs/).
