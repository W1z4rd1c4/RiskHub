from __future__ import annotations

from typing import Any

from sqlalchemy.orm import selectinload

from app.models import KeyRiskIndicator, Risk
from app.schemas.risk import RiskCapabilities, RiskStatusEnum, RiskSummary
from app.schemas.vendor_shared import LinkedVendorRead


def risk_summary_load_options() -> tuple[Any, ...]:
    """Eager-load options for every relationship ``risk_to_summary`` reads.

    Co-located with the mapper so callers load exactly what it needs and never
    trigger a lazy load (which raises MissingGreenlet on the async session).
    """
    return (
        selectinload(Risk.department),
        selectinload(Risk.owner),
        selectinload(Risk.kris.and_(KeyRiskIndicator.is_archived.is_(False))),
        selectinload(Risk.control_links),
    )


def filter_active_kris(kris: list | None) -> list:
    return [kri for kri in (kris or []) if not getattr(kri, "is_archived", False)]


def active_kris_for_risk(risk: Risk) -> list:
    return filter_active_kris(getattr(risk, "kris", None) or [])


def risk_to_summary(
    risk: Risk,
    *,
    linked_vendors: list[LinkedVendorRead] | None = None,
    capabilities: RiskCapabilities | None = None,
) -> RiskSummary:
    """
    Map a Risk ORM object to the RiskSummary schema.

    This function is intentionally explicit to avoid accidental data leaks if the
    Risk table changes (e.g. new columns). Callers must apply
    ``risk_summary_load_options()`` so the relationships read here (department,
    owner, kris, control_links) are eager-loaded and never lazy-load.
    """
    kris = active_kris_for_risk(risk)
    control_links = getattr(risk, "control_links", None) or []

    return RiskSummary(
        id=risk.id,
        risk_id_code=risk.risk_id_code,
        name=risk.name,
        process=risk.process,
        subprocess=risk.subprocess,
        risk_type=risk.risk_type,
        category=risk.category,
        description=risk.description,
        gross_score=risk.gross_score,
        gross_probability=risk.gross_probability,
        gross_impact=risk.gross_impact,
        net_score=risk.net_score,
        status=RiskStatusEnum(risk.status),
        is_archived=bool(risk.is_archived),
        is_priority=bool(risk.is_priority),
        department_id=risk.department_id,
        department_name=risk.department.name if risk.department else None,
        owner_id=risk.owner_id,
        owner_name=risk.owner.name if risk.owner else None,
        kri_count=len(kris),
        control_count=len(control_links),
        has_breach=any(k.current_value < k.lower_limit or k.current_value > k.upper_limit for k in kris),
        linked_vendors=linked_vendors or [],
        capabilities=capabilities,
    )
