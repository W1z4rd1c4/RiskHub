from __future__ import annotations

import pytest
from fastapi.routing import APIRoute

from app.api.v1.router import api_router

pytestmark = pytest.mark.contract


def test_revoke_user_session_resolves_to_session_revoke_capability() -> None:
    route = next(
        route
        for route in api_router.routes
        if isinstance(route, APIRoute) and route.name == "revoke_user_session"
    )

    capabilities = {
        getattr(dependency.call, "required_capability", None)
        for dependency in route.dependant.dependencies
    }

    assert ("admin", "session.revoke") in capabilities
