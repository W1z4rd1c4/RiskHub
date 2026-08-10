import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.admin.orphans import governed_refusal_detail
from app.models import (
    Asset,
    Control,
    ControlRiskLink,
    Department,
    KeyRiskIndicator,
    OrphanedItem,
    Process,
    Risk,
    Threat,
    Vendor,
)


async def _governed_orphan_case(
    db_session: AsyncSession,
    *,
    item_type: str,
    department,
    previous_owner,
) -> tuple[object, OrphanedItem, str]:
    """Create one accountability-bearing entity plus its pending orphan row."""
    responsibility_role = None
    if item_type == "process":
        entity = Process(
            f_code="F-ADM-GOV-1",
            l0_area="Operations",
            l1_process="Admin batch guard",
            process_owner_user_id=previous_owner.id,
            owning_department_id=department.id,
        )
        owner_field = "process_owner_user_id"
    elif item_type == "asset":
        entity = Asset(
            name="Admin batch guard Asset",
            business_owner_user_id=previous_owner.id,
            ict_owner_user_id=previous_owner.id,
            owning_department_id=department.id,
            preliminary_criticality="low",
        )
        owner_field = "business_owner_user_id"
        responsibility_role = "business_owner"
    elif item_type == "vendor":
        entity = Vendor(
            name="Admin batch guard Vendor",
            process="Operations",
            outsourcing_owner_user_id=previous_owner.id,
            department_id=department.id,
            replaceability="easily_substitutable",
        )
        owner_field = "outsourcing_owner_user_id"
        responsibility_role = "outsourcing_owner"
    else:
        entity = Threat(
            name="Admin batch guard Threat",
            threat_steward_user_id=previous_owner.id,
        )
        owner_field = "threat_steward_user_id"
    db_session.add(entity)
    await db_session.flush()
    orphan = OrphanedItem(
        item_type=item_type,
        item_id=entity.id,
        previous_owner_id=previous_owner.id,
        responsibility_role=responsibility_role,
        status="pending",
    )
    db_session.add(orphan)
    await db_session.commit()
    return entity, orphan, owner_field


@pytest.mark.asyncio
async def test_fix_orphans_requires_explicit_resolutions(
    client_platform_admin: AsyncClient,
    db_session: AsyncSession,
    test_user_platform_admin,
):
    risk = Risk(
        risk_id_code="R-ORPH-REQ-1",
        name="Needs Resolution",
        process="Ops",
        description="",
        category="Operational",
        department_id=test_user_platform_admin.department_id,
        owner_id=test_user_platform_admin.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
    )
    db_session.add(risk)
    await db_session.flush()
    orphan = OrphanedItem(
        item_type="risk",
        item_id=risk.id,
        previous_owner_id=test_user_platform_admin.id,
        status="pending",
    )
    db_session.add(orphan)
    await db_session.commit()

    response = await client_platform_admin.post("/api/v1/admin/fix-orphans", json={"dry_run": True, "resolutions": []})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_fix_orphans_dry_run_validates_explicit_mapping(
    client_platform_admin: AsyncClient,
    db_session: AsyncSession,
    test_department,
    test_user_platform_admin,
):
    target_risk = Risk(
        risk_id_code="R-ORPH-TARGET-1",
        name="Target Risk",
        process="Orphan Process",
        description="Risk for orphan remediation tests",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user_platform_admin.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
    )
    control = Control(
        name="Orphan Control",
        description="Control without links",
        department_id=test_department.id,
        control_owner_id=test_user_platform_admin.id,
        frequency="monthly",
        status="active",
    )
    db_session.add_all([target_risk, control])
    await db_session.flush()
    orphan = OrphanedItem(
        item_type="control",
        item_id=control.id,
        previous_owner_id=test_user_platform_admin.id,
        status="pending",
    )
    db_session.add(orphan)
    await db_session.commit()

    response = await client_platform_admin.post(
        "/api/v1/admin/fix-orphans",
        json={
            "dry_run": True,
            "resolutions": [
                {
                    "orphan_id": orphan.id,
                    "new_owner_id": test_user_platform_admin.id,
                    "department_id": test_department.id,
                    "target_risk_id": target_risk.id,
                }
            ],
        },
    )
    assert response.status_code == 200

    payload = response.json()
    assert payload["dry_run"] is True
    assert payload["resolved_count"] == 1
    assert payload["controls_fixed"] == 1
    assert payload["results"][0]["applied"] is False

    await db_session.refresh(orphan)
    assert orphan.status == "pending"
    links = list((await db_session.execute(select(ControlRiskLink))).scalars().all())
    assert links == []


