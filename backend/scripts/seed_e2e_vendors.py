"""
Phase 179-13: Deterministic Vendor Seed Matrix
Seeds deterministic E2E vendors with active/archived states.
"""

import asyncio

from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.datetime_utils import utc_now
from app.db.session import session_context
from app.models import Vendor
from scripts.e2e_mappings import load_mappings, require_department_id, require_user_id

E2E_VENDORS = [
    {
        "registration_id": "E2E-VREG-001",
        "name": "E2E-VENDOR-001 Claims Cloud Platform",
        "legal_name": "E2E Claims Cloud Platform s.r.o.",
        "country": "CZ",
        "website": "https://vendor-001.e2e.local",
        "description": "Primary claims intake and workflow orchestration platform.",
        "process": "Claims",
        "subprocess": "FNOL Processing",
        "dept": "Operations",
        "owner": "it.head@riskhub.local",
        "vendor_type": "ict",
        "risk_score_1_5": 4,
        "supports_important_core_insurance_function": True,
        "dora_relevant": True,
        "is_significant_vendor": True,
        "replaceability": "hard",
        "has_alternative_providers": False,
        "is_archived": False,
    },
    {
        "registration_id": "E2E-VREG-002",
        "name": "E2E-VENDOR-002 AML Screening Service",
        "legal_name": "E2E AML Screening a.s.",
        "country": "CZ",
        "website": "https://vendor-002.e2e.local",
        "description": "Transaction monitoring and AML sanctions screening service.",
        "process": "Compliance",
        "subprocess": "AML Monitoring",
        "dept": "Compliance",
        "owner": "risk.manager@riskhub.local",
        "vendor_type": "outsourcing",
        "risk_score_1_5": 5,
        "supports_important_core_insurance_function": False,
        "dora_relevant": True,
        "is_significant_vendor": True,
        "replaceability": "medium",
        "has_alternative_providers": True,
        "is_archived": False,
    },
    {
        "registration_id": "E2E-VREG-003",
        "name": "E2E-VENDOR-003 Motor Repair Network",
        "legal_name": "E2E Motor Repair Network s.r.o.",
        "country": "CZ",
        "website": "https://vendor-003.e2e.local",
        "description": "Partner network for insured motor claim repairs.",
        "process": "Claims",
        "subprocess": "Repair Management",
        "dept": "Operations",
        "owner": "fin.head@riskhub.local",
        "vendor_type": "partner",
        "risk_score_1_5": 3,
        "supports_important_core_insurance_function": True,
        "dora_relevant": False,
        "is_significant_vendor": False,
        "replaceability": "easy",
        "has_alternative_providers": True,
        "is_archived": False,
    },
    {
        "registration_id": "E2E-VREG-004",
        "name": "E2E-VENDOR-004 Travel Assistance Partner",
        "legal_name": "E2E Travel Assistance Partner a.s.",
        "country": "SK",
        "website": "https://vendor-004.e2e.local",
        "description": "Emergency travel assistance and hotline operations provider.",
        "process": "Operations",
        "subprocess": "Travel Claims Support",
        "dept": "Operations",
        "owner": "ops.head@riskhub.local",
        "vendor_type": "partner",
        "risk_score_1_5": 3,
        "supports_important_core_insurance_function": False,
        "dora_relevant": False,
        "is_significant_vendor": False,
        "replaceability": "medium",
        "has_alternative_providers": True,
        "is_archived": True,
    },
    {
        "registration_id": "E2E-VREG-005",
        "name": "E2E-VENDOR-005 Reinsurance Data Exchange",
        "legal_name": "E2E Reinsurance Data Exchange GmbH",
        "country": "DE",
        "website": "https://vendor-005.e2e.local",
        "description": "Data bridge for treaty reinsurance bordereaux exchange.",
        "process": "Risk Management",
        "subprocess": "Reinsurance Reporting",
        "dept": "Risk Management",
        "owner": "it.head@riskhub.local",
        "vendor_type": "ict",
        "risk_score_1_5": 4,
        "supports_important_core_insurance_function": True,
        "dora_relevant": True,
        "is_significant_vendor": True,
        "replaceability": "hard",
        "has_alternative_providers": False,
        "is_archived": True,
    },
    {
        "registration_id": "E2E-VREG-006",
        "name": "E2E-VENDOR-006 Finance Reporting SaaS",
        "legal_name": "E2E Finance Reporting SaaS Ltd.",
        "country": "CZ",
        "website": "https://vendor-006.e2e.local",
        "description": "Financial and solvency reporting automation platform.",
        "process": "Finance",
        "subprocess": "Regulatory Reporting",
        "dept": "Finance",
        "owner": "fin.analyst@riskhub.local",
        "vendor_type": "professional_services",
        "risk_score_1_5": 2,
        "supports_important_core_insurance_function": False,
        "dora_relevant": False,
        "is_significant_vendor": False,
        "replaceability": "easy",
        "has_alternative_providers": True,
        "is_archived": False,
    },
]


