"""visible_*_ids unions department-scope and ownership-scope across roles."""

from __future__ import annotations

from dataclasses import dataclass

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import (
    visible_control_ids,
    visible_kri_ids,
    visible_risk_ids,
    visible_vendor_ids,
)
from app.models import ControlRiskLink, Department, Permission, Role, RolePermission, User
from app.models.user import AccessScope
from tests.backend.pytest.factories import (
    create_test_control,
    create_test_kri,
    create_test_risk,
    create_test_vendor,
)

pytestmark = pytest.mark.contract


ROLES = (
    "admin",
    "cro",
    "risk_manager",
    "department_risk_owner",
    "kri_reporting_owner",
    "control_owner",
    "auditor",
    "reviewer",
    "viewer",
)

GLOBAL_ROLES = {"admin", "cro", "risk_manager", "auditor"}


@dataclass(frozen=True)
class FixtureUniverse:
    user: User
    risk_ids: set[int]
    control_ids: set[int]
    kri_ids: set[int]
    vendor_ids: set[int]
    home_risk_id: int
    home_control_id: int
    home_kri_id: int
    home_vendor_id: int
    foreign_risk_id: int
    foreign_control_id: int
    foreign_kri_id: int
    foreign_vendor_id: int

    def expected_visible_risk_ids_for(self, role: str) -> set[int]:
        if role in GLOBAL_ROLES:
            return set(self.risk_ids)
        ids = {self.home_risk_id}
        if role in {"department_risk_owner", "kri_reporting_owner", "control_owner"}:
            ids.add(self.foreign_risk_id)
        return ids

    def expected_visible_control_ids_for(self, role: str) -> set[int]:
        if role in GLOBAL_ROLES:
            return set(self.control_ids)
        ids = {self.home_control_id}
        if role == "control_owner":
            ids.add(self.foreign_control_id)
        return ids

    def expected_visible_kri_ids_for(self, role: str) -> set[int]:
        if role in GLOBAL_ROLES:
            return set(self.kri_ids)
        ids = {self.home_kri_id}
        if role in {"department_risk_owner", "kri_reporting_owner", "control_owner"}:
            ids.add(self.foreign_kri_id)
        return ids

    def expected_visible_vendor_ids_for(self, role: str) -> set[int]:
        if role in GLOBAL_ROLES:
            return set(self.vendor_ids)
        ids = {self.home_vendor_id}
        if role == "reviewer":
            ids.add(self.foreign_vendor_id)
        return ids


async def build_user_for_role(
    db_session: AsyncSession,
    *,
    role: str,
    department_id: int,
) -> User:
    permission_specs = [("*", "*")] if role == "admin" else [
        ("risks", "read"),
        ("controls", "read"),
        ("vendors", "read"),
    ]
    role_model = Role(name=role, display_name=role.replace("_", " ").title(), description=f"{role} test role")
    db_session.add(role_model)
    await db_session.flush()

    permissions = [
        Permission(resource=resource, action=action, description=f"{resource}:{action}")
        for resource, action in permission_specs
    ]
    db_session.add_all(permissions)
    await db_session.flush()
    db_session.add_all(
        RolePermission(role_id=role_model.id, permission_id=permission.id)
        for permission in permissions
    )
    await db_session.flush()

    scope = AccessScope.GLOBAL if role in GLOBAL_ROLES else AccessScope.DEPARTMENT
    user = User(
        name=f"{role.replace('_', ' ').title()} User",
        email=f"{role}@ownership.test",
        department_id=department_id,
        role_id=role_model.id,
        is_active=True,
        access_scope=scope,
    )
    db_session.add(user)
    await db_session.commit()

    result = await db_session.execute(
        select(User)
        .options(
            selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission),
            selectinload(User.department),
        )
        .where(User.id == user.id)
    )
    return result.scalar_one()


