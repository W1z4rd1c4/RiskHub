# Main and dependency security review — 2026-10-23

## Scope and evidence

Reviewed `main` at `95fb41dc9b931ffec3e023b51d3e51d8c30e9dcb`, open
Dependabot PR [#304](https://github.com/W1z4rd1c4/RiskHub/pull/304), recent
security workflow failures, repository security policies, dependency graphs,
production lock provenance and authentication/outbound-request boundaries.
Historical reports remain unchanged.

The latest failing scheduled scan was
[39914230492](https://github.com/W1z4rd1c4/RiskHub/actions/runs/39914230492).
Security scans had passed on the same main commit before new advisories appeared.
Its retained pip-audit and container artifacts independently confirmed the
OpenTelemetry and certifi findings. Fresh audits also identified the development
tooling findings below. The GitHub integration returned HTTP 403 for Dependabot,
code-scanning and secret-scanning alert inventories, so this report makes no
claim about the number or closure state of private GitHub alerts.

## Findings and disposition

| Finding | Evidence | Remediation |
| --- | --- | --- |
| Compromised emSign CA roots in certifi | PYSEC-2026-4320 / GHSA-6q48-6c7w-9gw2; certifi 2026.7.22 in the exact development and production graphs | Upgrade to 2026.10.19 in regenerated exact locks; verify the affected root is absent. |
| Compromised CA retained in pip's independent vendored bundle | Application certifi updates leave pip 26.2.1's vendored emSign G3 root intact | Upgrade the reviewed, hash-pinned resolver/bootstrap wheel to pip 26.2.2; verify its vendored roots before native generation and after every clean install. Use the same hash-enforced bootstrap in the development refresher. |
| OpenTelemetry tracestate parser denial of service | CVE-2026-114603 / GHSA-xcq7-p3pf-p88h; opentelemetry-api 1.44.0 | Upgrade the coherent OpenTelemetry family to 1.45.1 / 0.66b1 and include its two new transport dependencies. |
| Virtualenv shell command injection | CVE-2026-113726, CVE-2026-113725, CVE-2026-113722; virtualenv 21.14.2 | Upgrade exact development/audit locks to 21.14.13, beyond all three fixed versions. |
| Vitest mocker advisories | GHSA-qxg6-89mg-rqv8, GHSA-xp26-3454-mjgp; mocker 4.1.11 | Upgrade Vitest, coverage-v8 and their aligned internal packages to 4.1.12. |
| Credential forwarding across outbound redirect origins | With redirects enabled, `guarded_get` manually reused bearer/custom API headers across allowlisted hosts, subdomains, schemes and ports; client-default credentials had the same problem | Reject every cross-origin redirect before sending it. Retain same-origin redirects and recheck DNS at every hop. |
| Incomplete dependency audit coverage and evidence | Input-only resolution missed shipped/transitive development pins; the first audit failure aborted later reports | Audit both input manifests plus exact development, production runtime, DB-task and pip bootstrap locks; retain all six reports and aggregate failures. |
| Backend Trivy was advisory | Backend scan omitted `exit-code: '1'` although the separate Grype gate blocked findings | Make backend Trivy independently block HIGH/CRITICAL findings; continue frontend scanning and report collection after backend findings. |
| Dashboard filter reset could be lost during navigation | The repeated browser export/history check observed Clear All retaining the previous filters; a delayed real-router commit reproduces the race deterministically | Advance observed URL state only when navigation commits, so a stale location cannot rehydrate over a newer filter choice. Preserve the original export snapshot, URL history and backend visibility checks. |

No suppression was added or extended. Existing npm, pip and Grype exception
lists are empty. Fresh exact development and frontend audits report zero
advisories after these changes.

## Dependabot review

PR #304 is unsuitable for a direct merge. It flattens the canonical development
entrypoint, retains stale provenance and conflicting framework pins, and does
not refresh production hash locks. Its SQLAlchemy 2.1 update causes 43 mypy
errors; its FastAPI changes break route/contract introspection; its bcrypt bump
violates the explicitly retained compatibility contract. It also leaves certifi
vulnerable and upgrades virtualenv only to 21.14.7, below the fix for one advisory.

This remediation takes the bounded security upgrades while preserving other
framework and runtime pins. Broader migrations remain tracked separately,
including [#224](https://github.com/W1z4rd1c4/RiskHub/issues/224).
The current Dependabot `allow.update-types` configuration was checked against
the published schema and is valid; no speculative configuration fix was made.

## Review and verification

The review uses three rounds: initial independent dependency/application/CI
triage and fixes; cross-review of the resulting changes and additional fixes;
then a final review of the settled diff and verification evidence. Round two
expanded the redirect fix to cover client-default authentication and added exact
production-lock audits to the CI gate. It also corrected the existing redirect
test so a reserved documentation IP could not make it pass before following a
redirect; the test now exercises DNS revalidation on a same-origin hop.
Round three retained the SSO provider-unavailable error contract for rejected
and malformed redirects, including errors raised by HTTPX before the helper
parses the redirect target. Final trust-store inspection found pip's independent
copy of the compromised root. The final tooling update was independently
reviewed and tested against real old/new pip bundles and public certificate
fixtures. The production image's separate system SSL trust store was also
checked and does not contain the compromised emSign G3 root.

Hosted verification also required synchronizing the two authorization-contract
notes for the SSO service change. Its repeated dashboard export journey exposed
the existing URL/filter race above. The regression test fails on the previous
implementation with a deferred real-router navigation and passes after removing
the speculative observed-URL writes. Browser assertions and retry settings were
retained. A later repetition exposed the complementary case: initial URL
normalization could commit after a reset and restore the old filters. Hydration
now compares parsed URL snapshots, so equivalent canonical URLs and unrelated
parameters cannot overwrite newer local choices. A second delayed-router
regression covers that sequence.

Final backend coverage synchronized the container contract's expected pip pin
with 26.2.2 and exposed a date-sensitive archive-metric fixture: one live KRI
was accidentally never reported. Both live fixture rows now report for the
latest closed quarter, with fixed UTC dates covering the reporting-grace
boundary. The archive and overdue policies are unchanged.

Verification includes fresh pip/npm audits, production builds and type checks,
security policy and gate mutation tests, authentication and outbound regression
tests, and native production lock validation. Both native lock generations were
byte-identical. Four clean wheel-only, hash-enforced installations passed
dependency checks and exact inventory comparisons. No unrelated production
dependency versions or same-version artifact hashes changed.

The security workflow uses the exact pip-audit version from the canonical
development lock instead of installing another floating scanner requirement.

Local verification passed the full frontend suite (536 files, 4,241 tests),
production build, application and test type checks, backend Ruff and mypy
(791 source files), security policy validators and the full-history Gitleaks
8.24.3 scan (zero leaks). All six Python audit reports contain zero advisories.
The PostgreSQL/Redis authentication, credential, recovery, session and access
regression run passed all 239 tests.
Fresh Trivy and Grype scans of both native backend images contain zero
HIGH/CRITICAL findings. Each Grype report retains five MEDIUM CPE matches for
three CVEs. These are unsuppressed and tracked for stable vendor fixes in
[#305](https://github.com/W1z4rd1c4/RiskHub/issues/305); the images are not
described as fully free of vulnerabilities.

The accompanying pull request retains hosted CI evidence for the final source
commit, including complete backend/frontend suites, PostgreSQL/Redis identity
tests, native Alpine lock reproduction, secret scanning and container scans.
Required checks must pass before updating main. This is repository and build
verification; it does not certify a deployed production environment or reopen
the native production admission gate tracked by
[#208](https://github.com/W1z4rd1c4/RiskHub/issues/208).
