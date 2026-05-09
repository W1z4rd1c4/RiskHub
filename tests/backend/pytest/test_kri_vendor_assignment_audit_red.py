"""KRI vendor assignment emits per-row audit events (#62)."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActivityLog, Department, Risk, User, Vendor
from app.models.activity_log import ActivityAction, ActivityEntityType

pytestmark = pytest.mark.contract


def _make_vendor(index: int, *, department_id: int, owner_id: int) -> Vendor:
    return Vendor(
        name=f"KRI Audit Vendor {index}",
        process="IT",
        subprocess=None,
        department_id=department_id,
        outsourcing_owner_user_id=owner_id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=True,
        status="active",
    )


def _make_risk(*, department_id: int, owner_id: int) -> Risk:
    return Risk(
        risk_id_code="KRI-AUDIT-R001",
        name="KRI assignment audit risk",
        process="IT",
        subprocess=None,
        category=None,
        description="Risk for KRI vendor assignment audit test",
        department_id=department_id,
        owner_id=owner_id,
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status="active",
        is_priority=False,
    )


async def _kri_link_events(db: AsyncSession) -> list[ActivityLog]:
    rows = await db.execute(
        select(ActivityLog)
        .where(ActivityLog.entity_type == ActivityEntityType.VENDOR_LINK.value)
        .where(ActivityLog.action.in_([ActivityAction.CREATE.value, ActivityAction.DELETE.value]))
        .order_by(ActivityLog.id.asc())
    )
    return [
        event
        for event in rows.scalars().all()
        if ((event.changes or {}).get("link_kind") or {}).get("new") == "kri"
        or ((event.changes or {}).get("link_kind") or {}).get("old") == "kri"
    ]


@pytest.mark.asyncio
async def test_kri_vendor_assignment_emits_per_row_audit_events(
    client_factory,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
) -> None:
    risk = _make_risk(department_id=test_department.id, owner_id=test_user.id)
    vendors = [
        _make_vendor(index, department_id=test_department.id, owner_id=test_user.id)
        for index in range(1, 5)
    ]
    db_session.add_all([risk, *vendors])
    await db_session.commit()
    await db_session.refresh(risk)
    for vendor in vendors:
        await db_session.refresh(vendor)

    async with client_factory(current_user=test_user) as client:
        create_response = await client.post(
            "/api/v1/kris",
            json={
                "risk_id": risk.id,
                "metric_name": "Audit KRI",
                "description": "Audit KRI",
                "current_value": 50,
                "lower_limit": 0,
                "upper_limit": 100,
                "unit": "%",
                "frequency": "quarterly",
                "reporting_owner_id": test_user.id,
                "linked_vendor_ids": [vendors[0].id, vendors[1].id, vendors[2].id],
                "ensure_parent_risk_vendor_ids": [vendors[0].id, vendors[1].id, vendors[2].id],
            },
        )
        assert create_response.status_code == 201, create_response.text
        kri_id = create_response.json()["id"]

        update_response = await client.put(
            f"/api/v1/kris/{kri_id}",
            json={"linked_vendor_ids": [vendors[0].id, vendors[1].id, vendors[3].id]},
        )
        assert update_response.status_code == 200, update_response.text

    events = await _kri_link_events(db_session)
    created_kri = [event for event in events if event.action == ActivityAction.CREATE.value]
    deleted_kri = [event for event in events if event.action == ActivityAction.DELETE.value]
    assert len(created_kri) == 4
    assert len(deleted_kri) == 1
