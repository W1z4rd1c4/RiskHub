"""Register-graph loader for the derivation engine (issues #48/#49).

Loads the persistence rows behind a page of Processes, Assets, and/or Vendors
into the plain :class:`~.derivation.IctRegisterGraph` the pure engine
consumes. The loaded graph is a **link closure for the target rows**: every
Link relation touching a target row is loaded, plus the counterpart rows those
links reference — and, down the vendor side of the cascade, the rows THOSE
rows need (a target Vendor pulls its Asset links, those Assets, their Process
links, and those Processes, so the MAXIFS over asset criticality and the
two-path CIF are computed over correct asset/process derivations). Non-target
rows exist in the graph only as lookup material — their own derivations are
not authoritative (their remaining links are not loaded) and callers must
never surface them.

Archived rows keep feeding the graph: Link relations survive archiving (they
are only removed explicitly), and the link sections of the register UI show
them either way — the derivation stays consistent with the visible graph.

Vendor targets additionally load the WHOLE Contract and Sub-outsourcing
registers (issue #49): the workbook's duplicate-reference check (08!U) and
subcontractor scans (09!F) are register-wide COUNTIFs, and register scale is
hundreds of rows by design (parent spec #38: compute-on-read). Contract and
Sub-outsourcing serialization passes the OWNING Vendor as the target.

The workbook's 09!F "Subdodavatel (ID)" is a Vendor-register reference; the
app stores sub-provider identity inline (#45), so this loader never resolves
``SubOutsourcingInput.sub_provider_vendor_id`` — the engine's verbatim chain
paths stay golden-covered via direct input (see the engine module docstring).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import TYPE_CHECKING

from sqlalchemy import or_, select

from app.core.permissions import (
    risk_visibility_clause,
    vendor_visibility_clause,
    visible_risk_ids,
    visible_vendor_ids,
)
from app.core.security import check_permission
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
    User,
    Vendor,
    VendorContract,
    VendorRiskLink,
    VendorSubOutsourcing,
)

from .committee import IctCommitteeGraph
from .derivation import (
    AssetAssetLinkInput,
    AssetDerivationInput,
    AssetVendorLinkInput,
    IctRegisterGraph,
    ProcessAssetLinkInput,
    ProcessDerivationInput,
    ProcessVendorLinkInput,
    SubOutsourcingInput,
    VendorContractInput,
    VendorDerivationInput,
)
from .dq import (
    RISK_RESPONSE_ACCEPTANCE,
    RISK_STATUS_ACCEPTED,
    RISK_STATUS_CLOSED,
    DqViewerScope,
    IctRegisterDqGraph,
    IctRegisterDqResult,
    RiskAssetLinkDqInput,
    RiskDqInput,
    RiskProcessLinkDqInput,
    RiskVendorLinkDqInput,
)
from .roi_readiness import (
    RoiContractSupplement,
    RoiProcessSupplement,
    RoiRegisterSupplement,
    RoiSubOutsourcingSupplement,
    RoiVendorSupplement,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


def process_derivation_input(process: Process) -> ProcessDerivationInput:
    """Map a Process row to the engine's plain input (entered fields only)."""
    return ProcessDerivationInput(
        id=process.id,
        l1_process=process.l1_process,
        l2_subprocess=process.l2_subprocess,
        owner=process.owner,
        owner_department=process.owner_department,
        impact_client=process.impact_client,
        impact_market_operations=process.impact_market_operations,
        impact_regulatory=process.impact_regulatory,
        impact_financial=process.impact_financial,
        mtpd_hours=process.mtpd_hours,
        preliminary_criticality=process.preliminary_criticality,
        cif_override=process.cif_override,
        rto_hours=process.rto_hours,
        rpo_hours=process.rpo_hours,
        bcm_link=process.bcm_link,
        interruption_impact=process.interruption_impact,
        assessment_date=process.assessment_date,
    )


