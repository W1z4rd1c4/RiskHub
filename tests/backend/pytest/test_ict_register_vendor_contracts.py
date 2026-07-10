"""ICT Register Vendor Contracts + vendor register extension (issue #44).

Behavior under test, at the HTTP seam via ``client_factory``:
- a Risk Manager maintains Contracts inside a Vendor's detail (create, read,
  update, archive, restore) with the workbook's entered 08_Smlouvy columns:
  contract reference, internal contract number, records system, arrangement
  type, the main-contract flag, the overarching-arrangement reference,
  description, the RoI-scope flag, start/end dates, both notice periods,
  governing law, annual cost with currency, and note;
- derived 08_Smlouvy columns (vendor-name lookup, sub-outsourcing chain
  display, duplicate check, hidden helpers — tickets #48/#49) are rejected
  on write;
- coded Contract fields are enforced against the workbook closed lists from
  ``_ict_register_reference`` (SystemEvidence, TypUjednani, AnoNe, MenaList);
- the main-contract flag is stored as entered: the workbook's exactly-one
  rule is a future DQ finding (#50), never a write constraint;
- Contracts belong to exactly one Vendor; mutations on contracts of an
  ARCHIVED Vendor conflict (409); archived Contracts reject edits (409) and
  double archive (400) per the register's strict archived-end stance;
- Vendor gains its register extension fields (LEI/EUID identifier type +
  value and the remaining entered 07_Dodavatelé columns) and constrains
  substitutability writes to the closed four-value Substituce list while
  legacy stored replaceability values stay readable;
- maintenance is restricted per the RBAC seed (risk_manager + CRO wildcard),
  reads follow vendors:read holders, platform admins are excluded, and
  mutations land on the audit trail;
- both migrations ship per repo convention and the vendor-contracts surface
  is unreserved.

Field inventory source: docs/dora-ict-register/dora-excel-functional-spec.md
sections 1.3 (07_Dodavatelé) and 1.4 (08_Smlouvy). Expected values are spec
literals.
"""

from __future__ import annotations

from decimal import Decimal

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


def _vendor_payload(*, department_id: int, owner_user_id: int, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": "BIZ DATA",
        "process": "IT",
        "department_id": department_id,
        "outsourcing_owner_user_id": owner_user_id,
    }
    payload.update(overrides)
    return payload


async def _create_vendor(client, *, department_id: int, owner_user_id: int, **overrides: object) -> dict:
    response = await client.post(
        "/api/v1/vendors", json=_vendor_payload(department_id=department_id, owner_user_id=owner_user_id, **overrides)
    )
    assert response.status_code == 201, response.text
    return response.json()


def _minimal_contract_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {"contract_reference": "SML-2020-001"}
    payload.update(overrides)
    return payload


def _full_contract_payload(**overrides: object) -> dict[str, object]:
    """Every entered 08_Smlouvy column (spec section 1.4); values mirror the BIZ DATA seed row."""
    payload: dict[str, object] = {
        "contract_reference": "SML-2020-001",
        "internal_contract_number": "TAS-44821",
        "records_system": "TAS",
        "arrangement_type": "Rámcové (master)",
        "main_contract": "Ano",
        "overarching_arrangement_reference": "SML-2019-044",
        "description": "Provoz jádrového pojistného systému.",
        "roi_scope": "Ano",
        "start_date": "2020-01-01",
        "end_date": "9999-12-31",
        "notice_period_entity_days": 180,
        "notice_period_provider_days": 180,
        "governing_law_country": "CZ",
        "annual_cost": 4500000,
        "currency": "CZK",
        "note": "Poznámka.",
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_create_and_read_contract_with_all_entered_fields(
    client_factory, test_user_cro: User, test_department: Department
):
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)

        created = await client.post(
            f"/api/v1/vendors/{vendor['id']}/contracts", json=_full_contract_payload()
        )
        assert created.status_code == 201, created.text
        body = created.json()
        assert body["id"] > 0
        assert body["vendor_id"] == vendor["id"]
        assert body["contract_reference"] == "SML-2020-001"
        assert body["internal_contract_number"] == "TAS-44821"
        assert body["records_system"] == "TAS"
        assert body["arrangement_type"] == "Rámcové (master)"
        assert body["main_contract"] == "Ano"
        assert body["overarching_arrangement_reference"] == "SML-2019-044"
        assert body["description"] == "Provoz jádrového pojistného systému."
        assert body["roi_scope"] == "Ano"
        assert body["start_date"] == "2020-01-01"
        # The workbook's open-ended sentinel is a plain entered date.
        assert body["end_date"] == "9999-12-31"
        assert body["notice_period_entity_days"] == 180
        assert body["notice_period_provider_days"] == 180
        assert body["governing_law_country"] == "CZ"
        assert Decimal(str(body["annual_cost"])) == Decimal("4500000")
        assert body["currency"] == "CZK"
        assert body["note"] == "Poznámka."
        assert body["is_archived"] is False

        # Readable as the Vendor's contract collection.
        listed = await client.get(f"/api/v1/vendors/{vendor['id']}/contracts")
        assert listed.status_code == 200
        assert [row["id"] for row in listed.json()] == [body["id"]]
        assert listed.json()[0]["contract_reference"] == "SML-2020-001"

        # A minimal contract leaves every optional column null.
        minimal = await client.post(
            f"/api/v1/vendors/{vendor['id']}/contracts", json=_minimal_contract_payload()
        )
        assert minimal.status_code == 201, minimal.text
        minimal_body = minimal.json()
        assert minimal_body["records_system"] is None
        assert minimal_body["arrangement_type"] is None
        assert minimal_body["main_contract"] is None
        assert minimal_body["roi_scope"] is None
        assert minimal_body["start_date"] is None
        assert minimal_body["annual_cost"] is None
        assert minimal_body["currency"] is None

        # Unknown parents 404 on both verbs.
        assert (
            await client.post("/api/v1/vendors/999999/contracts", json=_minimal_contract_payload())
        ).status_code == 404
        assert (await client.get("/api/v1/vendors/999999/contracts")).status_code == 404


