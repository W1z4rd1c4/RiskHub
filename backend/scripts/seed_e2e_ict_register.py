"""
ICT Register E2E Fixtures: Deterministic Processes, Assets, Links, and the
Vendor-domain register (Vendor extension, Contracts, Sub-outsourcing chains)
Seeds the deterministic ICT Register matrix used by the Playwright suites
(processes.spec.ts / assets.spec.ts / vendor-contracts.spec.ts /
vendor-sub-outsourcing.spec.ts): Processes and Assets with active and
archived states, Process<->Asset links carrying exactly one primary
designation per linked Asset, directional Asset<->Asset links, one dedicated
E2E Vendor carrying the entered 07_Dodavatelé register-extension fields, its
08_Smlouvy Contracts (two mains — the exactly-one-main rule is a DQ finding,
never a write constraint — plus an archived row), and a 09_Subdodávky chain
(two directs plus one deeper link, so the full-depth render shows rank 3,
plus one deliberately BROKEN cross-contract row so the CHYBA ŘETĚZCE
sentinel surfaces deterministically). E2E phase 3 (issues #46/#47/#49) adds
the 10_VAD Asset<->Vendor links (an S17 cloud link pins the tier
derivation), one 11 §1 Process<->Vendor pair, the 12_Hrozby Threats, and
the 13_Rizika integration links (Threat<->Risk, Risk<->Process,
Risk<->Asset) onto the E2E-RISK-001 risk from seed_e2e_risks.py — used by
register-links.spec.ts / threats.spec.ts / vendor-derived.spec.ts.

Entered fields only — derived values (scores, classes, CIF, SPOF rollups,
sub-outsourcing Rank) are computed on read by the derivation engine
(tickets #48/#49) and never seeded. Coded fields are validated against the
workbook closed lists so fixture rows can never drift from the reference
registry.
"""

import asyncio
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.datetime_utils import utc_now
from app.db.session import session_context
from app.models import (
    Asset,
    AssetAssetLink,
    AssetVendorLink,
    Process,
    ProcessAssetLink,
    ProcessVendorLink,
    Risk,
    RiskAssetLink,
    RiskProcessLink,
    Threat,
    ThreatRiskLink,
    Vendor,
    VendorContract,
    VendorSubOutsourcing,
)
from app.services._ict_register_reference import (
    ICT_SERVICE_TAXONOMY,
    is_closed_list_value,
    is_provider_identifier_type_write_value,
    threat_category_code,
)
from scripts.e2e_mappings import load_mappings, require_department_id, require_user_id

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

_VENDOR_CLOSED_LIST_FIELDS = {
    "person_type": "TypOsoby",
    "identifier_type": "TypKodu",
    "replaceability": "Substituce",
    "data_sensitivity": "CitlivostDat",
}

_CONTRACT_CLOSED_LIST_FIELDS = {
    "records_system": "SystemEvidence",
    "arrangement_type": "TypUjednani",
    "main_contract": "AnoNe",
    "roi_scope": "AnoNe",
    "currency": "MenaList",
}

_SUB_OUTSOURCING_CLOSED_LIST_FIELDS = {
    "person_type": "TypOsoby",
    "identifier_type": "TypKodu",
    "country": "ZemeList",
}

# The dedicated Vendor of the vendor-domain register suites. Registration id
# is the stable natural key (mirrors seed_e2e_vendors.py); the Operations
# department keeps the row visible to the dept-scoped employee fixture, and
# the register-extension fields carry the entered 07_Dodavatelé columns the
# specs assert (LEI identifier + Substituce-constrained substitutability).
E2E_ICT_VENDOR = {
    "registration_id": "E2E-VREG-ICT-001",
    "name": "E2E-VENDOR-ICT Core Hosting Provider",
    "legal_name": "E2E Core Hosting Provider s.r.o.",
    "country": "CZ",
    "website": "https://vendor-ict.e2e.local",
    "description": "Deterministic ICT Register vendor fixture (contracts + sub-outsourcing chains).",
    "process": "Claims",
    "subprocess": "Hosting Operations",
    "dept": "Operations",
    "owner": "risk.manager@riskhub.local",
    "vendor_type": "ict",
    "risk_score_1_5": 4,
    "supports_important_core_insurance_function": True,
    "dora_relevant": True,
    "is_significant_vendor": True,
    "has_alternative_providers": False,
    # ICT Register extension (issue #44) — entered fields only.
    "latin_name": "E2E Core Hosting Provider",
    "person_type": "Právnická osoba",
    "identifier_type": "LEI",
    "identifier_value": "E2E00LEI00000000ICT1",
    "replaceability": "Velmi obtížně nahraditelný",
    "data_sensitivity": "Vysoká",
    "is_archived": False,
}

