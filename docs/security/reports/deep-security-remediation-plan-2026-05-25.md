# Deep Security Remediation Plan (2026-05-25)

## Result

This plan fixes the validated findings from the deep security scan at commit
`70023fac307086d3aee1ef5a01546e0f7aa344b3`. It is intentionally a
TDD-first implementation plan, not a record of completed remediation.

Source artifacts:

- `/tmp/codex-security-scans/RiskHubOSS/70023fac307086d3aee1ef5a01546e0f7aa344b3_20260525T212951Z/artifacts/final_report.md`
- `/tmp/codex-security-scans/RiskHubOSS/70023fac307086d3aee1ef5a01546e0f7aa344b3_20260525T212951Z/artifacts/validation_report.md`
- `/tmp/codex-security-scans/RiskHubOSS/70023fac307086d3aee1ef5a01546e0f7aa344b3_20260525T212951Z/artifacts/attack_path_analysis_report.md`
- `tests/results/prod/prod-readiness-audit-20260525-213636/`
- `tests/results/security/contract-drift-remediation-20260525-214854/`

Implementation rule: no production code changes before a focused RED test has
been written and observed failing for the expected reason. Keep each slice on a
red-green-refactor loop.

## Current Checkout Reconciliation

The working tree already contains uncommitted changes. Treat those changes as
user work and build on them; do not revert them while implementing this plan.

Partially addressed by current dirty changes:

- Dependency audit noise is partly reduced: `backend/requirements-runtime.txt`
  now pins newer `fastapi`, `starlette`, and `cryptography`, and frontend
  package files now bump `postcss`, `vite`, `brace-expansion`, and `ws`.
- Gitleaks public-audit noise is partly reduced by `.gitleaks.toml` allowlist
  changes for test literals, `.pytest_cache`, and `frontend/dist`.
- Syft/Grype pinning is partly covered by existing checks in
  `tests/backend/pytest/test_workflow_pin_validator.py`.
- Runtime packaging is partly changed by `backend/Dockerfile` and
  `backend/docker-entrypoint.sh` to repair `/app/logs` ownership before
  dropping privileges.
- `backend/app/services/_approval_execution/delete_side_effects.py` has a
  loader-only change from `joinedload` to `selectinload`; it does not address
  stale delete approval context.

Still not addressed in the dirty checkout:

- Dashboard control aggregate leakage to risk-only users.
- Risk, control, and KRI stale delete approval side effects.
- Production wildcard `ALLOWED_HOSTS` acceptance.
- Raw `REDIS_URL` in `metadata.env`.
- Generic shell `docker run` scanner image pinning for Trivy, Gitleaks, and
  ShellCheck.
- Tag-only production deploy image refs.
- Protocol probe mismatch for removed legacy `/excel` routes.
- Container CVE closure after rebuilding and rescanning runtime images.
- Historical public-leak audit findings from old git history:
  `history_privacy_path_hits` and `history_runtime_artifacts` still require a
  separate history-rewrite decision or an explicit baseline policy. Do not mark
  `make -f scripts/Makefile public-leak-audit` as fully resolved until this is
  fixed.

Deferred follow-up:

- Add a dedicated TDD-first remediation slice for the historical
  privacy/runtime-artifact findings reported by `public-leak-audit`.
  Acceptance criteria: the project either rewrites/removes the affected history
  safely or lands a documented, reviewed baseline policy that keeps current-tree
  and future-history leaks blocked while accounting for the legacy findings.

## Implementation Sequence

### 1. Dashboard Authz Leak (F-01, F-02)

Goal: deepen the `_dashboard_metrics.departments` Module Interface so callers
can rely on one rule: risk/KRI department metrics are available to `risks:read`,
but control aggregate fields are zero unless the actor has `controls:read`.

Architecture decision:

- Keep endpoint Adapters unchanged: `/api/v1/dashboard/departments` and
  `/api/v1/dashboard/overview` remain mixed dashboard surfaces requiring
  `risks:read`.
- Do not change response schemas or add capability fields for this fix.
- The Seam is `load_department_dashboard_metrics`; both endpoint Adapters
  already call it, so the Module has good Leverage and Locality.