@pytest.mark.asyncio
async def test_fix_orphans_rejects_duplicate_orphan_ids_in_batch(
    client_platform_admin: AsyncClient,
    db_session: AsyncSession,
    test_department,
    test_user_platform_admin,
):
    target_risk = Risk(
        risk_id_code="R-ORPH-DUP-1",
        name="Duplicate Target Risk",
        process="Orphan Process",
        description="Risk for duplicate-orphan remediation tests",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user_platform_admin.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
    )
    control = Control(
        name="Duplicate Apply Control",
        description="Control without links",
        department_id=test_department.id,
        control_owner_id=test_user_platform_admin.id,
        frequency="monthly",
        status="active",
    )
    db_session.add_all([target_risk, control])
    await db_session.flush()
    orphan = OrphanedItem(
        item_type="control",
        item_id=control.id,
        previous_owner_id=test_user_platform_admin.id,
        status="pending",
    )
    db_session.add(orphan)
    await db_session.commit()

    response = await client_platform_admin.post(
        "/api/v1/admin/fix-orphans",
        json={
            "dry_run": False,
            "resolutions": [
                {
                    "orphan_id": orphan.id,
                    "new_owner_id": test_user_platform_admin.id,
                    "department_id": test_department.id,
                    "target_risk_id": target_risk.id,
                },
                {
                    "orphan_id": orphan.id,
                    "new_owner_id": test_user_platform_admin.id,
                    "department_id": test_department.id,
                    "target_risk_id": target_risk.id,
                },
            ],
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == f"Duplicate orphan_id in request: {orphan.id}"

    await db_session.refresh(orphan)
    await db_session.refresh(control)
    assert orphan.status == "pending"
    assert control.control_owner_id == test_user_platform_admin.id
    links = list((await db_session.execute(select(ControlRiskLink))).scalars().all())
    assert links == []


@pytest.mark.asyncio
async def test_fix_orphans_applies_explicit_resolution(
    client_platform_admin: AsyncClient,
    db_session: AsyncSession,
    test_department,
    test_user_platform_admin,
):
    target_risk = Risk(
        risk_id_code="R-ORPH-TARGET-2",
        name="Target Risk",
        process="Orphan Process",
        description="Risk for orphan remediation tests",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user_platform_admin.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
    )
    control = Control(
        name="Apply Control",
        description="Control without links",
        department_id=test_department.id,
        control_owner_id=test_user_platform_admin.id,
        frequency="monthly",
        status="active",
    )
    db_session.add_all([target_risk, control])
    await db_session.flush()
    orphan = OrphanedItem(
        item_type="control",
        item_id=control.id,
        previous_owner_id=test_user_platform_admin.id,
        status="pending",
    )
    db_session.add(orphan)
    await db_session.commit()

    response = await client_platform_admin.post(
        "/api/v1/admin/fix-orphans",
        json={
            "dry_run": False,
            "resolutions": [
                {
                    "orphan_id": orphan.id,
                    "new_owner_id": test_user_platform_admin.id,
                    "department_id": test_department.id,
                    "target_risk_id": target_risk.id,
                }
            ],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["dry_run"] is False
    assert payload["resolved_count"] == 1
    assert payload["results"][0]["applied"] is True

    await db_session.refresh(orphan)
    await db_session.refresh(control)
    assert orphan.status == "resolved"
    assert control.control_owner_id == test_user_platform_admin.id
    links = list((await db_session.execute(select(ControlRiskLink))).scalars().all())
    assert len(links) == 1
    assert links[0].risk_id == target_risk.id


@pytest.mark.asyncio
async def test_orphan_stats_reports_expected_counts(
    client_platform_admin: AsyncClient,
    db_session: AsyncSession,
    test_department,
    test_user_platform_admin,
):
    risk = Risk(
        risk_id_code="R-ORPH-STATS-1",
        name="Stats Risk",
        process="Stats Process",
        description="Risk for orphan stats tests",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user_platform_admin.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
    )
    db_session.add(risk)
    await db_session.flush()

    db_session.add(
        Control(
            name="Stats Control",
            description="Control with no links",
            department_id=test_department.id,
            control_owner_id=test_user_platform_admin.id,
            frequency="monthly",
            status="active",
        )
    )
    db_session.add(
        KeyRiskIndicator(
            risk_id=risk.id,
            metric_name="Stats KRI",
            description="KRI for orphan stats test",
            current_value=10.0,
            lower_limit=5.0,
            upper_limit=15.0,
            frequency="quarterly",
        )
    )
    await db_session.commit()

    response = await client_platform_admin.get("/api/v1/admin/orphan-stats")
    assert response.status_code == 200

    payload = response.json()
    assert payload["orphan_kris"] == 0
    assert payload["controls_without_links"] == 1
    assert payload["total_risks"] == 1
    assert payload["total_controls"] == 1
    assert payload["total_kris"] == 1
    assert payload["total_links"] == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("dry_run", [True, False])
@pytest.mark.parametrize("item_type", ["process", "asset", "vendor", "threat"])
async def test_fix_orphans_refuses_governed_types_in_both_modes(
    client_platform_admin: AsyncClient,
    db_session: AsyncSession,
    test_department,
    test_user_platform_admin,
    test_user_employee,
    item_type: str,
    dry_run: bool,
):
    entity, orphan, owner_field = await _governed_orphan_case(
        db_session,
        item_type=item_type,
        department=test_department,
        previous_owner=test_user_employee,
    )

    response = await client_platform_admin.post(
        "/api/v1/admin/fix-orphans",
        json={
            "dry_run": dry_run,
            "resolutions": [
                {
                    "orphan_id": orphan.id,
                    "new_owner_id": test_user_platform_admin.id,
                }
            ],
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == governed_refusal_detail([item_type])

    await db_session.refresh(orphan)
    await db_session.refresh(entity)
    assert orphan.status == "pending"
    assert getattr(entity, owner_field) == test_user_employee.id


@pytest.mark.asyncio
@pytest.mark.parametrize("dry_run", [True, False])
async def test_fix_orphans_mixed_batch_with_governed_type_mutates_nothing(
    client_platform_admin: AsyncClient,
    db_session: AsyncSession,
    test_department,
    test_user_platform_admin,
    test_user_employee,
    dry_run: bool,
):
    target_risk = Risk(
        risk_id_code="R-ORPH-MIX-1",
        name="Mixed Batch Target Risk",
        process="Orphan Process",
        description="Risk for mixed-batch refusal tests",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user_platform_admin.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
    )
    control = Control(
        name="Mixed Batch Control",
        description="Control without links",
        department_id=test_department.id,
        control_owner_id=test_user_platform_admin.id,
        frequency="monthly",
        status="active",
    )
    db_session.add_all([target_risk, control])
    await db_session.flush()
    control_orphan = OrphanedItem(
        item_type="control",
        item_id=control.id,
        previous_owner_id=test_user_platform_admin.id,
        status="pending",
    )
    db_session.add(control_orphan)
    await db_session.commit()

    vendor, vendor_orphan, vendor_owner_field = await _governed_orphan_case(
        db_session,
        item_type="vendor",
        department=test_department,
        previous_owner=test_user_employee,
    )

    # The valid non-governed entry comes FIRST: the whole batch must still be
    # rejected before execution, mutating neither entry.
    response = await client_platform_admin.post(
        "/api/v1/admin/fix-orphans",
        json={
            "dry_run": dry_run,
            "resolutions": [
                {
                    "orphan_id": control_orphan.id,
                    "new_owner_id": test_user_platform_admin.id,
                    "department_id": test_department.id,
                    "target_risk_id": target_risk.id,
                },
                {
                    "orphan_id": vendor_orphan.id,
                    "new_owner_id": test_user_platform_admin.id,
                },
            ],
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == governed_refusal_detail(["vendor"])

    await db_session.refresh(control_orphan)
    await db_session.refresh(control)
    await db_session.refresh(vendor_orphan)
    await db_session.refresh(vendor)
    assert control_orphan.status == "pending"
    assert control.control_owner_id == test_user_platform_admin.id
    assert vendor_orphan.status == "pending"
    assert getattr(vendor, vendor_owner_field) == test_user_employee.id
    links = list((await db_session.execute(select(ControlRiskLink))).scalars().all())
    assert links == []


@pytest.mark.asyncio
async def test_fix_orphans_non_governed_multi_type_batch_still_applies(
    client_platform_admin: AsyncClient,
    db_session: AsyncSession,
    test_department,
    test_user_platform_admin,
    test_user_employee,
):
    uncat = Department(name="Uncategorised", code="UNCAT", description="System")
    db_session.add(uncat)
    await db_session.flush()
    orphaned_risk = Risk(
        risk_id_code="R-ORPH-BATCH-1",
        name="Orphaned Batch Risk",
        process="Orphan Process",
        description="Risk needing reassignment",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user_employee.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
    )
    target_risk = Risk(
        risk_id_code="R-ORPH-BATCH-2",
        name="Batch Target Risk",
        process="Orphan Process",
        description="Risk receiving control and KRI",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user_platform_admin.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
    )
    source_risk = Risk(
        risk_id_code="R-ORPH-BATCH-3",
        name="Uncategorised Source Risk",
        process="Orphan Process",
        description="Uncategorised risk holding the orphaned KRI",
        category="Operational",
        department_id=uncat.id,
        owner_id=test_user_platform_admin.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
    )
    control = Control(
        name="Batch Apply Control",
        description="Control without links",
        department_id=test_department.id,
        control_owner_id=test_user_employee.id,
        frequency="monthly",
        status="active",
    )
    db_session.add_all([orphaned_risk, target_risk, source_risk, control])
    await db_session.flush()
    kri = KeyRiskIndicator(
        risk_id=source_risk.id,
        metric_name="Batch KRI",
        description="KRI awaiting a categorised risk",
        current_value=10.0,
        lower_limit=5.0,
        upper_limit=15.0,
        frequency="quarterly",
    )
    db_session.add(kri)
    await db_session.flush()
    risk_orphan = OrphanedItem(
        item_type="risk",
        item_id=orphaned_risk.id,
        previous_owner_id=test_user_employee.id,
        status="pending",
    )
    control_orphan = OrphanedItem(
        item_type="control",
        item_id=control.id,
        previous_owner_id=test_user_employee.id,
        status="pending",
    )
    kri_orphan = OrphanedItem(
        item_type="kri",
        item_id=kri.id,
        previous_owner_id=test_user_platform_admin.id,
        status="pending",
    )
    db_session.add_all([risk_orphan, control_orphan, kri_orphan])
    await db_session.commit()

    response = await client_platform_admin.post(
        "/api/v1/admin/fix-orphans",
        json={
            "dry_run": False,
            "resolutions": [
                {
                    "orphan_id": risk_orphan.id,
                    "new_owner_id": test_user_platform_admin.id,
                    "department_id": test_department.id,
                },
                {
                    "orphan_id": control_orphan.id,
                    "new_owner_id": test_user_platform_admin.id,
                    "department_id": test_department.id,
                    "target_risk_id": target_risk.id,
                },
                {
                    "orphan_id": kri_orphan.id,
                    "target_risk_id": target_risk.id,
                },
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["dry_run"] is False
    assert payload["resolved_count"] == 3
    assert payload["risks_fixed"] == 1
    assert payload["controls_fixed"] == 1
    assert payload["kris_fixed"] == 1
    assert all(result["applied"] for result in payload["results"])

    await db_session.refresh(risk_orphan)
    await db_session.refresh(control_orphan)
    await db_session.refresh(kri_orphan)
    await db_session.refresh(orphaned_risk)
    await db_session.refresh(control)
    await db_session.refresh(kri)
    assert risk_orphan.status == "resolved"
    assert control_orphan.status == "resolved"
    assert kri_orphan.status == "resolved"
    assert orphaned_risk.owner_id == test_user_platform_admin.id
    assert control.control_owner_id == test_user_platform_admin.id
    assert kri.risk_id == target_risk.id
    links = list((await db_session.execute(select(ControlRiskLink))).scalars().all())
    assert len(links) == 1
    assert links[0].risk_id == target_risk.id
