from __future__ import annotations

from typing import Literal

from app.core.permissions import has_permission
from app.models import Threat, User
from app.schemas.risk import RiskAssetLinkCapabilities, RiskProcessLinkCapabilities
from app.schemas.threat import ThreatCapabilities, ThreatRiskLinkCapabilities


def threat_capabilities(current_user: User, threat: Threat) -> ThreatCapabilities:
    """Per-row Threat action capabilities (ADR-001 capability SSOT).

    Threats carry no per-row ownership or department scope: visibility is the
    ``threats:read`` permission, maintenance (fields and Link relations) is
    ``threats:write`` and archive/restore is ``threats:delete`` (risk manager
    and the CRO wildcard per the RBAC seed) — mirroring Processes and Assets.
    """
    can_read = has_permission(current_user, "threats", "read")
    can_write = has_permission(current_user, "threats", "write")
    can_delete = has_permission(current_user, "threats", "delete")
    is_active = not threat.is_archived
    return ThreatCapabilities(
        can_read=bool(can_read),
        can_update=bool(can_read and can_write and is_active),
        can_archive=bool(can_read and can_delete and is_active),
        can_restore=bool(can_read and can_delete and threat.is_archived),
    )


def threat_risk_link_capabilities(
    current_user: User, *, managed_from: Literal["threat", "risk"]
) -> ThreatRiskLinkCapabilities:
    """Per-row Threat<->Risk link capabilities (ADR-001 capability SSOT).

    The link is manageable from BOTH ends, each under that end's write
    permission (the #46 managing-end precedent applied per end): the Threat
    page mutates under ``threats:write``, the Risk detail under
    ``risks:write`` — both on top of both ends' read permissions — so
    ``can_delete`` is computed for the surface doing the serializing.
    """
    write_resource = "threats" if managed_from == "threat" else "risks"
    can_delete = (
        has_permission(current_user, "threats", "read")
        and has_permission(current_user, "risks", "read")
        and has_permission(current_user, write_resource, "write")
    )
    return ThreatRiskLinkCapabilities(can_delete=bool(can_delete))


def risk_process_link_capabilities(current_user: User) -> RiskProcessLinkCapabilities:
    """Per-row Risk<->Process link capabilities — the managing end is the Risk."""
    can_delete = (
        has_permission(current_user, "risks", "read")
        and has_permission(current_user, "processes", "read")
        and has_permission(current_user, "risks", "write")
    )
    return RiskProcessLinkCapabilities(can_delete=bool(can_delete))


def risk_asset_link_capabilities(current_user: User) -> RiskAssetLinkCapabilities:
    """Per-row Risk<->Asset link capabilities — the managing end is the Risk."""
    can_delete = (
        has_permission(current_user, "risks", "read")
        and has_permission(current_user, "assets", "read")
        and has_permission(current_user, "risks", "write")
    )
    return RiskAssetLinkCapabilities(can_delete=bool(can_delete))
