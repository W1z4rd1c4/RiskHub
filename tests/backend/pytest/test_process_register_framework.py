from __future__ import annotations

import csv
import io
import json

import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Asset,
    AssetVendorLink,
    Department,
    Process,
    ProcessAssetLink,
    ProcessVendorLink,
    Risk,
    RiskProcessLink,
    Role,
    User,
    Vendor,
)


def _process_payload(*, owner_id: int, department_id: int, l0: str, l1: str, **overrides) -> dict[str, object]:
    payload: dict[str, object] = {
        "l0_area": l0,
        "l1_process": l1,
        "process_owner_user_id": owner_id,
        "owning_department_id": department_id,
        "impact_client": 5,
        "impact_market_operations": 5,
        "impact_regulatory": 5,
        "impact_financial": 5,
        "mtpd_hours": 24,
        "cif_override": "no",
        "licensed_activity": "non_life_insurance",
        "bcm_link": "yes",
        "dr_test_result": "successful",
        "rto_hours": 8,
        "assessment_date": "2026-07-01",
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_process_shared_filters_groups_lifecycle_and_unpaged_export(
    client_factory,
    test_user_cro: User,
    test_department: Department,
):
    async with client_factory(user=test_user_cro) as client:
        first = (
            await client.post(
                "/api/v1/processes",
                json=_process_payload(
                    owner_id=test_user_cro.id,
                    department_id=test_department.id,
                    l0="Claims",
                    l1="Claims intake",
                    mtpd_hours=12,
                ),
            )
        ).json()
        second = (
            await client.post(
                "/api/v1/processes",
                json=_process_payload(
                    owner_id=test_user_cro.id,
                    department_id=test_department.id,
                    l0="Underwriting",
                    l1="Quote review",
                    mtpd_hours=48,
                    cif_override="no",
                    licensed_activity="support_functions",
                    bcm_link="not_assessed",
                    dr_test_result="not_tested",
                ),
            )
        ).json()

        claims_only = await client.get(
            "/api/v1/processes",
            params=[("l0_areas", "Claims")],
        )
        assert claims_only.status_code == 200, claims_only.text
        assert [row["id"] for row in claims_only.json()["items"]] == [first["id"]]
        claims_only_l0_facets = {row["value"]: row for row in claims_only.json()["facets"]["l0"]}
        assert claims_only_l0_facets["Claims"] == {
            "value": "Claims",
            "label": "Claims",
            "count": 1,
            "disabled": False,
            "selected": True,
        }
        assert claims_only_l0_facets["Underwriting"]["count"] == 1
        assert claims_only_l0_facets["Underwriting"]["disabled"] is False

        l0_union = await client.get(
            "/api/v1/processes",
            params=[("l0_areas", "Claims"), ("l0_areas", "Underwriting")],
        )
        assert l0_union.status_code == 200, l0_union.text
        assert [row["id"] for row in l0_union.json()["items"]] == [
            first["id"],
            second["id"],
        ]
        union_l0_facets = {row["value"]: row for row in l0_union.json()["facets"]["l0"]}
        assert {
            value: (row["count"], row["selected"])
            for value, row in union_l0_facets.items()
            if value in {"Claims", "Underwriting"}
        } == {"Claims": (1, True), "Underwriting": (1, True)}

        filtered = await client.get(
            "/api/v1/processes",
            params={
                "filters": json.dumps(
                    {
                        "search": "claims intake",
                        "department_ids": [test_department.id],
                        "owner_ids": [test_user_cro.id],
                        "l0_areas": ["Claims", "Other"],
                        "cif": False,
                        "licensed_activity": ["non_life_insurance"],
                        "bcm_link": ["yes"],
                        "dr_test_result": ["successful"],
                        "mtpd_min": 12,
                        "mtpd_max": 12,
                    }
                )
            },
        )
        assert filtered.status_code == 200, filtered.text
        assert [row["id"] for row in filtered.json()["items"]] == [first["id"]]
        assert filtered.json()["facets"]["criticality"]
        assert {row["value"] for row in filtered.json()["facets"]["lifecycle"]} == {
            "active",
            "archived",
        }

        summary = await client.get("/api/v1/processes", params={"view": "l0"})
        assert summary.status_code == 200, summary.text
        assert summary.json()["items"] == []
        claims_group = next(row for row in summary.json()["groups"] if row["value"] == "l0:Claims")
        assert claims_group["count"] == 1

        drilldown = await client.get(
            "/api/v1/processes",
            params={"group_by": "l0", "group_value": "l0:Underwriting"},
        )
        assert [row["id"] for row in drilldown.json()["items"]] == [second["id"]]

        assert (await client.delete(f"/api/v1/processes/{second['id']}")).status_code == 204
        default_active = await client.get("/api/v1/processes")
        assert [row["id"] for row in default_active.json()["items"]] == [first["id"]]
        default_lifecycle_facets = {row["value"]: row for row in default_active.json()["facets"]["lifecycle"]}
        assert default_lifecycle_facets["active"]["count"] == 1
        assert default_lifecycle_facets["archived"]["count"] == 1
        assert default_lifecycle_facets["archived"]["disabled"] is False

        archived_only = await client.get("/api/v1/processes", params=[("lifecycle", "archived")])
        assert [row["id"] for row in archived_only.json()["items"]] == [second["id"]]
        archived_lifecycle_facets = {row["value"]: row for row in archived_only.json()["facets"]["lifecycle"]}
        assert archived_lifecycle_facets["active"]["count"] == 1
        assert archived_lifecycle_facets["archived"]["count"] == 1
        assert archived_lifecycle_facets["archived"]["selected"] is True

        exported = await client.get(
            "/api/v1/processes/export",
            params={"limit": 1, "include_archived": "true", "locale": "cs"},
        )
        assert exported.status_code == 200, exported.text
        rows = list(csv.DictReader(io.StringIO(exported.text)))
        assert {row["f_code"] for row in rows} == {first["f_code"], second["f_code"]}
        assert next(row for row in rows if row["f_code"] == first["f_code"])["cif_label"] == "Ne"


@pytest.mark.asyncio
async def test_process_export_sanitizes_formula_injection_from_names_and_linked_rows(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_department: Department,
):
    dangerous_values = {
        "l0_area": "=2+2",
        "l1_process": "+SUM(A1:A2)",
        "l2_subprocess": "-10+20",
        "process_owner": "@SUM(A1:A2)",
        "owning_department": '=HYPERLINK("https://example.test")',
    }
    test_user_cro.name = dangerous_values["process_owner"]
    test_department.name = dangerous_values["owning_department"]
    await db_session.commit()

    async with client_factory(user=test_user_cro) as client:
        process = (
            await client.post(
                "/api/v1/processes",
                json=_process_payload(
                    owner_id=test_user_cro.id,
                    department_id=test_department.id,
                    l0=dangerous_values["l0_area"],
                    l1=dangerous_values["l1_process"],
                    l2_subprocess=dangerous_values["l2_subprocess"],
                ),
            )
        ).json()

    dangerous_link_label = '=WEBSERVICE("https://example.test")'
    vendor = Vendor(
        name=dangerous_link_label,
        process="Operations",
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user_cro.id,
    )
    db_session.add(vendor)
    await db_session.flush()
    db_session.add(ProcessVendorLink(process_id=process["id"], vendor_id=vendor.id))
    await db_session.commit()

    async with client_factory(user=test_user_cro) as client:
        exported = await client.get(
            "/api/v1/processes/export",
            params={"linked_vendor_ids": vendor.id, "locale": "en"},
        )

    assert exported.status_code == 200, exported.text
    rows = list(csv.DictReader(io.StringIO(exported.text)))
    assert len(rows) == 1
    for field, dangerous_value in dangerous_values.items():
        assert rows[0][field] == f"'{dangerous_value}"
    assert dangerous_link_label not in exported.text


@pytest.mark.asyncio
async def test_process_default_and_explicit_f_code_sort_use_business_code(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_department: Department,
):
    async with client_factory(user=test_user_cro) as client:
        first = (
            await client.post(
                "/api/v1/processes",
                json=_process_payload(
                    owner_id=test_user_cro.id,
                    department_id=test_department.id,
                    l0="Operations",
                    l1="Created first",
                ),
            )
        ).json()
        second = (
            await client.post(
                "/api/v1/processes",
                json=_process_payload(
                    owner_id=test_user_cro.id,
                    department_id=test_department.id,
                    l0="Operations",
                    l1="Created second",
                ),
            )
        ).json()

        await db_session.execute(update(Process).where(Process.id == first["id"]).values(f_code="F900"))
        await db_session.execute(update(Process).where(Process.id == second["id"]).values(f_code="F100"))
        await db_session.commit()

        default_order = await client.get("/api/v1/processes")
        assert default_order.status_code == 200, default_order.text
        assert [row["f_code"] for row in default_order.json()["items"]] == [
            "F100",
            "F900",
        ]

        explicit_order = await client.get(
            "/api/v1/processes",
            params={"sort_by": "f_code", "sort_order": "asc"},
        )
        assert explicit_order.status_code == 200, explicit_order.text
        assert [row["f_code"] for row in explicit_order.json()["items"]] == [
            "F100",
            "F900",
        ]


@pytest.mark.asyncio
async def test_process_link_filters_lookups_and_record_owner_non_leakage(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_department: Department,
):
    other_department = Department(name="Other Department", code="OTHER", is_active=True)
    record_only_role = Role(
        name="record_only_process",
        display_name="Record-only Process user",
        description="No register-wide permissions",
    )
    db_session.add_all((other_department, record_only_role))
    await db_session.flush()
    record_owner = User(
        name="Assigned Process Owner",
        email="assigned.process.owner@test.com",
        role_id=record_only_role.id,
        department_id=other_department.id,
        is_active=True,
    )
    db_session.add(record_owner)
    await db_session.commit()

    async with client_factory(user=test_user_cro) as client:
        visible_process = (
            await client.post(
                "/api/v1/processes",
                json=_process_payload(
                    owner_id=test_user_cro.id,
                    department_id=test_department.id,
                    l0="Operations",
                    l1="Visible links",
                ),
            )
        ).json()
        owner_only_process = (
            await client.post(
                "/api/v1/processes",
                json=_process_payload(
                    owner_id=record_owner.id,
                    department_id=test_department.id,
                    l0="Operations",
                    l1="Owner-only links",
                ),
            )
        ).json()

    asset = Asset(
        name="Claims platform",
        business_owner_user_id=test_user_cro.id,
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=test_department.id,
    )
    vendor = Vendor(
        name="Scoped Cloud",
        process="Operations",
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user_cro.id,
    )
    owner_visible_vendor = Vendor(
        name="Assigned Owner Vendor",
        process="Operations",
        department_id=other_department.id,
        outsourcing_owner_user_id=record_owner.id,
    )
    risk = Risk(
        risk_id_code="PROC-FILTER-R1",
        name="Process filter risk",
        process="Operations",
        description="Linked risk",
        department_id=test_department.id,
        owner_id=test_user_cro.id,
    )
    db_session.add_all((asset, vendor, owner_visible_vendor, risk))
    await db_session.flush()
    db_session.add_all(
        (
            ProcessAssetLink(process_id=visible_process["id"], asset_id=asset.id),
            ProcessAssetLink(process_id=owner_only_process["id"], asset_id=asset.id),
            AssetVendorLink(asset_id=asset.id, vendor_id=vendor.id, ict_service_code="S01"),
            ProcessVendorLink(
                process_id=owner_only_process["id"],
                vendor_id=owner_visible_vendor.id,
            ),
            RiskProcessLink(risk_id=risk.id, process_id=visible_process["id"]),
            RiskProcessLink(risk_id=risk.id, process_id=owner_only_process["id"]),
        )
    )
    await db_session.commit()

    async with client_factory(user=test_user_cro) as client:
        for parameter, entity_id in (
            ("linked_asset_ids", asset.id),
            ("linked_vendor_ids", vendor.id),
            ("linked_risk_ids", risk.id),
        ):
            response = await client.get("/api/v1/processes", params={parameter: entity_id})
            assert response.status_code == 200, response.text
            assert {row["id"] for row in response.json()["items"]} == {
                visible_process["id"],
                owner_only_process["id"],
            }

        assert (await client.get("/api/v1/processes/lookups/assets")).json()[0]["label"] == "Claims platform"
        assert {row["label"] for row in (await client.get("/api/v1/processes/lookups/vendors")).json()} == {
            "Assigned Owner Vendor",
            "Scoped Cloud",
        }
        selected_vendor = await client.get(
            "/api/v1/processes/lookups/vendors",
            params={"limit": 1, "selected_ids": vendor.id},
        )
        assert [row["id"] for row in selected_vendor.json()] == [vendor.id]
        assert (await client.get("/api/v1/processes/lookups/risks")).json()[0]["label"] == "PROC-FILTER-R1"

    async with client_factory(user=record_owner) as owner_client:
        listing = await owner_client.get("/api/v1/processes")
        assert {row["id"] for row in listing.json()["items"]} == {owner_only_process["id"]}
        assert listing.json()["capabilities"] == {
            "can_create": False,
            "can_export": False,
        }
        assert (await owner_client.get("/api/v1/processes/export")).status_code == 403
        assert (await owner_client.get("/api/v1/processes/lookups/assets")).json() == []
        owner_vendor_lookup = (await owner_client.get("/api/v1/processes/lookups/vendors")).json()
        assert owner_vendor_lookup == [
            {
                "id": owner_visible_vendor.id,
                "label": "Assigned Owner Vendor",
                "secondary_label": None,
                "disabled": False,
                "count": 1,
            }
        ]
        hidden_selected_vendor = await owner_client.get(
            "/api/v1/processes/lookups/vendors",
            params={"limit": 1, "selected_ids": vendor.id},
        )
        assert [row["id"] for row in hidden_selected_vendor.json()] == [owner_visible_vendor.id]
        assert (await owner_client.get("/api/v1/processes/lookups/risks")).json() == []
        assert (await owner_client.get("/api/v1/processes", params={"linked_asset_ids": asset.id})).json()[
            "items"
        ] == []
