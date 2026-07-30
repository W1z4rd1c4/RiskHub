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

import asyncio
import json
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from httpx import AsyncClient, Response
from sqlalchemy import delete, select, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.core.datetime_utils import utc_now
from app.core.exceptions import AuthorizationError
from app.db.rbac_seed_contract import RBAC_ROLE_PERMISSIONS, expand_permission_keys
from app.models import (
    ActivityAction,
    ActivityLog,
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalScenario,
    ApprovalStatus,
    Department,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    Notification,
    NotificationType,
    OutboxEvent,
    Permission,
    Process,
    Role,
    RolePermission,
    User,
)
from app.models.user import AccessScope
from app.services._governed_mutations.process_identity import (
    strict_governed_process_identity,
    valid_governed_process_proposal_exists_clause,
)
from app.services.outbox.handlers import approvals as approval_handlers
from app.services.outbox.payloads import ApprovalRequestCreatedPayload

_ACCOUNTABILITY: dict[str, int] = {}


async def _directly_corrupt_proposal(
    db_session: AsyncSession,
    proposal_row_id: int,
    **values: object,
) -> None:
    """Bypass ORM immutability only for integrity/legacy corruption fixtures."""
    await db_session.execute(
        update(GovernedMutationProposal).where(GovernedMutationProposal.id == proposal_row_id).values(**values)
    )


@pytest_asyncio.fixture(autouse=True)
async def process_accountability(test_user_cro: User, test_department: Department):
    """Give every Process write a real active owner and Department."""
    _ACCOUNTABILITY.update(
        process_owner_user_id=test_user_cro.id,
        owning_department_id=test_department.id,
    )
    yield
    _ACCOUNTABILITY.clear()


@pytest_asyncio.fixture(autouse=True)
async def fixed_protected_process_scenario(db_session: AsyncSession):
    """Install the production-fixed scenario disabled for legacy direct-create tests."""
    await _add_protected_process_scenario(db_session, requires_approval=False)


@pytest_asyncio.fixture
async def enabled_accountability_scenario(db_session: AsyncSession):
    """Install the production-enabled accountability reassignment scenario."""
    db_session.add(
        ApprovalScenario(
            key="accountability_reassignment",
            display_name="Accountability reassignments",
            description="Independent approval for accountability reassignments",
            requires_approval=True,
            approver_roles=["risk_manager", "cro"],
        )
    )
    await db_session.commit()


@pytest_asyncio.fixture
async def test_user_seeded_risk_manager(db_session: AsyncSession) -> User:
    """Risk manager holding exactly the canonical RBAC seed permissions.

    Built from ``RBAC_ROLE_PERMISSIONS`` so the test proves the production
    seed grants Process register maintenance to the risk_manager role.
    """
    role = Role(
        name="risk_manager",
        display_name="Risk Manager",
        description="Seed-contract risk manager",
    )
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
async def test_register_lists_reject_invalid_sort_order(client_factory, test_user_cro: User, endpoint: str):
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
        updated = await client.patch(
            f"/api/v1/processes/{first['id']}",
            json={"l1_process": "Přejmenovaný proces"},
        )
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


@pytest.mark.asyncio
async def test_direct_archive_and_restore_each_advance_governance_version_once(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
):
    async with client_factory(user=test_user_cro) as client:
        created = await client.post("/api/v1/processes", json=_full_payload())
        process_id = created.json()["id"]
        db_session.expire_all()
        created_row = await db_session.get(Process, process_id)
        assert created_row is not None and created_row.governance_version == 1

        archived_response = await client.delete(f"/api/v1/processes/{process_id}")
        assert archived_response.status_code == 204, archived_response.text
        db_session.expire_all()
        archived = await db_session.get(Process, process_id)
        assert archived is not None and archived.is_archived is True
        assert archived.governance_version == 2
        duplicate_archive = await client.delete(f"/api/v1/processes/{process_id}")
        assert duplicate_archive.status_code == 400, duplicate_archive.text
        db_session.expire_all()
        still_archived = await db_session.get(Process, process_id)
        assert still_archived is not None and still_archived.governance_version == 2

        restored_response = await client.post(f"/api/v1/processes/{process_id}/restore")
        duplicate_restore = await client.post(f"/api/v1/processes/{process_id}/restore")

    assert restored_response.status_code == 200, restored_response.text
    assert restored_response.json()["is_archived"] is False
    assert duplicate_restore.status_code == 400, duplicate_restore.text
    db_session.expire_all()
    restored = await db_session.get(Process, process_id)
    assert restored is not None and restored.governance_version == 3
    queued_archive = (
        await db_session.execute(
            select(ApprovalRequest.id).where(
                ApprovalRequest.resource_type == ApprovalResourceType.PROCESS,
                ApprovalRequest.resource_id == process_id,
                ApprovalRequest.action_type == ApprovalActionType.DELETE,
            )
        )
    ).scalar_one_or_none()
    assert queued_archive is None


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
            "/api/v1/processes",
            json=_minimal_payload(preliminary_criticality="kritická"),
        )
        assert lowercase.status_code == 422

        # PATCH enforces the same lists.
        created = (await client.post("/api/v1/processes", json=_minimal_payload())).json()
        patched_bad = await client.patch(
            f"/api/v1/processes/{created['id']}",
            json={"preliminary_criticality": "Extrémní"},
        )
        assert patched_bad.status_code == 422
        patched_ok = await client.patch(
            f"/api/v1/processes/{created['id']}",
            json={"preliminary_criticality": "low"},
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
        "department_name": (test_user_cro.department.name if test_user_cro.department is not None else None),
    }
    assert body["owning_department"] == {
        "name": test_department.name,
        "code": test_department.code,
    }


@pytest.mark.asyncio
async def test_register_listing_supports_search_pagination_and_sorting(client_factory, test_user_cro: User):
    async with client_factory(user=test_user_cro) as client:
        for name in (
            "Upisování rizik",
            "Likvidace pojistných událostí",
            "Správa smluv",
        ):
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
            await client.get(
                "/api/v1/processes",
                params={"sort_by": "l1_process", "sort_order": "desc"},
            )
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
                params={
                    "sort_by": "l1_process",
                    "sort_order": "desc",
                    "offset": 0,
                    "limit": 2,
                },
            )
        ).json()
        second_page = (
            await client.get(
                "/api/v1/processes",
                params={
                    "sort_by": "l1_process",
                    "sort_order": "desc",
                    "offset": 2,
                    "limit": 2,
                },
            )
        ).json()

        assert [row["id"] for row in first_page["items"] + second_page["items"]] == sorted(
            created_ids,
            reverse=True,
        )


@pytest.mark.asyncio
async def test_register_listing_filters_cif_processes_before_count_and_pagination(client_factory, test_user_cro: User):
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

        response = await client.get("/api/v1/processes", params={"cif": True, "offset": 0, "limit": 1})

    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1
    assert [row["id"] for row in response.json()["items"]] == [cif["id"]]


@pytest.mark.asyncio
async def test_risk_manager_seed_grants_full_process_maintenance(
    client_factory,
    db_session: AsyncSession,
    test_user_seeded_risk_manager: User,
):
    """Maintenance goes to the risk_manager role via the RBAC seed (CRO wildcard aside)."""
    async with client_factory(user=test_user_seeded_risk_manager) as client:
        created_response = await _create_process_before_enabling_protection(
            client, db_session, payload=_minimal_payload()
        )
        process_id = created_response.json()["id"]
        created = await client.get(f"/api/v1/processes/{process_id}")
        assert created.status_code == 200, created.text
        assert created.json()["capabilities"] == {
            "can_read": True,
            "can_update": True,
            "can_archive": True,
            "can_restore": False,
            "protected_change_requires_approval": True,
            "can_request_change": True,
            "can_cancel_pending_change": False,
            "has_pending_change": False,
            "business_edit_blocked": False,
        }

        assert (await client.patch(f"/api/v1/processes/{process_id}", json={"notes": "Úsek UW"})).status_code == 200

        listing = (await client.get("/api/v1/processes")).json()
        assert listing["capabilities"] == {"can_create": True, "can_export": True}

        assert (await client.delete(f"/api/v1/processes/{process_id}")).status_code == 204
        assert (await client.post(f"/api/v1/processes/{process_id}/restore")).status_code == 200


@pytest.mark.asyncio
async def test_direct_noop_patch_preserves_process_version_and_audit(
    client_factory,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
):
    payload = _minimal_payload(
        process_owner_user_id=test_user_cro.id,
        owning_department_id=test_department.id,
        cif_override="no",
        notes="Stable direct Process",
    )
    async with client_factory(user=test_user_cro) as client:
        created = await client.post("/api/v1/processes", json=payload)
        process_id = created.json()["id"]
        unchanged = await client.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "l1_process": payload["l1_process"],
                "process_owner_user_id": test_user_cro.id,
                "owning_department_id": test_department.id,
                "notes": "Stable direct Process",
            },
        )

    assert unchanged.status_code == 200, unchanged.text
    db_session.expire_all()
    persisted = await db_session.get(Process, process_id)
    assert persisted is not None and persisted.governance_version == 1
    update_audits = list(
        (
            await db_session.execute(
                select(ActivityLog).where(
                    ActivityLog.entity_id == process_id,
                    ActivityLog.action == ActivityAction.UPDATE,
                )
            )
        )
        .scalars()
        .all()
    )
    assert update_audits == []


@pytest.mark.asyncio
async def test_protected_noop_patch_does_not_queue_or_advance_version(
    client_factory,
    db_session: AsyncSession,
    test_department: Department,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
):
    payload = _full_payload(
        process_owner_user_id=test_user_seeded_risk_manager.id,
        owning_department_id=test_department.id,
        notes="Stable protected Process",
    )
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(
            requester,
            db_session,
            payload=payload,
        )
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "notes": "Proposed protected Process",
                "request_reason": "Create the active governed lock",
            },
        )
        unchanged = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "l1_process": payload["l1_process"],
                "process_owner_user_id": test_user_seeded_risk_manager.id,
                "owning_department_id": test_department.id,
                "notes": "Stable protected Process",
                "request_reason": "No actual business change",
            },
        )

    assert unchanged.status_code == 200, unchanged.text
    assert submitted.status_code == 202, submitted.text
    assert unchanged.json()["pending_change"]["approval_id"] == submitted.json()["approval_id"]
    db_session.expire_all()
    persisted = await db_session.get(Process, process_id)
    assert persisted is not None and persisted.governance_version == 1
    queued = (
        await db_session.execute(
            select(ApprovalRequest.id).where(
                ApprovalRequest.resource_type == ApprovalResourceType.PROCESS,
                ApprovalRequest.resource_id == process_id,
            )
        )
    ).scalar_one_or_none()
    update_audit = (
        await db_session.execute(
            select(ActivityLog.id).where(
                ActivityLog.entity_id == process_id,
                ActivityLog.action == ActivityAction.UPDATE,
            )
        )
    ).scalar_one_or_none()
    assert queued == submitted.json()["approval_id"]
    assert update_audit is None


@pytest.mark.asyncio
async def test_fixed_process_scenario_exposes_read_only_policy_definition(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
):
    await _add_protected_process_scenario(db_session)
    async with client_factory(user=test_user_cro) as client:
        listed = await client.get("/api/v1/riskhub/approval-scenarios")
        rejected_write = await client.patch(
            "/api/v1/riskhub/approval-scenarios/protected_process_edit",
            json={
                "fixed_policy_definition": {
                    "threshold": "current_or_proposed_cif_yes",
                    "covered_actions": ["edit"],
                    "allow_self_approval": True,
                }
            },
        )

    assert listed.status_code == 200, listed.text
    scenario = next(row for row in listed.json() if row["key"] == "protected_process_edit")
    assert scenario["fixed_policy"] is True
    assert scenario["fixed_policy_definition"] == {
        "threshold": "current_or_proposed_cif_yes",
        "covered_actions": ["edit"],
        "allow_self_approval": False,
    }
    assert rejected_write.status_code == 422, rejected_write.text


