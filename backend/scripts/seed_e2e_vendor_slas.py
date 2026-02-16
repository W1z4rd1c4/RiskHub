"""
Phase 179-14: Deterministic Vendor SLA Seed Matrix
Seeds deterministic E2E vendor SLAs with active/archived states.
"""
import asyncio
from datetime import UTC, datetime

from sqlalchemy import func, select

from app.core.config import get_settings
from app.db.session import session_context
from app.models import Vendor, VendorSLA
from scripts.e2e_mappings import load_mappings, require_user_id


E2E_VENDOR_SLAS = [
    {
        "vendor_registration_id": "E2E-VREG-001",
        "metric_name": "E2E-SLA-001 Claims API Availability",
        "description": "Availability of claims API used for digital FNOL submission.",
        "current_value": 99.92,
        "lower_limit": 99.5,
        "upper_limit": 100.0,
        "unit": "%",
        "frequency": "monthly",
        "reporting_owner": "it.analyst@riskhub.local",
        "is_archived": False,
    },
    {
        "vendor_registration_id": "E2E-VREG-002",
        "metric_name": "E2E-SLA-002 AML Screening Turnaround",
        "description": "Median transaction screening completion time.",
        "current_value": 8.0,
        "lower_limit": 0.0,
        "upper_limit": 15.0,
        "unit": "minutes",
        "frequency": "weekly",
        "reporting_owner": "risk.manager@riskhub.local",
        "is_archived": False,
    },
    {
        "vendor_registration_id": "E2E-VREG-003",
        "metric_name": "E2E-SLA-003 Repair Estimate Lead Time",
        "description": "Time from claim creation to first repair estimate.",
        "current_value": 28.0,
        "lower_limit": 0.0,
        "upper_limit": 48.0,
        "unit": "hours",
        "frequency": "monthly",
        "reporting_owner": "ops.analyst@riskhub.local",
        "is_archived": False,
    },
    {
        "vendor_registration_id": "E2E-VREG-004",
        "metric_name": "E2E-SLA-004 Incident Response Time",
        "description": "Travel partner first response to major incident tickets.",
        "current_value": 5.0,
        "lower_limit": 0.0,
        "upper_limit": 4.0,
        "unit": "hours",
        "frequency": "monthly",
        "reporting_owner": "ops.head@riskhub.local",
        "is_archived": True,
    },
    {
        "vendor_registration_id": "E2E-VREG-005",
        "metric_name": "E2E-SLA-005 Reinsurance Feed Timeliness",
        "description": "Delay for inbound bordereaux data feeds.",
        "current_value": 2.0,
        "lower_limit": 0.0,
        "upper_limit": 1.0,
        "unit": "days",
        "frequency": "monthly",
        "reporting_owner": "risk.manager@riskhub.local",
        "is_archived": True,
    },
    {
        "vendor_registration_id": "E2E-VREG-006",
        "metric_name": "E2E-SLA-006 Report Delivery Accuracy",
        "description": "Accuracy ratio of generated regulatory reports.",
        "current_value": 99.3,
        "lower_limit": 98.0,
        "upper_limit": 100.0,
        "unit": "%",
        "frequency": "quarterly",
        "reporting_owner": "fin.analyst@riskhub.local",
        "is_archived": False,
    },
]


async def seed_vendor_slas():
    """Seed deterministic E2E vendor SLA matrix."""
    print("=" * 60)
    print("🔍 PHASE 179-14: Deterministic Vendor SLA Seed Matrix")
    print("=" * 60)

    async with session_context(get_settings()) as db:
        users, _ = await load_mappings(db)
        archive_actor_id = require_user_id(users, "risk.manager@riskhub.local")

        vendor_rows = (
            await db.execute(select(Vendor).where(Vendor.registration_id.like("E2E-VREG-%")))
        ).scalars().all()
        vendors_by_registration = {vendor.registration_id: vendor for vendor in vendor_rows}

        created = 0
        updated = 0
        now = datetime.now(UTC)

        for entry in E2E_VENDOR_SLAS:
            vendor = vendors_by_registration.get(entry["vendor_registration_id"])
            if vendor is None:
                raise RuntimeError(
                    f"Vendor '{entry['vendor_registration_id']}' missing for SLA seed '{entry['metric_name']}'."
                )

            reporting_owner_id = require_user_id(users, entry["reporting_owner"])

            result = await db.execute(
                select(VendorSLA).where(
                    VendorSLA.vendor_id == vendor.id,
                    VendorSLA.metric_name == entry["metric_name"],
                )
            )
            sla = result.scalar_one_or_none()

            archive_values = {
                "is_archived": bool(entry["is_archived"]),
                "archived_at": now if entry["is_archived"] else None,
                "archived_by_id": archive_actor_id if entry["is_archived"] else None,
            }

            payload = {
                "vendor_id": vendor.id,
                "metric_name": entry["metric_name"],
                "description": entry["description"],
                "current_value": entry["current_value"],
                "lower_limit": entry["lower_limit"],
                "upper_limit": entry["upper_limit"],
                "unit": entry["unit"],
                "frequency": entry["frequency"],
                "reporting_owner_id": reporting_owner_id,
                **archive_values,
            }

            if sla is None:
                db.add(VendorSLA(**payload))
                created += 1
                print(f"   ✓ {entry['metric_name']} ({'archived' if entry['is_archived'] else 'active'})")
            else:
                for key, value in payload.items():
                    if key == "archived_at" and sla.is_archived and value is not None and sla.archived_at is not None:
                        continue
                    setattr(sla, key, value)
                updated += 1
                print(f"   ↺ {entry['metric_name']} ({'archived' if entry['is_archived'] else 'active'})")

        await db.commit()

        total = (
            await db.execute(
                select(func.count(VendorSLA.id)).where(VendorSLA.metric_name.like("E2E-SLA-%"))
            )
        ).scalar_one()
        archived = (
            await db.execute(
                select(func.count(VendorSLA.id)).where(
                    VendorSLA.metric_name.like("E2E-SLA-%"),
                    VendorSLA.is_archived.is_(True),
                )
            )
        ).scalar_one()
        active = total - archived

        print(f"\n✅ Vendor SLAs seeded: total={total}, active={active}, archived={archived}")
        print(f"   Created={created}, updated={updated}")
        return {
            "total": total,
            "active": active,
            "archived": archived,
            "created": created,
            "updated": updated,
        }


if __name__ == "__main__":
    asyncio.run(seed_vendor_slas())
