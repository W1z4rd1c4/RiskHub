from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.core.exceptions import (
    AuthorizationError,
    NotFoundError,
    ValidationError,
    domain_error_handler,
)
from app.models.role import RoleType
from app.services._access_workflow import policy


def _user(
    role_name: RoleType,
    *,
    user_id: int = 1,
    role_id: int = 10,
    department_id: int | None = 20,
):
    return SimpleNamespace(
        id=user_id,
        role=SimpleNamespace(name=role_name),
        role_id=role_id,
        department_id=department_id,
    )


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
async def test_access_update_hidden_admin_uses_domain_not_found_error():
    current_user = _user(RoleType.CRO)
    target_user = _user(RoleType.ADMIN, user_id=2)

    with pytest.raises(NotFoundError, match="User not found"):
        await policy.authorize_access_update_fields(
            db=SimpleNamespace(),
            current_user=current_user,
            target_user=target_user,
            update_data={"department_id": 30},
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("current_role", "update_data", "expected_detail"),
    (
        (
            RoleType.RISK_MANAGER,
            {"name": "Updated name"},
            "Only Admin can update user identity fields",
        ),
        (
            RoleType.RISK_MANAGER,
            {"department_id": 30},
            "Only CRO can update user business access fields",
        ),
        (
            RoleType.CRO,
            {"is_active": False},
            "Only Admin can change user active status",
        ),
    ),
)
async def test_access_update_field_policy_uses_domain_authorization_errors(
    current_role,
    update_data,
    expected_detail,
):
    with pytest.raises(AuthorizationError, match=expected_detail):
        await policy.authorize_access_update_fields(
            db=SimpleNamespace(),
            current_user=_user(current_role),
            target_user=_user(RoleType.RISK_MANAGER, user_id=2),
            update_data=update_data,
        )


@pytest.mark.asyncio
async def test_access_update_missing_role_uses_domain_validation_error():
    db = SimpleNamespace(
        execute=AsyncMock(
            return_value=SimpleNamespace(scalar_one_or_none=lambda: None)
        )
    )

    with pytest.raises(ValidationError, match="Invalid role_id"):
        await policy.authorize_access_update_fields(
            db=db,
            current_user=_user(RoleType.ADMIN),
            target_user=_user(RoleType.RISK_MANAGER, user_id=2, role_id=10),
            update_data={"role_id": 99},
        )

    db.execute.assert_awaited_once()


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
