from __future__ import annotations

import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def test_business_logic_docs_match_reserved_and_threshold_contracts() -> None:
    business_logic = (REPO_ROOT / "docs/BUSINESS_LOGIC.md").read_text()

    assert "| `critical_risk_min_net_score` | 16 | Critical risk threshold |" in business_logic
    assert "| ISSUE_EXCEPTION | CREATE, UPDATE, APPROVE, STATUS_CHANGE |" in business_logic
    assert "| ISSUE_EXCEPTION | CREATE, UPDATE, APPROVE, REJECT |" not in business_logic
    assert "Risks, Controls, KRIs, and Vendors unified exports apply scope after as-of replay" in business_logic
    assert "Issues exports are fetch-time scoped and do not use as-of replay" in business_logic
    assert "Vendor archive truth: is_archived=true" in business_logic
    assert "Vendors: `status = 'inactive'` (inactive is the archived state)" not in business_logic
    assert "Inactive vendors are archived resources" not in business_logic
    assert (
        "| Vendors list/search | Inactive hidden | `include_archived=true` includes inactive vendors |"
        not in business_logic
    )
    assert "| `POST /api/v1/vendors/{id}/restore` | `vendors:delete` | `status='active'` |" not in business_logic
    assert "Vendors: archived semantics use `status = inactive`" not in business_logic

    for reserved_name in (
        "VENDOR_ASSESSMENT",
        "VENDOR_INCIDENT",
        "VENDOR_SLA",
        "VENDOR_REMEDIATION",
        "CONTROL_OWNER",
        "controls:approve",
    ):
        assert reserved_name in business_logic
        assert (
            f"{reserved_name}` | **Reserved**" in business_logic
            or f"{reserved_name} | **Reserved**" in business_logic
        )

    # vendor_contracts shipped with the ICT Register (issue #44): the surface
    # is documented as live grants, never as reserved (ADR-009 unreserve path).
    for shipped_name in ("vendor_contracts:read", "vendor_contracts:write"):
        assert shipped_name in business_logic
        assert f"{shipped_name}` | **Reserved**" not in business_logic
        assert f"{shipped_name} | **Reserved**" not in business_logic


def test_reserved_surfaces_registry_covers_code_and_docs() -> None:
    registry_path = REPO_ROOT / "backend/app/api/v1/endpoints/_reserved_modules.toml"
    registry = tomllib.loads(registry_path.read_text())
    reserved = {(entry["kind"], entry["name"]) for entry in registry["reserved"]}

    assert {
        ("activity_entity_type", "VENDOR_ASSESSMENT"),
        ("activity_entity_type", "VENDOR_INCIDENT"),
        ("activity_entity_type", "VENDOR_SLA"),
        ("activity_entity_type", "VENDOR_REMEDIATION"),
        ("role", "CONTROL_OWNER"),
        ("permission", "controls:approve"),
    }.issubset(reserved)

    # The vendor-contracts surface shipped with the ICT Register (issue #44):
    # its reservation entries are retired per the ADR-009 unreserve path.
    assert ("permission", "vendor_contracts:read") not in reserved
    assert ("permission", "vendor_contracts:write") not in reserved

    activity_log_source = (REPO_ROOT / "backend/app/models/activity_log.py").read_text()
    role_source = (REPO_ROOT / "backend/app/models/role.py").read_text()
    rbac_source = (REPO_ROOT / "backend/app/db/rbac_seed_contract.py").read_text()

    assert "Reserved: vendor extended domains" in activity_log_source
    assert "Reserved: control owner role" in role_source
    assert "Reserved: future control approval workflow" in rbac_source
    # Shipped with issue #44: the code-site reservation annotation is retired.
    assert "Reserved: vendor contract governance" not in rbac_source


def test_engineering_docs_link_new_architecture_surfaces() -> None:
    docs_readme = (REPO_ROOT / "docs/README.md").read_text()
    documentation_tree = (REPO_ROOT / "docs/DOCUMENTATION_TREE.md").read_text()

    combined = f"{docs_readme}\n{documentation_tree}"

    for heading in ("Architecture Locks", "Authorization Capability Contract", "client_factory"):
        assert f"## {heading}" in combined

    for path in (
        "tests/backend/pytest/architecture/",
        "tests/backend/pytest/_get_db_override_whitelist.toml",
        "backend/app/api/v1/endpoints/_reserved_modules.toml",
    ):
        assert path in combined