@pytest.mark.asyncio
async def test_update_contract_round_trips_entered_fields(
    client_factory, test_user_cro: User, test_department: Department
):
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        other_vendor = await _create_vendor(
            client, department_id=test_department.id, owner_user_id=test_user_cro.id, name="Druhý dodavatel"
        )
        created = (
            await client.post(f"/api/v1/vendors/{vendor['id']}/contracts", json=_full_contract_payload())
        ).json()

        updated = await client.patch(
            f"/api/v1/vendors/{vendor['id']}/contracts/{created['id']}",
            json={"arrangement_type": "Navazující", "notice_period_entity_days": 90, "end_date": "2027-06-30"},
        )
        assert updated.status_code == 200, updated.text
        assert updated.json()["arrangement_type"] == "Navazující"
        assert updated.json()["notice_period_entity_days"] == 90
        assert updated.json()["end_date"] == "2027-06-30"
        # Untouched columns stay untouched.
        assert updated.json()["contract_reference"] == "SML-2020-001"
        assert updated.json()["main_contract"] == "Ano"

        # Clearing an optional column with null works.
        cleared = await client.patch(
            f"/api/v1/vendors/{vendor['id']}/contracts/{created['id']}", json={"note": None}
        )
        assert cleared.status_code == 200
        assert cleared.json()["note"] is None

        # A contract belongs to exactly one Vendor: the other Vendor's URL 404s.
        assert (
            await client.patch(
                f"/api/v1/vendors/{other_vendor['id']}/contracts/{created['id']}", json={"note": "x"}
            )
        ).status_code == 404
        assert (
            await client.patch(f"/api/v1/vendors/{vendor['id']}/contracts/999999", json={"note": "x"})
        ).status_code == 404


# Derived 08_Smlouvy columns (spec section 1.4) arrive with the derivation
# engine (tickets #48/#49) and must never be writable: the vendor-name lookup
# (F), the sub-outsourcing chain display (S), the duplicate check (U), and the
# hidden main/CIF/duplicity/vendor-exists helpers (V/W/X/Y). The vendor FK is
# the URL parent, never a payload column.
DERIVED_CONTRACT_WRITES: dict[str, object] = {
    "vendor_name": "BIZ DATA",
    "sub_outsourcing_chain": "BIZ DATA → Subdodavatel",
    "duplicate_check": "DUPLICITA",
    "main_vendor_helper": "DOD-01",
    "cif_helper": "Ano",
    "duplicity_helper": 2,
    "vendor_exists_helper": 1,
    "vendor_id": 1,
}