RED tests:

- Add `test_dashboard_departments_hides_control_aggregates_without_controls_read`
  to `tests/backend/pytest/test_dashboard.py`.
  - Use a risk-only user fixture such as `client_risk_manager` or
    `client_department_head`, not `client_employee`.
  - Create one live active `Control` and one `ControlExecution` in the user's
    department.
  - Request `/api/v1/dashboard/departments?department_id=<department_id>`.
  - Expected RED failure today: `control_count`, `audited_control_count`, or
    `compliance_rate` is nonzero.
  - Desired GREEN assertion: the row still exists, but `control_count == 0`,
    `audited_control_count == 0`, and `compliance_rate == 0.0`.

- Add `test_dashboard_overview_hides_department_control_aggregates_without_controls_read`
  to `tests/backend/pytest/test_dashboard.py`.
  - Clear `DASHBOARD_OVERVIEW_CACHE` at test start.
  - Use a risk-only user.
  - Create one live active `Control` and one `ControlExecution` in the user's
    department.
  - Request `/api/v1/dashboard/overview`.
  - Expected RED failure today: `department_metrics[*].control_count` is
    nonzero.
  - Desired GREEN assertion: matching department metrics have zero control
    aggregates; existing safe paths such as `control_trends` remain empty.

RED command:

```bash
cd backend && pytest ../tests/backend/pytest/test_dashboard.py -q -k "hides_control_aggregates_without_controls_read"
```

Minimal GREEN implementation:

- In `backend/app/services/_dashboard_metrics/departments.py`, import
  `has_permission`.
- Compute `can_read_controls = has_permission(current_user, "controls", "read")`.
- If false, skip the three control aggregate query blocks and set
  `control_counts`, `active_control_counts`, and `audited_control_counts` to
  `{}`.
- Leave risk and KRI queries unchanged.

Refactor checkpoint:

- Keep query count for authorized users unchanged.
- Do not create a new Module; deletion test says the existing department
  metrics Module already earns its keep because deleting it would scatter
  batched metrics and authz policy across two endpoint Adapters.

### 2. Stale Delete Approval Context (F-03, F-04, F-05)

Goal: prevent stale delete approvals from archiving a risk, control, or KRI
after owner, department, reporting owner, or parent context changes.

Architecture decision:

- Add a deep Module, `backend/app/services/_approval_execution/delete_context.py`.
- Add a nullable JSON column, `ApprovalRequest.delete_context_snapshot`, with a
  forward Alembic migration.
- Do not overload `pending_changes`; it is the edit-only stale-value Interface.
- Do not expose the snapshot in `ApprovalRequestRead` unless product explicitly
  asks for it later.

Module Interface:

```python
async def build_delete_approval_context(
    db: AsyncSession,
    *,
    resource_type: ApprovalResourceType,
    entity: Risk | Control | KeyRiskIndicator,
    requester_id: int,
) -> DeleteApprovalContext: ...

def serialize_delete_approval_context(context: DeleteApprovalContext) -> dict: ...

async def reject_if_stale_delete_context(
    db: AsyncSession,
    *,
    approval: ApprovalRequest,
    entity: Risk | Control | KeyRiskIndicator,
) -> SideEffectResult | None: ...
```

Adapters:

- Intake Adapters in `_approval_queue/delete_intake.py` and
  `_entity_mutation_lifecycle/archive_plans.py` build and persist the snapshot
  when creating delete approvals.
- Execution Adapter in `_approval_execution/delete_side_effects.py` calls
  `reject_if_stale_delete_context` after loading and locking the current target
  and before `archive_*_no_commit`.

Snapshot fields:

- Risk: `department_id`, `owner_id`, `is_priority`, `net_score`,
  `primary_approver_id`, `requires_privileged_approval`.
- Control: `department_id`, `control_owner_id`, sorted linked risk ids, linked
  risk owner ids/departments, `primary_approver_id`,
  `requires_privileged_approval`.
- KRI: `risk_id`, parent risk `department_id`, parent risk `owner_id`,
  `reporting_owner_id`, `primary_approver_id`, `requires_privileged_approval`.

