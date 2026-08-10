from __future__ import annotations

import csv
import io
import json

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Department, Permission, Risk, Role, RolePermission, Threat, ThreatRiskLink, User
from app.models.user import AccessScope


async def _ciso_steward(db_session: AsyncSession, *, department_id: int | None = None) -> User:
    role = Role(name="ciso", display_name="Chief Information Security Officer")
    db_session.add(role)
    await db_session.flush()
    user = User(
        name="Clara Security",
        email="clara.security@test.local",
        role_id=role.id,
        department_id=department_id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    return user


async def _user_with_permissions(
    db_session: AsyncSession,
    *,
    role_name: str,
    permission_keys: tuple[str, ...],
) -> User:
    role = Role(name=role_name, display_name=role_name.replace("_", " ").title())
    db_session.add(role)
    await db_session.flush()
    permissions = []
    for key in permission_keys:
        resource, action = key.split(":", maxsplit=1)
        permission = Permission(resource=resource, action=action, description=key)
        db_session.add(permission)
        permissions.append(permission)
    await db_session.flush()
    db_session.add_all(
        RolePermission(role_id=role.id, permission_id=permission.id)
        for permission in permissions
    )
    user = User(
        name="Threat Catalog Reader",
        email=f"{role_name}@test.local",
        role_id=role.id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    return (
        await db_session.execute(
            select(User)
            .options(
                selectinload(User.role)
                .selectinload(Role.permissions)
                .selectinload(RolePermission.permission)
            )
            .where(User.id == user.id)
        )
    ).scalar_one()


def _payload(steward_id: int, *, name: str, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": name,
        "threat_steward_user_id": steward_id,
        "category": "availability",
        "description": "Encryption of production data",
        "typical_weaknesses": "Unpatched systems and phishing",
        "relevant_subject": "ICT asset",
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_threat_shared_filters_groups_search_and_unpaged_export(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_department: Department,
) -> None:
    steward = await _ciso_steward(db_session, department_id=test_department.id)
    async with client_factory(user=test_user_cro) as client:
        ransomware = (
            await client.post(
                "/api/v1/threats",
                json=_payload(steward.id, name="Ransomware"),
            )
        ).json()
        phishing = (
            await client.post(
                "/api/v1/threats",
                json=_payload(
                    steward.id,
                    name="Phishing",
                    category="personnel",
                    description="Credential harvesting",
                    typical_weaknesses="Limited awareness",
                    relevant_subject="Employee",
                ),
            )
        ).json()

        filtered = await client.get(
            "/api/v1/threats",
            params={
                "filters": json.dumps(
                    {
                        "search": "unpatched",
                        "categories": ["availability", "integrity"],
                        "steward_ids": [steward.id],
                        "relevant_subjects": ["ICT asset"],
                        "has_linked_risk": False,
                    }
                )
            },
        )
        assert filtered.status_code == 200, filtered.text
        assert [row["id"] for row in filtered.json()["items"]] == [ransomware["id"]]
        assert filtered.json()["capabilities"] == {"can_create": True, "can_export": True}
        assert {row["value"] for row in filtered.json()["facets"]["lifecycle"]} == {
            "active",
            "archived",
        }
        category_facets = {row["value"]: row for row in filtered.json()["facets"]["category"]}
        assert category_facets["availability"]["selected"] is True
        assert category_facets["personnel"]["count"] == 0
        assert category_facets["personnel"]["disabled"] is True

        for search in (
            "Ransomware",
            "Encryption of production data",
            "Unpatched systems",
            "ICT asset",
            "Clara Security",
        ):
            searched = await client.get("/api/v1/threats", params={"search": search})
            assert searched.status_code == 200, searched.text
            assert ransomware["id"] in {row["id"] for row in searched.json()["items"]}

        category_summary = await client.get("/api/v1/threats", params={"view": "category"})
        assert category_summary.status_code == 200, category_summary.text
        assert category_summary.json()["items"] == []
        assert {row["value"] for row in category_summary.json()["groups"]} >= {
            "category:availability",
            "category:personnel",
        }
        steward_summary = (await client.get("/api/v1/threats", params={"view": "threat_steward"})).json()
        assert steward_summary["items"] == []
        assert steward_summary["groups"][0]["value"] == f"steward:{steward.id}"
        assert steward_summary["groups"][0]["count"] == 2
        subject_summary = (await client.get("/api/v1/threats", params={"view": "relevant_subject"})).json()
        assert subject_summary["items"] == []
        assert {row["value"] for row in subject_summary["groups"]} == {
            "relevant_subject:ICT asset",
            "relevant_subject:Employee",
        }
        personnel = await client.get(
            "/api/v1/threats",
            params={"group_by": "category", "group_value": "category:personnel"},
        )
        assert [row["id"] for row in personnel.json()["items"]] == [phishing["id"]]

        assert (await client.delete(f"/api/v1/threats/{phishing['id']}")).status_code == 204
        archived = await client.get("/api/v1/threats", params=[("lifecycle", "archived")])
        assert [row["id"] for row in archived.json()["items"]] == [phishing["id"]]

        exported = await client.get(
            "/api/v1/threats/export",
            params={"limit": 1, "include_archived": "true", "locale": "cs"},
        )
        assert exported.status_code == 200, exported.text
        rows = list(csv.DictReader(io.StringIO(exported.text)))
        assert {row["name"] for row in rows} == {"Ransomware", "Phishing"}
        assert next(row for row in rows if row["name"] == "Ransomware")["category_label"] == "Dostupnost"

        grouped_export = await client.get(
            "/api/v1/threats/export",
            params={
                "include_archived": "true",
                "group_by": "category",
                "group_value": "category:personnel",
            },
        )
        assert grouped_export.status_code == 200, grouped_export.text
        assert [row["name"] for row in csv.DictReader(io.StringIO(grouped_export.text))] == ["Phishing"]


@pytest.mark.asyncio
async def test_threat_readable_risk_context_multi_membership_filters_and_lookups_do_not_leak(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_employee: User,
    test_department: Department,
) -> None:
    hidden_department = Department(name="Hidden Department", code="HIDDEN", is_active=True)
    db_session.add(hidden_department)
    await db_session.flush()
    steward = await _ciso_steward(db_session, department_id=test_department.id)

    async with client_factory(user=test_user_cro) as client:
        threat = (
            await client.post(
                "/api/v1/threats",
                json=_payload(steward.id, name="Multi-linked Threat"),
            )
        ).json()

    risks = [
        Risk(
            risk_id_code="R-READ-A",
            name="Readable Alpha",
            process="Operations",
            description="Readable risk A",
            risk_type="operational",
            department_id=test_department.id,
            owner_id=test_user_cro.id,
        ),
        Risk(
            risk_id_code="R-READ-B",
            name="Readable Beta",
            process="Operations",
            description="Readable risk B",
            risk_type="strategic",
            department_id=test_department.id,
            owner_id=test_user_cro.id,
        ),
        Risk(
            risk_id_code="R-HIDDEN",
            name="Hidden Risk",
            process="Security",
            description="Hidden risk",
            risk_type="strategic",
            department_id=hidden_department.id,
            owner_id=test_user_cro.id,
        ),
    ]
    db_session.add_all(risks)
    await db_session.flush()
    db_session.add_all(ThreatRiskLink(threat_id=threat["id"], risk_id=risk.id) for risk in risks)
    await db_session.commit()

    async with client_factory(user=test_user_employee) as client:
        grouped = await client.get("/api/v1/threats", params={"view": "linked_risk"})
        assert grouped.status_code == 200, grouped.text
        assert grouped.json()["items"] == []
        assert {row["value"] for row in grouped.json()["groups"]} == {
            f"risk:{risks[0].id}",
            f"risk:{risks[1].id}",
        }
        assert all("Hidden" not in row["label"] for row in grouped.json()["groups"])

        filtered = await client.get(
            "/api/v1/threats",
            params={
                "linked_risk_types": "strategic",
                "linked_risk_department_ids": test_department.id,
                "has_linked_risk": "true",
            },
        )
        assert filtered.status_code == 200, filtered.text
        assert [row["id"] for row in filtered.json()["items"]] == [threat["id"]]
        assert filtered.json()["items"][0]["visible_linked_risk_count"] == 2
        linked_risk = await client.get(
            "/api/v1/threats",
            params={"linked_risk_ids": risks[0].id},
        )
        assert [row["id"] for row in linked_risk.json()["items"]] == [threat["id"]]

        risk_lookups = await client.get(
            "/api/v1/threats/lookups/risks",
            params={"selected_ids": risks[1].id, "limit": 1},
        )
        assert [row["id"] for row in risk_lookups.json()] == [risks[1].id]
        assert "R-HIDDEN" not in risk_lookups.text
        department_lookups = await client.get("/api/v1/threats/lookups/risk-departments")
        assert [row["id"] for row in department_lookups.json()] == [test_department.id]
        assert "Hidden Department" not in department_lookups.text

        hidden_selection = await client.get(
            "/api/v1/threats/lookups/risks",
            params={"selected_ids": risks[2].id},
        )
        assert "R-HIDDEN" not in hidden_selection.text


@pytest.mark.asyncio
async def test_threat_steward_filter_lookup_limits_discovery_but_resolves_selected_history(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_department: Department,
) -> None:
    active_steward = await _ciso_steward(db_session, department_id=test_department.id)
    former_role = Role(name="former_ciso", display_name="Former CISO")
    db_session.add(former_role)
    await db_session.flush()
    inactive_steward = User(
        name="Historical Inactive Steward",
        email="historical-inactive@test.local",
        role_id=active_steward.role_id,
        department_id=test_department.id,
        access_scope=AccessScope.GLOBAL,
        is_active=False,
    )
    role_lost_steward = User(
        name="Historical Role-Lost Steward",
        email="historical-role-lost@test.local",
        role_id=former_role.id,
        department_id=test_department.id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    unrelated_user = User(
        name="Hidden Unrelated Identity",
        email="hidden-unrelated@test.local",
        role_id=former_role.id,
        department_id=test_department.id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    db_session.add_all([inactive_steward, role_lost_steward, unrelated_user])
    await db_session.flush()
    db_session.add_all(
        [
            Threat(name="Active steward filter row", threat_steward_user_id=active_steward.id),
            Threat(name="Inactive steward filter row", threat_steward_user_id=inactive_steward.id),
            Threat(name="Role-lost steward filter row", threat_steward_user_id=role_lost_steward.id),
        ]
    )
    await db_session.commit()

    async with client_factory(user=test_user_cro) as client:
        ordinary = await client.get("/api/v1/threats/lookups/stewards")
        searched_history = await client.get(
            "/api/v1/threats/lookups/stewards",
            params={"search": "Historical"},
        )
        selected_history = await client.get(
            "/api/v1/threats/lookups/stewards",
            params=[
                ("selected_ids", inactive_steward.id),
                ("selected_ids", role_lost_steward.id),
                ("selected_ids", unrelated_user.id),
                ("limit", 2),
            ],
        )

    assert ordinary.status_code == 200, ordinary.text
    assert [row["id"] for row in ordinary.json()] == [active_steward.id]
    assert searched_history.status_code == 200, searched_history.text
    assert searched_history.json() == []
    assert selected_history.status_code == 200, selected_history.text
    assert {row["id"] for row in selected_history.json()} == {
        inactive_steward.id,
        role_lost_steward.id,
    }
    assert "Hidden Unrelated Identity" not in selected_history.text


@pytest.mark.asyncio
async def test_threat_shared_contract_rejects_unknown_values_and_sanitizes_export(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_department: Department,
) -> None:
    steward = await _ciso_steward(db_session, department_id=test_department.id)
    steward.name = "@STEWARD"
    await db_session.commit()
    async with client_factory(user=test_user_cro) as client:
        created = await client.post(
            "/api/v1/threats",
            json=_payload(
                steward.id,
                name="=FORMULA()",
                description="+SUM(A1:A2)",
                typical_weaknesses="-1+2",
                relevant_subject="@SUBJECT",
            ),
        )
        assert created.status_code == 201, created.text
        for params in (
            {"view": "unknown"},
            {"sort_by": "unknown"},
            {"categories": "unknown"},
            {"lifecycle": "unknown"},
            {"linked_risk_types": "unknown"},
        ):
            response = await client.get("/api/v1/threats", params=params)
            assert response.status_code == 400, (params, response.text)

        exported = await client.get("/api/v1/threats/export")
        assert exported.status_code == 200, exported.text
        row = list(csv.DictReader(io.StringIO(exported.text)))[0]
        for field in ("name", "description", "typical_weaknesses", "relevant_subject", "threat_steward"):
            assert row[field].startswith("'")


@pytest.mark.asyncio
async def test_threat_reader_without_risk_or_report_access_gets_no_context_or_export(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_department: Department,
) -> None:
    steward = await _ciso_steward(db_session, department_id=test_department.id)
    reader = await _user_with_permissions(
        db_session,
        role_name="threat_catalog_reader",
        permission_keys=("threats:read",),
    )
    async with client_factory(user=test_user_cro) as client:
        threat = (
            await client.post(
                "/api/v1/threats",
                json=_payload(steward.id, name="Context-protected Threat"),
            )
        ).json()
    risk = Risk(
        risk_id_code="R-PROTECTED",
        name="Protected Risk Context",
        process="Security",
        description="Must not leak",
        risk_type="operational",
        department_id=test_department.id,
        owner_id=test_user_cro.id,
    )
    db_session.add(risk)
    await db_session.flush()
    db_session.add(ThreatRiskLink(threat_id=threat["id"], risk_id=risk.id))
    await db_session.commit()

    async with client_factory(user=reader) as client:
        listing = await client.get("/api/v1/threats")
        assert listing.status_code == 200, listing.text
        assert listing.json()["capabilities"] == {"can_create": False, "can_export": False}
        assert listing.json()["items"][0]["visible_linked_risk_count"] == 0

        grouped = await client.get("/api/v1/threats", params={"view": "linked_risk"})
        assert [row["value"] for row in grouped.json()["groups"]] == ["__unlinked_risk__"]
        assert "Protected Risk Context" not in grouped.text
        assert (await client.get("/api/v1/threats/lookups/risks")).json() == []
        assert (await client.get("/api/v1/threats/export")).status_code == 403
