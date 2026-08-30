from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Asset,
    Control,
    Department,
    Issue,
    KeyRiskIndicator,
    Permission,
    Process,
    Risk,
    Role,
    RolePermission,
    Threat,
    User,
    Vendor,
)
from app.models.control import ControlStatus
from app.models.issue import IssueSeverity, IssueSourceType, IssueStatus
from app.models.risk import RiskStatus


async def _reload_user(db: AsyncSession, user_id: int) -> User:
    return (
        await db.execute(
            select(User)
            .options(
                selectinload(User.role)
                .selectinload(Role.permissions)
                .selectinload(RolePermission.permission),
                selectinload(User.department),
            )
            .where(User.id == user_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()


async def _grant_permission(
    db: AsyncSession,
    user: User,
    *,
    resource: str,
    action: str = "read",
) -> User:
    permission = Permission(
        resource=resource,
        action=action,
        description=f"Go To test {resource}:{action}",
    )
    db.add(permission)
    await db.flush()
    db.add(RolePermission(role_id=user.role_id, permission_id=permission.id))
    await db.commit()
    return await _reload_user(db, user.id)


def _risk(
    *,
    code: str,
    name: str,
    department_id: int,
    owner_id: int,
    archived: bool = False,
) -> Risk:
    return Risk(
        risk_id_code=code,
        name=name,
        process="Test process",
        description="Go To test Risk",
        department_id=department_id,
        owner_id=owner_id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
        is_archived=archived,
    )


def _control(
    *,
    name: str,
    department_id: int,
    owner_id: int,
    archived: bool = False,
) -> Control:
    return Control(
        name=name,
        description="Go To test Control",
        department_id=department_id,
        control_owner_id=owner_id,
        control_form="manual",
        frequency="monthly",
        status=ControlStatus.active.value,
        is_archived=archived,
    )


def _kri(
    *,
    name: str,
    risk_id: int,
    owner_id: int,
    archived: bool = False,
) -> KeyRiskIndicator:
    return KeyRiskIndicator(
        metric_name=name,
        description="Go To test KRI",
        risk_id=risk_id,
        reporting_owner_id=owner_id,
        current_value=1,
        lower_limit=0,
        upper_limit=2,
        unit="count",
        frequency="monthly",
        is_archived=archived,
    )


def _issue(*, name: str, department_id: int, owner_id: int) -> Issue:
    return Issue(
        title=name,
        description="Go To test Issue",
        severity=IssueSeverity.medium,
        status=IssueStatus.open,
        source_type=IssueSourceType.manual,
        department_id=department_id,
        owner_user_id=owner_id,
        created_by_id=owner_id,
    )


def _vendor(
    *,
    name: str,
    registration_id: str | None,
    department_id: int,
    owner_id: int,
    archived: bool = False,
) -> Vendor:
    return Vendor(
        name=name,
        registration_id=registration_id,
        process="Test process",
        department_id=department_id,
        outsourcing_owner_user_id=owner_id,
        is_archived=archived,
    )


def _process(
    *,
    code: str,
    name: str,
    department_id: int,
    owner_id: int,
    archived: bool = False,
) -> Process:
    return Process(
        f_code=code,
        l0_area="Test area",
        l1_process=name,
        owning_department_id=department_id,
        process_owner_user_id=owner_id,
        is_archived=archived,
    )


def _asset(
    *,
    name: str,
    department_id: int,
    owner_id: int,
    archived: bool = False,
) -> Asset:
    return Asset(
        name=name,
        owning_department_id=department_id,
        business_owner_user_id=owner_id,
        ict_owner_user_id=owner_id,
        is_archived=archived,
    )


def _threat(*, name: str, steward_id: int, archived: bool = False) -> Threat:
    return Threat(
        name=name,
        threat_steward_user_id=steward_id,
        is_archived=archived,
    )


@pytest.mark.asyncio
async def test_go_to_records_searches_all_eight_domains_with_safe_shape(
    db_session: AsyncSession,
    client_factory,
    test_department: Department,
    test_user_cro: User,
) -> None:
    risk = _risk(
        code="R-ATLAS",
        name="Atlas Risk",
        department_id=test_department.id,
        owner_id=test_user_cro.id,
    )
    db_session.add(risk)
    await db_session.flush()
    records = [
        risk,
        _control(
            name="Atlas Control",
            department_id=test_department.id,
            owner_id=test_user_cro.id,
        ),
        _kri(name="Atlas KRI", risk_id=risk.id, owner_id=test_user_cro.id),
        _issue(
            name="Atlas Issue",
            department_id=test_department.id,
            owner_id=test_user_cro.id,
        ),
        _vendor(
            name="Atlas Vendor",
            registration_id="V-ATLAS",
            department_id=test_department.id,
            owner_id=test_user_cro.id,
        ),
        _process(
            code="P-ATLAS",
            name="Atlas Process",
            department_id=test_department.id,
            owner_id=test_user_cro.id,
        ),
        _asset(
            name="Atlas Asset",
            department_id=test_department.id,
            owner_id=test_user_cro.id,
        ),
        _threat(name="Atlas Threat", steward_id=test_user_cro.id),
    ]
    db_session.add_all(records[1:])
    await db_session.commit()

    async with client_factory(current_user=test_user_cro) as client:
        response = await client.get("/api/v1/go-to/records", params={"q": "  ATLAS  "})

    assert response.status_code == 200
    body = response.json()
    assert [item["entity_type"] for item in body] == [
        "risk",
        "control",
        "kri",
        "issue",
        "vendor",
        "process",
        "asset",
        "threat",
    ]
    assert [item["business_identifier"] for item in body] == [
        "R-ATLAS",
        None,
        None,
        None,
        "V-ATLAS",
        "P-ATLAS",
        None,
        None,
    ]
    assert [item["status"] for item in body] == [
        "active",
        "active",
        "active",
        "open",
        "active",
        "active",
        "active",
        "active",
    ]
    assert [item["destination"] for item in body] == [
        f"/risks/{risk.id}",
        f"/controls/{records[1].id}",
        f"/kris/{records[2].id}",
        f"/issues/{records[3].id}",
        f"/vendors/{records[4].id}",
        f"/processes/{records[5].id}",
        f"/assets/{records[6].id}",
        f"/threats/{records[7].id}",
    ]
    assert all(
        set(item)
        == {
            "entity_type",
            "business_identifier",
            "display_name",
            "status",
            "destination",
        }
        for item in body
    )
    assert all("id" not in item for item in body)


@pytest.mark.asyncio
@pytest.mark.parametrize("query", ["", " ", "a", " a "])
async def test_go_to_records_rejects_trimmed_queries_shorter_than_two_characters(
    client_factory,
    test_user_cro: User,
    query: str,
) -> None:
    async with client_factory(current_user=test_user_cro) as client:
        response = await client.get("/api/v1/go-to/records", params={"q": query})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_go_to_records_requires_authentication(client) -> None:
    response = await client.get("/api/v1/go-to/records", params={"q": "atlas"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_go_to_records_applies_scope_owner_permission_and_archive_rules(
    db_session: AsyncSession,
    client_factory,
    test_department: Department,
    test_user_employee: User,
    test_user_cro: User,
) -> None:
    scoped_user = await _grant_permission(
        db_session,
        test_user_employee,
        resource="issues",
    )
    other_department = Department(
        name="Other Go To Department",
        code="GOTO-OTHER",
        is_active=True,
    )
    db_session.add(other_department)
    await db_session.flush()

    visible_risk = _risk(
        code="OWNER-VISIBLE",
        name="Owner Match Visible Risk",
        department_id=other_department.id,
        owner_id=scoped_user.id,
    )
    hidden_risk = _risk(
        code="OWNER-HIDDEN",
        name="Owner Match Hidden Risk",
        department_id=other_department.id,
        owner_id=test_user_cro.id,
    )
    secret_risk = _risk(
        code="SECRET-PROBE",
        name="Secret Probe Risk",
        department_id=other_department.id,
        owner_id=test_user_cro.id,
    )
    db_session.add_all([visible_risk, hidden_risk, secret_risk])
    await db_session.flush()
    db_session.add_all(
        [
            _control(
                name="Owner Match Visible Control",
                department_id=other_department.id,
                owner_id=scoped_user.id,
            ),
            _control(
                name="Owner Match Hidden Control",
                department_id=other_department.id,
                owner_id=test_user_cro.id,
            ),
            _kri(
                name="Owner Match Visible KRI",
                risk_id=visible_risk.id,
                owner_id=scoped_user.id,
            ),
            _kri(
                name="Owner Match Hidden KRI",
                risk_id=hidden_risk.id,
                owner_id=test_user_cro.id,
            ),
            _issue(
                name="Owner Match Visible Issue",
                department_id=other_department.id,
                owner_id=scoped_user.id,
            ),
            _issue(
                name="Owner Match Hidden Issue",
                department_id=other_department.id,
                owner_id=test_user_cro.id,
            ),
            _vendor(
                name="Owner Match Visible Vendor",
                registration_id=None,
                department_id=other_department.id,
                owner_id=scoped_user.id,
            ),
            _vendor(
                name="Owner Match Hidden Vendor",
                registration_id=None,
                department_id=other_department.id,
                owner_id=test_user_cro.id,
            ),
            _process(
                code="OWNER-P-VISIBLE",
                name="Owner Match Visible Process",
                department_id=other_department.id,
                owner_id=scoped_user.id,
            ),
            _process(
                code="OWNER-P-HIDDEN",
                name="Owner Match Hidden Process",
                department_id=other_department.id,
                owner_id=test_user_cro.id,
            ),
            _asset(
                name="Owner Match Visible Asset",
                department_id=other_department.id,
                owner_id=scoped_user.id,
            ),
            _asset(
                name="Owner Match Hidden Asset",
                department_id=other_department.id,
                owner_id=test_user_cro.id,
            ),
            _threat(name="Owner Match Threat", steward_id=test_user_cro.id),
        ]
    )
    await db_session.commit()

    async with client_factory(current_user=scoped_user) as client:
        response = await client.get(
            "/api/v1/go-to/records",
            params={"q": "owner match"},
        )
        hidden_only = await client.get(
            "/api/v1/go-to/records",
            params={"q": "secret probe"},
        )

    assert response.status_code == 200
    assert [item["entity_type"] for item in response.json()] == [
        "risk",
        "control",
        "kri",
        "issue",
        "vendor",
        "process",
        "asset",
        "threat",
    ]
    assert all("Hidden" not in item["display_name"] for item in response.json())
    assert hidden_only.status_code == 200
    assert hidden_only.json() == []

    archived_parent = _risk(
        code="RETIRED-PARENT",
        name="Retired Parent Risk",
        department_id=test_department.id,
        owner_id=scoped_user.id,
        archived=True,
    )
    db_session.add(archived_parent)
    await db_session.flush()
    db_session.add_all(
        [
            _kri(
                name="Retired Child KRI",
                risk_id=archived_parent.id,
                owner_id=scoped_user.id,
            ),
            _control(
                name="Retired Control",
                department_id=test_department.id,
                owner_id=scoped_user.id,
                archived=True,
            ),
            _vendor(
                name="Retired Vendor",
                registration_id=None,
                department_id=test_department.id,
                owner_id=scoped_user.id,
                archived=True,
            ),
            _process(
                code="RETIRED-PROCESS",
                name="Retired Process",
                department_id=test_department.id,
                owner_id=scoped_user.id,
                archived=True,
            ),
            _asset(
                name="Retired Asset",
                department_id=test_department.id,
                owner_id=scoped_user.id,
                archived=True,
            ),
            _threat(
                name="Retired Threat",
                steward_id=scoped_user.id,
                archived=True,
            ),
        ]
    )
    await db_session.commit()

    async with client_factory(current_user=scoped_user) as client:
        archived = await client.get(
            "/api/v1/go-to/records",
            params={"q": "retired"},
        )

    assert archived.status_code == 200
    assert archived.json() == []


@pytest.mark.asyncio
async def test_go_to_records_requires_issues_read_even_for_issue_owner(
    db_session: AsyncSession,
    client_factory,
    test_department: Department,
    test_user_directory_reader: User,
) -> None:
    db_session.add(
        _issue(
            name="Issue Permission Secret",
            department_id=test_department.id,
            owner_id=test_user_directory_reader.id,
        )
    )
    await db_session.commit()

    async with client_factory(current_user=test_user_directory_reader) as client:
        response = await client.get(
            "/api/v1/go-to/records",
            params={"q": "issue permission"},
        )

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_go_to_records_excludes_processes_from_platform_admin(
    db_session: AsyncSession,
    client_factory,
    test_department: Department,
    test_user_platform_admin: User,
) -> None:
    db_session.add(
        _process(
            code="ADMIN-PROCESS",
            name="Admin Process Secret",
            department_id=test_department.id,
            owner_id=test_user_platform_admin.id,
        )
    )
    await db_session.commit()

    async with client_factory(current_user=test_user_platform_admin) as client:
        response = await client.get(
            "/api/v1/go-to/records",
            params={"q": "admin process"},
        )

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_go_to_records_treats_wildcards_and_backslash_as_literal_text(
    db_session: AsyncSession,
    client_factory,
    test_department: Department,
    test_user_cro: User,
) -> None:
    db_session.add_all(
        [
            _asset(
                name="Literal %_\\ Token",
                department_id=test_department.id,
                owner_id=test_user_cro.id,
            ),
            _asset(
                name="Literal AX\\ Token",
                department_id=test_department.id,
                owner_id=test_user_cro.id,
            ),
            _asset(
                name="Literal %_X Token",
                department_id=test_department.id,
                owner_id=test_user_cro.id,
            ),
        ]
    )
    await db_session.commit()

    async with client_factory(current_user=test_user_cro) as client:
        response = await client.get(
            "/api/v1/go-to/records",
            params={"q": "%_\\"},
        )

    assert response.status_code == 200
    assert [item["display_name"] for item in response.json()] == ["Literal %_\\ Token"]


@pytest.mark.asyncio
async def test_go_to_records_globally_ranks_and_limits_results(
    db_session: AsyncSession,
    client_factory,
    test_department: Department,
    test_user_cro: User,
) -> None:
    db_session.add_all(
        [
            _risk(
                code="needle",
                name="Zeta exact Risk",
                department_id=test_department.id,
                owner_id=test_user_cro.id,
            ),
            _process(
                code="needle",
                name="Zeta exact Process",
                department_id=test_department.id,
                owner_id=test_user_cro.id,
            ),
            _control(
                name="Needle prefix Control",
                department_id=test_department.id,
                owner_id=test_user_cro.id,
            ),
            _issue(
                name="Hay Needle Issue",
                department_id=test_department.id,
                owner_id=test_user_cro.id,
            ),
            *[
                _asset(
                    name=f"Hay Needle Asset {index:02d}",
                    department_id=test_department.id,
                    owner_id=test_user_cro.id,
                )
                for index in range(25)
            ],
        ]
    )
    await db_session.commit()

    async with client_factory(current_user=test_user_cro) as client:
        response = await client.get(
            "/api/v1/go-to/records",
            params={"q": "needle"},
        )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 20
    assert [item["entity_type"] for item in body[:4]] == [
        "risk",
        "process",
        "control",
        "issue",
    ]
    assert [item["display_name"] for item in body[4:]] == [
        f"Hay Needle Asset {index:02d}" for index in range(16)
    ]