RED tests:

- Add `tests/backend/pytest/test_approval_delete_stale_context.py`.
- Add `test_stale_risk_delete_approval_rejects_after_scope_or_owner_drift`.
  - Queue through the normal archive/delete approval Interface.
  - Mutate `risk.department_id` or `risk.owner_id`.
  - Approve as CRO.
  - Expected RED failure today: approval becomes `APPROVED` and risk archives.
  - Desired GREEN assertion: approval becomes `REJECTED`, notes mention changed
    resource context, `risk.is_archived is False`, and no risk archive audit is
    emitted.

- Add `test_stale_control_delete_approval_rejects_after_control_context_drift`.
  - Mutate `control.department_id`, `control.control_owner_id`, or linked risk
    context after queueing.
  - Desired GREEN assertion: rejected, not archived, no control archive audit.

- Add `test_stale_kri_delete_approval_rejects_after_parent_risk_context_drift`.
  - Mutate `kri.risk_id`, parent risk department/owner, or
    `kri.reporting_owner_id` after queueing.
  - Desired GREEN assertion: rejected, not archived, no KRI archive audit.

- Add `test_delete_approval_without_context_snapshot_fails_closed_when_target_exists`.
  - Create a legacy-style delete `ApprovalRequest` directly with no snapshot and
    an existing target.
  - Desired GREEN assertion: auto-rejected and target not archived.
  - Keep missing-target legacy approvals on the existing missing-resource
    auto-rejection path.

RED command:

```bash
cd backend && pytest ../tests/backend/pytest/test_approval_delete_stale_context.py -q
```

Minimal GREEN implementation:

- Add model column and migration.
- Store snapshots at delete approval creation.
- Validate snapshots at apply time.
- Use existing `SideEffectResult.auto_rejected(...)` semantics.
- Resolution notes should be non-sensitive, for example:
  `Resource changed before approval could be applied (delete context no longer matches).`
- Outbox `approval.request_resolved` payload must be `approved: false` for
  stale auto-rejections.

Refactor checkpoint:

- The new Module increases Depth because one Interface hides target-specific
  context capture and comparison rules.
- Deletion test: without this Module, stale-context rules would reappear in
  approval queue intake, direct archive intake, and three delete side-effect
  branches.

### 3. Production Host Hardening (F-06)

Goal: production `ALLOWED_HOSTS` must be a concrete non-empty allowlist and must
not contain `*`.

RED tests:

- Add `test_allowed_hosts_rejects_wildcard_in_production_mode` to
  `tests/backend/pytest/test_production_hardening.py`.
  - Use `_production_settings(allowed_hosts=["*"])`.
  - Expected RED failure today: app creation succeeds.
  - Desired GREEN assertion: `RuntimeError` mentions `ALLOWED_HOSTS`.

- Add or extend deploy/preflight contract coverage in
  `tests/backend/pytest/test_phase500_script_contracts.py` or the existing
  production script contract file.
  - Assert shell preflight rejects wildcard `ALLOWED_HOSTS`, mirroring CORS
    wildcard rejection.

RED command:

```bash
cd backend && pytest ../tests/backend/pytest/test_production_hardening.py ../tests/backend/pytest/test_phase500_script_contracts.py -q -k "allowed_hosts or ALLOWED_HOSTS"
```

Minimal GREEN implementation:

- In `backend/app/main.py`, extend production validation to reject any
  `settings.allowed_hosts` entry equal to `*`.
- In deploy preflight, reject wildcard `ALLOWED_HOSTS` before deploy/upgrade.
- Keep managed renderer behavior unchanged because it derives exact hostnames
  from `PUBLIC_URL`.

### 4. Non-Secret Deployment Metadata (F-09)

Goal: `metadata.env` contains non-secret deployment metadata only. Redis
credentials remain in the dedicated runtime secret file.

RED tests:

- Update `tests/backend/pytest/test_deploy_renderer_contracts.py`.
  - Stop requesting `REDIS_URL` from `metadata.env`.
  - Assert `REDIS_URL_FILE` and `REDIS_PASSWORD_FILE` remain present.
  - Assert the literal rendered metadata file does not contain
    `redis://:` or the test Redis password.
  - Expected RED failure today: `REDIS_URL` is present.