@pytest_asyncio.fixture
async def fixture_universe(
    db_session: AsyncSession,
    role: str,
    test_department: Department,
) -> FixtureUniverse:
    user = await build_user_for_role(db_session, role=role, department_id=test_department.id)
    other_owner = User(
        name=f"{role.replace('_', ' ').title()} Other Owner",
        email=f"{role}.other@ownership.test",
        department_id=test_department.id,
        role_id=user.role_id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(other_owner)
    await db_session.commit()
    await db_session.refresh(other_owner)

    foreign_department = Department(
        name=f"Foreign Department {role}",
        code=f"FR-{role[:8]}",
        description="Foreign department for visibility characterization",
    )
    db_session.add(foreign_department)
    await db_session.commit()
    await db_session.refresh(foreign_department)

    home_risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=other_owner.id,
        risk_id_code=f"R-VIS-{role}-HOME",
        name=f"{role} home risk",
    )
    foreign_risk = await create_test_risk(
        db_session,
        department_id=foreign_department.id,
        owner_id=user.id if role == "department_risk_owner" else other_owner.id,
        risk_id_code=f"R-VIS-{role}-FOREIGN",
        name=f"{role} foreign risk",
    )
    home_kri = await create_test_kri(db_session, risk_id=home_risk.id, metric_name=f"{role} home KRI")
    foreign_kri = await create_test_kri(
        db_session,
        risk_id=foreign_risk.id,
        metric_name=f"{role} foreign KRI",
        overrides={
            "reporting_owner_id": user.id if role == "kri_reporting_owner" else other_owner.id,
        },
    )
    home_control = await create_test_control(
        db_session,
        department_id=test_department.id,
        owner_id=other_owner.id,
        name=f"{role} home control",
    )
    foreign_control = await create_test_control(
        db_session,
        department_id=foreign_department.id,
        owner_id=user.id if role == "control_owner" else other_owner.id,
        name=f"{role} foreign control",
    )
    db_session.add(ControlRiskLink(control_id=foreign_control.id, risk_id=foreign_risk.id))
    await db_session.commit()

    home_vendor = await create_test_vendor(
        db_session,
        department_id=test_department.id,
        owner_id=other_owner.id,
        name=f"{role} home vendor",
    )
    foreign_vendor = await create_test_vendor(
        db_session,
        department_id=foreign_department.id,
        owner_id=user.id if role == "reviewer" else other_owner.id,
        name=f"{role} foreign vendor",
    )

    return FixtureUniverse(
        user=user,
        risk_ids={home_risk.id, foreign_risk.id},
        control_ids={home_control.id, foreign_control.id},
        kri_ids={home_kri.id, foreign_kri.id},
        vendor_ids={home_vendor.id, foreign_vendor.id},
        home_risk_id=home_risk.id,
        home_control_id=home_control.id,
        home_kri_id=home_kri.id,
        home_vendor_id=home_vendor.id,
        foreign_risk_id=foreign_risk.id,
        foreign_control_id=foreign_control.id,
        foreign_kri_id=foreign_kri.id,
        foreign_vendor_id=foreign_vendor.id,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ROLES)
async def test_visible_ids_under_role_unions_department_and_ownership(
    db_session: AsyncSession,
    role: str,
    fixture_universe: FixtureUniverse,
) -> None:
    user = fixture_universe.user

    assert await visible_kri_ids(db_session, user, fixture_universe.kri_ids) == (
        fixture_universe.expected_visible_kri_ids_for(role)
    )
    assert await visible_risk_ids(db_session, user, fixture_universe.risk_ids) == (
        fixture_universe.expected_visible_risk_ids_for(role)
    )
    assert await visible_control_ids(db_session, user, fixture_universe.control_ids) == (
        fixture_universe.expected_visible_control_ids_for(role)
    )
    assert await visible_vendor_ids(db_session, user, fixture_universe.vendor_ids) == (
        fixture_universe.expected_visible_vendor_ids_for(role)
    )