@pytest.mark.asyncio
async def test_protected_process_edit_is_immutable_until_independent_approval(
    client_factory,
    db_session: AsyncSession,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
):
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(
            requester,
            db_session,
            payload=_full_payload(),
        )
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "l1_process": "Governed name",
                "request_reason": "Material CIF change",
            },
        )
        assert submitted.status_code == 202, submitted.text
        approval_id = submitted.json()["approval_id"]
        assert submitted.json()["proposal_id"]
        assert (await requester.get(f"/api/v1/processes/{process_id}")).json()[
            "l1_process"
        ] == "Správa pojistných smluv"
        listing = await requester.get("/api/v1/processes")
        listed = next(row for row in listing.json()["items"] if row["id"] == process_id)
        assert listed["pending_change"]["approval_id"] == approval_id
        assert listed["capabilities"]["has_pending_change"] is True
        assert listed["capabilities"]["business_edit_blocked"] is True
        assert listed["capabilities"]["can_update"] is False
        assert listed["capabilities"]["can_archive"] is False

        duplicate = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={"notes": "Second business edit", "request_reason": "Second"},
        )
        assert duplicate.status_code == 409
        assert duplicate.json()["detail"]["code"] == "process_pending_mutation"
        blocked_archive = await requester.delete(f"/api/v1/processes/{process_id}")
        assert blocked_archive.status_code == 409
        assert blocked_archive.json()["detail"]["code"] == "process_pending_mutation"

        self_approval = await requester.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Self approval must fail"},
        )
        assert self_approval.status_code == 403
        self_rejection = await requester.post(
            f"/api/v1/approvals/{approval_id}/reject",
            json={"resolution_notes": "Self rejection must fail"},
        )
        assert self_rejection.status_code == 403

    pending_after_self_resolution = await db_session.get(ApprovalRequest, approval_id)
    active_after_self_resolution = (
        await db_session.execute(
            select(GovernedMutationImpactLock).where(
                GovernedMutationImpactLock.resource_id == process_id,
                GovernedMutationImpactLock.released_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    assert pending_after_self_resolution is not None
    assert pending_after_self_resolution.status == ApprovalStatus.PENDING
    assert active_after_self_resolution is not None

    async with client_factory(user=test_user_cro) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Independently reviewed"},
        )
        assert approved.status_code == 200, approved.text
        assert approved.json()["status"] == "approved"
        assert approved.json()["governed_mutation"]["proposal_version"] == 1
        detail = await approver.get(f"/api/v1/processes/{process_id}")
        assert detail.json()["l1_process"] == "Governed name"
        assert detail.json()["pending_change"] is None

    approval = await db_session.get(ApprovalRequest, approval_id)
    process = await db_session.get(Process, process_id)
    active_lock = (
        await db_session.execute(
            select(GovernedMutationImpactLock).where(
                GovernedMutationImpactLock.resource_id == process_id,
                GovernedMutationImpactLock.released_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    assert approval is not None and approval.status.value == "APPROVED"
    assert process is not None and process.governance_version == 2
    assert active_lock is None


async def _add_protected_process_scenario(
    db_session: AsyncSession,
    *,
    approver_roles: list[str] | None = None,
    requires_approval: bool = True,
) -> None:
    scenario = (
        await db_session.execute(select(ApprovalScenario).where(ApprovalScenario.key == "protected_process_edit"))
    ).scalar_one_or_none()
    if scenario is None:
        scenario = ApprovalScenario(
            key="protected_process_edit",
            display_name="Protected Process edit",
            description="Independent approval for CIF Process edits",
        )
        db_session.add(scenario)
    scenario.requires_approval = requires_approval
    scenario.approver_roles = approver_roles or ["risk_manager", "cro"]
    await db_session.commit()


async def _create_process_before_enabling_protection(
    client: AsyncClient,
    db_session: AsyncSession,
    *,
    payload: dict[str, object],
    approver_roles: list[str] | None = None,
) -> Response:
    """Create setup state directly, then enable protection for the behavior under test."""
    await _add_protected_process_scenario(
        db_session,
        approver_roles=approver_roles,
        requires_approval=False,
    )
    created = await client.post("/api/v1/processes", json=payload)
    assert created.status_code == 201, created.text
    await _add_protected_process_scenario(
        db_session,
        approver_roles=approver_roles,
        requires_approval=True,
    )
    return created


@pytest.mark.asyncio
async def test_process_capabilities_follow_disabled_protected_change_scenario(
    client_factory,
    db_session: AsyncSession,
    test_user_seeded_risk_manager: User,
):
    await _add_protected_process_scenario(db_session, requires_approval=False)

    async with client_factory(user=test_user_seeded_risk_manager) as client:
        current_cif = await client.post("/api/v1/processes", json=_full_payload())
        proposed_cif = await client.post(
            "/api/v1/processes",
            json=_minimal_payload(l1_process="Candidate CIF", cif_override="no"),
        )

        current_detail = await client.get(f"/api/v1/processes/{current_cif.json()['id']}")
        listing = await client.get("/api/v1/processes")
        current_saved = await client.patch(
            f"/api/v1/processes/{current_cif.json()['id']}",
            json={"notes": "Direct save while scenario is disabled"},
        )
        proposed_saved = await client.patch(
            f"/api/v1/processes/{proposed_cif.json()['id']}",
            json={"cif_override": "yes"},
        )

    for response in (current_cif, proposed_cif, current_detail, listing):
        assert response.status_code == 200 or response.status_code == 201, response.text
    assert current_cif.json()["capabilities"]["can_request_change"] is True
    assert proposed_cif.json()["capabilities"]["can_request_change"] is True
    assert current_detail.json()["capabilities"]["can_request_change"] is True
    assert current_detail.json()["capabilities"]["protected_change_requires_approval"] is False
    assert all(
        row["capabilities"]["protected_change_requires_approval"] is False
        for row in listing.json()["items"]
        if row["id"] in {current_cif.json()["id"], proposed_cif.json()["id"]}
    )
    assert current_saved.status_code == 200, current_saved.text
    assert proposed_saved.status_code == 200, proposed_saved.text
    assert proposed_saved.json()["cif_override"] == "yes"


@pytest.mark.asyncio
@pytest.mark.parametrize("request_reason", [None, "   "])
async def test_protected_process_edit_requires_non_blank_reason(
    client_factory,
    db_session: AsyncSession,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
    request_reason: str | None,
):
    del test_user_cro  # active independent CRO satisfies the scenario

    async with client_factory(user=test_user_seeded_risk_manager) as client:
        created = await _create_process_before_enabling_protection(
            client,
            db_session,
            payload=_full_payload(),
        )
        payload = {"notes": "Governed note"}
        if request_reason is not None:
            payload["request_reason"] = request_reason
        response = await client.patch(
            f"/api/v1/processes/{created.json()['id']}",
            json=payload,
        )

    assert response.status_code == 422, response.text
    assert response.json()["detail"]["code"] == "governed_mutation_reason_required"


@pytest.mark.asyncio
async def test_protected_process_edit_fails_without_independent_configured_approver(
    client_factory,
    db_session: AsyncSession,
    test_user_seeded_risk_manager: User,
):
    async with client_factory(user=test_user_seeded_risk_manager) as client:
        created = await _create_process_before_enabling_protection(
            client,
            db_session,
            payload=_full_payload(),
            approver_roles=["risk_manager"],
        )
        response = await client.patch(
            f"/api/v1/processes/{created.json()['id']}",
            json={"notes": "Governed note", "request_reason": "Needs review"},
        )

    assert response.status_code == 409, response.text
    assert response.json()["detail"]["code"] == "governed_mutation_approver_missing"


@pytest.mark.asyncio
async def test_out_of_scope_configured_approver_is_not_counted_for_submission(
    client_factory,
    db_session: AsyncSession,
    test_department: Department,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
):
    hidden_department = Department(
        name="Hidden Approval Department",
        code="HIDDEN-APPROVAL",
        is_active=True,
    )
    db_session.add(hidden_department)
    await db_session.flush()
    test_user_cro.access_scope = AccessScope.DEPARTMENT
    test_user_cro.department_id = hidden_department.id
    await db_session.commit()
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(
            requester,
            db_session,
            payload=_full_payload(
                process_owner_user_id=test_user_seeded_risk_manager.id,
                owning_department_id=test_department.id,
            ),
            approver_roles=["cro"],
        )
        process_id = created.json()["id"]
        response = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={"notes": "Hidden reviewer", "request_reason": "Needs review"},
        )

    assert response.status_code == 409, response.text
    assert response.json()["detail"]["code"] == "governed_mutation_approver_missing"
    approvals = list(
        (
            await db_session.execute(
                select(ApprovalRequest).where(
                    ApprovalRequest.resource_type == ApprovalResourceType.PROCESS,
                    ApprovalRequest.resource_id == process_id,
                )
            )
        )
        .scalars()
        .all()
    )
    proposals = list(
        (
            await db_session.execute(
                select(GovernedMutationProposal).where(
                    GovernedMutationProposal.primary_resource_type == "process",
                    GovernedMutationProposal.primary_resource_id == process_id,
                )
            )
        )
        .scalars()
        .all()
    )
    assert approvals == []
    assert proposals == []


@pytest.mark.asyncio
@pytest.mark.parametrize("resolver_kind", ["risk_manager", "cro"])
async def test_out_of_scope_configured_reviewer_cannot_observe_or_resolve(
    client_factory,
    db_session: AsyncSession,
    test_department: Department,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
    resolver_kind: str,
):
    from app.services._notification_approval_helpers import (
        eligible_approval_notification_recipients,
    )

    if resolver_kind == "cro":
        requester_user = test_user_seeded_risk_manager
        resolver_user = test_user_cro
        configured_role = "cro"
    else:
        requester_user = test_user_cro
        resolver_user = test_user_seeded_risk_manager
        configured_role = "risk_manager"

    async with client_factory(user=requester_user) as requester:
        created = await _create_process_before_enabling_protection(
            requester,
            db_session,
            payload=_full_payload(
                process_owner_user_id=requester_user.id,
                owning_department_id=test_department.id,
            ),
            approver_roles=[configured_role],
        )
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "notes": f"Pending {configured_role} review",
                "request_reason": "Scope must be enforced",
            },
        )
    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    resolver_user_id = resolver_user.id

    hidden_department = Department(
        name=f"Hidden {configured_role} Department",
        code=f"HIDDEN-{configured_role.upper()}",
        is_active=True,
    )
    db_session.add(hidden_department)
    await db_session.flush()
    resolver_user.access_scope = AccessScope.DEPARTMENT
    resolver_user.department_id = hidden_department.id
    await db_session.commit()

    approval = await db_session.get(ApprovalRequest, approval_id)
    assert approval is not None
    recipients, _ = await eligible_approval_notification_recipients(db_session, approval)
    assert resolver_user_id not in {recipient.id for recipient in recipients}

    async with client_factory(user=resolver_user) as resolver:
        detail = await resolver.get(f"/api/v1/approvals/{approval_id}")
        queue = await resolver.get("/api/v1/approvals", params={"status": "pending"})
        my_queue = await resolver.get("/api/v1/approvals/my-approvals")

    assert detail.status_code == 403, detail.text
    for response in (queue, my_queue):
        assert response.status_code == 200, response.text
        assert approval_id not in {item["id"] for item in response.json()["items"]}

    proposal_before = (
        await db_session.execute(
            select(GovernedMutationProposal).where(GovernedMutationProposal.approval_request_id == approval_id)
        )
    ).scalar_one()
    proposal_row_id = proposal_before.id
    proposal_business_id = proposal_before.proposal_id
    lock_before = (
        await db_session.execute(
            select(GovernedMutationImpactLock).where(
                GovernedMutationImpactLock.proposal_id == proposal_before.id,
                GovernedMutationImpactLock.released_at.is_(None),
            )
        )
    ).scalar_one()
    lock_row_id = lock_before.id
    activity_ids_before = set((await db_session.execute(select(ActivityLog.id))).scalars().all())
    outbox_ids_before = set((await db_session.execute(select(OutboxEvent.id))).scalars().all())

    async with client_factory(user=resolver_user) as resolver:
        approved = await resolver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Out of scope approve"},
        )
        rejected = await resolver.post(
            f"/api/v1/approvals/{approval_id}/reject",
            json={"resolution_notes": "Out of scope reject"},
        )

    assert approved.status_code == 403, approved.text
    assert rejected.status_code == 403, rejected.text
    approval_after = await db_session.get(ApprovalRequest, approval_id)
    process_after = await db_session.get(Process, process_id)
    proposal_after = await db_session.get(GovernedMutationProposal, proposal_row_id)
    lock_after = await db_session.get(GovernedMutationImpactLock, lock_row_id)
    assert approval_after is not None and approval_after.status == ApprovalStatus.PENDING
    assert process_after is not None
    assert process_after.notes != f"Pending {configured_role} review"
    assert process_after.governance_version == 1
    assert proposal_after is not None
    assert proposal_after.proposal_id == proposal_business_id
    assert lock_after is not None and lock_after.released_at is None
    assert set((await db_session.execute(select(ActivityLog.id))).scalars().all()) == activity_ids_before
    assert set((await db_session.execute(select(OutboxEvent.id))).scalars().all()) == outbox_ids_before


@pytest.mark.asyncio
async def test_excluded_global_approval_writer_cannot_bypass_governed_process_policy(
    client_factory,
    db_session: AsyncSession,
    test_department: Department,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
    test_user_employee: User,
):
    excluded_role = Role(
        name="excluded_global_approver",
        display_name="Excluded Global Approver",
        description="Global approval authority outside the fixed Process roles",
    )
    approval_permission = Permission(
        resource="approvals",
        action="write",
        description="Resolve approvals",
    )
    db_session.add_all([excluded_role, approval_permission])
    await db_session.flush()
    db_session.add(
        RolePermission(
            role_id=excluded_role.id,
            permission_id=approval_permission.id,
        )
    )
    excluded_user = User(
        name="Excluded Global Approver",
        email="excluded.global.process.approver@test.com",
        role_id=excluded_role.id,
        department_id=test_department.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    db_session.add(excluded_user)
    await db_session.commit()

    test_user_cro.access_scope = AccessScope.DEPARTMENT
    test_user_cro.department_id = test_department.id
    await db_session.commit()
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(
            requester,
            db_session,
            payload=_full_payload(
                process_owner_user_id=test_user_seeded_risk_manager.id,
                owning_department_id=test_department.id,
            ),
            approver_roles=["cro"],
        )
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "notes": "Must require a configured reviewer",
                "request_reason": "Global authority is not a configured role",
            },
        )
        approval_id = submitted.json()["approval_id"]
        requester_queue = await requester.get("/api/v1/approvals")
        requester_detail = await requester.get(f"/api/v1/approvals/{approval_id}")

    assert approval_id in {item["id"] for item in requester_queue.json()["items"]}
    assert requester_detail.status_code == 200, requester_detail.text

    proposal = (
        await db_session.execute(
            select(GovernedMutationProposal).where(GovernedMutationProposal.approval_request_id == approval_id)
        )
    ).scalar_one()
    corrupted_envelope = await db_session.get(ApprovalRequest, approval_id)
    assert corrupted_envelope is not None
    corrupted_envelope.primary_approver_id = test_user_employee.id
    corrupted_envelope.resource_type = ApprovalResourceType.RISK
    corrupted_envelope.resource_id = 987_653
    await db_session.commit()

    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        requester_pending = await requester.get(
            "/api/v1/approvals",
            params={"status": "pending", "my_requests": True},
        )
        requester_process_pending = await requester.get(
            "/api/v1/approvals",
            params={
                "status": "pending",
                "resource_type": "process",
                "my_requests": True,
            },
        )
        requester_corrupt_type = await requester.get(
            "/api/v1/approvals",
            params={
                "status": "pending",
                "resource_type": "risk",
                "my_requests": True,
            },
        )
    assert approval_id in {item["id"] for item in requester_pending.json()["items"]}
    assert approval_id in {item["id"] for item in requester_process_pending.json()["items"]}
    assert approval_id not in {item["id"] for item in requester_corrupt_type.json()["items"]}

    from app.api.v1.endpoints.users.summary import SHELL_SUMMARY_CACHE

    SHELL_SUMMARY_CACHE.clear()
    async with client_factory(user=test_user_employee) as unrelated_primary:
        unrelated_main = await unrelated_primary.get("/api/v1/approvals")
        unrelated_pending = await unrelated_primary.get("/api/v1/approvals", params={"status": "pending"})
        unrelated_my = await unrelated_primary.get("/api/v1/approvals/my-approvals")
        unrelated_count = await unrelated_primary.get("/api/v1/approvals/pending/count")
        unrelated_shell = await unrelated_primary.get("/api/v1/users/me/shell-summary")
        unrelated_detail = await unrelated_primary.get(f"/api/v1/approvals/{approval_id}")
    for response in (unrelated_main, unrelated_pending, unrelated_my):
        assert approval_id not in {item["id"] for item in response.json()["items"]}
    assert unrelated_count.json() == {"count": 0}
    assert unrelated_shell.json()["pending_approvals_count"] == 0
    assert unrelated_detail.status_code == 403, unrelated_detail.text

    SHELL_SUMMARY_CACHE.clear()
    async with client_factory(user=test_user_cro) as configured_reviewer:
        reviewer_pending = await configured_reviewer.get("/api/v1/approvals", params={"status": "pending"})
        reviewer_process_pending = await configured_reviewer.get(
            "/api/v1/approvals",
            params={"status": "pending", "resource_type": "process"},
        )
        reviewer_corrupt_type = await configured_reviewer.get(
            "/api/v1/approvals",
            params={"status": "pending", "resource_type": "risk"},
        )
        reviewer_my = await configured_reviewer.get("/api/v1/approvals/my-approvals")
        reviewer_count = await configured_reviewer.get("/api/v1/approvals/pending/count")
        reviewer_shell = await configured_reviewer.get("/api/v1/users/me/shell-summary")
        reviewer_detail = await configured_reviewer.get(f"/api/v1/approvals/{approval_id}")
    for response in (reviewer_pending, reviewer_process_pending, reviewer_my):
        row = next(item for item in response.json()["items"] if item["id"] == approval_id)
        assert row["governed_mutation"] is not None
    assert approval_id not in {item["id"] for item in reviewer_corrupt_type.json()["items"]}
    assert reviewer_count.json() == {"count": 1}
    assert reviewer_shell.json()["pending_approvals_count"] == 1
    assert reviewer_detail.status_code == 200, reviewer_detail.text
    assert reviewer_detail.json()["governed_mutation"] is not None

    async with client_factory(user=excluded_user) as excluded:
        main_queue = await excluded.get("/api/v1/approvals")
        pending_queue = await excluded.get("/api/v1/approvals", params={"status": "pending"})
        my_approvals = await excluded.get("/api/v1/approvals/my-approvals")
        pending_count = await excluded.get("/api/v1/approvals/pending/count")
        shell_summary = await excluded.get("/api/v1/users/me/shell-summary")
        detail = await excluded.get(f"/api/v1/approvals/{approval_id}")

    for response in (main_queue, pending_queue, my_approvals):
        assert response.status_code == 200, response.text
        assert approval_id not in {item["id"] for item in response.json()["items"]}
    assert pending_count.json() == {"count": 0}
    assert shell_summary.json()["pending_approvals_count"] == 0
    assert detail.status_code == 403, detail.text

    impact_lock = (
        await db_session.execute(
            select(GovernedMutationImpactLock).where(
                GovernedMutationImpactLock.proposal_id == proposal.id,
                GovernedMutationImpactLock.released_at.is_(None),
            )
        )
    ).scalar_one()
    proposal_id = proposal.proposal_id
    activity_ids_before = set((await db_session.execute(select(ActivityLog.id))).scalars().all())
    outbox_ids_before = set((await db_session.execute(select(OutboxEvent.id))).scalars().all())

    async with client_factory(user=test_user_employee) as unrelated_primary:
        unrelated_approved = await unrelated_primary.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Corrupt primary approve"},
        )
        unrelated_rejected = await unrelated_primary.post(
            f"/api/v1/approvals/{approval_id}/reject",
            json={"resolution_notes": "Corrupt primary reject"},
        )
    async with client_factory(user=excluded_user) as excluded:
        approved = await excluded.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Excluded role approve"},
        )
        rejected = await excluded.post(
            f"/api/v1/approvals/{approval_id}/reject",
            json={"resolution_notes": "Excluded role reject"},
        )

    assert unrelated_approved.status_code == 403, unrelated_approved.text
    assert unrelated_rejected.status_code == 403, unrelated_rejected.text
    assert approved.status_code == 403, approved.text
    assert rejected.status_code == 403, rejected.text
    approval = await db_session.get(ApprovalRequest, approval_id)
    process = await db_session.get(Process, process_id)
    persisted_proposal = await db_session.get(GovernedMutationProposal, proposal.id)
    persisted_lock = await db_session.get(GovernedMutationImpactLock, impact_lock.id)
    assert approval is not None and approval.status == ApprovalStatus.PENDING
    assert process is not None
    assert process.notes != "Must require a configured reviewer"
    assert process.governance_version == 1
    assert persisted_proposal is not None and persisted_proposal.proposal_id == proposal_id
    assert persisted_lock is not None and persisted_lock.released_at is None
    assert set((await db_session.execute(select(ActivityLog.id))).scalars().all()) == activity_ids_before
    assert set((await db_session.execute(select(OutboxEvent.id))).scalars().all()) == outbox_ids_before

    async with client_factory(user=test_user_cro) as reviewer:
        resolved = await reviewer.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Configured reviewer"},
        )
    assert resolved.status_code == 200, resolved.text

    async with client_factory(user=excluded_user) as excluded:
        history = await excluded.get("/api/v1/approvals", params={"status": "approved"})
        resolved_detail = await excluded.get(f"/api/v1/approvals/{approval_id}")
    assert approval_id not in {item["id"] for item in history.json()["items"]}
    assert resolved_detail.status_code == 403, resolved_detail.text

    legacy_approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=987_654,
        resource_name="Legacy non-Process approval",
        action_type=ApprovalActionType.EDIT,
        requested_by_id=test_user_seeded_risk_manager.id,
        reason="Preserve legacy privileged visibility",
        status=ApprovalStatus.PENDING,
    )
    db_session.add(legacy_approval)
    await db_session.commit()
    async with client_factory(user=excluded_user) as excluded:
        legacy_queue = await excluded.get("/api/v1/approvals")
        legacy_detail = await excluded.get(f"/api/v1/approvals/{legacy_approval.id}")
    assert legacy_approval.id in {item["id"] for item in legacy_queue.json()["items"]}
    assert legacy_detail.status_code == 200, legacy_detail.text


