from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pytest

from app.schemas.collection import CollectionGroupRead
from app.services._register_listings.lifecycle import build_in_memory_register_response

pytestmark = pytest.mark.contract

ROOT = Path(__file__).resolve().parents[4]

REGISTER_ENDPOINTS = {
    "risks": "backend/app/api/v1/endpoints/risks/crud/list.py",
    "controls": "backend/app/api/v1/endpoints/controls/crud/list.py",
    "kris": "backend/app/api/v1/endpoints/kris/crud/list.py",
    "issues": "backend/app/api/v1/endpoints/issues/crud/list.py",
    "vendors": "backend/app/api/v1/endpoints/vendors/crud.py",
    "processes": "backend/app/api/v1/endpoints/processes/crud.py",
    "assets": "backend/app/api/v1/endpoints/assets/crud.py",
    "threats": "backend/app/api/v1/endpoints/threats/crud.py",
}


def _read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


@dataclass(frozen=True)
class _Criteria:
    offset: int = 5
    limit: int = 10
    group_by: str | None = None
    group_value: str | None = None


@dataclass(frozen=True)
class _Result:
    matching_items: list[str]
    page_items: list[str]
    groups: list[CollectionGroupRead]
    facets: dict[str, list[object]]


class _Response:
    def __init__(self, **payload: object) -> None:
        self.payload = payload


def test_in_memory_register_response_uses_one_grouping_and_pagination_lifecycle() -> None:
    group = CollectionGroupRead(value="one", label="One", count=2)
    result = _Result(
        matching_items=["one", "two"],
        page_items=["two"],
        groups=[group],
        facets={"status": []},
    )

    summary = build_in_memory_register_response(
        response_model=_Response,
        criteria=_Criteria(group_by="status"),
        result=result,
        capabilities={"can_create": True},
    )
    drilldown = build_in_memory_register_response(
        response_model=_Response,
        criteria=_Criteria(group_by="status", group_value="one"),
        result=result,
        capabilities={"can_create": True},
    )

    assert summary.payload == {
        "items": [],
        "total": 2,
        "offset": 5,
        "limit": 10,
        "capabilities": {"can_create": True},
        "groups": [group],
        "facets": {"status": []},
    }
    assert drilldown.payload["items"] == ["two"]


def test_all_eight_registers_use_the_normalized_query_boundary() -> None:
    for name, endpoint_path in REGISTER_ENDPOINTS.items():
        source = _read(endpoint_path)
        assert "build_list_context(" in source, f"{name} bypasses normalized collection input"


def test_all_eight_registers_use_the_shared_listing_lifecycle() -> None:
    sql_backed = ("risks", "controls", "kris", "issues")
    in_memory = ("processes", "assets", "threats")

    for name in sql_backed:
        assert "execute_register_listing_plan(" in _read(REGISTER_ENDPOINTS[name])
    assert "list_vendor_governance(" in _read(REGISTER_ENDPOINTS["vendors"])
    for name in in_memory:
        assert "build_in_memory_register_response(" in _read(REGISTER_ENDPOINTS[name])


def test_register_default_order_has_a_stable_entity_tiebreaker() -> None:
    stable_order_markers = {
        "risks": "Risk.id",
        "controls": "id_order",
        "kris": "KeyRiskIndicator.id",
        "issues": "Issue.id.desc()",
        "vendors": "direction(Vendor.id)",
        "processes": "(value(item), item.id)",
        "assets": "(value(item), item.id)",
        "threats": "(value(item), item.id)",
    }
    for name, marker in stable_order_markers.items():
        service_source = _read(f"backend/app/services/_register_listings/{name}.py")
        assert marker in service_source, f"{name} has no deterministic entity tiebreaker"


def test_superseded_endpoint_execution_facade_is_removed() -> None:
    assert not (ROOT / "backend/app/api/v1/endpoints/_collection_execution.py").exists()
    for endpoint_path in REGISTER_ENDPOINTS.values():
        assert "_collection_execution" not in _read(endpoint_path)


def test_all_eight_facet_builders_are_anchored_to_readable_scope() -> None:
    scope_markers = {
        "risks": ("_build_risk_facets", "scoped_ids=facet_query.subquery()"),
        "controls": ("_build_control_facets", "scoped_ids=facet_scope_query.subquery()"),
        "kris": ("_build_kri_facets", "readable_ids=readable_ids", "scoped_ids=scoped_ids"),
        "issues": ("get_issue_scope_clause", "_build_issue_facets", "scoped_ids="),
        "vendors": ("visible_query = apply_vendor_visibility_scope", "_build_vendor_facets"),
        "processes": ("_load_visible_link_context", "facets = _build_facets(all_items"),
        "assets": ("_load_visible_link_context", "facets = _build_facets(all_items"),
        "threats": ("_load_visible_risk_context", "facets = _build_facets(all_items"),
    }
    for name, markers in scope_markers.items():
        service_source = _read(f"backend/app/services/_register_listings/{name}.py")
        assert all(marker in service_source for marker in markers), f"{name} facets bypass readable scope"


def test_permission_scope_regressions_cover_all_eight_registers() -> None:
    regression_markers = {
        "tests/backend/pytest/test_risk_control_register_framework.py": (
            "test_risk_control_facets_do_not_leak_foreign_department_or_hidden_link_context",
        ),
        "tests/backend/pytest/test_kri_issue_register_framework.py": (
            "test_issue_facets_do_not_leak_out_of_scope_departments",
        ),
        "tests/backend/pytest/test_kris_rbac.py": (
            "test_unrelated_scoped_user_cannot_read_cross_department_kri_surfaces",
        ),
        "tests/backend/pytest/test_vendors.py": (
            "test_vendors_list_scoping_includes_cross_department_owner",
        ),
        "tests/backend/pytest/test_process_register_framework.py": (
            "test_process_link_filters_lookups_and_record_owner_non_leakage",
        ),
        "tests/backend/pytest/test_asset_register_framework.py": (
            "test_asset_lookup_and_link_filters_do_not_leak_hidden_counterparts",
        ),
        "tests/backend/pytest/test_threat_register_framework.py": (
            "test_threat_readable_risk_context_multi_membership_filters_and_lookups_do_not_leak",
        ),
    }
    for path, markers in regression_markers.items():
        source = _read(path)
        assert all(marker in source for marker in markers), f"missing scoped-facet regression in {path}"
