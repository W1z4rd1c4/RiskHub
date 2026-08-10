"""ICT Register write-side lifecycles — Process and Asset now, Threat later.

ADR-007 Amendment 1 classification: workflow-paired with ``_vendor_governance``
(no new top-level bounded context per the ICT Register spec). The register is
one graph with the vendor domain — Contracts and Sub-outsourcing extend
``_vendor_governance``, the criticality cascade terminates in vendor tiering,
and the Asset<->Vendor / Process<->Vendor link tables span both packages — so
sweeps that touch this package must coordinate with vendor governance.

Transactions are service-owned (ADR-002) through ``commit_service_boundary``;
policy asserts authorization; projection serializes Read schemas with ADR-001
per-row capabilities. Closed-list enforcement comes from the
``_ict_register_reference`` registry (issue #41).
"""
