"""
Phase 179-15: Deterministic Archive Matrix Seeding
Ensures active/archived pairs across all archive-capable entity families.
"""

import asyncio

from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.datetime_utils import utc_now
from app.db.session import session_context
from app.models import Control, ControlRiskLink, KeyRiskIndicator, Risk, Vendor
from scripts.e2e_mappings import load_mappings, require_department_id, require_user_id

RISK_MATRIX = [
    {
        "risk_id_code": "E2E-ARCH-RISK-ACTIVE",
        "name": "E2E-ARCH-RISK Active Risk Pair",
        "description": "Archive matrix active risk counterpart for deterministic E2E restore tests.",
        "process": "Risk Management",
        "subprocess": "Archive Matrix",
        "risk_type": "operational",
        "category": "Operational Risk",
        "dept": "Risk Management",
        "owner": "risk.manager@riskhub.local",
        "is_priority": False,
        "gross_probability": 3,
        "gross_impact": 3,
        "net_probability": 2,
        "net_impact": 2,
        "status": "active",
    },
    {
        "risk_id_code": "E2E-ARCH-RISK-ARCHIVED",
        "name": "E2E-ARCH-RISK Archived Risk Pair",
        "description": "Archive matrix archived risk counterpart for deterministic E2E restore tests.",
        "process": "Risk Management",
        "subprocess": "Archive Matrix",
        "risk_type": "operational",
        "category": "Operational Risk",
        "dept": "Risk Management",
        "owner": "risk.manager@riskhub.local",
        "is_priority": False,
        "gross_probability": 4,
        "gross_impact": 3,
        "net_probability": 3,
        "net_impact": 2,
        "status": "archived",
    },
]

CONTROL_MATRIX = [
    {
        "name": "E2E-ARCH-CTRL Active Control Pair",
        "description": "Archive matrix active control counterpart for deterministic E2E restore tests.",
        "dept": "Risk Management",
        "owner": "risk.manager@riskhub.local",
        "status": "active",
        "risk_code": "E2E-ARCH-RISK-ACTIVE",
    },
    {
        "name": "E2E-ARCH-CTRL Archived Control Pair",
        "description": "Archive matrix archived control counterpart for deterministic E2E restore tests.",
        "dept": "Risk Management",
        "owner": "risk.manager@riskhub.local",
        "status": "archived",
        "risk_code": "E2E-ARCH-RISK-ARCHIVED",
    },
]

KRI_MATRIX = [
    {
        "metric_name": "E2E-ARCH-KRI Active Pair",
        "description": "Archive matrix active KRI counterpart for deterministic E2E restore tests.",
        "risk_code": "E2E-ARCH-RISK-ACTIVE",
        "reporting_owner": "risk.manager@riskhub.local",
        "current_value": 42.0,
        "lower_limit": 0.0,
        "upper_limit": 80.0,
        "unit": "%",
        "frequency": "monthly",
        "is_archived": False,
    },
    {
        "metric_name": "E2E-ARCH-KRI Archived Pair",
        "description": "Archive matrix archived KRI counterpart for deterministic E2E restore tests.",
        "risk_code": "E2E-ARCH-RISK-ACTIVE",
        "reporting_owner": "risk.manager@riskhub.local",
        "current_value": 86.0,
        "lower_limit": 0.0,
        "upper_limit": 80.0,
        "unit": "%",
        "frequency": "monthly",
        "is_archived": True,
    },
]

VENDOR_STATUS_MATRIX = [
    {"registration_id": "E2E-VREG-001", "status": "active"},
    {"registration_id": "E2E-VREG-004", "status": "inactive"},
]


