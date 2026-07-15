"""ICT Register Asset-Vendor and Process-Vendor link relations (issue #46).

Behavior under test, at the HTTP seam via ``client_factory``:
- a Risk Manager links Assets to the Vendors they depend on, each Link
  relation typed by an ICT service S-code from the closed S01-S19 taxonomy
  and carrying the entered 10_VAD columns (vendor role, contract reference,
  reliance, note); the (asset, vendor, S-code) tuple is unique;
- a Risk Manager links Processes to Vendors directly (the manual sheet-11 §1
  set: direct-service description, note); the (process, vendor) pair is
  unique; the transitive expansion stays derived-only (engine-side);
- links are managed from the register end (Asset / Process detail) and
  readable from all three ends, including the Vendor detail;
- coded link columns are enforced against the workbook closed lists
  (RoleDodavatele, Reliance) and the S01-S19 taxonomy from
  ``_ict_register_reference``;
- creating a link whose Asset/Process/Vendor end is archived conflicts (409)
  per the register's strict archived-end stance (#43 precedent, deliberately
  unlike #45's pinned contract-chain divergence); unlinking an archived
  TARGET stays possible from an active register end;
- link reads compose canonical register-row visibility with independent Vendor
  visibility; mutations require canonical active, non-orphan row update
  authority; platform admins are excluded; rows carry per-row capabilities;
- the derivation engine's vendor-link inputs go LIVE: an Asset with a Vendor
  link derives canonical ``external_dependency`` = "yes" and its vendor aggregates; a Process's
  ``dod_n`` counts its §1 links (spec 1.2/1.1);
- link mutations land on the audit trail;
- the migration ships per repo convention (ADR-010, forward-only).

Field inventory source: docs/dora-ict-register/dora-excel-functional-spec.md
section 1.8 (link sheets 10/11). Expected values are spec literals (the
Veris <-> BIZ DATA seed rows).
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.rbac_seed_contract import RBAC_ROLE_PERMISSIONS, expand_permission_keys
from app.models import Department, Permission, Role, RolePermission, User
from app.models.user import AccessScope


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


async def _create_asset(
    client,
    *,
    owner_user_id: int,
    department_id: int,
    **overrides: object,
) -> dict:
    payload: dict[str, object] = {
        "name": "Veris",
        "business_owner_user_id": owner_user_id,
        "ict_owner_user_id": owner_user_id,
        "owning_department_id": department_id,
    }
    payload.update(overrides)
    response = await client.post("/api/v1/assets", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


async def _create_process(client, **overrides: object) -> dict:
    payload: dict[str, object] = {
        "l0_area": "Provoz a služby klientům",
        "l1_process": "Správa pojistných smluv",
    }
    payload.update(overrides)
    response = await client.post("/api/v1/processes", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


async def _create_vendor(client, *, department_id: int, owner_user_id: int, **overrides: object) -> dict:
    payload: dict[str, object] = {
        "name": "BIZ DATA",
        "process": "IT",
        "department_id": department_id,
        "outsourcing_owner_user_id": owner_user_id,
    }
    payload.update(overrides)
    response = await client.post("/api/v1/vendors", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _vendor_link_payload(vendor_id: int, **overrides: object) -> dict[str, object]:
    """Every entered 10_VAD column; values mirror the Veris <-> BIZ DATA seed row."""
    payload: dict[str, object] = {
        "vendor_id": vendor_id,
        "vendor_role": "Dodává",
        "ict_service_code": "S02",
        "contract_reference": "SML-2020-001",
        "reliance": "Úplná závislost",
        "note": "Poznámka k vazbě.",
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_asset_vendor_link_round_trip_readable_from_both_ends(
    client_factory, test_user_cro: User, test_department: Department
):
    """AC: link Assets to Vendors with an S-code, managed from the Asset detail,
    readable from the Asset end and the Vendor end."""
    async with client_factory(user=test_user_cro) as client:
        asset = await _create_asset(
            client,
            owner_user_id=test_user_cro.id,
            department_id=test_department.id,
        )
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)

        created = await client.post(
            f"/api/v1/assets/{asset['id']}/vendor-links", json=_vendor_link_payload(vendor["id"])
        )
        assert created.status_code == 201, created.text
        link = created.json()
        assert link["id"] > 0
        assert link["asset_id"] == asset["id"]
        assert link["vendor_id"] == vendor["id"]
        assert link["vendor_role"] == "Dodává"
        assert link["ict_service_code"] == "S02"
        assert link["contract_reference"] == "SML-2020-001"
        assert link["reliance"] == "Úplná závislost"
        assert link["note"] == "Poznámka k vazbě."

        # Readable from the Asset end.
        from_asset = await client.get(f"/api/v1/assets/{asset['id']}/vendor-links")
        assert from_asset.status_code == 200
        assert [row["id"] for row in from_asset.json()] == [link["id"]]

        # Readable from the Vendor end.
        from_vendor = await client.get(f"/api/v1/vendors/{vendor['id']}/asset-links")
        assert from_vendor.status_code == 200
        assert [row["asset_id"] for row in from_vendor.json()] == [asset["id"]]
        assert from_vendor.json()[0]["ict_service_code"] == "S02"

        # Remove from the Asset detail; both ends empty out.
        removed = await client.delete(f"/api/v1/assets/{asset['id']}/vendor-links/{link['id']}")
        assert removed.status_code == 204
        assert (await client.get(f"/api/v1/assets/{asset['id']}/vendor-links")).json() == []
        assert (await client.get(f"/api/v1/vendors/{vendor['id']}/asset-links")).json() == []

        # Unknown ends 404.
        assert (
            await client.post(
                f"/api/v1/assets/{asset['id']}/vendor-links", json=_vendor_link_payload(999999)
            )
        ).status_code == 404
        assert (
            await client.post("/api/v1/assets/999999/vendor-links", json=_vendor_link_payload(vendor["id"]))
        ).status_code == 404
        assert (
            await client.delete(f"/api/v1/assets/{asset['id']}/vendor-links/{link['id']}")
        ).status_code == 404
        assert (await client.get("/api/v1/assets/999999/vendor-links")).status_code == 404
        assert (await client.get("/api/v1/vendors/999999/asset-links")).status_code == 404


@pytest.mark.asyncio
async def test_asset_vendor_link_enforces_unique_tuple_and_closed_lists(
    client_factory, test_user_cro: User, test_department: Department
):
    """AC: the S-code comes from the closed S01-S19 taxonomy; the identity
    tuple (asset, vendor, S-code) is unique — one Vendor may serve one Asset
    with several typed services (the Veris seed carries S02 AND S14)."""
    async with client_factory(user=test_user_cro) as client:
        asset = await _create_asset(
            client,
            owner_user_id=test_user_cro.id,
            department_id=test_department.id,
        )
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)

        first = await client.post(
            f"/api/v1/assets/{asset['id']}/vendor-links", json=_vendor_link_payload(vendor["id"])
        )
        assert first.status_code == 201, first.text

        duplicate = await client.post(
            f"/api/v1/assets/{asset['id']}/vendor-links", json=_vendor_link_payload(vendor["id"])
        )
        assert duplicate.status_code == 400

        # The same pair under a different S-code is a second typed service.
        second_service = await client.post(
            f"/api/v1/assets/{asset['id']}/vendor-links",
            json=_vendor_link_payload(vendor["id"], ict_service_code="S14", vendor_role="Spravuje"),
        )
        assert second_service.status_code == 201, second_service.text
        assert len((await client.get(f"/api/v1/assets/{asset['id']}/vendor-links")).json()) == 2

        # Closed lists: the S-code taxonomy, RoleDodavatele, and Reliance — verbatim.
        for bad_payload in (
            _vendor_link_payload(vendor["id"], ict_service_code="S99"),
            _vendor_link_payload(vendor["id"], ict_service_code="Cloud"),
            _vendor_link_payload(vendor["id"], ict_service_code="S03", vendor_role="Dodavatel"),
            _vendor_link_payload(vendor["id"], ict_service_code="S03", reliance="Vysoká"),
            _vendor_link_payload(vendor["id"], ict_service_code="S03", unknown_field=1),
        ):
            resp = await client.post(f"/api/v1/assets/{asset['id']}/vendor-links", json=bad_payload)
            assert resp.status_code == 422, f"{bad_payload} accepted"

        # The S-code is required on each Link relation (the AC's typed link).
        missing_s_code = _vendor_link_payload(vendor["id"])
        del missing_s_code["ict_service_code"]
        assert (
            await client.post(f"/api/v1/assets/{asset['id']}/vendor-links", json=missing_s_code)
        ).status_code == 422


@pytest.mark.asyncio
async def test_process_vendor_link_round_trip_readable_from_both_ends(
    client_factory, test_user_cro: User, test_department: Department
):
    """AC: link Processes to Vendors directly (the manual sheet-11 §1 set),
    managed from the Process detail, readable from the Process and Vendor ends."""
    async with client_factory(user=test_user_cro) as client:
        process = await _create_process(
            client,
            process_owner_user_id=test_user_cro.id,
            owning_department_id=test_department.id,
        )
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)

        created = await client.post(
            f"/api/v1/processes/{process['id']}/vendor-links",
            json={
                "vendor_id": vendor["id"],
                "direct_service_description": "Přímá dodávka datových služeb.",
                "note": "k revizi",
            },
        )
        assert created.status_code == 201, created.text
        link = created.json()
        assert link["id"] > 0
        assert link["process_id"] == process["id"]
        assert link["vendor_id"] == vendor["id"]
        assert link["direct_service_description"] == "Přímá dodávka datových služeb."
        assert link["note"] == "k revizi"

        # Readable from the Process end.
        from_process = await client.get(f"/api/v1/processes/{process['id']}/vendor-links")
        assert from_process.status_code == 200
        assert [row["id"] for row in from_process.json()] == [link["id"]]

        # Readable from the Vendor end.
        from_vendor = await client.get(f"/api/v1/vendors/{vendor['id']}/process-links")
        assert from_vendor.status_code == 200
        assert [row["process_id"] for row in from_vendor.json()] == [process["id"]]

        # Remove from the Process detail; both ends empty out.
        removed = await client.delete(f"/api/v1/processes/{process['id']}/vendor-links/{link['id']}")
        assert removed.status_code == 204
        assert (await client.get(f"/api/v1/processes/{process['id']}/vendor-links")).json() == []
        assert (await client.get(f"/api/v1/vendors/{vendor['id']}/process-links")).json() == []

        # Unknown ends 404.
        assert (
            await client.post(
                f"/api/v1/processes/{process['id']}/vendor-links", json={"vendor_id": 999999}
            )
        ).status_code == 404
        assert (
            await client.post("/api/v1/processes/999999/vendor-links", json={"vendor_id": vendor["id"]})
        ).status_code == 404
        assert (
            await client.delete(f"/api/v1/processes/{process['id']}/vendor-links/{link['id']}")
        ).status_code == 404
        assert (await client.get("/api/v1/processes/999999/vendor-links")).status_code == 404
        assert (await client.get("/api/v1/vendors/999999/process-links")).status_code == 404


@pytest.mark.asyncio
async def test_vendor_listing_filters_direct_process_links_before_pagination(
    client_factory, test_user_cro: User, test_department: Department
):
    async with client_factory(user=test_user_cro) as client:
        process = await _create_process(
            client,
            process_owner_user_id=test_user_cro.id,
            owning_department_id=test_department.id,
        )
        linked = await _create_vendor(
            client,
            department_id=test_department.id,
            owner_user_id=test_user_cro.id,
            name="Directly linked",
        )
        await _create_vendor(
            client,
            department_id=test_department.id,
            owner_user_id=test_user_cro.id,
            name="Unlinked",
        )
        created = await client.post(
            f"/api/v1/processes/{process['id']}/vendor-links",
            json={"vendor_id": linked["id"]},
        )
        assert created.status_code == 201, created.text

        response = await client.get(
            "/api/v1/vendors", params={"has_direct_process_link": True, "limit": 1}
        )

    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1
    assert [row["id"] for row in response.json()["items"]] == [linked["id"]]


@pytest.mark.asyncio
async def test_process_vendor_link_enforces_unique_pair_and_write_shape(
    client_factory, test_user_cro: User, test_department: Department
):
    """Sheet 11 §1 has no service column: the (process, vendor) pair is unique."""
    async with client_factory(user=test_user_cro) as client:
        process = await _create_process(
            client,
            process_owner_user_id=test_user_cro.id,
            owning_department_id=test_department.id,
        )
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)

        first = await client.post(
            f"/api/v1/processes/{process['id']}/vendor-links", json={"vendor_id": vendor["id"]}
        )
        assert first.status_code == 201, first.text

        duplicate = await client.post(
            f"/api/v1/processes/{process['id']}/vendor-links",
            json={"vendor_id": vendor["id"], "note": "duplicitní pár"},
        )
        assert duplicate.status_code == 400

        # Unknown keys are rejected — derived §1 lookups can never be written.
        assert (
            await client.post(
                f"/api/v1/processes/{process['id']}/vendor-links",
                json={"vendor_id": vendor["id"], "cif": "Ano"},
            )
        ).status_code == 422


@pytest.mark.asyncio
async def test_archived_ends_conflict_vendor_link_mutations(
    client_factory, test_user_cro: User, test_department: Department
):
    """Strict archived-end stance (#43 precedent): an archived register end
    conflicts every link mutation; an archived Vendor target conflicts NEW
    links while unlinking it from an active register end stays possible."""
    async with client_factory(user=test_user_cro) as client:
        asset = await _create_asset(
            client,
            owner_user_id=test_user_cro.id,
            department_id=test_department.id,
        )
        process = await _create_process(
            client,
            process_owner_user_id=test_user_cro.id,
            owning_department_id=test_department.id,
        )
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        other_vendor = await _create_vendor(
            client, department_id=test_department.id, owner_user_id=test_user_cro.id, name="Veris s.r.o."
        )

        asset_link = (
            await client.post(
                f"/api/v1/assets/{asset['id']}/vendor-links", json=_vendor_link_payload(vendor["id"])
            )
        ).json()
        process_link = (
            await client.post(
                f"/api/v1/processes/{process['id']}/vendor-links", json={"vendor_id": vendor["id"]}
            )
        ).json()

        # --- Archived ASSET end: reads stay open, every mutation conflicts.
        assert (await client.delete(f"/api/v1/assets/{asset['id']}")).status_code == 204
        assert (await client.get(f"/api/v1/assets/{asset['id']}/vendor-links")).status_code == 200
        assert (
            await client.post(
                f"/api/v1/assets/{asset['id']}/vendor-links",
                json=_vendor_link_payload(other_vendor["id"]),
            )
        ).status_code == 409
        assert (
            await client.delete(f"/api/v1/assets/{asset['id']}/vendor-links/{asset_link['id']}")
        ).status_code == 409
        assert (await client.post(f"/api/v1/assets/{asset['id']}/restore")).status_code == 200

        # --- Archived PROCESS end: same conflict stance.
        assert (await client.delete(f"/api/v1/processes/{process['id']}")).status_code == 204
        assert (await client.get(f"/api/v1/processes/{process['id']}/vendor-links")).status_code == 200
        assert (
            await client.post(
                f"/api/v1/processes/{process['id']}/vendor-links", json={"vendor_id": other_vendor["id"]}
            )
        ).status_code == 409
        assert (
            await client.delete(f"/api/v1/processes/{process['id']}/vendor-links/{process_link['id']}")
        ).status_code == 409
        assert (await client.post(f"/api/v1/processes/{process['id']}/restore")).status_code == 200

        # --- Archived VENDOR target: new links conflict from both register ends...
        assert (await client.delete(f"/api/v1/vendors/{vendor['id']}")).status_code in (200, 204)
        assert (
            await client.post(
                f"/api/v1/assets/{asset['id']}/vendor-links",
                json=_vendor_link_payload(vendor["id"], ict_service_code="S14"),
            )
        ).status_code == 409
        assert (
            await client.post(
                f"/api/v1/processes/{process['id']}/vendor-links", json={"vendor_id": vendor["id"]}
            )
        ).status_code == 409

        # ...while the links stay readable and unlinking the archived Vendor
        # from the ACTIVE register end still works (#43: removal stays possible).
        assert (await client.get(f"/api/v1/assets/{asset['id']}/vendor-links")).status_code == 200
        assert (
            await client.delete(f"/api/v1/assets/{asset['id']}/vendor-links/{asset_link['id']}")
        ).status_code == 204
        assert (
            await client.delete(f"/api/v1/processes/{process['id']}/vendor-links/{process_link['id']}")
        ).status_code == 204


@pytest.mark.asyncio
async def test_risk_manager_seed_maintains_vendor_links_with_capabilities(
    client_factory, test_user_cro: User, test_department: Department, test_user_seeded_risk_manager: User
):
    """Maintenance goes to the register end's write permission via the RBAC
    seed; rows carry per-row capabilities for the manage-from-both-ends UI."""
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)

    async with client_factory(user=test_user_seeded_risk_manager) as client:
        asset = await _create_asset(
            client,
            owner_user_id=test_user_cro.id,
            department_id=test_department.id,
        )
        process = await _create_process(
            client,
            process_owner_user_id=test_user_cro.id,
            owning_department_id=test_department.id,
        )

        asset_link = await client.post(
            f"/api/v1/assets/{asset['id']}/vendor-links", json=_vendor_link_payload(vendor["id"])
        )
        assert asset_link.status_code == 201, asset_link.text
        assert asset_link.json()["capabilities"] == {"can_delete": True}

        process_link = await client.post(
            f"/api/v1/processes/{process['id']}/vendor-links", json={"vendor_id": vendor["id"]}
        )
        assert process_link.status_code == 201, process_link.text
        assert process_link.json()["capabilities"] == {"can_delete": True}

        # Per-row capabilities ride every read end, the Vendor end included.
        assert (await client.get(f"/api/v1/assets/{asset['id']}/vendor-links")).json()[0][
            "capabilities"
        ] == {"can_delete": True}
        assert (await client.get(f"/api/v1/vendors/{vendor['id']}/asset-links")).json()[0][
            "capabilities"
        ] == {"can_delete": True}
        assert (await client.get(f"/api/v1/vendors/{vendor['id']}/process-links")).json()[0][
            "capabilities"
        ] == {"can_delete": True}

        assert (
            await client.delete(f"/api/v1/assets/{asset['id']}/vendor-links/{asset_link.json()['id']}")
        ).status_code == 204
        assert (
            await client.delete(
                f"/api/v1/processes/{process['id']}/vendor-links/{process_link.json()['id']}"
            )
        ).status_code == 204


@pytest.mark.asyncio
async def test_employee_reads_vendor_links_but_cannot_maintain_them(
    client_factory, test_user_cro: User, test_department: Department, test_user_employee: User
):
    """Reads follow canonical row visibility; unauthorized mutations return 403."""
    async with client_factory(user=test_user_cro) as client:
        asset = await _create_asset(
            client,
            owner_user_id=test_user_cro.id,
            department_id=test_department.id,
        )
        process = await _create_process(
            client,
            process_owner_user_id=test_user_cro.id,
            owning_department_id=test_department.id,
        )
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        asset_link = (
            await client.post(
                f"/api/v1/assets/{asset['id']}/vendor-links", json=_vendor_link_payload(vendor["id"])
            )
        ).json()
        process_link = (
            await client.post(
                f"/api/v1/processes/{process['id']}/vendor-links", json={"vendor_id": vendor["id"]}
            )
        ).json()

    async with client_factory(user=test_user_employee) as client:
        # All three read ends are open to the standard read set...
        for path in (
            f"/api/v1/assets/{asset['id']}/vendor-links",
            f"/api/v1/processes/{process['id']}/vendor-links",
            f"/api/v1/vendors/{vendor['id']}/asset-links",
            f"/api/v1/vendors/{vendor['id']}/process-links",
        ):
            response = await client.get(path)
            assert response.status_code == 200, path
            # ...and per-row capabilities say the rows are not theirs to mutate.
            assert response.json()[0]["capabilities"] == {"can_delete": False}, path

        # Every maintenance verb is denied without the register end's write.
        assert (
            await client.post(
                f"/api/v1/assets/{asset['id']}/vendor-links",
                json=_vendor_link_payload(vendor["id"], ict_service_code="S14"),
            )
        ).status_code == 403
        assert (
            await client.delete(f"/api/v1/assets/{asset['id']}/vendor-links/{asset_link['id']}")
        ).status_code == 403
        assert (
            await client.post(
                f"/api/v1/processes/{process['id']}/vendor-links", json={"vendor_id": vendor["id"]}
            )
        ).status_code == 403
        assert (
            await client.delete(f"/api/v1/processes/{process['id']}/vendor-links/{process_link['id']}")
        ).status_code == 403


@pytest.mark.asyncio
async def test_archived_register_end_suppresses_vendor_link_delete_capability(
    client_factory, test_user_cro: User, test_department: Department
):
    async with client_factory(user=test_user_cro) as client:
        asset = await _create_asset(
            client,
            owner_user_id=test_user_cro.id,
            department_id=test_department.id,
        )
        process = await _create_process(
            client,
            process_owner_user_id=test_user_cro.id,
            owning_department_id=test_department.id,
        )
        vendor = await _create_vendor(
            client, department_id=test_department.id, owner_user_id=test_user_cro.id
        )
        await client.post(
            f"/api/v1/assets/{asset['id']}/vendor-links",
            json=_vendor_link_payload(vendor["id"]),
        )
        await client.post(
            f"/api/v1/processes/{process['id']}/vendor-links",
            json={"vendor_id": vendor["id"]},
        )

        assert (await client.delete(f"/api/v1/assets/{asset['id']}")).status_code == 204
        assert (await client.delete(f"/api/v1/processes/{process['id']}")).status_code == 204

        asset_rows = (await client.get(f"/api/v1/vendors/{vendor['id']}/asset-links")).json()
        process_rows = (await client.get(f"/api/v1/vendors/{vendor['id']}/process-links")).json()

    assert asset_rows[0]["capabilities"] == {"can_delete": False}
    assert process_rows[0]["capabilities"] == {"can_delete": False}


@pytest.mark.asyncio
async def test_archived_vendor_end_preserves_vendor_link_cleanup_capability(
    client_factory, test_user_cro: User, test_department: Department
):
    async with client_factory(user=test_user_cro) as client:
        asset = await _create_asset(
            client,
            owner_user_id=test_user_cro.id,
            department_id=test_department.id,
        )
        process = await _create_process(
            client,
            process_owner_user_id=test_user_cro.id,
            owning_department_id=test_department.id,
        )
        vendor = await _create_vendor(
            client, department_id=test_department.id, owner_user_id=test_user_cro.id
        )
        await client.post(
            f"/api/v1/assets/{asset['id']}/vendor-links",
            json=_vendor_link_payload(vendor["id"]),
        )
        await client.post(
            f"/api/v1/processes/{process['id']}/vendor-links",
            json={"vendor_id": vendor["id"]},
        )

        assert (await client.delete(f"/api/v1/vendors/{vendor['id']}")).status_code in (200, 204)

        asset_rows = (await client.get(f"/api/v1/assets/{asset['id']}/vendor-links")).json()
        process_rows = (await client.get(f"/api/v1/processes/{process['id']}/vendor-links")).json()

    assert asset_rows[0]["capabilities"] == {"can_delete": True}
    assert process_rows[0]["capabilities"] == {"can_delete": True}


@pytest.mark.asyncio
async def test_platform_admin_is_excluded_and_unauthenticated_is_rejected(
    client_factory, test_user_cro: User, test_department: Department, test_user_platform_admin: User
):
    async with client_factory(user=test_user_cro) as client:
        asset = await _create_asset(
            client,
            owner_user_id=test_user_cro.id,
            department_id=test_department.id,
        )
        process = await _create_process(
            client,
            process_owner_user_id=test_user_cro.id,
            owning_department_id=test_department.id,
        )
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)

    paths_and_calls = [
        ("get", f"/api/v1/assets/{asset['id']}/vendor-links", None),
        ("post", f"/api/v1/assets/{asset['id']}/vendor-links", _vendor_link_payload(vendor["id"])),
        ("delete", f"/api/v1/assets/{asset['id']}/vendor-links/1", None),
        ("get", f"/api/v1/processes/{process['id']}/vendor-links", None),
        ("post", f"/api/v1/processes/{process['id']}/vendor-links", {"vendor_id": vendor["id"]}),
        ("delete", f"/api/v1/processes/{process['id']}/vendor-links/1", None),
        ("get", f"/api/v1/vendors/{vendor['id']}/asset-links", None),
        ("get", f"/api/v1/vendors/{vendor['id']}/process-links", None),
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


@pytest.mark.asyncio
async def test_vendor_link_mutations_land_on_the_audit_trail(
    client_factory, test_user_cro: User, test_department: Department
):
    """Register mutations are attributable via the activity log (spec story 39).

    Asset<->Vendor rides the asset_link surface (#43 precedent, kind
    "vendor"); Process<->Vendor gets the process_link surface."""
    async with client_factory(user=test_user_cro) as client:
        asset = await _create_asset(
            client,
            owner_user_id=test_user_cro.id,
            department_id=test_department.id,
        )
        process = await _create_process(
            client,
            process_owner_user_id=test_user_cro.id,
            owning_department_id=test_department.id,
        )
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)

        asset_link = (
            await client.post(
                f"/api/v1/assets/{asset['id']}/vendor-links", json=_vendor_link_payload(vendor["id"])
            )
        ).json()
        await client.delete(f"/api/v1/assets/{asset['id']}/vendor-links/{asset_link['id']}")

        process_link = (
            await client.post(
                f"/api/v1/processes/{process['id']}/vendor-links", json={"vendor_id": vendor["id"]}
            )
        ).json()
        await client.delete(f"/api/v1/processes/{process['id']}/vendor-links/{process_link['id']}")

        asset_log = await client.get(
            "/api/v1/activity-log",
            params={"entity_type": "asset_link", "entity_id": asset["id"]},
        )
        process_log = await client.get(
            "/api/v1/activity-log",
            params={"entity_type": "process_link", "entity_id": process["id"]},
        )

    assert asset_log.status_code == 200
    asset_entries = asset_log.json()["items"]
    assert [entry["action"] for entry in asset_entries].count("create") == 1
    assert [entry["action"] for entry in asset_entries].count("delete") == 1
    assert all(entry["actor_name"] == "Test CRO" for entry in asset_entries)
    create_entry = next(entry for entry in asset_entries if entry["action"] == "create")
    assert create_entry["changes"]["link_kind"]["new"] == "vendor"
    assert create_entry["changes"]["target_id"]["new"] == vendor["id"]

    assert process_log.status_code == 200
    process_entries = process_log.json()["items"]
    assert [entry["action"] for entry in process_entries].count("create") == 1
    assert [entry["action"] for entry in process_entries].count("delete") == 1
    assert all(entry["actor_name"] == "Test CRO" for entry in process_entries)
    process_create = next(entry for entry in process_entries if entry["action"] == "create")
    assert process_create["changes"]["link_kind"]["new"] == "vendor"
    assert process_create["changes"]["target_id"]["new"] == vendor["id"]


@pytest.mark.asyncio
async def test_asset_vendor_link_flips_ext_zavis_and_vendor_aggregates_on_read(
    client_factory, test_user_cro: User, test_department: Department
):
    """The engine's sheet-10 input goes LIVE (spec 1.2): ``ext_zavis`` is
    canonical "yes" iff the Asset has a 10_VAD link, and the ``dod_seznam`` /
    ``ict_sluzby`` / ``smlouvy`` TEXTJOIN aggregates carry the link columns."""
    async with client_factory(user=test_user_cro) as client:
        asset = await _create_asset(
            client,
            owner_user_id=test_user_cro.id,
            department_id=test_department.id,
        )
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)

        before = (await client.get(f"/api/v1/assets/{asset['id']}")).json()["derived"]
        assert before["external_dependency"] == "no"
        assert before["linked_vendor_count"] == 0
        assert before["vendor_names"] == []

        assert (
            await client.post(
                f"/api/v1/assets/{asset['id']}/vendor-links", json=_vendor_link_payload(vendor["id"])
            )
        ).status_code == 201

        after = (await client.get(f"/api/v1/assets/{asset['id']}")).json()["derived"]
        assert after["external_dependency"] == "yes"
        assert after["linked_vendor_count"] == 1
        assert after["vendor_names"] == ["BIZ DATA"]
        assert after["ict_service_codes"] == ["S02"]
        assert after["contract_references"] == ["SML-2020-001"]

        # The register listing recomputes the same way (compute-on-read).
        listing = (await client.get("/api/v1/assets")).json()["items"]
        listed = next(row for row in listing if row["id"] == asset["id"])
        assert listed["derived"]["external_dependency"] == "yes"
        assert listed["derived"]["linked_vendor_count"] == 1

        # Removing the link flips the derivation straight back — no staleness.
        link_id = (await client.get(f"/api/v1/assets/{asset['id']}/vendor-links")).json()[0]["id"]
        assert (
            await client.delete(f"/api/v1/assets/{asset['id']}/vendor-links/{link_id}")
        ).status_code == 204
        reverted = (await client.get(f"/api/v1/assets/{asset['id']}")).json()["derived"]
        assert reverted["external_dependency"] == "no"
        assert reverted["linked_vendor_count"] == 0


@pytest.mark.asyncio
async def test_process_vendor_link_counts_into_dod_n_on_read(
    client_factory, test_user_cro: User, test_department: Department
):
    """The engine's sheet-11 §1 input goes LIVE: a Process's ``dod_n``
    (linked_vendor_count) counts its manual pairs (spec 1.1)."""
    async with client_factory(user=test_user_cro) as client:
        process = await _create_process(
            client,
            process_owner_user_id=test_user_cro.id,
            owning_department_id=test_department.id,
        )
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)

        before = (await client.get(f"/api/v1/processes/{process['id']}")).json()["derived"]
        assert before["linked_vendor_count"] == 0

        assert (
            await client.post(
                f"/api/v1/processes/{process['id']}/vendor-links", json={"vendor_id": vendor["id"]}
            )
        ).status_code == 201

        after = (await client.get(f"/api/v1/processes/{process['id']}")).json()["derived"]
        assert after["linked_vendor_count"] == 1

        # The register listing recomputes the same way (compute-on-read).
        listing = (await client.get("/api/v1/processes")).json()["items"]
        listed = next(row for row in listing if row["id"] == process["id"])
        assert listed["derived"]["linked_vendor_count"] == 1


def _load_migration(migration_path):
    import importlib.util

    spec = importlib.util.spec_from_file_location(migration_path.stem, migration_path)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    return migration


def test_activity_log_entity_type_is_widened_for_register_link_members():
    """The audit-trail column fits every ActivityEntityType member (E2E-found #45 defect).

    Migration 18b1c2d3e4f5 re-sized activity_logs.entity_type to VARCHAR(18)
    (its longest enumerated value then), so #45's 22-char
    ``vendor_sub_outsourcing`` rows 500 on any alembic-migrated Postgres —
    SQLite ignores VARCHAR lengths, so only live E2E caught it. A widening
    migration takes the column to VARCHAR(64) (headroom is deliberate: the
    register keeps adding members) using the SQLite-safe batch convention,
    and the model column carries the same explicit length so schema parity
    holds. The guard below makes the truncation class of bug impossible to
    reintroduce silently.
    """
    from pathlib import Path

    from app.models.activity_log import ActivityEntityType, ActivityLog

    versions_dir = Path(__file__).resolve().parents[3] / "backend/alembic/versions"

    widen_files = list(versions_dir.glob("*_widen_activity_log_entity_type.py"))
    assert len(widen_files) == 1, "exactly one widening migration ships"
    widen = _load_migration(widen_files[0])

    # Chained onto the sub-outsourcing head, ahead of the link tables.
    assert widen.down_revision == "v9w0x1y2z3a4"
    with pytest.raises(NotImplementedError):
        widen.downgrade()

    widen_source = widen_files[0].read_text(encoding="utf-8")
    assert 'batch_alter_table("activity_logs"' in widen_source
    assert "sa.String(length=64)" in widen_source

    # Model <-> migration parity, and the invariant that prevents recurrence:
    # the column always fits the longest member's persisted name.
    column_length = ActivityLog.__table__.c.entity_type.type.length
    assert column_length == 64
    longest_member = max(len(member.name) for member in ActivityEntityType)
    assert column_length >= longest_member


def test_vendor_links_migration_follows_repo_convention_and_is_forward_only():
    """ONE add migration ships per repo convention (ADR-010, non-negotiable).

    ``<rev>_add_register_vendor_links.py`` creates both link tables with
    their FK indexes and unique tuples, chains onto the entity-type widening
    migration (single linear head preserved), and is forward-only. No
    permission-sync migration exists — mutations reuse assets:write /
    processes:write and reads reuse the existing read permissions.
    Precedent: v9w0x1y2z3a4.
    """
    from pathlib import Path

    versions_dir = Path(__file__).resolve().parents[3] / "backend/alembic/versions"

    migration_files = list(versions_dir.glob("*_add_register_vendor_links.py"))
    assert len(migration_files) == 1, "exactly one add migration ships"
    migration_path = migration_files[0]

    migration = _load_migration(migration_path)

    # Chained onto the entity-type widen; single linear head is preserved.
    widen_files = list(versions_dir.glob("*_widen_activity_log_entity_type.py"))
    assert len(widen_files) == 1
    widen = _load_migration(widen_files[0])
    assert migration.down_revision == widen.revision
    with pytest.raises(NotImplementedError):
        migration.downgrade()

    migration_source = migration_path.read_text(encoding="utf-8")
    assert 'op.create_table(\n        "asset_vendor_links"' in migration_source
    assert 'op.create_table(\n        "process_vendor_links"' in migration_source

    # The entered 10_VAD columns and the identity tuple.
    for column in ("vendor_role", "ict_service_code", "contract_reference", "reliance", "note"):
        assert f'sa.Column("{column}"' in migration_source, column
    assert '"asset_id", "vendor_id", "ict_service_code", name="uq_asset_vendor_link"' in migration_source

    # The entered 11 §1 columns and the unique pair.
    assert 'sa.Column("direct_service_description"' in migration_source
    assert '"process_id", "vendor_id", name="uq_process_vendor_link"' in migration_source

    # FK indexes on every link end.
    for index_name in (
        "ix_asset_vendor_links_asset_id",
        "ix_asset_vendor_links_vendor_id",
        "ix_process_vendor_links_process_id",
        "ix_process_vendor_links_vendor_id",
    ):
        assert index_name in migration_source, index_name

    # CASCADE follows the register FK precedent (#43 link tables).
    assert migration_source.count('ondelete="CASCADE"') == 4

    # No permission-sync migration exists for this slice.
    assert not list(versions_dir.glob("*vendor_links_permissions*"))
    assert not list(versions_dir.glob("*register_vendor_links_permissions*"))
