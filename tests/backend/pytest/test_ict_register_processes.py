"""ICT Register Process register (issue #42).

Behavior under test, at the HTTP seam via ``client_factory``:
- a Risk Manager maintains Processes (create, read, update, archive, restore)
  with the workbook's entered fields: the L0/L1/L2 hierarchy, owner and owning
  department, the four impact dimensions (plus the informative reputational
  one), MTPD/RTO/RPO, BCM, the CIF override, preliminary class, DR test
  fields, assessment date, and notes;
- every Process receives a stable F-code at creation, never reassigned;
- derived workbook fields (score, class, CIF, gap checks, next review,
  counts, completeness) are not writable — ticket #48 derives them;
- coded fields are enforced against the workbook closed lists from
  ``_ict_register_reference`` (impact dimensions are Skala15 integers);
- maintenance is restricted per the RBAC seed (risk_manager + CRO wildcard),
  reads follow the standard business-entity pattern, platform admins are
  excluded, and mutations land on the audit trail.

Field inventory source: docs/dora-ict-register/dora-excel-functional-spec.md
section 1.1 (03_Procesy). Expected values are spec literals.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.db.rbac_seed_contract import RBAC_ROLE_PERMISSIONS, expand_permission_keys
from app.models import Department, Permission, Role, RolePermission, User
from app.models.user import AccessScope


_ACCOUNTABILITY: dict[str, int] = {}


@pytest_asyncio.fixture(autouse=True)
async def process_accountability(test_user_cro: User, test_department: Department):
    """Give every Process write a real active owner and Department."""
    _ACCOUNTABILITY.update(
        process_owner_user_id=test_user_cro.id,
        owning_department_id=test_department.id,
    )
    yield
    _ACCOUNTABILITY.clear()


@pytest_asyncio.fixture
async def test_user_seeded_risk_manager(db_session: AsyncSession) -> User:
    """Risk manager holding exactly the canonical RBAC seed permissions.

    Built from ``RBAC_ROLE_PERMISSIONS`` so the test proves the production
    seed grants Process register maintenance to the risk_manager role.
    """
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
    payload: dict[str, object] = {
        "l0_area": "Provoz a služby klientům",
        "l1_process": "Správa pojistných smluv",
        **_ACCOUNTABILITY,
    }
    payload.update(overrides)
    return payload


def _full_payload(**overrides: object) -> dict[str, object]:
    """Every entered 03_Procesy field (spec section 1.1)."""
    payload: dict[str, object] = {
        "l0_area": "Provoz a služby klientům",
        "l1_process": "Správa pojistných smluv",
        "l2_subprocess": "Změny smluv",
        **_ACCOUNTABILITY,
        "impact_client": 4,
        "impact_market_operations": 3,
        "impact_regulatory": 2,
        "impact_financial": 5,
        "impact_reputational": 1,
        "mtpd_hours": 24,
        "preliminary_criticality": "high",
        "cif_override": "yes",
        "licensed_activity": "non_life_insurance",
        "rto_hours": 8,
        "rpo_hours": 4,
        "bcm_link": "yes",
        "last_dr_test_date": "2026-05-15",
        "dr_test_result": "successful",
        "interruption_impact": "high",
        "assessment_date": "2026-06-01",
        "notes": "Poznámka k procesu.",
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint", ["/api/v1/processes", "/api/v1/assets", "/api/v1/threats"])
async def test_register_lists_reject_invalid_sort_order(
    client_factory, test_user_cro: User, endpoint: str
):
    async with client_factory(user=test_user_cro) as client:
        response = await client.get(endpoint, params={"sort_order": "sideways"})

    assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_create_and_read_process_with_all_entered_fields(client_factory, test_user_cro: User):
    async with client_factory(user=test_user_cro) as client:
        created = await client.post("/api/v1/processes", json=_full_payload())

        assert created.status_code == 201, created.text
        body = created.json()
        assert body["id"] > 0
        # The RoI F-code is assigned by the server at creation (spec: B_06.01).
        assert body["f_code"] == f"F{body['id']}"
        assert body["l0_area"] == "Provoz a služby klientům"
        assert body["l1_process"] == "Správa pojistných smluv"
        assert body["l2_subprocess"] == "Změny smluv"
        assert body["process_owner_user_id"] == test_user_cro.id
        assert body["owning_department_id"] == test_user_cro.department_id
        assert body["process_owner"] == {
            "name": "Test CRO",
            "email": "cro@test.com",
            "role_name": "cro",
            "department_name": "Test Department",
        }
        assert body["owning_department"] == {"name": "Test Department", "code": "TEST"}
        assert body["impact_client"] == 4
        assert body["impact_market_operations"] == 3
        assert body["impact_regulatory"] == 2
        assert body["impact_financial"] == 5
        assert body["impact_reputational"] == 1
        assert body["mtpd_hours"] == 24
        assert body["preliminary_criticality"] == "high"
        assert body["cif_override"] == "yes"
        assert body["licensed_activity"] == "non_life_insurance"
        assert body["rto_hours"] == 8
        assert body["rpo_hours"] == 4
        assert body["bcm_link"] == "yes"
        assert body["last_dr_test_date"] == "2026-05-15"
        assert body["dr_test_result"] == "successful"
        assert body["interruption_impact"] == "high"
        assert body["assessment_date"] == "2026-06-01"
        assert body["notes"] == "Poznámka k procesu."
        assert body["is_archived"] is False

        fetched = await client.get(f"/api/v1/processes/{body['id']}")
        assert fetched.status_code == 200
        assert fetched.json() == body

        missing = await client.get("/api/v1/processes/999999")
        assert missing.status_code == 404


@pytest.mark.asyncio
async def test_f_code_is_stable_and_never_reassigned(client_factory, test_user_cro: User):
    """AC: every Process receives a stable F-code at creation, never reassigned.

    Updates must not touch it, clients cannot choose it, and the sequence
    survives archive — an archived Process keeps its code and a new Process
    never reuses it.
    """
    async with client_factory(user=test_user_cro) as client:
        first = (await client.post("/api/v1/processes", json=_minimal_payload())).json()
        second_payload = _minimal_payload(l1_process="Likvidace pojistných událostí")
        second = (await client.post("/api/v1/processes", json=second_payload)).json()
        assert first["f_code"] == "F1"
        assert second["f_code"] == "F2"

        # Update does not change the F-code.
        updated = await client.patch(f"/api/v1/processes/{first['id']}", json={"l1_process": "Přejmenovaný proces"})
        assert updated.status_code == 200
        assert updated.json()["f_code"] == "F1"
        assert updated.json()["l1_process"] == "Přejmenovaný proces"

        # Archive the second Process; its F-code is not freed.
        archived = await client.delete(f"/api/v1/processes/{second['id']}")
        assert archived.status_code == 204

        third = (await client.post("/api/v1/processes", json=_minimal_payload(l1_process="Nový proces"))).json()
        assert third["f_code"] == "F3"

        still_archived = await client.get(f"/api/v1/processes/{second['id']}")
        assert still_archived.status_code == 200
        assert still_archived.json()["f_code"] == "F2"
        assert still_archived.json()["is_archived"] is True


# Derived 03_Procesy fields (spec section 1.1) arrive with the derivation
# engine (ticket #48) and must never be writable; f_code is server-assigned.
DERIVED_FIELD_WRITES: dict[str, object] = {
    "f_code": "F999",
    "score": 21,
    "criticality_class": "Kritická",
    "cif": "Ano",
    "rto_check": "OK",
    "bcm_check": "OK",
    "next_assessment_date": "2027-06-01",
    "asset_count": 3,
    "vendor_count": 2,
    "is_complete": True,
}


@pytest.mark.asyncio
async def test_writes_that_include_derived_fields_are_rejected(client_factory, test_user_cro: User):
    async with client_factory(user=test_user_cro) as client:
        existing = (await client.post("/api/v1/processes", json=_minimal_payload())).json()

        for field, value in DERIVED_FIELD_WRITES.items():
            create_resp = await client.post("/api/v1/processes", json=_minimal_payload(**{field: value}))
            assert create_resp.status_code == 422, f"POST accepted derived field {field}"

            patch_resp = await client.patch(f"/api/v1/processes/{existing['id']}", json={field: value})
            assert patch_resp.status_code == 422, f"PATCH accepted derived field {field}"

        # The register did not silently change.
        unchanged = await client.get(f"/api/v1/processes/{existing['id']}")
        assert unchanged.json()["f_code"] == existing["f_code"]


@pytest.mark.asyncio
async def test_impact_dimensions_are_skala15_integers(client_factory, test_user_cro: User):
    """Spec: the impact dimensions are Skala15 values — integers 1-5.

    A string "5" is not a Skala15 value; neither are 0, 6, or fractions.
    """
    dimension_fields = (
        "impact_client",
        "impact_market_operations",
        "impact_regulatory",
        "impact_financial",
        "impact_reputational",
    )
    async with client_factory(user=test_user_cro) as client:
        for field in dimension_fields:
            ok = await client.post("/api/v1/processes", json=_minimal_payload(**{field: 5}))
            assert ok.status_code == 201, f"{field}=5 rejected: {ok.text}"

            for invalid in ("5", 0, 6, 2.5, "Ano"):
                resp = await client.post("/api/v1/processes", json=_minimal_payload(**{field: invalid}))
                assert resp.status_code == 422, f"{field}={invalid!r} accepted"


@pytest.mark.asyncio
async def test_coded_fields_are_enforced_against_workbook_closed_lists(client_factory, test_user_cro: User):
    """Closed-list fields accept verbatim workbook values only (spec section 3.1)."""
    cases = {
        "preliminary_criticality": ("critical", "Kritická"),
        "cif_override": ("no", "Ne"),
        "licensed_activity": ("support_functions", "Podpůrné funkce"),
        "bcm_link": ("not_assessed", "Neposouzeno"),
        "dr_test_result": ("qualified", "S výhradami"),
        "interruption_impact": ("not_assessed", "Neposouzeno"),
    }
    async with client_factory(user=test_user_cro) as client:
        for field, (valid, invalid) in cases.items():
            ok = await client.post("/api/v1/processes", json=_minimal_payload(**{field: valid}))
            assert ok.status_code == 201, f"{field}={valid!r} rejected: {ok.text}"
            assert ok.json()[field] == valid

            rejected = await client.post("/api/v1/processes", json=_minimal_payload(**{field: invalid}))
            assert rejected.status_code == 422, f"{field}={invalid!r} accepted"

        # Case-sensitivity: closed lists are verbatim ("kritická" is not a class).
        lowercase = await client.post(
            "/api/v1/processes", json=_minimal_payload(preliminary_criticality="kritická")
        )
        assert lowercase.status_code == 422

        # PATCH enforces the same lists.
        created = (await client.post("/api/v1/processes", json=_minimal_payload())).json()
        patched_bad = await client.patch(
            f"/api/v1/processes/{created['id']}", json={"preliminary_criticality": "Extrémní"}
        )
        assert patched_bad.status_code == 422
        patched_ok = await client.patch(
            f"/api/v1/processes/{created['id']}", json={"preliminary_criticality": "low"}
        )
        assert patched_ok.status_code == 200
        assert patched_ok.json()["preliminary_criticality"] == "low"


@pytest.mark.asyncio
async def test_archive_restore_lifecycle_and_register_listing(client_factory, test_user_cro: User):
    async with client_factory(user=test_user_cro) as client:
        upisovani = (await client.post("/api/v1/processes", json=_minimal_payload(l1_process="Upisování rizik"))).json()
        likvidace_payload = _minimal_payload(l1_process="Likvidace pojistných událostí")
        likvidace = (await client.post("/api/v1/processes", json=likvidace_payload)).json()

        # Archive hides the row from the default register listing.
        assert (await client.delete(f"/api/v1/processes/{likvidace['id']}")).status_code == 204
        default_list = (await client.get("/api/v1/processes")).json()
        assert default_list["total"] == 1
        assert [item["id"] for item in default_list["items"]] == [upisovani["id"]]

        with_archived = (await client.get("/api/v1/processes", params={"include_archived": True})).json()
        assert with_archived["total"] == 2
        archived_row = next(item for item in with_archived["items"] if item["id"] == likvidace["id"])
        assert archived_row["is_archived"] is True
        assert archived_row["archived_by_id"] is not None
        assert archived_row["capabilities"]["can_restore"] is True
        assert archived_row["capabilities"]["can_update"] is False
        assert archived_row["capabilities"]["can_archive"] is False

        # Archived rows cannot be edited (409) or re-archived (400).
        assert (
            await client.patch(f"/api/v1/processes/{likvidace['id']}", json={"notes": "Nová poznámka"})
        ).status_code == 409
        assert (await client.delete(f"/api/v1/processes/{likvidace['id']}")).status_code == 400

        # Restore brings the row back; restoring an active row is rejected.
        restored = await client.post(f"/api/v1/processes/{likvidace['id']}/restore")
        assert restored.status_code == 200
        assert restored.json()["is_archived"] is False
        assert restored.json()["archived_at"] is None
        assert (await client.post(f"/api/v1/processes/{likvidace['id']}/restore")).status_code == 400

        assert (await client.get("/api/v1/processes")).json()["total"] == 2

        # Missing rows 404 on the lifecycle routes too.
        assert (await client.delete("/api/v1/processes/999999")).status_code == 404
        assert (await client.post("/api/v1/processes/999999/restore")).status_code == 404


@pytest.mark.asyncio
async def test_restore_projects_ownership_with_a_fresh_request_session(
    async_engine,
    client_factory,
    test_user_cro: User,
    test_department: Department,
):
    """Restore must not rely on relationships cached by an earlier request."""
    session_maker = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def isolated_get_db():
        async with session_maker() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    async with client_factory(
        current_user=test_user_cro,
        db_override=isolated_get_db,
    ) as client:
        created = await client.post(
            "/api/v1/processes",
            json=_minimal_payload(l1_process="Fresh-session restore"),
        )
        assert created.status_code == 201, created.text
        process_id = created.json()["id"]
        assert (await client.delete(f"/api/v1/processes/{process_id}")).status_code == 204

        restored = await client.post(f"/api/v1/processes/{process_id}/restore")

    assert restored.status_code == 200, restored.text
    body = restored.json()
    assert body["process_owner"] == {
        "name": test_user_cro.name,
        "email": test_user_cro.email,
        "role_name": test_user_cro.role.name,
        "department_name": (
            test_user_cro.department.name if test_user_cro.department is not None else None
        ),
    }
    assert body["owning_department"] == {
        "name": test_department.name,
        "code": test_department.code,
    }


@pytest.mark.asyncio
async def test_register_listing_supports_search_pagination_and_sorting(client_factory, test_user_cro: User):
    async with client_factory(user=test_user_cro) as client:
        for name in ("Upisování rizik", "Likvidace pojistných událostí", "Správa smluv"):
            resp = await client.post("/api/v1/processes", json=_minimal_payload(l1_process=name))
            assert resp.status_code == 201

        searched = (await client.get("/api/v1/processes", params={"search": "likvidace"})).json()
        assert searched["total"] == 1
        assert searched["items"][0]["l1_process"] == "Likvidace pojistných událostí"

        paged = (await client.get("/api/v1/processes", params={"offset": 1, "limit": 1})).json()
        assert paged["total"] == 3
        assert len(paged["items"]) == 1
        assert paged["offset"] == 1
        assert paged["limit"] == 1

        sorted_desc = (
            await client.get("/api/v1/processes", params={"sort_by": "l1_process", "sort_order": "desc"})
        ).json()
        assert [item["l1_process"] for item in sorted_desc["items"]] == [
            "Upisování rizik",
            "Správa smluv",
            "Likvidace pojistných událostí",
        ]

        invalid_sort = await client.get("/api/v1/processes", params={"sort_by": "no_such_column"})
        assert invalid_sort.status_code == 400


@pytest.mark.asyncio
async def test_register_listing_uses_id_tiebreaker_for_stable_offset_pages(
    client_factory,
    test_user_cro: User,
):
    async with client_factory(user=test_user_cro) as client:
        created_ids = []
        for _ in range(3):
            response = await client.post(
                "/api/v1/processes",
                json=_minimal_payload(l1_process="Identical process name"),
            )
            assert response.status_code == 201
            created_ids.append(response.json()["id"])

        first_page = (
            await client.get(
                "/api/v1/processes",
                params={"sort_by": "l1_process", "sort_order": "desc", "offset": 0, "limit": 2},
            )
        ).json()
        second_page = (
            await client.get(
                "/api/v1/processes",
                params={"sort_by": "l1_process", "sort_order": "desc", "offset": 2, "limit": 2},
            )
        ).json()

        assert [row["id"] for row in first_page["items"] + second_page["items"]] == sorted(
            created_ids,
            reverse=True,
        )


@pytest.mark.asyncio
async def test_register_listing_filters_cif_processes_before_count_and_pagination(
    client_factory, test_user_cro: User
):
    async with client_factory(user=test_user_cro) as client:
        cif = (
            await client.post(
                "/api/v1/processes",
                json=_minimal_payload(l1_process="CIF process", cif_override="yes"),
            )
        ).json()
        await client.post(
            "/api/v1/processes",
            json=_minimal_payload(l1_process="Ordinary process", cif_override="no"),
        )

        response = await client.get(
            "/api/v1/processes", params={"cif": True, "offset": 0, "limit": 1}
        )

    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1
    assert [row["id"] for row in response.json()["items"]] == [cif["id"]]


@pytest.mark.asyncio
async def test_risk_manager_seed_grants_full_process_maintenance(
    client_factory, test_user_seeded_risk_manager: User
):
    """Maintenance goes to the risk_manager role via the RBAC seed (CRO wildcard aside)."""
    async with client_factory(user=test_user_seeded_risk_manager) as client:
        created = await client.post("/api/v1/processes", json=_full_payload())
        assert created.status_code == 201, created.text
        process_id = created.json()["id"]
        assert created.json()["capabilities"] == {
            "can_read": True,
            "can_update": True,
            "can_archive": True,
            "can_restore": False,
        }

        assert (
            await client.patch(f"/api/v1/processes/{process_id}", json={"notes": "Úsek UW"})
        ).status_code == 200

        listing = (await client.get("/api/v1/processes")).json()
        assert listing["capabilities"] == {"can_create": True}

        assert (await client.delete(f"/api/v1/processes/{process_id}")).status_code == 204
        assert (await client.post(f"/api/v1/processes/{process_id}/restore")).status_code == 200


@pytest.mark.asyncio
async def test_employee_reads_processes_but_cannot_maintain_them(
    client_factory, test_user_cro: User, test_user_employee: User
):
    """Reads follow the standard business-entity pattern; writes 403 for employees."""
    async with client_factory(user=test_user_cro) as client:
        seeded = (await client.post("/api/v1/processes", json=_minimal_payload())).json()

    async with client_factory(user=test_user_employee) as client:
        listing = await client.get("/api/v1/processes")
        assert listing.status_code == 200
        assert listing.json()["capabilities"] == {"can_create": False}

        detail = await client.get(f"/api/v1/processes/{seeded['id']}")
        assert detail.status_code == 200
        assert detail.json()["capabilities"] == {
            "can_read": True,
            "can_update": False,
            "can_archive": False,
            "can_restore": False,
        }

        # Every maintenance verb is denied.
        assert (await client.post("/api/v1/processes", json=_minimal_payload())).status_code == 403
        assert (
            await client.patch(f"/api/v1/processes/{seeded['id']}", json={"notes": "X"})
        ).status_code == 403
        assert (await client.delete(f"/api/v1/processes/{seeded['id']}")).status_code == 403
        assert (await client.post(f"/api/v1/processes/{seeded['id']}/restore")).status_code == 403


@pytest.mark.asyncio
async def test_platform_admin_is_excluded_and_unauthenticated_is_rejected(
    client_factory, test_user_cro: User, test_user_platform_admin: User
):
    async with client_factory(user=test_user_cro) as client:
        seeded = (await client.post("/api/v1/processes", json=_minimal_payload())).json()

    paths_and_calls = [
        ("get", "/api/v1/processes", None),
        ("get", f"/api/v1/processes/{seeded['id']}", None),
        ("post", "/api/v1/processes", _minimal_payload()),
        ("patch", f"/api/v1/processes/{seeded['id']}", {"notes": "X"}),
        ("delete", f"/api/v1/processes/{seeded['id']}", None),
        ("post", f"/api/v1/processes/{seeded['id']}/restore", None),
    ]

    async def call(client, method: str, path: str, body):
        if body is not None:
            return await getattr(client, method)(path, json=body)
        return await getattr(client, method)(path)

    # Platform admin holds no business permissions. The scoped list is safe and
    # empty; record reads are concealed and every mutation is denied.
    platform_admin_statuses = (200, 404, 403, 404, 403, 403)
    async with client_factory(user=test_user_platform_admin) as client:
        for (method, path, body), expected_status in zip(
            paths_and_calls, platform_admin_statuses, strict=True
        ):
            resp = await call(client, method, path, body)
            assert resp.status_code == expected_status, (
                f"{method.upper()} {path} -> {resp.status_code}"
            )

    # Unauthenticated requests are rejected outright.
    async with client_factory() as client:
        for method, path, body in paths_and_calls:
            resp = await call(client, method, path, body)
            assert resp.status_code == 401, f"{method.upper()} {path} -> {resp.status_code}"


@pytest.mark.asyncio
async def test_process_mutations_land_on_the_audit_trail(client_factory, test_user_cro: User):
    """Register mutations are attributable via the activity log (spec story 39)."""
    async with client_factory(user=test_user_cro) as client:
        created = (await client.post("/api/v1/processes", json=_minimal_payload())).json()
        await client.patch(f"/api/v1/processes/{created['id']}", json={"notes": "Provozní úsek"})
        await client.delete(f"/api/v1/processes/{created['id']}")
        await client.post(f"/api/v1/processes/{created['id']}/restore")

        log = await client.get(
            "/api/v1/activity-log",
            params={"entity_type": "process", "entity_id": created["id"]},
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
        entry for entry in entries if entry["action"] == "update" and "notes" in (entry["changes"] or {})
    )
    assert update_entry["changes"]["notes"]["new"] == "[REDACTED]"

    archive_entry = next(entry for entry in entries if entry["action"] == "archive")
    assert archive_entry["changes"]["is_archived"]["new"] is True


def test_process_permission_sync_migration_matches_seed_contract_and_is_forward_only():
    """The existing-DB permission sync migration mirrors the RBAC seed (ADR-010).

    Precedent: 13d4e5f6a7b8 (issues) and 18c1d2e3f4a6/a7 (vendors) ship a
    permission-sync migration with every new resource.
    """
    import importlib.util
    from pathlib import Path

    from app.db.rbac_seed_contract import PERMISSION_BY_KEY

    migration_path = (
        Path(__file__).resolve().parents[3]
        / "backend/alembic/versions/q4r5s6t7u8v9_sync_process_permissions_for_existing_dbs.py"
    )
    spec = importlib.util.spec_from_file_location("process_permission_sync_migration", migration_path)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    # Chained onto the processes table migration; single head is preserved.
    assert migration.down_revision == "p3q4r5s6t7u8"

    # The ensured permission rows are verbatim seed-contract rows.
    for permission in migration.PROCESS_PERMISSIONS:
        key = f"{permission['resource']}:{permission['action']}"
        assert PERMISSION_BY_KEY[key]["description"] == permission["description"], key
    assert {f"{p['resource']}:{p['action']}" for p in migration.PROCESS_PERMISSIONS} == {
        "processes:read",
        "processes:write",
        "processes:delete",
    }

    # Role grants mirror the seed exactly: risk_manager holds processes:*;
    # every role holding vendors:read in the seed gains processes:read.
    seed_process_grants = {
        role_name: {
            key for key in expand_permission_keys(permission_keys) if key.startswith("processes:")
        }
        for role_name, permission_keys in RBAC_ROLE_PERMISSIONS.items()
        if role_name != "cro"  # CRO holds the wildcard; the migration re-ensures it explicitly
    }
    seed_process_grants = {role: keys for role, keys in seed_process_grants.items() if keys}
    # CISO was introduced later and receives processes:read in its own
    # forward-only migration (e6f7a8b9c0d1), not this historical migration.
    seed_process_grants.pop("ciso")
    migration_grants = {role: set(keys) for role, keys in migration.ROLE_PROCESS_GRANTS.items()}
    assert migration_grants == seed_process_grants

    with pytest.raises(NotImplementedError):
        migration.downgrade()


@pytest.mark.asyncio
async def test_create_with_minimal_fields_leaves_optional_fields_null(client_factory, test_user_cro: User):
    async with client_factory(user=test_user_cro) as client:
        created = await client.post("/api/v1/processes", json=_minimal_payload())

    assert created.status_code == 201, created.text
    body = created.json()
    assert body["l2_subprocess"] is None
    assert body["process_owner_user_id"] == test_user_cro.id
    assert body["owning_department_id"] == test_user_cro.department_id
    assert body["impact_client"] is None
    assert body["mtpd_hours"] is None
    assert body["cif_override"] is None
    assert body["assessment_date"] is None
