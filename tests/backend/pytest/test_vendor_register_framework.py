from __future__ import annotations

import csv
import io

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.exceptions import ValidationError
from app.models import Department, Permission, Role, RolePermission, User, Vendor


def test_vendor_criteria_normalizes_complete_shared_filter_contract() -> None:
    from app.services._register_listings.vendors import vendor_criteria_from_filters

    criteria = vendor_criteria_from_filters(
        offset=10,
        limit=25,
        filters={
            "lifecycle": ["active", "archived", "active"],
            "department_ids": [4, "5"],
            "outsourcing_owner_ids": [7],
            "vendor_types": ["ict", "outsourcing"],
            "risk_scores": [1, 5],
            "tiers": ["critical", "standard"],
            "dora_relevant": True,
            "cif": False,
            "is_significant_vendor": True,
            "substitutability": ["not_substitutable"],
            "countries": ["CZ", "DE"],
            "country_categories": ["domestic", "eu"],
            "has_roi_contract": True,
            "has_sub_outsourcing": False,
            "has_direct_process_link": True,
            "linked_process_ids": [11],
            "linked_asset_ids": [12],
            "linked_risk_ids": [13],
            "linked_control_ids": [14],
            "linked_kri_ids": [15],
        },
        sort_by="outsourcing_owner",
        sort_order="desc",
        view="risk",
        group_by=None,
        group_value=None,
    )

    assert criteria.lifecycle == ("active", "archived")
    assert criteria.department_ids == (4, 5)
    assert criteria.outsourcing_owner_ids == (7,)
    assert criteria.vendor_types == ("ict", "outsourcing")
    assert criteria.risk_scores == (1, 5)
    assert criteria.tiers == ("critical", "standard")
    assert criteria.linked_kri_ids == (15,)
    assert criteria.group_by == "risk"


@pytest.mark.parametrize(
    ("filters", "message"),
    [
        ({"vendor_types": ["legacy-label"]}, "vendor_types"),
        ({"substitutability": ["hard"]}, "substitutability"),
        ({"countries": ["XX"]}, "countries"),
        ({"tiers": ["important"]}, "tiers"),
        ({"lifecycle": ["deleted"]}, "lifecycle"),
    ],
)
def test_vendor_criteria_rejects_noncanonical_values(
    filters: dict, message: str
) -> None:
    from app.services._register_listings.vendors import vendor_criteria_from_filters

    with pytest.raises(ValidationError, match=message):
        vendor_criteria_from_filters(
            offset=0,
            limit=50,
            filters=filters,
            sort_by=None,
            sort_order="asc",
            view="all",
            group_by=None,
            group_value=None,
        )


def test_vendor_list_schema_exposes_permission_scoped_facets_and_safe_lookups() -> None:
    from app.schemas.vendor import (
        VendorFacetOption,
        VendorListResponse,
        VendorLookupOption,
    )

    facet = VendorFacetOption(value="ict", label="ICT provider", count=2)
    lookup = VendorLookupOption(
        id=3, label="Operations", secondary_label="OPS", count=2
    )
    response = VendorListResponse(
        items=[], total=0, offset=0, limit=50, facets={"vendor_type": [facet]}
    )

    assert response.facets["vendor_type"][0].value == "ict"
    assert lookup.model_dump() == {
        "id": 3,
        "label": "Operations",
        "secondary_label": "OPS",
        "disabled": False,
        "count": 2,
    }


def test_vendor_export_declares_codes_labels_and_shared_visible_plan() -> None:
    from app.services._reporting.vendor_register_export import vendor_register_headers

    headers = vendor_register_headers()

    assert "vendor_type_code" in headers
    assert "vendor_type_label" in headers
    assert "substitutability_code" in headers
    assert "substitutability_label" in headers
    assert "tier_code" in headers
    assert "tier_label" in headers
    assert "cif_code" in headers
    assert "cif_label" in headers
    assert "lifecycle" in headers


@pytest.mark.parametrize(
    ("country", "expected"),
    [
        ("CZ", "domestic"),
        ("SK", "eu"),
        ("LU", "eu"),
        ("GB", "non_eu"),
        ("US", "non_eu"),
        ("XX", "unknown"),
        (None, "unknown"),
    ],
)
def test_vendor_country_category_code_reuses_canonical_workbook_mapping(
    country: str | None,
    expected: str,
) -> None:
    from app.services._ict_register_reference.vendor_values import (
        vendor_country_category_code,
    )

    assert vendor_country_category_code(country) == expected


def test_record_only_owner_never_receives_by_risk_collection_capability() -> None:
    from app.services._register_listings.vendors import build_vendor_collection_capabilities

    def check_permission(_user, resource: str, action: str) -> bool:
        return (resource, action) == ("risks", "read")

    capabilities = build_vendor_collection_capabilities(
        object(),
        check_permission_fn=check_permission,
    )

    assert capabilities["can_view_risk_contexts"] is False


def test_vendor_export_capability_requires_vendor_and_report_read_authority() -> None:
    from app.services._register_listings.vendors import build_vendor_collection_capabilities

    def reports_only(_user, resource: str, action: str) -> bool:
        return (resource, action) == ("reports", "read")

    capabilities = build_vendor_collection_capabilities(
        object(),
        check_permission_fn=reports_only,
    )

    assert capabilities["can_export"] is False