@pytest.mark.asyncio
async def test_writes_that_include_derived_columns_are_rejected(
    client_factory, test_user_cro: User, test_department: Department
):
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        existing = (
            await client.post(f"/api/v1/vendors/{vendor['id']}/contracts", json=_minimal_contract_payload())
        ).json()

        for field, value in DERIVED_CONTRACT_WRITES.items():
            create_resp = await client.post(
                f"/api/v1/vendors/{vendor['id']}/contracts",
                json=_minimal_contract_payload(**{field: value}),
            )
            assert create_resp.status_code == 422, f"POST accepted derived column {field}"

            patch_resp = await client.patch(
                f"/api/v1/vendors/{vendor['id']}/contracts/{existing['id']}", json={field: value}
            )
            assert patch_resp.status_code == 422, f"PATCH accepted derived column {field}"

        # The register did not silently change.
        unchanged = await client.get(f"/api/v1/vendors/{vendor['id']}/contracts")
        assert [row["id"] for row in unchanged.json()] == [existing["id"]]
        assert unchanged.json()[0]["contract_reference"] == "SML-2020-001"


@pytest.mark.asyncio
async def test_coded_contract_columns_are_enforced_against_workbook_closed_lists(
    client_factory, test_user_cro: User, test_department: Department
):
    """Closed-list columns accept verbatim workbook values only (spec section 3.1)."""
    cases = {
        "records_system": ("SAP", "Excel"),
        "arrangement_type": ("Samostatné", "Podřízené"),
        "main_contract": ("Ne", "Možná"),
        "roi_scope": ("Ne", "Neurčeno"),
        "currency": ("EUR", "CHF"),
    }
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        contracts_url = f"/api/v1/vendors/{vendor['id']}/contracts"

        for field, (valid, invalid) in cases.items():
            ok = await client.post(contracts_url, json=_minimal_contract_payload(**{field: valid}))
            assert ok.status_code == 201, f"{field}={valid!r} rejected: {ok.text}"
            assert ok.json()[field] == valid

            rejected = await client.post(contracts_url, json=_minimal_contract_payload(**{field: invalid}))
            assert rejected.status_code == 422, f"{field}={invalid!r} accepted"

        # Closed lists are verbatim and case-sensitive ("ano" is not a value).
        assert (
            await client.post(contracts_url, json=_minimal_contract_payload(main_contract="ano"))
        ).status_code == 422

        # Column-level strictness: ISO country is two letters, notice periods
        # and cost are non-negative, dates are dates.
        for bad in (
            {"governing_law_country": "CZE"},
            {"notice_period_entity_days": -1},
            {"notice_period_provider_days": -30},
            {"annual_cost": -1},
            {"start_date": "not-a-date"},
        ):
            resp = await client.post(contracts_url, json=_minimal_contract_payload(**bad))
            assert resp.status_code == 422, f"{bad} accepted"

        # PATCH enforces the same lists.
        created = (await client.post(contracts_url, json=_minimal_contract_payload())).json()
        assert (
            await client.patch(f"{contracts_url}/{created['id']}", json={"currency": "CHF"})
        ).status_code == 422
        patched_ok = await client.patch(f"{contracts_url}/{created['id']}", json={"currency": "GBP"})
        assert patched_ok.status_code == 200
        assert patched_ok.json()["currency"] == "GBP"


@pytest.mark.asyncio
async def test_main_contract_flag_is_stored_as_entered_and_never_unique(
    client_factory, test_user_cro: User, test_department: Department
):
    """The workbook's exactly-one-main-per-vendor rule is a DQ finding (#50), not a write block.

    Two contracts of one Vendor may both carry Hlavní smlouva = Ano; the
    register stores the flag as entered and flags the violation later.
    """
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        contracts_url = f"/api/v1/vendors/{vendor['id']}/contracts"

        first = await client.post(
            contracts_url, json=_minimal_contract_payload(contract_reference="SML-2020-001", main_contract="Ano")
        )
        second = await client.post(
            contracts_url, json=_minimal_contract_payload(contract_reference="SML-2021-007", main_contract="Ano")
        )
        assert first.status_code == 201, first.text
        assert second.status_code == 201, second.text

        rows = (await client.get(contracts_url)).json()
        assert [row["main_contract"] for row in rows] == ["Ano", "Ano"]

        # Promoting a third to main also does not demote anything.
        third = (await client.post(contracts_url, json=_minimal_contract_payload(main_contract="Ne"))).json()
        promoted = await client.patch(f"{contracts_url}/{third['id']}", json={"main_contract": "Ano"})
        assert promoted.status_code == 200
        rows = (await client.get(contracts_url)).json()
        assert [row["main_contract"] for row in rows] == ["Ano", "Ano", "Ano"]