async def _ensure_risk_matrix(db, users, departments):
    created = 0
    updated = 0

    for entry in RISK_MATRIX:
        owner_id = require_user_id(users, entry["owner"])
        department_id = require_department_id(departments, entry["dept"])
        gross_score = entry["gross_probability"] * entry["gross_impact"]
        net_score = entry["net_probability"] * entry["net_impact"]

        result = await db.execute(select(Risk).where(Risk.risk_id_code == entry["risk_id_code"]))
        risk = result.scalar_one_or_none()
        payload = {
            "risk_id_code": entry["risk_id_code"],
            "name": entry["name"],
            "description": entry["description"],
            "process": entry["process"],
            "subprocess": entry["subprocess"],
            "risk_type": entry["risk_type"],
            "category": entry["category"],
            "department_id": department_id,
            "owner_id": owner_id,
            "is_priority": entry["is_priority"],
            "gross_probability": entry["gross_probability"],
            "gross_impact": entry["gross_impact"],
            "gross_score": gross_score,
            "net_probability": entry["net_probability"],
            "net_impact": entry["net_impact"],
            "net_score": net_score,
            "status": entry["status"],
        }

        if risk is None:
            db.add(Risk(**payload))
            created += 1
        else:
            for key, value in payload.items():
                setattr(risk, key, value)
            updated += 1

    return created, updated


async def _ensure_control_matrix(db, users, departments):
    created = 0
    updated = 0
    links_created = 0

    for entry in CONTROL_MATRIX:
        owner_id = require_user_id(users, entry["owner"])
        department_id = require_department_id(departments, entry["dept"])

        risk = (await db.execute(select(Risk).where(Risk.risk_id_code == entry["risk_code"]))).scalar_one_or_none()
        if risk is None:
            raise RuntimeError(f"Archive matrix control '{entry['name']}' requires risk '{entry['risk_code']}'.")

        result = await db.execute(select(Control).where(Control.name == entry["name"]))
        control = result.scalar_one_or_none()
        payload = {
            "name": entry["name"],
            "description": entry["description"],
            "department_id": department_id,
            "control_owner_id": owner_id,
            "frequency": "monthly",
            "control_form": "manual",
            "risk_level": 3,
            "status": entry["status"],
        }

        if control is None:
            control = Control(**payload)
            db.add(control)
            await db.flush()
            created += 1
        else:
            for key, value in payload.items():
                setattr(control, key, value)
            updated += 1

        existing_link = (
            await db.execute(
                select(ControlRiskLink).where(
                    ControlRiskLink.control_id == control.id,
                    ControlRiskLink.risk_id == risk.id,
                )
            )
        ).scalar_one_or_none()
        if existing_link is None:
            db.add(
                ControlRiskLink(
                    control_id=control.id,
                    risk_id=risk.id,
                    effectiveness="high",
                )
            )
            links_created += 1

    return created, updated, links_created


async def _ensure_kri_matrix(db, users):
    created = 0
    updated = 0
    now = utc_now()
    archive_actor_id = require_user_id(users, "risk.manager@riskhub.local")

    for entry in KRI_MATRIX:
        reporting_owner_id = require_user_id(users, entry["reporting_owner"])
        risk = (await db.execute(select(Risk).where(Risk.risk_id_code == entry["risk_code"]))).scalar_one_or_none()
        if risk is None:
            raise RuntimeError(f"Archive matrix KRI '{entry['metric_name']}' requires risk '{entry['risk_code']}'.")

        result = await db.execute(select(KeyRiskIndicator).where(KeyRiskIndicator.metric_name == entry["metric_name"]))
        kri = result.scalar_one_or_none()
        payload = {
            "metric_name": entry["metric_name"],
            "description": entry["description"],
            "risk_id": risk.id,
            "reporting_owner_id": reporting_owner_id,
            "current_value": entry["current_value"],
            "lower_limit": entry["lower_limit"],
            "upper_limit": entry["upper_limit"],
            "unit": entry["unit"],
            "frequency": entry["frequency"],
            "is_archived": entry["is_archived"],
            "archived_at": now if entry["is_archived"] else None,
            "archived_by_id": archive_actor_id if entry["is_archived"] else None,
        }

        if kri is None:
            db.add(KeyRiskIndicator(**payload))
            created += 1
        else:
            for key, value in payload.items():
                if key == "archived_at" and kri.is_archived and value is not None and kri.archived_at is not None:
                    continue
                setattr(kri, key, value)
            updated += 1

    return created, updated