def asset_derivation_input(asset: Asset) -> AssetDerivationInput:
    """Map an Asset row to the engine's plain input (entered fields only)."""
    return AssetDerivationInput(
        id=asset.id,
        name=asset.name,
        confidentiality_rating=asset.confidentiality_rating,
        integrity_rating=asset.integrity_rating,
        availability_rating=asset.availability_rating,
        authenticity_rating=asset.authenticity_rating,
        impact_client=asset.impact_client,
        impact_regulatory=asset.impact_regulatory,
        substitutability_rating=asset.substitutability_rating,
        vendor_dependency_rating=asset.vendor_dependency_rating,
        preliminary_criticality=asset.preliminary_criticality,
        lifecycle_state=asset.lifecycle_state,
        standard_support_end_date=asset.standard_support_end_date,
        asset_type=asset.asset_type,
        asset_level=asset.asset_level,
        description=asset.description,
        physical_location=asset.physical_location,
        deployment_model=asset.deployment_model,
        business_owner=asset.business_owner,
        ict_owner=asset.ict_owner,
        gdpr_relevance=asset.gdpr_relevance,
        ai_relevance=asset.ai_relevance,
        data_classification=asset.data_classification,
        internet_exposed=asset.internet_exposed,
        owner_department=asset.owner_department,
        review_state=asset.review_state,
        last_legacy_risk_assessment_date=asset.last_legacy_risk_assessment_date,
    )


def vendor_derivation_input(vendor: Vendor) -> VendorDerivationInput:
    """Map a Vendor row to the engine's plain input (entered fields only).

    ``replaceability`` is the register's Substituce input (issue #44).
    """
    return VendorDerivationInput(
        id=vendor.id,
        name=vendor.name,
        country=vendor.country,
        person_type=vendor.person_type,
        identifier_type=vendor.identifier_type,
        identifier_value=vendor.identifier_value,
        substitutability=vendor.replaceability,
        exit_plan_state=vendor.exit_plan_state,
        ex_ante_assessment_date=vendor.ex_ante_assessment_date,
        due_diligence_state=vendor.due_diligence_state,
        significance_authorization_conditions=vendor.significance_authorization_conditions,
        significance_regulatory_requirements=vendor.significance_regulatory_requirements,
        significance_service_quality=vendor.significance_service_quality,
        significance_financial_impact=vendor.significance_financial_impact,
        significance_reputation_continuity=vendor.significance_reputation_continuity,
        significance_cumulative_impact=vendor.significance_cumulative_impact,
    )


def contract_derivation_input(contract: VendorContract) -> VendorContractInput:
    """Map a Contract row to the engine's plain input (entered columns only)."""
    return VendorContractInput(
        id=contract.id,
        vendor_id=contract.vendor_id,
        contract_reference=contract.contract_reference,
        arrangement_type=contract.arrangement_type,
        main_contract=contract.main_contract,
        roi_scope=contract.roi_scope,
        start_date=contract.start_date,
        end_date=contract.end_date,
    )


def sub_outsourcing_derivation_input(entry: VendorSubOutsourcing) -> SubOutsourcingInput:
    """Map a Sub-outsourcing row to the engine's plain input."""
    return SubOutsourcingInput(
        id=entry.id,
        vendor_id=entry.vendor_id,
        contract_id=entry.contract_id,
        predecessor_id=entry.predecessor_id,
        sub_provider_name=entry.sub_provider_name,
        # Inline sub-provider identity (#45): never a Vendor-register reference.
        sub_provider_vendor_id=None,
    )


