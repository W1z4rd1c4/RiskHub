"""
ICT Register E2E Fixtures: Deterministic Processes, Assets, and Links
Seeds the deterministic ICT Register matrix used by the Playwright suites
(processes.spec.ts / assets.spec.ts): Processes and Assets with active and
archived states, Process<->Asset links carrying exactly one primary
designation per linked Asset, and directional Asset<->Asset links.

Entered fields only — derived values (scores, classes, CIF, SPOF rollups)
are computed on read by the derivation engine (ticket #48) and never seeded.
Coded fields are validated against the workbook closed lists so fixture rows
can never drift from the reference registry.
"""

import asyncio
from datetime import date

from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.datetime_utils import utc_now
from app.db.session import session_context
from app.models import Asset, AssetAssetLink, Process, ProcessAssetLink
from app.services._ict_register_reference import is_closed_list_value
from scripts.e2e_mappings import load_mappings, require_user_id

# Closed-list membership guards per coded column (workbook reference registry).
_PROCESS_CLOSED_LIST_FIELDS = {
    "owner_department": "VlastnickyUtvar",
    "preliminary_criticality": "TridyKrit",
    "cif_override": "AnoNe",
    "licensed_activity": "LicCinnost",
    "bcm_link": "BcmVazba",
    "dr_test_result": "VysledekDR",
    "interruption_impact": "DopadPreruseni",
    "impact_client": "Skala15",
    "impact_market_operations": "Skala15",
    "impact_regulatory": "Skala15",
    "impact_financial": "Skala15",
    "impact_reputational": "Skala15",
}

_ASSET_CLOSED_LIST_FIELDS = {
    "asset_type": "TypAktiva",
    "asset_level": "UrovenAktiva",
    "deployment_model": "ModelNasazeni",
    "owner_department": "VlastnickyUtvar",
    "gdpr_relevance": "AnoNeNeurceno",
    "ai_relevance": "AnoNeNeurceno",
    "data_classification": "KlasifikaceDat",
    "internet_exposed": "AnoNe",
    "preliminary_criticality": "TridyKrit",
    "lifecycle_state": "StavAktiva",
    "review_state": "StavRevize",
    "confidentiality_rating": "Skala15",
    "integrity_rating": "Skala15",
    "availability_rating": "Skala15",
    "authenticity_rating": "Skala15",
    "impact_client": "Skala15",
    "impact_regulatory": "Skala15",
    "substitutability_rating": "Skala15",
    "vendor_dependency_rating": "Skala15",
}

