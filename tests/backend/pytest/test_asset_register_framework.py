from __future__ import annotations

import csv
import io
import json
from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ApprovalScenario,
    AssetAssetLink,
    AssetVendorLink,
    Department,
    Process,
    ProcessAssetLink,
    Risk,
    RiskAssetLink,
    User,
    Vendor,
)


async def _disable_asset_approval_for_register_setup(
    db: AsyncSession,
) -> None:
    """Keep register-framework fixtures on the direct lifecycle seam."""
    db.add(
        ApprovalScenario(
            key="protected_asset_edit",
            display_name="Protected Asset mutations",
            description="Disabled for Asset register framework setup",
            requires_approval=False,
            approver_roles=["risk_manager", "cro"],
        )
    )
    await db.commit()


def _asset_payload(
    *,
    name: str,
    business_owner_id: int,
    ict_owner_id: int,
    department_id: int,
    **overrides,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": name,
        "asset_type": "application",
        "asset_level": "primary",
        "description": "Core policy platform",
        "physical_location": "Prague DC",
        "deployment_model": "on_premise",
        "alternative_names": "Core Alias",
        "business_owner_user_id": business_owner_id,
        "ict_owner_user_id": ict_owner_id,
        "owning_department_id": department_id,
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
        "vendor_dependency_rating": 5,
        "internet_exposed": "no",
        "preliminary_criticality": "critical",
        "lifecycle_state": "operational",
        "standard_support_end_date": "2028-12-31",
        "extended_support_end_date": "2029-12-31",
        "custom_support_end_date": "2030-12-31",
        "last_legacy_risk_assessment_date": "2026-01-15",
        "review_state": "reviewed",
        "notes": "Reviewed asset",
    }
    payload.update(overrides)
    return payload


def _process_fixture(*, f_code: str, owner_id: int, department_id: int) -> Process:
    return Process(
        f_code=f_code,
        l0_area="Claims",
        l1_process="Claims handling",
        process_owner_user_id=owner_id,
        owning_department_id=department_id,
        impact_client=5,
        impact_market_operations=5,
        impact_regulatory=5,
        impact_financial=5,
        mtpd_hours=12,
        cif_override="yes",
        licensed_activity="non_life_insurance",
        bcm_link="yes",
        dr_test_result="successful",
        rto_hours=4,
        assessment_date=date(2026, 7, 1),
    )


@pytest.mark.asyncio
async def test_asset_collection_query_contract_sort_precedence_and_pagination(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_employee: User,
    test_department: Department,
):
    await _disable_asset_approval_for_register_setup(db_session)
    async with client_factory(user=test_user_cro) as client:
        application = (
            await client.post(
                "/api/v1/assets",
                json=_asset_payload(
                    name="Application Asset",
                    business_owner_id=test_user_cro.id,
                    ict_owner_id=test_user_employee.id,
                    department_id=test_department.id,
                    internet_exposed="no",
                ),
            )
        ).json()
        database = (
            await client.post(
                "/api/v1/assets",
                json=_asset_payload(
                    name="Database Asset",
                    business_owner_id=test_user_cro.id,
                    ict_owner_id=test_user_employee.id,
                    department_id=test_department.id,
                    asset_type="database",
                    asset_level="supporting",
                    deployment_model="cloud",
                    internet_exposed="yes",
                    preliminary_criticality="low",
                    lifecycle_state="legacy",
                ),
            )
        ).json()

        for sort_field in (
            "name",
            "asset_type",
            "asset_level",
            "business_owner",
            "ict_owner",
            "department",
            "criticality",
            "cif",
            "lifecycle_state",
            "created_at",
        ):
            response = await client.get(
                "/api/v1/assets",
                params={"sort_by": sort_field, "sort_order": "desc"},
            )
            assert response.status_code == 200, (sort_field, response.text)

        rejected_sort = await client.get(
            "/api/v1/assets",
            params={"sort_by": "updated_at"},
        )
        assert rejected_sort.status_code == 400

        scalar_precedence = await client.get(
            "/api/v1/assets",
            params={
                "internet_exposed": "false",
                "filters": json.dumps({"internet_exposed": True}),
            },
        )
        assert scalar_precedence.status_code == 200, scalar_precedence.text
        assert [row["id"] for row in scalar_precedence.json()["items"]] == [database["id"]]

        repeated_precedence = await client.get(
            "/api/v1/assets",
            params=[
                ("asset_types", "database"),
                ("filters", json.dumps({"asset_types": ["application"]})),
            ],
        )
        assert repeated_precedence.status_code == 200, repeated_precedence.text
        assert [row["id"] for row in repeated_precedence.json()["items"]] == [application["id"]]

        page = await client.get(
            "/api/v1/assets",
            params={"offset": 1, "limit": 1},
        )
        assert page.status_code == 200, page.text
        payload = page.json()
        assert payload["offset"] == 1
        assert payload["limit"] == 1
        assert payload["skip"] == 1
        assert "page" not in payload
        assert "page_size" not in payload


