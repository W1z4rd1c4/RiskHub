# Topology Critical Review — Canonical Documentation (2026-02-21 UTC)

## Result

- **Review status:** `FAIL` (critical review gate)
- **Canonical topology automation status:** `PASS`
- **Reason for fail:** material documentation drift and reachability-depth violations were found in canonical topology documentation.

### Gate Outcomes

| Gate | Command | Status | Evidence |
|---|---|---|---|
| Docs contract | `python3 scripts/check_docs_contract.py` | PASS | `/tmp/riskhub-topology-critical-review-20260221-235221/check_docs_contract.log` |
| Canonical docs tree | `python3 scripts/tools/docs_tree_audit.py --scope canonical --output-dir tests/results/docs/topology-critical-review-20260221-235221/docs-tree-canonical` | PASS | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/topology-critical-review-20260221-235221/docs-tree-canonical/docs-tree-audit.json` |
| README coverage | `python3 scripts/tools/readme_coverage.py audit` | PASS | `/tmp/riskhub-topology-critical-review-20260221-235221/readme_coverage_audit.log` |

## Evidence Map

| Claim | Outcome | Evidence |
|---|---|---|
| Canonical unresolved links are zero | PASS | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/topology-critical-review-20260221-235221/docs-tree-canonical/docs-tree-audit.json` (`summary.canonical_unresolved_count=0`) |
| Required entrypoints and cross-links are present | PASS | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/topology-critical-review-20260221-235221/docs-tree-canonical/docs-tree-audit.json` (`summary.entrypoint_missing_count=0`, `summary.crosslink_missing_count=0`) |
| Documented topology commands in `/Users/stefanlesnak/Antigravity/Risk App 2/docs/README.md:40` and `/Users/stefanlesnak/Antigravity/Risk App 2/docs/README.md:43` execute successfully | PASS | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/topology-critical-review-20260221-235221/command-status.json` |
| All numeric claims in `/Users/stefanlesnak/Antigravity/Risk App 2/.planning/codebase/STRUCTURE.md:22` and `/Users/stefanlesnak/Antigravity/Risk App 2/.planning/codebase/STRUCTURE.md:50` match repository reality | FAIL | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/topology-critical-review-20260221-235221/count-metrics.json`, `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/topology-critical-review-20260221-235221/claim-matrix.json` |
| Canonical docs are navigable from roots (`AGENTS.md`, `docs/README.md`, `.planning/README.md`) within 3 hops | FAIL | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/topology-critical-review-20260221-235221/navigability.json` (`unreachable_count=28`) |

## Findings By Severity

### P1

#### F-001 — Quantitative topology drift in `STRUCTURE.md`
- **Summary:** 9/9 numeric claims in `/Users/stefanlesnak/Antigravity/Risk App 2/.planning/codebase/STRUCTURE.md:22` to `/Users/stefanlesnak/Antigravity/Risk App 2/.planning/codebase/STRUCTURE.md:50` are out of date.
- **Impact:** planning, audit, and architecture readers can be misled by obsolete module/test/component counts.
- **Evidence:**
  - `/Users/stefanlesnak/Antigravity/Risk App 2/.planning/codebase/STRUCTURE.md:22`
  - `/Users/stefanlesnak/Antigravity/Risk App 2/.planning/codebase/STRUCTURE.md:50`
  - `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/topology-critical-review-20260221-235221/count-metrics.json`

| Metric | Documented | Observed | Delta |
|---|---:|---:|---:|
| backend endpoint modules (`*.py`) | 166 | 168 | +2 |
| backend model modules (`*.py`) | 36 | 35 | -1 |
| backend schema modules (`*.py`) | 30 | 29 | -1 |
| backend service modules (`*.py`) | 75 | 62 | -13 |
| backend pytest files (all) | 234 | 319 | +85 |
| backend pytest files (`*.py`) | 82 | 107 | +25 |
| frontend pages files (all) | 53 | 36 | -17 |
| frontend components files (all) | 116 | 142 | +26 |
| frontend E2E specs (`*.spec.ts`) | 38 | 42 | +4 |

#### F-003 — Canonical reachability threshold violation (3-hop policy)
- **Summary:** 28 canonical files are unreachable from configured root entrypoints in the current link graph.
- **Impact:** canonical guidance becomes hard to discover through intended entrypoint traversal.
- **Evidence:**
  - `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/topology-critical-review-20260221-235221/navigability.json`
  - `/Users/stefanlesnak/Antigravity/Risk App 2/docs/DOCUMENTATION_TREE.md:5`
- **Examples of unreachable canonical files:**
  - `docs/agent/CODEX_WORKING_RULES.md`
  - `docs/agent/ENDPOINT_INVARIANTS.md`
  - `docs/agent/TIMEZONE_POLICY.md`
  - `docs/AUTHZ_LIST_POLICY.md`
  - `docs/GLOSSARY.md`

### P2