async def seed_vendors():
    """Seed deterministic E2E vendor matrix."""
    print("=" * 60)
    print("🔍 PHASE 179-13: Deterministic Vendor Seed Matrix")
    print("=" * 60)

    async with session_context(get_settings()) as db:
        users, departments = await load_mappings(db)

        created = 0
        updated = 0
        now = utc_now()
        for entry in E2E_VENDORS:
            owner_id = require_user_id(users, entry["owner"])
            department_id = require_department_id(departments, entry["dept"])
            is_archived = bool(entry.get("is_archived", False))

            payload = {
                "name": entry["name"],
                "legal_name": entry["legal_name"],
                "registration_id": entry["registration_id"],
                "country": entry["country"],
                "website": entry["website"],
                "description": entry["description"],
                "process": entry["process"],
                "subprocess": entry["subprocess"],
                "department_id": department_id,
                "outsourcing_owner_user_id": owner_id,
                "vendor_type": entry["vendor_type"],
                "risk_score_1_5": entry["risk_score_1_5"],
                "supports_important_core_insurance_function": entry["supports_important_core_insurance_function"],
                "dora_relevant": entry["dora_relevant"],
                "is_significant_vendor": entry["is_significant_vendor"],
                "replaceability": entry["replaceability"],
                "has_alternative_providers": entry["has_alternative_providers"],
                "is_archived": is_archived,
                "archived_at": now if is_archived else None,
                "archived_by_id": owner_id if is_archived else None,
            }

            result = await db.execute(select(Vendor).where(Vendor.registration_id == entry["registration_id"]))
            vendor = result.scalar_one_or_none()

            if vendor is None:
                db.add(Vendor(**payload))
                created += 1
                print(f"   ✓ {entry['name']} ({'archived' if is_archived else 'active'})")
            else:
                for key, value in payload.items():
                    setattr(vendor, key, value)
                updated += 1
                print(f"   ↺ {entry['name']} ({'archived' if is_archived else 'active'})")

        await db.commit()

        total = (await db.execute(select(func.count(Vendor.id)).where(Vendor.name.like("E2E-VENDOR-%")))).scalar_one()
        active = (
            await db.execute(
                select(func.count(Vendor.id)).where(
                    Vendor.name.like("E2E-VENDOR-%"),
                    Vendor.is_archived.is_(False),
                )
            )
        ).scalar_one()
        archived = (
            await db.execute(
                select(func.count(Vendor.id)).where(
                    Vendor.name.like("E2E-VENDOR-%"),
                    Vendor.is_archived.is_(True),
                )
            )
        ).scalar_one()

        print(f"\n✅ Vendors seeded: total={total}, active={active}, archived={archived}")
        print(f"   Created={created}, updated={updated}")
        return {
            "total": total,
            "active": active,
            "archived": archived,
            "inactive": archived,
            "created": created,
            "updated": updated,
        }


if __name__ == "__main__":
    asyncio.run(seed_vendors())