- Update `tests/backend/pytest/test_install_script_contracts.py`.
  - Rename the backup test expectation from "non-secret runtime backup" to
    "runtime metadata backup excludes secrets".
  - Assert metadata backup exists only after the renderer no longer embeds
    `REDIS_URL`.

RED command:

```bash
cd backend && pytest ../tests/backend/pytest/test_deploy_renderer_contracts.py ../tests/backend/pytest/test_install_script_contracts.py -q -k "metadata or redis"
```

Minimal GREEN implementation:

- Remove `REDIS_URL` from `scripts/deploy/lib/render.py` metadata values.
- Leave `REDIS_URL_FILE` and `REDIS_PASSWORD_FILE`.
- Ensure scripts that source metadata use `REDIS_URL_FILE` and do not depend on
  raw `REDIS_URL`.
- Update deployment docs to state `metadata.env` is non-secret and Redis URL
  material is only in `runtime/redis_url`.

### 5. Scanner Image Pinning (F-10)

Goal: one policy Module rejects mutable shell `docker run` scanner images.

Architecture decision:

- Deepen `scripts/security/validate_workflow_pins.py` into the single scanner
  image pinning Seam for workflows and security scripts.
- Keep CI/workflow files as Adapters that provide image refs; validation owns
  the rule.

RED tests:

- Add tests to `tests/backend/pytest/test_workflow_pin_validator.py`:
  - A temp workflow containing `docker run aquasec/trivy:0.57.1 ...` is
    rejected.
  - A temp workflow containing
    `docker run aquasec/trivy:0.57.1@sha256:<64 hex> ...` passes.
  - Current `.github/workflows/security.yml`,
    `scripts/security/prod_readiness_audit/phases.py`,
    `scripts/security/run_public_repo_leak_audit.sh`, and Makefile shell
    scanner refs contain only digest-pinned scanner images.

Expected RED failure today: Trivy and Gitleaks refs are tag-only and validator
passes.

RED command:

```bash
cd backend && pytest ../tests/backend/pytest/test_workflow_pin_validator.py -q
```

Minimal GREEN implementation:

- Parse generic `docker run` image tokens robustly enough for existing workflow
  and script shapes.
- Require `tag@sha256:<digest>` for scanner images:
  `aquasec/trivy`, `zricethezav/gitleaks`, `gitleaks/gitleaks`,
  `koalaman/shellcheck`, `anchore/syft`, and `anchore/grype`.
- Update workflow/script refs to digest-pinned values.

### 6. Production Deploy Image Immutability (F-11)

Goal: production deploy/upgrade consumes immutable image refs, not tag-only
refs.

RED tests:

- Add deploy image-ref validation tests in the existing deploy CLI contract
  suite.
  - Tag-only `ghcr.io/owner/riskhub-backend:v1.2.3` is rejected for production
    deploy/upgrade.
  - Digest ref `ghcr.io/owner/riskhub-backend@sha256:<64 hex>` is accepted.
  - Optional combined tag+digest
    `ghcr.io/owner/riskhub-backend:v1.2.3@sha256:<64 hex>` is accepted.

Expected RED failure today: tag-only refs are accepted.

Minimal GREEN implementation:

- Add one image-ref validation function in deploy tooling.
- Apply it before `docker pull` in production docker deploy/upgrade.
- Update release workflow to publish or record digest refs.
- Update prod-readiness audit to resolve pushed local-registry image digests and
  deploy digest refs.
- Update deployment docs examples to use digest refs.

### 7. Container CVE Closure (F-07, F-08)

Goal: rebuild backend and frontend runtime images so Trivy and Grype do not
report unresolved High/Critical findings, except explicitly time-bound
no-fixed-version Python suppressions.

RED checks:

- Rebuild current images and rerun Trivy/Grype with current DBs.
- Expected RED state from scan artifacts: backend Trivy High/Critical count,
  frontend Trivy High/Critical count, and backend Grype High/Critical count are
  nonzero.