async def load_ict_register_graph(
    db: "AsyncSession",
    *,
    processes: Sequence[Process] = (),
    assets: Sequence[Asset] = (),
    vendors: Sequence[Vendor] = (),
) -> IctRegisterGraph:
    """Load the graph slice whose derivations are authoritative for the targets."""
    process_rows = list(processes)
    asset_rows = list(assets)
    vendor_rows = list(vendors)
    process_ids = {process.id for process in process_rows}
    asset_ids = {asset.id for asset in asset_rows}
    vendor_ids = {vendor.id for vendor in vendor_rows}

    # Sheet-10 links: for target assets, for target vendors, AND — because the
    # Process dod_n counts the derived §2 expansion (#49) — for every asset a
    # target process links to. The §2 join needs those assets' vendor links.
    process_linked_asset_ids: set[int] = set()
    if process_ids:
        pal_asset_rows = await db.execute(
            select(ProcessAssetLink.asset_id).where(ProcessAssetLink.process_id.in_(process_ids))
        )
        process_linked_asset_ids = set(pal_asset_rows.scalars())

    asset_vendor_links: list[AssetVendorLink] = []
    vad_conditions = []
    vad_asset_ids = asset_ids | process_linked_asset_ids
    if vad_asset_ids:
        vad_conditions.append(AssetVendorLink.asset_id.in_(vad_asset_ids))
    if vendor_ids:
        vad_conditions.append(AssetVendorLink.vendor_id.in_(vendor_ids))
    if vad_conditions:
        asset_vendor_links = list(
            (
                await db.execute(
                    select(AssetVendorLink).where(or_(*vad_conditions)).order_by(AssetVendorLink.id)
                )
            ).scalars()
        )

    # Row closure: Assets reached through the vendor links (their vysledna
    # feeds the vendor MAXIFS, their names the §2 display) — plus, further
    # down, their own Process links so their CIF/cascade compute correctly.
    reachable_asset_ids = asset_ids | process_linked_asset_ids | {
        link.asset_id for link in asset_vendor_links
    }
    missing_reachable_assets = reachable_asset_ids - asset_ids
    if missing_reachable_assets:
        asset_rows.extend(
            (await db.execute(select(Asset).where(Asset.id.in_(missing_reachable_assets)))).scalars()
        )

    # Sheet-05 links touching any target row or any reachable asset, in
    # stable link order.
    links: list[ProcessAssetLink] = []
    conditions = []
    if process_ids:
        conditions.append(ProcessAssetLink.process_id.in_(process_ids))
    if reachable_asset_ids:
        conditions.append(ProcessAssetLink.asset_id.in_(reachable_asset_ids))
    if conditions:
        links = list(
            (
                await db.execute(
                    select(ProcessAssetLink).where(or_(*conditions)).order_by(ProcessAssetLink.id)
                )
            ).scalars()
        )

    # Sheet-11 §1 manual pairs for the target processes (dod_n counts them)
    # and the target vendors (the second CIF path + proc_n).
    process_vendor_links: list[ProcessVendorLink] = []
    pv_conditions = []
    if process_ids:
        pv_conditions.append(ProcessVendorLink.process_id.in_(process_ids))
    if vendor_ids:
        pv_conditions.append(ProcessVendorLink.vendor_id.in_(vendor_ids))
    if pv_conditions:
        process_vendor_links = list(
            (
                await db.execute(
                    select(ProcessVendorLink).where(or_(*pv_conditions)).order_by(ProcessVendorLink.id)
                )
            ).scalars()
        )

    # Row closure: Processes the loaded links reference (cascade lookups and
    # the §1/§2 CIF flags).
    referenced_process_ids = {link.process_id for link in links} | {
        link.process_id for link in process_vendor_links
    }
    missing_process_ids = referenced_process_ids - process_ids
    if missing_process_ids:
        process_rows.extend(
            (await db.execute(select(Process).where(Process.id.in_(missing_process_ids)))).scalars()
        )

    # Sheet-06 links where a loaded asset is the DEPENDENT end — the workbook's
    # vazby_aktiv TEXTJOIN matches 06!B (the dependent id) only — plus the
    # supporting Assets those links reference (name lookups).
    asset_asset_links: list[AssetAssetLink] = []
    if reachable_asset_ids:
        asset_asset_links = list(
            (
                await db.execute(
                    select(AssetAssetLink)
                    .where(AssetAssetLink.dependent_asset_id.in_(reachable_asset_ids))
                    .order_by(AssetAssetLink.id)
                )
            ).scalars()
        )
    loaded_asset_ids = {asset.id for asset in asset_rows}
    missing_supporting_ids = {
        link.supporting_asset_id for link in asset_asset_links
    } - loaded_asset_ids
    if missing_supporting_ids:
        asset_rows.extend(
            (await db.execute(select(Asset).where(Asset.id.in_(missing_supporting_ids)))).scalars()
        )

    # Vendor name lookups for the loaded sheet-10 links (dod_seznam and the
    # §2 vendor-name column) — resolved here, the engine stays pure.
    vendor_names_by_id: dict[int, str] = {vendor.id: vendor.name for vendor in vendor_rows}
    linked_vendor_ids = {link.vendor_id for link in asset_vendor_links} - set(vendor_names_by_id)
    if linked_vendor_ids:
        vendor_name_rows = await db.execute(
            select(Vendor.id, Vendor.name).where(Vendor.id.in_(linked_vendor_ids))
        )
        vendor_names_by_id.update(
            {vendor_id: name for vendor_id, name in vendor_name_rows.all()}
        )

    # Contracts + Sub-outsourcing (vendor targets only): whole-register loads —
    # the duplicate check (08!U) and the chain scans (09!E/F) are global.
    contracts: list[VendorContract] = []
    sub_outsourcing: list[VendorSubOutsourcing] = []
    if vendor_ids:
        contracts = list(
            (await db.execute(select(VendorContract).order_by(VendorContract.id))).scalars()
        )
        sub_outsourcing = list(
            (
                await db.execute(select(VendorSubOutsourcing).order_by(VendorSubOutsourcing.id))
            ).scalars()
        )

    return IctRegisterGraph(
        processes=tuple(process_derivation_input(process) for process in process_rows),
        assets=tuple(asset_derivation_input(asset) for asset in asset_rows),
        process_asset_links=tuple(
            ProcessAssetLinkInput(
                process_id=link.process_id,
                asset_id=link.asset_id,
                spof=link.spof,
                is_primary=link.is_primary,
                significance=link.significance,
            )
            for link in links
        ),
        asset_asset_links=tuple(
            AssetAssetLinkInput(
                dependent_asset_id=link.dependent_asset_id,
                supporting_asset_id=link.supporting_asset_id,
            )
            for link in asset_asset_links
        ),
        asset_vendor_links=tuple(
            AssetVendorLinkInput(
                asset_id=link.asset_id,
                vendor_id=link.vendor_id,
                vendor_name=vendor_names_by_id.get(link.vendor_id),
                ict_service_code=link.ict_service_code,
                contract_reference=link.contract_reference,
                reliance=link.reliance,
            )
            for link in asset_vendor_links
        ),
        process_vendor_links=tuple(
            ProcessVendorLinkInput(process_id=link.process_id, vendor_id=link.vendor_id)
            for link in process_vendor_links
        ),
        vendors=tuple(vendor_derivation_input(vendor) for vendor in vendor_rows),
        contracts=tuple(contract_derivation_input(contract) for contract in contracts),
        sub_outsourcing=tuple(sub_outsourcing_derivation_input(entry) for entry in sub_outsourcing),
    )


