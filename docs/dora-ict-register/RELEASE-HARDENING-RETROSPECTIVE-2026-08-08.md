# Release-hardening retrospective — commit `2425ecbe` (#108)

Retrospective, auditable record required by remediation spec #98 and ticket #108.
It documents the true scope of release-evidence commit `2425ecbe`, records the
original four security acceptances with their **release-level** accepting owner,
and records the five refuted review findings as checked-and-cleared. One npm
acceptance has since been resolved; three Grype acceptances remain open. No
history is rewritten.

## 1. Commit identity

| Item | Value |
|---|---|
| Commit | `2425ecbeb1f6565e8a177adb87a4dad730cde072` (branch `dora`) |
| Subject | `docs(dora): reconcile automated release evidence` |
| Author / date | W1z4rd1c4, 2026-08-04 13:56:34 +0200 |
| Size | 71 files changed, 12 207 insertions(+), 825 deletions(-) (`git show 2425ecbe --stat`) |

## 2. True scope (retrospective correction of the `docs()` label)

The commit was labeled `docs(dora)` but was predominantly release-parity and
prod-readiness audit tooling, tests, security-policy changes, and backend
application code. Actual documentation was roughly 100 of the 12 207 inserted
lines. Grouped from `git show 2425ecbe --numstat`:

| File group | Files | Insertions | Deletions |
|---|---:|---:|---:|
| Release-parity audit tooling (`scripts/security/release_parity_audit/`, e.g. `decision.py` +1199, `fingerprints.py` +836) | 12 | 2 665 | 213 |
| Prod-readiness audit tooling (`scripts/security/prod_readiness_audit/`, incl. new `grype_policy.py`, `npm_audit_policy.py`, `npm-audit-policy.json`) | 10 | 1 166 | 113 |
| Backend tests + frontend tests/E2E (e.g. `tests/backend/pytest/test_release_parity_audit.py` +4865; new grype/npm policy contract tests) | 18 | 7 806 | 381 |
| Deploy + prod scripts (`scripts/deploy/`, `scripts/prod/`, e.g. `render.py`) | 12 | 213 | 47 |
| Backend application code (`notification_visibility.py`, `_approval_queue/vendor.py`, `_governed_mutations/asset_identity.py`) | 3 | 81 | 9 |
| Backend dependencies (`requirements-runtime.txt`; new `requirements-prod-readiness-audit-constraints.txt`) | 2 | 123 | 2 |
| Security policy — Grype suppressions (`backend/security/grype-ignore.yaml`) | 1 | 14 | 3 |
| Documentation (`docs/`, 8 files) + `.planning/codebase/STRUCTURE.md` | 9 | 100 | 29 |
| Frontend code + lockfile, CI workflow, `scripts/Makefile` | 4 | 39 | 28 |

Per spec #98 ("Traceability"), this oversized `docs()`-labeled commit is **not
rewritten**; this record is the retrospective correction. Every later
remediation commit references a tracker ticket instead.

## 3. Security acceptances — release-level ownership

Commit `2425ecbe` introduced or carried four time-bound security acceptances,
originally **all expiring 2026-09-30**. The policy files name *team* owners;
release-level acceptance was previously unrecorded. It is recorded here:

> **Release-acceptance owner for all four original acceptances: W1z4rd1c4** — accepted in
> the grilling session of 2026-08-06 that produced spec #98. This is distinct
> from the team owners named inside the policy files (`Owner: Platform`,
> `"owner": "Frontend Platform"`). Expiry follow-up is tracked as ticket #112
> (due 2026-09-30).

| Identity | Policy location | Team owner (in file) | Original evidence summary | Original expiry |
|---|---|---|---|---|
| npm advisory **GHSA-qwww-vcr4-c8h2** (high; `react-router`/`react-router-dom`) | `scripts/security/prod_readiness_audit/npm-audit-policy.json` | Frontend Platform | React Router RSC-mode CSRF advisory. Reachability: RiskHub uses client-side `BrowserRouter` only (no RSC routes/server actions). No compatible fixed `react-router-dom` 7.x exists (fix is `react-router` >= 8.3.0). Exit: upgrade to the first compatible release on react-router >= 8.3.0. | 2026-09-30 |
| **CVE-2026-15308** (High; `python` 3.13.14 binary, `/usr/local/bin/python3.13`) | `backend/security/grype-ignore.yaml` | Platform | stdlib `html.parser` incremental-feed CPU DoS (gh-153030). No released fixed python:3.13 base image (backport merged after v3.13.14). Reachability: no `html.parser`/`HTMLParser` use in `backend/app` or `backend/scripts`. Exit: bump base image to first fixed 3.13-alpine. | 2026-09-30 |
| **CVE-2026-11940** (`python` 3.13.14) | `backend/security/grype-ignore.yaml` | Platform | stdlib `tarfile.extractall` hardlink/symlink filter bypass (gh-151558). 3.13 backport not in any released tag. Reachability: no `tarfile` use in `backend/app` or `backend/scripts`. Exit: bump base image once 3.13.15+ is released. | 2026-09-30 |
| **CVE-2026-11972** (`python` 3.13.14) | `backend/security/grype-ignore.yaml` | Platform | stdlib `tarfile` streaming-mode EOF DoS (gh-151981). Same no-released-fix and no-`tarfile`-use rationale as CVE-2026-11940. Exit: bump base image once 3.13.15+ is released. | 2026-09-30 |