@pytest.mark.asyncio
async def test_vendor_api_exposes_facets_lookups_and_export(auth_client) -> None:
    listing = await auth_client.get(
        "/api/v1/vendors",
        params=[("lifecycle", "active"), ("vendor_types", "ict"), ("risk_scores", "3")],
    )
    assert listing.status_code == 200
    assert {
        "lifecycle",
        "department",
        "outsourcing_owner",
        "vendor_type",
        "risk_score",
        "tier",
        "cif",
        "has_roi_contract",
        "has_sub_outsourcing",
        "has_direct_process_link",
    } <= set(listing.json()["facets"])

    lookups = await auth_client.get("/api/v1/vendors/lookups/departments")
    assert lookups.status_code == 200
    assert isinstance(lookups.json(), list)

    export = await auth_client.get("/api/v1/vendors/export", params={"locale": "cs"})
    assert export.status_code == 200
    assert export.headers["content-type"].startswith("text/csv")
    assert "vendor_type_code" in export.text


@pytest.mark.asyncio
async def test_record_only_owner_with_reports_read_cannot_export(
    client_factory,
    db_session,
    test_department: Department,
) -> None:
    reports_read = await db_session.scalar(
        select(Permission).where(
            Permission.resource == "reports",
            Permission.action == "read",
        )
    )
    if reports_read is None:
        reports_read = Permission(resource="reports", action="read", description="Read reports")
        db_session.add(reports_read)
        await db_session.flush()
    role = Role(name="vendor_report_only", display_name="Vendor report only")
    db_session.add(role)
    await db_session.flush()
    db_session.add(RolePermission(role_id=role.id, permission_id=reports_read.id))
    owner = User(
        name="Vendor Record Owner",
        email="vendor-record-owner@test.com",
        department_id=test_department.id,
        role_id=role.id,
        is_active=True,
        access_scope="department",
    )
    db_session.add(owner)
    await db_session.flush()
    db_session.add(
        Vendor(
            name="Owner-only export target",
            process="Legacy owner process",
            department_id=test_department.id,
            outsourcing_owner_user_id=owner.id,
            vendor_type="ict",
            risk_score_1_5=3,
            status="active",
        )
    )
    await db_session.commit()
    owner = (
        await db_session.execute(
            select(User)
            .options(
                selectinload(User.role)
                .selectinload(Role.permissions)
                .selectinload(RolePermission.permission),
                selectinload(User.department),
            )
            .where(User.id == owner.id)
        )
    ).scalar_one()

    async with client_factory(current_user=owner) as client:
        listing = await client.get("/api/v1/vendors")
        export = await client.get("/api/v1/vendors/export")

    assert listing.status_code == 200, listing.text
    assert listing.json()["capabilities"]["can_export"] is False
    assert export.status_code == 403, export.text


@pytest.mark.asyncio
async def test_vendor_export_preserves_selected_group_membership(
    auth_client,
    db_session,
    test_department: Department,
    test_user: User,
) -> None:
    db_session.add_all(
        [
            Vendor(
                name="Grouped CSV ICT member",
                process="Legacy CSV process",
                department_id=test_department.id,
                outsourcing_owner_user_id=test_user.id,
                vendor_type="ict",
                risk_score_1_5=3,
                status="active",
            ),
            Vendor(
                name="Grouped CSV Outsourcing nonmember",
                process="Legacy CSV process",
                department_id=test_department.id,
                outsourcing_owner_user_id=test_user.id,
                vendor_type="outsourcing",
                risk_score_1_5=3,
                status="active",
            ),
        ]
    )
    await db_session.commit()

    response = await auth_client.get(
        "/api/v1/vendors/export",
        params={
            "search": "Grouped CSV",
            "group_by": "type",
            "group_value": "ict",
        },
    )

    assert response.status_code == 200, response.text
    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert [row["name"] for row in rows] == ["Grouped CSV ICT member"]


@pytest.mark.asyncio
async def test_vendor_free_text_search_includes_legacy_subprocess(
    auth_client,
    db_session,
    test_department: Department,
    test_user: User,
) -> None:
    db_session.add_all(
        [
            Vendor(
                name="Search subprocess match",
                process="Legacy process",
                subprocess="Needle Subprocess 80",
                department_id=test_department.id,
                outsourcing_owner_user_id=test_user.id,
                vendor_type="ict",
                risk_score_1_5=3,
                status="active",
            ),
            Vendor(
                name="Search subprocess decoy",
                process="Legacy process",
                subprocess="Different subprocess",
                department_id=test_department.id,
                outsourcing_owner_user_id=test_user.id,
                vendor_type="ict",
                risk_score_1_5=3,
                status="active",
            ),
        ]
    )
    await db_session.commit()

    response = await auth_client.get(
        "/api/v1/vendors",
        params={"search": "Needle Subprocess 80"},
    )

    assert response.status_code == 200, response.text
    assert [item["name"] for item in response.json()["items"]] == [
        "Search subprocess match"
    ]