@pytest.mark.asyncio
async def test_contract_archive_restore_lifecycle_and_collection_listing(
    client_factory, test_user_cro: User, test_department: Department
):
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        contracts_url = f"/api/v1/vendors/{vendor['id']}/contracts"
        keep = (await client.post(contracts_url, json=_minimal_contract_payload())).json()
        gone = (
            await client.post(contracts_url, json=_minimal_contract_payload(contract_reference="SML-2021-007"))
        ).json()

        # Archive hides the row from the default collection.
        assert (await client.delete(f"{contracts_url}/{gone['id']}")).status_code == 204
        assert [row["id"] for row in (await client.get(contracts_url)).json()] == [keep["id"]]

        with_archived = (await client.get(contracts_url, params={"include_archived": True})).json()
        assert [row["id"] for row in with_archived] == [keep["id"], gone["id"]]
        archived_row = next(row for row in with_archived if row["id"] == gone["id"])
        assert archived_row["is_archived"] is True
        assert archived_row["archived_by_id"] is not None
        assert archived_row["capabilities"]["can_restore"] is True
        assert archived_row["capabilities"]["can_update"] is False
        assert archived_row["capabilities"]["can_archive"] is False

        # Archived contracts cannot be edited (409) or re-archived (400).
        assert (
            await client.patch(f"{contracts_url}/{gone['id']}", json={"note": "x"})
        ).status_code == 409
        assert (await client.delete(f"{contracts_url}/{gone['id']}")).status_code == 400

        # Restore brings the row back; restoring an active row is rejected.
        restored = await client.post(f"{contracts_url}/{gone['id']}/restore")
        assert restored.status_code == 200
        assert restored.json()["is_archived"] is False
        assert restored.json()["archived_at"] is None
        assert (await client.post(f"{contracts_url}/{gone['id']}/restore")).status_code == 400
        assert len((await client.get(contracts_url)).json()) == 2

        # Missing rows 404 on the lifecycle routes too.
        assert (await client.delete(f"{contracts_url}/999999")).status_code == 404
        assert (await client.post(f"{contracts_url}/999999/restore")).status_code == 404


@pytest.mark.asyncio
async def test_archived_vendor_conflicts_every_contract_mutation_but_stays_readable(
    client_factory, test_user_cro: User, test_department: Department
):
    """The register's strict archived-end stance: an archived Vendor freezes its contracts."""
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        contracts_url = f"/api/v1/vendors/{vendor['id']}/contracts"
        active = (await client.post(contracts_url, json=_minimal_contract_payload())).json()
        archived = (
            await client.post(contracts_url, json=_minimal_contract_payload(contract_reference="SML-2021-007"))
        ).json()
        assert (await client.delete(f"{contracts_url}/{archived['id']}")).status_code == 204

        assert (await client.delete(f"/api/v1/vendors/{vendor['id']}")).status_code in (200, 204)

        # Contracts stay readable on an archived Vendor...
        rows = (await client.get(contracts_url, params={"include_archived": True})).json()
        assert {row["id"] for row in rows} == {active["id"], archived["id"]}
        # ...with every mutation capability off...
        for row in rows:
            assert row["capabilities"]["can_update"] is False
            assert row["capabilities"]["can_archive"] is False
            assert row["capabilities"]["can_restore"] is False

        # ...and every mutation verb conflicts until the Vendor is restored.
        assert (await client.post(contracts_url, json=_minimal_contract_payload())).status_code == 409
        assert (
            await client.patch(f"{contracts_url}/{active['id']}", json={"note": "x"})
        ).status_code == 409
        assert (await client.delete(f"{contracts_url}/{active['id']}")).status_code == 409
        assert (await client.post(f"{contracts_url}/{archived['id']}/restore")).status_code == 409

        # Restoring the Vendor unfreezes contract maintenance.
        assert (await client.post(f"/api/v1/vendors/{vendor['id']}/restore")).status_code == 200
        assert (
            await client.patch(f"{contracts_url}/{active['id']}", json={"note": "po obnovení"})
        ).status_code == 200
        assert (await client.post(f"{contracts_url}/{archived['id']}/restore")).status_code == 200


