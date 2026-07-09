# _ict_register_lifecycle

ICT Register write-side lifecycles: the Process register (issue #42) and the
Asset register with its Link relations (issue #43); the Threat lifecycle
joins in a later slice (#47).

- **ADR-007 class**: workflow-paired with `_vendor_governance` (Amendment 1
  classification table; `_bounded_context_workflow_pairs.toml`). The register
  is one graph with the vendor domain — Contracts/Sub-outsourcing extend
  `_vendor_governance` and the criticality cascade terminates in vendor
  tiering — so sweeps must coordinate both packages.
- **Shape** (mirrors `_vendor_governance`): `lifecycle.py` / `asset_lifecycle.py`
  own the service transaction boundaries via `commit_service_boundary`
  (ADR-002; endpoints never commit) and the audit facts
  (`app/core/audit/process.py`, `app/core/audit/asset.py`);
  `policy.py` / `asset_policy.py` assert authorization and archive semantics
  (ADR-005); `projection.py` / `asset_projection.py` serialize Read schemas
  with ADR-001 per-row capabilities from `_authorization_capabilities`.
- **Link relations** (issue #43): `asset_links.py` owns the Process<->Asset
  (sheet 05: significance, SPOF, note) and Asset<->Asset (sheet 06:
  directional dependency type, SPOF, note) junctions — unique pairs,
  self-links rejected, managed from the Asset detail, readable from both
  ends. The primary-Process designation lives on the Process<->Asset link:
  at most one primary per Asset, enforced here — designating a new primary
  atomically demotes the previous one in the same transaction; removing the
  primary link leaves the Asset with no primary.
- **F-codes** (RoI B_06.01) are server-assigned at creation (`F{id}`), stable,
  never reassigned; archive never frees a code.
- **Entered fields only**: the workbook's entered 03_Procesy and 04_Aktiva
  fields (functional spec sections 1.1/1.2/1.8). Derived values (score,
  class, CIF, cascade fields, SPOF rollups, gap checks, counts, completeness)
  are compute-on-read and arrive with the derivation engine (#48); write
  schemas reject them.
- **Closed lists** come from `_ict_register_reference` (issue #41) via the
  write-schema validators in `app/schemas/process.py` and
  `app/schemas/asset.py`.
- **HTTP surface**: `backend/app/api/v1/endpoints/processes/`
  (`/api/v1/processes`) and `backend/app/api/v1/endpoints/assets/`
  (`/api/v1/assets`), gated by the `processes` / `assets` resource
  permissions.
