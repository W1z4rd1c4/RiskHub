"""Approvals list/detail HTTP-seam contract for the six vendor.link.* kinds (#99).

The governed_mutation payloads asserted here are the authoritative shapes for
the frontend fixtures in
tests/frontend/unit/src/services/fixtures/vendorLinkApprovals/: a point
derived impact (identical before/after Vendor tier block) plus the
relationship change, for requester and resolver alike.
"""

from __future__ import annotations

from typing import NamedTuple

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ApprovalScenario,
    KRIFrequency,
    Permission,
    Risk,
    Role,
    RolePermission,
    User,
)
from tests.backend.pytest.factories import create_test_control, create_test_kri

VENDOR_LINK_KINDS = (
    "vendor.link.risk.add",
    "vendor.link.risk.remove",
    "vendor.link.control.add",
    "vendor.link.control.remove",
    "vendor.link.kri.add",
    "vendor.link.kri.remove",
)


class LinkTarget(NamedTuple):
    """A linkable entity plus the two labels the approvals seam projects for it."""

    entity_id: int
    submitted_label: str  # snapshotted into the proposal's before/after relationship_target
    live_label: str  # resolved live for relationship_change.target_resource_name


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


async def _grant(db: AsyncSession, role: Role, resource: str, action: str) -> None:
    perm = Permission(resource=resource, action=action, description=f"{resource}:{action}")
    db.add(perm)
    await db.commit()
    await db.refresh(perm)
    db.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await db.commit()
    db.expire(role, ["permissions"])


def _vendor_payload(owner: User, *, name: str) -> dict[str, object]:
    return {
        "name": name,
        "process": "Operations",
        "outsourcing_owner_user_id": owner.id,
        "department_id": owner.department_id,
        "replaceability": "not_substitutable",
    }


def _expected_governed_mutation(
    kind: str,
    *,
    vendor_name: str,
    submitted_label: str,
    live_label: str,
) -> dict[str, object]:
    """The exact governed_mutation payload the approvals seam must serve."""
    _, _, resource, action = kind.split(".")
    adding = action == "add"
    before = {
        f"linked_{resource}": not adding,
        "relationship_target": None if adding else submitted_label,
    }
    after = {
        f"linked_{resource}": adding,
        "relationship_target": submitted_label if adding else None,
    }
    return {
        "proposal_version": 1,
        "mutation_kind": kind,
        "before": before,
        "after": after,
        "derived_impact": {
            "before": {"tier": "significant"},
            "after": {"tier": "significant"},
        },
        "impacted_resources": [
            {"resource_type": "vendor", "resource_name": vendor_name}
        ],
        "relationship_change": {
            "target_resource_type": resource,
            "target_resource_name": live_label,
            "action": action,
            "before": before,
            "after": after,
        },
    }


def _assert_governed_payload(item: dict, expected: dict[str, object], context: str = "") -> None:
    governed = dict(item["governed_mutation"])
    proposal_id = governed.pop("proposal_id")
    assert isinstance(proposal_id, str) and proposal_id
    assert governed == expected, context
    # The row-level projection mirrors the proposal as actor-safe old/new pairs.
    assert item["pending_changes"] == {
        field: {"old": expected["before"][field], "new": expected["after"][field]}
        for field in expected["before"]
    }


