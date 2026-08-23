from types import SimpleNamespace

import pytest

from app.core.exceptions import (
    AuthorizationError,
    NotFoundError,
    ValidationError,
    domain_error_handler,
)
from app.models.role import RoleType
from app.services._access_workflow import policy


def test_department_roster_policy_uses_domain_authorization_error(monkeypatch):
    user = SimpleNamespace(role=None, department_id=None)
    monkeypatch.setattr(
        policy,
        "can_view_department_access_roster",
        lambda _user: False,
    )

    with pytest.raises(
        AuthorizationError,
        match="Only department heads or privileged users can view department access",
    ):
        policy.resolve_department_access_roster_target(user, None)


def test_department_roster_policy_uses_domain_validation_error(monkeypatch):
    user = SimpleNamespace(role=None, department_id=None)
    monkeypatch.setattr(
        policy,
        "can_view_department_access_roster",
        lambda _user: True,
    )

    with pytest.raises(
        ValidationError,
        match="You are not assigned to a department",
    ):
        policy.resolve_department_access_roster_target(user, None)


def test_department_head_cross_department_denial_is_domain_error(monkeypatch):
    user = SimpleNamespace(
        role=SimpleNamespace(name=RoleType.DEPARTMENT_HEAD),
        department_id=10,
    )
    monkeypatch.setattr(
        policy,
        "can_view_department_access_roster",
        lambda _user: True,
    )

    with pytest.raises(
        AuthorizationError,
        match="Access denied to this department",
    ):
        policy.resolve_department_access_roster_target(user, 20)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("error_type", "expected_status"),
    (
        (ValidationError, 400),
        (AuthorizationError, 403),
        (NotFoundError, 404),
    ),
)
async def test_access_policy_domain_errors_keep_existing_http_projection(
    error_type,
    expected_status,
):
    response = await domain_error_handler(None, error_type("contract detail"))

    assert response.status_code == expected_status
    assert response.body == b'{"detail":"contract detail"}'