**Resolved disposition — GHSA-qwww-vcr4-c8h2 (2026-08-09):** A compatible
7.18.2 fix became available, `react-router` and `react-router-dom` were upgraded,
raw `npm audit --audit-level=high` reported zero vulnerabilities, and the npm
policy entry was removed.

Full per-entry evidence (Decision, Scanner evidence, No-fix proof, Reachability,
Exit) for the three remaining Grype acceptances lives in
`backend/security/grype-ignore.yaml`. The npm policy is now explicitly empty.

### Resolved disposition — Python 3.13.15 (2026-08-25)

The governed #112 delivery moved all three backend stages to the official
`python:3.13-alpine` multi-architecture digest
`sha256:540c7d91f98ff6880174c40e99067bf5941eb54d818a7a5e094d188b196a934d`,
whose manifest identifies Python 3.13.15. The immutable-candidate build, runtime,
fresh SBOM, raw Grype scan, and policy-aware scan identities are published with
the release evidence in [issue #112](https://github.com/W1z4rd1c4/RiskHub/issues/112).
That candidate evidence is the authority for removing CVE-2026-15308,
CVE-2026-11940, and CVE-2026-11972 from the live policy; the original acceptance
table above remains the historical record.

The same full-image scan reported CVE-2026-14456 as exact `nvd:cpe`
`cpe-match` findings against `libcrypto3` and `libssl3` 3.5.7-r0. OpenSSL's
[2026-08-13 advisory](https://openssl-library.org/news/secadv/20260813.txt)
states that the fix will ship in OpenSSL 3.5.8 and that no new release was being
issued at that time. RiskHub does not expose an OpenSSL QUIC listener, so
Platform / W1z4rd1c4 accepted only those two exact findings through 2026-09-30.
Their complete evidence and exit instructions live in
`backend/security/grype-ignore.yaml`; removal is tracked separately from #112.

## 4. Refuted review findings — checked and cleared

The `eb7ca6f9` ultracode multi-agent review produced 12 confirmed and 5 refuted
findings. Spec #98 (Out of Scope) closes the refuted five: "checked and
cleared; do not re-open." Recorded here so later reviews do not re-litigate
them. Naming follows #98 verbatim; anchors point at the code each claim was
checked against.

| # | Refuted finding (per #98) | Checked and cleared |
|---|---|---|
| 1 | Department user-count scoping | Department user-count aggregation checked against the department list/detail endpoints and metrics (`backend/app/services/_dashboard_metrics/departments.py`); claimed mis-scoping not present. |
| 2 | High-risk-count base | The `high_risk_count` base checked at its computation site (`backend/app/services/_dashboard_metrics/departments.py`, `func.sum(case((Risk.net_score >= high_threshold, 1), else_=0))`); claimed wrong base refuted. |
| 3 | CISO migration behavior | CISO stewardship/permission migrations checked (`backend/alembic/versions/e6f7a8b9c0d1_add_ciso_threat_stewardship.py`, `h9c0d1e2f3g4_...`, `i0d1e2f3g4h5_...`); claimed migration misbehavior refuted. |
| 4 | The Vendor-contract sync delete | The Vendor-contract synchronization/delete path checked (`frontend/src/services/vendorContractApi.ts`, `backend/app/services/_approval_queue/contracts.py`); claimed unsafe delete refuted. |
| 5 | The ProcessForm event claim | The alleged event-handling defect checked in `frontend/src/pages/processes/ProcessForm.tsx`; claim refuted. |

## 5. Boundaries of this record

- Retrospective and additive only: no history rewriting and no change to
  `backend/security/grype-ignore.yaml`; the npm policy now records that no npm
  advisory is accepted.
- It does not check, satisfy, or modify any human-owned release gate in
  [`FRONTEND-UX-MANUAL-AT-VERIFICATION-2026-07-12.md`](./FRONTEND-UX-MANUAL-AT-VERIFICATION-2026-07-12.md)
  §5 (manual/AT matrix, C6 reproduction, ultrareview, merge decision).
- The external release ledger must cite this record for the resolved npm
  acceptance, the three remaining Grype acceptances, and their release-acceptance
  owner, alongside the exact final release SHA/tree identities it already
  requires.

## References

- Spec: GitHub issue #98 (`[DORA-REM] Remediation spec`, eb7ca6f9 review); ticket #108; expiry follow-up #112.
- Release checklist (human gates): [`FRONTEND-UX-MANUAL-AT-VERIFICATION-2026-07-12.md`](./FRONTEND-UX-MANUAL-AT-VERIFICATION-2026-07-12.md) §5.
- Security scanning standards: [`docs/security/SECURITY.md`](../security/SECURITY.md).
