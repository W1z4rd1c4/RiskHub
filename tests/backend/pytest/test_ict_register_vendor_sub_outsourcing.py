"""ICT Register Sub-outsourcing chains under Vendor (issue #45).

Behavior under test, at the HTTP seam via ``client_factory``:
- a Risk Manager maintains a Vendor's fourth-party supply chain: Sub-outsourcing
  entries carrying the workbook's entered 09_Subdodávky columns — the Contract
  the chain hangs off, the predecessor reference (NULL = direct sub-outsourcer
  of the Contract), the sub-provider identity (name, TypKodu identifier type +
  value, ZemeList country), the ICT service S-code, and note;
- derived 09_Subdodávky columns (Rank, contract/vendor/name lookups, the
  critical-service lookup, the duplicate/chain-error check, hidden helpers —
  ticket #49) are rejected on write;
- coded fields are enforced against the workbook closed lists (TypKodu,
  ZemeList) and the S01-S19 ICT service taxonomy;
- chain integrity is a write-time rule the #49 Rank recursion relies on:
  the Contract must belong to the parent Vendor, the predecessor must belong
  to the same Vendor and the same Contract, and self-references and cycles
  are rejected 422 — while an ARCHIVED predecessor may exist (chain-break
  flagging is #49's job);
- entries belong to exactly one Vendor; mutations on entries of an ARCHIVED
  Vendor conflict (409); archived entries reject edits (409) and double
  archive (400) per the register's strict archived-end stance;
- authorization reuses the ``vendor_contracts`` resource (Sub-outsourcing is
  the same governed surface: the fourth-party contract chain) — no new
  permission rows, maintenance per the RBAC seed (risk_manager + CRO
  wildcard), reads follow vendors:read holders, platform admins are excluded,
  and mutations land on the audit trail;
- the add migration ships per repo convention (forward-only, FK indexes) and
  no permission-sync migration exists.

Field inventory source: docs/dora-ict-register/dora-excel-functional-spec.md
section 1.5 (09_Subdodávky). Expected values are spec literals.
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
        email="seeded.rm.sub@test.com",
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


async def _create_contract(client, vendor_id: int, **overrides: object) -> dict:
    payload: dict[str, object] = {"contract_reference": "SML-2020-001"}
    payload.update(overrides)
    response = await client.post(f"/api/v1/vendors/{vendor_id}/contracts", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _minimal_entry_payload(contract_id: int, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {"contract_id": contract_id}
    payload.update(overrides)
    return payload


def _full_entry_payload(contract_id: int, **overrides: object) -> dict[str, object]:
    """Every entered 09_Subdodávky column (spec section 1.5), sub-provider identity inline."""
    payload: dict[str, object] = {
        "contract_id": contract_id,
        "predecessor_id": None,
        "sub_provider_name": "CLOUD OPS s.r.o.",
        "identifier_type": "IČO (CRN)",
        "identifier_value": "87654321",
        "country": "CZ",
        "ict_service_code": "S17",
        "note": "Poznámka.",
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_create_and_read_direct_entry_with_all_entered_fields(
    client_factory, test_user_cro: User, test_department: Department
):
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        contract = await _create_contract(client, vendor["id"])
        chain_url = f"/api/v1/vendors/{vendor['id']}/sub-outsourcing"

        created = await client.post(chain_url, json=_full_entry_payload(contract["id"]))
        assert created.status_code == 201, created.text
        body = created.json()
        assert body["id"] > 0
        assert body["vendor_id"] == vendor["id"]
        assert body["contract_id"] == contract["id"]
        # NULL predecessor = a direct sub-outsourcer of the Contract.
        assert body["predecessor_id"] is None
        assert body["sub_provider_name"] == "CLOUD OPS s.r.o."
        assert body["identifier_type"] == "IČO (CRN)"
        assert body["identifier_value"] == "87654321"
        assert body["country"] == "CZ"
        assert body["ict_service_code"] == "S17"
        assert body["note"] == "Poznámka."
        assert body["is_archived"] is False

        # Readable as the Vendor's chain collection.
        listed = await client.get(chain_url)
        assert listed.status_code == 200
        assert [row["id"] for row in listed.json()] == [body["id"]]
        assert listed.json()[0]["sub_provider_name"] == "CLOUD OPS s.r.o."

        # A minimal entry leaves every optional column null.
        minimal = await client.post(chain_url, json=_minimal_entry_payload(contract["id"]))
        assert minimal.status_code == 201, minimal.text
        minimal_body = minimal.json()
        assert minimal_body["predecessor_id"] is None
        assert minimal_body["sub_provider_name"] is None
        assert minimal_body["identifier_type"] is None
        assert minimal_body["identifier_value"] is None
        assert minimal_body["country"] is None
        assert minimal_body["ict_service_code"] is None
        assert minimal_body["note"] is None

        # Every chain hangs off a Contract: the reference is required...
        assert (await client.post(chain_url, json={})).status_code == 422
        assert (await client.post(chain_url, json={"contract_id": None})).status_code == 422
        # ...must exist...
        assert (await client.post(chain_url, json=_minimal_entry_payload(999999))).status_code == 422
        # ...and must belong to THIS Vendor.
        other_vendor = await _create_vendor(
            client, department_id=test_department.id, owner_user_id=test_user_cro.id, name="Druhý dodavatel"
        )
        foreign_contract = await _create_contract(client, other_vendor["id"], contract_reference="SML-2021-007")
        assert (
            await client.post(chain_url, json=_minimal_entry_payload(foreign_contract["id"]))
        ).status_code == 422

        # Unknown parents 404 on both verbs.
        assert (
            await client.post("/api/v1/vendors/999999/sub-outsourcing", json=_minimal_entry_payload(contract["id"]))
        ).status_code == 404
        assert (await client.get("/api/v1/vendors/999999/sub-outsourcing")).status_code == 404


@pytest.mark.asyncio
async def test_deeper_entries_chain_off_predecessors_and_list_at_full_depth(
    client_factory, test_user_cro: User, test_department: Department
):
    """The chain lists from the Vendor end with the structure for a full-depth render.

    Rank itself is derived by the engine (#49); this slice persists the
    structure — contract + predecessor references — the recursion runs on.
    """
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        contract = await _create_contract(client, vendor["id"])
        second_contract = await _create_contract(client, vendor["id"], contract_reference="SML-2021-007")
        chain_url = f"/api/v1/vendors/{vendor['id']}/sub-outsourcing"

        # Direct sub-outsourcer of the Contract (future rank 2)...
        direct = (
            await client.post(
                chain_url, json=_full_entry_payload(contract["id"], sub_provider_name="CLOUD OPS s.r.o.")
            )
        ).json()
        # ...a deeper link under it (future rank 3)...
        deeper = await client.post(
            chain_url,
            json=_full_entry_payload(
                contract["id"],
                predecessor_id=direct["id"],
                sub_provider_name="DC HOSTING GmbH",
                identifier_type="LEI",
                identifier_value="529900T8BM49AURSDO55",
                country="DE",
                ict_service_code="S07",
            ),
        )
        assert deeper.status_code == 201, deeper.text
        deeper_body = deeper.json()
        assert deeper_body["predecessor_id"] == direct["id"]
        assert deeper_body["contract_id"] == contract["id"]
        assert deeper_body["sub_provider_name"] == "DC HOSTING GmbH"
        assert deeper_body["country"] == "DE"

        # ...and a third tier under THAT (unlimited depth, no cap).
        third = await client.post(
            chain_url,
            json=_minimal_entry_payload(
                contract["id"], predecessor_id=deeper_body["id"], sub_provider_name="Fiber Networks a.s."
            ),
        )
        assert third.status_code == 201, third.text

        # A second chain hangs off the second Contract independently.
        other_chain_root = (
            await client.post(
                chain_url,
                json=_minimal_entry_payload(second_contract["id"], sub_provider_name="Print Services s.r.o."),
            )
        ).json()

        # One collection read carries the whole forest: every entry with its
        # contract and predecessor references, so the client can group by
        # Contract and walk predecessor_id to full depth.
        listed = (await client.get(chain_url)).json()
        by_id = {row["id"]: row for row in listed}
        assert set(by_id) == {direct["id"], deeper_body["id"], third.json()["id"], other_chain_root["id"]}
        assert by_id[direct["id"]]["predecessor_id"] is None
        assert by_id[deeper_body["id"]]["predecessor_id"] == direct["id"]
        assert by_id[third.json()["id"]]["predecessor_id"] == deeper_body["id"]
        assert by_id[other_chain_root["id"]]["predecessor_id"] is None
        assert by_id[other_chain_root["id"]]["contract_id"] == second_contract["id"]


@pytest.mark.asyncio
async def test_predecessor_must_belong_to_the_same_vendor_and_contract(
    client_factory, test_user_cro: User, test_department: Department
):
    """Write-time chain integrity: predecessors stay inside one Vendor + Contract."""
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        contract = await _create_contract(client, vendor["id"])
        second_contract = await _create_contract(client, vendor["id"], contract_reference="SML-2021-007")
        chain_url = f"/api/v1/vendors/{vendor['id']}/sub-outsourcing"
        direct = (await client.post(chain_url, json=_minimal_entry_payload(contract["id"]))).json()

        # A predecessor that does not exist is rejected.
        assert (
            await client.post(chain_url, json=_minimal_entry_payload(contract["id"], predecessor_id=999999))
        ).status_code == 422

        # A predecessor from ANOTHER Contract of the same Vendor is rejected:
        # chains never cross Contract boundaries.
        assert (
            await client.post(
                chain_url, json=_minimal_entry_payload(second_contract["id"], predecessor_id=direct["id"])
            )
        ).status_code == 422

        # A predecessor from another Vendor's chain is rejected.
        other_vendor = await _create_vendor(
            client, department_id=test_department.id, owner_user_id=test_user_cro.id, name="Druhý dodavatel"
        )
        other_contract = await _create_contract(client, other_vendor["id"], contract_reference="SML-2022-003")
        other_entry = (
            await client.post(
                f"/api/v1/vendors/{other_vendor['id']}/sub-outsourcing",
                json=_minimal_entry_payload(other_contract["id"]),
            )
        ).json()
        assert (
            await client.post(
                chain_url, json=_minimal_entry_payload(contract["id"], predecessor_id=other_entry["id"])
            )
        ).status_code == 422

        # The same rules hold on PATCH...
        deeper = (
            await client.post(chain_url, json=_minimal_entry_payload(contract["id"], predecessor_id=direct["id"]))
        ).json()
        assert (
            await client.patch(f"{chain_url}/{deeper['id']}", json={"predecessor_id": 999999})
        ).status_code == 422
        assert (
            await client.patch(f"{chain_url}/{deeper['id']}", json={"predecessor_id": other_entry["id"]})
        ).status_code == 422
        # ...including moving an entry to a Contract its predecessor is not on...
        assert (
            await client.patch(f"{chain_url}/{deeper['id']}", json={"contract_id": second_contract["id"]})
        ).status_code == 422
        # ...while clearing the predecessor makes the entry a direct sub-outsourcer again.
        cleared = await client.patch(f"{chain_url}/{deeper['id']}", json={"predecessor_id": None})
        assert cleared.status_code == 200
        assert cleared.json()["predecessor_id"] is None
        moved = await client.patch(f"{chain_url}/{deeper['id']}", json={"contract_id": second_contract["id"]})
        assert moved.status_code == 200
        assert moved.json()["contract_id"] == second_contract["id"]


@pytest.mark.asyncio
async def test_self_references_and_cycles_are_rejected(
    client_factory, test_user_cro: User, test_department: Department
):
    """Cycle-freeness is the write-time invariant the #49 Rank recursion relies on."""
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        contract = await _create_contract(client, vendor["id"])
        chain_url = f"/api/v1/vendors/{vendor['id']}/sub-outsourcing"

        a = (await client.post(chain_url, json=_minimal_entry_payload(contract["id"]))).json()
        b = (
            await client.post(chain_url, json=_minimal_entry_payload(contract["id"], predecessor_id=a["id"]))
        ).json()
        c = (
            await client.post(chain_url, json=_minimal_entry_payload(contract["id"], predecessor_id=b["id"]))
        ).json()

        # Self-reference is rejected outright.
        assert (
            await client.patch(f"{chain_url}/{a['id']}", json={"predecessor_id": a["id"]})
        ).status_code == 422

        # A -> B -> C: pointing A at C (or at B) would close a cycle.
        assert (
            await client.patch(f"{chain_url}/{a['id']}", json={"predecessor_id": c["id"]})
        ).status_code == 422
        assert (
            await client.patch(f"{chain_url}/{a['id']}", json={"predecessor_id": b["id"]})
        ).status_code == 422

        # Nothing changed: A is still the chain root.
        listed = (await client.get(chain_url)).json()
        by_id = {row["id"]: row for row in listed}
        assert by_id[a["id"]]["predecessor_id"] is None
        assert by_id[b["id"]]["predecessor_id"] == a["id"]
        assert by_id[c["id"]]["predecessor_id"] == b["id"]

        # Re-pointing C directly under A is a legal re-chain, not a cycle.
        rechained = await client.patch(f"{chain_url}/{c['id']}", json={"predecessor_id": a["id"]})
        assert rechained.status_code == 200
        assert rechained.json()["predecessor_id"] == a["id"]


# Derived 09_Subdodávky columns (spec section 1.5) arrive with the derivation
# engine (ticket #49) and must never be writable: the Rank recursion (I), the
# contract-reference lookup (C), the contract's-vendor lookup (D), the
# critical-service lookup (J), the duplicate/chain-error check (K), and the
# hidden key/duplicity/RoI-scope/exists helpers (M/N/O/P/Q). The vendor FK is
# the URL parent, never a payload column.
DERIVED_SUB_OUTSOURCING_WRITES: dict[str, object] = {
    "rank": 2,
    "contract_reference": "SML-2020-001",
    "contract_vendor_name": "BIZ DATA",
    "critical_service": "Ano",
    "chain_check": "CHYBA ŘETĚZCE",
    "duplicate_check": "DUPLICITA",
    "helper_key": "SML-1|DOD-2",
    "roi_scope_helper": "Ano",
    "predecessor_exists_helper": 1,
    "vendor_id": 1,
}


@pytest.mark.asyncio
async def test_writes_that_include_derived_columns_are_rejected(
    client_factory, test_user_cro: User, test_department: Department
):
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        contract = await _create_contract(client, vendor["id"])
        chain_url = f"/api/v1/vendors/{vendor['id']}/sub-outsourcing"
        existing = (await client.post(chain_url, json=_minimal_entry_payload(contract["id"]))).json()

        for field, value in DERIVED_SUB_OUTSOURCING_WRITES.items():
            create_resp = await client.post(
                chain_url, json=_minimal_entry_payload(contract["id"], **{field: value})
            )
            assert create_resp.status_code == 422, f"POST accepted derived column {field}"

            patch_resp = await client.patch(f"{chain_url}/{existing['id']}", json={field: value})
            assert patch_resp.status_code == 422, f"PATCH accepted derived column {field}"

        # The register did not silently change.
        unchanged = await client.get(chain_url)
        assert [row["id"] for row in unchanged.json()] == [existing["id"]]


@pytest.mark.asyncio
async def test_coded_columns_are_enforced_against_closed_lists_and_taxonomy(
    client_factory, test_user_cro: User, test_department: Department
):
    """TypKodu and ZemeList are workbook closed lists; the S-code comes from S01-S19."""
    cases = {
        "identifier_type": ("LEI", "DIČ"),
        "country": ("SK", "XX"),
        "ict_service_code": ("S19", "S20"),
    }
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        contract = await _create_contract(client, vendor["id"])
        chain_url = f"/api/v1/vendors/{vendor['id']}/sub-outsourcing"

        for field, (valid, invalid) in cases.items():
            ok = await client.post(chain_url, json=_minimal_entry_payload(contract["id"], **{field: valid}))
            assert ok.status_code == 201, f"{field}={valid!r} rejected: {ok.text}"
            assert ok.json()[field] == valid

            rejected = await client.post(
                chain_url, json=_minimal_entry_payload(contract["id"], **{field: invalid})
            )
            assert rejected.status_code == 422, f"{field}={invalid!r} accepted"

        # Closed lists are verbatim and case-sensitive ("lei"/"s17" are not values).
        assert (
            await client.post(chain_url, json=_minimal_entry_payload(contract["id"], identifier_type="lei"))
        ).status_code == 422
        assert (
            await client.post(chain_url, json=_minimal_entry_payload(contract["id"], ict_service_code="s17"))
        ).status_code == 422

        # PATCH enforces the same lists.
        created = (await client.post(chain_url, json=_minimal_entry_payload(contract["id"]))).json()
        assert (
            await client.patch(f"{chain_url}/{created['id']}", json={"country": "Deutschland"})
        ).status_code == 422
        patched_ok = await client.patch(f"{chain_url}/{created['id']}", json={"country": "DE"})
        assert patched_ok.status_code == 200
        assert patched_ok.json()["country"] == "DE"


@pytest.mark.asyncio
async def test_archive_restore_lifecycle_and_archived_predecessors_may_exist(
    client_factory, test_user_cro: User, test_department: Department
):
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        contract = await _create_contract(client, vendor["id"])
        chain_url = f"/api/v1/vendors/{vendor['id']}/sub-outsourcing"
        keep = (await client.post(chain_url, json=_minimal_entry_payload(contract["id"]))).json()
        gone = (
            await client.post(chain_url, json=_minimal_entry_payload(contract["id"], predecessor_id=keep["id"]))
        ).json()
        successor = (
            await client.post(chain_url, json=_minimal_entry_payload(contract["id"], predecessor_id=gone["id"]))
        ).json()

        # Archive hides the row from the default collection...
        assert (await client.delete(f"{chain_url}/{gone['id']}")).status_code == 204
        assert [row["id"] for row in (await client.get(chain_url)).json()] == [keep["id"], successor["id"]]

        # ...while its successor keeps pointing at it: the broken chain is a
        # #49 chain-error finding, never a cascade or a write block here.
        with_archived = (await client.get(chain_url, params={"include_archived": True})).json()
        assert [row["id"] for row in with_archived] == [keep["id"], gone["id"], successor["id"]]
        archived_row = next(row for row in with_archived if row["id"] == gone["id"])
        successor_row = next(row for row in with_archived if row["id"] == successor["id"])
        assert archived_row["is_archived"] is True
        assert archived_row["archived_by_id"] is not None
        assert successor_row["predecessor_id"] == gone["id"]
        assert archived_row["capabilities"]["can_restore"] is True
        assert archived_row["capabilities"]["can_update"] is False
        assert archived_row["capabilities"]["can_archive"] is False

        # Archived entries cannot be edited (409) or re-archived (400).
        assert (await client.patch(f"{chain_url}/{gone['id']}", json={"note": "x"})).status_code == 409
        assert (await client.delete(f"{chain_url}/{gone['id']}")).status_code == 400

        # An ARCHIVED predecessor may even be referenced by a new entry.
        onto_archived = await client.post(
            chain_url, json=_minimal_entry_payload(contract["id"], predecessor_id=gone["id"])
        )
        assert onto_archived.status_code == 201, onto_archived.text

        # Restore brings the row back; restoring an active row is rejected.
        restored = await client.post(f"{chain_url}/{gone['id']}/restore")
        assert restored.status_code == 200
        assert restored.json()["is_archived"] is False
        assert restored.json()["archived_at"] is None
        assert (await client.post(f"{chain_url}/{gone['id']}/restore")).status_code == 400
        assert len((await client.get(chain_url)).json()) == 4

        # Missing rows 404 on the lifecycle routes too.
        assert (await client.delete(f"{chain_url}/999999")).status_code == 404
        assert (await client.post(f"{chain_url}/999999/restore")).status_code == 404


@pytest.mark.asyncio
async def test_entries_may_reference_an_archived_contract_of_an_active_vendor(
    client_factory, test_user_cro: User, test_department: Department
):
    """DEFER-TO-#49 (PM-adjudicated): an archived Contract stays referencable.

    Deliberate divergence from the #43 asset-links precedent (which 409s on
    archived link targets): on this surface only the archived VENDOR freezes
    chain writes. A chain hanging off a soft-archived Contract is the
    derivation engine's territory — #49's CHYBA ŘETĚZCE / DQ findings —
    mirroring the archived-predecessor stance and the workbook's
    flag-don't-prevent philosophy.
    """
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        archived_contract = await _create_contract(client, vendor["id"])
        active_contract = await _create_contract(client, vendor["id"], contract_reference="SML-2021-007")
        chain_url = f"/api/v1/vendors/{vendor['id']}/sub-outsourcing"
        movable = (await client.post(chain_url, json=_minimal_entry_payload(active_contract["id"]))).json()

        archived = await client.delete(f"/api/v1/vendors/{vendor['id']}/contracts/{archived_contract['id']}")
        assert archived.status_code == 204

        # A NEW entry may hang off the archived Contract (the Vendor is active)...
        onto_archived = await client.post(chain_url, json=_minimal_entry_payload(archived_contract["id"]))
        assert onto_archived.status_code == 201, onto_archived.text
        assert onto_archived.json()["contract_id"] == archived_contract["id"]

        # ...and an existing entry may be MOVED onto it: same integrity family,
        # same #49 deferral.
        moved = await client.patch(
            f"{chain_url}/{movable['id']}", json={"contract_id": archived_contract["id"]}
        )
        assert moved.status_code == 200, moved.text
        assert moved.json()["contract_id"] == archived_contract["id"]


@pytest.mark.asyncio
async def test_archived_vendor_conflicts_every_mutation_but_stays_readable(
    client_factory, test_user_cro: User, test_department: Department
):
    """The register's strict archived-end stance: an archived Vendor freezes its chain."""
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        contract = await _create_contract(client, vendor["id"])
        chain_url = f"/api/v1/vendors/{vendor['id']}/sub-outsourcing"
        active = (await client.post(chain_url, json=_minimal_entry_payload(contract["id"]))).json()
        archived = (
            await client.post(chain_url, json=_minimal_entry_payload(contract["id"]))
        ).json()
        assert (await client.delete(f"{chain_url}/{archived['id']}")).status_code == 204

        assert (await client.delete(f"/api/v1/vendors/{vendor['id']}")).status_code in (200, 204)

        # Entries stay readable on an archived Vendor...
        rows = (await client.get(chain_url, params={"include_archived": True})).json()
        assert {row["id"] for row in rows} == {active["id"], archived["id"]}
        # ...with every mutation capability off...
        for row in rows:
            assert row["capabilities"]["can_update"] is False
            assert row["capabilities"]["can_archive"] is False
            assert row["capabilities"]["can_restore"] is False

        # ...and every mutation verb conflicts until the Vendor is restored.
        assert (await client.post(chain_url, json=_minimal_entry_payload(contract["id"]))).status_code == 409
        assert (await client.patch(f"{chain_url}/{active['id']}", json={"note": "x"})).status_code == 409
        assert (await client.delete(f"{chain_url}/{active['id']}")).status_code == 409
        assert (await client.post(f"{chain_url}/{archived['id']}/restore")).status_code == 409

        # Restoring the Vendor unfreezes chain maintenance.
        assert (await client.post(f"/api/v1/vendors/{vendor['id']}/restore")).status_code == 200
        assert (
            await client.patch(f"{chain_url}/{active['id']}", json={"note": "po obnovení"})
        ).status_code == 200
        assert (await client.post(f"{chain_url}/{archived['id']}/restore")).status_code == 200


@pytest.mark.asyncio
async def test_risk_manager_seed_grants_full_chain_maintenance(
    client_factory, test_user_cro: User, test_department: Department, test_user_seeded_risk_manager: User
):
    """Sub-outsourcing reuses the vendor_contracts resource: risk_manager maintains it."""
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        contract = await _create_contract(client, vendor["id"])

    async with client_factory(user=test_user_seeded_risk_manager) as client:
        chain_url = f"/api/v1/vendors/{vendor['id']}/sub-outsourcing"
        created = await client.post(chain_url, json=_full_entry_payload(contract["id"]))
        assert created.status_code == 201, created.text
        entry_id = created.json()["id"]
        assert created.json()["capabilities"] == {
            "can_read": True,
            "can_update": True,
            "can_archive": True,
            "can_restore": False,
        }

        assert (await client.patch(f"{chain_url}/{entry_id}", json={"country": "SK"})).status_code == 200
        assert (await client.delete(f"{chain_url}/{entry_id}")).status_code == 204
        assert (await client.post(f"{chain_url}/{entry_id}/restore")).status_code == 200

        # The Vendor payload projects the section gates.
        vendor_detail = (await client.get(f"/api/v1/vendors/{vendor['id']}")).json()
        assert vendor_detail["capabilities"]["can_view_sub_outsourcing"] is True
        assert vendor_detail["capabilities"]["can_manage_sub_outsourcing"] is True


@pytest.mark.asyncio
async def test_employee_reads_the_chain_but_cannot_maintain_it(
    client_factory, test_user_cro: User, test_department: Department, test_user_employee: User
):
    """Reads follow vendors:read holders (conftest employee holds vendor_contracts:read)."""
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        contract = await _create_contract(client, vendor["id"])
        chain_url = f"/api/v1/vendors/{vendor['id']}/sub-outsourcing"
        seeded = (await client.post(chain_url, json=_minimal_entry_payload(contract["id"]))).json()

    async with client_factory(user=test_user_employee) as client:
        listing = await client.get(chain_url)
        assert listing.status_code == 200
        row = next(item for item in listing.json() if item["id"] == seeded["id"])
        assert row["capabilities"] == {
            "can_read": True,
            "can_update": False,
            "can_archive": False,
            "can_restore": False,
        }

        vendor_detail = (await client.get(f"/api/v1/vendors/{vendor['id']}")).json()
        assert vendor_detail["capabilities"]["can_view_sub_outsourcing"] is True
        assert vendor_detail["capabilities"]["can_manage_sub_outsourcing"] is False

        # Every maintenance verb is denied.
        assert (await client.post(chain_url, json=_minimal_entry_payload(contract["id"]))).status_code == 403
        assert (await client.patch(f"{chain_url}/{seeded['id']}", json={"note": "x"})).status_code == 403
        assert (await client.delete(f"{chain_url}/{seeded['id']}")).status_code == 403
        assert (await client.post(f"{chain_url}/{seeded['id']}/restore")).status_code == 403


@pytest.mark.asyncio
async def test_platform_admin_is_excluded_and_unauthenticated_is_rejected(
    client_factory, test_user_cro: User, test_department: Department, test_user_platform_admin: User
):
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        contract = await _create_contract(client, vendor["id"])
        chain_url = f"/api/v1/vendors/{vendor['id']}/sub-outsourcing"
        seeded = (await client.post(chain_url, json=_minimal_entry_payload(contract["id"]))).json()

    paths_and_calls = [
        ("get", chain_url, None),
        ("post", chain_url, _minimal_entry_payload(contract["id"])),
        ("patch", f"{chain_url}/{seeded['id']}", {"note": "x"}),
        ("delete", f"{chain_url}/{seeded['id']}", None),
        ("post", f"{chain_url}/{seeded['id']}/restore", None),
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
async def test_chain_mutations_land_on_the_audit_trail(
    client_factory, test_user_cro: User, test_department: Department
):
    """Register mutations are attributable via the activity log (spec story 39)."""
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(client, department_id=test_department.id, owner_user_id=test_user_cro.id)
        contract = await _create_contract(client, vendor["id"])
        chain_url = f"/api/v1/vendors/{vendor['id']}/sub-outsourcing"
        created = (
            await client.post(
                chain_url, json=_minimal_entry_payload(contract["id"], sub_provider_name="CLOUD OPS s.r.o.")
            )
        ).json()
        await client.patch(f"{chain_url}/{created['id']}", json={"country": "CZ"})
        await client.delete(f"{chain_url}/{created['id']}")
        await client.post(f"{chain_url}/{created['id']}/restore")

        log = await client.get(
            "/api/v1/activity-log",
            params={"entity_type": "vendor_sub_outsourcing", "entity_id": created["id"]},
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
        if entry["action"] == "update" and "country" in (entry["changes"] or {})
    )
    assert update_entry["changes"]["country"]["new"] == "[REDACTED]"

    archive_entry = next(entry for entry in entries if entry["action"] == "archive")
    assert archive_entry["changes"]["is_archived"]["new"] is True


def test_authorization_reuses_the_vendor_contracts_resource_with_no_new_permissions():
    """Sub-outsourcing is the same governed surface as Contracts (PM decision).

    The RBAC seed carries NO sub-outsourcing resource — reads are
    vendor_contracts:read, mutations vendor_contracts:write — which is why
    the slice ships without a permission-sync migration.
    """
    from app.db.rbac_seed_contract import RBAC_PERMISSIONS

    assert not any(
        "sub_outsourcing" in permission["resource"] for permission in RBAC_PERMISSIONS
    )
    for role, keys in RBAC_ROLE_PERMISSIONS.items():
        assert not any("sub_outsourcing" in key for key in expand_permission_keys(keys)), role


def test_sub_outsourcing_migration_follows_repo_convention_and_is_forward_only():
    """The add migration ships per repo convention (ADR-010, non-negotiable).

    ``<rev>_add_vendor_sub_outsourcing.py`` creates the vendor_sub_outsourcing
    table with its FK indexes, chains onto the vendor-contract permission
    sync (single head preserved), and is forward-only. No permission-sync
    migration exists — authorization reuses the vendor_contracts resource.
    Precedent: t7u8v9w0x1y2 (contracts).
    """
    import importlib.util
    from pathlib import Path

    versions_dir = Path(__file__).resolve().parents[3] / "backend/alembic/versions"

    migration_files = list(versions_dir.glob("*_add_vendor_sub_outsourcing.py"))
    assert len(migration_files) == 1, "exactly one add migration ships"
    migration_path = migration_files[0]

    spec = importlib.util.spec_from_file_location("add_vendor_sub_outsourcing_migration", migration_path)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    # Chained onto the vendor-contract permission sync; single head is preserved.
    assert migration.down_revision == "u8v9w0x1y2z3"
    with pytest.raises(NotImplementedError):
        migration.downgrade()

    migration_source = migration_path.read_text(encoding="utf-8")
    assert 'op.create_table(\n        "vendor_sub_outsourcing"' in migration_source
    for column in (
        "contract_id",
        "predecessor_id",
        "sub_provider_name",
        "identifier_type",
        "identifier_value",
        "country",
        "ict_service_code",
        "note",
    ):
        assert f'sa.Column("{column}"' in migration_source, column
    # FK indexes on every chain reference plus the archive flag.
    for index_column in ("vendor_id", "contract_id", "predecessor_id", "is_archived"):
        assert f'["{index_column}"]' in migration_source, index_column

    # No permission-sync migration exists for this slice.
    assert not list(versions_dir.glob("*sub_outsourcing_permissions*"))