Minimal GREEN implementation:

- Prefer fixed base layers over suppressions.
- Pin base image digests after selecting fixed image versions.
- Keep `backend/security/grype-ignore.yaml` limited to no-fixed-version Python
  CVEs with owner, reason, package version, and expiration.
- Ensure ignore package versions match rebuilt image package versions.

GREEN commands:

```bash
docker build -t riskhub-backend:security-fix -f backend/Dockerfile backend
docker build -t riskhub-frontend:security-fix -f frontend/Dockerfile frontend
python3 scripts/security/run_prod_readiness_audit.py --run-id <utc-run-id>
```

If Docker or scanner DB updates are unavailable, record that as an implementation
limitation and do not claim CVE closure.

### 8. Protocol Probe Alignment

Goal: `security-contract-probe` should no longer count absent legacy `/excel`
tombstones as security defects. Current product direction is: legacy `/excel`
routes are absent/404; live `/export?format=xlsx` routes remain
`410 excel_export_removed`.

RED test:

- Update `tests/backend/pytest/test_protocol_contract_probe.py`.
  - Assert `PROBE_CASES` contains no paths ending in `/excel`.
  - Assert `/export?format=xlsx` cases remain and expect `410`.
  - Expected RED failure today: probe cases include four legacy `/excel` paths.

Minimal GREEN implementation:

- Remove the four legacy `/excel` cases from
  `scripts/security/protocol_contract_probe.py`.
- Keep `/export?format=xlsx` cases.
- Do not reintroduce dead tombstone routes.

GREEN command:

```bash
make -f scripts/Makefile security-contract-probe
```

## Verification

Run targeted checks first:

```bash
cd backend && pytest ../tests/backend/pytest/test_dashboard.py -q -k "hides_control_aggregates_without_controls_read"
cd backend && pytest ../tests/backend/pytest/test_approval_delete_stale_context.py -q
cd backend && pytest ../tests/backend/pytest/test_production_hardening.py ../tests/backend/pytest/test_deploy_renderer_contracts.py ../tests/backend/pytest/test_workflow_pin_validator.py ../tests/backend/pytest/test_protocol_contract_probe.py -q
```

Then run security and architecture gates:

```bash
python3 scripts/security/validate_authz_capability_contract.py
python3 scripts/security/validate_workflow_pins.py
make -f scripts/Makefile security-contract-probe
make -f scripts/Makefile security-redis-resilience
make -f scripts/Makefile security-gap-round5
make -f scripts/Makefile verify-prod-install-scripts
make -f scripts/Makefile test-architecture-locks
```

For approval model/migration changes, also run migration-backed Postgres tests
when a test database is available:

```bash
cd backend && TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub_test pytest -m postgres -q
```

For final supply-chain closure, rebuild images and rerun prod-readiness with
current scanner databases. Do not mark F-07/F-08 closed without fresh image
scanner evidence.

## Acceptance Criteria

- F-01 and F-02: risk-only dashboard callers receive risk/KRI metrics but zero
  control aggregate fields.
- F-03, F-04, and F-05: stale delete approvals auto-reject before archive side
  effects, including outbox `approved: false` parity.
- F-06: production app startup and deploy preflight reject wildcard
  `ALLOWED_HOSTS`.
- F-07 and F-08: fresh scanner outputs show no unresolved High/Critical runtime
  findings except documented time-bound no-fixed-version suppressions.
- F-09: rendered `metadata.env` contains no raw Redis URL or password.
- F-10: workflow pin validator fails on mutable scanner `docker run` images and
  passes on digest-pinned scanner refs.
- F-11: production deploy rejects tag-only image refs and accepts digest refs.
- Protocol probe: removed `/excel` paths no longer produce security defect
  counts; live `format=xlsx` export routes still return documented `410`.

## Limitations

- Docker, registry access, and current Trivy/Grype databases are required to
  close container CVE findings.
- Existing dirty checkout changes may already overlap some verification files;
  implementation must inspect and preserve them before editing.
- Staging replay remains out of scope unless a staging URL and credentials are
  provided.