@pytest.mark.asyncio
@pytest.mark.parametrize("scope_kind", ["department", "manager"])
@pytest.mark.parametrize("resolution_status", ["approved", "rejected", "expired", "cancelled"])
async def test_in_scope_configured_reviewer_can_resolve_governed_process(
    client_factory,
    db_session: AsyncSession,
    test_department: Department,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
    scope_kind: str,
    resolution_status: str,
):
    test_user_cro.access_scope = AccessScope.DEPARTMENT if scope_kind == "department" else AccessScope.MANAGER
    test_user_cro.department_id = test_department.id if scope_kind == "department" else None
    test_user_cro.manager_id = test_user_seeded_risk_manager.id if scope_kind == "manager" else None
    if scope_kind == "manager":
        test_user_seeded_risk_manager.department_id = test_department.id

    excluded_role = Role(
        name=f"excluded_history_{scope_kind}_{resolution_status}",
        display_name="Excluded History Writer",
        description="Global approval writer outside the snapshotted role",
    )
    approval_permission = Permission(
        resource="approvals",
        action="write",
        description="Resolve approvals",
    )
    db_session.add_all([excluded_role, approval_permission])
    await db_session.flush()
    db_session.add(
        RolePermission(
            role_id=excluded_role.id,
            permission_id=approval_permission.id,
        )
    )
    excluded_user = User(
        name="Excluded History Writer",
        email=f"excluded.history.{scope_kind}.{resolution_status}@test.com",
        role_id=excluded_role.id,
        department_id=test_department.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    db_session.add(excluded_user)
    await db_session.commit()
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(
            requester,
            db_session,
            payload=_full_payload(
                process_owner_user_id=test_user_seeded_risk_manager.id,
                owning_department_id=test_department.id,
            ),
            approver_roles=["cro"],
        )
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "notes": f"Resolved through {scope_kind} scope",
                "request_reason": "Visible independent review",
            },
        )
        requester_pending = await requester.get(
            "/api/v1/approvals",
            params={"status": "pending", "my_requests": True},
        )
    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    assert approval_id in {item["id"] for item in requester_pending.json()["items"]}

    from app.api.v1.endpoints.users.summary import SHELL_SUMMARY_CACHE

    SHELL_SUMMARY_CACHE.clear()
    async with client_factory(user=test_user_cro) as reviewer:
        detail = await reviewer.get(f"/api/v1/approvals/{approval_id}")
        pending = await reviewer.get("/api/v1/approvals", params={"status": "pending"})
        my_approvals = await reviewer.get("/api/v1/approvals/my-approvals")
        pending_count = await reviewer.get("/api/v1/approvals/pending/count")
        shell_summary = await reviewer.get("/api/v1/users/me/shell-summary")

    assert detail.status_code == 200, detail.text
    assert detail.json()["governed_mutation"] is not None
    for response in (pending, my_approvals):
        assert approval_id in {item["id"] for item in response.json()["items"]}
    assert pending_count.json() == {"count": 1}
    assert shell_summary.json()["pending_approvals_count"] == 1

    if resolution_status == "expired":
        process = await db_session.get(Process, process_id)
        assert process is not None
        process.governance_version += 1
        await db_session.commit()

    if resolution_status == "cancelled":
        async with client_factory(user=test_user_seeded_risk_manager) as requester:
            resolved = await requester.post(f"/api/v1/approvals/{approval_id}/cancel")
    else:
        endpoint = "reject" if resolution_status == "rejected" else "approve"
        async with client_factory(user=test_user_cro) as reviewer:
            resolved = await reviewer.post(
                f"/api/v1/approvals/{approval_id}/{endpoint}",
                json={"resolution_notes": "Visible and reviewed"},
            )

    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == resolution_status

    SHELL_SUMMARY_CACHE.clear()
    async with client_factory(user=test_user_cro) as reviewer:
        history = await reviewer.get("/api/v1/approvals", params={"status": resolution_status})
        all_history = await reviewer.get("/api/v1/approvals")
        pending_after = await reviewer.get("/api/v1/approvals", params={"status": "pending"})
        my_approvals_after = await reviewer.get("/api/v1/approvals/my-approvals")
        count_after = await reviewer.get("/api/v1/approvals/pending/count")
        shell_after = await reviewer.get("/api/v1/users/me/shell-summary")
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        requester_history = await requester.get(
            "/api/v1/approvals",
            params={"status": resolution_status, "my_requests": True},
        )
    async with client_factory(user=excluded_user) as excluded:
        excluded_history = await excluded.get("/api/v1/approvals", params={"status": resolution_status})

    for response in (history, all_history, requester_history):
        assert approval_id in {item["id"] for item in response.json()["items"]}
    for response in (pending_after, my_approvals_after, excluded_history):
        assert approval_id not in {item["id"] for item in response.json()["items"]}
    assert count_after.json() == {"count": 0}
    assert shell_after.json()["pending_approvals_count"] == 0

    db_session.expire_all()
    process = await db_session.get(Process, process_id)
    approval = await db_session.get(ApprovalRequest, approval_id)
    assert process is not None
    if resolution_status == "approved":
        assert process.notes == f"Resolved through {scope_kind} scope"
        assert process.governance_version == 2
    assert approval is not None
    assert approval.status.value.lower() == resolution_status


@pytest.mark.asyncio
async def test_proposed_cif_yes_triggers_governed_process_submission(
    client_factory,
    db_session: AsyncSession,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
):
    del test_user_cro
    await _add_protected_process_scenario(db_session)

    async with client_factory(user=test_user_seeded_risk_manager) as client:
        created = await client.post(
            "/api/v1/processes",
            json=_minimal_payload(cif_override="no"),
        )
        process_id = created.json()["id"]
        submitted = await client.patch(
            f"/api/v1/processes/{process_id}",
            json={"cif_override": "yes", "request_reason": "Becoming a CIF"},
        )
        detail = await client.get(f"/api/v1/processes/{process_id}")

    assert submitted.status_code == 202, submitted.text
    assert submitted.json()["pending_changes"]["cif_override"] == {
        "old": "no",
        "new": "yes",
    }
    assert detail.json()["cif_override"] == "no"
    assert detail.json()["pending_change"]["approval_id"] == submitted.json()["approval_id"]