def risk_dq_input(risk: Risk) -> RiskDqInput:
    """Map a Risk row to the DQ engine's 13_Rizika-shaped input (issue #50).

    The app reuses the production Risk register, which carries only part of
    the workbook's 13_Rizika columns; the mapping dispositions live in the
    ``dq`` module docstring. In short: ``net_score`` is ``ciste``; entering
    any acceptance-trio field IS the "Akceptace" response; the complete trio
    is the "Akceptováno" state; archiving is the "Uzavřené" closure (archival
    wins when both hold); the workbook's action-plan/assessment columns have
    no app analog and load as ``None``.

    The committee columns (#51) map the gross block: ``probability`` is
    13!pravdep, ``subject_value`` is 13!hodnota_subj, ``gross_score`` is
    13!hrube, ``code`` is 13!id — see the ``RiskDqInput`` docstring for the
    disposition.
    """
    trio = (risk.acceptance_approver, risk.acceptance_justification, risk.acceptance_date)
    status_label: str | None = None
    if risk.is_archived:
        status_label = RISK_STATUS_CLOSED
    elif all(value is not None for value in trio):
        status_label = RISK_STATUS_ACCEPTED
    return RiskDqInput(
        id=risk.id,
        label=f"{risk.risk_id_code} — {risk.name}",
        net_score=risk.net_score,
        response=RISK_RESPONSE_ACCEPTANCE if any(value is not None for value in trio) else None,
        status_label=status_label,
        action_plan_date=None,
        acceptance_approver=risk.acceptance_approver,
        acceptance_justification=risk.acceptance_justification,
        acceptance_date=risk.acceptance_date,
        assessment_date=None,
        is_material=None,
        code=risk.risk_id_code,
        probability=risk.gross_probability,
        subject_value=risk.gross_impact,
        gross_score=risk.gross_score,
    )


