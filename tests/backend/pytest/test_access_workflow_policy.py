from types import SimpleNamespace

import pytest

from app.core.exceptions import AuthorizationError, ValidationError
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