@pytest.mark.asyncio
async def test_governed_process_snapshots_use_business_safe_owner_and_department_labels(
    client_factory,
    db_session: AsyncSession,
    enabled_accountability_scenario,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
    test_user_employee: User,
):
    proposed_department = Department(
        name="Claims Department",
        code="CLAIMS",
        is_active=True,
    )
    db_session.add(proposed_department)
    await db_session.commit()

    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(
            requester,
            db_session,
            payload=_full_payload(),
        )
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "process_owner_user_id": test_user_employee.id,
                "owning_department_id": proposed_department.id,
                "request_reason": "Accountability must move",
            },
        )
        detail = await requester.get(f"/api/v1/approvals/{submitted.json()['approval_id']}")
        process_detail = await requester.get(f"/api/v1/processes/{process_id}")

    assert submitted.status_code == 202, submitted.text
    snapshot = detail.json()["governed_mutation"]
    assert snapshot["before"]["process_owner_user_id"] == "Test CRO"
    assert snapshot["after"]["process_owner_user_id"] == "Test Employee"
    assert snapshot["before"]["owning_department_id"] == "TEST — Test Department"
    assert snapshot["after"]["owning_department_id"] == ("CLAIMS — Claims Department")
    assert "resource_id" not in snapshot["impacted_resources"][0]
    assert snapshot["impacted_resources"][0] == {
        "resource_type": "process",
        "resource_name": created.json()["f_code"] + " — " + created.json()["l1_process"],
    }
    assert detail.json()["pending_changes"]["process_owner_user_id"] == {
        "old": "Test CRO",
        "new": "Test Employee",
    }
    pending = process_detail.json()["pending_change"]
    assert pending["before"]["process_owner_user_id"] == "Test CRO"
    assert pending["after"]["owning_department_id"] == "CLAIMS — Claims Department"
    assert str(test_user_employee.id) not in json.dumps(
        {
            "owner_before": snapshot["before"]["process_owner_user_id"],
            "owner_after": snapshot["after"]["process_owner_user_id"],
            "department_before": snapshot["before"]["owning_department_id"],
            "department_after": snapshot["after"]["owning_department_id"],
        }
    )
    async with client_factory(user=test_user_cro) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Safe labels reviewed"},
        )
        applied = await approver.get(f"/api/v1/processes/{process_id}")
    assert approved.status_code == 200, approved.text
    assert applied.json()["process_owner_user_id"] == test_user_employee.id
    assert applied.json()["owning_department_id"] == proposed_department.id


@pytest.mark.asyncio
async def test_governed_snapshot_changed_references_follow_actor_process_assignment_scope(
    client_factory,
    db_session: AsyncSession,
    enabled_accountability_scenario,
    test_department: Department,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
    test_user_employee: User,
):
    hidden_department = Department(
        name="Hidden Shared Services",
        code="HIDDEN",
        is_active=True,
    )
    db_session.add(hidden_department)
    await db_session.flush()
    test_user_employee.department_id = hidden_department.id
    await db_session.commit()

    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(
            requester,
            db_session,
            payload=_full_payload(
                process_owner_user_id=test_user_seeded_risk_manager.id,
                owning_department_id=test_department.id,
            ),
        )
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "process_owner_user_id": test_user_employee.id,
                "owning_department_id": hidden_department.id,
                "request_reason": "Move accountability across Departments",
            },
        )
        approval_id = submitted.json()["approval_id"]

    approval = await db_session.get(ApprovalRequest, approval_id)
    assert approval is not None
    approval.pending_changes = {
        **(approval.pending_changes or {}),
        "process_owner_user_id": {
            "old": test_user_seeded_risk_manager.id,
            "new": test_user_employee.id,
            "raw_id": test_user_employee.id,
        },
        "owning_department_id": hidden_department.id,
    }
    await db_session.commit()

    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        requester_process = await requester.get(f"/api/v1/processes/{process_id}")
        requester_detail = await requester.get(f"/api/v1/approvals/{approval_id}")
        requester_queue = await requester.get(
            "/api/v1/approvals",
            params={"status": "pending", "my_requests": True},
        )

    requester_queue_row = next(item for item in requester_queue.json()["items"] if item["id"] == approval_id)
    for projected in (
        requester_process.json()["pending_change"],
        requester_detail.json()["governed_mutation"],
        requester_queue_row["governed_mutation"],
    ):
        assert projected["after"]["process_owner_user_id"] == "Test Employee"
        assert projected["after"]["owning_department_id"] == ("HIDDEN — Hidden Shared Services")
    for approval_projection in (requester_detail.json(), requester_queue_row):
        assert approval_projection["pending_changes"]["process_owner_user_id"] == {
            "old": "Seeded Risk Manager",
            "new": "Test Employee",
        }
        assert approval_projection["pending_changes"]["owning_department_id"] == {
            "old": "TEST — Test Department",
            "new": "HIDDEN — Hidden Shared Services",
        }

    test_user_cro.access_scope = AccessScope.DEPARTMENT
    test_user_cro.department_id = test_department.id
    await db_session.commit()

    async with client_factory(user=test_user_cro) as scoped_reviewer:
        reviewer_process = await scoped_reviewer.get(f"/api/v1/processes/{process_id}")
        reviewer_detail = await scoped_reviewer.get(f"/api/v1/approvals/{approval_id}")
        reviewer_queue = await scoped_reviewer.get("/api/v1/approvals", params={"status": "pending"})
        reviewer_my_approvals = await scoped_reviewer.get("/api/v1/approvals/my-approvals")

    queue_rows = [
        next(item for item in response.json()["items"] if item["id"] == approval_id)
        for response in (reviewer_queue, reviewer_my_approvals)
    ]
    for projected in (
        reviewer_process.json()["pending_change"],
        reviewer_detail.json()["governed_mutation"],
        *(row["governed_mutation"] for row in queue_rows),
    ):
        assert projected["before"]["process_owner_user_id"] == "Seeded Risk Manager"
        assert projected["before"]["owning_department_id"] == "TEST — Test Department"
        assert projected["after"]["process_owner_user_id"] == "Unknown user"
        assert projected["after"]["owning_department_id"] == "Unknown department"
        identity_values = {
            projected[side][field]
            for side in ("before", "after")
            for field in ("process_owner_user_id", "owning_department_id")
        }
        assert test_user_employee.id not in identity_values
        assert hidden_department.id not in identity_values
    for approval_projection in (reviewer_detail.json(), *queue_rows):
        assert approval_projection["pending_changes"]["process_owner_user_id"] == {
            "old": "Seeded Risk Manager",
            "new": "Unknown user",
        }
        assert approval_projection["pending_changes"]["owning_department_id"] == {
            "old": "TEST — Test Department",
            "new": "Unknown department",
        }


@pytest.mark.asyncio
@pytest.mark.parametrize("mutation", ["update", "delete"])
async def test_governed_proposal_orm_is_insert_only(
    client_factory,
    db_session: AsyncSession,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
    mutation: str,
):
    del test_user_cro
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(requester, db_session, payload=_full_payload())
        submitted = await requester.patch(
            f"/api/v1/processes/{created.json()['id']}",
            json={"notes": "Immutable proposal", "request_reason": "Evidence"},
        )
    proposal = (
        await db_session.execute(
            select(GovernedMutationProposal).where(
                GovernedMutationProposal.approval_request_id == submitted.json()["approval_id"]
            )
        )
    ).scalar_one()
    proposal_id = proposal.id

    if mutation == "update":
        proposal.mutation_kind = "process.archive"
    else:
        await db_session.delete(proposal)
    with pytest.raises(
        ValueError,
        match="Governed mutation proposals are immutable after insertion",
    ):
        await db_session.commit()
    await db_session.rollback()
    assert await db_session.get(GovernedMutationProposal, proposal_id) is not None


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_governed_proposal_trigger_rejects_update_and_delete(
    client_factory,
    db_session: AsyncSession,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
):
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL trigger is authoritative")
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(requester, db_session, payload=_full_payload())
        submitted = await requester.patch(
            f"/api/v1/processes/{created.json()['id']}",
            json={"notes": "Immutable in PostgreSQL", "request_reason": "Evidence"},
        )
    approval_id = submitted.json()["approval_id"]
    proposal_id = (
        await db_session.execute(
            select(GovernedMutationProposal.id).where(GovernedMutationProposal.approval_request_id == approval_id)
        )
    ).scalar_one()

    with pytest.raises(DBAPIError, match="immutable after insertion"):
        await db_session.execute(
            update(GovernedMutationProposal)
            .where(GovernedMutationProposal.id == proposal_id)
            .values(mutation_kind="process.archive")
        )
    await db_session.rollback()
    with pytest.raises(DBAPIError, match="immutable after insertion"):
        await db_session.execute(delete(GovernedMutationProposal).where(GovernedMutationProposal.id == proposal_id))
    await db_session.rollback()
    await db_session.refresh(test_user_cro)

    async with client_factory(user=test_user_cro) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Immutable evidence reviewed"},
        )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"


@pytest.mark.asyncio
async def test_governed_approval_keeps_lifecycle_row_but_redacts_snapshot_after_scope_loss(
    client_factory,
    db_session: AsyncSession,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
):
    del test_user_cro

    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(requester, db_session, payload=_full_payload())
        submitted = await requester.patch(
            f"/api/v1/processes/{created.json()['id']}",
            json={"notes": "Scoped proposal", "request_reason": "Needs review"},
        )
        approval_id = submitted.json()["approval_id"]

    test_user_seeded_risk_manager.access_scope = AccessScope.DEPARTMENT
    test_user_seeded_risk_manager.department_id = None
    await db_session.commit()

    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        queue = await requester.get(
            "/api/v1/approvals",
            params={"status": "pending", "my_requests": True},
        )
        detail = await requester.get(f"/api/v1/approvals/{approval_id}")

    row = next(item for item in queue.json()["items"] if item["id"] == approval_id)
    for projected in (row, detail.json()):
        assert projected["status"] == "pending"
        assert projected["governed_mutation"] is None
        assert projected["pending_changes"] is None
        assert projected["capabilities"]["can_view_pending_changes"] is False


