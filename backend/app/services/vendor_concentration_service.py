from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Vendor
from app.models.vendor_relationship import VendorRelationship
from app.models.vendor_service import VendorDependency, VendorService


@dataclass(frozen=True)
class ConcentrationResult:
    score: int
    flags: list[dict]


class VendorConcentrationService:
    """
    Simple v1 heuristic concentration risk scoring.

    This is intentionally lightweight and deterministic; expand later without breaking API.
    """

    @staticmethod
    async def compute(db: AsyncSession, *, vendor: Vendor) -> ConcentrationResult:
        flags: list[dict] = []
        score = 0

        if vendor.replaceability == "hard":
            score += 3
            flags.append({"key": "hard_to_replace", "severity": "high", "reason": "Vendor is marked hard to replace."})
        elif vendor.replaceability == "medium":
            score += 1
            flags.append(
                {"key": "moderate_replaceability", "severity": "medium", "reason": "Vendor is moderately replaceable."}
            )

        if vendor.supports_important_core_insurance_function:
            score += 2
            flags.append(
                {
                    "key": "supports_core_function",
                    "severity": "high",
                    "reason": "Vendor supports important/core functions.",
                }
            )

        if vendor.dora_relevant:
            score += 1
            flags.append({"key": "dora_relevant", "severity": "medium", "reason": "Vendor is DORA relevant."})

        rels = (
            (await db.execute(select(VendorRelationship).where(VendorRelationship.vendor_id == vendor.id)))
            .scalars()
            .all()
        )
        if rels:
            score += 1
            flags.append(
                {"key": "has_fourth_parties", "severity": "medium", "reason": "Vendor has fourth-party relationships."}
            )

        services = (await db.execute(select(VendorService).where(VendorService.vendor_id == vendor.id))).scalars().all()
        service_ids = [s.id for s in services]
        dependencies: list[VendorDependency] = []
        if service_ids:
            dependencies = (
                (await db.execute(select(VendorDependency).where(VendorDependency.vendor_service_id.in_(service_ids))))
                .scalars()
                .all()
            )

        dept_ids = {d.department_id for d in dependencies if d.department_id is not None}
        if len(dept_ids) >= 2:
            score += 2
            flags.append(
                {
                    "key": "multi_department_dependency",
                    "severity": "high",
                    "reason": "Vendor supports functions across multiple departments.",
                }
            )
        elif len(dept_ids) == 1:
            score += 1

        if vendor.supports_important_core_insurance_function and len(dependencies) >= 2:
            score += 1
            flags.append(
                {
                    "key": "multiple_critical_dependencies",
                    "severity": "medium",
                    "reason": "Multiple dependencies recorded for a critical vendor.",
                }
            )

        score = max(0, min(10, score))
        return ConcentrationResult(score=score, flags=flags)
