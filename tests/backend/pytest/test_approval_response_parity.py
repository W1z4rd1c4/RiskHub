from __future__ import annotations

from uuid import UUID

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalScenario,
    ApprovalStatus,
    Department,
    GovernedMutationImpactLock,
    Process,
    Risk,
    User,
)
from app.services._governed_mutations.process_identity import (
    new_governed_process_proposal,
)
from app.services._ict_register_lifecycle.projection import (
    load_governed_process_derived_blocks,
)

pytestmark = pytest.mark.contract


APPROVAL_READ_KEYS = {
    "id",
    "resource_type",
    "resource_id",
    "resource_name",
    "action_type",
    "pending_changes",
    "status",
    "reason",
    "requested_by_id",
    "requested_by_name",
    "requested_by_email",
    "resolved_by_id",
    "resolved_by_name",
    "resolved_at",
    "resolution_notes",
    "created_at",
    "can_approve",
    "can_reject",
    "capabilities",
    "governed_mutation",
}


async def _create_pending_approval(
    db_session: AsyncSession,
    *,
    risk: Risk,
    requester: User,
) -> ApprovalRequest:
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
        resource_name=risk.name,
        action_type=ApprovalActionType.EDIT,
        pending_changes=None,
        requested_by_id=requester.id,
        reason="Response parity approval",
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval)
    await db_session.commit()
    await db_session.refresh(approval)
    return approval


async def _create_pending_governed_process_approval(
    db_session: AsyncSession,
    *,
    requester: User,
    department: Department,
) -> ApprovalRequest:
    process = Process(
        f_code="F-PARITY",
        l0_area="Operations",
        l1_process="Approval parity",
        process_owner_user_id=requester.id,
        owning_department_id=department.id,
        impact_client=5,
        impact_market_operations=5,
        impact_regulatory=5,
        impact_financial=5,
        impact_reputational=5,
        cif_override="yes",
        notes="Before review",
    )
    scenario = ApprovalScenario(
        key="protected_process_edit",
        display_name="Protected Process edit",
        description="Independent approval for CIF Process edits",
        requires_approval=True,
        approver_roles=["risk_manager"],
    )
    db_session.add_all([process, scenario])
    await db_session.flush()

    process_name = f"{process.f_code} — {process.l1_process}"
    pending_changes = {"notes": {"old": "Before review", "new": "After independent review"}}
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.PROCESS,
        resource_id=process.id,
        resource_name=process_name,
        action_type=ApprovalActionType.EDIT,
        pending_changes=pending_changes,
        scenario_key="protected_process_edit",
        scenario_approver_roles=["risk_manager"],
        requested_by_id=requester.id,
        reason="Governed response parity approval",
        status=ApprovalStatus.PENDING,
        requires_privileged_approval=False,
    )
    db_session.add(approval)
    await db_session.flush()

    current_impact, proposed_impact = await load_governed_process_derived_blocks(
        db_session,
        process,
        updates={"notes": "After independent review"},
    )
    proposal = new_governed_process_proposal(
        approval_request_id=approval.id,
        requested_by_id=requester.id,
        process_id=process.id,
        process_name=process_name,
        approver_roles=["risk_manager"],
        base_governance_version=process.governance_version,
        before_snapshot={"notes": "Before review"},
        after_snapshot={"notes": "After independent review"},
        raw_before={"notes": "Before review"},
        raw_after={"notes": "After independent review"},
        derived_impact_snapshot={
            "before": {
                "cif": current_impact.cif,
                "criticality_class": current_impact.criticality_class,
            },
            "after": {
                "cif": proposed_impact.cif,
                "criticality_class": proposed_impact.criticality_class,
            },
        },
    )
    db_session.add(proposal)
    await db_session.flush()
    db_session.add(
        GovernedMutationImpactLock(
            proposal_id=proposal.id,
            resource_type="process",
            resource_id=process.id,
            base_governance_version=process.governance_version,
        )
    )
    await db_session.commit()
    await db_session.refresh(approval)
    return approval