async def load_ict_register_dq_graph(db: "AsyncSession") -> IctRegisterDqGraph:
    """Load the WHOLE register for the 52 DQ checks (issue #50).

    The DQ sheet's COUNTIFs are register-wide by construction, and register
    scale is hundreds of rows (parent spec #38: compute-on-read), so this is
    a plain full load: every register row and Link relation, plus the
    ICT-linked Risk slice (rows joined through Risk<->Process, Risk<->Asset,
    or Vendor<->Risk links). Archived rows keep feeding the graph, matching
    the row-loader's stance above.
    """
    processes = list((await db.execute(select(Process).order_by(Process.id))).scalars())
    assets = list((await db.execute(select(Asset).order_by(Asset.id))).scalars())
    vendors = list((await db.execute(select(Vendor).order_by(Vendor.id))).scalars())
    pal_links = list(
        (await db.execute(select(ProcessAssetLink).order_by(ProcessAssetLink.id))).scalars()
    )
    aa_links = list(
        (await db.execute(select(AssetAssetLink).order_by(AssetAssetLink.id))).scalars()
    )
    av_links = list(
        (await db.execute(select(AssetVendorLink).order_by(AssetVendorLink.id))).scalars()
    )
    pv_links = list(
        (await db.execute(select(ProcessVendorLink).order_by(ProcessVendorLink.id))).scalars()
    )
    contracts = list(
        (await db.execute(select(VendorContract).order_by(VendorContract.id))).scalars()
    )
    sub_outsourcing = list(
        (await db.execute(select(VendorSubOutsourcing).order_by(VendorSubOutsourcing.id))).scalars()
    )
    risk_process_links = list(
        (await db.execute(select(RiskProcessLink).order_by(RiskProcessLink.id))).scalars()
    )
    risk_asset_links = list(
        (await db.execute(select(RiskAssetLink).order_by(RiskAssetLink.id))).scalars()
    )
    risk_vendor_links = list(
        (await db.execute(select(VendorRiskLink).order_by(VendorRiskLink.id))).scalars()
    )

    linked_risk_ids = (
        {link.risk_id for link in risk_process_links}
        | {link.risk_id for link in risk_asset_links}
        | {link.risk_id for link in risk_vendor_links}
    )
    risks: list[Risk] = []
    if linked_risk_ids:
        risks = list(
            (
                await db.execute(
                    select(Risk).where(Risk.id.in_(linked_risk_ids)).order_by(Risk.id)
                )
            ).scalars()
        )

    vendor_names_by_id = {vendor.id: vendor.name for vendor in vendors}
    graph = IctRegisterGraph(
        processes=tuple(process_derivation_input(process) for process in processes),
        assets=tuple(asset_derivation_input(asset) for asset in assets),
        process_asset_links=tuple(
            ProcessAssetLinkInput(
                process_id=link.process_id,
                asset_id=link.asset_id,
                spof=link.spof,
                is_primary=link.is_primary,
                significance=link.significance,
            )
            for link in pal_links
        ),
        asset_asset_links=tuple(
            AssetAssetLinkInput(
                dependent_asset_id=link.dependent_asset_id,
                supporting_asset_id=link.supporting_asset_id,
            )
            for link in aa_links
        ),
        asset_vendor_links=tuple(
            AssetVendorLinkInput(
                asset_id=link.asset_id,
                vendor_id=link.vendor_id,
                vendor_name=vendor_names_by_id.get(link.vendor_id),
                ict_service_code=link.ict_service_code,
                contract_reference=link.contract_reference,
                reliance=link.reliance,
            )
            for link in av_links
        ),
        process_vendor_links=tuple(
            ProcessVendorLinkInput(process_id=link.process_id, vendor_id=link.vendor_id)
            for link in pv_links
        ),
        vendors=tuple(vendor_derivation_input(vendor) for vendor in vendors),
        contracts=tuple(contract_derivation_input(contract) for contract in contracts),
        sub_outsourcing=tuple(sub_outsourcing_derivation_input(entry) for entry in sub_outsourcing),
    )
    return IctRegisterDqGraph(
        graph=graph,
        risks=tuple(risk_dq_input(risk) for risk in risks),
        risk_process_links=tuple(
            RiskProcessLinkDqInput(risk_id=link.risk_id, process_id=link.process_id)
            for link in risk_process_links
        ),
        risk_asset_links=tuple(
            RiskAssetLinkDqInput(risk_id=link.risk_id, asset_id=link.asset_id)
            for link in risk_asset_links
        ),
        risk_vendor_links=tuple(
            RiskVendorLinkDqInput(risk_id=link.risk_id, vendor_id=link.vendor_id)
            for link in risk_vendor_links
        ),
    )


