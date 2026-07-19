"""ICT Register Threat register + ICT-risk integration (issue #47).

Behavior under test, at the HTTP seam via ``client_factory``:
- a Risk Manager maintains Threats (create, read, update, archive, restore)
  with the workbook's entered 12_Hrozby columns: name, category, description,
  typical weaknesses, relevant subject, and notes;
- the category is enforced against the workbook closed list KategorieHrozeb;
- Threat<->Risk links are manageable from BOTH ends (the Threat page and the
  Risk detail), each end's mutations gated on that end's write permission;
- Risk<->Process and Risk<->Asset links are managed from the Risk detail and
  readable from the Process/Asset ends (read-only extension of their links
  endpoints); pairs are unique; archived ends conflict strictly (409);
- Risks additively carry the acceptance-governance fields (approver,
  justification, date) — entered, no mandatory-if write block (that arrives
  as a #50 DQ finding);
- maintenance is restricted per the RBAC seed (risk_manager + CRO wildcard),
  reads mirror the vendors:read holder set, platform admins are excluded,
  and mutations land on the audit trail;
- both migrations ship per repo convention and mirror the RBAC seed.

Field inventory source: docs/dora-ict-register/dora-excel-functional-spec.md
section 1.6 (12_Hrozby) and 1.7 (13_Rizika block E). Expected values are
spec literals.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.rbac_seed_contract import RBAC_ROLE_PERMISSIONS, expand_permission_keys
from app.models import Permission, Role, RolePermission, User
from app.models.user import AccessScope

_CISO_STEWARD_ID: int | None = None


@pytest_asyncio.fixture(autouse=True)
async def seeded_ciso_steward(db_session: AsyncSession):
    """Supply the required Threat steward to legacy register test payloads."""
    global _CISO_STEWARD_ID
    role = Role(name="ciso", display_name="Chief Information Security Officer")
    db_session.add(role)
    await db_session.flush()
    steward = User(
        name="Test CISO",
        email="ciso.threats@test.com",
        role_id=role.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    db_session.add(steward)
    await db_session.commit()
    _CISO_STEWARD_ID = steward.id
    yield steward
    _CISO_STEWARD_ID = None


@pytest_asyncio.fixture
async def test_user_seeded_risk_manager(db_session: AsyncSession) -> User:
    """Risk manager holding exactly the canonical RBAC seed permissions."""
    role = Role(name="risk_manager", display_name="Risk Manager", description="Seed-contract risk manager")
    db_session.add(role)
    await db_session.commit()

    permissions = []
    for key in sorted(expand_permission_keys(RBAC_ROLE_PERMISSIONS["risk_manager"])):
        resource, action = key.split(":", maxsplit=1)
        permissions.append(Permission(resource=resource, action=action, description=key))
    db_session.add_all(permissions)
    await db_session.commit()
    db_session.add_all(RolePermission(role_id=role.id, permission_id=p.id) for p in permissions)
    await db_session.commit()

    user = User(
        name="Seeded Risk Manager",
        email="seeded.rm@test.com",
        role_id=role.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    db_session.add(user)
    await db_session.commit()

    result = await db_session.execute(
        select(User)
        .options(selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission))
        .where(User.id == user.id)
    )
    return result.scalar_one()


def _minimal_payload(**overrides: object) -> dict[str, object]:
    assert _CISO_STEWARD_ID is not None
    payload: dict[str, object] = {
        "name": "Ransomware",
        "threat_steward_user_id": _CISO_STEWARD_ID,
    }
    payload.update(overrides)
    return payload


def _full_payload(**overrides: object) -> dict[str, object]:
    """Every entered 12_Hrozby column (spec section 1.6)."""
    payload: dict[str, object] = {
        "name": "Ransomware",
        "threat_steward_user_id": _CISO_STEWARD_ID,
        "category": "availability",
        "description": "Zašifrování dat a vydírání.",
        "typical_weaknesses": "Neaktualizované systémy, phishing",
        "relevant_subject": "Aktivum",
        "notes": "Poznámka k hrozbě.",
    }
    payload.update(overrides)
    return payload


def _risk_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": "Výpadek jádrového systému",
        "process": "Správa pojistných smluv",
        "description": "Nedostupnost klíčové aplikace.",
    }
    payload.update(overrides)
    return payload


def _process_payload(owner: User, **overrides: object) -> dict[str, object]:
    assert owner.department_id is not None
    payload: dict[str, object] = {
        "l0_area": "Provoz a služby klientům",
        "l1_process": "Správa pojistných smluv",
        "process_owner_user_id": owner.id,
        "owning_department_id": owner.department_id,
    }
    payload.update(overrides)
    return payload


def _asset_payload(owner: User, **overrides: object) -> dict[str, object]:
    assert owner.department_id is not None
    payload: dict[str, object] = {
        "name": "Veris",
        "business_owner_user_id": owner.id,
        "ict_owner_user_id": owner.id,
        "owning_department_id": owner.department_id,
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_risk_listing_filters_ict_linked_rows_before_pagination(
    client_factory, test_user_cro: User, seed_risk_types
):
    async with client_factory(user=test_user_cro) as client:
        linked_response = await client.post("/api/v1/risks", json=_risk_payload(name="Linked"))
        assert linked_response.status_code == 201, linked_response.text
        linked = linked_response.json()
        unlinked_response = await client.post("/api/v1/risks", json=_risk_payload(name="Unlinked"))
        assert unlinked_response.status_code == 201, unlinked_response.text
        process = (
            await client.post(
                "/api/v1/processes", json=_process_payload(test_user_cro)
            )
        ).json()
        created = await client.post(
            f"/api/v1/risks/{linked['id']}/process-links",
            json={"process_id": process["id"]},
        )
        assert created.status_code == 201, created.text

        response = await client.get(
            "/api/v1/risks", params={"ict_linked": True, "limit": 1}
        )

    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1
    assert [row["id"] for row in response.json()["items"]] == [linked["id"]]


@pytest.mark.asyncio
async def test_risk_listing_filters_above_configured_tolerance(
    client_factory, db_session: AsyncSession, test_user_cro: User, seed_risk_types
):
    from app.models import GlobalConfig
    from app.models.global_config import clear_config_cache

    db_session.add(
        GlobalConfig(
            key="ict_register_tolerance",
            value="7",
            value_type="int",
            category="ict_register_parameters",
            display_name="P_Tolerance",
            is_editable=False,
        )
    )
    await db_session.commit()
    clear_config_cache()
    async with client_factory(user=test_user_cro) as client:
        above_response = await client.post(
            "/api/v1/risks",
            json=_risk_payload(name="Above", net_probability=5, net_impact=5),
        )
        assert above_response.status_code == 201, above_response.text
        above = above_response.json()
        below_response = await client.post(
            "/api/v1/risks",
            json=_risk_payload(name="Below", net_probability=1, net_impact=1),
        )
        assert below_response.status_code == 201, below_response.text

        response = await client.get("/api/v1/risks", params={"above_tolerance": True})

    clear_config_cache()

    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1
    assert [row["id"] for row in response.json()["items"]] == [above["id"]]


@pytest.mark.asyncio
async def test_risk_listing_filters_acceptance_response(
    client_factory, test_user_cro: User, seed_risk_types
):
    async with client_factory(user=test_user_cro) as client:
        accepted_response = await client.post(
            "/api/v1/risks",
            json=_risk_payload(name="Accepted", acceptance_approver="CRO"),
        )
        assert accepted_response.status_code == 201, accepted_response.text
        accepted = accepted_response.json()
        ordinary_response = await client.post(
            "/api/v1/risks", json=_risk_payload(name="Ordinary")
        )
        assert ordinary_response.status_code == 201, ordinary_response.text

        response = await client.get("/api/v1/risks", params={"response": "acceptance"})

    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1
    assert [row["id"] for row in response.json()["items"]] == [accepted["id"]]


@pytest.mark.asyncio
async def test_risk_listing_filters_heatmap_coordinates(
    client_factory, test_user_cro: User, seed_risk_types
):
    async with client_factory(user=test_user_cro) as client:
        target_response = await client.post(
            "/api/v1/risks",
            json=_risk_payload(name="Heatmap target", gross_probability=4, gross_impact=5),
        )
        assert target_response.status_code == 201, target_response.text
        target = target_response.json()
        other_response = await client.post(
            "/api/v1/risks",
            json=_risk_payload(name="Other cell", gross_probability=4, gross_impact=3),
        )
        assert other_response.status_code == 201, other_response.text

        response = await client.get(
            "/api/v1/risks", params={"gross_probability": 4, "gross_impact": 5}
        )

    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1
    assert [row["id"] for row in response.json()["items"]] == [target["id"]]


@pytest.mark.asyncio
async def test_risk_listing_filters_configured_gross_and_net_bands(
    client_factory, db_session: AsyncSession, test_user_cro: User, seed_risk_types
):
    from app.models import GlobalConfig
    from app.models.global_config import clear_config_cache

    for key, value, display_name in (
        ("ict_register_riz_str", "5", "P_RizStr"),
        ("ict_register_riz_vys", "10", "P_RizVys"),
        ("ict_register_riz_krit", "20", "P_RizKrit"),
    ):
        db_session.add(
            GlobalConfig(
                key=key,
                value=value,
                value_type="int",
                category="ict_register_parameters",
                display_name=display_name,
                is_editable=False,
            )
        )
    await db_session.commit()
    clear_config_cache()

    async with client_factory(user=test_user_cro) as client:
        target_response = await client.post(
            "/api/v1/risks",
            json=_risk_payload(
                name="Migration target",
                gross_probability=4,
                gross_impact=5,
                net_probability=3,
                net_impact=4,
            ),
        )
        assert target_response.status_code == 201, target_response.text
        target = target_response.json()
        other_response = await client.post(
            "/api/v1/risks",
            json=_risk_payload(name="Other band", gross_probability=2, gross_impact=2),
        )
        assert other_response.status_code == 201, other_response.text

        response = await client.get(
            "/api/v1/risks", params={"gross_band": "Kritické", "net_band": "Vysoké"}
        )

    clear_config_cache()
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1
    assert [row["id"] for row in response.json()["items"]] == [target["id"]]


@pytest.mark.asyncio
async def test_create_and_read_threat_with_all_entered_fields(client_factory, test_user_cro: User):
    async with client_factory(user=test_user_cro) as client:
        created = await client.post("/api/v1/threats", json=_full_payload())

        assert created.status_code == 201, created.text
        body = created.json()
        assert body["id"] > 0
        assert body["name"] == "Ransomware"
        assert body["category"] == "availability"
        assert body["description"] == "Zašifrování dat a vydírání."
        assert body["typical_weaknesses"] == "Neaktualizované systémy, phishing"
        assert body["relevant_subject"] == "Aktivum"
        assert body["notes"] == "Poznámka k hrozbě."
        assert body["is_archived"] is False

        fetched = await client.get(f"/api/v1/threats/{body['id']}")
        assert fetched.status_code == 200
        assert fetched.json() == body

        missing = await client.get("/api/v1/threats/999999")
        assert missing.status_code == 404


@pytest.mark.asyncio
async def test_create_with_minimal_fields_leaves_optional_fields_null(client_factory, test_user_cro: User):
    async with client_factory(user=test_user_cro) as client:
        created = await client.post("/api/v1/threats", json=_minimal_payload())

    assert created.status_code == 201, created.text
    body = created.json()
    assert body["category"] is None
    assert body["description"] is None
    assert body["typical_weaknesses"] is None
    assert body["relevant_subject"] is None
    assert body["notes"] is None


@pytest.mark.asyncio
async def test_update_threat_round_trips_entered_fields(client_factory, test_user_cro: User):
    async with client_factory(user=test_user_cro) as client:
        created = (await client.post("/api/v1/threats", json=_minimal_payload())).json()

        updated = await client.patch(
            f"/api/v1/threats/{created['id']}",
            json={"category": "integrity", "description": "Cílený útok.", "notes": "Po revizi."},
        )
        assert updated.status_code == 200, updated.text
        assert updated.json()["category"] == "integrity"
        assert updated.json()["description"] == "Cílený útok."
        assert updated.json()["notes"] == "Po revizi."
        # Untouched fields stay untouched.
        assert updated.json()["name"] == "Ransomware"

        # Clearing an optional field with null works; nulling the name does not.
        cleared = await client.patch(f"/api/v1/threats/{created['id']}", json={"notes": None})
        assert cleared.status_code == 200
        assert cleared.json()["notes"] is None
        assert (await client.patch(f"/api/v1/threats/{created['id']}", json={"name": None})).status_code in (400, 422)

        missing = await client.patch("/api/v1/threats/999999", json={"notes": "x"})
        assert missing.status_code == 404


@pytest.mark.asyncio
async def test_category_is_enforced_against_workbook_closed_list(client_factory, test_user_cro: User):
    """Spec section 1.6: Kategorie comes from the closed list KategorieHrozeb, verbatim."""
    async with client_factory(user=test_user_cro) as client:
        for valid in (
            "availability",
            "integrity",
            "confidentiality",
            "authenticity",
            "physical",
            "personnel",
            "third_party",
        ):
            ok = await client.post("/api/v1/threats", json=_minimal_payload(category=valid))
            assert ok.status_code == 201, f"category={valid!r} rejected: {ok.text}"
            assert ok.json()["category"] == valid

        for invalid in ("Kybernetická", "Dostupnost", "Availability", 5):
            rejected = await client.post("/api/v1/threats", json=_minimal_payload(category=invalid))
            assert rejected.status_code == 422, f"category={invalid!r} accepted"

        # Unknown keys are rejected outright — write payloads are closed.
        assert (
            await client.post("/api/v1/threats", json=_minimal_payload(unknown_field="x"))
        ).status_code == 422

        # PATCH enforces the same list.
        created = (await client.post("/api/v1/threats", json=_minimal_payload())).json()
        assert (
            await client.patch(f"/api/v1/threats/{created['id']}", json={"category": "Kybernetická"})
        ).status_code == 422


@pytest.mark.asyncio
async def test_archive_restore_lifecycle_and_register_listing(client_factory, test_user_cro: User):
    async with client_factory(user=test_user_cro) as client:
        ransomware = (await client.post("/api/v1/threats", json=_minimal_payload(name="Ransomware"))).json()
        phishing = (await client.post("/api/v1/threats", json=_minimal_payload(name="Phishing"))).json()

        # Archive hides the row from the default register listing.
        assert (await client.delete(f"/api/v1/threats/{phishing['id']}")).status_code == 204
        default_list = (await client.get("/api/v1/threats")).json()
        assert default_list["total"] == 1
        assert [item["id"] for item in default_list["items"]] == [ransomware["id"]]

        with_archived = (await client.get("/api/v1/threats", params={"include_archived": True})).json()
        assert with_archived["total"] == 2
        archived_row = next(item for item in with_archived["items"] if item["id"] == phishing["id"])
        assert archived_row["is_archived"] is True
        assert archived_row["archived_by_id"] is not None
        assert archived_row["capabilities"]["can_restore"] is True
        assert archived_row["capabilities"]["can_update"] is False
        assert archived_row["capabilities"]["can_archive"] is False

        # Archived rows cannot be edited (409) or re-archived (400).
        assert (
            await client.patch(f"/api/v1/threats/{phishing['id']}", json={"notes": "x"})
        ).status_code == 409
        assert (await client.delete(f"/api/v1/threats/{phishing['id']}")).status_code == 400

        # Restore brings the row back; restoring an active row is rejected.
        restored = await client.post(f"/api/v1/threats/{phishing['id']}/restore")
        assert restored.status_code == 200
        assert restored.json()["is_archived"] is False
        assert restored.json()["archived_at"] is None
        assert (await client.post(f"/api/v1/threats/{phishing['id']}/restore")).status_code == 400

        assert (await client.get("/api/v1/threats")).json()["total"] == 2

        # Missing rows 404 on the lifecycle routes too.
        assert (await client.delete("/api/v1/threats/999999")).status_code == 404
        assert (await client.post("/api/v1/threats/999999/restore")).status_code == 404


@pytest.mark.asyncio
async def test_register_listing_supports_search_pagination_and_sorting(client_factory, test_user_cro: User):
    async with client_factory(user=test_user_cro) as client:
        for name, category in (
            ("Ransomware", "availability"),
            ("Phishing", "personnel"),
            ("Výpadek datového centra", "physical"),
        ):
            resp = await client.post("/api/v1/threats", json=_minimal_payload(name=name, category=category))
            assert resp.status_code == 201

        searched = (await client.get("/api/v1/threats", params={"search": "ransom"})).json()
        assert searched["total"] == 1
        assert searched["items"][0]["name"] == "Ransomware"

        by_category = (await client.get("/api/v1/threats", params={"search": "personnel"})).json()
        assert by_category["total"] == 1
        assert by_category["items"][0]["name"] == "Phishing"

        paged = (await client.get("/api/v1/threats", params={"offset": 1, "limit": 1})).json()
        assert paged["total"] == 3
        assert len(paged["items"]) == 1
        assert paged["offset"] == 1
        assert paged["limit"] == 1

        sorted_desc = (
            await client.get("/api/v1/threats", params={"sort_by": "name", "sort_order": "desc"})
        ).json()
        assert [item["name"] for item in sorted_desc["items"]] == [
            "Výpadek datového centra",
            "Ransomware",
            "Phishing",
        ]

        invalid_sort = await client.get("/api/v1/threats", params={"sort_by": "no_such_column"})
        assert invalid_sort.status_code == 400


# ---------------------------------------------------------------------------
# Threat<->Risk links — manageable from BOTH ends (Threat page + Risk detail)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_threat_risk_link_round_trip_from_the_threat_end(client_factory, test_user_cro: User, seed_risk_types):
    """AC: link Threats to Risks — managed from the Threat page, readable from both ends."""
    async with client_factory(user=test_user_cro) as client:
        threat = (await client.post("/api/v1/threats", json=_minimal_payload())).json()
        risk = (await client.post("/api/v1/risks", json=_risk_payload())).json()

        created = await client.post(
            f"/api/v1/threats/{threat['id']}/risk-links", json={"risk_id": risk["id"]}
        )
        assert created.status_code == 201, created.text
        link = created.json()
        assert link["threat_id"] == threat["id"]
        assert link["risk_id"] == risk["id"]
        assert link["capabilities"]["can_delete"] is True

        # Readable from the Threat end.
        from_threat = await client.get(f"/api/v1/threats/{threat['id']}/risk-links")
        assert from_threat.status_code == 200
        assert [row["id"] for row in from_threat.json()] == [link["id"]]

        # Readable from the Risk end.
        from_risk = await client.get(f"/api/v1/risks/{risk['id']}/threat-links")
        assert from_risk.status_code == 200
        assert [row["threat_id"] for row in from_risk.json()] == [threat["id"]]

        # Duplicate pairs are rejected — from either end.
        assert (
            await client.post(f"/api/v1/threats/{threat['id']}/risk-links", json={"risk_id": risk["id"]})
        ).status_code == 400
        assert (
            await client.post(f"/api/v1/risks/{risk['id']}/threat-links", json={"threat_id": threat["id"]})
        ).status_code == 400

        # Remove from the Threat end; both ends empty out.
        removed = await client.delete(f"/api/v1/threats/{threat['id']}/risk-links/{link['id']}")
        assert removed.status_code == 204
        assert (await client.get(f"/api/v1/threats/{threat['id']}/risk-links")).json() == []
        assert (await client.get(f"/api/v1/risks/{risk['id']}/threat-links")).json() == []

        # Unknown ends 404.
        assert (
            await client.post(f"/api/v1/threats/{threat['id']}/risk-links", json={"risk_id": 999999})
        ).status_code == 404
        assert (
            await client.post("/api/v1/threats/999999/risk-links", json={"risk_id": risk["id"]})
        ).status_code == 404
        assert (
            await client.delete(f"/api/v1/threats/{threat['id']}/risk-links/{link['id']}")
        ).status_code == 404
        assert (await client.get("/api/v1/threats/999999/risk-links")).status_code == 404
        assert (await client.get("/api/v1/risks/999999/threat-links")).status_code == 404


@pytest.mark.asyncio
async def test_threat_risk_link_round_trip_from_the_risk_end(client_factory, test_user_cro: User, seed_risk_types):
    """AC: the same Link relation is manageable from the Risk detail."""
    async with client_factory(user=test_user_cro) as client:
        threat = (await client.post("/api/v1/threats", json=_minimal_payload())).json()
        risk = (await client.post("/api/v1/risks", json=_risk_payload())).json()

        created = await client.post(
            f"/api/v1/risks/{risk['id']}/threat-links", json={"threat_id": threat["id"]}
        )
        assert created.status_code == 201, created.text
        link = created.json()
        assert link["threat_id"] == threat["id"]
        assert link["risk_id"] == risk["id"]
        assert link["capabilities"]["can_delete"] is True

        # The same row is visible from the Threat end.
        assert [row["id"] for row in (await client.get(f"/api/v1/threats/{threat['id']}/risk-links")).json()] == [
            link["id"]
        ]

        # Remove from the Risk end.
        assert (
            await client.delete(f"/api/v1/risks/{risk['id']}/threat-links/{link['id']}")
        ).status_code == 204
        assert (await client.get(f"/api/v1/risks/{risk['id']}/threat-links")).json() == []

        # Unknown ends 404 on the risk-end routes.
        assert (
            await client.post(f"/api/v1/risks/{risk['id']}/threat-links", json={"threat_id": 999999})
        ).status_code == 404
        assert (
            await client.post("/api/v1/risks/999999/threat-links", json={"threat_id": threat["id"]})
        ).status_code == 404
        assert (
            await client.delete(f"/api/v1/risks/{risk['id']}/threat-links/{link['id']}")
        ).status_code == 404


@pytest.mark.asyncio
async def test_threat_risk_link_archived_ends_conflict_strictly(client_factory, test_user_cro: User, seed_risk_types):
    """Strict archived-end stance (#43/#46): mutating from or linking TO an archived end is 409."""
    async with client_factory(user=test_user_cro) as client:
        threat = (await client.post("/api/v1/threats", json=_minimal_payload())).json()
        other_threat = (await client.post("/api/v1/threats", json=_minimal_payload(name="Phishing"))).json()
        risk = (await client.post("/api/v1/risks", json=_risk_payload())).json()
        link = (
            await client.post(f"/api/v1/threats/{threat['id']}/risk-links", json={"risk_id": risk["id"]})
        ).json()

        # Archive the Threat: threat-end mutations conflict, reads stay open.
        assert (await client.delete(f"/api/v1/threats/{threat['id']}")).status_code == 204
        assert (await client.get(f"/api/v1/threats/{threat['id']}/risk-links")).status_code == 200
        assert (
            await client.post(f"/api/v1/threats/{threat['id']}/risk-links", json={"risk_id": risk["id"]})
        ).status_code == 409
        assert (
            await client.delete(f"/api/v1/threats/{threat['id']}/risk-links/{link['id']}")
        ).status_code == 409

        # Linking TO the archived Threat from the Risk end conflicts too...
        assert (
            await client.post(f"/api/v1/risks/{risk['id']}/threat-links", json={"threat_id": threat["id"]})
        ).status_code == 409
        # ...but unlinking the archived TARGET from the active Risk end stays possible.
        assert (
            await client.delete(f"/api/v1/risks/{risk['id']}/threat-links/{link['id']}")
        ).status_code == 204

        # Archive the Risk: risk-end mutations conflict; linking TO it conflicts from the threat end.
        relink = (
            await client.post(
                f"/api/v1/threats/{other_threat['id']}/risk-links", json={"risk_id": risk["id"]}
            )
        ).json()
        archived_risk = await client.delete(
            f"/api/v1/risks/{risk['id']}", params={"reason": "Archived for link test"}
        )
        assert archived_risk.status_code in (200, 202, 204), archived_risk.text
        assert (
            await client.post(f"/api/v1/risks/{risk['id']}/threat-links", json={"threat_id": threat["id"]})
        ).status_code == 409
        assert (
            await client.delete(f"/api/v1/risks/{risk['id']}/threat-links/{relink['id']}")
        ).status_code == 409
        assert (
            await client.post(
                f"/api/v1/threats/{other_threat['id']}/risk-links", json={"risk_id": risk["id"]}
            )
        ).status_code == 409
        # Unlinking the archived Risk TARGET from the active Threat end stays possible.
        assert (
            await client.delete(f"/api/v1/threats/{other_threat['id']}/risk-links/{relink['id']}")
        ).status_code == 204


@pytest.mark.asyncio
async def test_threat_risk_link_mutations_follow_the_managing_end_write_permission(
    client_factory, db_session: AsyncSession, test_user_cro: User, seed_risk_types
):
    """Pin: each end mutates under ITS write permission (threats:write vs risks:write).

    A user holding risks:write but NOT threats:write manages the link from
    the Risk detail yet is denied on the Threat page — and vice versa is
    covered by the seed personas (employee: neither; risk manager: both).
    """
    async with client_factory(user=test_user_cro) as client:
        threat = (await client.post("/api/v1/threats", json=_minimal_payload())).json()
        risk = (await client.post("/api/v1/risks", json=_risk_payload())).json()

    role = Role(name="risk_writer", display_name="Risk Writer", description="risks:write without threats:write")
    db_session.add(role)
    await db_session.commit()
    permissions = [
        Permission(resource="risks", action="read", description="risks:read"),
        Permission(resource="risks", action="write", description="risks:write"),
        Permission(resource="threats", action="read", description="threats:read"),
    ]
    db_session.add_all(permissions)
    await db_session.commit()
    db_session.add_all(RolePermission(role_id=role.id, permission_id=p.id) for p in permissions)
    await db_session.commit()
    user = User(
        name="Risk Writer",
        email="risk.writer@test.com",
        role_id=role.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    db_session.add(user)
    await db_session.commit()
    result = await db_session.execute(
        select(User)
        .options(selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission))
        .where(User.id == user.id)
    )
    risk_writer = result.scalar_one()

    async with client_factory(user=risk_writer) as client:
        # The Threat page requires threats:write — denied.
        assert (
            await client.post(f"/api/v1/threats/{threat['id']}/risk-links", json={"risk_id": risk["id"]})
        ).status_code == 403

        # The Risk detail requires risks:write — allowed, and can_delete says so.
        created = await client.post(
            f"/api/v1/risks/{risk['id']}/threat-links", json={"threat_id": threat["id"]}
        )
        assert created.status_code == 201, created.text
        assert created.json()["capabilities"]["can_delete"] is True

        # The threat-end read of the same row projects can_delete=False for
        # this user (mutating from the Threat page needs threats:write).
        threat_end_rows = (await client.get(f"/api/v1/threats/{threat['id']}/risk-links")).json()
        assert threat_end_rows[0]["capabilities"]["can_delete"] is False

        # Threat-end delete denied; risk-end delete allowed.
        assert (
            await client.delete(f"/api/v1/threats/{threat['id']}/risk-links/{created.json()['id']}")
        ).status_code == 403
        assert (
            await client.delete(f"/api/v1/risks/{risk['id']}/threat-links/{created.json()['id']}")
        ).status_code == 204


# ---------------------------------------------------------------------------
# Risk<->Process and Risk<->Asset links — managed from the Risk detail,
# readable from the Process/Asset ends
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_risk_process_link_round_trip_readable_from_the_process_end(
    client_factory, test_user_cro: User, seed_risk_types
):
    async with client_factory(user=test_user_cro) as client:
        risk = (await client.post("/api/v1/risks", json=_risk_payload())).json()
        process = (
            await client.post(
                "/api/v1/processes", json=_process_payload(test_user_cro)
            )
        ).json()

        created = await client.post(
            f"/api/v1/risks/{risk['id']}/process-links", json={"process_id": process["id"]}
        )
        assert created.status_code == 201, created.text
        link = created.json()
        assert link["risk_id"] == risk["id"]
        assert link["process_id"] == process["id"]
        assert link["capabilities"]["can_delete"] is True

        # Readable from the Risk end and the Process end.
        assert [row["id"] for row in (await client.get(f"/api/v1/risks/{risk['id']}/process-links")).json()] == [
            link["id"]
        ]
        from_process = await client.get(f"/api/v1/processes/{process['id']}/risk-links")
        assert from_process.status_code == 200
        assert [row["risk_id"] for row in from_process.json()] == [risk["id"]]

        # Unique pair.
        assert (
            await client.post(f"/api/v1/risks/{risk['id']}/process-links", json={"process_id": process["id"]})
        ).status_code == 400

        # Unknown ends 404.
        assert (
            await client.post(f"/api/v1/risks/{risk['id']}/process-links", json={"process_id": 999999})
        ).status_code == 404
        assert (
            await client.post("/api/v1/risks/999999/process-links", json={"process_id": process["id"]})
        ).status_code == 404
        assert (await client.get("/api/v1/processes/999999/risk-links")).status_code == 404

        # Remove from the Risk end; both ends empty out.
        assert (
            await client.delete(f"/api/v1/risks/{risk['id']}/process-links/{link['id']}")
        ).status_code == 204
        assert (await client.get(f"/api/v1/risks/{risk['id']}/process-links")).json() == []
        assert (await client.get(f"/api/v1/processes/{process['id']}/risk-links")).json() == []
        assert (
            await client.delete(f"/api/v1/risks/{risk['id']}/process-links/{link['id']}")
        ).status_code == 404


@pytest.mark.asyncio
async def test_risk_asset_link_round_trip_readable_from_the_asset_end(
    client_factory, test_user_cro: User, seed_risk_types
):
    async with client_factory(user=test_user_cro) as client:
        risk = (await client.post("/api/v1/risks", json=_risk_payload())).json()
        asset = (
            await client.post("/api/v1/assets", json=_asset_payload(test_user_cro))
        ).json()

        created = await client.post(
            f"/api/v1/risks/{risk['id']}/asset-links", json={"asset_id": asset["id"]}
        )
        assert created.status_code == 201, created.text
        link = created.json()
        assert link["risk_id"] == risk["id"]
        assert link["asset_id"] == asset["id"]
        assert link["capabilities"]["can_delete"] is True

        assert [row["id"] for row in (await client.get(f"/api/v1/risks/{risk['id']}/asset-links")).json()] == [
            link["id"]
        ]
        from_asset = await client.get(f"/api/v1/assets/{asset['id']}/risk-links")
        assert from_asset.status_code == 200
        assert [row["risk_id"] for row in from_asset.json()] == [risk["id"]]

        assert (
            await client.post(f"/api/v1/risks/{risk['id']}/asset-links", json={"asset_id": asset["id"]})
        ).status_code == 400
        assert (
            await client.post(f"/api/v1/risks/{risk['id']}/asset-links", json={"asset_id": 999999})
        ).status_code == 404
        assert (
            await client.post("/api/v1/risks/999999/asset-links", json={"asset_id": asset["id"]})
        ).status_code == 404
        assert (await client.get("/api/v1/assets/999999/risk-links")).status_code == 404

        assert (
            await client.delete(f"/api/v1/risks/{risk['id']}/asset-links/{link['id']}")
        ).status_code == 204
        assert (await client.get(f"/api/v1/assets/{asset['id']}/risk-links")).json() == []


@pytest.mark.asyncio
async def test_risk_register_links_archived_ends_conflict_strictly(
    client_factory, test_user_cro: User, seed_risk_types
):
    """Strict archived-end 409 for the Risk<->Process and Risk<->Asset ends."""
    async with client_factory(user=test_user_cro) as client:
        risk = (await client.post("/api/v1/risks", json=_risk_payload())).json()
        process = (
            await client.post(
                "/api/v1/processes", json=_process_payload(test_user_cro)
            )
        ).json()
        asset = (
            await client.post("/api/v1/assets", json=_asset_payload(test_user_cro))
        ).json()

        # Archived targets conflict on create.
        assert (await client.delete(f"/api/v1/processes/{process['id']}")).status_code == 204
        assert (
            await client.post(f"/api/v1/risks/{risk['id']}/process-links", json={"process_id": process["id"]})
        ).status_code == 409
        assert (await client.post(f"/api/v1/processes/{process['id']}/restore")).status_code == 200

        assert (await client.delete(f"/api/v1/assets/{asset['id']}")).status_code == 204
        assert (
            await client.post(f"/api/v1/risks/{risk['id']}/asset-links", json={"asset_id": asset["id"]})
        ).status_code == 409
        assert (await client.post(f"/api/v1/assets/{asset['id']}/restore")).status_code == 200

        # Link both, then archive the Risk: risk-end mutations conflict, reads stay open.
        process_link = (
            await client.post(f"/api/v1/risks/{risk['id']}/process-links", json={"process_id": process["id"]})
        ).json()
        asset_link = (
            await client.post(f"/api/v1/risks/{risk['id']}/asset-links", json={"asset_id": asset["id"]})
        ).json()
        archived_risk = await client.delete(
            f"/api/v1/risks/{risk['id']}", params={"reason": "Archived for link test"}
        )
        assert archived_risk.status_code in (200, 202, 204), archived_risk.text

        assert (await client.get(f"/api/v1/risks/{risk['id']}/process-links")).status_code == 200
        assert (await client.get(f"/api/v1/processes/{process['id']}/risk-links")).status_code == 200
        assert (
            await client.post(f"/api/v1/risks/{risk['id']}/process-links", json={"process_id": process["id"]})
        ).status_code == 409
        assert (
            await client.delete(f"/api/v1/risks/{risk['id']}/process-links/{process_link['id']}")
        ).status_code == 409
        assert (
            await client.post(f"/api/v1/risks/{risk['id']}/asset-links", json={"asset_id": asset["id"]})
        ).status_code == 409
        assert (
            await client.delete(f"/api/v1/risks/{risk['id']}/asset-links/{asset_link['id']}")
        ).status_code == 409


# ---------------------------------------------------------------------------
# Risk acceptance-governance fields (13_Rizika block E) — additive, entered
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_risk_acceptance_fields_round_trip_additively(client_factory, test_user_cro: User, seed_risk_types):
    """AC: Risks carry acceptance approver, justification, and date — entered fields.

    Their required-together enforcement is a #50 DQ finding, NOT a write
    block: any subset (including none) is writable.
    """
    async with client_factory(user=test_user_cro) as client:
        # Existing create shape without acceptance fields keeps working.
        plain = await client.post("/api/v1/risks", json=_risk_payload())
        assert plain.status_code == 201, plain.text
        assert plain.json()["acceptance_approver"] is None
        assert plain.json()["acceptance_justification"] is None
        assert plain.json()["acceptance_date"] is None

        # Create with the full acceptance package.
        accepted = await client.post(
            "/api/v1/risks",
            json=_risk_payload(
                name="Akceptované riziko",
                acceptance_approver="CRO",
                acceptance_justification="Náklady na mitigaci převyšují dopad.",
                acceptance_date="2026-06-30",
            ),
        )
        assert accepted.status_code == 201, accepted.text
        body = accepted.json()
        assert body["acceptance_approver"] == "CRO"
        assert body["acceptance_justification"] == "Náklady na mitigaci převyšují dopad."
        assert body["acceptance_date"] == "2026-06-30"

        # The fields ride the detail read.
        fetched = (await client.get(f"/api/v1/risks/{body['id']}")).json()
        assert fetched["acceptance_approver"] == "CRO"
        assert fetched["acceptance_date"] == "2026-06-30"

        # A partial package is accepted (mandatory-if is a DQ finding, not a write block).
        partial = await client.patch(
            f"/api/v1/risks/{plain.json()['id']}", json={"acceptance_approver": "Výbor pro ICT rizika"}
        )
        assert partial.status_code == 200, partial.text
        assert partial.json()["acceptance_approver"] == "Výbor pro ICT rizika"
        assert partial.json()["acceptance_justification"] is None

        # PATCH round-trips and clears with null; untouched fields stay untouched.
        patched = await client.patch(
            f"/api/v1/risks/{body['id']}",
            json={"acceptance_approver": "CEO", "acceptance_date": "2026-07-01"},
        )
        assert patched.status_code == 200, patched.text
        assert patched.json()["acceptance_approver"] == "CEO"
        assert patched.json()["acceptance_date"] == "2026-07-01"
        assert patched.json()["acceptance_justification"] == "Náklady na mitigaci převyšují dopad."

        cleared = await client.patch(f"/api/v1/risks/{body['id']}", json={"acceptance_date": None})
        assert cleared.status_code == 200
        assert cleared.json()["acceptance_date"] is None


# ---------------------------------------------------------------------------
# Authorization matrix
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_risk_manager_seed_grants_full_threat_maintenance(
    client_factory, test_user_seeded_risk_manager: User, seed_risk_types
):
    """Maintenance goes to the risk_manager role via the RBAC seed (CRO wildcard aside)."""
    async with client_factory(user=test_user_seeded_risk_manager) as client:
        created = await client.post("/api/v1/threats", json=_full_payload())
        assert created.status_code == 201, created.text
        threat_id = created.json()["id"]
        assert created.json()["capabilities"] == {
            "can_read": True,
            "can_update": True,
            "can_archive": True,
            "can_restore": False,
        }

        assert (
            await client.patch(f"/api/v1/threats/{threat_id}", json={"category": "integrity"})
        ).status_code == 200

        listing = (await client.get("/api/v1/threats")).json()
        assert listing["capabilities"] == {"can_create": True, "can_export": True}

        # Link maintenance from both ends is part of the seed grants.
        risk = (await client.post("/api/v1/risks", json=_risk_payload())).json()
        link = await client.post(f"/api/v1/threats/{threat_id}/risk-links", json={"risk_id": risk["id"]})
        assert link.status_code == 201
        assert (
            await client.delete(f"/api/v1/risks/{risk['id']}/threat-links/{link.json()['id']}")
        ).status_code == 204

        assert (await client.delete(f"/api/v1/threats/{threat_id}")).status_code == 204
        assert (await client.post(f"/api/v1/threats/{threat_id}/restore")).status_code == 200


@pytest.mark.asyncio
async def test_employee_reads_threats_but_cannot_maintain_them(
    client_factory, test_user_cro: User, test_user_employee: User, seed_risk_types
):
    """Reads mirror the vendors:read holder set; writes 403 for employees."""
    employee_department_id = test_user_employee.department_id
    async with client_factory(user=test_user_cro) as client:
        seeded = (await client.post("/api/v1/threats", json=_minimal_payload())).json()
        # In the employee's department: the Threat-end list follows Risk row
        # visibility, so the link row is only readable for an in-scope Risk.
        risk = (
            await client.post(
                "/api/v1/risks", json=_risk_payload(department_id=employee_department_id)
            )
        ).json()
        link = (
            await client.post(f"/api/v1/threats/{seeded['id']}/risk-links", json={"risk_id": risk["id"]})
        ).json()

    async with client_factory(user=test_user_employee) as client:
        listing = await client.get("/api/v1/threats")
        assert listing.status_code == 200
        assert listing.json()["capabilities"] == {"can_create": False, "can_export": True}

        detail = await client.get(f"/api/v1/threats/{seeded['id']}")
        assert detail.status_code == 200
        assert detail.json()["capabilities"] == {
            "can_read": True,
            "can_update": False,
            "can_archive": False,
            "can_restore": False,
        }

        # Link rows are readable from the Threat end with the standard read set,
        # and their per-row capability denies deletion.
        rows = await client.get(f"/api/v1/threats/{seeded['id']}/risk-links")
        assert rows.status_code == 200
        assert rows.json()[0]["capabilities"]["can_delete"] is False

        # Every maintenance verb is denied.
        assert (await client.post("/api/v1/threats", json=_minimal_payload())).status_code == 403
        assert (
            await client.patch(f"/api/v1/threats/{seeded['id']}", json={"notes": "X"})
        ).status_code == 403
        assert (await client.delete(f"/api/v1/threats/{seeded['id']}")).status_code == 403
        assert (await client.post(f"/api/v1/threats/{seeded['id']}/restore")).status_code == 403
        assert (
            await client.post(f"/api/v1/threats/{seeded['id']}/risk-links", json={"risk_id": risk["id"]})
        ).status_code == 403
        assert (
            await client.delete(f"/api/v1/threats/{seeded['id']}/risk-links/{link['id']}")
        ).status_code == 403
        # The risk-end mutations require risks:write the employee lacks.
        assert (
            await client.post(f"/api/v1/risks/{risk['id']}/threat-links", json={"threat_id": seeded["id"]})
        ).status_code == 403
        assert (
            await client.delete(f"/api/v1/risks/{risk['id']}/threat-links/{link['id']}")
        ).status_code == 403


# ---------------------------------------------------------------------------
# Risk row visibility on the register ends (scoped users)
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def other_department(db_session: AsyncSession):
    """A department outside every dept-scoped fixture user's scope."""
    from app.models import Department

    dept = Department(name="Other Department", code="OTHER", description="Out-of-scope department")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)
    return dept