@pytest.mark.asyncio
async def test_malformed_governed_snapshot_is_excluded_from_approval_and_process_projection(
    client_factory,
    db_session: AsyncSession,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
):
    if db_session.bind.dialect.name == "postgresql":
        pytest.skip("PostgreSQL proposal immutability rejects legacy corruption setup")
    del test_user_cro
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(requester, db_session, payload=_full_payload())
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "process_owner_user_id": created.json()["process_owner_user_id"],
                "owning_department_id": created.json()["owning_department_id"],
                "notes": "Force a governed proposal",
                "request_reason": "Legacy projection guard",
            },
        )
    proposal = (
        await db_session.execute(
            select(GovernedMutationProposal).where(
                GovernedMutationProposal.approval_request_id == submitted.json()["approval_id"]
            )
        )
    ).scalar_one()
    await _directly_corrupt_proposal(
        db_session,
        proposal.id,
        before_snapshot={
            **proposal.before_snapshot,
            "process_owner_user_id": created.json()["process_owner_user_id"],
            "owning_department_id": created.json()["owning_department_id"],
        },
        after_snapshot={
            **proposal.after_snapshot,
            "process_owner_user_id": str(created.json()["process_owner_user_id"]),
            "owning_department_id": str(created.json()["owning_department_id"]),
        },
    )
    await db_session.commit()

    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        approval = await requester.get(f"/api/v1/approvals/{submitted.json()['approval_id']}")
        process = await requester.get(f"/api/v1/processes/{process_id}")

    assert approval.status_code == 403
    assert process.status_code == 200
    assert process.json()["pending_change"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize("terminal_action", ["reject", "cancel"])
async def test_governed_reject_and_cancel_release_process_lock_without_applying(
    client_factory,
    db_session: AsyncSession,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
    terminal_action: str,
):
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(requester, db_session, payload=_full_payload())
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={"l1_process": "Rejected name", "request_reason": "Needs review"},
        )
        approval_id = submitted.json()["approval_id"]
        if terminal_action == "cancel":
            resolved = await requester.post(f"/api/v1/approvals/{approval_id}/cancel")
        else:
            resolved = None

    if terminal_action == "reject":
        async with client_factory(user=test_user_cro) as approver:
            blank = await approver.post(
                f"/api/v1/approvals/{approval_id}/reject",
                json={"resolution_notes": "   "},
            )
            assert blank.status_code == 422
            assert blank.json()["detail"]["code"] == ("governed_mutation_rejection_reason_required")
            resolved = await approver.post(
                f"/api/v1/approvals/{approval_id}/reject",
                json={"resolution_notes": "Business reason is insufficient"},
            )

    assert resolved is not None and resolved.status_code == 200, (
        resolved.text if resolved is not None else "missing response"
    )
    assert resolved.json()["status"] == ("rejected" if terminal_action == "reject" else "cancelled")
    active_lock = (
        await db_session.execute(
            select(GovernedMutationImpactLock).where(
                GovernedMutationImpactLock.resource_id == process_id,
                GovernedMutationImpactLock.released_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    process = await db_session.get(Process, process_id)
    assert active_lock is None
    assert process is not None and process.l1_process == "Správa pojistných smluv"


@pytest.mark.asyncio
async def test_governed_resolver_cannot_cancel_and_pending_lock_remains_active(
    client_factory,
    db_session: AsyncSession,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
):
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(requester, db_session, payload=_full_payload())
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={"notes": "Pending", "request_reason": "Needs review"},
        )
        approval_id = submitted.json()["approval_id"]

    async with client_factory(user=test_user_cro) as resolver:
        detail = await resolver.get(f"/api/v1/approvals/{approval_id}")
        denied = await resolver.post(f"/api/v1/approvals/{approval_id}/cancel")

    assert detail.status_code == 200, detail.text
    capabilities = detail.json()["capabilities"]
    assert capabilities["can_cancel"] is False
    assert capabilities["can_cancel_as_requester"] is False
    assert capabilities["can_cancel_as_resolver"] is False
    assert denied.status_code == 403, denied.text
    assert denied.json()["detail"]["code"] == ("governed_mutation_requester_cancel_required")

    db_session.expire_all()
    approval = await db_session.get(ApprovalRequest, approval_id)
    active_lock = (
        await db_session.execute(
            select(GovernedMutationImpactLock).where(
                GovernedMutationImpactLock.resource_type == "process",
                GovernedMutationImpactLock.resource_id == process_id,
                GovernedMutationImpactLock.released_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    assert approval is not None and approval.status == ApprovalStatus.PENDING
    assert active_lock is not None


@pytest.mark.asyncio
async def test_governed_cancel_uses_immutable_requester_and_expires_drifted_envelope(
    client_factory,
    db_session: AsyncSession,
    test_user_seeded_risk_manager: User,
    test_user_employee: User,
):
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(requester, db_session, payload=_full_payload())
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={"notes": "Pending", "request_reason": "Needs review"},
        )
        approval_id = submitted.json()["approval_id"]

    approval = await db_session.get(ApprovalRequest, approval_id)
    assert approval is not None
    approval.requested_by_id = test_user_employee.id
    await db_session.commit()

    async with client_factory(user=test_user_employee) as substituted_requester:
        substituted_projection = await substituted_requester.get(f"/api/v1/processes/{process_id}")
        denied = await substituted_requester.post(f"/api/v1/approvals/{approval_id}/cancel")
    assert substituted_projection.status_code == 200, substituted_projection.text
    assert substituted_projection.json()["pending_change"]["requested_by_name"] == (test_user_seeded_risk_manager.name)
    assert substituted_projection.json()["pending_change"]["capabilities"]["can_cancel"] is False
    assert denied.status_code == 403, denied.text
    assert denied.json()["detail"]["code"] == ("governed_mutation_requester_cancel_required")

    async with client_factory(user=test_user_seeded_risk_manager) as immutable_requester:
        immutable_projection = await immutable_requester.get(f"/api/v1/processes/{process_id}")
        expired = await immutable_requester.post(f"/api/v1/approvals/{approval_id}/cancel")
    assert immutable_projection.status_code == 200, immutable_projection.text
    assert immutable_projection.json()["pending_change"]["requested_by_name"] == (test_user_seeded_risk_manager.name)
    assert immutable_projection.json()["pending_change"]["capabilities"]["can_cancel"] is True
    assert expired.status_code == 200, expired.text
    assert expired.json()["status"] == "expired"

    db_session.expire_all()
    approval = await db_session.get(ApprovalRequest, approval_id)
    active_lock = (
        await db_session.execute(
            select(GovernedMutationImpactLock).where(
                GovernedMutationImpactLock.resource_type == "process",
                GovernedMutationImpactLock.resource_id == process_id,
                GovernedMutationImpactLock.released_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    assert approval is not None and approval.status == ApprovalStatus.EXPIRED
    assert active_lock is None


@pytest.mark.asyncio
async def test_restore_rejects_legacy_archived_process_with_active_governed_lock(
    client_factory,
    db_session: AsyncSession,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
):
    del test_user_cro
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(requester, db_session, payload=_full_payload())
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={"notes": "Pending", "request_reason": "Needs review"},
        )
    assert submitted.status_code == 202, submitted.text

    # Simulate a legacy/intervening archived state while retaining the active
    # proposal lock; the normal archive endpoint is guarded by this invariant.
    await db_session.execute(update(Process).where(Process.id == process_id).values(is_archived=True))
    await db_session.commit()
    await db_session.refresh(test_user_seeded_risk_manager)
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        detail = await requester.get(f"/api/v1/processes/{process_id}")
        blocked_restore = await requester.post(f"/api/v1/processes/{process_id}/restore")

    assert detail.status_code == 200, detail.text
    assert detail.json()["capabilities"]["can_restore"] is False
    assert detail.json()["capabilities"]["has_pending_change"] is True
    assert blocked_restore.status_code == 409, blocked_restore.text
    assert blocked_restore.json()["detail"]["code"] == "process_pending_mutation"
    process = await db_session.get(Process, process_id)
    assert process is not None and process.governance_version == 1


@pytest.mark.asyncio
async def test_pending_governed_business_lock_keeps_process_and_activity_reads_available(
    client_factory,
    db_session: AsyncSession,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
):
    del test_user_cro
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(requester, db_session, payload=_full_payload())
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={"notes": "Pending evidence", "request_reason": "Material change"},
        )
        process_detail = await requester.get(f"/api/v1/processes/{process_id}")
        activity = await requester.get(
            "/api/v1/activity-log",
            params={"entity_type": "process", "entity_id": process_id},
        )

    assert submitted.status_code == 202, submitted.text
    assert process_detail.status_code == 200, process_detail.text
    assert process_detail.json()["pending_change"]["approval_id"] == (submitted.json()["approval_id"])
    assert activity.status_code == 200, activity.text
    process = await db_session.get(Process, process_id)
    active_lock = (
        await db_session.execute(
            select(GovernedMutationImpactLock).where(
                GovernedMutationImpactLock.resource_id == process_id,
                GovernedMutationImpactLock.released_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    assert process is not None and process.governance_version == 1
    assert active_lock is not None


@pytest.mark.asyncio
async def test_live_scenario_change_expires_and_releases_governed_process_lock(
    client_factory,
    db_session: AsyncSession,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
):
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(requester, db_session, payload=_full_payload())
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={"notes": "Pending", "request_reason": "Needs review"},
        )

    scenario = (
        await db_session.execute(select(ApprovalScenario).where(ApprovalScenario.key == "protected_process_edit"))
    ).scalar_one()
    scenario.requires_approval = False
    await db_session.commit()

    async with client_factory(user=test_user_cro) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Scenario changed"},
        )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    active_lock = (
        await db_session.execute(
            select(GovernedMutationImpactLock).where(
                GovernedMutationImpactLock.resource_id == process_id,
                GovernedMutationImpactLock.released_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    assert active_lock is None


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_concurrent_protected_process_submissions_create_one_active_lock(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
):
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL row/advisory lock semantics required")
    del test_user_cro
    async with client_factory(user=test_user_seeded_risk_manager) as setup_client:
        created = await _create_process_before_enabling_protection(setup_client, db_session, payload=_full_payload())
    process_id = created.json()["id"]

    session_maker = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

    async def independent_db_session():
        async with session_maker() as session:
            yield session

    async with client_factory(
        user=test_user_seeded_risk_manager,
        db_override=independent_db_session,
    ) as client:
        first, second = await asyncio.gather(
            client.patch(
                f"/api/v1/processes/{process_id}",
                json={"notes": "First", "request_reason": "First proposal"},
            ),
            client.patch(
                f"/api/v1/processes/{process_id}",
                json={"notes": "Second", "request_reason": "Second proposal"},
            ),
        )

    assert sorted((first.status_code, second.status_code)) == [202, 409]
    active_locks = list(
        (
            await db_session.execute(
                select(GovernedMutationImpactLock).where(
                    GovernedMutationImpactLock.resource_type == "process",
                    GovernedMutationImpactLock.resource_id == process_id,
                    GovernedMutationImpactLock.released_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(active_locks) == 1


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_protected_archive_serializes_before_protected_submission(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    monkeypatch,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
):
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL Process row-lock serialization is authoritative")
    async with client_factory(user=test_user_seeded_risk_manager) as setup:
        created = await _create_process_before_enabling_protection(setup, db_session, payload=_full_payload())
    process_id = created.json()["id"]

    session_maker = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def independent_db_session():
        async with session_maker() as session:
            yield session

    from app.services._ict_register_lifecycle import lifecycle

    original_lifecycle_lock = lifecycle.assert_process_lifecycle_mutation_allowed
    archive_holds_process_lock = asyncio.Event()
    allow_archive = asyncio.Event()

    async def paused_lifecycle_lock(db, **kwargs):
        process = await original_lifecycle_lock(db, **kwargs)
        archive_holds_process_lock.set()
        await allow_archive.wait()
        return process

    monkeypatch.setattr(
        lifecycle,
        "assert_process_lifecycle_mutation_allowed",
        paused_lifecycle_lock,
    )

    async with (
        client_factory(
            user=test_user_cro,
            db_override=independent_db_session,
        ) as archiver,
        client_factory(
            user=test_user_seeded_risk_manager,
            db_override=independent_db_session,
        ) as requester,
    ):
        archive_task = asyncio.create_task(
            archiver.request(
                "DELETE",
                f"/api/v1/processes/{process_id}",
                json={"request_reason": "Archive wins the Process lock"},
            )
        )
        await asyncio.wait_for(archive_holds_process_lock.wait(), timeout=2)
        submission_task = asyncio.create_task(
            requester.patch(
                f"/api/v1/processes/{process_id}",
                json={
                    "notes": "Must observe archived state",
                    "request_reason": "Archive wins",
                },
            )
        )
        await asyncio.sleep(0.1)
        assert not submission_task.done()
        allow_archive.set()
        archived, blocked_submission = await asyncio.gather(
            archive_task,
            submission_task,
        )

    assert archived.status_code == 202, archived.text
    assert blocked_submission.status_code == 409, blocked_submission.text
    assert blocked_submission.json()["detail"]["code"] == "process_pending_mutation"
    approval_id = archived.json()["approval_id"]
    async with session_maker() as verification:
        process = await verification.get(Process, process_id)
        pending_approvals = list(
            (
                await verification.execute(
                    select(ApprovalRequest).where(
                        ApprovalRequest.resource_type == ApprovalResourceType.PROCESS,
                        ApprovalRequest.resource_id == process_id,
                        ApprovalRequest.status == ApprovalStatus.PENDING,
                    )
                )
            )
            .scalars()
            .all()
        )
        active_locks = list(
            (
                await verification.execute(
                    select(GovernedMutationImpactLock).where(
                        GovernedMutationImpactLock.resource_type == "process",
                        GovernedMutationImpactLock.resource_id == process_id,
                        GovernedMutationImpactLock.released_at.is_(None),
                    )
                )
            )
            .scalars()
            .all()
        )
    assert process is not None and process.is_archived is False
    assert process.governance_version == 1
    assert [approval.id for approval in pending_approvals] == [approval_id]
    assert len(active_locks) == 1
    assert active_locks[0].proposal_id == pending_approvals[0].governed_mutation_proposal.id


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_protected_submission_serializes_before_direct_archive(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    monkeypatch,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
):
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL Process row-lock serialization is authoritative")
    async with client_factory(user=test_user_seeded_risk_manager) as setup:
        created = await _create_process_before_enabling_protection(setup, db_session, payload=_full_payload())
    process_id = created.json()["id"]

    session_maker = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def independent_db_session():
        async with session_maker() as session:
            yield session

    from app.services._ict_register_lifecycle import lifecycle

    original_submit = lifecycle.submit_process_mutation_if_required
    submission_holds_process_lock = asyncio.Event()
    allow_submission = asyncio.Event()

    async def paused_submit(**kwargs):
        submission_holds_process_lock.set()
        await allow_submission.wait()
        return await original_submit(**kwargs)

    monkeypatch.setattr(
        lifecycle,
        "submit_process_mutation_if_required",
        paused_submit,
    )

    async with (
        client_factory(
            user=test_user_seeded_risk_manager,
            db_override=independent_db_session,
        ) as requester,
        client_factory(
            user=test_user_cro,
            db_override=independent_db_session,
        ) as archiver,
    ):
        submission_task = asyncio.create_task(
            requester.patch(
                f"/api/v1/processes/{process_id}",
                json={
                    "notes": "Serialized proposal",
                    "request_reason": "Must win before archive",
                },
            )
        )
        await asyncio.wait_for(submission_holds_process_lock.wait(), timeout=2)
        archive_task = asyncio.create_task(
            archiver.request(
                "DELETE",
                f"/api/v1/processes/{process_id}",
                json={"request_reason": "Archive after the competing edit"},
            )
        )
        await asyncio.sleep(0.1)
        assert not archive_task.done()
        allow_submission.set()
        submitted, blocked_archive = await asyncio.gather(
            submission_task,
            archive_task,
        )

    assert submitted.status_code == 202, submitted.text
    assert blocked_archive.status_code == 409, blocked_archive.text
    assert blocked_archive.json()["detail"]["code"] == "process_pending_mutation"
    async with session_maker() as verification:
        process = await verification.get(Process, process_id)
        active_lock = (
            await verification.execute(
                select(GovernedMutationImpactLock).where(
                    GovernedMutationImpactLock.resource_type == "process",
                    GovernedMutationImpactLock.resource_id == process_id,
                    GovernedMutationImpactLock.released_at.is_(None),
                )
            )
        ).scalar_one_or_none()
    assert process is not None and process.is_archived is False
    assert process.governance_version == 1
    assert active_lock is not None


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_submit_waits_for_resolution_and_starts_from_committed_process_version(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    monkeypatch,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
):
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL row-lock serialization is authoritative")
    async with client_factory(user=test_user_seeded_risk_manager) as setup_client:
        created = await _create_process_before_enabling_protection(setup_client, db_session, payload=_full_payload())
        process_id = created.json()["id"]
        submitted = await setup_client.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "l1_process": "Approved first mutation",
                "request_reason": "First proposal",
            },
        )
    approval_id = submitted.json()["approval_id"]

    session_maker = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

    async def independent_db_session():
        async with session_maker() as session:
            yield session

    from app.services._governed_mutations import resolution

    original_load = resolution._load_governed_resolution
    resolution_holds_locks = asyncio.Event()
    allow_resolution = asyncio.Event()

    async def paused_load(db, *, approval_id, current_user):
        loaded = await original_load(
            db,
            approval_id=approval_id,
            current_user=current_user,
        )
        resolution_holds_locks.set()
        await allow_resolution.wait()
        return loaded

    monkeypatch.setattr(resolution, "_load_governed_resolution", paused_load)

    async def resolve_in_independent_transaction():
        async with session_maker() as session:
            return await resolution.approve_governed_mutation(
                session,
                approval_id=approval_id,
                current_user=test_user_cro,
                resolution_notes="Independent approval",
            )

    async with client_factory(
        user=test_user_seeded_risk_manager,
        db_override=independent_db_session,
    ) as requester:
        approve_task = asyncio.create_task(resolve_in_independent_transaction())
        await asyncio.wait_for(resolution_holds_locks.wait(), timeout=2)
        submit_task = asyncio.create_task(
            requester.patch(
                f"/api/v1/processes/{process_id}",
                json={
                    "notes": "Serialized second proposal",
                    "request_reason": "Second proposal",
                },
            )
        )
        await asyncio.sleep(0.1)
        assert not submit_task.done()
        allow_resolution.set()
        approved_request, second_submission = await asyncio.gather(approve_task, submit_task)

    assert approved_request.status.value == "APPROVED"
    assert second_submission.status_code == 202, second_submission.text
    second_approval_id = second_submission.json()["approval_id"]
    async with session_maker() as verification:
        process = await verification.get(Process, process_id)
        first_approval = await verification.get(ApprovalRequest, approval_id)
        second_approval = await verification.get(ApprovalRequest, second_approval_id)
        active_locks = list(
            (
                await verification.execute(
                    select(GovernedMutationImpactLock).where(
                        GovernedMutationImpactLock.resource_type == "process",
                        GovernedMutationImpactLock.resource_id == process_id,
                        GovernedMutationImpactLock.released_at.is_(None),
                    )
                )
            )
            .scalars()
            .all()
        )

    assert process is not None
    assert process.l1_process == "Approved first mutation"
    assert process.governance_version == 2
    assert first_approval is not None and first_approval.status.value == "APPROVED"
    assert second_approval is not None and second_approval.status.value == "PENDING"
    assert len(active_locks) == 1
    assert active_locks[0].proposal_id == second_approval.governed_mutation_proposal.id
    assert second_approval.governed_mutation_proposal.base_versions == {"process": 2}


async def _assign_user_role_after_lock(
    db: AsyncSession,
    *,
    user_id: int,
    role_id: int,
) -> None:
    user = (await db.execute(select(User).where(User.id == user_id).with_for_update())).scalar_one()
    user.role_id = role_id
    await db.flush()


async def _assign_user_scope_after_lock(
    db: AsyncSession,
    *,
    user_id: int,
    access_scope: AccessScope,
    department_id: int | None,
) -> None:
    user = (await db.execute(select(User).where(User.id == user_id).with_for_update())).scalar_one()
    user.access_scope = access_scope
    user.department_id = department_id
    await db.flush()


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_resolver_scope_change_before_approval_is_authoritative(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    monkeypatch,
    test_department: Department,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
):
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL User scope row-lock serialization is authoritative")
    hidden_department = Department(
        name="Concurrent Hidden Department",
        code="CONCURRENT-HIDDEN-BEFORE",
        is_active=True,
    )
    db_session.add(hidden_department)
    await db_session.commit()
    hidden_department_id = hidden_department.id
    resolver_id = test_user_cro.id

    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(
            requester,
            db_session,
            payload=_full_payload(
                process_owner_user_id=test_user_seeded_risk_manager.id,
                owning_department_id=test_department.id,
            ),
            approver_roles=["cro"],
        )
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "notes": "Must remain pending after scope loss",
                "request_reason": "Concurrent scope serialization",
            },
        )
    approval_id = submitted.json()["approval_id"]
    session_maker = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

    from app.services._governed_mutations import resolution

    original_load_envelope = resolution._load_governed_envelope
    resolution_started = asyncio.Event()

    async def observed_load_envelope(db, approval_id):
        loaded = await original_load_envelope(db, approval_id)
        resolution_started.set()
        return loaded

    monkeypatch.setattr(resolution, "_load_governed_envelope", observed_load_envelope)

    async def resolve():
        async with session_maker() as session:
            try:
                return await resolution.approve_governed_mutation(
                    session,
                    approval_id=approval_id,
                    current_user=test_user_cro,
                    resolution_notes="Must observe committed hidden scope",
                )
            except AuthorizationError as exc:
                return exc

    async with session_maker() as scope_session:
        await _assign_user_scope_after_lock(
            scope_session,
            user_id=resolver_id,
            access_scope=AccessScope.DEPARTMENT,
            department_id=hidden_department_id,
        )
        approval_task = asyncio.create_task(resolve())
        await asyncio.wait_for(resolution_started.wait(), timeout=2)
        await asyncio.sleep(0.1)
        assert not approval_task.done()
        await scope_session.commit()
        resolved = await asyncio.wait_for(approval_task, timeout=2)

    assert isinstance(resolved, AuthorizationError)
    async with session_maker() as verification:
        process = await verification.get(Process, process_id)
        approval = await verification.get(ApprovalRequest, approval_id)
        resolver = await verification.get(User, resolver_id)
        active_lock = (
            await verification.execute(
                select(GovernedMutationImpactLock.id).where(
                    GovernedMutationImpactLock.resource_type == "process",
                    GovernedMutationImpactLock.resource_id == process_id,
                    GovernedMutationImpactLock.released_at.is_(None),
                )
            )
        ).scalar_one_or_none()
    assert process is not None
    assert process.notes != "Must remain pending after scope loss"
    assert process.governance_version == 1
    assert approval is not None and approval.status == ApprovalStatus.PENDING
    assert resolver is not None
    assert resolver.access_scope == AccessScope.DEPARTMENT
    assert resolver.department_id == hidden_department_id
    assert active_lock is not None


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_approval_before_resolver_scope_change_uses_locked_visibility(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    monkeypatch,
    test_department: Department,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
):
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL User scope row-lock serialization is authoritative")
    hidden_department = Department(
        name="Concurrent Hidden Department",
        code="CONCURRENT-HIDDEN-AFTER",
        is_active=True,
    )
    db_session.add(hidden_department)
    await db_session.commit()
    hidden_department_id = hidden_department.id
    resolver_id = test_user_cro.id

    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(
            requester,
            db_session,
            payload=_full_payload(
                process_owner_user_id=test_user_seeded_risk_manager.id,
                owning_department_id=test_department.id,
            ),
            approver_roles=["cro"],
        )
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "notes": "Approval owns the earlier scope snapshot",
                "request_reason": "Concurrent scope serialization",
            },
        )
    approval_id = submitted.json()["approval_id"]
    session_maker = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

    from app.services._governed_mutations import resolution

    original_load = resolution._load_governed_resolution
    resolution_holds_scope = asyncio.Event()
    allow_resolution = asyncio.Event()

    async def paused_load(db, *, approval_id, current_user):
        loaded = await original_load(db, approval_id=approval_id, current_user=current_user)
        resolution_holds_scope.set()
        await allow_resolution.wait()
        return loaded

    monkeypatch.setattr(resolution, "_load_governed_resolution", paused_load)

    async def resolve():
        async with session_maker() as session:
            return await resolution.approve_governed_mutation(
                session,
                approval_id=approval_id,
                current_user=test_user_cro,
                resolution_notes="Locked visible scope wins",
            )

    async def hide_resolver():
        async with session_maker() as session:
            await _assign_user_scope_after_lock(
                session,
                user_id=resolver_id,
                access_scope=AccessScope.DEPARTMENT,
                department_id=hidden_department_id,
            )
            await session.commit()

    approval_task = asyncio.create_task(resolve())
    await asyncio.wait_for(resolution_holds_scope.wait(), timeout=2)
    scope_task = asyncio.create_task(hide_resolver())
    await asyncio.sleep(0.1)
    assert not scope_task.done()
    allow_resolution.set()
    resolved, _ = await asyncio.gather(approval_task, scope_task)

    assert resolved.status == ApprovalStatus.APPROVED
    async with session_maker() as verification:
        process = await verification.get(Process, process_id)
        resolver = await verification.get(User, resolver_id)
        active_lock = (
            await verification.execute(
                select(GovernedMutationImpactLock.id).where(
                    GovernedMutationImpactLock.resource_type == "process",
                    GovernedMutationImpactLock.resource_id == process_id,
                    GovernedMutationImpactLock.released_at.is_(None),
                )
            )
        ).scalar_one_or_none()
    assert process is not None
    assert process.notes == "Approval owns the earlier scope snapshot"
    assert process.governance_version == 2
    assert resolver is not None
    assert resolver.access_scope == AccessScope.DEPARTMENT
    assert resolver.department_id == hidden_department_id
    assert active_lock is None


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_proposed_owner_role_change_before_approval_expires_proposal(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    monkeypatch,
    enabled_accountability_scenario,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
    test_user_employee: User,
    test_user_platform_admin: User,
):
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL User/Role row-lock serialization is authoritative")
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(
            requester,
            db_session,
            payload=_full_payload(process_owner_user_id=test_user_seeded_risk_manager.id),
        )
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "process_owner_user_id": test_user_employee.id,
                "request_reason": "Owner eligibility serialization",
            },
        )
    approval_id = submitted.json()["approval_id"]
    admin_role_id = test_user_platform_admin.role_id
    assert admin_role_id is not None
    session_maker = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

    from app.services._governed_mutations import resolution

    original_load_envelope = resolution._load_governed_envelope
    resolution_started = asyncio.Event()

    async def observed_load_envelope(db, approval_id):
        loaded = await original_load_envelope(db, approval_id)
        resolution_started.set()
        return loaded

    monkeypatch.setattr(resolution, "_load_governed_envelope", observed_load_envelope)

    async def resolve():
        async with session_maker() as session:
            return await resolution.approve_governed_mutation(
                session,
                approval_id=approval_id,
                current_user=test_user_cro,
                resolution_notes="Must observe committed owner role",
            )

    async with session_maker() as role_session:
        await _assign_user_role_after_lock(
            role_session,
            user_id=test_user_employee.id,
            role_id=admin_role_id,
        )
        approval_task = asyncio.create_task(resolve())
        await asyncio.wait_for(resolution_started.wait(), timeout=2)
        await asyncio.sleep(0.1)
        assert not approval_task.done()
        await role_session.commit()
        resolved = await asyncio.wait_for(approval_task, timeout=2)

    assert resolved.status == ApprovalStatus.EXPIRED
    async with session_maker() as verification:
        process = await verification.get(Process, process_id)
        changed_owner = await verification.get(User, test_user_employee.id)
        active_lock = (
            await verification.execute(
                select(GovernedMutationImpactLock.id).where(
                    GovernedMutationImpactLock.resource_type == "process",
                    GovernedMutationImpactLock.resource_id == process_id,
                    GovernedMutationImpactLock.released_at.is_(None),
                )
            )
        ).scalar_one_or_none()
    assert process is not None
    assert process.process_owner_user_id == test_user_seeded_risk_manager.id
    assert process.governance_version == 1
    assert changed_owner is not None and changed_owner.role_id == admin_role_id
    assert active_lock is None


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_approval_before_proposed_owner_role_change_uses_locked_eligibility(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    monkeypatch,
    enabled_accountability_scenario,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
    test_user_employee: User,
    test_user_platform_admin: User,
):
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL User/Role row-lock serialization is authoritative")
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(
            requester,
            db_session,
            payload=_full_payload(process_owner_user_id=test_user_seeded_risk_manager.id),
        )
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "process_owner_user_id": test_user_employee.id,
                "request_reason": "Owner eligibility serialization",
            },
        )
    approval_id = submitted.json()["approval_id"]
    admin_role_id = test_user_platform_admin.role_id
    assert admin_role_id is not None
    session_maker = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

    from app.services._governed_mutations import resolution

    original_load = resolution._load_governed_resolution
    resolution_holds_owner_role = asyncio.Event()
    allow_resolution = asyncio.Event()

    async def paused_load(db, *, approval_id, current_user):
        loaded = await original_load(db, approval_id=approval_id, current_user=current_user)
        resolution_holds_owner_role.set()
        await allow_resolution.wait()
        return loaded

    monkeypatch.setattr(resolution, "_load_governed_resolution", paused_load)

    async def resolve():
        async with session_maker() as session:
            return await resolution.approve_governed_mutation(
                session,
                approval_id=approval_id,
                current_user=test_user_cro,
                resolution_notes="Locked eligible owner wins",
            )

    async def assign_admin_role():
        async with session_maker() as session:
            await _assign_user_role_after_lock(
                session,
                user_id=test_user_employee.id,
                role_id=admin_role_id,
            )
            await session.commit()

    approval_task = asyncio.create_task(resolve())
    await asyncio.wait_for(resolution_holds_owner_role.wait(), timeout=2)
    role_task = asyncio.create_task(assign_admin_role())
    await asyncio.sleep(0.1)
    assert not role_task.done()
    allow_resolution.set()
    resolved, _ = await asyncio.gather(approval_task, role_task)

    assert resolved.status == ApprovalStatus.APPROVED
    async with session_maker() as verification:
        process = await verification.get(Process, process_id)
        changed_owner = await verification.get(User, test_user_employee.id)
        active_lock = (
            await verification.execute(
                select(GovernedMutationImpactLock.id).where(
                    GovernedMutationImpactLock.resource_type == "process",
                    GovernedMutationImpactLock.resource_id == process_id,
                    GovernedMutationImpactLock.released_at.is_(None),
                )
            )
        ).scalar_one_or_none()
    assert process is not None
    assert process.process_owner_user_id == test_user_employee.id
    assert process.governance_version == 2
    assert changed_owner is not None and changed_owner.role_id == admin_role_id
    assert active_lock is None


async def _remove_process_write_after_role_lock(db: AsyncSession, *, role_id: int) -> None:
    from app.services._riskhub_config.roles import load_role_for_update

    await load_role_for_update(db, role_id)
    await db.execute(
        delete(RolePermission).where(
            RolePermission.role_id == role_id,
            RolePermission.permission_id.in_(
                select(Permission.id).where(
                    Permission.resource == "processes",
                    Permission.action == "write",
                )
            ),
        )
    )


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_requester_permission_removal_before_approval_serializes_and_expires(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    monkeypatch,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
):
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL Role row-lock serialization is authoritative")
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(requester, db_session, payload=_full_payload())
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "l1_process": "Must expire after permission removal",
                "request_reason": "Permission serialization",
            },
        )
    approval_id = submitted.json()["approval_id"]
    role_id = test_user_seeded_risk_manager.role_id
    assert role_id is not None
    session_maker = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

    from app.services._governed_mutations import resolution

    original_load_envelope = resolution._load_governed_envelope
    resolution_started = asyncio.Event()

    async def observed_load_envelope(db, approval_id):
        loaded = await original_load_envelope(db, approval_id)
        resolution_started.set()
        return loaded

    monkeypatch.setattr(resolution, "_load_governed_envelope", observed_load_envelope)

    async def resolve():
        async with session_maker() as session:
            return await resolution.approve_governed_mutation(
                session,
                approval_id=approval_id,
                current_user=test_user_cro,
                resolution_notes="Must observe committed permissions",
            )

    async with session_maker() as permission_session:
        await _remove_process_write_after_role_lock(permission_session, role_id=role_id)
        approval_task = asyncio.create_task(resolve())
        await asyncio.wait_for(resolution_started.wait(), timeout=2)
        await asyncio.sleep(0.1)
        assert not approval_task.done()
        await permission_session.commit()
        resolved = await asyncio.wait_for(approval_task, timeout=2)

    assert resolved.status == ApprovalStatus.EXPIRED
    async with session_maker() as verification:
        process = await verification.get(Process, process_id)
    assert process is not None
    assert process.l1_process == "Správa pojistných smluv"
    assert process.governance_version == 1


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_approval_before_requester_permission_removal_uses_locked_old_authority(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    monkeypatch,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
):
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL Role row-lock serialization is authoritative")
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(requester, db_session, payload=_full_payload())
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "l1_process": "Approved under locked old authority",
                "request_reason": "Permission serialization",
            },
        )
    approval_id = submitted.json()["approval_id"]
    role_id = test_user_seeded_risk_manager.role_id
    assert role_id is not None
    session_maker = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

    from app.services._governed_mutations import resolution

    original_load = resolution._load_governed_resolution
    resolution_holds_role_lock = asyncio.Event()
    allow_resolution = asyncio.Event()

    async def paused_load(db, *, approval_id, current_user):
        loaded = await original_load(db, approval_id=approval_id, current_user=current_user)
        resolution_holds_role_lock.set()
        await allow_resolution.wait()
        return loaded

    monkeypatch.setattr(resolution, "_load_governed_resolution", paused_load)

    async def resolve():
        async with session_maker() as session:
            return await resolution.approve_governed_mutation(
                session,
                approval_id=approval_id,
                current_user=test_user_cro,
                resolution_notes="Old authority was locked",
            )

    async def remove_permission():
        async with session_maker() as session:
            await _remove_process_write_after_role_lock(session, role_id=role_id)
            await session.commit()

    approval_task = asyncio.create_task(resolve())
    await asyncio.wait_for(resolution_holds_role_lock.wait(), timeout=2)
    permission_task = asyncio.create_task(remove_permission())
    await asyncio.sleep(0.1)
    assert not permission_task.done()
    allow_resolution.set()
    resolved, _ = await asyncio.gather(approval_task, permission_task)

    assert resolved.status == ApprovalStatus.APPROVED
    async with session_maker() as verification:
        process = await verification.get(Process, process_id)
        remaining_write = (
            await verification.execute(
                select(RolePermission.id)
                .join(Permission)
                .where(
                    RolePermission.role_id == role_id,
                    Permission.resource == "processes",
                    Permission.action == "write",
                )
            )
        ).scalar_one_or_none()
    assert process is not None
    assert process.l1_process == "Approved under locked old authority"
    assert process.governance_version == 2
    assert remaining_write is None


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_governed_resolution_failure_rolls_back_process_approval_lock_audit_and_outbox(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
):
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL transaction rollback is authoritative")
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(requester, db_session, payload=_full_payload())
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "l1_process": "Must roll back",
                "request_reason": "Failure injection",
            },
        )
    approval_id = submitted.json()["approval_id"]

    session_maker = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

    async def independent_db_session():
        async with session_maker() as session:
            yield session

    trigger_name = f"t85_fail_resolved_outbox_{approval_id}"
    function_name = f"t85_fail_resolved_outbox_{approval_id}"
    async with async_engine.begin() as connection:
        await connection.exec_driver_sql(
            f"""
            CREATE FUNCTION {function_name}() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
                IF NEW.event_type = 'approval.request_resolved'
                   AND NEW.aggregate_id = {approval_id} THEN
                    RAISE EXCEPTION 'injected outbox persistence failure';
                END IF;
                RETURN NEW;
            END;
            $$
            """
        )
        await connection.exec_driver_sql(
            f"""
            CREATE TRIGGER {trigger_name}
            BEFORE INSERT ON app_outbox_events
            FOR EACH ROW EXECUTE FUNCTION {function_name}()
            """
        )
    try:
        async with client_factory(
            user=test_user_cro,
            db_override=independent_db_session,
        ) as approver:
            failed = await approver.post(
                f"/api/v1/approvals/{approval_id}/approve",
                json={"resolution_notes": "Would otherwise approve"},
            )
    finally:
        async with async_engine.begin() as connection:
            await connection.exec_driver_sql(f"DROP TRIGGER IF EXISTS {trigger_name} ON app_outbox_events")
            await connection.exec_driver_sql(f"DROP FUNCTION IF EXISTS {function_name}()")
    assert failed.status_code == 500, failed.text

    async with session_maker() as verification:
        process = await verification.get(Process, process_id)
        approval = await verification.get(ApprovalRequest, approval_id)
        active_lock = (
            await verification.execute(
                select(GovernedMutationImpactLock).where(
                    GovernedMutationImpactLock.resource_type == "process",
                    GovernedMutationImpactLock.resource_id == process_id,
                    GovernedMutationImpactLock.released_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        approval_audits = list(
            (
                await verification.execute(
                    select(ActivityLog).where(
                        ActivityLog.entity_id == approval_id,
                        ActivityLog.action == ActivityAction.APPROVE,
                    )
                )
            )
            .scalars()
            .all()
        )
        process_update_audits = list(
            (
                await verification.execute(
                    select(ActivityLog).where(
                        ActivityLog.entity_id == process_id,
                        ActivityLog.action == ActivityAction.UPDATE,
                    )
                )
            )
            .scalars()
            .all()
        )
        resolution_outbox = list(
            (
                await verification.execute(
                    select(OutboxEvent).where(
                        OutboxEvent.aggregate_id == approval_id,
                        OutboxEvent.event_type == "approval.request_resolved",
                    )
                )
            )
            .scalars()
            .all()
        )

    assert process is not None
    assert process.l1_process == "Správa pojistných smluv"
    assert process.governance_version == 1
    assert approval is not None and approval.status.value == "PENDING"
    assert approval.resolved_by_id is None
    assert active_lock is not None and active_lock.released_at is None
    assert approval_audits == []
    assert process_update_audits == []
    assert resolution_outbox == []


@pytest.mark.asyncio
async def test_stale_governance_version_expires_proposal_and_enqueues_expiry(
    client_factory,
    db_session: AsyncSession,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
):
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(requester, db_session, payload=_full_payload())
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "l1_process": "Stale proposed name",
                "request_reason": "Needs review",
            },
        )
        approval_id = submitted.json()["approval_id"]

    process = await db_session.get(Process, process_id)
    assert process is not None
    process.governance_version += 1
    await db_session.commit()

    async with client_factory(user=test_user_cro) as approver:
        response = await approver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Approved after an intervening change"},
        )

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "expired"
    expiry_event = (
        await db_session.execute(
            select(OutboxEvent).where(
                OutboxEvent.event_type == "approval.request_expired",
                OutboxEvent.aggregate_id == approval_id,
            )
        )
    ).scalar_one()
    active_lock = (
        await db_session.execute(
            select(GovernedMutationImpactLock).where(
                GovernedMutationImpactLock.resource_id == process_id,
                GovernedMutationImpactLock.released_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    assert expiry_event.payload == {"approval_id": approval_id}
    assert active_lock is None


@pytest.mark.asyncio
@pytest.mark.parametrize("resolution_action", ["approve", "reject"])
async def test_envelope_resource_name_drift_remains_proposal_backed_and_expires(
    client_factory,
    db_session: AsyncSession,
    monkeypatch,
    test_department: Department,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
    resolution_action: str,
):
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(
            requester,
            db_session,
            payload=_full_payload(
                process_owner_user_id=test_user_seeded_risk_manager.id,
                owning_department_id=test_department.id,
            ),
            approver_roles=["cro"],
        )
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "notes": "Envelope-only drift must never apply",
                "request_reason": "Exercise immutable proposal membership",
            },
        )
    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    approval = await db_session.get(ApprovalRequest, approval_id)
    proposal = (
        await db_session.execute(
            select(GovernedMutationProposal).where(GovernedMutationProposal.approval_request_id == approval_id)
        )
    ).scalar_one()
    impact_lock = (
        await db_session.execute(
            select(GovernedMutationImpactLock).where(GovernedMutationImpactLock.proposal_id == proposal.id)
        )
    ).scalar_one()
    impact_lock_id = impact_lock.id
    assert approval is not None
    immutable_name = proposal.primary_resource_name
    approval.resource_name = "Mutable envelope-only name drift"
    linked_notification = Notification(
        user_id=test_user_cro.id,
        type=NotificationType.GOVERNED_APPROVAL_ACTION_REQUIRED,
        title="Envelope drift remains governed",
        message="The immutable proposal still controls visibility.",
        resource_type="approval",
        resource_id=approval_id,
        is_read=False,
    )
    db_session.add(linked_notification)
    await db_session.commit()

    assert strict_governed_process_identity(proposal) is not None
    sql_member = await db_session.scalar(
        select(ApprovalRequest.id).where(
            ApprovalRequest.id == approval_id,
            valid_governed_process_proposal_exists_clause(),
        )
    )
    assert sql_member == approval_id

    notify_governed = AsyncMock(return_value=[])
    monkeypatch.setattr(
        approval_handlers.NotificationService,
        "notify_governed_action_required",
        notify_governed,
    )
    await approval_handlers.handle_approval_request_created(
        db_session,
        ApprovalRequestCreatedPayload(approval_id=approval_id),
    )
    assert notify_governed.await_count == 1

    from app.api.v1.endpoints.users.summary import SHELL_SUMMARY_CACHE

    SHELL_SUMMARY_CACHE.clear()
    async with client_factory(user=test_user_cro) as reviewer:
        queue = await reviewer.get("/api/v1/approvals")
        pending = await reviewer.get("/api/v1/approvals", params={"status": "pending"})
        my_approvals = await reviewer.get("/api/v1/approvals/my-approvals")
        count = await reviewer.get("/api/v1/approvals/pending/count")
        shell = await reviewer.get("/api/v1/users/me/shell-summary")
        detail = await reviewer.get(f"/api/v1/approvals/{approval_id}")
        process_detail = await reviewer.get(f"/api/v1/processes/{process_id}")
        inbox = await reviewer.get("/api/v1/notifications")
        unread = await reviewer.get("/api/v1/notifications/unread/count")
        marked_read = await reviewer.post(f"/api/v1/notifications/{linked_notification.id}/read")

    for response in (queue, pending, my_approvals):
        assert response.status_code == 200, response.text
        row = next(item for item in response.json()["items"] if item["id"] == approval_id)
        assert row["resource_name"] == immutable_name
        assert row["governed_mutation"] is not None
    assert count.json() == {"count": 1}
    assert shell.json()["pending_approvals_count"] == 1
    assert detail.status_code == 200, detail.text
    assert detail.json()["resource_name"] == immutable_name
    assert detail.json()["governed_mutation"] is not None
    assert process_detail.status_code == 200, process_detail.text
    assert process_detail.json()["pending_change"]["approval_id"] == approval_id
    assert inbox.json()["total"] == 1
    assert unread.json() == {"count": 1}
    assert marked_read.status_code == 200, marked_read.text
    assert marked_read.json() == {"unread_count": 0}

    async with client_factory(user=test_user_cro) as reviewer:
        resolved = await reviewer.post(
            f"/api/v1/approvals/{approval_id}/{resolution_action}",
            json={"resolution_notes": "Envelope drift expires safely"},
        )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"

    db_session.expire_all()
    process = await db_session.get(Process, process_id)
    persisted_approval = await db_session.get(ApprovalRequest, approval_id)
    persisted_lock = await db_session.get(GovernedMutationImpactLock, impact_lock_id)
    assert process is not None
    assert process.notes != "Envelope-only drift must never apply"
    assert process.governance_version == 1
    assert persisted_approval is not None
    assert persisted_approval.status == ApprovalStatus.EXPIRED
    assert persisted_lock is not None
    assert persisted_lock.released_at is not None
    assert persisted_lock.release_reason == "expired"
    expiry_event = await db_session.scalar(
        select(OutboxEvent.id).where(
            OutboxEvent.event_type == "approval.request_expired",
            OutboxEvent.aggregate_id == approval_id,
        )
    )
    assert expiry_event is not None

    SHELL_SUMMARY_CACHE.clear()
    async with client_factory(user=test_user_cro) as reviewer:
        history = await reviewer.get("/api/v1/approvals", params={"status": "expired"})
        terminal_detail = await reviewer.get(f"/api/v1/approvals/{approval_id}")
    history_row = next(item for item in history.json()["items"] if item["id"] == approval_id)
    assert history_row["resource_name"] == immutable_name
    assert terminal_detail.status_code == 200, terminal_detail.text
    assert terminal_detail.json()["resource_name"] == immutable_name


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "corruption",
    [
        "missing_lock",
        "released_lock",
        "extra_lock",
        "lock_resource_type",
        "lock_resource_id",
        "lock_base_version",
        "proposal_uuid",
        "proposal_version",
        "schema_version",
        "mutation_kind",
        "proposal_requester",
        "approval_requester",
        "approval_status",
        "proposal_resource",
        "approval_identity",
        "base_versions",
        "impacted_snapshot",
        "business_snapshot",
    ],
)
async def test_corrupt_governed_envelope_expires_without_process_mutation(
    client_factory,
    db_session: AsyncSession,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
    test_user_employee: User,
    corruption: str,
):
    if db_session.bind.dialect.name == "postgresql" and corruption in {
        "proposal_uuid",
        "proposal_version",
        "schema_version",
        "mutation_kind",
        "proposal_requester",
        "proposal_resource",
        "base_versions",
        "impacted_snapshot",
        "business_snapshot",
    }:
        pytest.skip("PostgreSQL proposal immutability rejects corruption setup")
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(requester, db_session, payload=_full_payload())
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "l1_process": "Must never apply",
                "request_reason": "Integrity regression",
            },
        )
    approval_id = submitted.json()["approval_id"]
    approval = await db_session.get(ApprovalRequest, approval_id)
    proposal = (
        await db_session.execute(
            select(GovernedMutationProposal).where(GovernedMutationProposal.approval_request_id == approval_id)
        )
    ).scalar_one()
    proposal_row_id = proposal.id
    impact_lock = (
        await db_session.execute(
            select(GovernedMutationImpactLock).where(GovernedMutationImpactLock.proposal_id == proposal.id)
        )
    ).scalar_one()
    assert approval is not None

    if corruption == "missing_lock":
        await db_session.delete(impact_lock)
    elif corruption == "released_lock":
        impact_lock.released_at = utc_now()
        impact_lock.release_reason = "corrupt-release"
    elif corruption == "extra_lock":
        db_session.add(
            GovernedMutationImpactLock(
                proposal_id=proposal.id,
                resource_type="vendor",
                resource_id=process_id,
                base_governance_version=1,
            )
        )
    elif corruption == "lock_resource_type":
        impact_lock.resource_type = "vendor"
    elif corruption == "lock_resource_id":
        impact_lock.resource_id = process_id + 100_000
    elif corruption == "lock_base_version":
        impact_lock.base_governance_version += 1
    elif corruption == "proposal_uuid":
        await _directly_corrupt_proposal(db_session, proposal.id, proposal_id="not-a-canonical-uuid")
    elif corruption == "proposal_version":
        await _directly_corrupt_proposal(db_session, proposal.id, proposal_version=proposal.proposal_version + 1)
    elif corruption == "schema_version":
        await _directly_corrupt_proposal(db_session, proposal.id, schema_version=proposal.schema_version + 1)
    elif corruption == "mutation_kind":
        await _directly_corrupt_proposal(db_session, proposal.id, mutation_kind="process.archive")
    elif corruption == "proposal_requester":
        await _directly_corrupt_proposal(db_session, proposal.id, requested_by_id=test_user_employee.id)
    elif corruption == "approval_requester":
        approval.requested_by_id = test_user_cro.id
    elif corruption == "approval_status":
        approval.status = ApprovalStatus.PENDING_PRIVILEGED
    elif corruption == "proposal_resource":
        await _directly_corrupt_proposal(db_session, proposal.id, primary_resource_id=process_id + 100_000)
    elif corruption == "approval_identity":
        approval.resource_name = "Corrupt approval identity"
    elif corruption == "base_versions":
        await _directly_corrupt_proposal(db_session, proposal.id, base_versions={"process": 2})
    elif corruption == "impacted_snapshot":
        await _directly_corrupt_proposal(
            db_session,
            proposal_row_id,
            impacted_resources_snapshot=[
                {
                    **proposal.impacted_resources_snapshot[0],
                    "resource_name": "Corrupt impacted identity",
                }
            ],
        )
    elif corruption == "business_snapshot":
        await _directly_corrupt_proposal(
            db_session,
            proposal.id,
            before_snapshot={"notes": "Corrupt business snapshot"},
        )
    else:  # pragma: no cover - the parametrization is exhaustive
        raise AssertionError(f"Unknown corruption: {corruption}")
    await db_session.commit()

    async with client_factory(user=test_user_cro) as approver:
        response = await approver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Envelope must be intact"},
        )

    malformed_or_unsupported = corruption in {
        "proposal_uuid",
        "proposal_version",
        "schema_version",
        "proposal_resource",
        "base_versions",
        "impacted_snapshot",
        "business_snapshot",
    }
    assert response.status_code == (400 if malformed_or_unsupported else 200), response.text
    if not malformed_or_unsupported:
        assert response.json()["status"] == "expired"
    db_session.expire_all()
    process = await db_session.get(Process, process_id)
    approval = await db_session.get(ApprovalRequest, approval_id)
    all_locks = list(
        (
            await db_session.execute(
                select(GovernedMutationImpactLock).where(GovernedMutationImpactLock.proposal_id == proposal_row_id)
            )
        )
        .scalars()
        .all()
    )
    expiry_events = list(
        (
            await db_session.execute(
                select(OutboxEvent).where(
                    OutboxEvent.event_type == "approval.request_expired",
                    OutboxEvent.aggregate_id == approval_id,
                )
            )
        )
        .scalars()
        .all()
    )
    expiry_audits = list(
        (
            await db_session.execute(
                select(ActivityLog).where(
                    ActivityLog.entity_id == approval_id,
                    ActivityLog.action == ActivityAction.STATUS_CHANGE,
                )
            )
        )
        .scalars()
        .all()
    )
    assert process is not None
    assert process.l1_process == "Správa pojistných smluv"
    assert process.governance_version == 1
    expected_status = ApprovalStatus.PENDING if malformed_or_unsupported else ApprovalStatus.EXPIRED
    assert approval is not None and approval.status == expected_status
    if malformed_or_unsupported:
        assert all(impact.released_at is None for impact in all_locks)
        assert expiry_events == []
        assert expiry_audits == []
    else:
        assert all(impact.released_at is not None for impact in all_locks)
        assert len(expiry_events) == 1
        assert len(expiry_audits) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("corruption", ["approval_requester", "proposal_uuid"])