@pytest.mark.asyncio
async def test_vendor_link_approvals_serve_point_impact_for_all_six_kinds(
    client_factory,
    db_session: AsyncSession,
    test_risk: Risk,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    """List AND detail serve the identical-tier point impact for every kind."""
    assert test_user_risk_manager.id != test_user_cro.id
    scenario = await _scenario(db_session, enabled=False)
    # The resolver reads Vendors and Controls so labels project as business
    # names instead of the "Restricted ..." fallbacks for invisible records.
    await _grant(db_session, test_user_risk_manager.role, "vendors", "read")
    await _grant(db_session, test_user_risk_manager.role, "controls", "read")

    control = await create_test_control(
        db_session,
        department_id=test_user_cro.department_id,
        owner_id=None,
        name="Access review control",
        overrides={
            "description": "Test control",
            "control_form": "manual",
            "frequency": "monthly",
            "risk_level": 3,
            "status": "draft",
        },
    )
    kri = await create_test_kri(
        db_session,
        risk_id=test_risk.id,
        metric_name="Provider incident rate",
        overrides={
            "description": "Provider incident rate description",
            "lower_limit": 10,
            "upper_limit": 90,
            "frequency": KRIFrequency.monthly.value,
        },
    )

    link_targets = {
        "risk": LinkTarget(
            test_risk.id, f"{test_risk.risk_id_code}: {test_risk.name}", test_risk.name
        ),
        "control": LinkTarget(control.id, control.name, control.name),
        "kri": LinkTarget(kri.id, kri.metric_name, kri.metric_name),
    }

    vendor_ids: dict[str, int] = {}
    async with client_factory(user=test_user_cro) as requester:
        for kind in VENDOR_LINK_KINDS:
            created = await requester.post(
                "/api/v1/vendors",
                json=_vendor_payload(test_user_cro, name=f"Seam Vendor {kind}"),
            )
            assert created.status_code == 201, created.text
            vendor_ids[kind] = created.json()["id"]
        # Pre-existing links so the remove kinds have something to unlink.
        for resource in ("risk", "control", "kri"):
            linked = await requester.post(
                f"/api/v1/vendors/{vendor_ids[f'vendor.link.{resource}.remove']}/linked-{resource}s",
                json={f"{resource}_id": link_targets[resource].entity_id},
            )
            assert linked.status_code == 201, linked.text

    scenario.requires_approval = True
    await db_session.commit()

    approval_ids: dict[str, int] = {}
    async with client_factory(user=test_user_cro) as requester:
        for kind in VENDOR_LINK_KINDS:
            _, _, resource, action = kind.split(".")
            entity_id = link_targets[resource].entity_id
            if action == "add":
                submitted = await requester.post(
                    f"/api/v1/vendors/{vendor_ids[kind]}/linked-{resource}s",
                    json={
                        f"{resource}_id": entity_id,
                        "request_reason": f"Review {kind} relationship",
                    },
                )
            else:
                submitted = await requester.request(
                    "DELETE",
                    f"/api/v1/vendors/{vendor_ids[kind]}/linked-{resource}s/{entity_id}",
                    json={"request_reason": f"Review {kind} relationship"},
                )
            assert submitted.status_code == 202, submitted.text
            approval_ids[kind] = submitted.json()["approval_id"]

    expected = {
        kind: _expected_governed_mutation(
            kind,
            vendor_name=f"Seam Vendor {kind}",
            submitted_label=link_targets[kind.split(".")[2]].submitted_label,
            live_label=link_targets[kind.split(".")[2]].live_label,
        )
        for kind in VENDOR_LINK_KINDS
    }

    async with client_factory(user=test_user_cro) as requester:
        requester_list = await requester.get(
            "/api/v1/approvals?status=pending&my_requests=true&resource_type=vendor"
        )
        requester_details = {
            kind: await requester.get(f"/api/v1/approvals/{approval_ids[kind]}")
            for kind in VENDOR_LINK_KINDS
        }
    async with client_factory(user=test_user_risk_manager) as resolver:
        resolver_list = await resolver.get(
            "/api/v1/approvals?status=pending&resource_type=vendor"
        )
        resolver_details = {
            kind: await resolver.get(f"/api/v1/approvals/{approval_ids[kind]}")
            for kind in VENDOR_LINK_KINDS
        }

    for viewer, response in (("requester", requester_list), ("resolver", resolver_list)):
        assert response.status_code == 200, response.text
        assert response.json()["total"] == len(VENDOR_LINK_KINDS)
        items = {item["id"]: item for item in response.json()["items"]}
        for kind in VENDOR_LINK_KINDS:
            item = items[approval_ids[kind]]
            assert item["resource_type"] == "vendor"
            assert item["resource_name"] == f"Seam Vendor {kind}"
            assert item["action_type"] == "edit"
            assert item["status"] == "pending"
            _assert_governed_payload(item, expected[kind], f"list:{viewer}:{kind}")

    for viewer, details in (("requester", requester_details), ("resolver", resolver_details)):
        for kind in VENDOR_LINK_KINDS:
            detail = details[kind]
            assert detail.status_code == 200, detail.text
            body = detail.json()
            assert body["id"] == approval_ids[kind]
            assert body["resource_type"] == "vendor"
            assert body["action_type"] == "edit"
            _assert_governed_payload(body, expected[kind], f"detail:{viewer}:{kind}")