@pytest.mark.asyncio
async def test_asset_shared_filters_facets_groups_search_lifecycle_and_export(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_employee: User,
    test_department: Department,
):
    await _disable_asset_approval_for_register_setup(db_session)
    other_department = Department(name="Technology", code="TECH", is_active=True)
    db_session.add(other_department)
    await db_session.flush()
    other_owner = User(
        name="Other Asset Owner",
        email="other.asset.owner@test.com",
        role_id=test_user_employee.role_id,
        department_id=other_department.id,
        is_active=True,
    )
    db_session.add(other_owner)
    await db_session.commit()

    async with client_factory(user=test_user_cro) as client:
        first = (
            await client.post(
                "/api/v1/assets",
                json=_asset_payload(
                    name="Claims Platform",
                    business_owner_id=test_user_cro.id,
                    ict_owner_id=test_user_employee.id,
                    department_id=test_department.id,
                ),
            )
        ).json()
        second = (
            await client.post(
                "/api/v1/assets",
                json=_asset_payload(
                    name="Legacy Database",
                    business_owner_id=other_owner.id,
                    ict_owner_id=other_owner.id,
                    department_id=other_department.id,
                    asset_type="database",
                    asset_level="supporting",
                    physical_location="Brno DC",
                    deployment_model="cloud",
                    alternative_names="Old DB",
                    gdpr_relevance="no",
                    ai_relevance="undetermined",
                    data_classification="internal",
                    internet_exposed="yes",
                    preliminary_criticality="low",
                    lifecycle_state="legacy",
                    confidentiality_rating=None,
                ),
            )
        ).json()
    process = _process_fixture(
        f_code="FASSET001",
        owner_id=test_user_cro.id,
        department_id=test_department.id,
    )
    vendors = [
        Vendor(
            name="Cloud One",
            process="Technology",
            department_id=test_department.id,
            outsourcing_owner_user_id=test_user_cro.id,
        ),
        Vendor(
            name="Cloud Two",
            process="Technology",
            department_id=test_department.id,
            outsourcing_owner_user_id=test_user_cro.id,
        ),
    ]
    risk = Risk(
        risk_id_code="ASSET-R1",
        name="Asset risk",
        process="Claims",
        description="Linked Asset risk",
        department_id=test_department.id,
        owner_id=test_user_cro.id,
    )
    db_session.add_all((process, *vendors, risk))
    await db_session.flush()
    db_session.add_all(
        (
            ProcessAssetLink(
                process_id=process.id,
                asset_id=first["id"],
                spof="Ano",
                is_primary=True,
            ),
            AssetAssetLink(dependent_asset_id=first["id"], supporting_asset_id=second["id"]),
            AssetVendorLink(asset_id=first["id"], vendor_id=vendors[0].id, ict_service_code="S01"),
            AssetVendorLink(asset_id=first["id"], vendor_id=vendors[1].id, ict_service_code="S02"),
            RiskAssetLink(risk_id=risk.id, asset_id=first["id"]),
        )
    )
    await db_session.commit()

    async with client_factory(user=test_user_cro) as client:
        for search in (
            "Claims Platform",
            "Core Alias",
            "application",
            test_user_cro.name,
            test_user_employee.name,
            test_department.name,
            "Prague DC",
        ):
            response = await client.get("/api/v1/assets", params={"search": search})
            assert response.status_code == 200, response.text
            assert first["id"] in {row["id"] for row in response.json()["items"]}

        filtered = await client.get(
            "/api/v1/assets",
            params={
                "filters": json.dumps(
                    {
                        "department_ids": [test_department.id],
                        "business_owner_ids": [test_user_cro.id],
                        "ict_owner_ids": [test_user_employee.id],
                        "asset_types": ["application"],
                        "asset_levels": ["primary"],
                        "deployment_models": ["on_premise"],
                        "criticality": ["critical"],
                        "cif": True,
                        "lifecycle_states": ["operational"],
                        "legacy": False,
                        "spof": True,
                        "external_dependency": True,
                        "gdpr_relevance": ["yes"],
                        "ai_relevance": ["no"],
                        "internet_exposed": False,
                        "data_classification": ["highly_confidential_regulated"],
                        "is_complete": True,
                        "linked_process_ids": [process.id],
                        "linked_asset_ids": [second["id"]],
                        "linked_vendor_ids": [vendors[0].id],
                        "linked_risk_ids": [risk.id],
                    }
                )
            },
        )
        assert filtered.status_code == 200, filtered.text
        assert [row["id"] for row in filtered.json()["items"]] == [first["id"]]

        type_union = await client.get(
            "/api/v1/assets",
            params=[("asset_types", "application"), ("asset_types", "database")],
        )
        assert [row["id"] for row in type_union.json()["items"]] == [
            first["id"],
            second["id"],
        ]
        type_facets = {row["value"]: row for row in type_union.json()["facets"]["asset_type"]}
        assert (
            type_facets["application"]["count"],
            type_facets["application"]["selected"],
        ) == (1, True)
        assert (
            type_facets["database"]["count"],
            type_facets["database"]["selected"],
        ) == (1, True)

        process_groups = await client.get("/api/v1/assets", params={"view": "process"})
        assert process_groups.json()["items"] == []
        assert (
            next(row for row in process_groups.json()["groups"] if row["value"] == f"process:{process.id}")["count"]
            == 1
        )

        vendor_groups = await client.get("/api/v1/assets", params={"view": "vendor"})
        assert {row["value"] for row in vendor_groups.json()["groups"] if row["value"] != "__unlinked_vendor__"} == {
            f"vendor:{vendors[0].id}",
            f"vendor:{vendors[1].id}",
        }

        assert (await client.delete(f"/api/v1/assets/{second['id']}")).status_code == 204
        default_active = (await client.get("/api/v1/assets")).json()
        assert [row["id"] for row in default_active["items"]] == [first["id"]]
        lifecycle_facets = {row["value"]: row for row in default_active["facets"]["lifecycle"]}
        assert lifecycle_facets["active"]["count"] == 1
        assert lifecycle_facets["archived"]["count"] == 1
        assert lifecycle_facets["archived"]["disabled"] is False

        archived_only = await client.get("/api/v1/assets", params=[("lifecycle", "archived")])
        assert [row["id"] for row in archived_only.json()["items"]] == [second["id"]]

        exported = await client.get(
            "/api/v1/assets/export",
            params={"limit": 1, "include_archived": "true", "locale": "cs"},
        )
        assert exported.status_code == 200, exported.text
        rows = list(csv.DictReader(io.StringIO(exported.text)))
        assert {row["name"] for row in rows} == {"Claims Platform", "Legacy Database"}
        claims_row = next(row for row in rows if row["name"] == "Claims Platform")
        assert claims_row["asset_type_code"] == "application"
        assert claims_row["asset_type_label"] == "Aplikace"
        assert claims_row["criticality_code"] == "critical"
        assert claims_row["criticality_label"] == "Kritická"


