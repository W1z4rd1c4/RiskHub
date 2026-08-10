# _ict_register_lifecycle

ICT Register write-side lifecycles — the Process register (issue #42) and the
Asset register with its Link relations (issues #43/#46) — plus the derivation
engine (issue #48), the register's one deep read-side module; the Threat
lifecycle joins in a later slice (#47).

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
- **Vendor link relations** (issue #46): `vendor_links.py` owns the
  Asset<->Vendor (sheet 10_VAD: vendor role, the S01-S19 S-code, contract
  reference, reliance, note; unique per asset+vendor+S-code) and the manual
  Process<->Vendor (sheet 11 §1: direct-service description, note; unique
  pair) junctions. Reads need BOTH ends' read permissions (the Vendor end
  additionally follows the Vendor row's visibility); mutations need the
  REGISTER end's write permission; per-row `can_delete` capabilities come
  from `_authorization_capabilities.register_vendor_links`. Archived-end
  stance is STRICT per #43: archived register end conflicts every mutation,
  archived Vendor target conflicts NEW links while unlinking stays possible.
  The §2 transitive Process<->Vendor expansion stays derived-only.
- **F-codes** (RoI B_06.01) are server-assigned at creation (`F{id}`), stable,
  never reassigned; archive never frees a code.
- **Entered fields only** on the write side: the workbook's entered
  03_Procesy and 04_Aktiva fields (functional spec sections 1.1/1.2/1.8);
  write schemas reject every derived field.
- **Derivation engine** (issue #48): `derivation.py` is the pure core —
  register graph in, every derived value out (Process score/class/CIF/gap
  checks/next review/counts/completeness; the Asset criticality cascade:
  CIAA value, primary-process lookups, business criticality, weighted score,
  `h_rank`/`vysledna` MAX aggregation, `klas8`, CIF any-true, SPOF, external
  dependency, legacy, count/list aggregates), workbook-verbatim per the
  functional spec (sections 2.1/2.2/2.3(1)) and fed by the seeded parameter
  set from `_ict_register_reference.parameters`. **Compute-on-read**: nothing
  is persisted; `derivation_inputs.py` loads the graph closure and the
  projections attach a typed `derived` block (with an `inputs` explain
  object) to every Process/Asset Read payload. The sheet-10/11 §1 vendor-link
  inputs are LIVE (issue #46): `ext_zavis`, the vendor TEXTJOIN aggregates,
  and the Process/Asset vendor counts derive from the persisted junctions
  (Sub-outsourcing inputs join with #49). Golden fidelity suite:
  `tests/backend/pytest/test_ict_register_derivation.py`.
- **Closed lists** come from `_ict_register_reference` (issue #41) via the
  write-schema validators in `app/schemas/process.py` and
  `app/schemas/asset.py`.
- **HTTP surface**: `backend/app/api/v1/endpoints/processes/`
  (`/api/v1/processes`) and `backend/app/api/v1/endpoints/assets/`
  (`/api/v1/assets`), gated by the `processes` / `assets` resource
  permissions.