def _vendor_register_extension_payload() -> dict[str, object]:
    """Every entered 07_Dodavatelé register column the base Vendor lacked (spec section 1.3)."""
    return {
        # A·IDENTIFIKACE
        "latin_name": "BIZ DATA a.s.",
        "person_type": "Právnická osoba",
        "identifier_type": "IČO (CRN)",
        "identifier_value": "12345678",
        "address": "Na Příkopě 1, Praha 1",
        "contact_person": "Jan Novák",
        "contact": "jan.novak@bizdata.cz",
        "ultimate_parent_name": "BIZ DATA Group SE",
        "ultimate_parent_lei": "969500KN90DZLEVQ2X21",
        # C·DATA A LOKACE
        "data_storage": "Vlastní datové centrum",
        "service_country": "CZ",
        "data_location": "Praha",
        "processing_location": "Praha",
        "data_sensitivity": "Vysoká",
        # D·SUBSTITUCE A EXIT
        "replaceability": "Nenahraditelný",
        "substitutability_reason": "Obojí",
        "last_audit_date": "2025-11-30",
        "exit_plan_state": "K revizi",
        "reintegration": "Velmi složitá",
        "service_disruption_impact": "Vysoký",
        "alternative_providers": "Ne",
        "alternative_providers_names": "—",
        # F·POSOUZENÍ RIZIKA A VÝZNAMNOSTI
        "ctpp_designation": "Ne",
        "ex_ante_operational": "OK",
        "ex_ante_legal": "OK",
        "ex_ante_ict": "Riziko",
        "ex_ante_reputational": "OK",
        "ex_ante_data_confidentiality": "OK",
        "ex_ante_data_availability": "OK",
        "ex_ante_data_location": "OK",
        "ex_ante_provider_location": "OK",
        "ex_ante_ict_concentration": "OK",
        "ex_ante_assessment_date": "2025-10-15",
        "assessment_phase": "Průběžná",
        "due_diligence_state": "Dokončeno s výhradami",
        "last_monitoring_date": "2026-05-01",
        "significance_authorization_conditions": "Ne",
        "significance_regulatory_requirements": "Ano",
        "significance_service_quality": "Nerelevantní",
        "significance_financial_impact": "Ne",
        "significance_reputation_continuity": "Ne",
        "significance_cumulative_impact": "Ne",
        "significance_justification": "Regulatorní požadavky dle DORA.",
        # G·STAV A POZNÁMKY
        "note": "Poznámka k dodavateli.",
        "reference_occurrence_count": 12,
        "reference_process_count": 3,
    }


@pytest.mark.asyncio
async def test_vendor_register_extension_fields_round_trip(
    client_factory, test_user_cro: User, test_department: Department
):
    """AC: Vendor carries the LEI/EUID identifier (type + value) and its register extension fields."""
    extension = _vendor_register_extension_payload()
    async with client_factory(user=test_user_cro) as client:
        created = await client.post(
            "/api/v1/vendors",
            json=_vendor_payload(
                department_id=test_department.id, owner_user_id=test_user_cro.id, **extension
            ),
        )
        assert created.status_code == 201, created.text
        body = created.json()
        for field, expected in extension.items():
            assert body[field] == expected, f"{field}: {body.get(field)!r} != {expected!r}"

        fetched = await client.get(f"/api/v1/vendors/{body['id']}")
        assert fetched.status_code == 200
        for field, expected in extension.items():
            assert fetched.json()[field] == expected, field

        # The LEI identifier type is a TypKodu value like any other.
        patched = await client.patch(
            f"/api/v1/vendors/{body['id']}",
            json={"identifier_type": "LEI", "identifier_value": "969500KN90DZLEVQ2X21"},
        )
        assert patched.status_code == 200, patched.text
        assert patched.json()["identifier_type"] == "LEI"
        assert patched.json()["identifier_value"] == "969500KN90DZLEVQ2X21"

        # A vendor created without register fields leaves them all null.
        bare = await _create_vendor(
            client, department_id=test_department.id, owner_user_id=test_user_cro.id, name="Bez registru"
        )
        for field in extension:
            if field == "replaceability":
                continue
            assert bare[field] is None, field

        # Vendor writes stay tolerant of unknown keys (unlike Contract writes).
        tolerant = await client.post(
            "/api/v1/vendors",
            json=_vendor_payload(
                department_id=test_department.id,
                owner_user_id=test_user_cro.id,
                name="Tolerantní",
                status="active",
            ),
        )
        assert tolerant.status_code == 201, tolerant.text