@pytest.mark.asyncio
async def test_asset_lookup_and_link_filters_do_not_leak_hidden_counterparts(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_employee: User,
    test_department: Department,
):
    await _disable_asset_approval_for_register_setup(db_session)
    hidden_department = Department(name="Hidden Counterpart Department", code="HIDDEN-CP")
    db_session.add(hidden_department)
    await db_session.flush()

    async with client_factory(user=test_user_cro) as client:
        owned = (
            await client.post(
                "/api/v1/assets",
                json=_asset_payload(
                    name="Assigned Asset",
                    business_owner_id=test_user_employee.id,
                    ict_owner_id=test_user_employee.id,
                    department_id=test_department.id,
                ),
            )
        ).json()
    process = _process_fixture(
        f_code="FASSET002",
        owner_id=test_user_cro.id,
        department_id=hidden_department.id,
    )
    vendor = Vendor(
        name="Hidden Vendor",
        process="Technology",
        department_id=hidden_department.id,
        outsourcing_owner_user_id=test_user_cro.id,
    )
    risk = Risk(
        risk_id_code="HIDDEN-ASSET-RISK",
        name="Hidden Asset risk",
        process="Claims",
        description="Hidden counterpart",
        department_id=hidden_department.id,
        owner_id=test_user_cro.id,
    )
    db_session.add_all((process, vendor, risk))
    await db_session.flush()
    db_session.add_all(
        (
            ProcessAssetLink(process_id=process.id, asset_id=owned["id"], is_primary=True),
            AssetVendorLink(asset_id=owned["id"], vendor_id=vendor.id, ict_service_code="S01"),
            RiskAssetLink(risk_id=risk.id, asset_id=owned["id"]),
        )
    )
    await db_session.commit()

    async with client_factory(user=test_user_cro) as client:
        assert [
            row["id"]
            for row in (await client.get("/api/v1/assets", params={"linked_process_ids": process.id})).json()["items"]
        ] == [owned["id"]]
        assert (await client.get("/api/v1/assets/lookups/processes")).json()[0]["label"] == process.f_code
        assert (await client.get("/api/v1/assets/lookups/vendors")).json()[0]["label"] == "Hidden Vendor"
        assert (await client.get("/api/v1/assets/lookups/risks")).json()[0]["label"] == "HIDDEN-ASSET-RISK"

    async with client_factory(user=test_user_employee) as owner_client:
        listing = await owner_client.get("/api/v1/assets")
        assert [row["id"] for row in listing.json()["items"]] == [owned["id"]]
        assert listing.json()["capabilities"] == {
            "can_create": False,
            "can_export": True,
        }
        owner_export = await owner_client.get("/api/v1/assets/export")
        assert owner_export.status_code == 200
        assert [row["name"] for row in csv.DictReader(io.StringIO(owner_export.text))] == ["Assigned Asset"]
        assert (await owner_client.get("/api/v1/assets/lookups/processes")).json() == []
        assert (await owner_client.get("/api/v1/assets/lookups/vendors")).json() == []
        assert (await owner_client.get("/api/v1/assets/lookups/risks")).json() == []
        assert (await owner_client.get("/api/v1/assets", params={"linked_process_ids": process.id})).json()[
            "items"
        ] == []