async def load_dq_viewer_scope(
    db: "AsyncSession", current_user: User, result: IctRegisterDqResult
) -> DqViewerScope:
    """Resolve the caller's DQ row visibility from the CANONICAL predicates.

    Permission-only gates use ``check_permission`` — the same checks the
    gated entities' own endpoints depend on; Vendor/Risk row scope reuses
    the register-wide visibility clauses (``None`` = unrestricted) and the
    shared visible-id helpers, evaluated over just the ids the DQ result
    references. Feed the result to :func:`~.dq.visible_dq_result`.
    """
    candidate_vendor_ids = {
        vendor_id
        for check in result.checks
        for row in check.violating_rows
        for vendor_id in row.vendor_scope_ids
    }
    candidate_risk_ids = {
        risk_id
        for check in result.checks
        for row in check.violating_rows
        for risk_id in row.risk_scope_ids
    }

    readable_resources = frozenset(
        resource
        for resource in ("processes", "assets", "vendor_contracts")
        if check_permission(current_user, resource, "read")
    )
    vendors_unrestricted = vendor_visibility_clause(current_user) is None
    risks_unrestricted = (await risk_visibility_clause(db, current_user)) is None
    return DqViewerScope(
        readable_resources=readable_resources,
        vendors_unrestricted=vendors_unrestricted,
        visible_vendor_ids=(
            frozenset()
            if vendors_unrestricted
            else frozenset(await visible_vendor_ids(db, current_user, candidate_vendor_ids))
        ),
        risks_unrestricted=risks_unrestricted,
        visible_risk_ids=(
            frozenset()
            if risks_unrestricted
            else frozenset(await visible_risk_ids(db, current_user, candidate_risk_ids))
        ),
    )