def _assert_governed_process_read(body: dict[str, object]) -> None:
    governed = body["governed_mutation"]
    assert isinstance(governed, dict)
    assert set(governed) == {
        "proposal_id",
        "proposal_version",
        "mutation_kind",
        "before",
        "after",
        "derived_impact",
        "impacted_resources",
        "relationship_change",
    }
    proposal_id = governed["proposal_id"]
    assert isinstance(proposal_id, str)
    assert str(UUID(proposal_id)) == proposal_id
    assert governed["proposal_version"] == 1
    assert governed["mutation_kind"] == "process.edit"
    assert governed["before"] == {"notes": "Before review"}
    assert governed["after"] == {"notes": "After independent review"}
    derived_impact = governed["derived_impact"]
    assert isinstance(derived_impact, dict)
    assert set(derived_impact) == {"before", "after"}
    for impact in derived_impact.values():
        assert isinstance(impact, dict)
        assert set(impact) == {"cif", "criticality_class"}
        assert impact["cif"] == "yes"
        assert impact["criticality_class"] in {
            "low",
            "medium",
            "high",
            "critical",
            None,
        }
    assert governed["impacted_resources"] == [
        {"resource_type": "process", "resource_name": "F-PARITY — Approval parity"}
    ]
    assert governed["relationship_change"] is None
    assert body["pending_changes"] == {"notes": {"old": "Before review", "new": "After independent review"}}
    # Operational and authorization identifiers must not leak into the actor-facing snapshot.
    assert "resource_id" not in governed["impacted_resources"][0]
    assert set(governed["before"]) == {"notes"}
    assert set(governed["after"]) == {"notes"}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "path_template", "json_body"),
    (
        (
            "post",
            "/api/v1/approvals/{approval_id}/approve",
            {"resolution_notes": "Approve parity"},
        ),
        (
            "post",
            "/api/v1/approvals/{approval_id}/reject",
            {"resolution_notes": "Reject parity"},
        ),
        ("post", "/api/v1/approvals/{approval_id}/cancel", None),
        ("get", "/api/v1/approvals/{approval_id}", None),
    ),
)
async def test_approval_resolution_and_detail_endpoints_return_same_read_shape(
    client_factory,
    db_session: AsyncSession,
    test_risk: Risk,
    test_user_employee: User,
    test_user_cro: User,
    method: str,
    path_template: str,
    json_body: dict[str, str] | None,
) -> None:
    approval = await _create_pending_approval(
        db_session,
        risk=test_risk,
        requester=test_user_employee,
    )

    async with client_factory(current_user=test_user_cro) as client:
        request = getattr(client, method)
        path = path_template.format(approval_id=approval.id)
        response = await request(path, json=json_body) if json_body is not None else await request(path)

    assert response.status_code == 200
    body = response.json()
    assert set(body) == APPROVAL_READ_KEYS
    assert body["governed_mutation"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "path_template", "json_body", "expected_status"),
    (
        (
            "post",
            "/api/v1/approvals/{approval_id}/approve",
            {"resolution_notes": "Approve parity"},
            "approved",
        ),
        (
            "post",
            "/api/v1/approvals/{approval_id}/reject",
            {"resolution_notes": "Reject parity"},
            "rejected",
        ),
        ("post", "/api/v1/approvals/{approval_id}/cancel", None, "cancelled"),
        ("get", "/api/v1/approvals/{approval_id}", None, "pending"),
    ),
)
async def test_governed_approval_endpoints_return_same_safe_read_shape(
    client_factory,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
    test_user_risk_manager: User,
    method: str,
    path_template: str,
    json_body: dict[str, str] | None,
    expected_status: str,
) -> None:
    approval = await _create_pending_governed_process_approval(
        db_session,
        requester=test_user_cro,
        department=test_department,
    )
    actor = test_user_cro if path_template.endswith("/cancel") else test_user_risk_manager

    async with client_factory(current_user=actor) as client:
        request = getattr(client, method)
        path = path_template.format(approval_id=approval.id)
        response = await request(path, json=json_body) if json_body is not None else await request(path)

    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == APPROVAL_READ_KEYS
    assert body["status"] == expected_status
    _assert_governed_process_read(body)