async def _ensure_vendor_matrix(db):
    updated = 0
    for entry in VENDOR_STATUS_MATRIX:
        vendor = (
            await db.execute(select(Vendor).where(Vendor.registration_id == entry["registration_id"]))
        ).scalar_one_or_none()
        if vendor is None:
            raise RuntimeError(
                f"Archive matrix requires seeded vendor '{entry['registration_id']}'. " "Run seed_e2e_vendors first."
            )
        vendor.status = entry["status"]
        updated += 1
    return updated


async def seed_archives():
    """Seed deterministic archive matrix across all supported entity families."""
    print("=" * 60)
    print("🔍 PHASE 179-15: Deterministic Archive Matrix Seeding")
    print("=" * 60)

    async with session_context(get_settings()) as db:
        users, departments = await load_mappings(db)

        risk_created, risk_updated = await _ensure_risk_matrix(db, users, departments)
        control_created, control_updated, control_links_created = await _ensure_control_matrix(db, users, departments)
        kri_created, kri_updated = await _ensure_kri_matrix(db, users)
        vendors_updated = await _ensure_vendor_matrix(db)
        await db.commit()

        risks_active = (
            await db.execute(
                select(func.count(Risk.id)).where(
                    Risk.risk_id_code.like("E2E-ARCH-RISK-%"),
                    Risk.status != "archived",
                )
            )
        ).scalar_one()
        risks_archived = (
            await db.execute(
                select(func.count(Risk.id)).where(
                    Risk.risk_id_code.like("E2E-ARCH-RISK-%"),
                    Risk.status == "archived",
                )
            )
        ).scalar_one()
        controls_active = (
            await db.execute(
                select(func.count(Control.id)).where(
                    Control.name.like("E2E-ARCH-CTRL%"),
                    Control.status != "archived",
                )
            )
        ).scalar_one()
        controls_archived = (
            await db.execute(
                select(func.count(Control.id)).where(
                    Control.name.like("E2E-ARCH-CTRL%"),
                    Control.status == "archived",
                )
            )
        ).scalar_one()
        kris_active = (
            await db.execute(
                select(func.count(KeyRiskIndicator.id)).where(
                    KeyRiskIndicator.metric_name.like("E2E-ARCH-KRI%"),
                    KeyRiskIndicator.is_archived.is_(False),
                )
            )
        ).scalar_one()
        kris_archived = (
            await db.execute(
                select(func.count(KeyRiskIndicator.id)).where(
                    KeyRiskIndicator.metric_name.like("E2E-ARCH-KRI%"),
                    KeyRiskIndicator.is_archived.is_(True),
                )
            )
        ).scalar_one()
        vendors_active = (
            await db.execute(
                select(func.count(Vendor.id)).where(
                    Vendor.registration_id.in_([item["registration_id"] for item in VENDOR_STATUS_MATRIX]),
                    Vendor.status == "active",
                )
            )
        ).scalar_one()
        vendors_archived = (
            await db.execute(
                select(func.count(Vendor.id)).where(
                    Vendor.registration_id.in_([item["registration_id"] for item in VENDOR_STATUS_MATRIX]),
                    Vendor.status == "inactive",
                )
            )
        ).scalar_one()
        print("\n✅ Archive matrix ready")
        print(f"   Risks active/archived: {risks_active}/{risks_archived}")
        print(f"   Controls active/archived: {controls_active}/{controls_archived}")
        print(f"   KRIs active/archived: {kris_active}/{kris_archived}")
        print(f"   Vendors active/inactive: {vendors_active}/{vendors_archived}")

        return {
            "risk_created": risk_created,
            "risk_updated": risk_updated,
            "control_created": control_created,
            "control_updated": control_updated,
            "control_links_created": control_links_created,
            "kri_created": kri_created,
            "kri_updated": kri_updated,
            "vendors_updated": vendors_updated,
            "matrix": {
                "risks_active": risks_active,
                "risks_archived": risks_archived,
                "controls_active": controls_active,
                "controls_archived": controls_archived,
                "kris_active": kris_active,
                "kris_archived": kris_archived,
                "vendors_active": vendors_active,
                "vendors_archived": vendors_archived,
            },
        }


if __name__ == "__main__":
    asyncio.run(seed_archives())
