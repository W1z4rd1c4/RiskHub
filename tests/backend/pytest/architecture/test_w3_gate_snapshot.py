from __future__ import annotations

import ast
import inspect
from textwrap import dedent

import pytest
from fastapi.routing import APIRoute

from app.api import deps
from app.api.v1.router import api_router

pytestmark = pytest.mark.contract


def _route_capability_map() -> dict[tuple[str, str], str]:
    route_map: dict[tuple[str, str], str] = {}
    for route in api_router.routes:
        if not isinstance(route, APIRoute):
            continue
        for dependency in route.dependant.dependencies:
            capability = getattr(dependency.call, "required_capability", None)
            if capability is None:
                continue
            resource, action = capability
            for method in sorted((route.methods or set()) - {"HEAD", "OPTIONS"}):
                route_map[(method, route.path)] = f"{resource}:{action}"
    return route_map


def _route(*, method: str, path: str) -> APIRoute:
    return next(
        route
        for route in api_router.routes
        if isinstance(route, APIRoute)
        and route.path == path
        and method in (route.methods or set())
    )


def _awaited_calls(route: APIRoute) -> set[str]:
    tree = ast.parse(dedent(inspect.getsource(route.endpoint)))
    return {
        node.value.func.id
        for node in ast.walk(tree)
        if isinstance(node, ast.Await)
        and isinstance(node.value, ast.Call)
        and isinstance(node.value.func, ast.Name)
    }


def test_endpoint_method_required_capability_map_includes_core_read_gates():
    route_map = _route_capability_map()

    assert route_map[("GET", "/risks")] == "risks:read"
    assert route_map[("GET", "/controls")] == "controls:read"
    assert route_map[("GET", "/departments")] == "departments:read"

    # Vendor accountability is intentionally record-specific: an authenticated
    # Outsourcing Owner may list only owned rows without gaining vendors:read.
    # Keep that exception attached to the canonical service gate rather than a
    # permissive route-level dependency.
    assert ("GET", "/vendors") not in route_map
    vendor_route = _route(method="GET", path="/vendors")
    assert any(
        dependency.call is deps.get_current_user
        for dependency in vendor_route.dependant.dependencies
    )
    assert "assert_vendor_list_allowed" in _awaited_calls(
        vendor_route
    )