@pytest.mark.asyncio
async def test_vendor_register_coded_fields_enforce_workbook_closed_lists(
    client_factory, test_user_cro: User, test_department: Department
):
    cases = {
        "person_type": ("Fyzická osoba podnikající", "Sdružení"),
        "identifier_type": ("EUID", "DIČ"),
        "data_sensitivity": ("Nízká", "Extrémní"),
        "substitutability_reason": ("Obtížná migrace", "Cena"),
        "exit_plan_state": ("Schválen", "Neexistuje"),
        "reintegration": ("Snadná", "Nemožná"),
        "service_disruption_impact": ("Neposouzeno", "Kritický"),
        "alternative_providers": ("Neposouzeno", "Možná"),
        "ctpp_designation": ("Neurčeno", "Částečně"),
        "ex_ante_operational": ("Nerelevantní", "Vysoké"),
        "ex_ante_ict_concentration": ("Riziko", "Střední"),
        "assessment_phase": ("Ex ante", "Roční"),
        "due_diligence_state": ("Probíhá", "Odloženo"),
        "significance_cumulative_impact": ("Nerelevantní", "Neposouzeno"),
    }
    async with client_factory(user=test_user_cro) as client:
        for field, (valid, invalid) in cases.items():
            ok = await client.post(
                "/api/v1/vendors",
                json=_vendor_payload(
                    department_id=test_department.id, owner_user_id=test_user_cro.id, **{field: valid}
                ),
            )
            assert ok.status_code == 201, f"{field}={valid!r} rejected: {ok.text}"
            assert ok.json()[field] == valid

            rejected = await client.post(
                "/api/v1/vendors",
                json=_vendor_payload(
                    department_id=test_department.id, owner_user_id=test_user_cro.id, **{field: invalid}
                ),
            )
            assert rejected.status_code == 422, f"{field}={invalid!r} accepted"

        # PATCH enforces the same lists, and counts are non-negative integers.
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        assert (
            await client.patch(f"/api/v1/vendors/{vendor['id']}", json={"identifier_type": "DIČ"})
        ).status_code == 422
        assert (
            await client.patch(f"/api/v1/vendors/{vendor['id']}", json={"reference_occurrence_count": -1})
        ).status_code == 422


@pytest.mark.asyncio
async def test_substitutability_writes_use_the_closed_four_value_list(
    client_factory, db_session: AsyncSession, test_user_cro: User, test_department: Department
):
    """AC: substitutability uses the workbook's closed four-value Substituce list.

    Writes accept exactly the four workbook values; the legacy easy/medium/hard
    vocabulary is no longer writable, but vendors stored with it stay readable
    untouched (no data migration).
    """
    from app.models import Vendor

    async with client_factory(user=test_user_cro) as client:
        for value in (
            "Nenahraditelný",
            "Velmi obtížně nahraditelný",
            "Středně obtížně nahraditelný",
            "Snadno nahraditelný",
        ):
            resp = await client.post(
                "/api/v1/vendors",
                json=_vendor_payload(
                    department_id=test_department.id,
                    owner_user_id=test_user_cro.id,
                    replaceability=value,
                ),
            )
            assert resp.status_code == 201, f"{value!r} rejected: {resp.text}"
            assert resp.json()["replaceability"] == value

        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        for legacy in ("easy", "medium", "hard", "Nahraditelný"):
            create_resp = await client.post(
                "/api/v1/vendors",
                json=_vendor_payload(
                    department_id=test_department.id,
                    owner_user_id=test_user_cro.id,
                    replaceability=legacy,
                ),
            )
            assert create_resp.status_code == 422, f"{legacy!r} accepted on create"
            patch_resp = await client.patch(
                f"/api/v1/vendors/{vendor['id']}", json={"replaceability": legacy}
            )
            assert patch_resp.status_code == 422, f"{legacy!r} accepted on update"

        # Clearing the input stays possible.
        cleared = await client.patch(f"/api/v1/vendors/{vendor['id']}", json={"replaceability": None})
        assert cleared.status_code == 200
        assert cleared.json()["replaceability"] is None

    # A vendor stored before the register extension keeps its legacy value readable.
    legacy_vendor = Vendor(
        name="Legacy dodavatel",
        process="IT",
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user_cro.id,
        replaceability="easy",
    )
    db_session.add(legacy_vendor)
    await db_session.commit()
    legacy_vendor_id = legacy_vendor.id

    async with client_factory(user=test_user_cro) as client:
        fetched = await client.get(f"/api/v1/vendors/{legacy_vendor_id}")
        assert fetched.status_code == 200
        assert fetched.json()["replaceability"] == "easy"

        # Updating an unrelated field never touches the stored legacy value.
        renamed = await client.patch(
            f"/api/v1/vendors/{legacy_vendor_id}", json={"website": "https://legacy.example"}
        )
        assert renamed.status_code == 200
        assert renamed.json()["replaceability"] == "easy"


