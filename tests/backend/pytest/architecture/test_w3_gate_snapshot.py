from __future__ import annotations

import pytest
from fastapi.routing import APIRoute

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


def test_endpoint_method_required_capability_map_includes_core_read_gates():
    route_map = _route_capability_map()

    assert route_map[("GET", "/risks")] == "risks:read"
    assert route_map[("GET", "/controls")] == "controls:read"
    assert route_map[("GET", "/vendors")] == "vendors:read"
    assert route_map[("GET", "/departments")] == "departments:read"