# Contract matrix of the E2E ICT vendor (contract_reference is the natural
# key). TWO rows carry main_contract="Ano" on purpose: the workbook's
# exactly-one-main-per-vendor rule is a DQ finding (#50), never a write
# constraint, and the UI must render both without error.
E2E_VENDOR_CONTRACTS = [
    {
        "contract_reference": "E2E-CTR-001",
        "internal_contract_number": "TAS-E2E-0001",
        "records_system": "TAS",
        "arrangement_type": "Rámcové (master)",
        "main_contract": "Ano",
        "overarching_arrangement_reference": None,
        "description": "Master hosting agreement — carries the seeded sub-outsourcing chain.",
        "roi_scope": "Ano",
        "start_date": date(2025, 1, 1),
        "end_date": date(2027, 12, 31),
        "notice_period_entity_days": 90,
        "notice_period_provider_days": 180,
        "governing_law_country": "CZ",
        "annual_cost": Decimal("1200000.50"),
        "currency": "CZK",
        "note": "Deterministic E2E fixture — main + RoI-scope contract.",
        "is_archived": False,
    },
    {
        # Second main: pins the two-mains-allowed rule visually (DQ-39 owns it).
        "contract_reference": "E2E-CTR-002",
        "internal_contract_number": "SAP-E2E-0002",
        "records_system": "SAP",
        "arrangement_type": "Samostatné",
        "main_contract": "Ano",
        "overarching_arrangement_reference": None,
        "description": "Standalone monitoring service — deliberately a SECOND main contract.",
        "roi_scope": "Ne",
        "start_date": date(2025, 6, 1),
        "end_date": None,
        "notice_period_entity_days": 30,
        "notice_period_provider_days": 30,
        "governing_law_country": "CZ",
        "annual_cost": Decimal("48000.00"),
        "currency": "EUR",
        "note": None,
        "is_archived": False,
    },
    {
        "contract_reference": "E2E-CTR-ARCH",
        "internal_contract_number": None,
        "records_system": "Jiné",
        "arrangement_type": "Navazující",
        "main_contract": "Ne",
        "overarching_arrangement_reference": "E2E-CTR-001",
        "description": "Retired onboarding addendum.",
        "roi_scope": "Ne",
        "start_date": date(2024, 1, 1),
        "end_date": date(2024, 12, 31),
        "notice_period_entity_days": None,
        "notice_period_provider_days": None,
        "governing_law_country": "CZ",
        "annual_cost": None,
        "currency": None,
        "note": "Archived deterministic fixture for the archived-row render flow.",
        "is_archived": True,
    },
]

