from __future__ import annotations

from app.core.security import check_permission
from app.models import Threat, User
from app.schemas.threat import ThreatListCapabilities, ThreatListResponse, ThreatRead
from app.services._authorization_capabilities import threat_capabilities


def serialize_threat_detail(threat: Threat, *, current_user: User) -> ThreatRead:
    """Project a Threat row with its per-row capabilities (ADR-001 SSOT).

    Threats sit outside the criticality cascade, so — unlike Processes and
    Assets — there is no engine-derived block to attach (compute-on-read has
    nothing to compute here).
    """
    base = ThreatRead.model_validate(threat)
    return base.model_copy(update={"capabilities": threat_capabilities(current_user, threat)})


def build_threat_collection_capabilities(current_user: User) -> ThreatListCapabilities:
    return ThreatListCapabilities(can_create=check_permission(current_user, "threats", "write"))


def serialize_threat_list(
    threats: list[Threat],
    *,
    current_user: User,
    total: int,
    offset: int,
    limit: int,
) -> ThreatListResponse:
    return ThreatListResponse(
        items=[serialize_threat_detail(threat, current_user=current_user) for threat in threats],
        total=total,
        offset=offset,
        limit=limit,
        capabilities=build_threat_collection_capabilities(current_user),
    )