#### F-002 — Date freshness signal is inconsistent with structural reality
- **Summary:** `/Users/stefanlesnak/Antigravity/Risk App 2/.planning/codebase/STRUCTURE.md:3` and `/Users/stefanlesnak/Antigravity/Risk App 2/.planning/codebase/ARCHITECTURE.md:3` show recent analysis dates, but structural count claims are stale.
- **Impact:** freshness dates may be interpreted as full-content recertification when they do not reflect quantitative accuracy.
- **Evidence:**
  - `/Users/stefanlesnak/Antigravity/Risk App 2/.planning/codebase/STRUCTURE.md:3`
  - `/Users/stefanlesnak/Antigravity/Risk App 2/.planning/codebase/ARCHITECTURE.md:3`
  - `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/topology-critical-review-20260221-235221/count-metrics.json`

### P3

#### F-004 — No defects found in canonical link/command gates
- **Summary:** command contract and canonical link integrity checks pass in this run.
- **Evidence:**
  - `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/topology-critical-review-20260221-235221/command-status.json`
  - `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/topology-critical-review-20260221-235221/docs-tree-canonical/docs-tree-audit.json`

## Execution-Ready Remediation Backlog

### T-001 (for F-001)
- **Owner role:** `RiskHub Maintainer`
- **Target files:**
  - `/Users/stefanlesnak/Antigravity/Risk App 2/.planning/codebase/STRUCTURE.md`
- **Change spec:** Update count-bearing lines (`22-25`, `32`, `41-42`, `50`) to measured values from this review run and annotate counting method.
- **Verification commands:**
  - `python3 - <<'PY'`
  - `from pathlib import Path`
  - `print(sum(1 for p in Path('backend/app/api/v1/endpoints').rglob('*.py') if p.is_file()))`
  - `print(sum(1 for p in Path('backend/app/models').rglob('*.py') if p.is_file()))`
  - `print(sum(1 for p in Path('backend/app/schemas').rglob('*.py') if p.is_file()))`
  - `print(sum(1 for p in Path('backend/app/services').rglob('*.py') if p.is_file()))`
  - `print(sum(1 for p in Path('tests/backend/pytest').rglob('*') if p.is_file()))`
  - `print(sum(1 for p in Path('tests/backend/pytest').rglob('*.py') if p.is_file()))`
  - `print(sum(1 for p in Path('frontend/src/pages').rglob('*') if p.is_file()))`
  - `print(sum(1 for p in Path('frontend/src/components').rglob('*') if p.is_file()))`
  - `print(sum(1 for p in Path('tests/frontend/e2e').rglob('*.spec.ts') if p.is_file()))`
  - `PY`
  - `python3 scripts/tools/docs_tree_audit.py --scope canonical`
- **Acceptance criteria:**
  - All count claims match computed values.
  - Re-run claim matrix shows no count-metric failures.

### T-002 (for F-002)
- **Owner role:** `RiskHub Maintainer`
- **Target files:**
  - `/Users/stefanlesnak/Antigravity/Risk App 2/.planning/codebase/STRUCTURE.md`
  - `/Users/stefanlesnak/Antigravity/Risk App 2/.planning/codebase/ARCHITECTURE.md`
- **Change spec:** Enforce date-update policy where analysis dates are changed only alongside verified content refresh.
- **Verification commands:**
  - `python3 scripts/check_docs_contract.py`
  - `python3 scripts/tools/docs_tree_audit.py --scope canonical`
- **Acceptance criteria:**
  - Date stamps reflect completed verification-backed refresh events.

### T-003 (for F-003)
- **Owner role:** `RiskHub Maintainer`
- **Target files:**
  - `/Users/stefanlesnak/Antigravity/Risk App 2/docs/README.md`
  - `/Users/stefanlesnak/Antigravity/Risk App 2/docs/DOCUMENTATION_TREE.md`
  - `/Users/stefanlesnak/Antigravity/Risk App 2/.planning/README.md`
- **Change spec:** Add or adjust canonical links so all canonical docs are reachable from at least one root entrypoint within 3 hops.
- **Verification commands:**
  - `python3 scripts/tools/docs_tree_audit.py --scope canonical`
  - `python3 - <<'PY'`
  - `import json`
  - `from pathlib import Path`
  - `p=Path('tests/results/docs/topology-critical-review-20260221-235221/navigability.json')`
  - `d=json.loads(p.read_text())`
  - `print(d['unreachable_count'], d['weakly_connected_count'])`
  - `PY`
- **Acceptance criteria:**
  - `unreachable_count=0`
  - `weakly_connected_count=0` for `threshold_hops=3`

## Notes / Limitations

- **Scope boundary honored:** archival `.planning/phases/*` bodies were excluded from remediation in this review.
- **Unknowns:** none in scoped claims; no `not found` critical claim occurred.
- **Timestamp context:** review executed at `2026-02-21T23:52:21Z` (UTC) and `2026-02-22T00:52:21+0100` (local machine time).

## Artifact Index

- `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/topology-critical-review-20260221-235221/metadata.json`
- `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/topology-critical-review-20260221-235221/command-status.json`
- `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/topology-critical-review-20260221-235221/docs-tree-canonical/docs-tree-audit.json`
- `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/topology-critical-review-20260221-235221/docs-tree-canonical/docs-tree-audit.md`
- `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/topology-critical-review-20260221-235221/count-metrics.json`
- `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/topology-critical-review-20260221-235221/navigability.json`
- `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/topology-critical-review-20260221-235221/claim-matrix.json`
- `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/topology-critical-review-20260221-235221/findings.json`
- `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/topology-critical-review-20260221-235221/backlog.json`