# Sub-outsourcing chain on E2E-CTR-001 (sub_provider_name is the natural key
# within the vendor). Two directs (predecessor None -> rank 2 in workbook
# terms) plus one deeper link under the first direct (rank 3), so the
# full-depth chain render shows indentation. Rank itself is derived (#49).
E2E_SUB_OUTSOURCING = [
    {
        "sub_provider_name": "E2E-SUB-001 Primary DC Operator",
        "contract": "E2E-CTR-001",
        "predecessor": None,
        "person_type": "Právnická osoba",
        "identifier_type": "LEI",
        "identifier_value": "E2E00LEI00000000SUB1",
        "country": "CZ",
        "ict_service_code": "S07",
        "note": "Direct sub-outsourcer of the main contract.",
        "is_archived": False,
    },
    {
        "sub_provider_name": "E2E-SUB-002 Network Backbone",
        "contract": "E2E-CTR-001",
        "predecessor": None,
        "person_type": "Právnická osoba",
        "identifier_type": "EUID",
        "identifier_value": "E2E-EUID-SUB2",
        "country": "DE",
        "ict_service_code": "S11",
        "note": None,
        "is_archived": False,
    },
    {
        # Rank-3 link: hangs under the first direct, so the chain render indents it.
        "sub_provider_name": "E2E-SUB-003 Offsite Backup Facility",
        "contract": "E2E-CTR-001",
        "predecessor": "E2E-SUB-001 Primary DC Operator",
        "person_type": "Právnická osoba",
        "identifier_type": "IČO (CRN)",
        "identifier_value": "12345678",
        "country": "SK",
        "ict_service_code": "S09",
        "note": "Deeper chain link under E2E-SUB-001 (workbook rank 3).",
        "is_archived": False,
    },
    {
        # Deliberately BROKEN chain (issue #49): the predecessor lives on
        # E2E-CTR-001 while this row sits on E2E-CTR-002, so the engine's
        # rank walk yields the "?" sentinel and the CHYBA ŘETĚZCE finding.
        # Write-time integrity rejects this via the API (422), so the seed
        # persists it directly — exactly the imported-data shape DQ owns.
        # Keep this row AFTER E2E-SUB-003 so its id stays the highest and
        # the committed depth-order assertions keep holding.
        "sub_provider_name": "E2E-SUB-BROKEN Cross-Contract Orphan",
        "contract": "E2E-CTR-002",
        "predecessor": "E2E-SUB-001 Primary DC Operator",
        "person_type": "Právnická osoba",
        "identifier_type": "Jiný",
        "identifier_value": "E2E-BROKEN-1",
        "country": "PL",
        "ict_service_code": "S14",
        "note": "Deterministic broken-chain fixture (cross-contract predecessor).",
        "is_archived": False,
    },
]

# ---------------------------------------------------------------------------
# E2E phase 3 (issues #46/#47/#49): Link relations, Threats, risk integration.
# ---------------------------------------------------------------------------

_ASSET_VENDOR_LINK_CLOSED_LIST_FIELDS = {
    "vendor_role": "RoleDodavatele",
    "reliance": "Reliance",
}

_THREAT_CLOSED_LIST_FIELDS = {
    "category": "KategorieHrozeb",
}

# Sheet-10 Asset<->Vendor links onto the E2E ICT vendor. The identity tuple
# is (asset, vendor, S-code). The S17 (cloud IaaS) link makes the vendor tier
# derivation deterministic: A1's derived CIF is Ano, so the vendor's two-path
# CIF -> cif_ret -> tier resolves to "Kritický dodavatel"; the cloud S-code
# additionally pins the tier formula's COUNTIFS(S17..S19) trigger explain.
E2E_ASSET_VENDOR_LINKS = [
    {
        "asset": "E2E-ASSET-001 Core Claims System",
        "ict_service_code": "S17",
        "vendor_role": "Hostuje",
        "contract_reference": "E2E-CTR-001",
        "reliance": "Zásadní závislost",
        "note": "Deterministic S17 cloud link — drives the vendor tier derivation.",
    },
    {
        "asset": "E2E-ASSET-002 Claims Database",
        "ict_service_code": "S05",
        "vendor_role": "Zpracovává data",
        "contract_reference": None,
        "reliance": None,
        "note": None,
    },
]

# Sheet-11 §1 manual Process<->Vendor pairs (unique pair; no service column).
E2E_PROCESS_VENDOR_LINKS = [
    {
        "process": "E2E-PROC-003 Regulatory Reporting",
        "direct_service_description": "Regulatory reporting platform hosting (§1 direct service).",
        "note": None,
    },
]

