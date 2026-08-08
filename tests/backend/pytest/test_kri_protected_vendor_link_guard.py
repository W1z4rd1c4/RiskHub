"""KRI create/update cannot link or unlink protected Vendors outside governance (#100).

`linked_vendor_ids` / `ensure_parent_risk_vendor_ids` used to write and delete
VendorKRILink / VendorRiskLink rows directly, bypassing the governed
`vendor.link.*` workflow (reason, impact lock, independent approval). The
guard rejects protected-Vendor ids on the ungoverned KRI path with a 422
directing callers to POST /api/v1/vendors/{vendor_id}/linked-kris (adds) or
DELETE /api/v1/vendors/{vendor_id}/linked-kris/{kri_id} (removes).
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalScenario,
    ApprovalStatus,
    Department,
    GovernedMutationProposal,
    KeyRiskIndicator,
    Risk,
    User,
    Vendor,
    VendorKRILink,
    VendorRiskLink,
)

pytestmark = pytest.mark.contract


async def _scenario(db: AsyncSession, *, enabled: bool = True) -> ApprovalScenario:
    scenario = ApprovalScenario(
        key="protected_vendor_edit",
        display_name="Protected Vendor mutations",
        description="Independent approval for protected Vendor mutations",
        requires_approval=enabled,
        approver_roles=["risk_manager", "cro"],
    )
    db.add(scenario)
    await db.commit()
    await db.refresh(scenario)
    return scenario


def _make_vendor(
    name: str,
    *,
    department_id: int,
    owner_id: int,
    protected: bool,
) -> Vendor:
    return Vendor(
        name=name,
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
        # "not_substitutable" derives the protected "significant" tier.
        replaceability="not_substitutable" if protected else None,
        status="active",
    )


def _make_risk(code: str, *, department_id: int, owner_id: int) -> Risk:
    return Risk(
        risk_id_code=code,
        name=f"Guard risk {code}",
        process="IT",
        subprocess=None,
        category=None,
        description="Risk for the protected-vendor KRI guard tests",
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


def _kri_payload(risk_id: int, owner_id: int, **overrides: object) -> dict[str, object]:
    return {
        "risk_id": risk_id,
        "metric_name": "Guarded KRI",
        "description": "Protected-vendor guard KRI",
        "current_value": 50,
        "lower_limit": 0,
        "upper_limit": 100,
        "unit": "%",
        "frequency": "quarterly",
        "reporting_owner_id": owner_id,
        **overrides,
    }


async def _count(db: AsyncSession, model: type) -> int:
    return (await db.execute(select(func.count()).select_from(model))).scalar_one()


async def _kri_with_link(
    db: AsyncSession,
    *,
    risk: Risk,
    vendor: Vendor,
    owner_id: int,
) -> KeyRiskIndicator:
    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name="Guarded linked KRI",
        description="Protected-vendor unlink guard KRI",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency="quarterly",
        reporting_owner_id=owner_id,
    )
    db.add(kri)
    await db.commit()
    await db.refresh(kri)
    db.add(VendorKRILink(vendor_id=vendor.id, kri_id=kri.id))
    await db.commit()
    return kri


async def _kri_link_vendor_ids(db: AsyncSession, kri_id: int) -> list[int]:
    result = await db.execute(
        select(VendorKRILink.vendor_id).where(VendorKRILink.kri_id == kri_id).order_by(VendorKRILink.vendor_id.asc())
    )
    return list(result.scalars().all())


@pytest_asyncio.fixture
async def guard_setup(
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
) -> tuple[Risk, Vendor, Vendor]:
    risk = _make_risk("KRI-GUARD-R001", department_id=test_department.id, owner_id=test_user.id)
    protected_vendor = _make_vendor(
        "Guard Protected Vendor",
        department_id=test_department.id,
        owner_id=test_user.id,
        protected=True,
    )
    normal_vendor = _make_vendor(
        "Guard Standard Vendor",
        department_id=test_department.id,
        owner_id=test_user.id,
        protected=False,
    )
    db_session.add_all([risk, protected_vendor, normal_vendor])
    await db_session.commit()
    for entity in (risk, protected_vendor, normal_vendor):
        await db_session.refresh(entity)
    return risk, protected_vendor, normal_vendor


@pytest.mark.asyncio
async def test_kri_create_rejects_protected_vendor_in_linked_vendor_ids(
    client_factory,
    db_session: AsyncSession,
    guard_setup: tuple[Risk, Vendor, Vendor],
    test_user: User,
) -> None:
    risk, protected_vendor, _ = guard_setup
    await _scenario(db_session, enabled=True)

    async with client_factory(current_user=test_user) as client:
        response = await client.post(
            "/api/v1/kris",
            json=_kri_payload(risk.id, test_user.id, linked_vendor_ids=[protected_vendor.id]),
        )

    assert response.status_code == 422, response.text
    assert "/linked-kris" in response.json()["detail"]["message"]
    assert await _count(db_session, VendorKRILink) == 0
    assert await _count(db_session, GovernedMutationProposal) == 0
    assert await _count(db_session, KeyRiskIndicator) == 0


@pytest.mark.asyncio
async def test_kri_create_rejects_protected_vendor_in_parent_risk_path(
    client_factory,
    db_session: AsyncSession,
    guard_setup: tuple[Risk, Vendor, Vendor],
    test_user: User,
) -> None:
    risk, protected_vendor, _ = guard_setup
    await _scenario(db_session, enabled=True)

    async with client_factory(current_user=test_user) as client:
        response = await client.post(
            "/api/v1/kris",
            json=_kri_payload(
                risk.id,
                test_user.id,
                linked_vendor_ids=[],
                ensure_parent_risk_vendor_ids=[protected_vendor.id],
            ),
        )

    assert response.status_code == 422, response.text
    assert "/linked-kris" in response.json()["detail"]["message"]
    assert await _count(db_session, VendorRiskLink) == 0
    assert await _count(db_session, VendorKRILink) == 0
    assert await _count(db_session, GovernedMutationProposal) == 0
    assert await _count(db_session, KeyRiskIndicator) == 0


@pytest.mark.asyncio
async def test_kri_create_still_links_non_protected_vendors_directly(
    client_factory,
    db_session: AsyncSession,
    guard_setup: tuple[Risk, Vendor, Vendor],
    test_user: User,
) -> None:
    risk, _, normal_vendor = guard_setup
    await _scenario(db_session, enabled=True)

    async with client_factory(current_user=test_user) as client:
        response = await client.post(
            "/api/v1/kris",
            json=_kri_payload(
                risk.id,
                test_user.id,
                linked_vendor_ids=[normal_vendor.id],
                ensure_parent_risk_vendor_ids=[normal_vendor.id],
            ),
        )

    assert response.status_code == 201, response.text
    kri_id = response.json()["id"]
    links = (
        (await db_session.execute(select(VendorKRILink).where(VendorKRILink.kri_id == kri_id)))
        .scalars()
        .all()
    )
    assert [link.vendor_id for link in links] == [normal_vendor.id]
    assert await _count(db_session, GovernedMutationProposal) == 0


@pytest.mark.asyncio
async def test_kri_update_rejects_adding_protected_vendor(
    client_factory,
    db_session: AsyncSession,
    guard_setup: tuple[Risk, Vendor, Vendor],
    test_user: User,
) -> None:
    risk, protected_vendor, normal_vendor = guard_setup
    await _scenario(db_session, enabled=True)

    async with client_factory(current_user=test_user) as client:
        created = await client.post(
            "/api/v1/kris",
            json=_kri_payload(risk.id, test_user.id, linked_vendor_ids=[]),
        )
        assert created.status_code == 201, created.text
        kri_id = created.json()["id"]

        rejected = await client.put(
            f"/api/v1/kris/{kri_id}",
            json={"linked_vendor_ids": [protected_vendor.id]},
        )
        assert rejected.status_code == 422, rejected.text
        assert "/linked-kris" in rejected.json()["detail"]["message"]

        allowed = await client.put(
            f"/api/v1/kris/{kri_id}",
            json={"linked_vendor_ids": [normal_vendor.id]},
        )
        assert allowed.status_code == 200, allowed.text

    links = (
        (await db_session.execute(select(VendorKRILink).where(VendorKRILink.kri_id == kri_id)))
        .scalars()
        .all()
    )
    assert [link.vendor_id for link in links] == [normal_vendor.id]
    assert await _count(db_session, GovernedMutationProposal) == 0


@pytest.mark.asyncio
async def test_kri_update_rejects_removing_protected_vendor(
    client_factory,
    db_session: AsyncSession,
    guard_setup: tuple[Risk, Vendor, Vendor],
    test_user: User,
) -> None:
    """The remove-delta mirrors governed vendor.link.kri.remove: no ungoverned unlink."""
    risk, protected_vendor, _ = guard_setup
    await _scenario(db_session, enabled=True)
    kri = await _kri_with_link(db_session, risk=risk, vendor=protected_vendor, owner_id=test_user.id)

    async with client_factory(current_user=test_user) as client:
        response = await client.put(f"/api/v1/kris/{kri.id}", json={"linked_vendor_ids": []})

    assert response.status_code == 422, response.text
    message = response.json()["detail"]["message"]
    assert "DELETE /api/v1/vendors/{vendor_id}/linked-kris/{kri_id}" in message
    assert await _kri_link_vendor_ids(db_session, kri.id) == [protected_vendor.id]
    assert await _count(db_session, GovernedMutationProposal) == 0


@pytest.mark.asyncio
async def test_kri_update_still_removes_non_protected_vendor_directly(
    client_factory,
    db_session: AsyncSession,
    guard_setup: tuple[Risk, Vendor, Vendor],
    test_user: User,
) -> None:
    risk, _, normal_vendor = guard_setup
    await _scenario(db_session, enabled=True)
    kri = await _kri_with_link(db_session, risk=risk, vendor=normal_vendor, owner_id=test_user.id)

    async with client_factory(current_user=test_user) as client:
        response = await client.put(f"/api/v1/kris/{kri.id}", json={"linked_vendor_ids": []})

    assert response.status_code == 200, response.text
    assert await _kri_link_vendor_ids(db_session, kri.id) == []
    assert await _count(db_session, GovernedMutationProposal) == 0


@pytest.mark.asyncio
async def test_approval_execution_rejects_removing_protected_vendor(
    client_factory,
    db_session: AsyncSession,
    guard_setup: tuple[Risk, Vendor, Vendor],
    test_user: User,
    test_user_cro: User,
) -> None:
    """A pre-fix in-flight KRI edit plan removing a protected Vendor 422s at execution."""
    risk, protected_vendor, _ = guard_setup
    protected_vendor_id = protected_vendor.id
    await _scenario(db_session, enabled=True)
    kri = await _kri_with_link(db_session, risk=risk, vendor=protected_vendor, owner_id=test_user.id)
    kri_id = kri.id

    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.KRI,
        resource_id=kri_id,
        resource_name=kri.metric_name,
        action_type=ApprovalActionType.EDIT,
        requested_by_id=test_user.id,
        reason="Pre-fix plan removing a protected vendor link",
        status=ApprovalStatus.PENDING,
        pending_changes={"linked_vendor_ids": {"old": [protected_vendor_id], "new": []}},
    )
    db_session.add(approval)
    await db_session.commit()
    await db_session.refresh(approval)
    approval_id = approval.id

    async with client_factory(current_user=test_user_cro) as client:
        response = await client.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Approving the pre-fix removal plan"},
        )

    assert response.status_code == 422, response.text
    message = response.json()["detail"]["message"]
    assert "DELETE /api/v1/vendors/{vendor_id}/linked-kris/{kri_id}" in message
    await db_session.rollback()
    assert await _kri_link_vendor_ids(db_session, kri_id) == [protected_vendor_id]


@pytest.mark.asyncio
async def test_missing_scenario_fails_closed_for_protected_vendor(
    client_factory,
    db_session: AsyncSession,
    guard_setup: tuple[Risk, Vendor, Vendor],
    test_user: User,
) -> None:
    """No fixed scenario row + protected tier raises the governed configuration error."""
    risk, protected_vendor, _ = guard_setup
    # Intentionally no _scenario(): the fixed protected-Vendor scenario row is missing.

    async with client_factory(current_user=test_user) as client:
        response = await client.post(
            "/api/v1/kris",
            json=_kri_payload(risk.id, test_user.id, linked_vendor_ids=[protected_vendor.id]),
        )

    assert response.status_code == 500, response.text
    assert "The fixed protected Vendor approval scenario is missing" in response.json()["detail"]
    assert await _count(db_session, VendorKRILink) == 0
    assert await _count(db_session, KeyRiskIndicator) == 0
    assert await _count(db_session, GovernedMutationProposal) == 0


@pytest.mark.asyncio
async def test_guard_is_inert_when_fixed_scenario_is_disabled(
    client_factory,
    db_session: AsyncSession,
    guard_setup: tuple[Risk, Vendor, Vendor],
    test_user: User,
) -> None:
    """Same predicate as the governed route: no approval scenario, no guard."""
    risk, protected_vendor, _ = guard_setup
    await _scenario(db_session, enabled=False)

    async with client_factory(current_user=test_user) as client:
        response = await client.post(
            "/api/v1/kris",
            json=_kri_payload(risk.id, test_user.id, linked_vendor_ids=[protected_vendor.id]),
        )

    assert response.status_code == 201, response.text
    assert await _count(db_session, VendorKRILink) == 1