# Deterministic Process matrix (l1_process is the stable natural key).
E2E_PROCESSES = [
    {
        "l0_area": "E2E Claims",
        "l1_process": "E2E-PROC-001 Claims Intake",
        "l2_subprocess": "FNOL triage",
        "owner": "Jana Horáková",
        "owner_department": "Provoz",
        "impact_client": 4,
        "impact_market_operations": 3,
        "impact_regulatory": 4,
        "impact_financial": 3,
        "impact_reputational": 2,
        "mtpd_hours": 24,
        "preliminary_criticality": "Vysoká",
        "cif_override": "Ano",
        "licensed_activity": "Neživotní pojištění",
        "rto_hours": 8,
        "rpo_hours": 4,
        "bcm_link": "Ano",
        "last_dr_test_date": date(2026, 3, 15),
        "dr_test_result": "Úspěšný",
        "interruption_impact": "Vysoký",
        "assessment_date": date(2026, 5, 2),
        "notes": "Deterministic E2E fixture — primary Process of E2E-ASSET-001.",
        "is_archived": False,
    },
    {
        "l0_area": "E2E Policy Admin",
        "l1_process": "E2E-PROC-002 Policy Administration",
        "l2_subprocess": None,
        "owner": "Lukáš Dvořák",
        "owner_department": "Provoz",
        "impact_client": 3,
        "impact_market_operations": 3,
        "impact_regulatory": 2,
        "impact_financial": 3,
        "impact_reputational": 1,
        "mtpd_hours": 48,
        "preliminary_criticality": "Střední",
        "cif_override": "Ne",
        "licensed_activity": "Podpůrné funkce",
        "rto_hours": 24,
        "rpo_hours": 12,
        "bcm_link": "Neposouzeno",
        "last_dr_test_date": None,
        "dr_test_result": "Netestováno",
        "interruption_impact": "Střední",
        "assessment_date": date(2026, 4, 20),
        "notes": None,
        "is_archived": False,
    },
    {
        "l0_area": "E2E Finance",
        "l1_process": "E2E-PROC-003 Regulatory Reporting",
        "l2_subprocess": "Solvency II bordereaux",
        "owner": "Martin Procházka",
        "owner_department": "Finance",
        "impact_client": 2,
        "impact_market_operations": 2,
        "impact_regulatory": 5,
        "impact_financial": 4,
        "impact_reputational": 3,
        "mtpd_hours": 72,
        "preliminary_criticality": "Kritická",
        "cif_override": "Ano",
        "licensed_activity": "Podpůrné funkce",
        "rto_hours": 48,
        "rpo_hours": 24,
        "bcm_link": "Ano",
        "last_dr_test_date": date(2026, 1, 20),
        "dr_test_result": "S výhradami",
        "interruption_impact": "Vysoký",
        "assessment_date": date(2026, 2, 10),
        "notes": None,
        "is_archived": False,
    },
    {
        # Deliberately minimal: exercises empty-field rendering in the UI.
        "l0_area": "E2E Customer Service",
        "l1_process": "E2E-PROC-004 Customer Portal Support",
        "l2_subprocess": None,
        "owner": None,
        "owner_department": None,
        "impact_client": None,
        "impact_market_operations": None,
        "impact_regulatory": None,
        "impact_financial": None,
        "impact_reputational": None,
        "mtpd_hours": None,
        "preliminary_criticality": None,
        "cif_override": None,
        "licensed_activity": None,
        "rto_hours": None,
        "rpo_hours": None,
        "bcm_link": None,
        "last_dr_test_date": None,
        "dr_test_result": None,
        "interruption_impact": None,
        "assessment_date": None,
        "notes": None,
        "is_archived": False,
    },
    {
        "l0_area": "E2E Legacy",
        "l1_process": "E2E-PROC-ARCH Batch Print Distribution",
        "l2_subprocess": None,
        "owner": "Eva Králová",
        "owner_department": "Provoz",
        "impact_client": 1,
        "impact_market_operations": 1,
        "impact_regulatory": 1,
        "impact_financial": 1,
        "impact_reputational": 1,
        "mtpd_hours": 168,
        "preliminary_criticality": "Nízká",
        "cif_override": "Ne",
        "licensed_activity": "Podpůrné funkce",
        "rto_hours": None,
        "rpo_hours": None,
        "bcm_link": "Nerelevantní",
        "last_dr_test_date": None,
        "dr_test_result": "Netestováno",
        "interruption_impact": "Nízký",
        "assessment_date": date(2025, 11, 5),
        "notes": "Archived deterministic fixture for the archived-filter flow.",
        "is_archived": True,
    },
]