# 12_Hrozby Threats (name is the stable natural key; category on KategorieHrozeb).
E2E_THREATS = [
    {
        "name": "E2E-THREAT-001 Ransomware Encryption",
        "category": "availability",
        "description": "Ransomware encrypts production data stores and halts claims processing.",
        "typical_weaknesses": "Missing offline backups; unpatched endpoints; weak segmentation.",
        "relevant_subject": "Aktivum",
        "notes": "Deterministic E2E fixture — carries the seeded Threat<->Risk link.",
        "is_archived": False,
    },
    {
        "name": "E2E-THREAT-002 Third-Party Data Leak",
        "category": "third_party",
        "description": "A sub-outsourcer exfiltrates or mishandles regulated client data.",
        "typical_weaknesses": "No DLP at the provider; over-broad data shares; stale contracts.",
        "relevant_subject": "Dodavatel",
        "notes": None,
        "is_archived": False,
    },
]

# 13_Rizika integration links onto the deterministic risk seeded by
# seed_e2e_risks.py (step 2 of seed_e2e_all — always present here).
E2E_ICT_RISK_CODE = "E2E-RISK-001"
E2E_THREAT_RISK_LINKS = [
    {"threat": "E2E-THREAT-001 Ransomware Encryption", "risk_code": E2E_ICT_RISK_CODE},
]
E2E_RISK_PROCESS_LINKS = [
    {"risk_code": E2E_ICT_RISK_CODE, "process": "E2E-PROC-003 Regulatory Reporting"},
]
E2E_RISK_ASSET_LINKS = [
    {"risk_code": E2E_ICT_RISK_CODE, "asset": "E2E-ASSET-002 Claims Database"},
]


def _assert_closed_list_values(entry: dict, fields: dict[str, str], context: str) -> None:
    """Fail fast if a fixture value drifts from the workbook closed lists."""
    for field, list_name in fields.items():
        value = entry.get(field)
        if value is None:
            continue
        valid = (
            is_provider_identifier_type_write_value(value)
            if list_name == "TypKodu"
            else is_closed_list_value(list_name, value)
        )
        if not valid:
            raise RuntimeError(f"{context} fixture value {field}={value!r} is not in closed list {list_name}")


