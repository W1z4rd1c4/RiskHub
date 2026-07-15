"""ICT Register Asset register + Process-Asset and Asset-Asset links (issue #43).

Behavior under test, at the HTTP seam via ``client_factory``:
- a Risk Manager maintains Assets (create, read, update, archive, restore)
  with the workbook's entered 04_Aktiva fields: identity and classification,
  ownership and regulation flags, the C/I/A/Auth ratings, the two manual
  business impacts, substitutability and vendor-dependency ratings, internet
  exposure, preliminary criticality, lifecycle state with the three support
  end dates, the legacy-assessment date, review state, and notes;
- derived workbook fields (CIAA value, weighted score, resulting criticality,
  CIF, SPOF rollup, legacy, external dependency, TEXTJOIN aggregates, counts,
  completeness — ticket #48) are not writable;
- coded fields are enforced against the workbook closed lists from
  ``_ict_register_reference`` (ratings are Skala15 integers);
- Process<->Asset links carry SPOF, significance, and note, are managed from
  the Asset detail, and are readable from both ends; the pair is unique;
- at most one linked Process is the Asset's primary Process: designating a
  new primary atomically demotes the previous one in a single call, and the
  designation rides on the Asset Read payload;
- Asset<->Asset links are directional (supporting vs dependent), reject
  self-links, and enforce pair uniqueness;
- maintenance is restricted per the RBAC seed (risk_manager + CRO wildcard),
  reads follow the standard business-entity pattern, platform admins are
  excluded, and mutations land on the audit trail.

Field inventory source: docs/dora-ict-register/dora-excel-functional-spec.md
sections 1.2 (04_Aktiva) and 1.8 (link sheets 05/06). Expected values are
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


@pytest_asyncio.fixture
async def test_user_seeded_risk_manager(
    db_session: AsyncSession, test_department
) -> User:
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
        department_id=test_department.id,
    )
    db_session.add(user)
    await db_session.commit()

    result = await db_session.execute(
        select(User)
        .options(
            selectinload(User.role)
            .selectinload(Role.permissions)
            .selectinload(RolePermission.permission)
        )
        .where(User.id == user.id)
    )
    return result.scalar_one()


def _minimal_payload(owner: User, **overrides: object) -> dict[str, object]:
    assert owner.department_id is not None
    payload: dict[str, object] = {
        "name": "Veris",
        "business_owner_user_id": owner.id,
        "ict_owner_user_id": owner.id,
        "owning_department_id": owner.department_id,
    }
    payload.update(overrides)
    return payload


def _full_payload(owner: User, **overrides: object) -> dict[str, object]:
    """Every entered 04_Aktiva field (spec section 1.2); values mirror the Veris seed row."""
    payload: dict[str, object] = {
        "name": "Veris",
        "asset_type": "application",
        "asset_level": "primary",
        "description": "Jádrový pojistný systém.",
        "physical_location": "Datové centrum Praha",
        "deployment_model": "on_premise",
        "alternative_names": "VERIS, Veris Core",
        "business_owner_user_id": owner.id,
        "ict_owner_user_id": owner.id,
        "owning_department_id": owner.department_id,
        "gdpr_relevance": "yes",
        "ai_relevance": "no",
        "data_classification": "highly_confidential_regulated",
        "confidentiality_rating": 5,
        "integrity_rating": 5,
        "availability_rating": 5,
        "authenticity_rating": 5,
        "impact_client": 5,
        "impact_regulatory": 5,
        "substitutability_rating": 5,
        "vendor_dependency_rating": 4,
        "internet_exposed": "no",
        "preliminary_criticality": "critical",
        "lifecycle_state": "operational",
        "standard_support_end_date": "2027-12-31",
        "extended_support_end_date": "2028-12-31",
        "custom_support_end_date": "2029-06-30",
        "last_legacy_risk_assessment_date": "2026-01-15",
        "review_state": "review_required",
        "notes": "Poznámka k aktivu.",
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


@pytest.mark.asyncio
async def test_create_and_read_asset_with_all_entered_fields(
    client_factory, test_user_cro: User
):
    async with client_factory(user=test_user_cro) as client:
        created = await client.post("/api/v1/assets", json=_full_payload(test_user_cro))

        assert created.status_code == 201, created.text
        body = created.json()
        assert body["id"] > 0
        assert body["name"] == "Veris"
        assert body["asset_type"] == "application"
        assert body["asset_level"] == "primary"
        assert body["description"] == "Jádrový pojistný systém."
        assert body["physical_location"] == "Datové centrum Praha"
        assert body["deployment_model"] == "on_premise"
        assert body["alternative_names"] == "VERIS, Veris Core"
        assert body["business_owner_user_id"] == test_user_cro.id
        assert body["ict_owner_user_id"] == test_user_cro.id
        assert body["owning_department_id"] == test_user_cro.department_id
        assert body["gdpr_relevance"] == "yes"
        assert body["ai_relevance"] == "no"
        assert body["data_classification"] == "highly_confidential_regulated"
        assert body["confidentiality_rating"] == 5
        assert body["integrity_rating"] == 5
        assert body["availability_rating"] == 5
        assert body["authenticity_rating"] == 5
        assert body["impact_client"] == 5
        assert body["impact_regulatory"] == 5
        assert body["substitutability_rating"] == 5
        assert body["vendor_dependency_rating"] == 4
        assert body["internet_exposed"] == "no"
        assert body["preliminary_criticality"] == "critical"
        assert body["lifecycle_state"] == "operational"
        assert body["standard_support_end_date"] == "2027-12-31"
        assert body["extended_support_end_date"] == "2028-12-31"
        assert body["custom_support_end_date"] == "2029-06-30"
        assert body["last_legacy_risk_assessment_date"] == "2026-01-15"
        assert body["review_state"] == "review_required"
        assert body["notes"] == "Poznámka k aktivu."
        # No linked Process yet: the primary designation is empty, never defaulted.
        assert body["primary_process_id"] is None
        assert body["is_archived"] is False

        fetched = await client.get(f"/api/v1/assets/{body['id']}")
        assert fetched.status_code == 200
        assert fetched.json() == body

        missing = await client.get("/api/v1/assets/999999")
        assert missing.status_code == 404


@pytest.mark.asyncio
async def test_create_with_minimal_fields_leaves_optional_fields_null(
    client_factory, test_user_cro: User
):
    async with client_factory(user=test_user_cro) as client:
        created = await client.post(
            "/api/v1/assets",
            json=_minimal_payload(
                test_user_cro,
            ),
        )

    assert created.status_code == 201, created.text
    body = created.json()
    assert body["asset_type"] is None
    assert body["asset_level"] is None
    assert body["confidentiality_rating"] is None
    assert body["internet_exposed"] is None
    assert body["lifecycle_state"] is None
    assert body["standard_support_end_date"] is None
    assert body["review_state"] is None
    assert body["primary_process_id"] is None


@pytest.mark.asyncio
async def test_update_asset_round_trips_entered_fields(
    client_factory, test_user_cro: User
):
    async with client_factory(user=test_user_cro) as client:
        created = (
            await client.post(
                "/api/v1/assets",
                json=_minimal_payload(
                    test_user_cro,
                ),
            )
        ).json()

        updated = await client.patch(
            f"/api/v1/assets/{created['id']}",
            json={
                "lifecycle_state": "being_decommissioned",
                "availability_rating": 3,
                "notes": "Po revizi.",
            },
        )
        assert updated.status_code == 200, updated.text
        assert updated.json()["lifecycle_state"] == "being_decommissioned"
        assert updated.json()["availability_rating"] == 3
        assert updated.json()["notes"] == "Po revizi."
        # Untouched fields stay untouched.
        assert updated.json()["name"] == "Veris"

        # Clearing an optional field with null works; nulling the name does not.
        cleared = await client.patch(
            f"/api/v1/assets/{created['id']}", json={"notes": None}
        )
        assert cleared.status_code == 200
        assert cleared.json()["notes"] is None
        assert (
            await client.patch(f"/api/v1/assets/{created['id']}", json={"name": None})
        ).status_code in (400, 422)

        missing = await client.patch("/api/v1/assets/999999", json={"notes": "x"})
        assert missing.status_code == 404


# Derived 04_Aktiva fields (spec sections 1.2 and 2.2) arrive with the
# derivation engine (ticket #48) and must never be writable. The primary
# designation is entered on the Process<->Asset link, never on the Asset row.
DERIVED_FIELD_WRITES: dict[str, object] = {
    "ciaa_value": 5,
    "weighted_score": 4.2,
    "score_criticality": "Vysoká",
    "business_criticality": "Kritická",
    "resulting_criticality": "Kritická",
    "article_8_classification": "Kritické",
    "cif": "Ano",
    "cif_process_count": 2,
    "spof": "Ano",
    "external_dependency": "Ano",
    "legacy": "Ano",
    "inherited_rto_hours": 8,
    "primary_process_criticality": "Vysoká",
    "impact_operations": 4,
    "impact_financial": 5,
    "linked_assets": "AKT-1",
    "vendor_list": "DOD-01",
    "process_count": 3,
    "vendor_count": 1,
    "is_complete": True,
    "primary_process_id": 1,
}


@pytest.mark.asyncio
async def test_writes_that_include_derived_fields_are_rejected(
    client_factory, test_user_cro: User
):
    async with client_factory(user=test_user_cro) as client:
        existing = (
            await client.post(
                "/api/v1/assets",
                json=_minimal_payload(
                    test_user_cro,
                ),
            )
        ).json()

        for field, value in DERIVED_FIELD_WRITES.items():
            create_resp = await client.post(
                "/api/v1/assets", json=_minimal_payload(test_user_cro, **{field: value})
            )
            assert (
                create_resp.status_code == 422
            ), f"POST accepted derived field {field}"

            patch_resp = await client.patch(
                f"/api/v1/assets/{existing['id']}", json={field: value}
            )
            assert (
                patch_resp.status_code == 422
            ), f"PATCH accepted derived field {field}"

        # The register did not silently change.
        unchanged = await client.get(f"/api/v1/assets/{existing['id']}")
        assert unchanged.json()["name"] == existing["name"]


@pytest.mark.asyncio
async def test_ratings_are_skala15_integers(client_factory, test_user_cro: User):
    """Spec: C/I/A/Auth, the manual impacts, and the dependency ratings are Skala15 (1-5).

    A string "5" is not a Skala15 value; neither are 0, 6, or fractions.
    """
    rating_fields = (
        "confidentiality_rating",
        "integrity_rating",
        "availability_rating",
        "authenticity_rating",
        "impact_client",
        "impact_regulatory",
        "substitutability_rating",
        "vendor_dependency_rating",
    )
    async with client_factory(user=test_user_cro) as client:
        for field in rating_fields:
            ok = await client.post(
                "/api/v1/assets", json=_minimal_payload(test_user_cro, **{field: 5})
            )
            assert ok.status_code == 201, f"{field}=5 rejected: {ok.text}"

            for invalid in ("5", 0, 6, 2.5, "Ano"):
                resp = await client.post(
                    "/api/v1/assets",
                    json=_minimal_payload(test_user_cro, **{field: invalid}),
                )
                assert resp.status_code == 422, f"{field}={invalid!r} accepted"


@pytest.mark.asyncio
async def test_coded_fields_are_enforced_as_canonical_codes(
    client_factory, test_user_cro: User
):
    """Controlled Asset fields accept locale-independent codes only."""
    cases = {
        "asset_type": ("data_storage", "Datové úložiště"),
        "asset_level": ("supporting", "B – podpůrné"),
        "deployment_model": ("externally_hosted", "Externě hostováno"),
        "gdpr_relevance": ("undetermined", "Neurčeno"),
        "ai_relevance": ("yes", "Ano"),
        "data_classification": ("no_data_not_applicable", "Bez dat / nerelevantní"),
        "internet_exposed": ("yes", "Ano"),
        "preliminary_criticality": ("medium", "Střední"),
        "lifecycle_state": ("retired", "Vyřazeno"),
        "review_state": ("reviewed", "Zkontrolováno"),
    }
    async with client_factory(user=test_user_cro) as client:
        for field, (valid, invalid) in cases.items():
            ok = await client.post(
                "/api/v1/assets", json=_minimal_payload(test_user_cro, **{field: valid})
            )
            assert ok.status_code == 201, f"{field}={valid!r} rejected: {ok.text}"
            assert ok.json()[field] == valid

            rejected = await client.post(
                "/api/v1/assets",
                json=_minimal_payload(test_user_cro, **{field: invalid}),
            )
            assert rejected.status_code == 422, f"{field}={invalid!r} accepted"

        workbook_label = await client.post(
            "/api/v1/assets",
            json=_minimal_payload(test_user_cro, lifecycle_state="V provozu"),
        )
        assert workbook_label.status_code == 422

        # PATCH enforces the same lists.
        created = (
            await client.post(
                "/api/v1/assets",
                json=_minimal_payload(
                    test_user_cro,
                ),
            )
        ).json()
        patched_bad = await client.patch(
            f"/api/v1/assets/{created['id']}",
            json={"preliminary_criticality": "Extrémní"},
        )
        assert patched_bad.status_code == 422
        patched_ok = await client.patch(
            f"/api/v1/assets/{created['id']}", json={"preliminary_criticality": "low"}
        )
        assert patched_ok.status_code == 200
        assert patched_ok.json()["preliminary_criticality"] == "low"


@pytest.mark.asyncio
async def test_archive_restore_lifecycle_and_register_listing(
    client_factory, test_user_cro: User
):
    async with client_factory(user=test_user_cro) as client:
        veris = (
            await client.post(
                "/api/v1/assets", json=_minimal_payload(test_user_cro, name="Veris")
            )
        ).json()
        sap = (
            await client.post(
                "/api/v1/assets", json=_minimal_payload(test_user_cro, name="SAP")
            )
        ).json()

        # Archive hides the row from the default register listing.
        assert (await client.delete(f"/api/v1/assets/{sap['id']}")).status_code == 204
        default_list = (await client.get("/api/v1/assets")).json()
        assert default_list["total"] == 1
        assert [item["id"] for item in default_list["items"]] == [veris["id"]]

        with_archived = (await client.get("/api/v1/assets", params={"include_archived": True})).json()
        assert with_archived["total"] == 2
        archived_row = next(item for item in with_archived["items"] if item["id"] == sap["id"])
        assert archived_row["is_archived"] is True
        assert archived_row["archived_by_id"] is not None
        assert archived_row["capabilities"]["can_restore"] is True
        assert archived_row["capabilities"]["can_update"] is False
        assert archived_row["capabilities"]["can_archive"] is False

        # Archived rows cannot be edited (409) or re-archived (400).
        assert (
            await client.patch(f"/api/v1/assets/{sap['id']}", json={"notes": "blocked"})
        ).status_code == 409
        assert (await client.delete(f"/api/v1/assets/{sap['id']}")).status_code == 400

        # Restore brings the row back; restoring an active row is rejected.
        restored = await client.post(f"/api/v1/assets/{sap['id']}/restore")
        assert restored.status_code == 200
        assert restored.json()["is_archived"] is False
        assert restored.json()["archived_at"] is None
        assert (await client.post(f"/api/v1/assets/{sap['id']}/restore")).status_code == 400

        assert (await client.get("/api/v1/assets")).json()["total"] == 2

        # Missing rows 404 on the lifecycle routes too.
        assert (await client.delete("/api/v1/assets/999999")).status_code == 404
        assert (await client.post("/api/v1/assets/999999/restore")).status_code == 404


@pytest.mark.asyncio
async def test_register_listing_supports_search_pagination_and_sorting(
    client_factory, test_user_cro: User
):
    async with client_factory(user=test_user_cro) as client:
        for name in ("Veris", "SAP", "Datový sklad"):
            resp = await client.post(
                "/api/v1/assets", json=_minimal_payload(test_user_cro, name=name)
            )
            assert resp.status_code == 201

        searched = (
            await client.get("/api/v1/assets", params={"search": "veris"})
        ).json()
        assert searched["total"] == 1
        assert searched["items"][0]["name"] == "Veris"

        paged = (
            await client.get("/api/v1/assets", params={"offset": 1, "limit": 1})
        ).json()
        assert paged["total"] == 3
        assert len(paged["items"]) == 1
        assert paged["offset"] == 1
        assert paged["limit"] == 1

        sorted_desc = (
            await client.get(
                "/api/v1/assets", params={"sort_by": "name", "sort_order": "desc"}
            )
        ).json()
        assert [item["name"] for item in sorted_desc["items"]] == [
            "Veris",
            "SAP",
            "Datový sklad",
        ]

        invalid_sort = await client.get(
            "/api/v1/assets", params={"sort_by": "no_such_column"}
        )
        assert invalid_sort.status_code == 400


@pytest.mark.asyncio
async def test_register_listing_filters_assets_with_process_links_before_pagination(
    client_factory, test_user_cro: User
):
    async with client_factory(user=test_user_cro) as client:
        linked = (
            await client.post(
                "/api/v1/assets", json=_minimal_payload(test_user_cro, name="Linked")
            )
        ).json()
        await client.post(
            "/api/v1/assets", json=_minimal_payload(test_user_cro, name="Unlinked")
        )
        process = (
            await client.post(
                "/api/v1/processes",
                json=_process_payload(
                    test_user_cro,
                ),
            )
        ).json()
        link = await client.post(
            f"/api/v1/assets/{linked['id']}/process-links",
            json={"process_id": process["id"]},
        )
        assert link.status_code == 201, link.text

        response = await client.get(
            "/api/v1/assets", params={"has_process_link": True, "limit": 1}
        )

    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1
    assert [row["id"] for row in response.json()["items"]] == [linked["id"]]


@pytest.mark.asyncio
async def test_register_listing_filters_assets_by_derived_criticality(
    client_factory, test_user_cro: User
):
    async with client_factory(user=test_user_cro) as client:
        critical = (
            await client.post(
                "/api/v1/assets",
                json=_minimal_payload(
                    test_user_cro, name="Critical", preliminary_criticality="critical"
                ),
            )
        ).json()
        await client.post(
            "/api/v1/assets",
            json=_minimal_payload(
                test_user_cro, name="Low", preliminary_criticality="low"
            ),
        )

        response = await client.get(
            "/api/v1/assets", params={"criticality": "Kritická"}
        )

    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1
    assert [row["id"] for row in response.json()["items"]] == [critical["id"]]


@pytest.mark.asyncio
async def test_process_asset_link_round_trip_readable_from_both_ends(
    client_factory, test_user_cro: User
):
    """AC: link Assets to Processes with SPOF, managed from the Asset detail, readable from both ends."""
    async with client_factory(user=test_user_cro) as client:
        asset = (
            await client.post(
                "/api/v1/assets",
                json=_minimal_payload(
                    test_user_cro,
                ),
            )
        ).json()
        process = (
            await client.post(
                "/api/v1/processes",
                json=_process_payload(
                    test_user_cro,
                ),
            )
        ).json()

        created = await client.post(
            f"/api/v1/assets/{asset['id']}/process-links",
            json={
                "process_id": process["id"],
                "significance": "Kritická podpora procesu",
                "spof": "Ano",
                "note": "Jediná instance.",
            },
        )
        assert created.status_code == 201, created.text
        link = created.json()
        assert link["process_id"] == process["id"]
        assert link["asset_id"] == asset["id"]
        assert link["significance"] == "Kritická podpora procesu"
        assert link["spof"] == "Ano"
        assert link["is_primary"] is False
        assert link["note"] == "Jediná instance."

        # Readable from the Asset end.
        from_asset = await client.get(f"/api/v1/assets/{asset['id']}/process-links")
        assert from_asset.status_code == 200
        assert [row["id"] for row in from_asset.json()] == [link["id"]]

        # Readable from the Process end.
        from_process = await client.get(
            f"/api/v1/processes/{process['id']}/asset-links"
        )
        assert from_process.status_code == 200
        assert [row["asset_id"] for row in from_process.json()] == [asset["id"]]
        assert from_process.json()[0]["spof"] == "Ano"

        # Remove from the Asset detail; both ends empty out.
        removed = await client.delete(
            f"/api/v1/assets/{asset['id']}/process-links/{process['id']}"
        )
        assert removed.status_code == 204
        assert (
            await client.get(f"/api/v1/assets/{asset['id']}/process-links")
        ).json() == []
        assert (
            await client.get(f"/api/v1/processes/{process['id']}/asset-links")
        ).json() == []

        # Unknown ends 404.
        assert (
            await client.post(
                f"/api/v1/assets/{asset['id']}/process-links",
                json={"process_id": 999999},
            )
        ).status_code == 404
        assert (
            await client.post(
                "/api/v1/assets/999999/process-links",
                json={"process_id": process["id"]},
            )
        ).status_code == 404
        assert (
            await client.delete(
                f"/api/v1/assets/{asset['id']}/process-links/{process['id']}"
            )
        ).status_code == 404
        assert (
            await client.get("/api/v1/assets/999999/process-links")
        ).status_code == 404
        assert (
            await client.get("/api/v1/processes/999999/asset-links")
        ).status_code == 404


@pytest.mark.asyncio
async def test_process_asset_link_enforces_unique_pair_and_closed_lists(
    client_factory, test_user_cro: User
):
    async with client_factory(user=test_user_cro) as client:
        asset = (
            await client.post(
                "/api/v1/assets",
                json=_minimal_payload(
                    test_user_cro,
                ),
            )
        ).json()
        process = (
            await client.post(
                "/api/v1/processes",
                json=_process_payload(
                    test_user_cro,
                ),
            )
        ).json()

        first = await client.post(
            f"/api/v1/assets/{asset['id']}/process-links",
            json={"process_id": process["id"]},
        )
        assert first.status_code == 201

        duplicate = await client.post(
            f"/api/v1/assets/{asset['id']}/process-links",
            json={"process_id": process["id"]},
        )
        assert duplicate.status_code == 400

        # Closed lists: SPOF is AnoNe, significance is VyznamVazby — verbatim.
        other = (
            await client.post(
                "/api/v1/processes",
                json=_process_payload(test_user_cro, l1_process="Upisování"),
            )
        ).json()
        for bad_payload in (
            {"process_id": other["id"], "spof": "Možná"},
            {"process_id": other["id"], "significance": "Zásadní vazba"},
            {"process_id": other["id"], "unknown_field": 1},
        ):
            resp = await client.post(
                f"/api/v1/assets/{asset['id']}/process-links", json=bad_payload
            )
            assert resp.status_code == 422, f"{bad_payload} accepted"

        # PATCH edits the entered link columns under the same closed lists.
        patched = await client.patch(
            f"/api/v1/assets/{asset['id']}/process-links/{process['id']}",
            json={"spof": "Ne", "significance": "Podpůrná vazba"},
        )
        assert patched.status_code == 200, patched.text
        assert patched.json()["spof"] == "Ne"
        assert patched.json()["significance"] == "Podpůrná vazba"

        assert (
            await client.patch(
                f"/api/v1/assets/{asset['id']}/process-links/{process['id']}", json={"spof": "Možná"}
            )
        ).status_code == 422
        assert (
            await client.patch(
                f"/api/v1/assets/{asset['id']}/process-links/999999", json={"spof": "Ne"}
            )
        ).status_code == 404


@pytest.mark.asyncio
async def test_primary_designation_atomic_swap_and_read_projection(client_factory, test_user_cro: User):
    """AC: exactly one linked Process can be the Asset's primary Process; editable.

    Designating a new primary demotes the previous one in a single call, the
    Asset Read payload carries the designation, and removing the primary link
    leaves the Asset with no primary.
    """
    async with client_factory(user=test_user_cro) as client:
        asset = (
            await client.post(
                "/api/v1/assets",
                json=_minimal_payload(
                    test_user_cro,
                ),
            )
        ).json()
        process_a = (
            await client.post(
                "/api/v1/processes",
                json=_process_payload(
                    test_user_cro,
                ),
            )
        ).json()
        process_b = (
            await client.post(
                "/api/v1/processes",
                json=_process_payload(test_user_cro, l1_process="Upisování rizik"),
            )
        ).json()

        # Create the first link directly as primary.
        link_a = await client.post(
            f"/api/v1/assets/{asset['id']}/process-links",
            json={"process_id": process_a["id"], "is_primary": True},
        )
        assert link_a.status_code == 201
        assert link_a.json()["is_primary"] is True
        assert (await client.get(f"/api/v1/assets/{asset['id']}")).json()["primary_process_id"] == process_a["id"]

        # Link B, then designate it primary in ONE call: A demotes atomically.
        assert (
            await client.post(
                f"/api/v1/assets/{asset['id']}/process-links", json={"process_id": process_b["id"]}
            )
        ).status_code == 201
        swapped = await client.patch(
            f"/api/v1/assets/{asset['id']}/process-links/{process_b['id']}",
            json={"is_primary": True},
        )
        assert swapped.status_code == 200, swapped.text
        assert swapped.json()["is_primary"] is True

        links = (await client.get(f"/api/v1/assets/{asset['id']}/process-links")).json()
        primary_flags = {link["process_id"]: link["is_primary"] for link in links}
        assert primary_flags == {process_a["id"]: False, process_b["id"]: True}
        assert sum(1 for link in links if link["is_primary"]) == 1
        assert (await client.get(f"/api/v1/assets/{asset['id']}")).json()["primary_process_id"] == process_b["id"]

        # The register listing carries the designation too.
        listed = (await client.get("/api/v1/assets")).json()["items"]
        assert next(item for item in listed if item["id"] == asset["id"])["primary_process_id"] == process_b["id"]

        # Re-designating the current primary is idempotent.
        again = await client.patch(
            f"/api/v1/assets/{asset['id']}/process-links/{process_b['id']}",
            json={"is_primary": True},
        )
        assert again.status_code == 200
        assert again.json()["is_primary"] is True

        # Explicitly clearing the designation leaves no primary (allowed).
        cleared = await client.patch(
            f"/api/v1/assets/{asset['id']}/process-links/{process_b['id']}",
            json={"is_primary": False},
        )
        assert cleared.status_code == 200
        assert cleared.json()["is_primary"] is False
        assert (await client.get(f"/api/v1/assets/{asset['id']}")).json()["primary_process_id"] is None

        # Removing a primary link leaves the Asset with no primary.
        assert (
            await client.patch(
                f"/api/v1/assets/{asset['id']}/process-links/{process_b['id']}",
                json={"is_primary": True},
            )
        ).status_code == 200
        assert (
            await client.delete(f"/api/v1/assets/{asset['id']}/process-links/{process_b['id']}")
        ).status_code == 204
        assert (await client.get(f"/api/v1/assets/{asset['id']}")).json()["primary_process_id"] is None
        remaining = (await client.get(f"/api/v1/assets/{asset['id']}/process-links")).json()
        assert [link["is_primary"] for link in remaining] == [False]


@pytest.mark.asyncio
async def test_primary_designation_has_a_db_level_partial_unique_index(db_session: AsyncSession):
    """The at-most-one-primary invariant is backstopped by the database.

    The service swap demotes before promoting, but two concurrent
    designations could each miss the other's not-yet-committed promote — so a
    partial unique index on process_asset_links(asset_id) WHERE is_primary
    (both dialects: SQLite test DB, Postgres prod) rejects the second write.
    Declared in the model and in the r5s6t7u8v9w0_add_assets.py migration,
    kept in exact sync.
    """
    from pathlib import Path

    from sqlalchemy.exc import IntegrityError

    from app.models import Asset, Process, ProcessAssetLink

    # Model metadata declares the partial unique index for both dialects.
    index = next(
        idx
        for idx in ProcessAssetLink.__table__.indexes
        if idx.name == "uq_process_asset_links_primary_per_asset"
    )
    assert index.unique is True
    assert [column.name for column in index.columns] == ["asset_id"]
    assert str(index.dialect_options["sqlite"]["where"]) == "is_primary"
    assert str(index.dialect_options["postgresql"]["where"]) == "is_primary"

    # The forward-only migration ships the same index DDL (kept in sync).
    migration_source = (
        Path(__file__).resolve().parents[3] / "backend/alembic/versions/r5s6t7u8v9w0_add_assets.py"
    ).read_text(encoding="utf-8")
    assert 'op.create_index(\n        "uq_process_asset_links_primary_per_asset"' in migration_source
    assert 'sqlite_where=sa.text("is_primary")' in migration_source
    assert 'postgresql_where=sa.text("is_primary")' in migration_source

    # Behavioral backstop: a second primary row for the same Asset is rejected
    # by the database even when the service layer is bypassed entirely.
    asset = Asset(name="Veris")
    process_a = Process(l0_area="Provoz", l1_process="Správa smluv", f_code="F900001")
    process_b = Process(l0_area="Provoz", l1_process="Upisování", f_code="F900002")
    db_session.add_all([asset, process_a, process_b])
    await db_session.commit()
    # Plain ints: attribute access after the failed commit's rollback would
    # trigger a lazy refresh outside the async greenlet.
    asset_id, process_a_id, process_b_id = asset.id, process_a.id, process_b.id

    db_session.add(
        ProcessAssetLink(asset_id=asset_id, process_id=process_a_id, is_primary=True)
    )
    await db_session.commit()

    db_session.add(
        ProcessAssetLink(asset_id=asset_id, process_id=process_b_id, is_primary=True)
    )
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()

    # Non-primary rows stay outside the partial index.
    db_session.add(
        ProcessAssetLink(asset_id=asset_id, process_id=process_b_id, is_primary=False)
    )
    await db_session.commit()

    flags = (
        (
            await db_session.execute(
                select(ProcessAssetLink.is_primary).where(
                    ProcessAssetLink.asset_id == asset_id
                )
            )
        )
        .scalars()
        .all()
    )
    assert sorted(flags) == [False, True]


@pytest.mark.asyncio
async def test_asset_asset_link_directional_round_trip(
    client_factory, test_user_cro: User
):
    """AC: link Assets to Assets, manageable from the Asset detail; direction matters."""
    async with client_factory(user=test_user_cro) as client:
        veris = (
            await client.post(
                "/api/v1/assets", json=_minimal_payload(test_user_cro, name="Veris")
            )
        ).json()
        db_asset = (
            await client.post(
                "/api/v1/assets", json=_minimal_payload(test_user_cro, name="Oracle DB")
            )
        ).json()

        created = await client.post(
            f"/api/v1/assets/{veris['id']}/asset-links",
            json={
                "dependent_asset_id": veris["id"],
                "supporting_asset_id": db_asset["id"],
                "dependency_type": "Datová",
                "spof": "Ano",
                "note": "Primární datové úložiště.",
            },
        )
        assert created.status_code == 201, created.text
        link = created.json()
        assert link["dependent_asset_id"] == veris["id"]
        assert link["supporting_asset_id"] == db_asset["id"]
        assert link["dependency_type"] == "Datová"
        assert link["spof"] == "Ano"
        assert link["note"] == "Primární datové úložiště."

        # Visible from both Assets' details (either end).
        assert [row["id"] for row in (await client.get(f"/api/v1/assets/{veris['id']}/asset-links")).json()] == [
            link["id"]
        ]
        assert [
            row["id"] for row in (await client.get(f"/api/v1/assets/{db_asset['id']}/asset-links")).json()
        ] == [link["id"]]

        # The reverse direction is a distinct row, not a duplicate.
        reverse = await client.post(
            f"/api/v1/assets/{db_asset['id']}/asset-links",
            json={"dependent_asset_id": db_asset["id"], "supporting_asset_id": veris["id"]},
        )
        assert reverse.status_code == 201
        assert len((await client.get(f"/api/v1/assets/{veris['id']}/asset-links")).json()) == 2

        # Remove from the Asset detail.
        assert (
            await client.delete(f"/api/v1/assets/{veris['id']}/asset-links/{link['id']}")
        ).status_code == 204
        assert (
            await client.delete(f"/api/v1/assets/{veris['id']}/asset-links/{link['id']}")
        ).status_code == 404
        assert len((await client.get(f"/api/v1/assets/{veris['id']}/asset-links")).json()) == 1


@pytest.mark.asyncio
async def test_asset_asset_link_rejects_self_links_duplicates_and_bad_values(
    client_factory, test_user_cro: User
):
    async with client_factory(user=test_user_cro) as client:
        veris = (
            await client.post(
                "/api/v1/assets", json=_minimal_payload(test_user_cro, name="Veris")
            )
        ).json()
        db_asset = (
            await client.post(
                "/api/v1/assets", json=_minimal_payload(test_user_cro, name="Oracle DB")
            )
        ).json()

        # Self-links are rejected.
        self_link = await client.post(
            f"/api/v1/assets/{veris['id']}/asset-links",
            json={
                "dependent_asset_id": veris["id"],
                "supporting_asset_id": veris["id"],
            },
        )
        assert self_link.status_code == 422

        # The link must involve the Asset whose detail manages it.
        third = (
            await client.post(
                "/api/v1/assets", json=_minimal_payload(test_user_cro, name="Firewall")
            )
        ).json()
        unrelated = await client.post(
            f"/api/v1/assets/{third['id']}/asset-links",
            json={
                "dependent_asset_id": veris["id"],
                "supporting_asset_id": db_asset["id"],
            },
        )
        assert unrelated.status_code == 400

        # Unique pair: the same ordered pair cannot be linked twice.
        payload = {
            "dependent_asset_id": veris["id"],
            "supporting_asset_id": db_asset["id"],
        }
        assert (
            await client.post(f"/api/v1/assets/{veris['id']}/asset-links", json=payload)
        ).status_code == 201
        assert (
            await client.post(f"/api/v1/assets/{veris['id']}/asset-links", json=payload)
        ).status_code == 400

        # Closed lists: dependency type is TypZavislostiAktiv, SPOF is AnoNe.
        for bad_payload in (
            {"dependent_asset_id": db_asset["id"], "supporting_asset_id": third["id"], "dependency_type": "Aplikační"},
            {"dependent_asset_id": db_asset["id"], "supporting_asset_id": third["id"], "spof": "Neurčeno"},
            {"dependent_asset_id": db_asset["id"], "supporting_asset_id": third["id"], "extra": 1},
        ):
            resp = await client.post(f"/api/v1/assets/{db_asset['id']}/asset-links", json=bad_payload)
            assert resp.status_code == 422, f"{bad_payload} accepted"

        # Unknown other end 404s.
        assert (
            await client.post(
                f"/api/v1/assets/{veris['id']}/asset-links",
                json={"dependent_asset_id": veris["id"], "supporting_asset_id": 999999},
            )
        ).status_code == 404


@pytest.mark.asyncio
async def test_archived_asset_rejects_link_mutations_but_keeps_links_readable(
    client_factory, test_user_cro: User
):
    async with client_factory(user=test_user_cro) as client:
        asset = (
            await client.post(
                "/api/v1/assets",
                json=_minimal_payload(
                    test_user_cro,
                ),
            )
        ).json()
        other = (
            await client.post(
                "/api/v1/assets", json=_minimal_payload(test_user_cro, name="Oracle DB")
            )
        ).json()
        process = (
            await client.post(
                "/api/v1/processes",
                json=_process_payload(
                    test_user_cro,
                ),
            )
        ).json()
        link = (
            await client.post(
                f"/api/v1/assets/{asset['id']}/process-links",
                json={"process_id": process["id"]},
            )
        ).json()

        assert (await client.delete(f"/api/v1/assets/{asset['id']}")).status_code == 204

        # Link relations stay readable on an archived Asset...
        assert (
            await client.get(f"/api/v1/assets/{asset['id']}/process-links")
        ).status_code == 200

        # ...but every link mutation conflicts until the Asset is restored.
        assert (
            await client.post(
                f"/api/v1/assets/{asset['id']}/process-links",
                json={"process_id": process["id"]},
            )
        ).status_code == 409
        assert (
            await client.patch(
                f"/api/v1/assets/{asset['id']}/process-links/{process['id']}",
                json={"is_primary": True},
            )
        ).status_code == 409
        assert (
            await client.delete(
                f"/api/v1/assets/{asset['id']}/process-links/{process['id']}"
            )
        ).status_code == 409
        assert (
            await client.post(
                f"/api/v1/assets/{asset['id']}/asset-links",
                json={
                    "dependent_asset_id": asset["id"],
                    "supporting_asset_id": other["id"],
                },
            )
        ).status_code == 409

        # Linking TO an archived asset conflicts too.
        assert (
            await client.post(
                f"/api/v1/assets/{other['id']}/asset-links",
                json={"dependent_asset_id": other["id"], "supporting_asset_id": asset["id"]},
            )
        ).status_code == 409

        # Archiving the linked process blocks new links to it.
        assert (await client.post(f"/api/v1/assets/{asset['id']}/restore")).status_code == 200
        assert (await client.delete(f"/api/v1/processes/{process['id']}")).status_code == 204
        assert (
            await client.delete(f"/api/v1/assets/{asset['id']}/process-links/{process['id']}")
        ).status_code == 204
        assert (
            await client.post(
                f"/api/v1/assets/{asset['id']}/process-links", json={"process_id": process["id"]}
            )
        ).status_code == 409
        assert link["id"] > 0


@pytest.mark.asyncio
async def test_risk_manager_seed_grants_full_asset_maintenance(
    client_factory, test_user_seeded_risk_manager: User
):
    """Maintenance goes to the risk_manager role via the RBAC seed (CRO wildcard aside)."""
    async with client_factory(user=test_user_seeded_risk_manager) as client:
        created = await client.post(
            "/api/v1/assets", json=_full_payload(test_user_seeded_risk_manager)
        )
        assert created.status_code == 201, created.text
        asset_id = created.json()["id"]
        assert created.json()["capabilities"] == {
            "can_read": True,
            "can_update": True,
            "can_archive": True,
            "can_restore": False,
        }

        assert (
            await client.patch(
                f"/api/v1/assets/{asset_id}", json={"notes": "Updated by RM"}
            )
        ).status_code == 200

        listing = (await client.get("/api/v1/assets")).json()
        assert listing["capabilities"] == {"can_create": True}

        # Link maintenance is part of asset maintenance.
        process = (
            await client.post(
                "/api/v1/processes",
                json=_process_payload(test_user_seeded_risk_manager),
            )
        ).json()
        assert (
            await client.post(
                f"/api/v1/assets/{asset_id}/process-links",
                json={"process_id": process["id"], "is_primary": True},
            )
        ).status_code == 201

        assert (await client.delete(f"/api/v1/assets/{asset_id}")).status_code == 204
        assert (await client.post(f"/api/v1/assets/{asset_id}/restore")).status_code == 200


@pytest.mark.asyncio
async def test_employee_reads_assets_but_cannot_maintain_them(
    client_factory, test_user_cro: User, test_user_employee: User
):
    """Reads follow the standard business-entity pattern; writes 403 for employees."""
    async with client_factory(user=test_user_cro) as client:
        seeded = (
            await client.post(
                "/api/v1/assets",
                json=_minimal_payload(
                    test_user_cro,
                ),
            )
        ).json()
        supporting = (
            await client.post(
                "/api/v1/assets",
                json=_minimal_payload(
                    test_user_cro,
                    name="Employee authorization supporting asset",
                ),
            )
        ).json()
        process = (
            await client.post(
                "/api/v1/processes",
                json=_process_payload(
                    test_user_cro,
                ),
            )
        ).json()
        assert (
            await client.post(
                f"/api/v1/assets/{seeded['id']}/process-links",
                json={"process_id": process["id"]},
            )
        ).status_code == 201

    async with client_factory(user=test_user_employee) as client:
        listing = await client.get("/api/v1/assets")
        assert listing.status_code == 200
        assert listing.json()["capabilities"] == {"can_create": False}

        detail = await client.get(f"/api/v1/assets/{seeded['id']}")
        assert detail.status_code == 200
        assert detail.json()["capabilities"] == {
            "can_read": True,
            "can_update": False,
            "can_archive": False,
            "can_restore": False,
        }

        # Links are readable from both ends with the standard read set.
        assert (
            await client.get(f"/api/v1/assets/{seeded['id']}/process-links")
        ).status_code == 200
        assert (
            await client.get(f"/api/v1/processes/{process['id']}/asset-links")
        ).status_code == 200
        assert (
            await client.get(f"/api/v1/assets/{seeded['id']}/asset-links")
        ).status_code == 200

        # Every maintenance verb is denied.
        assert (
            await client.post(
                "/api/v1/assets",
                json=_minimal_payload(
                    test_user_cro,
                ),
            )
        ).status_code == 403
        assert (
            await client.patch(f"/api/v1/assets/{seeded['id']}", json={"notes": "X"})
        ).status_code == 403
        assert (
            await client.delete(f"/api/v1/assets/{seeded['id']}")
        ).status_code == 403
        assert (
            await client.post(f"/api/v1/assets/{seeded['id']}/restore")
        ).status_code == 403
        assert (
            await client.post(
                f"/api/v1/assets/{seeded['id']}/process-links",
                json={"process_id": process["id"]},
            )
        ).status_code == 403
        assert (
            await client.patch(
                f"/api/v1/assets/{seeded['id']}/process-links/{process['id']}",
                json={"is_primary": True},
            )
        ).status_code == 403
        assert (
            await client.delete(f"/api/v1/assets/{seeded['id']}/process-links/{process['id']}")
        ).status_code == 403
        assert (
            await client.post(
                f"/api/v1/assets/{seeded['id']}/asset-links",
                json={
                    "dependent_asset_id": seeded["id"],
                    "supporting_asset_id": supporting["id"],
                },
            )
        ).status_code == 403
        assert (
            await client.delete(f"/api/v1/assets/{seeded['id']}/asset-links/1")
        ).status_code == 403


@pytest.mark.asyncio
async def test_platform_admin_is_excluded_and_unauthenticated_is_rejected(
    client_factory, test_user_cro: User, test_user_platform_admin: User
):
    async with client_factory(user=test_user_cro) as client:
        seeded = (
            await client.post(
                "/api/v1/assets",
                json=_minimal_payload(
                    test_user_cro,
                ),
            )
        ).json()
        process = (
            await client.post(
                "/api/v1/processes",
                json=_process_payload(
                    test_user_cro,
                ),
            )
        ).json()

    paths_and_calls = [
        ("get", "/api/v1/assets", None),
        ("get", f"/api/v1/assets/{seeded['id']}", None),
        (
            "post",
            "/api/v1/assets",
            _minimal_payload(
                test_user_cro,
            ),
        ),
        ("patch", f"/api/v1/assets/{seeded['id']}", {"notes": "X"}),
        ("delete", f"/api/v1/assets/{seeded['id']}", None),
        ("post", f"/api/v1/assets/{seeded['id']}/restore", None),
        ("get", f"/api/v1/assets/{seeded['id']}/process-links", None),
        (
            "post",
            f"/api/v1/assets/{seeded['id']}/process-links",
            {"process_id": process["id"]},
        ),
        (
            "patch",
            f"/api/v1/assets/{seeded['id']}/process-links/{process['id']}",
            {"is_primary": True},
        ),
        (
            "delete",
            f"/api/v1/assets/{seeded['id']}/process-links/{process['id']}",
            None,
        ),
        ("get", f"/api/v1/assets/{seeded['id']}/asset-links", None),
        (
            "post",
            f"/api/v1/assets/{seeded['id']}/asset-links",
            {"dependent_asset_id": seeded["id"], "supporting_asset_id": 2},
        ),
        ("delete", f"/api/v1/assets/{seeded['id']}/asset-links/1", None),
        ("get", f"/api/v1/processes/{process['id']}/asset-links", None),
    ]

    async def call(client, method: str, path: str, body):
        if body is not None:
            return await getattr(client, method)(path, json=body)
        return await getattr(client, method)(path)

    # Platform admin has no business visibility: collection reads are an empty
    # success while record/action routes remain concealed or denied.
    async with client_factory(user=test_user_platform_admin) as client:
        for method, path, body in paths_and_calls:
            resp = await call(client, method, path, body)
            expected = (
                200 if method == "get" and path == "/api/v1/assets" else {403, 404}
            )
            if expected == 200:
                assert resp.status_code == 200
                assert resp.json()["items"] == []
            else:
                assert (
                    resp.status_code in expected
                ), f"{method.upper()} {path} -> {resp.status_code}"

    # Unauthenticated requests are rejected outright.
    async with client_factory() as client:
        for method, path, body in paths_and_calls:
            resp = await call(client, method, path, body)
            assert (
                resp.status_code == 401
            ), f"{method.upper()} {path} -> {resp.status_code}"


@pytest.mark.asyncio
async def test_asset_mutations_land_on_the_audit_trail(
    client_factory, test_user_cro: User
):
    """Register mutations are attributable via the activity log (spec story 39)."""
    async with client_factory(user=test_user_cro) as client:
        created = (
            await client.post(
                "/api/v1/assets",
                json=_minimal_payload(
                    test_user_cro,
                ),
            )
        ).json()
        await client.patch(
            f"/api/v1/assets/{created['id']}", json={"notes": "Provozní úsek"}
        )
        await client.delete(f"/api/v1/assets/{created['id']}")
        await client.post(f"/api/v1/assets/{created['id']}/restore")

        log = await client.get(
            "/api/v1/activity-log",
            params={"entity_type": "asset", "entity_id": created["id"]},
        )

    assert log.status_code == 200
    entries = log.json()["items"]
    actions = [entry["action"] for entry in entries]
    assert actions.count("create") == 1
    assert actions.count("archive") == 1
    assert actions.count("update") == 2  # field update + restore
    assert all(entry["actor_name"] == "Test CRO" for entry in entries)

    # Changed field names are attributable; free-text values follow the
    # existing redaction policy ([REDACTED] unless allowlisted as safe).
    update_entry = next(
        entry
        for entry in entries
        if entry["action"] == "update" and "notes" in (entry["changes"] or {})
    )
    assert update_entry["changes"]["notes"]["new"] == "[REDACTED]"

    archive_entry = next(entry for entry in entries if entry["action"] == "archive")
    assert archive_entry["changes"]["is_archived"]["new"] is True


@pytest.mark.asyncio
async def test_link_mutations_land_on_the_audit_trail(
    client_factory, test_user_cro: User
):
    async with client_factory(user=test_user_cro) as client:
        asset = (
            await client.post(
                "/api/v1/assets",
                json=_minimal_payload(
                    test_user_cro,
                ),
            )
        ).json()
        other = (
            await client.post(
                "/api/v1/assets", json=_minimal_payload(test_user_cro, name="Oracle DB")
            )
        ).json()
        process = (
            await client.post(
                "/api/v1/processes",
                json=_process_payload(
                    test_user_cro,
                ),
            )
        ).json()

        await client.post(
            f"/api/v1/assets/{asset['id']}/process-links",
            json={"process_id": process["id"]},
        )
        await client.patch(
            f"/api/v1/assets/{asset['id']}/process-links/{process['id']}",
            json={"is_primary": True},
        )
        await client.post(
            f"/api/v1/assets/{asset['id']}/asset-links",
            json={
                "dependent_asset_id": asset["id"],
                "supporting_asset_id": other["id"],
            },
        )
        await client.delete(
            f"/api/v1/assets/{asset['id']}/process-links/{process['id']}"
        )

        log = await client.get(
            "/api/v1/activity-log",
            params={"entity_type": "asset_link", "entity_id": asset["id"]},
        )

    assert log.status_code == 200
    entries = log.json()["items"]
    actions = [entry["action"] for entry in entries]
    assert actions.count("create") == 2  # process link + asset link
    assert actions.count("update") == 1  # primary designation
    assert actions.count("delete") == 1  # unlink
    assert all(entry["actor_name"] == "Test CRO" for entry in entries)


def test_asset_migrations_follow_repo_convention_and_are_forward_only():
    """Asset migrations ship per repo convention (ADR-010, non-negotiable).

    ``<rev>_add_assets.py`` creates the assets table plus both link tables and
    is forward-only; ``<rev>_sync_asset_permissions_for_existing_dbs.py``
    idempotently backfills deployed DBs. A later forward-only correction adds
    the CISO read grant introduced after that historical migration; together,
    the immutable migration records mirror the current RBAC seed exactly.
    Precedent: p3q4r5s6t7u8/q4r5s6t7u8v9 (processes).
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

    add_assets = load_migration("r5s6t7u8v9w0_add_assets.py", "add_assets_migration")
    # Chained onto the process permission sync; single head is preserved.
    assert add_assets.down_revision == "q4r5s6t7u8v9"
    with pytest.raises(NotImplementedError):
        add_assets.downgrade()

    sync = load_migration(
        "s6t7u8v9w0x1_sync_asset_permissions_for_existing_dbs.py", "asset_permission_sync_migration"
    )
    assert sync.down_revision == "r5s6t7u8v9w0"

    # The ensured permission rows are verbatim seed-contract rows.
    for permission in sync.ASSET_PERMISSIONS:
        key = f"{permission['resource']}:{permission['action']}"
        assert PERMISSION_BY_KEY[key]["description"] == permission["description"], key
    assert {f"{p['resource']}:{p['action']}" for p in sync.ASSET_PERMISSIONS} == {
        "assets:read",
        "assets:write",
        "assets:delete",
    }

    correction = load_migration(
        "h9c0d1e2f3g4_sync_ciso_asset_read_permission.py",
        "ciso_asset_permission_sync_migration",
    )
    current_asset_head = load_migration(
        "g8b9c0d1e2f3_replace_asset_responsibility_text.py",
        "asset_responsibility_migration",
    )
    assert correction.down_revision == current_asset_head.revision
    assert correction.ASSET_READ_PERMISSION == PERMISSION_BY_KEY["assets:read"]

    # Effective role grants across the immutable historical sync and the
    # forward-only CISO correction mirror the current seed exactly.
    seed_asset_grants = {
        role_name: {
            key
            for key in expand_permission_keys(permission_keys)
            if key.startswith("assets:")
        }
        for role_name, permission_keys in RBAC_ROLE_PERMISSIONS.items()
        # CRO holds the wildcard; the historical migration re-ensures it explicitly.
        if role_name != "cro"
    }
    seed_asset_grants = {role: keys for role, keys in seed_asset_grants.items() if keys}
    effective_migration_grants = {
        role: set(keys) for role, keys in sync.ROLE_ASSET_GRANTS.items()
    }
    for role_name, permission_keys in correction.ROLE_ASSET_GRANTS.items():
        effective_migration_grants.setdefault(role_name, set()).update(permission_keys)
    assert effective_migration_grants == seed_asset_grants

    with pytest.raises(NotImplementedError):
        sync.downgrade()
    with pytest.raises(NotImplementedError):
        correction.downgrade()