@pytest.mark.asyncio
async def test_risk_manager_seed_grants_full_contract_maintenance(
    client_factory, test_user_cro: User, test_department: Department, test_user_seeded_risk_manager: User
):
    """Maintenance goes to the risk_manager role via the RBAC seed (CRO wildcard aside)."""
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)

    async with client_factory(user=test_user_seeded_risk_manager) as client:
        contracts_url = f"/api/v1/vendors/{vendor['id']}/contracts"
        created = await client.post(contracts_url, json=_full_contract_payload())
        assert created.status_code == 201, created.text
        contract_id = created.json()["id"]
        assert created.json()["capabilities"] == {
            "can_read": True,
            "can_update": True,
            "can_archive": True,
            "can_restore": False,
        }

        assert (
            await client.patch(f"{contracts_url}/{contract_id}", json={"currency": "EUR"})
        ).status_code == 200
        assert (await client.delete(f"{contracts_url}/{contract_id}")).status_code == 204
        assert (await client.post(f"{contracts_url}/{contract_id}/restore")).status_code == 200

        # The Vendor payload projects the contract-section gates.
        vendor_detail = (await client.get(f"/api/v1/vendors/{vendor['id']}")).json()
        assert vendor_detail["capabilities"]["can_view_contracts"] is True
        assert vendor_detail["capabilities"]["can_manage_contracts"] is True


@pytest.mark.asyncio
async def test_employee_reads_contracts_but_cannot_maintain_them(
    client_factory, test_user_cro: User, test_department: Department, test_user_employee: User
):
    """Reads follow vendors:read holders (conftest employee gains vendor_contracts:read)."""
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        contracts_url = f"/api/v1/vendors/{vendor['id']}/contracts"
        seeded = (await client.post(contracts_url, json=_minimal_contract_payload())).json()

    async with client_factory(user=test_user_employee) as client:
        listing = await client.get(contracts_url)
        assert listing.status_code == 200
        row = next(item for item in listing.json() if item["id"] == seeded["id"])
        assert row["capabilities"] == {
            "can_read": True,
            "can_update": False,
            "can_archive": False,
            "can_restore": False,
        }

        vendor_detail = (await client.get(f"/api/v1/vendors/{vendor['id']}")).json()
        assert vendor_detail["capabilities"]["can_view_contracts"] is True
        assert vendor_detail["capabilities"]["can_manage_contracts"] is False

        # Every maintenance verb is denied.
        assert (await client.post(contracts_url, json=_minimal_contract_payload())).status_code == 403
        assert (
            await client.patch(f"{contracts_url}/{seeded['id']}", json={"note": "x"})
        ).status_code == 403
        assert (await client.delete(f"{contracts_url}/{seeded['id']}")).status_code == 403
        assert (await client.post(f"{contracts_url}/{seeded['id']}/restore")).status_code == 403