# Deterministic Asset matrix (name is the stable natural key).
E2E_ASSETS = [
    {
        "name": "E2E-ASSET-001 Core Claims System",
        "asset_type": "Aplikace",
        "asset_level": "A – primární",
        "description": "Primary claims processing application (deterministic E2E fixture).",
        "physical_location": "Praha DC1",
        "deployment_model": "On-premise",
        "alternative_names": "CCS",
        "business_owner": "Eva Králová",
        "owner_department": "Provoz",
        "ict_owner": "Tomáš Novotný",
        "gdpr_relevance": "Ano",
        "ai_relevance": "Ne",
        "data_classification": "Důvěrná data",
        "confidentiality_rating": 4,
        "integrity_rating": 4,
        "availability_rating": 5,
        "authenticity_rating": 3,
        "impact_client": 4,
        "impact_regulatory": 4,
        "substitutability_rating": 4,
        "vendor_dependency_rating": 3,
        "internet_exposed": "Ano",
        "preliminary_criticality": "Vysoká",
        "lifecycle_state": "V provozu",
        "standard_support_end_date": date(2028, 12, 31),
        "extended_support_end_date": None,
        "custom_support_end_date": None,
        "last_legacy_risk_assessment_date": None,
        "review_state": "Zkontrolováno",
        "notes": "Carries the seeded primary-Process designation (E2E-PROC-001).",
        "is_archived": False,
    },
    {
        "name": "E2E-ASSET-002 Claims Database",
        "asset_type": "Databáze",
        "asset_level": "B – podpůrné",
        "description": "Relational store backing the core claims system.",
        "physical_location": "Praha DC1",
        "deployment_model": "On-premise",
        "alternative_names": None,
        "business_owner": "Eva Králová",
        "owner_department": "Provoz",
        "ict_owner": "Tomáš Novotný",
        "gdpr_relevance": "Ano",
        "ai_relevance": "Ne",
        "data_classification": "Vysoce důvěrná / regulovaná data",
        "confidentiality_rating": 5,
        "integrity_rating": 5,
        "availability_rating": 4,
        "authenticity_rating": 2,
        "impact_client": 4,
        "impact_regulatory": 5,
        "substitutability_rating": 3,
        "vendor_dependency_rating": 2,
        "internet_exposed": "Ne",
        "preliminary_criticality": "Kritická",
        "lifecycle_state": "V provozu",
        "standard_support_end_date": None,
        "extended_support_end_date": None,
        "custom_support_end_date": None,
        "last_legacy_risk_assessment_date": None,
        "review_state": "K revizi",
        "notes": None,
        "is_archived": False,
    },
    {
        # Dedicated target of the UI link-management test (links are reset there).
        "name": "E2E-ASSET-003 Integration Message Bus",
        "asset_type": "Infrastruktura",
        "asset_level": "C – infrastrukturní",
        "description": "Message broker connecting claims, policy, and reporting systems.",
        "physical_location": "Praha DC2",
        "deployment_model": "Hybrid",
        "alternative_names": "ESB",
        "business_owner": "Tomáš Novotný",
        "owner_department": "IT",
        "ict_owner": "Tomáš Novotný",
        "gdpr_relevance": "Neurčeno",
        "ai_relevance": "Ne",
        "data_classification": "Interní data",
        "confidentiality_rating": 3,
        "integrity_rating": 4,
        "availability_rating": 4,
        "authenticity_rating": 3,
        "impact_client": 3,
        "impact_regulatory": 2,
        "substitutability_rating": 3,
        "vendor_dependency_rating": 3,
        "internet_exposed": "Ne",
        "preliminary_criticality": "Střední",
        "lifecycle_state": "V provozu",
        "standard_support_end_date": None,
        "extended_support_end_date": None,
        "custom_support_end_date": None,
        "last_legacy_risk_assessment_date": None,
        "review_state": "K revizi",
        "notes": None,
        "is_archived": False,
    },
    {
        # Deliberately minimal: exercises empty-field rendering and is the
        # dedicated target of the UI asset<->asset link test.
        "name": "E2E-ASSET-004 Reporting Warehouse",
        "asset_type": "Datové úložiště",
        "asset_level": None,
        "description": None,
        "physical_location": None,
        "deployment_model": None,
        "alternative_names": None,
        "business_owner": None,
        "owner_department": None,
        "ict_owner": None,
        "gdpr_relevance": None,
        "ai_relevance": None,
        "data_classification": None,
        "confidentiality_rating": None,
        "integrity_rating": None,
        "availability_rating": None,
        "authenticity_rating": None,
        "impact_client": None,
        "impact_regulatory": None,
        "substitutability_rating": None,
        "vendor_dependency_rating": None,
        "internet_exposed": None,
        "preliminary_criticality": None,
        "lifecycle_state": None,
        "standard_support_end_date": None,
        "extended_support_end_date": None,
        "custom_support_end_date": None,
        "last_legacy_risk_assessment_date": None,
        "review_state": None,
        "notes": None,
        "is_archived": False,
    },
    {
        "name": "E2E-ASSET-ARCH Fax Gateway",
        "asset_type": "Hardware",
        "asset_level": "C – infrastrukturní",
        "description": "Decommissioned fax intake gateway.",
        "physical_location": "Praha DC2",
        "deployment_model": "On-premise",
        "alternative_names": None,
        "business_owner": None,
        "owner_department": "IT",
        "ict_owner": "Tomáš Novotný",
        "gdpr_relevance": "Ne",
        "ai_relevance": "Ne",
        "data_classification": "Bez dat / nerelevantní",
        "confidentiality_rating": 1,
        "integrity_rating": 1,
        "availability_rating": 1,
        "authenticity_rating": 1,
        "impact_client": 1,
        "impact_regulatory": 1,
        "substitutability_rating": 1,
        "vendor_dependency_rating": 1,
        "internet_exposed": "Ne",
        "preliminary_criticality": "Nízká",
        "lifecycle_state": "Vyřazeno",
        "standard_support_end_date": date(2020, 6, 30),
        "extended_support_end_date": None,
        "custom_support_end_date": None,
        "last_legacy_risk_assessment_date": date(2025, 9, 1),
        "review_state": "Zkontrolováno",
        "notes": "Archived deterministic fixture for the archived-filter flow.",
        "is_archived": True,
    },
]