async def load_ict_register_committee_graph(db: "AsyncSession") -> IctCommitteeGraph:
    """Load the whole register plus the 12_Hrozby name feed for the ICT Risk
    Committee page (issue #51) and the RoI-readiness supplement (issue #52).

    The committee graph is the DQ graph (both output sheets read the same
    registers and the ICT-linked Risk slice) extended with each risk's FIRST
    linked Threat name in Link-relation order — the in-app 13!hrozba_nazev
    (the workbook row references exactly one threat; the deterministic pick
    is the earliest link) — and with the entered register columns the engine
    graph omits but the RoI templates consume: the Process F-code and licensed
    activity (B_06.01/B_02.02), the Vendor B_05.01/B_07.01 master-data and
    assessment columns, the Contract monetary/notice/law columns (B_02.01),
    and the Sub-outsourcing S-code and identifier (B_05.02).
    """
    dq_graph = await load_ict_register_dq_graph(db)
    threat_label_rows = await db.execute(
        select(ThreatRiskLink.risk_id, Threat.name)
        .join(Threat, Threat.id == ThreatRiskLink.threat_id)
        .order_by(ThreatRiskLink.id)
    )
    risk_threat_labels: dict[int, str] = {}
    for risk_id, threat_name in threat_label_rows.all():
        risk_threat_labels.setdefault(risk_id, threat_name)

    process_supplements = {
        process_id: RoiProcessSupplement(f_code=f_code, licensed_activity=licensed_activity)
        for process_id, f_code, licensed_activity in (
            await db.execute(select(Process.id, Process.f_code, Process.licensed_activity))
        ).all()
    }
    vendor_supplements = {
        row.id: RoiVendorSupplement(
            latin_name=row.latin_name,
            substitutability_reason=row.substitutability_reason,
            last_audit_date=row.last_audit_date,
            reintegration=row.reintegration,
            service_disruption_impact=row.service_disruption_impact,
            alternative_providers=row.alternative_providers,
            alternative_providers_names=row.alternative_providers_names,
            service_country=row.service_country,
            data_storage=row.data_storage,
            data_location=row.data_location,
            data_sensitivity=row.data_sensitivity,
        )
        for row in (
            await db.execute(
                select(
                    Vendor.id,
                    Vendor.latin_name,
                    Vendor.substitutability_reason,
                    Vendor.last_audit_date,
                    Vendor.reintegration,
                    Vendor.service_disruption_impact,
                    Vendor.alternative_providers,
                    Vendor.alternative_providers_names,
                    Vendor.service_country,
                    Vendor.data_storage,
                    Vendor.data_location,
                    Vendor.data_sensitivity,
                )
            )
        ).all()
    }
    contract_supplements = {
        row.id: RoiContractSupplement(
            overarching_reference=row.overarching_arrangement_reference,
            notice_period_entity_days=row.notice_period_entity_days,
            notice_period_provider_days=row.notice_period_provider_days,
            governing_law_country=row.governing_law_country,
            annual_cost=row.annual_cost,
            currency=row.currency,
        )
        for row in (
            await db.execute(
                select(
                    VendorContract.id,
                    VendorContract.overarching_arrangement_reference,
                    VendorContract.notice_period_entity_days,
                    VendorContract.notice_period_provider_days,
                    VendorContract.governing_law_country,
                    VendorContract.annual_cost,
                    VendorContract.currency,
                )
            )
        ).all()
    }
    sub_supplements = {
        sub_id: RoiSubOutsourcingSupplement(
            ict_service_code=ict_service_code, identifier_value=identifier_value
        )
        for sub_id, ict_service_code, identifier_value in (
            await db.execute(
                select(
                    VendorSubOutsourcing.id,
                    VendorSubOutsourcing.ict_service_code,
                    VendorSubOutsourcing.identifier_value,
                )
            )
        ).all()
    }
    return IctCommitteeGraph(
        dq_graph=dq_graph,
        risk_threat_labels=risk_threat_labels,
        roi_supplement=RoiRegisterSupplement(
            processes=process_supplements,
            vendors=vendor_supplements,
            contracts=contract_supplements,
            sub_outsourcing=sub_supplements,
        ),
    )