async def seed_ict_register():
    """Seed deterministic ICT Register Processes, Assets, links, and the vendor-domain register."""
    print("=" * 60)
    print("🔍 ICT REGISTER: Deterministic Process/Asset/Vendor-domain Seed Matrix")
    print("=" * 60)

    async with session_context(get_settings()) as db:
        users, departments = await load_mappings(db)
        archiver_id = require_user_id(users, "risk.manager@riskhub.local")
        ciso_id = require_user_id(users, "ciso@riskhub.local")
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

        # 5) Vendor-domain register (issues #44/#45): one dedicated Vendor
        # with the entered register-extension fields, its Contract matrix,
        # and the Sub-outsourcing chain on the main contract.
        _assert_closed_list_values(E2E_ICT_VENDOR, _VENDOR_CLOSED_LIST_FIELDS, "Vendor")
        vendor_payload = {
            key: value
            for key, value in E2E_ICT_VENDOR.items()
            if key not in {"dept", "owner", "is_archived"}
        }
        vendor_payload.update(
            {
                "department_id": require_department_id(departments, E2E_ICT_VENDOR["dept"]),
                "outsourcing_owner_user_id": require_user_id(users, E2E_ICT_VENDOR["owner"]),
                "is_archived": bool(E2E_ICT_VENDOR["is_archived"]),
                "archived_at": now if E2E_ICT_VENDOR["is_archived"] else None,
                "archived_by_id": archiver_id if E2E_ICT_VENDOR["is_archived"] else None,
            }
        )
        result = await db.execute(
            select(Vendor).where(Vendor.registration_id == E2E_ICT_VENDOR["registration_id"])
        )
        vendor = result.scalar_one_or_none()
        if vendor is None:
            vendor = Vendor(**vendor_payload)
            db.add(vendor)
            await db.flush()
            created += 1
            print(f"   ✓ {E2E_ICT_VENDOR['name']} (vendor, active)")
        else:
            for key, value in vendor_payload.items():
                setattr(vendor, key, value)
            updated += 1
            print(f"   ↺ {E2E_ICT_VENDOR['name']} (vendor, active)")

        # 5a) Contracts (upsert by contract_reference within the vendor).
        contract_ids: dict[str, int] = {}
        for entry in E2E_VENDOR_CONTRACTS:
            _assert_closed_list_values(entry, _CONTRACT_CLOSED_LIST_FIELDS, "Vendor contract")
            is_archived = bool(entry["is_archived"])
            payload = {key: value for key, value in entry.items() if key != "is_archived"}
            payload.update(
                {
                    "is_archived": is_archived,
                    "archived_at": now if is_archived else None,
                    "archived_by_id": archiver_id if is_archived else None,
                }
            )
            result = await db.execute(
                select(VendorContract).where(
                    VendorContract.vendor_id == vendor.id,
                    VendorContract.contract_reference == entry["contract_reference"],
                )
            )
            contract = result.scalar_one_or_none()
            if contract is None:
                contract = VendorContract(vendor_id=vendor.id, **payload)
                db.add(contract)
                await db.flush()
                created += 1
                print(f"   ✓ {entry['contract_reference']} (contract, {'archived' if is_archived else 'active'})")
            else:
                for key, value in payload.items():
                    setattr(contract, key, value)
                updated += 1
                print(f"   ↺ {entry['contract_reference']} (contract, {'archived' if is_archived else 'active'})")
            contract_ids[entry["contract_reference"]] = contract.id

        # 5b) Sub-outsourcing chain (upsert by sub_provider_name within the
        # vendor). Directs come first in the matrix, so a deeper link always
        # resolves its predecessor id in the same pass.
        sub_ids: dict[str, int] = {}
        for entry in E2E_SUB_OUTSOURCING:
            _assert_closed_list_values(entry, _SUB_OUTSOURCING_CLOSED_LIST_FIELDS, "Sub-outsourcing")
            if entry["ict_service_code"] is not None and entry["ict_service_code"] not in ICT_SERVICE_TAXONOMY:
                raise RuntimeError(
                    f"Sub-outsourcing fixture value ict_service_code={entry['ict_service_code']!r} "
                    "is not an S01-S19 taxonomy code"
                )
            predecessor_name = entry["predecessor"]
            if predecessor_name is not None and predecessor_name not in sub_ids:
                raise RuntimeError(
                    f"Sub-outsourcing fixture {entry['sub_provider_name']!r} references predecessor "
                    f"{predecessor_name!r} before it is seeded — keep directs first in the matrix"
                )
            is_archived = bool(entry["is_archived"])
            payload = {
                "contract_id": contract_ids[entry["contract"]],
                "predecessor_id": sub_ids[predecessor_name] if predecessor_name is not None else None,
                "sub_provider_name": entry["sub_provider_name"],
                "person_type": entry["person_type"],
                "identifier_type": entry["identifier_type"],
                "identifier_value": entry["identifier_value"],
                "country": entry["country"],
                "ict_service_code": entry["ict_service_code"],
                "note": entry["note"],
                "is_archived": is_archived,
                "archived_at": now if is_archived else None,
                "archived_by_id": archiver_id if is_archived else None,
            }
            result = await db.execute(
                select(VendorSubOutsourcing).where(
                    VendorSubOutsourcing.vendor_id == vendor.id,
                    VendorSubOutsourcing.sub_provider_name == entry["sub_provider_name"],
                )
            )
            sub_entry = result.scalar_one_or_none()
            if sub_entry is None:
                sub_entry = VendorSubOutsourcing(vendor_id=vendor.id, **payload)
                db.add(sub_entry)
                await db.flush()
                created += 1
                print(f"   ✓ {entry['sub_provider_name']} (sub-outsourcing, {'archived' if is_archived else 'active'})")
            else:
                for key, value in payload.items():
                    setattr(sub_entry, key, value)
                updated += 1
                print(f"   ↺ {entry['sub_provider_name']} (sub-outsourcing, {'archived' if is_archived else 'active'})")
            sub_ids[entry["sub_provider_name"]] = sub_entry.id

        # 6) Asset<->Vendor links (sheet 10_VAD, issue #46): upsert by the
        # identity tuple (asset, vendor, S-code). Entered columns only —
        # the resulting-criticality/CIF per-link lookups derive on read.
        av_links = 0
        for entry in E2E_ASSET_VENDOR_LINKS:
            _assert_closed_list_values(entry, _ASSET_VENDOR_LINK_CLOSED_LIST_FIELDS, "Asset-Vendor link")
            if entry["ict_service_code"] not in ICT_SERVICE_TAXONOMY:
                raise RuntimeError(
                    f"Asset-Vendor link fixture value ict_service_code={entry['ict_service_code']!r} "
                    "is not an S01-S19 taxonomy code"
                )
            asset_id = asset_ids[entry["asset"]]
            result = await db.execute(
                select(AssetVendorLink).where(
                    AssetVendorLink.asset_id == asset_id,
                    AssetVendorLink.vendor_id == vendor.id,
                    AssetVendorLink.ict_service_code == entry["ict_service_code"],
                )
            )
            link = result.scalar_one_or_none()
            if link is None:
                link = AssetVendorLink(
                    asset_id=asset_id,
                    vendor_id=vendor.id,
                    ict_service_code=entry["ict_service_code"],
                )
                db.add(link)
            link.vendor_role = entry["vendor_role"]
            link.contract_reference = entry["contract_reference"]
            link.reliance = entry["reliance"]
            link.note = entry["note"]
            av_links += 1
        await db.flush()

        # 7) Process<->Vendor §1 links (sheet 11 §1, issue #46): upsert by pair.
        pv_links = 0
        for entry in E2E_PROCESS_VENDOR_LINKS:
            process_id = process_ids[entry["process"]]
            result = await db.execute(
                select(ProcessVendorLink).where(
                    ProcessVendorLink.process_id == process_id,
                    ProcessVendorLink.vendor_id == vendor.id,
                )
            )
            link = result.scalar_one_or_none()
            if link is None:
                link = ProcessVendorLink(process_id=process_id, vendor_id=vendor.id)
                db.add(link)
            link.direct_service_description = entry["direct_service_description"]
            link.note = entry["note"]
            pv_links += 1
        await db.flush()

        # 8) Threats (12_Hrozby, issue #47): upsert by name.
        threat_ids: dict[str, int] = {}
        for entry in E2E_THREATS:
            is_archived = bool(entry["is_archived"])
            payload = {key: value for key, value in entry.items() if key != "is_archived"}
            payload["category"] = threat_category_code(str(payload["category"]))
            payload.update(
                {
                    "threat_steward_user_id": ciso_id,
                    "is_archived": is_archived,
                    "archived_at": now if is_archived else None,
                    "archived_by_id": archiver_id if is_archived else None,
                }
            )
            result = await db.execute(select(Threat).where(Threat.name == entry["name"]))
            threat = result.scalar_one_or_none()
            if threat is None:
                threat = Threat(**payload)
                db.add(threat)
                await db.flush()
                created += 1
                print(f"   ✓ {entry['name']} (threat, {'archived' if is_archived else 'active'})")
            else:
                for key, value in payload.items():
                    setattr(threat, key, value)
                updated += 1
                print(f"   ↺ {entry['name']} (threat, {'archived' if is_archived else 'active'})")
            threat_ids[entry["name"]] = threat.id

        # 9) Risk-domain integration links (issue #47) onto the deterministic
        # risk from seed_e2e_risks.py (step 2 of seed_e2e_all). Upsert by pair.
        result = await db.execute(select(Risk).where(Risk.risk_id_code == E2E_ICT_RISK_CODE))
        ict_risk = result.scalar_one_or_none()
        if ict_risk is None:
            raise RuntimeError(
                f"Risk '{E2E_ICT_RISK_CODE}' not found — run scripts.seed_e2e_risks (or seed_e2e_all) first."
            )

        risk_links = 0
        for entry in E2E_THREAT_RISK_LINKS:
            threat_id = threat_ids[entry["threat"]]
            result = await db.execute(
                select(ThreatRiskLink).where(
                    ThreatRiskLink.threat_id == threat_id,
                    ThreatRiskLink.risk_id == ict_risk.id,
                )
            )
            if result.scalar_one_or_none() is None:
                db.add(ThreatRiskLink(threat_id=threat_id, risk_id=ict_risk.id))
            risk_links += 1
        for entry in E2E_RISK_PROCESS_LINKS:
            process_id = process_ids[entry["process"]]
            result = await db.execute(
                select(RiskProcessLink).where(
                    RiskProcessLink.risk_id == ict_risk.id,
                    RiskProcessLink.process_id == process_id,
                )
            )
            if result.scalar_one_or_none() is None:
                db.add(RiskProcessLink(risk_id=ict_risk.id, process_id=process_id))
            risk_links += 1
        for entry in E2E_RISK_ASSET_LINKS:
            linked_asset_id = asset_ids[entry["asset"]]
            result = await db.execute(
                select(RiskAssetLink).where(
                    RiskAssetLink.risk_id == ict_risk.id,
                    RiskAssetLink.asset_id == linked_asset_id,
                )
            )
            if result.scalar_one_or_none() is None:
                db.add(RiskAssetLink(risk_id=ict_risk.id, asset_id=linked_asset_id))
            risk_links += 1
        await db.flush()

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

        contracts_active = (
            await db.execute(
                select(func.count(VendorContract.id)).where(
                    VendorContract.vendor_id == vendor.id,
                    VendorContract.contract_reference.like("E2E-CTR-%"),
                    VendorContract.is_archived.is_(False),
                )
            )
        ).scalar_one()
        contracts_archived = (
            await db.execute(
                select(func.count(VendorContract.id)).where(
                    VendorContract.vendor_id == vendor.id,
                    VendorContract.contract_reference.like("E2E-CTR-%"),
                    VendorContract.is_archived.is_(True),
                )
            )
        ).scalar_one()
        sub_outsourcing_total = (
            await db.execute(
                select(func.count(VendorSubOutsourcing.id)).where(
                    VendorSubOutsourcing.vendor_id == vendor.id,
                    VendorSubOutsourcing.sub_provider_name.like("E2E-SUB-%"),
                )
            )
        ).scalar_one()

        threats_total = (
            await db.execute(
                select(func.count(Threat.id)).where(Threat.name.like("E2E-THREAT-%"))
            )
        ).scalar_one()

        print(
            f"\n✅ ICT Register seeded: processes active={processes_active}, archived={processes_archived}; "
            f"assets active={assets_active}, archived={assets_archived}"
        )
        print(f"   Process-Asset links={pa_links}, Asset-Asset links={aa_links}")
        print(
            f"   Vendor {E2E_ICT_VENDOR['registration_id']}: contracts active={contracts_active}, "
            f"archived={contracts_archived}; sub-outsourcing rows={sub_outsourcing_total}"
        )
        print(
            f"   Asset-Vendor links={av_links}, Process-Vendor links={pv_links}, "
            f"threats={threats_total}, risk-integration links={risk_links}"
        )
        print(f"   Created={created}, updated={updated}")
        return {
            "processes_active": processes_active,
            "processes_archived": processes_archived,
            "assets_active": assets_active,
            "assets_archived": assets_archived,
            "process_asset_links": pa_links,
            "asset_asset_links": aa_links,
            "vendor_contracts_active": contracts_active,
            "vendor_contracts_archived": contracts_archived,
            "vendor_sub_outsourcing": sub_outsourcing_total,
            "asset_vendor_links": av_links,
            "process_vendor_links": pv_links,
            "threats": threats_total,
            "risk_integration_links": risk_links,
            "created": created,
            "updated": updated,
        }


if __name__ == "__main__":
    asyncio.run(seed_ict_register())