# Process<->Asset link matrix: (process l1, asset name) is the natural key.
# E2E-ASSET-001 carries exactly one primary designation (E2E-PROC-001).
E2E_PROCESS_ASSET_LINKS = [
    {
        "process": "E2E-PROC-001 Claims Intake",
        "asset": "E2E-ASSET-001 Core Claims System",
        "significance": "Kritická podpora procesu",
        "spof": "Ano",
        "is_primary": True,
        "note": "Seeded primary link (exactly one primary per asset).",
    },
    {
        "process": "E2E-PROC-002 Policy Administration",
        "asset": "E2E-ASSET-001 Core Claims System",
        "significance": "Podpůrná vazba",
        "spof": "Ne",
        "is_primary": False,
        "note": None,
    },
    {
        "process": "E2E-PROC-001 Claims Intake",
        "asset": "E2E-ASSET-002 Claims Database",
        "significance": "Významná podpora procesu",
        "spof": "Ano",
        "is_primary": False,
        "note": None,
    },
]

# Asset<->Asset link matrix (directional: dependent relies on supporting).
E2E_ASSET_ASSET_LINKS = [
    {
        "dependent": "E2E-ASSET-001 Core Claims System",
        "supporting": "E2E-ASSET-002 Claims Database",
        "dependency_type": "Datová",
        "spof": "Ano",
        "note": "Seeded directional dependency for the read-only render test.",
    },
    {
        "dependent": "E2E-ASSET-001 Core Claims System",
        "supporting": "E2E-ASSET-003 Integration Message Bus",
        "dependency_type": "Běhová (runtime)",
        "spof": "Ne",
        "note": None,
    },
]

_LINK_CLOSED_LIST_FIELDS = {
    "significance": "VyznamVazby",
    "spof": "AnoNe",
    "dependency_type": "TypZavislostiAktiv",
}


def _assert_closed_list_values(entry: dict, fields: dict[str, str], context: str) -> None:
    """Fail fast if a fixture value drifts from the workbook closed lists."""
    for field, list_name in fields.items():
        value = entry.get(field)
        if value is None:
            continue
        if not is_closed_list_value(list_name, value):
            raise RuntimeError(f"{context} fixture value {field}={value!r} is not in closed list {list_name}")


