# _ict_register_lifecycle

ICT Register write-side lifecycles (issue #42): the Process register now;
Asset and Threat lifecycles join in later slices (#43/#47).

- **ADR-007 class**: workflow-paired with `_vendor_governance` (Amendment 1
  classification table; `_bounded_context_workflow_pairs.toml`). The register
  is one graph with the vendor domain — Contracts/Sub-outsourcing extend
  `_vendor_governance` and the criticality cascade terminates in vendor
  tiering — so sweeps must coordinate both packages.
- **Shape** (mirrors `_vendor_governance`): `lifecycle.py` owns the service
  transaction boundaries via `commit_service_boundary` (ADR-002; endpoints
  never commit) and the audit facts (`app/core/audit/process.py`);
  `policy.py` asserts authorization and archive semantics (ADR-005);
  `projection.py` serializes Read schemas with ADR-001 per-row capabilities
  from `_authorization_capabilities.process_capabilities`.
- **F-codes** (RoI B_06.01) are server-assigned at creation (`F{id}`), stable,
  never reassigned; archive never frees a code.
- **Entered fields only**: the workbook's 03_Procesy entered fields
  (functional spec section 1.1). Derived values (score, class, CIF, gap
  checks, next review, counts, completeness) are compute-on-read and arrive
  with the derivation engine (#48); write schemas reject them.
- **Closed lists** come from `_ict_register_reference` (issue #41) via the
  write-schema validators in `app/schemas/process.py`.
- **HTTP surface**: `backend/app/api/v1/endpoints/processes/`
  (`/api/v1/processes`), gated by the `processes` resource permissions.