@pytest_asyncio.fixture
async def test_user_scoped_threat_maintainer(
    db_session: AsyncSession, test_department
) -> User:
    """Dept-scoped user holding threat maintenance + risk read (no global scope)."""
    role = Role(
        name="scoped_threat_maintainer",
        display_name="Scoped Threat Maintainer",
        description="threats:read/write + risks:read, department scope",
    )
    db_session.add(role)
    await db_session.commit()

    permissions = [
        Permission(resource="threats", action="read", description="Read threats"),
        Permission(resource="threats", action="write", description="Write threats"),
        Permission(resource="risks", action="read", description="Read risks"),
    ]
    db_session.add_all(permissions)
    await db_session.commit()
    db_session.add_all(RolePermission(role_id=role.id, permission_id=p.id) for p in permissions)
    await db_session.commit()

    user = User(
        name="Scoped Threat Maintainer",
        email="scoped.threat@test.com",
        department_id=test_department.id,
        role_id=role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
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


@pytest.mark.asyncio
async def test_threat_end_filters_link_rows_to_visible_risks(
    client_factory, test_user_cro: User, test_user_employee: User, other_department, seed_risk_types
):
    """The Threat-end list applies the canonical Risk visibility predicate: a
    dept-scoped employee sees only in-scope link rows, and an out-of-scope
    Risk's id/name never appears anywhere in the payload."""
    employee_department_id = test_user_employee.department_id
    async with client_factory(user=test_user_cro) as client:
        threat = (await client.post("/api/v1/threats", json=_minimal_payload())).json()
        in_scope = (
            await client.post(
                "/api/v1/risks", json=_risk_payload(department_id=employee_department_id)
            )
        ).json()
        out_of_scope = (
            await client.post(
                "/api/v1/risks",
                json=_risk_payload(name="Skryté riziko jiného útvaru", department_id=other_department.id),
            )
        ).json()
        for risk_id in (in_scope["id"], out_of_scope["id"]):
            created = await client.post(
                f"/api/v1/threats/{threat['id']}/risk-links", json={"risk_id": risk_id}
            )
            assert created.status_code == 201, created.text

        # The privileged (globally scoped) caller still reads both rows.
        cro_rows = (await client.get(f"/api/v1/threats/{threat['id']}/risk-links")).json()
        assert {row["risk_id"] for row in cro_rows} == {in_scope["id"], out_of_scope["id"]}

    async with client_factory(user=test_user_employee) as client:
        response = await client.get(f"/api/v1/threats/{threat['id']}/risk-links")
        assert response.status_code == 200
        rows = response.json()
        assert [row["risk_id"] for row in rows] == [in_scope["id"]]
        # The visible row carries display names (guardrail), and nothing in
        # the payload mentions the hidden Risk.
        assert rows[0]["risk_name"] == in_scope["name"]
        assert rows[0]["risk_id_code"] == in_scope["risk_id_code"]
        assert "Skryté riziko jiného útvaru" not in response.text
        assert str(out_of_scope["id"]) not in [str(row["risk_id"]) for row in rows]


@pytest.mark.asyncio
async def test_threat_end_link_add_404s_for_out_of_scope_risk(
    client_factory,
    test_user_cro: User,
    test_user_scoped_threat_maintainer: User,
    other_department,
    seed_risk_types,
):
    """Linking an invisible Risk from the Threat page is indistinguishable
    from linking a nonexistent one (404 anti-enumeration, mirroring the
    Risk-end precedent)."""
    async with client_factory(user=test_user_cro) as client:
        threat = (await client.post("/api/v1/threats", json=_minimal_payload())).json()
        out_of_scope = (
            await client.post(
                "/api/v1/risks", json=_risk_payload(department_id=other_department.id)
            )
        ).json()

    async with client_factory(user=test_user_scoped_threat_maintainer) as client:
        denied = await client.post(
            f"/api/v1/threats/{threat['id']}/risk-links", json={"risk_id": out_of_scope["id"]}
        )
        missing = await client.post(
            f"/api/v1/threats/{threat['id']}/risk-links", json={"risk_id": 999_999}
        )
        assert denied.status_code == 404, denied.text
        assert missing.status_code == 404, missing.text
        assert denied.json() == missing.json()


@pytest.mark.asyncio
async def test_threat_end_link_remove_404s_for_out_of_scope_risk_without_deleting(
    client_factory,
    test_user_cro: User,
    test_user_scoped_threat_maintainer: User,
    test_department,
    other_department,
    seed_risk_types,
):
    """Unlinking a link whose Risk is out of scope from the Threat page is
    indistinguishable from unlinking a nonexistent link_id (404
    anti-enumeration, same rule as the add-path), never deletes the hidden
    relationship, and leaves legitimate in-scope and global unlinks working."""
    async with client_factory(user=test_user_cro) as client:
        threat = (await client.post("/api/v1/threats", json=_minimal_payload())).json()
        in_scope = (
            await client.post(
                "/api/v1/risks", json=_risk_payload(department_id=test_department.id)
            )
        ).json()
        out_of_scope = (
            await client.post(
                "/api/v1/risks",
                json=_risk_payload(name="Skryté riziko jiného útvaru", department_id=other_department.id),
            )
        ).json()
        in_scope_link = (
            await client.post(
                f"/api/v1/threats/{threat['id']}/risk-links", json={"risk_id": in_scope["id"]}
            )
        ).json()
        out_of_scope_link = (
            await client.post(
                f"/api/v1/threats/{threat['id']}/risk-links", json={"risk_id": out_of_scope["id"]}
            )
        ).json()

    async with client_factory(user=test_user_scoped_threat_maintainer) as client:
        denied = await client.delete(
            f"/api/v1/threats/{threat['id']}/risk-links/{out_of_scope_link['id']}"
        )
        missing = await client.delete(
            f"/api/v1/threats/{threat['id']}/risk-links/999999"
        )
        assert denied.status_code == 404, denied.text
        assert missing.status_code == 404, missing.text
        # No enumeration oracle: byte-identical body for hidden vs nonexistent.
        assert denied.json() == missing.json()

        # A legitimate in-scope unlink by the same scoped maintainer still works.
        ok = await client.delete(
            f"/api/v1/threats/{threat['id']}/risk-links/{in_scope_link['id']}"
        )
        assert ok.status_code == 204, ok.text

    # The hidden relationship was NOT deleted, and a global/CRO user unlinks it.
    async with client_factory(user=test_user_cro) as client:
        rows = (await client.get(f"/api/v1/threats/{threat['id']}/risk-links")).json()
        assert {row["id"] for row in rows} == {out_of_scope_link["id"]}
        removed = await client.delete(
            f"/api/v1/threats/{threat['id']}/risk-links/{out_of_scope_link['id']}"
        )
        assert removed.status_code == 204, removed.text


@pytest.mark.asyncio
async def test_register_far_end_lists_filter_risks_by_visibility(
    client_factory, test_user_cro: User, test_user_employee: User, other_department, seed_risk_types
):
    """The Process-end and Asset-end risk-link lists filter rows through the
    same canonical Risk visibility predicate as the Risk register."""
    employee_department_id = test_user_employee.department_id
    async with client_factory(user=test_user_cro) as client:
        process = (
            await client.post(
                "/api/v1/processes", json=_process_payload(test_user_cro)
            )
        ).json()
        asset = (
            await client.post("/api/v1/assets", json=_asset_payload(test_user_cro))
        ).json()
        in_scope = (
            await client.post(
                "/api/v1/risks", json=_risk_payload(department_id=employee_department_id)
            )
        ).json()
        out_of_scope = (
            await client.post(
                "/api/v1/risks",
                json=_risk_payload(name="Skryté riziko jiného útvaru", department_id=other_department.id),
            )
        ).json()
        for risk_id in (in_scope["id"], out_of_scope["id"]):
            assert (
                await client.post(
                    f"/api/v1/risks/{risk_id}/process-links", json={"process_id": process["id"]}
                )
            ).status_code == 201
            assert (
                await client.post(
                    f"/api/v1/risks/{risk_id}/asset-links", json={"asset_id": asset["id"]}
                )
            ).status_code == 201

    async with client_factory(user=test_user_employee) as client:
        process_rows = await client.get(f"/api/v1/processes/{process['id']}/risk-links")
        assert process_rows.status_code == 200
        assert [row["risk_id"] for row in process_rows.json()] == [in_scope["id"]]
        assert "Skryté riziko jiného útvaru" not in process_rows.text

        asset_rows = await client.get(f"/api/v1/assets/{asset['id']}/risk-links")
        assert asset_rows.status_code == 200
        assert [row["risk_id"] for row in asset_rows.json()] == [in_scope["id"]]
        assert "Skryté riziko jiného útvaru" not in asset_rows.text


@pytest.mark.asyncio
async def test_link_lists_embed_display_names_for_both_ends(
    client_factory, test_user_cro: User, seed_risk_types
):
    """Link LIST payloads carry server-resolved display names for both ends
    (docs/agent/FRONTEND_DISPLAY_GUARDRAILS.md: names, never raw-id fallbacks)."""
    async with client_factory(user=test_user_cro) as client:
        threat = (await client.post("/api/v1/threats", json=_minimal_payload())).json()
        risk = (await client.post("/api/v1/risks", json=_risk_payload())).json()
        process = (
            await client.post(
                "/api/v1/processes",
                json=_process_payload(test_user_cro, l2_subprocess="Upisování"),
            )
        ).json()
        asset = (
            await client.post("/api/v1/assets", json=_asset_payload(test_user_cro))
        ).json()

        assert (
            await client.post(f"/api/v1/threats/{threat['id']}/risk-links", json={"risk_id": risk["id"]})
        ).status_code == 201
        assert (
            await client.post(f"/api/v1/risks/{risk['id']}/process-links", json={"process_id": process["id"]})
        ).status_code == 201
        assert (
            await client.post(f"/api/v1/risks/{risk['id']}/asset-links", json={"asset_id": asset["id"]})
        ).status_code == 201

        threat_rows = (await client.get(f"/api/v1/threats/{threat['id']}/risk-links")).json()
        assert threat_rows[0]["threat_name"] == "Ransomware"
        assert threat_rows[0]["risk_name"] == risk["name"]
        assert threat_rows[0]["risk_id_code"] == risk["risk_id_code"]

        risk_threat_rows = (await client.get(f"/api/v1/risks/{risk['id']}/threat-links")).json()
        assert risk_threat_rows[0]["threat_name"] == "Ransomware"

        process_rows = (await client.get(f"/api/v1/risks/{risk['id']}/process-links")).json()
        # The Process display name follows the workbook convention (l1 – l2).
        assert process_rows[0]["process_name"] == "Správa pojistných smluv – Upisování"

        asset_rows = (await client.get(f"/api/v1/risks/{risk['id']}/asset-links")).json()
        assert asset_rows[0]["asset_name"] == "Veris"


@pytest.mark.asyncio
async def test_platform_admin_is_excluded_and_unauthenticated_is_rejected(
    client_factory, test_user_cro: User, test_user_platform_admin: User, seed_risk_types
):
    async with client_factory(user=test_user_cro) as client:
        seeded = (await client.post("/api/v1/threats", json=_minimal_payload())).json()
        risk = (await client.post("/api/v1/risks", json=_risk_payload())).json()

    paths_and_calls = [
        ("get", "/api/v1/threats", None),
        ("get", f"/api/v1/threats/{seeded['id']}", None),
        ("post", "/api/v1/threats", _minimal_payload()),
        ("patch", f"/api/v1/threats/{seeded['id']}", {"notes": "X"}),
        ("delete", f"/api/v1/threats/{seeded['id']}", None),
        ("post", f"/api/v1/threats/{seeded['id']}/restore", None),
        ("get", f"/api/v1/threats/{seeded['id']}/risk-links", None),
        ("post", f"/api/v1/threats/{seeded['id']}/risk-links", {"risk_id": risk["id"]}),
        ("delete", f"/api/v1/threats/{seeded['id']}/risk-links/1", None),
        ("get", f"/api/v1/risks/{risk['id']}/threat-links", None),
        ("post", f"/api/v1/risks/{risk['id']}/threat-links", {"threat_id": seeded["id"]}),
        ("delete", f"/api/v1/risks/{risk['id']}/threat-links/1", None),
        ("get", f"/api/v1/risks/{risk['id']}/process-links", None),
        ("post", f"/api/v1/risks/{risk['id']}/process-links", {"process_id": 1}),
        ("get", f"/api/v1/risks/{risk['id']}/asset-links", None),
        ("post", f"/api/v1/risks/{risk['id']}/asset-links", {"asset_id": 1}),
    ]

    async def call(client, method: str, path: str, body):
        if body is not None:
            return await getattr(client, method)(path, json=body)
        return await getattr(client, method)(path)

    # Platform admin holds no business permissions: 403 everywhere, reads included.
    async with client_factory(user=test_user_platform_admin) as client:
        for method, path, body in paths_and_calls:
            resp = await call(client, method, path, body)
            assert resp.status_code == 403, f"{method.upper()} {path} -> {resp.status_code}"

    # Unauthenticated requests are rejected outright.
    async with client_factory() as client:
        for method, path, body in paths_and_calls:
            resp = await call(client, method, path, body)
            assert resp.status_code == 401, f"{method.upper()} {path} -> {resp.status_code}"


# ---------------------------------------------------------------------------
# Audit trail
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_threat_mutations_land_on_the_audit_trail(client_factory, test_user_cro: User):
    """Register mutations are attributable via the activity log (spec story 39)."""
    async with client_factory(user=test_user_cro) as client:
        created = (await client.post("/api/v1/threats", json=_minimal_payload())).json()
        await client.patch(f"/api/v1/threats/{created['id']}", json={"category": "availability"})
        await client.delete(f"/api/v1/threats/{created['id']}")
        await client.post(f"/api/v1/threats/{created['id']}/restore")

        log = await client.get(
            "/api/v1/activity-log",
            params={"entity_type": "threat", "entity_id": created["id"]},
        )

    assert log.status_code == 200
    entries = log.json()["items"]
    actions = [entry["action"] for entry in entries]
    assert actions.count("create") == 1
    assert actions.count("archive") == 1
    assert actions.count("update") == 2  # field update + restore
    assert all(entry["actor_name"] == "Test CRO" for entry in entries)

    archive_entry = next(entry for entry in entries if entry["action"] == "archive")
    assert archive_entry["changes"]["is_archived"]["new"] is True


@pytest.mark.asyncio
async def test_link_mutations_land_on_the_audit_trail(client_factory, test_user_cro: User, seed_risk_types):
    async with client_factory(user=test_user_cro) as client:
        threat = (await client.post("/api/v1/threats", json=_minimal_payload())).json()
        risk = (await client.post("/api/v1/risks", json=_risk_payload())).json()
        process = (
            await client.post(
                "/api/v1/processes", json=_process_payload(test_user_cro)
            )
        ).json()
        asset = (
            await client.post("/api/v1/assets", json=_asset_payload(test_user_cro))
        ).json()

        # Threat-end mutations audit as threat_link rows.
        link = (
            await client.post(f"/api/v1/threats/{threat['id']}/risk-links", json={"risk_id": risk["id"]})
        ).json()
        await client.delete(f"/api/v1/threats/{threat['id']}/risk-links/{link['id']}")

        threat_log = await client.get(
            "/api/v1/activity-log",
            params={"entity_type": "threat_link", "entity_id": threat["id"]},
        )

        # Risk-end mutations (threat/process/asset) audit as risk_link rows.
        relink = (
            await client.post(f"/api/v1/risks/{risk['id']}/threat-links", json={"threat_id": threat["id"]})
        ).json()
        process_link = (
            await client.post(
                f"/api/v1/risks/{risk['id']}/process-links",
                json={"process_id": process["id"]},
            )
        ).json()
        asset_link = (
            await client.post(
                f"/api/v1/risks/{risk['id']}/asset-links",
                json={"asset_id": asset["id"]},
            )
        ).json()
        await client.delete(f"/api/v1/risks/{risk['id']}/threat-links/{relink['id']}")
        await client.delete(f"/api/v1/risks/{risk['id']}/process-links/{process_link['id']}")
        await client.delete(f"/api/v1/risks/{risk['id']}/asset-links/{asset_link['id']}")

        risk_log = await client.get(
            "/api/v1/activity-log",
            params={"entity_type": "risk_link", "entity_id": risk["id"]},
        )

    assert threat_log.status_code == 200
    threat_entries = threat_log.json()["items"]
    threat_actions = [entry["action"] for entry in threat_entries]
    assert threat_actions.count("create") == 1
    assert threat_actions.count("delete") == 1

    assert risk_log.status_code == 200
    risk_entries = risk_log.json()["items"]
    risk_actions = [entry["action"] for entry in risk_entries]
    assert risk_actions.count("create") == 3  # threat + process + asset links
    assert risk_actions.count("delete") == 3
    assert all(entry["actor_name"] == "Test CRO" for entry in risk_entries)
    safe_relationship_entries = [
        entry
        for entry in risk_entries
        if "relationship_type" in (entry["changes"] or {})
    ]
    assert {
        (
            entry["action"],
            entry["changes"]["relationship_type"].get("old"),
            entry["changes"]["relationship_type"].get("new"),
            entry["changes"]["relationship_target"].get("old"),
            entry["changes"]["relationship_target"].get("new"),
        )
        for entry in safe_relationship_entries
    } == {
        ("create", None, "process", None, "Správa pojistných smluv"),
        ("delete", "process", None, "Správa pojistných smluv", None),
        ("create", None, "asset", None, "Veris"),
        ("delete", "asset", None, "Veris", None),
    }
    raw_id_fields = {"target_id", "process_id", "asset_id", "risk_id"}
    assert all(
        raw_id_fields.isdisjoint(entry["changes"] or {})
        for entry in safe_relationship_entries
    )


@pytest.mark.asyncio
async def test_unreadable_asset_unlink_audits_unknown_asset_label(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_seeded_risk_manager: User,
    other_department,
    seed_risk_types,
):
    """Risk-end cleanup must not disclose an out-of-scope Asset's name or id."""
    async with client_factory(user=test_user_cro) as client:
        risk = (
            await client.post(
                "/api/v1/risks",
                json=_risk_payload(department_id=test_user_cro.department_id),
            )
        ).json()
        hidden = (
            await client.post(
                "/api/v1/assets",
                json=_asset_payload(
                    test_user_cro,
                    name="Hidden risk subject",
                    owning_department_id=other_department.id,
                ),
            )
        ).json()
        created = await client.post(
            f"/api/v1/risks/{risk['id']}/asset-links",
            json={"asset_id": hidden["id"]},
        )
        assert created.status_code == 201, created.text

    test_user_seeded_risk_manager.access_scope = AccessScope.DEPARTMENT
    test_user_seeded_risk_manager.department_id = test_user_cro.department_id
    await db_session.commit()

    async with client_factory(user=test_user_seeded_risk_manager) as client:
        removed = await client.delete(
            f"/api/v1/risks/{risk['id']}/asset-links/{created.json()['id']}"
        )
    assert removed.status_code == 204, removed.text

    async with client_factory(user=test_user_cro) as client:
        log = await client.get(
            "/api/v1/activity-log",
            params={"entity_type": "risk_link", "entity_id": risk["id"]},
        )
    assert log.status_code == 200, log.text
    deletion = next(
        entry
        for entry in log.json()["items"]
        if entry["action"] == "delete"
    )
    assert deletion["changes"] == {
        "relationship_type": {"old": "asset", "new": None},
        "relationship_target": {"old": "Unknown asset", "new": None},
    }


# ---------------------------------------------------------------------------
# Migration pair parity (ADR-010)
# ---------------------------------------------------------------------------


def test_threat_migrations_follow_repo_convention_and_are_forward_only():
    """Both migrations ship per repo convention (ADR-010, non-negotiable).

    ``<rev>_add_threats.py`` creates the threats table, the three Link
    relation tables, and the additive risk acceptance columns, and is
    forward-only; ``<rev>_sync_threat_permissions_for_existing_dbs.py``
    idempotently backfills deployed DBs and mirrors the RBAC seed exactly.
    Precedent: r5s6t7u8v9w0/s6t7u8v9w0x1 (assets).
    """
    import importlib.util
    from pathlib import Path

    from app.db.rbac_seed_contract import PERMISSION_BY_KEY

    versions_dir = Path(__file__).resolve().parents[3] / "backend/alembic/versions"

    def load_migration(filename: str, module_name: str):
        spec = importlib.util.spec_from_file_location(module_name, versions_dir / filename)
        assert spec is not None and spec.loader is not None
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        return migration

    add_threats = load_migration("y1z2a3b4c5d6_add_threats.py", "add_threats_migration")
    # Chained onto the current head (#46 register vendor links); single head preserved.
    assert add_threats.down_revision == "x1y2z3a4b5c6"
    with pytest.raises(NotImplementedError):
        add_threats.downgrade()

    sync = load_migration(
        "z1a2b3c4d5e6_sync_threat_permissions_for_existing_dbs.py", "threat_permission_sync_migration"
    )
    assert sync.down_revision == "y1z2a3b4c5d6"

    # The ensured permission rows are verbatim seed-contract rows.
    for permission in sync.THREAT_PERMISSIONS:
        key = f"{permission['resource']}:{permission['action']}"
        assert PERMISSION_BY_KEY[key]["description"] == permission["description"], key
    assert {f"{p['resource']}:{p['action']}" for p in sync.THREAT_PERMISSIONS} == {
        "threats:read",
        "threats:write",
        "threats:delete",
    }

    # Role grants mirror the seed exactly: risk_manager holds threats:*;
    # every role holding vendors:read in the seed gains threats:read.
    seed_threat_grants = {
        role_name: {key for key in expand_permission_keys(permission_keys) if key.startswith("threats:")}
        for role_name, permission_keys in RBAC_ROLE_PERMISSIONS.items()
        if role_name not in {"cro", "ciso"}  # handled by wildcard and stewardship migrations
    }
    seed_threat_grants = {role: keys for role, keys in seed_threat_grants.items() if keys}
    migration_grants = {role: set(keys) for role, keys in sync.ROLE_THREAT_GRANTS.items()}
    assert migration_grants == seed_threat_grants

    stewardship = load_migration(
        "e6f7a8b9c0d1_add_ciso_threat_stewardship.py", "ciso_threat_stewardship_migration"
    )
    assert stewardship.down_revision == "d5e6f7a8b9c0"
    assert set(stewardship.CISO_PERMISSION_KEYS) == set(
        expand_permission_keys(RBAC_ROLE_PERMISSIONS["ciso"])
    )
    assert stewardship.PERMISSION_DESCRIPTIONS == {
        key: PERMISSION_BY_KEY[key]["description"] for key in stewardship.CISO_PERMISSION_KEYS
    }
    with pytest.raises(NotImplementedError):
        stewardship.downgrade()

    with pytest.raises(NotImplementedError):
        sync.downgrade()