async def test_reject_expires_corrupt_envelope_before_self_or_live_policy_checks(
    client_factory,
    db_session: AsyncSession,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
    corruption: str,
):
    if db_session.bind.dialect.name == "postgresql" and corruption == "proposal_uuid":
        pytest.skip("PostgreSQL proposal immutability rejects corruption setup")
    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(requester, db_session, payload=_full_payload())
        process_id = created.json()["id"]
        submitted = await requester.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "l1_process": "Must never reject as valid",
                "request_reason": "Integrity rejection regression",
            },
        )
    approval_id = submitted.json()["approval_id"]
    approval = await db_session.get(ApprovalRequest, approval_id)
    proposal = (
        await db_session.execute(
            select(GovernedMutationProposal).where(GovernedMutationProposal.approval_request_id == approval_id)
        )
    ).scalar_one()
    proposal_row_id = proposal.id
    if corruption == "approval_requester":
        assert approval is not None
        approval.requested_by_id = test_user_cro.id
    else:
        await _directly_corrupt_proposal(
            db_session,
            proposal_row_id,
            proposal_id="not-a-canonical-uuid",
        )
    await db_session.commit()

    async with client_factory(user=test_user_cro) as resolver:
        rejected = await resolver.post(
            f"/api/v1/approvals/{approval_id}/reject",
            json={"resolution_notes": "Corrupt envelope cannot be rejected"},
        )

    malformed = corruption == "proposal_uuid"
    assert rejected.status_code == (400 if malformed else 200), rejected.text
    if not malformed:
        assert rejected.json()["status"] == "expired"
    db_session.expire_all()
    expired = await db_session.get(ApprovalRequest, approval_id)
    active_lock = (
        await db_session.execute(
            select(GovernedMutationImpactLock).where(
                GovernedMutationImpactLock.proposal_id == proposal_row_id,
                GovernedMutationImpactLock.released_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    expiry_events = list(
        (
            await db_session.execute(
                select(OutboxEvent).where(
                    OutboxEvent.event_type == "approval.request_expired",
                    OutboxEvent.aggregate_id == approval_id,
                )
            )
        )
        .scalars()
        .all()
    )
    expiry_audits = list(
        (
            await db_session.execute(
                select(ActivityLog).where(
                    ActivityLog.entity_id == approval_id,
                    ActivityLog.action == ActivityAction.STATUS_CHANGE,
                )
            )
        )
        .scalars()
        .all()
    )
    expected_status = ApprovalStatus.PENDING if malformed else ApprovalStatus.EXPIRED
    assert expired is not None and expired.status == expected_status
    if malformed:
        assert active_lock is not None
        assert expiry_events == []
        assert expiry_audits == []
    else:
        assert active_lock is None
        assert len(expiry_events) == 1
        assert len(expiry_audits) == 1


@pytest.mark.asyncio
async def test_disabled_notification_delivery_never_hides_process_approval_queue_work(
    client_factory,
    db_session: AsyncSession,
    test_user_seeded_risk_manager: User,
    test_user_cro: User,
):
    async with client_factory(user=test_user_cro) as approver:
        disabled = await approver.put(
            "/api/v1/notifications/preferences",
            json={"governed_approval_action_required": False},
        )
        assert disabled.status_code == 200, disabled.text

    async with client_factory(user=test_user_seeded_risk_manager) as requester:
        created = await _create_process_before_enabling_protection(requester, db_session, payload=_full_payload())
        submitted = await requester.patch(
            f"/api/v1/processes/{created.json()['id']}",
            json={"notes": "Pending queue work", "request_reason": "Needs review"},
        )
        approval_id = submitted.json()["approval_id"]
        my_requests = await requester.get(
            "/api/v1/approvals",
            params={"status": "pending", "my_requests": True},
        )

    async with client_factory(user=test_user_cro) as approver:
        queue = await approver.get("/api/v1/approvals", params={"status": "pending"})
        my_approvals = await approver.get("/api/v1/approvals/my-approvals")
        count = await approver.get("/api/v1/approvals/pending/count")

    assert approval_id in {item["id"] for item in my_requests.json()["items"]}
    assert approval_id in {item["id"] for item in queue.json()["items"]}
    assert approval_id in {item["id"] for item in my_approvals.json()["items"]}
    assert count.json()["count"] >= 1


@pytest.mark.asyncio
async def test_employee_reads_processes_but_cannot_maintain_them(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_employee: User,
):
    """Reads follow the standard business-entity pattern; writes 403 for employees."""
    async with client_factory(user=test_user_cro) as client:
        seeded = (
            await _create_process_before_enabling_protection(client, db_session, payload=_minimal_payload())
        ).json()

    async with client_factory(user=test_user_employee) as client:
        listing = await client.get("/api/v1/processes")
        assert listing.status_code == 200
        assert listing.json()["capabilities"] == {
            "can_create": False,
            "can_export": True,
        }

        detail = await client.get(f"/api/v1/processes/{seeded['id']}")
        assert detail.status_code == 200
        assert detail.json()["capabilities"] == {
            "can_read": True,
            "can_update": False,
            "can_archive": False,
            "can_restore": False,
            "protected_change_requires_approval": True,
            "can_request_change": False,
            "can_cancel_pending_change": False,
            "has_pending_change": False,
            "business_edit_blocked": False,
        }

        # Every maintenance verb is denied.
        assert (await client.post("/api/v1/processes", json=_minimal_payload())).status_code == 403
        assert (await client.patch(f"/api/v1/processes/{seeded['id']}", json={"notes": "X"})).status_code == 403
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
        for (method, path, body), expected_status in zip(paths_and_calls, platform_admin_statuses, strict=True):
            resp = await call(client, method, path, body)
            assert resp.status_code == expected_status, f"{method.upper()} {path} -> {resp.status_code}"

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
        role_name: {key for key in expand_permission_keys(permission_keys) if key.startswith("processes:")}
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
