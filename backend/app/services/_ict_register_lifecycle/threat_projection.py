from __future__ import annotations

from app.core.security import check_permission
from app.models import Threat, User
from app.models.role import RoleType
from app.schemas.threat import ThreatListCapabilities, ThreatListResponse, ThreatRead, ThreatStewardRead
from app.services._authorization_capabilities import threat_capabilities


def serialize_threat_detail(
    threat: Threat,
    *,
    current_user: User,
    stewardship_pending: bool = False,
) -> ThreatRead:
    """Project a Threat row with its per-row capabilities (ADR-001 SSOT).

    Threats sit outside the criticality cascade, so — unlike Processes and
    Assets — there is no engine-derived block to attach (compute-on-read has
    nothing to compute here).
    """
    steward = threat.threat_steward
    steward_projection = None
    if steward is not None:
        steward_projection = ThreatStewardRead(
            name=steward.name,
            email=steward.email,
            role_name=steward.role.name,
            department_name=steward.department.name if steward.department is not None else None,
        )
    base = ThreatRead.model_validate(
        {column.name: getattr(threat, column.name) for column in Threat.__table__.columns}
    )
    steward_is_eligible = bool(
        steward is not None
        and steward.is_active
        and steward.role.is_active
        and steward.role.name == RoleType.CISO
    )
    if stewardship_pending:
        stewardship_status = "pending_governance"
    elif steward is None:
        stewardship_status = "legacy_unassigned"
    elif steward_is_eligible:
        stewardship_status = "assigned"
    else:
        stewardship_status = "invalid_assignment"

    return base.model_copy(
        update={
            "threat_steward": steward_projection,
            # This compatibility flag represents an actual pending Governance
            # workflow. A migrated NULL is an assignable legacy gap and must
            # not direct users to an empty Governance queue.
            "steward_orphaned": stewardship_pending,
            "stewardship_status": stewardship_status,
            "capabilities": threat_capabilities(
                current_user,
                threat,
                stewardship_pending=stewardship_pending,
            ),
        }
    )


def build_threat_collection_capabilities(current_user: User) -> ThreatListCapabilities:
    return ThreatListCapabilities(can_create=check_permission(current_user, "threats", "write"))


def serialize_threat_list(
    threats: list[Threat],
    *,
    current_user: User,
    total: int,
    offset: int,
    limit: int,
    pending_stewardship_orphan_ids: set[int] | None = None,
) -> ThreatListResponse:
    pending_ids = pending_stewardship_orphan_ids or set()
    return ThreatListResponse(
        items=[
            serialize_threat_detail(
                threat,
                current_user=current_user,
                stewardship_pending=threat.id in pending_ids,
            )
            for threat in threats
        ],
        total=total,
        offset=offset,
        limit=limit,
        capabilities=build_threat_collection_capabilities(current_user),
    )