async def seed_ict_register():
    """Seed deterministic ICT Register Processes, Assets, and link matrices."""
    print("=" * 60)
    print("🔍 ICT REGISTER: Deterministic Process/Asset Seed Matrix")
    print("=" * 60)

    async with session_context(get_settings()) as db:
        users, _departments = await load_mappings(db)
        archiver_id = require_user_id(users, "risk.manager@riskhub.local")
        now = utc_now()

        created = 0
        updated = 0

        # 1) Processes (upsert by l1_process; F-code assigned once, never reassigned).
        process_ids: dict[str, int] = {}
        for entry in E2E_PROCESSES:
            _assert_closed_list_values(entry, _PROCESS_CLOSED_LIST_FIELDS, "Process")
            is_archived = bool(entry["is_archived"])
            payload = {key: value for key, value in entry.items() if key != "is_archived"}
            payload.update(
                {
                    "is_archived": is_archived,
                    "archived_at": now if is_archived else None,
                    "archived_by_id": archiver_id if is_archived else None,
                }
            )

            result = await db.execute(select(Process).where(Process.l1_process == entry["l1_process"]))
            process = result.scalar_one_or_none()
            if process is None:
                # Mirror the lifecycle service: flush for the id, then assign
                # the stable RoI F-code "F{id}" exactly once.
                process = Process(**payload, f_code=f"pending-e2e-{created}")
                db.add(process)
                await db.flush()
                process.f_code = f"F{process.id}"
                created += 1
                print(f"   ✓ {entry['l1_process']} ({'archived' if is_archived else 'active'})")
            else:
                for key, value in payload.items():
                    setattr(process, key, value)
                updated += 1
                print(f"   ↺ {entry['l1_process']} ({'archived' if is_archived else 'active'})")
            process_ids[entry["l1_process"]] = process.id

        # 2) Assets (upsert by name).
        asset_ids: dict[str, int] = {}
        for entry in E2E_ASSETS:
            _assert_closed_list_values(entry, _ASSET_CLOSED_LIST_FIELDS, "Asset")
            is_archived = bool(entry["is_archived"])
            payload = {key: value for key, value in entry.items() if key != "is_archived"}
            payload.update(
                {
                    "is_archived": is_archived,
                    "archived_at": now if is_archived else None,
                    "archived_by_id": archiver_id if is_archived else None,
                }
            )

            result = await db.execute(select(Asset).where(Asset.name == entry["name"]))
            asset = result.scalar_one_or_none()
            if asset is None:
                asset = Asset(**payload)
                db.add(asset)
                await db.flush()
                created += 1
                print(f"   ✓ {entry['name']} ({'archived' if is_archived else 'active'})")
            else:
                for key, value in payload.items():
                    setattr(asset, key, value)
                updated += 1
                print(f"   ↺ {entry['name']} ({'archived' if is_archived else 'active'})")
            asset_ids[entry["name"]] = asset.id

        # 3) Process<->Asset links (upsert by pair). Primary designations are
        # normalized in two passes — demote everything first, flush, then
        # promote the seeded primaries — so re-runs can never trip the
        # at-most-one-primary partial unique index regardless of what UI
        # tests left behind.
        seeded_asset_ids = set(asset_ids.values())
        demote_result = await db.execute(
            select(ProcessAssetLink).where(
                ProcessAssetLink.asset_id.in_(seeded_asset_ids),
                ProcessAssetLink.is_primary.is_(True),
            )
        )
        for stray in demote_result.scalars().all():
            stray.is_primary = False
        await db.flush()

        pa_links = 0
        for entry in E2E_PROCESS_ASSET_LINKS:
            _assert_closed_list_values(entry, _LINK_CLOSED_LIST_FIELDS, "Process-Asset link")
            process_id = process_ids[entry["process"]]
            asset_id = asset_ids[entry["asset"]]
            result = await db.execute(
                select(ProcessAssetLink).where(
                    ProcessAssetLink.process_id == process_id,
                    ProcessAssetLink.asset_id == asset_id,
                )
            )
            link = result.scalar_one_or_none()
            if link is None:
                link = ProcessAssetLink(process_id=process_id, asset_id=asset_id)
                db.add(link)
            link.significance = entry["significance"]
            link.spof = entry["spof"]
            link.is_primary = bool(entry["is_primary"])
            link.note = entry["note"]
            pa_links += 1
        await db.flush()

        # 4) Asset<->Asset links (upsert by ordered pair).
        aa_links = 0
        for entry in E2E_ASSET_ASSET_LINKS:
            _assert_closed_list_values(entry, _LINK_CLOSED_LIST_FIELDS, "Asset-Asset link")
            dependent_id = asset_ids[entry["dependent"]]
            supporting_id = asset_ids[entry["supporting"]]
            result = await db.execute(
                select(AssetAssetLink).where(
                    AssetAssetLink.dependent_asset_id == dependent_id,
                    AssetAssetLink.supporting_asset_id == supporting_id,
                )
            )
            link = result.scalar_one_or_none()
            if link is None:
                link = AssetAssetLink(dependent_asset_id=dependent_id, supporting_asset_id=supporting_id)
                db.add(link)
            link.dependency_type = entry["dependency_type"]
            link.spof = entry["spof"]
            link.note = entry["note"]
            aa_links += 1

        await db.commit()

        processes_active = (
            await db.execute(
                select(func.count(Process.id)).where(
                    Process.l1_process.like("E2E-PROC-%"),
                    Process.is_archived.is_(False),
                )
            )
        ).scalar_one()
        processes_archived = (
            await db.execute(
                select(func.count(Process.id)).where(
                    Process.l1_process.like("E2E-PROC-%"),
                    Process.is_archived.is_(True),
                )
            )
        ).scalar_one()
        assets_active = (
            await db.execute(
                select(func.count(Asset.id)).where(
                    Asset.name.like("E2E-ASSET-%"),
                    Asset.is_archived.is_(False),
                )
            )
        ).scalar_one()
        assets_archived = (
            await db.execute(
                select(func.count(Asset.id)).where(
                    Asset.name.like("E2E-ASSET-%"),
                    Asset.is_archived.is_(True),
                )
            )
        ).scalar_one()

        print(
            f"\n✅ ICT Register seeded: processes active={processes_active}, archived={processes_archived}; "
            f"assets active={assets_active}, archived={assets_archived}"
        )
        print(f"   Process-Asset links={pa_links}, Asset-Asset links={aa_links}")
        print(f"   Created={created}, updated={updated}")
        return {
            "processes_active": processes_active,
            "processes_archived": processes_archived,
            "assets_active": assets_active,
            "assets_archived": assets_archived,
            "process_asset_links": pa_links,
            "asset_asset_links": aa_links,
            "created": created,
            "updated": updated,
        }


if __name__ == "__main__":
    asyncio.run(seed_ict_register())