@pytest.mark.asyncio
async def test_platform_admin_is_excluded_and_unauthenticated_is_rejected(
    client_factory, test_user_cro: User, test_department: Department, test_user_platform_admin: User
):
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        contracts_url = f"/api/v1/vendors/{vendor['id']}/contracts"
        seeded = (await client.post(contracts_url, json=_minimal_contract_payload())).json()

    paths_and_calls = [
        ("get", contracts_url, None),
        ("post", contracts_url, _minimal_contract_payload()),
        ("patch", f"{contracts_url}/{seeded['id']}", {"note": "x"}),
        ("delete", f"{contracts_url}/{seeded['id']}", None),
        ("post", f"{contracts_url}/{seeded['id']}/restore", None),
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
async def test_contract_mutations_land_on_the_audit_trail(
    client_factory, test_user_cro: User, test_department: Department
):
    """Register mutations are attributable via the activity log (spec story 39)."""
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        contracts_url = f"/api/v1/vendors/{vendor['id']}/contracts"
        created = (await client.post(contracts_url, json=_minimal_contract_payload())).json()
        await client.patch(f"{contracts_url}/{created['id']}", json={"arrangement_type": "Samostatné"})
        await client.delete(f"{contracts_url}/{created['id']}")
        await client.post(f"{contracts_url}/{created['id']}/restore")

        log = await client.get(
            "/api/v1/activity-log",
            params={"entity_type": "vendor_contract", "entity_id": created["id"]},
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
        if entry["action"] == "update" and "arrangement_type" in (entry["changes"] or {})
    )
    assert update_entry["changes"]["arrangement_type"]["new"] == "[REDACTED]"

    archive_entry = next(entry for entry in entries if entry["action"] == "archive")
    assert archive_entry["changes"]["is_archived"]["new"] is True


def test_rbac_seed_grants_follow_the_pm_matrix():
    """risk_manager holds vendor_contracts:*; every vendors:read holder gains
    vendor_contracts:read; the platform admin role stays excluded; nobody but
    risk_manager (and the CRO wildcard) writes."""
    grants = {
        role: {key for key in expand_permission_keys(keys) if key.startswith("vendor_contracts:")}
        for role, keys in RBAC_ROLE_PERMISSIONS.items()
    }
    assert grants["risk_manager"] == {"vendor_contracts:read", "vendor_contracts:write"}
    assert grants["admin"] == set()
    assert grants["cro"] >= {"vendor_contracts:read", "vendor_contracts:write"}
    for role, role_grants in grants.items():
        if role in ("risk_manager", "cro"):
            continue
        vendors_read = "vendors:read" in expand_permission_keys(RBAC_ROLE_PERMISSIONS[role])
        expected = {"vendor_contracts:read"} if vendors_read else set()
        assert role_grants == expected, f"{role}: {role_grants}"


def test_vendor_contract_migrations_follow_repo_convention_and_are_forward_only():
    """Both migrations ship per repo convention (ADR-010, non-negotiable).

    ``<rev>_add_vendor_contracts.py`` creates the vendor_contracts table plus
    the new vendor register columns and is forward-only;
    ``<rev>_sync_vendor_contract_permissions_for_existing_dbs.py`` idempotently
    backfills deployed DBs and mirrors the RBAC seed exactly — including the
    retirement of the reserved-era compliance write grant. Precedent:
    q4r5s6t7u8v9 (processes) and s6t7u8v9w0x1 (assets).
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

    add_contracts = load_migration("t7u8v9w0x1y2_add_vendor_contracts.py", "add_vendor_contracts_migration")
    # Chained onto the asset permission sync; single head is preserved.
    assert add_contracts.down_revision == "s6t7u8v9w0x1"
    with pytest.raises(NotImplementedError):
        add_contracts.downgrade()

    # The vendor register extension rides in the same forward-only migration.
    migration_source = (versions_dir / "t7u8v9w0x1y2_add_vendor_contracts.py").read_text(encoding="utf-8")
    assert 'op.create_table(\n        "vendor_contracts"' in migration_source
    for column in ("identifier_type", "identifier_value", "exit_plan_state", "reference_process_count"):
        assert f'sa.Column("{column}"' in migration_source, column
    # Substituce values exceed the legacy String(20): the column is widened, never rewritten.
    assert '"replaceability"' in migration_source
    assert "UPDATE vendors" not in migration_source

    sync = load_migration(
        "u8v9w0x1y2z3_sync_vendor_contract_permissions_for_existing_dbs.py",
        "vendor_contract_permission_sync_migration",
    )
    assert sync.down_revision == "t7u8v9w0x1y2"

    # The ensured permission rows are verbatim seed-contract rows.
    for permission in sync.VENDOR_CONTRACT_PERMISSIONS:
        key = f"{permission['resource']}:{permission['action']}"
        assert PERMISSION_BY_KEY[key]["description"] == permission["description"], key
    assert {f"{p['resource']}:{p['action']}" for p in sync.VENDOR_CONTRACT_PERMISSIONS} == {
        "vendor_contracts:read",
        "vendor_contracts:write",
    }

    # Role grants mirror the seed exactly: risk_manager holds
    # vendor_contracts:*; every role holding vendors:read gains
    # vendor_contracts:read.
    seed_contract_grants = {
        role_name: {
            key for key in expand_permission_keys(permission_keys) if key.startswith("vendor_contracts:")
        }
        for role_name, permission_keys in RBAC_ROLE_PERMISSIONS.items()
        if role_name != "cro"  # CRO holds the wildcard; the migration re-ensures it explicitly
    }
    seed_contract_grants = {role: keys for role, keys in seed_contract_grants.items() if keys}
    migration_grants = {role: set(keys) for role, keys in sync.ROLE_VENDOR_CONTRACT_GRANTS.items()}
    assert migration_grants == seed_contract_grants

    # The reserved-era seed granted compliance vendor_contracts:*; the seed now
    # grants read only, and the sync retires exactly that stale write grant.
    assert sync.RETIRED_ROLE_GRANTS == {"compliance": ("vendor_contracts:write",)}

    with pytest.raises(NotImplementedError):
        sync.downgrade()
