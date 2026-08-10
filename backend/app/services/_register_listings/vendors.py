from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, replace
from typing import Any

from sqlalchemy import String, asc, case, desc, false, func, literal, or_, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ValidationError
from app.core.permissions import (
    get_user_department_ids,
    risk_visibility_clause,
    visible_control_ids,
    visible_kri_ids,
    visible_risk_ids,
)
from app.core.security import check_permission
from app.models import (
    Asset,
    AssetVendorLink,
    Control,
    Department,
    KeyRiskIndicator,
    Process,
    ProcessAssetLink,
    ProcessVendorLink,
    Risk,
    User,
    Vendor,
    VendorContract,
    VendorControlLink,
    VendorKRILink,
    VendorRiskLink,
    VendorSubOutsourcing,
)
from app.models._archivable import archived_clause
from app.schemas.collection import CollectionGroupRead
from app.schemas.vendor import VendorDerived, VendorFacetOption, VendorListResponse, VendorLookupOption, VendorTypeEnum
from app.services._collection_contracts import (
    CollectionGroupEntry,
    CollectionQuery,
    build_grouped_collection_page,
)
from app.services._collection_filters import (
    coerce_optional_bool,
    coerce_optional_enum,
    coerce_optional_int,
    coerce_optional_string,
    merge_collection_filters,
)
from app.services._ict_register_lifecycle.asset_policy import asset_visibility_clause
from app.services._ict_register_lifecycle.derivation import derive_ict_register
from app.services._ict_register_lifecycle.derivation_inputs import load_ict_register_graph
from app.services._ict_register_lifecycle.policy import process_visibility_clause
from app.services._ict_register_reference.parameters import load_ict_workbook_parameter_set
from app.services._ict_register_reference.vendor_values import (
    VENDOR_CONTROLLED_CODES_BY_FIELD,
    canonicalize_vendor_derived,
    vendor_country_category_code,
    vendor_value_label,
)
from app.services._vendor_governance.projection import (
    get_visible_vendor_risk_ids,
    serialize_vendor_list_items,
    serialize_vendor_reads,
)
from app.services._vendor_workflow import apply_vendor_visibility_scope

from .lifecycle import RegisterListingPlan, SerializeItems, build_register_listing_plan, execute_register_listing_plan
from .shared import parse_prefixed_group_value

VENDOR_GROUP_UNASSIGNED = "__unassigned__"
VENDOR_GROUP_NO_PROCESS = "__no_process__"
VENDOR_GROUP_UNLINKED_RISK = "__unlinked_risk__"
VENDOR_GROUP_DORA_RELEVANT = "__dora_relevant__"
VENDOR_GROUP_SUPPORTS_CORE_FUNCTION = "__supports_core_function__"
VENDOR_GROUP_SIGNIFICANT_VENDOR = "__significant_vendor__"
VENDOR_GROUP_INSIGNIFICANT_VENDOR = "__insignificant_vendor__"


@dataclass(frozen=True)
class VendorListingGovernance:
    criteria: Any
    group_by: str | None = None
    drilldown_group: str | None = None


@dataclass(frozen=True)
class VendorListCriteria:
    offset: int = 0
    limit: int = 50
    search: str | None = None
    include_archived: bool = False
    vendor_type: VendorTypeEnum | None = None
    dora_relevant: bool | None = None
    supports_important_core_insurance_function: bool | None = None
    is_significant_vendor: bool | None = None
    outsourcing_owner_user_id: int | None = None
    department_id: int | None = None
    process: str | None = None
    subprocess: str | None = None
    risk_score_1_5: int | None = None
    sort_by: str | None = None
    sort_order: str | None = "asc"
    lifecycle: tuple[str, ...] = ()
    view: str = "all"
    group_by: str | None = None
    group_value: str | None = None
    department_ids: tuple[int, ...] = ()
    outsourcing_owner_ids: tuple[int, ...] = ()
    vendor_types: tuple[str, ...] = ()
    risk_scores: tuple[int, ...] = ()
    tiers: tuple[str, ...] = ()
    cif: bool | None = None
    substitutability: tuple[str, ...] = ()
    countries: tuple[str, ...] = ()
    country_categories: tuple[str, ...] = ()
    has_roi_contract: bool | None = None
    has_sub_outsourcing: bool | None = None
    has_direct_process_link: bool | None = None
    linked_process_ids: tuple[int, ...] = ()
    linked_asset_ids: tuple[int, ...] = ()
    linked_risk_ids: tuple[int, ...] = ()
    linked_control_ids: tuple[int, ...] = ()
    linked_kri_ids: tuple[int, ...] = ()


def can_view_vendor_full_derivation(
    current_user: User,
    *,
    check_permission_fn=check_permission,
) -> bool:
    return bool(
        check_permission_fn(current_user, "vendors", "read")
        and check_permission_fn(current_user, "processes", "read")
        and check_permission_fn(current_user, "assets", "read")
        and check_permission_fn(current_user, "vendor_contracts", "read")
        and get_user_department_ids(current_user) is None
    )


@dataclass(frozen=True)
class VendorLinkContext:
    processes: dict[int, set[int]]
    direct_processes: dict[int, set[int]]
    assets: dict[int, set[int]]
    risks: dict[int, set[int]]
    controls: dict[int, set[int]]
    kris: dict[int, set[int]]
    process_labels: dict[int, str]
    asset_labels: dict[int, str]
    risk_labels: dict[int, str]
    control_labels: dict[int, str]
    kri_labels: dict[int, str]


_VALID_VENDOR_VIEWS = frozenset(("all", "department", "process", "type", "risk", "flag"))
_VALID_VENDOR_GROUPS = _VALID_VENDOR_VIEWS - {"all"}
_VALID_VENDOR_SORTS = frozenset(
    (
        "name",
        "legal_name",
        "registration_id",
        "department",
        "outsourcing_owner",
        "vendor_type",
        "risk_score",
        "risk_score_1_5",
        "tier",
        "cif",
        "process",
        "country",
        "created_at",
    )
)
_VENDOR_TIERS = ("critical", "significant", "standard")
_VENDOR_COUNTRY_CATEGORIES = ("domestic", "eu", "non_eu", "unknown")


def _tuple_values(name: str, value: Any, *, integers: bool = False) -> tuple[Any, ...]:
    if value is None or value == "":
        return ()
    raw_values = value if isinstance(value, (list, tuple, set)) else [value]
    result: list[Any] = []
    for raw in raw_values:
        coerced = coerce_optional_int(name, raw, min_value=1) if integers else coerce_optional_string(name, raw)
        if coerced is not None and coerced not in result:
            result.append(coerced)
    return tuple(result)


def _validate_codes(name: str, values: tuple[str, ...], allowed: tuple[str, ...]) -> None:
    invalid = sorted(set(values) - set(allowed))
    if invalid:
        raise ValidationError(f"Invalid Vendor {name} value")


def vendor_criteria_from_filters(
    *,
    offset: int,
    limit: int,
    filters: dict[str, Any],
    sort_by: str | None,
    sort_order: str,
    view: str,
    group_by: str | None,
    group_value: str | None,
) -> VendorListCriteria:
    criteria = VendorListCriteria(
        offset=offset,
        limit=limit,
        search=coerce_optional_string("search", filters.get("search")),
        include_archived=coerce_optional_bool("include_archived", filters.get("include_archived")) or False,
        vendor_type=coerce_optional_enum(VendorTypeEnum, filters.get("vendor_type"), "vendor_type"),
        supports_important_core_insurance_function=coerce_optional_bool(
            "supports_important_core_insurance_function",
            filters.get("supports_important_core_insurance_function"),
        ),
        outsourcing_owner_user_id=coerce_optional_int(
            "outsourcing_owner_user_id", filters.get("outsourcing_owner_user_id"), min_value=1
        ),
        department_id=coerce_optional_int("department_id", filters.get("department_id"), min_value=1),
        process=coerce_optional_string("process", filters.get("process")),
        subprocess=coerce_optional_string("subprocess", filters.get("subprocess")),
        risk_score_1_5=coerce_optional_int("risk_score_1_5", filters.get("risk_score_1_5"), min_value=1, max_value=5),
        lifecycle=_tuple_values("lifecycle", filters.get("lifecycle")),
        sort_by=sort_by,
        sort_order=sort_order,
        view=view or "all",
        group_by=group_by,
        group_value=group_value,
        department_ids=_tuple_values("department_ids", filters.get("department_ids"), integers=True),
        outsourcing_owner_ids=_tuple_values(
            "outsourcing_owner_ids", filters.get("outsourcing_owner_ids"), integers=True
        ),
        vendor_types=_tuple_values("vendor_types", filters.get("vendor_types")),
        risk_scores=_tuple_values("risk_scores", filters.get("risk_scores"), integers=True),
        tiers=_tuple_values("tiers", filters.get("tiers")),
        dora_relevant=coerce_optional_bool("dora_relevant", filters.get("dora_relevant")),
        cif=coerce_optional_bool("cif", filters.get("cif")),
        is_significant_vendor=coerce_optional_bool("is_significant_vendor", filters.get("is_significant_vendor")),
        substitutability=_tuple_values("substitutability", filters.get("substitutability")),
        countries=_tuple_values("countries", filters.get("countries")),
        country_categories=_tuple_values("country_categories", filters.get("country_categories")),
        has_roi_contract=coerce_optional_bool("has_roi_contract", filters.get("has_roi_contract")),
        has_sub_outsourcing=coerce_optional_bool("has_sub_outsourcing", filters.get("has_sub_outsourcing")),
        has_direct_process_link=coerce_optional_bool("has_direct_process_link", filters.get("has_direct_process_link")),
        linked_process_ids=_tuple_values("linked_process_ids", filters.get("linked_process_ids"), integers=True),
        linked_asset_ids=_tuple_values("linked_asset_ids", filters.get("linked_asset_ids"), integers=True),
        linked_risk_ids=_tuple_values("linked_risk_ids", filters.get("linked_risk_ids"), integers=True),
        linked_control_ids=_tuple_values("linked_control_ids", filters.get("linked_control_ids"), integers=True),
        linked_kri_ids=_tuple_values("linked_kri_ids", filters.get("linked_kri_ids"), integers=True),
    )
    group = criteria.group_by or (criteria.view if criteria.view != "all" else None)
    if criteria.view not in _VALID_VENDOR_VIEWS:
        raise ValidationError("Invalid Vendor view")
    if group is not None and group not in _VALID_VENDOR_GROUPS:
        raise ValidationError("Invalid Vendor group_by value")
    if criteria.sort_by is not None and criteria.sort_by not in _VALID_VENDOR_SORTS:
        raise ValidationError("Invalid sort_by value")
    if criteria.sort_order not in {"asc", "desc"}:
        raise ValidationError("Invalid Vendor sort_order value")
    if any(score > 5 for score in criteria.risk_scores):
        raise ValidationError("Invalid Vendor risk_scores value")
    _validate_codes("lifecycle", criteria.lifecycle, ("active", "archived"))
    _validate_codes("vendor_types", criteria.vendor_types, VENDOR_CONTROLLED_CODES_BY_FIELD["vendor_type"])
    _validate_codes("substitutability", criteria.substitutability, VENDOR_CONTROLLED_CODES_BY_FIELD["replaceability"])
    _validate_codes("countries", criteria.countries, VENDOR_CONTROLLED_CODES_BY_FIELD["country"])
    _validate_codes("tiers", criteria.tiers, _VENDOR_TIERS)
    _validate_codes("country_categories", criteria.country_categories, _VENDOR_COUNTRY_CATEGORIES)
    return replace(criteria, group_by=group)


async def _load_visible_vendor_link_context(
    db: AsyncSession,
    *,
    current_user: User,
    vendor_ids: set[int],
    check_permission_fn=check_permission,
) -> VendorLinkContext:
    """Load only linked-register identities the caller may independently read."""
    processes: dict[int, set[int]] = defaultdict(set)
    direct_processes: dict[int, set[int]] = defaultdict(set)
    assets: dict[int, set[int]] = defaultdict(set)
    risks: dict[int, set[int]] = defaultdict(set)
    controls: dict[int, set[int]] = defaultdict(set)
    kris: dict[int, set[int]] = defaultdict(set)
    process_labels: dict[int, str] = {}
    asset_labels: dict[int, str] = {}
    risk_labels: dict[int, str] = {}
    control_labels: dict[int, str] = {}
    kri_labels: dict[int, str] = {}
    empty = VendorLinkContext(
        processes,
        direct_processes,
        assets,
        risks,
        controls,
        kris,
        process_labels,
        asset_labels,
        risk_labels,
        control_labels,
        kri_labels,
    )
    # The #76 record-owner exception is Vendor-record-specific; it must never
    # become ambient authority to enumerate another register.
    if not vendor_ids or not check_permission_fn(current_user, "vendors", "read"):
        return empty

    if check_permission_fn(current_user, "assets", "read"):
        asset_query = (
            select(AssetVendorLink.vendor_id, Asset.id, Asset.name)
            .join(Asset, Asset.id == AssetVendorLink.asset_id)
            .where(AssetVendorLink.vendor_id.in_(vendor_ids))
        )
        asset_clause = asset_visibility_clause(current_user)
        if asset_clause is not None:
            asset_query = asset_query.where(asset_clause)
        for vendor_id, asset_id, label in (await db.execute(asset_query)).all():
            assets[vendor_id].add(asset_id)
            asset_labels[asset_id] = label

    if check_permission_fn(current_user, "processes", "read"):
        direct_query = (
            select(ProcessVendorLink.vendor_id, Process.id, Process.f_code, Process.l1_process)
            .join(Process, Process.id == ProcessVendorLink.process_id)
            .where(ProcessVendorLink.vendor_id.in_(vendor_ids))
        )
        process_clause = process_visibility_clause(current_user)
        if process_clause is not None:
            direct_query = direct_query.where(process_clause)
        for vendor_id, process_id, code, name in (await db.execute(direct_query)).all():
            processes[vendor_id].add(process_id)
            direct_processes[vendor_id].add(process_id)
            process_labels[process_id] = f"{code}: {name}"

        transitive_query = (
            select(AssetVendorLink.vendor_id, Process.id, Process.f_code, Process.l1_process)
            .join(ProcessAssetLink, ProcessAssetLink.asset_id == AssetVendorLink.asset_id)
            .join(Process, Process.id == ProcessAssetLink.process_id)
            .join(Asset, Asset.id == AssetVendorLink.asset_id)
            .where(AssetVendorLink.vendor_id.in_(vendor_ids))
        )
        if process_clause is not None:
            transitive_query = transitive_query.where(process_clause)
        visible_asset_clause = asset_visibility_clause(current_user)
        if visible_asset_clause is not None:
            transitive_query = transitive_query.where(visible_asset_clause)
        for vendor_id, process_id, code, name in (await db.execute(transitive_query)).all():
            processes[vendor_id].add(process_id)
            process_labels[process_id] = f"{code}: {name}"

    if check_permission_fn(current_user, "risks", "read"):
        risk_rows = (
            await db.execute(
                select(VendorRiskLink.vendor_id, Risk.id, Risk.risk_id_code, Risk.name)
                .join(Risk, Risk.id == VendorRiskLink.risk_id)
                .where(VendorRiskLink.vendor_id.in_(vendor_ids))
            )
        ).all()
        readable = await visible_risk_ids(db, current_user, (row[1] for row in risk_rows))
        for vendor_id, risk_id, code, name in risk_rows:
            if risk_id in readable:
                risks[vendor_id].add(risk_id)
                risk_labels[risk_id] = f"{code}: {name}"

    if check_permission_fn(current_user, "controls", "read"):
        control_rows = (
            await db.execute(
                select(VendorControlLink.vendor_id, Control.id, Control.name)
                .join(Control, Control.id == VendorControlLink.control_id)
                .where(VendorControlLink.vendor_id.in_(vendor_ids))
            )
        ).all()
        readable = await visible_control_ids(db, current_user, (row[1] for row in control_rows))
        for vendor_id, control_id, name in control_rows:
            if control_id in readable:
                controls[vendor_id].add(control_id)
                control_labels[control_id] = name

    if check_permission_fn(current_user, "kris", "read"):
        kri_rows = (
            await db.execute(
                select(VendorKRILink.vendor_id, KeyRiskIndicator.id, KeyRiskIndicator.metric_name)
                .join(KeyRiskIndicator, KeyRiskIndicator.id == VendorKRILink.kri_id)
                .where(VendorKRILink.vendor_id.in_(vendor_ids))
            )
        ).all()
        readable = await visible_kri_ids(db, current_user, (row[1] for row in kri_rows))
        for vendor_id, kri_id, name in kri_rows:
            if kri_id in readable:
                kris[vendor_id].add(kri_id)
                kri_labels[kri_id] = name

    return empty


def _selected_boolean(value: bool | None) -> set[str]:
    return {"true"} if value is True else {"false"} if value is False else set()


def _vendor_matches_extended(
    vendor: Vendor,
    criteria: VendorListCriteria,
    *,
    links: VendorLinkContext,
    derived: dict[int, dict[str, Any]],
    roi_vendor_ids: set[int],
    sub_outsourcing_vendor_ids: set[int],
) -> bool:
    if criteria.search:
        needle = criteria.search.casefold()
        haystacks = (
            vendor.name,
            vendor.legal_name,
            vendor.registration_id,
            vendor.process,
            vendor.subprocess,
            vendor.outsourcing_owner.name if vendor.outsourcing_owner else None,
            vendor.outsourcing_owner.email if vendor.outsourcing_owner else None,
            vendor.department.name if vendor.department else None,
            vendor.department.code if vendor.department else None,
            *(links.process_labels.get(value) for value in links.processes.get(vendor.id, set())),
        )
        if not any(needle in value.casefold() for value in haystacks if value):
            return False
    block = derived.get(vendor.id)
    if criteria.tiers and (not block or block.get("tier") not in criteria.tiers):
        return False
    if criteria.cif is not None and (not block or (block.get("cif") == "yes") is not criteria.cif):
        return False
    if criteria.country_categories and vendor_country_category_code(vendor.country) not in criteria.country_categories:
        return False
    if criteria.has_roi_contract is not None and ((vendor.id in roi_vendor_ids) is not criteria.has_roi_contract):
        return False
    if criteria.has_sub_outsourcing is not None and (
        (vendor.id in sub_outsourcing_vendor_ids) is not criteria.has_sub_outsourcing
    ):
        return False
    if criteria.has_direct_process_link is not None and (
        bool(links.direct_processes.get(vendor.id)) is not criteria.has_direct_process_link
    ):
        return False
    link_filters = (
        (criteria.linked_process_ids, links.processes),
        (criteria.linked_asset_ids, links.assets),
        (criteria.linked_risk_ids, links.risks),
        (criteria.linked_control_ids, links.controls),
        (criteria.linked_kri_ids, links.kris),
    )
    return all(
        not selected or bool(set(selected) & memberships.get(vendor.id, set()))
        for selected, memberships in link_filters
    )


def _vendor_matches(
    vendor: Vendor,
    criteria: VendorListCriteria,
    *,
    links: VendorLinkContext,
    derived: dict[int, dict[str, Any]],
    roi_vendor_ids: set[int],
    sub_outsourcing_vendor_ids: set[int],
    derived_allowed: bool,
    contracts_allowed: bool,
    processes_allowed: bool,
) -> bool:
    lifecycle = "archived" if vendor.is_archived else "active"
    if criteria.lifecycle:
        if lifecycle not in criteria.lifecycle:
            return False
    elif not criteria.include_archived and vendor.is_archived:
        return False
    if criteria.vendor_type is not None and vendor.vendor_type != criteria.vendor_type.value:
        return False
    if criteria.vendor_types and vendor.vendor_type not in criteria.vendor_types:
        return False
    if criteria.dora_relevant is not None and vendor.dora_relevant is not criteria.dora_relevant:
        return False
    if (
        criteria.supports_important_core_insurance_function is not None
        and vendor.supports_important_core_insurance_function is not criteria.supports_important_core_insurance_function
    ):
        return False
    if (
        criteria.is_significant_vendor is not None
        and vendor.is_significant_vendor is not criteria.is_significant_vendor
    ):
        return False
    if criteria.outsourcing_owner_user_id is not None and (
        vendor.outsourcing_owner_user_id != criteria.outsourcing_owner_user_id
    ):
        return False
    if criteria.outsourcing_owner_ids and vendor.outsourcing_owner_user_id not in criteria.outsourcing_owner_ids:
        return False
    if criteria.department_id is not None and vendor.department_id != criteria.department_id:
        return False
    if criteria.department_ids and vendor.department_id not in criteria.department_ids:
        return False
    if criteria.process is not None and vendor.process != criteria.process:
        return False
    if criteria.subprocess is not None and vendor.subprocess != criteria.subprocess:
        return False
    if criteria.risk_score_1_5 is not None and vendor.risk_score_1_5 != criteria.risk_score_1_5:
        return False
    if criteria.risk_scores and vendor.risk_score_1_5 not in criteria.risk_scores:
        return False
    if criteria.substitutability and vendor.replaceability not in criteria.substitutability:
        return False
    if criteria.countries and vendor.country not in criteria.countries:
        return False
    if (criteria.tiers or criteria.cif is not None) and not derived_allowed:
        return False
    if (criteria.has_roi_contract is not None or criteria.has_sub_outsourcing is not None) and not contracts_allowed:
        return False
    if (criteria.has_direct_process_link is not None or criteria.linked_process_ids) and not processes_allowed:
        return False
    return _vendor_matches_extended(
        vendor,
        criteria,
        links=links,
        derived=derived,
        roi_vendor_ids=roi_vendor_ids,
        sub_outsourcing_vendor_ids=sub_outsourcing_vendor_ids,
    )


def _build_vendor_facets(
    all_vendors: list[Vendor],
    criteria: VendorListCriteria,
    *,
    links: VendorLinkContext,
    derived: dict[int, dict[str, Any]],
    roi_vendor_ids: set[int],
    sub_outsourcing_vendor_ids: set[int],
    derived_allowed: bool,
    contracts_allowed: bool,
    processes_allowed: bool,
) -> dict[str, list[VendorFacetOption]]:
    def matching(dimension_criteria: VendorListCriteria) -> list[Vendor]:
        return [
            vendor
            for vendor in all_vendors
            if _vendor_matches(
                vendor,
                dimension_criteria,
                links=links,
                derived=derived,
                roi_vendor_ids=roi_vendor_ids,
                sub_outsourcing_vendor_ids=sub_outsourcing_vendor_ids,
                derived_allowed=derived_allowed,
                contracts_allowed=contracts_allowed,
                processes_allowed=processes_allowed,
            )
        ]

    without = {
        "lifecycle": replace(criteria, lifecycle=(), include_archived=True),
        "department": replace(criteria, department_ids=(), department_id=None),
        "outsourcing_owner": replace(criteria, outsourcing_owner_ids=(), outsourcing_owner_user_id=None),
        "vendor_type": replace(criteria, vendor_types=(), vendor_type=None),
        "risk_score": replace(criteria, risk_scores=(), risk_score_1_5=None),
        "tier": replace(criteria, tiers=()),
        "dora_relevant": replace(criteria, dora_relevant=None),
        "cif": replace(criteria, cif=None),
        "is_significant_vendor": replace(criteria, is_significant_vendor=None),
        "substitutability": replace(criteria, substitutability=()),
        "country": replace(criteria, countries=()),
        "country_category": replace(criteria, country_categories=()),
        "has_roi_contract": replace(criteria, has_roi_contract=None),
        "has_sub_outsourcing": replace(criteria, has_sub_outsourcing=None),
        "has_direct_process_link": replace(criteria, has_direct_process_link=None),
    }
    rows = {dimension: matching(value) for dimension, value in without.items()}

    def counts(dimension: str, value_fn) -> Counter[str]:
        return Counter(value for vendor in rows[dimension] if (value := value_fn(vendor)) is not None)

    dimension_counts = {
        "lifecycle": counts("lifecycle", lambda item: "archived" if item.is_archived else "active"),
        "department": counts("department", lambda item: str(item.department_id) if item.department_id else None),
        "outsourcing_owner": counts("outsourcing_owner", lambda item: str(item.outsourcing_owner_user_id)),
        "vendor_type": counts("vendor_type", lambda item: item.vendor_type),
        "risk_score": counts("risk_score", lambda item: str(item.risk_score_1_5)),
        "tier": counts("tier", lambda item: (derived.get(item.id) or {}).get("tier")),
        "dora_relevant": counts("dora_relevant", lambda item: str(item.dora_relevant).lower()),
        "cif": counts("cif", lambda item: (derived.get(item.id) or {}).get("cif")),
        "is_significant_vendor": counts("is_significant_vendor", lambda item: str(item.is_significant_vendor).lower()),
        "substitutability": counts("substitutability", lambda item: item.replaceability),
        "country": counts("country", lambda item: item.country),
        "country_category": counts("country_category", lambda item: vendor_country_category_code(item.country)),
        "has_roi_contract": counts(
            "has_roi_contract", lambda item: str(item.id in roi_vendor_ids).lower() if contracts_allowed else None
        ),
        "has_sub_outsourcing": counts(
            "has_sub_outsourcing",
            lambda item: str(item.id in sub_outsourcing_vendor_ids).lower() if contracts_allowed else None,
        ),
        "has_direct_process_link": counts(
            "has_direct_process_link",
            lambda item: str(bool(links.direct_processes.get(item.id))).lower() if processes_allowed else None,
        ),
    }
    department_catalog = {
        str(item.department_id): item.department.name for item in all_vendors if item.department_id and item.department
    }
    owner_catalog = {
        str(item.outsourcing_owner_user_id): item.outsourcing_owner.name
        for item in all_vendors
        if item.outsourcing_owner
    }

    def options(dimension: str, catalog: dict[str, str], selected: set[str]) -> list[VendorFacetOption]:
        current_counts = dimension_counts[dimension]
        return [
            VendorFacetOption(
                value=value,
                label=label,
                count=current_counts[value],
                disabled=current_counts[value] == 0,
                selected=value in selected,
            )
            for value, label in sorted(catalog.items(), key=lambda pair: pair[1].casefold())
        ]

    boolean_catalog = {"true": "yes", "false": "no"}
    return {
        "lifecycle": options("lifecycle", {"active": "active", "archived": "archived"}, set(criteria.lifecycle)),
        "department": options("department", department_catalog, {str(value) for value in criteria.department_ids}),
        "outsourcing_owner": options(
            "outsourcing_owner", owner_catalog, {str(value) for value in criteria.outsourcing_owner_ids}
        ),
        "vendor_type": options(
            "vendor_type",
            {code: vendor_value_label("vendor_type", code) for code in VENDOR_CONTROLLED_CODES_BY_FIELD["vendor_type"]},
            set(criteria.vendor_types),
        ),
        "risk_score": options(
            "risk_score",
            {str(value): str(value) for value in range(1, 6)},
            {str(value) for value in criteria.risk_scores},
        ),
        "tier": options(
            "tier", {code: vendor_value_label("tier", code) for code in _VENDOR_TIERS}, set(criteria.tiers)
        ),
        "dora_relevant": options("dora_relevant", boolean_catalog, _selected_boolean(criteria.dora_relevant)),
        "cif": options(
            "cif",
            {code: vendor_value_label("cif", code) for code in ("yes", "no")},
            ({"yes"} if criteria.cif is True else {"no"} if criteria.cif is False else set()),
        ),
        "is_significant_vendor": options(
            "is_significant_vendor", boolean_catalog, _selected_boolean(criteria.is_significant_vendor)
        ),
        "substitutability": options(
            "substitutability",
            {
                code: vendor_value_label("replaceability", code)
                for code in VENDOR_CONTROLLED_CODES_BY_FIELD["replaceability"]
            },
            set(criteria.substitutability),
        ),
        "country": options(
            "country",
            {code: vendor_value_label("country", code) for code in VENDOR_CONTROLLED_CODES_BY_FIELD["country"]},
            set(criteria.countries),
        ),
        "country_category": options(
            "country_category",
            {code: vendor_value_label("country_category", code) for code in _VENDOR_COUNTRY_CATEGORIES},
            set(criteria.country_categories),
        ),
        "has_roi_contract": options("has_roi_contract", boolean_catalog, _selected_boolean(criteria.has_roi_contract)),
        "has_sub_outsourcing": options(
            "has_sub_outsourcing", boolean_catalog, _selected_boolean(criteria.has_sub_outsourcing)
        ),
        "has_direct_process_link": options(
            "has_direct_process_link", boolean_catalog, _selected_boolean(criteria.has_direct_process_link)
        ),
    }


async def vendor_filter_lookups(
    db: AsyncSession,
    *,
    current_user: User,
    kind: str,
    search: str | None,
    selected_ids: tuple[int, ...],
    limit: int,
) -> list[VendorLookupOption]:
    """Resolve remote Vendor filters without crossing the caller's list scope."""
    vendor_query = apply_vendor_visibility_scope(select(Vendor), current_user).options(
        selectinload(Vendor.department),
        selectinload(Vendor.outsourcing_owner),
    )
    vendors = list((await db.execute(vendor_query)).scalars().unique().all())
    vendor_ids = {vendor.id for vendor in vendors}
    links = await _load_visible_vendor_link_context(
        db,
        current_user=current_user,
        vendor_ids=vendor_ids,
    )
    rows: list[tuple[int, str, str | None, int]] = []
    if kind == "outsourcing-owners":
        counts = Counter(vendor.outsourcing_owner_user_id for vendor in vendors)
        rows = [
            (
                vendor.outsourcing_owner_user_id,
                vendor.outsourcing_owner.name,
                vendor.outsourcing_owner.email,
                counts[vendor.outsourcing_owner_user_id],
            )
            for vendor in vendors
            if vendor.outsourcing_owner
        ]
    elif kind == "departments":
        counts = Counter(vendor.department_id for vendor in vendors if vendor.department_id)
        rows = [
            (vendor.department_id, vendor.department.name, vendor.department.code, counts[vendor.department_id])
            for vendor in vendors
            if vendor.department_id and vendor.department
        ]
    else:
        contexts = {
            "processes": (links.processes, links.process_labels),
            "assets": (links.assets, links.asset_labels),
            "risks": (links.risks, links.risk_labels),
            "controls": (links.controls, links.control_labels),
            "kris": (links.kris, links.kri_labels),
        }
        if kind not in contexts:
            raise ValidationError("Invalid Vendor lookup kind")
        memberships, labels = contexts[kind]
        counts = Counter(entity_id for vendor_id in vendor_ids for entity_id in memberships.get(vendor_id, set()))
        rows = [(entity_id, label, None, counts[entity_id]) for entity_id, label in labels.items()]

    deduplicated = {row[0]: row for row in rows}
    visible_selected = set(selected_ids) & set(deduplicated)
    needle = (search or "").casefold()
    selected_rows = [row for row in deduplicated.values() if row[0] in visible_selected]
    ordinary_rows = [
        row
        for row in deduplicated.values()
        if row[0] not in visible_selected
        and (not needle or needle in row[1].casefold() or needle in (row[2] or "").casefold())
    ]
    selected_rows.sort(key=lambda row: (row[1].casefold(), row[0]))
    ordinary_rows.sort(key=lambda row: (row[1].casefold(), row[0]))
    remaining = max(limit - len(selected_rows), 0)
    return [
        VendorLookupOption(id=row[0], label=row[1], secondary_label=row[2], count=row[3])
        for row in (*selected_rows, *ordinary_rows[:remaining])
    ]


def build_vendor_collection_capabilities(
    current_user: User,
    *,
    check_permission_fn=check_permission,
) -> dict[str, bool]:
    can_read_vendors = check_permission_fn(current_user, "vendors", "read")
    return {
        "can_create": check_permission_fn(current_user, "vendors", "write"),
        "can_export": can_read_vendors
        and check_permission_fn(current_user, "reports", "read"),
        "can_view_risk_contexts": can_read_vendors
        and check_permission_fn(current_user, "risks", "read"),
    }


def coerce_vendor_list_criteria(
    collection_query: CollectionQuery,
    *,
    search: str | None,
    include_archived: bool,
    vendor_type: VendorTypeEnum | None,
    dora_relevant: bool | None,
    supports_important_core_insurance_function: bool | None,
    is_significant_vendor: bool | None,
    outsourcing_owner_user_id: int | None,
    department_id: int | None,
    process: str | None,
    subprocess: str | None,
    risk_score_1_5: int | None,
    sort_by: str | None,
    sort_order: str | None,
) -> VendorListCriteria:
    filter_values = merge_collection_filters(
        collection_query,
        {
            "search": search,
            "include_archived": include_archived,
            "vendor_type": vendor_type.value if vendor_type else None,
            "dora_relevant": dora_relevant,
            "supports_important_core_insurance_function": supports_important_core_insurance_function,
            "is_significant_vendor": is_significant_vendor,
            "outsourcing_owner_user_id": outsourcing_owner_user_id,
            "department_id": department_id,
            "process": process,
            "subprocess": subprocess,
            "risk_score_1_5": risk_score_1_5,
        },
    )
    return VendorListCriteria(
        offset=collection_query.offset,
        limit=collection_query.limit,
        search=coerce_optional_string("search", filter_values.get("search")),
        include_archived=coerce_optional_bool("include_archived", filter_values.get("include_archived")) or False,
        vendor_type=coerce_optional_enum(VendorTypeEnum, filter_values.get("vendor_type"), "vendor_type"),
        dora_relevant=coerce_optional_bool("dora_relevant", filter_values.get("dora_relevant")),
        supports_important_core_insurance_function=coerce_optional_bool(
            "supports_important_core_insurance_function",
            filter_values.get("supports_important_core_insurance_function"),
        ),
        is_significant_vendor=coerce_optional_bool("is_significant_vendor", filter_values.get("is_significant_vendor")),
        outsourcing_owner_user_id=coerce_optional_int(
            "outsourcing_owner_user_id", filter_values.get("outsourcing_owner_user_id")
        ),
        department_id=coerce_optional_int("department_id", filter_values.get("department_id")),
        process=coerce_optional_string("process", filter_values.get("process")),
        subprocess=coerce_optional_string("subprocess", filter_values.get("subprocess")),
        risk_score_1_5=coerce_optional_int(
            "risk_score_1_5", filter_values.get("risk_score_1_5"), min_value=1, max_value=5
        ),
        sort_by=collection_query.sort.field if collection_query.sort else sort_by,
        sort_order=collection_query.sort.direction if collection_query.sort else sort_order,
    )


def apply_vendor_list_filters(query: Any, current_user: User, criteria: VendorListCriteria) -> Any:
    query = apply_vendor_visibility_scope(query, current_user, department_id=criteria.department_id)

    if criteria.lifecycle:
        lifecycle_clauses = []
        if "active" in criteria.lifecycle:
            lifecycle_clauses.append(archived_clause(Vendor, archived=False))
        if "archived" in criteria.lifecycle:
            lifecycle_clauses.append(archived_clause(Vendor, archived=True))
        query = query.where(or_(*lifecycle_clauses))
    elif not criteria.include_archived:
        query = query.where(archived_clause(Vendor, archived=False))
    if criteria.vendor_type is not None:
        query = query.where(Vendor.vendor_type == criteria.vendor_type.value)
    if criteria.dora_relevant is not None:
        query = query.where(Vendor.dora_relevant == criteria.dora_relevant)
    if criteria.supports_important_core_insurance_function is not None:
        query = query.where(
            Vendor.supports_important_core_insurance_function == criteria.supports_important_core_insurance_function
        )
    if criteria.is_significant_vendor is not None:
        query = query.where(Vendor.is_significant_vendor == criteria.is_significant_vendor)
    if criteria.outsourcing_owner_user_id is not None:
        query = query.where(Vendor.outsourcing_owner_user_id == criteria.outsourcing_owner_user_id)
    if criteria.process is not None:
        query = query.where(Vendor.process == criteria.process)
    if criteria.subprocess is not None:
        query = query.where(Vendor.subprocess == criteria.subprocess)
    if criteria.risk_score_1_5 is not None:
        query = query.where(Vendor.risk_score_1_5 == criteria.risk_score_1_5)
    if criteria.department_ids:
        query = query.where(Vendor.department_id.in_(criteria.department_ids))
    if criteria.outsourcing_owner_ids:
        query = query.where(Vendor.outsourcing_owner_user_id.in_(criteria.outsourcing_owner_ids))
    if criteria.vendor_types:
        query = query.where(Vendor.vendor_type.in_(criteria.vendor_types))
    if criteria.risk_scores:
        query = query.where(Vendor.risk_score_1_5.in_(criteria.risk_scores))
    if criteria.substitutability:
        query = query.where(Vendor.replaceability.in_(criteria.substitutability))
    if criteria.countries:
        query = query.where(Vendor.country.in_(criteria.countries))
    if criteria.search:
        pattern = f"%{criteria.search}%"
        query = query.where(
            or_(
                Vendor.name.ilike(pattern),
                Vendor.legal_name.ilike(pattern),
                Vendor.registration_id.ilike(pattern),
                Vendor.process.ilike(pattern),
                Vendor.subprocess.ilike(pattern),
                Vendor.outsourcing_owner.has(User.name.ilike(pattern)),
                Vendor.outsourcing_owner.has(User.email.ilike(pattern)),
                Vendor.department.has(Department.name.ilike(pattern)),
                Vendor.department.has(Department.code.ilike(pattern)),
            )
        )

    return query


def vendor_order_column(sort_by: str | None) -> Any:
    sort_columns: dict[str, Any] = {
        "name": Vendor.name,
        "legal_name": Vendor.legal_name,
        "registration_id": Vendor.registration_id,
        "department": Vendor.department_id,
        "outsourcing_owner": Vendor.outsourcing_owner_user_id,
        "vendor_type": Vendor.vendor_type,
        "risk_score": Vendor.risk_score_1_5,
        "risk_score_1_5": Vendor.risk_score_1_5,
        "process": Vendor.process,
        "country": Vendor.country,
        "created_at": Vendor.created_at,
    }
    if sort_by is None:
        return Vendor.name
    if sort_by not in sort_columns:
        raise ValidationError("Invalid sort_by value")
    return sort_columns[sort_by]


def vendor_group_counts() -> tuple:
    return (
        func.count(func.distinct(Vendor.id)).label("count"),
        func.count(
            func.distinct(
                case(
                    (
                        archived_clause(Vendor, archived=False),
                        Vendor.id,
                    ),
                    else_=None,
                )
            )
        ).label("active_count"),
        func.count(func.distinct(case((Vendor.risk_score_1_5 >= 4, Vendor.id), else_=None))).label("highlighted_count"),
    )


def vendor_group_rows_to_reads(rows) -> list[CollectionGroupRead]:
    return [
        CollectionGroupRead(
            value=row.value,
            label=row.label,
            count=row.count,
            active_count=row.active_count,
            highlighted_count=row.highlighted_count,
        )
        for row in rows
    ]


async def visible_vendor_risk_context(
    db: AsyncSession,
    filtered_ids,
    current_user: User,
    *,
    can_read_risks: bool,
):
    query = (
        select(
            VendorRiskLink.vendor_id.label("vendor_id"),
            Risk.id.label("risk_id"),
            Risk.risk_id_code.label("risk_id_code"),
            Risk.name.label("risk_name"),
        )
        .select_from(VendorRiskLink)
        .join(filtered_ids, filtered_ids.c.id == VendorRiskLink.vendor_id)
        .join(Risk, Risk.id == VendorRiskLink.risk_id)
    )
    risk_visibility = await risk_visibility_clause(db, current_user) if can_read_risks else false()
    if risk_visibility is not None:
        query = query.where(risk_visibility)
    return query.subquery()


def vendor_flag_membership_query(filtered_ids):
    def flag_select(value: str, condition):
        return (
            select(
                literal(value).label("value"),
                literal(value).label("label"),
                Vendor.id.label("vendor_id"),
                Vendor.is_archived.label("is_archived"),
                Vendor.risk_score_1_5.label("risk_score_1_5"),
            )
            .join(filtered_ids, filtered_ids.c.id == Vendor.id)
            .where(condition)
        )

    return union_all(
        flag_select(VENDOR_GROUP_DORA_RELEVANT, Vendor.dora_relevant.is_(True)),
        flag_select(
            VENDOR_GROUP_SUPPORTS_CORE_FUNCTION,
            Vendor.supports_important_core_insurance_function.is_(True),
        ),
        flag_select(VENDOR_GROUP_SIGNIFICANT_VENDOR, Vendor.is_significant_vendor.is_(True)),
        flag_select(
            VENDOR_GROUP_INSIGNIFICANT_VENDOR,
            Vendor.dora_relevant.is_(False),
        ).where(
            Vendor.supports_important_core_insurance_function.is_(False),
            Vendor.is_significant_vendor.is_(False),
        ),
    ).subquery()


async def load_vendor_sql_groups(
    db: AsyncSession,
    filtered_ids,
    group_by: str,
    *,
    current_user: User,
    can_read_risks: bool,
) -> list[CollectionGroupRead]:
    query = select(Vendor).join(filtered_ids, filtered_ids.c.id == Vendor.id)
    value_expr: Any
    label_expr: Any

    if group_by == "department":
        query = query.outerjoin(Department, Department.id == Vendor.department_id)
        value_expr = func.coalesce(Department.name, literal(VENDOR_GROUP_UNASSIGNED))
        label_expr = value_expr
    elif group_by == "type":
        value_expr = Vendor.vendor_type
        label_expr = Vendor.vendor_type
    elif group_by == "risk":
        risk_context = await visible_vendor_risk_context(
            db,
            filtered_ids,
            current_user,
            can_read_risks=can_read_risks,
        )
        query = query.outerjoin(risk_context, risk_context.c.vendor_id == Vendor.id)
        value_expr = func.coalesce(
            literal("risk:") + func.cast(risk_context.c.risk_id, String),
            literal(VENDOR_GROUP_UNLINKED_RISK),
        )
        label_expr = func.coalesce(
            risk_context.c.risk_id_code + literal(": ") + risk_context.c.risk_name,
            literal(VENDOR_GROUP_UNLINKED_RISK),
        )
    elif group_by == "flag":
        flag_rows = vendor_flag_membership_query(filtered_ids)
        rows = (
            (
                await db.execute(
                    select(
                        flag_rows.c.value,
                        flag_rows.c.label,
                        func.count(func.distinct(flag_rows.c.vendor_id)).label("count"),
                        func.count(
                            func.distinct(
                                case(
                                    (
                                        flag_rows.c.is_archived.is_(False),
                                        flag_rows.c.vendor_id,
                                    ),
                                    else_=None,
                                )
                            )
                        ).label("active_count"),
                        func.count(
                            func.distinct(case((flag_rows.c.risk_score_1_5 >= 4, flag_rows.c.vendor_id), else_=None))
                        ).label("highlighted_count"),
                    )
                    .group_by(flag_rows.c.value, flag_rows.c.label)
                    .order_by(flag_rows.c.label)
                )
            )
            .mappings()
            .all()
        )
        return vendor_group_rows_to_reads(rows)
    else:
        return []

    rows = (
        (
            await db.execute(
                query.with_only_columns(
                    value_expr.label("value"),
                    label_expr.label("label"),
                    *vendor_group_counts(),
                )
                .group_by(value_expr, label_expr)
                .order_by(label_expr)
            )
        )
        .mappings()
        .all()
    )
    return vendor_group_rows_to_reads(rows)


def vendor_group_value_filter(
    group_by: str,
    group_value: str,
    *,
    risk_context=None,
):
    if group_by == "department":
        if group_value == VENDOR_GROUP_UNASSIGNED:
            return Vendor.department_id.is_(None)
        return Vendor.department.has(Department.name == group_value)
    if group_by == "type":
        return Vendor.vendor_type == group_value
    if group_by == "flag":
        if group_value == VENDOR_GROUP_DORA_RELEVANT:
            return Vendor.dora_relevant.is_(True)
        if group_value == VENDOR_GROUP_SUPPORTS_CORE_FUNCTION:
            return Vendor.supports_important_core_insurance_function.is_(True)
        if group_value == VENDOR_GROUP_SIGNIFICANT_VENDOR:
            return Vendor.is_significant_vendor.is_(True)
        if group_value == VENDOR_GROUP_INSIGNIFICANT_VENDOR:
            return (
                Vendor.dora_relevant.is_(False)
                & Vendor.supports_important_core_insurance_function.is_(False)
                & Vendor.is_significant_vendor.is_(False)
            )
        return Vendor.id.is_(None)
    if group_by == "risk" and group_value.startswith("risk:"):
        risk_id = parse_prefixed_group_value(group_value, prefix="risk")
        if risk_id is None:
            return false()
        if risk_context is None:
            return false()
        return Vendor.id.in_(select(risk_context.c.vendor_id).where(risk_context.c.risk_id == risk_id))
    if group_by == "risk" and group_value == VENDOR_GROUP_UNLINKED_RISK and risk_context is not None:
        return ~Vendor.id.in_(select(risk_context.c.vendor_id))
    return None


def vendor_process_group_entries(
    vendor: Any,
    *,
    links: VendorLinkContext,
) -> list[CollectionGroupEntry]:
    process_ids = links.processes.get(vendor.id, set())
    entries = [
        CollectionGroupEntry(
            value=f"process:{process_id}",
            label=links.process_labels[process_id],
        )
        for process_id in sorted(process_ids)
        if process_id in links.process_labels
    ]
    return entries or [
        CollectionGroupEntry(
            value=VENDOR_GROUP_NO_PROCESS,
            label=VENDOR_GROUP_NO_PROCESS,
        )
    ]


def vendor_process_in_memory_grouped_page(
    all_items: list[Any],
    query: CollectionQuery,
    *,
    links: VendorLinkContext,
):
    return build_grouped_collection_page(
        all_items,
        query,
        get_entries=lambda vendor, _group_by: vendor_process_group_entries(
            vendor,
            links=links,
        ),
        is_active=lambda vendor: not vendor.is_archived,
        is_highlighted=lambda vendor: vendor.risk_score_1_5 >= 4,
    )


def plan_vendor_listing(
    *,
    db: AsyncSession,
    filtered_ids,
    current_user: User,
    can_read_risks: bool,
    links: VendorLinkContext,
    group_by: str | None,
    ordered_query: Any,
    capabilities: dict[str, bool] | None,
    serialize_items: SerializeItems[Vendor, Any],
    serialize_sql_items: SerializeItems[Vendor, Any],
    total: int,
) -> RegisterListingPlan[Vendor, Any]:
    async def load_sql_groups(group_by: str):
        return await load_vendor_sql_groups(
            db,
            filtered_ids,
            group_by,
            current_user=current_user,
            can_read_risks=can_read_risks,
        )

    async def build_sql_group_filter(group_by: str, group_value: str | None):
        risk_context = (
            await visible_vendor_risk_context(
                db,
                filtered_ids,
                current_user,
                can_read_risks=can_read_risks,
            )
            if group_by == "risk"
            else None
        )
        return vendor_group_value_filter(
            group_by,
            group_value or "",
            risk_context=risk_context,
        )

    return build_register_listing_plan(
        ordered_query=ordered_query,
        capabilities=capabilities,
        serialize_items=serialize_items,
        serialize_sql_items=serialize_sql_items,
        total=total,
        sql_group_keys={group_by} if group_by and group_by != "process" else frozenset(),
        load_sql_groups=load_sql_groups,
        build_sql_group_filter=build_sql_group_filter,
        build_in_memory_grouped_page=lambda all_items, query: vendor_process_in_memory_grouped_page(
            all_items,
            query,
            links=links,
        ),
    )


async def list_vendor_governance(
    *,
    db: AsyncSession,
    current_user: User,
    collection_query: CollectionQuery,
    search: str | None = None,
    include_archived: bool = False,
    vendor_type: VendorTypeEnum | None = None,
    dora_relevant: bool | None = None,
    supports_important_core_insurance_function: bool | None = None,
    is_significant_vendor: bool | None = None,
    outsourcing_owner_user_id: int | None = None,
    department_id: int | None = None,
    process: str | None = None,
    subprocess: str | None = None,
    risk_score_1_5: int | None = None,
    sort_by: str | None = None,
    sort_order: str | None = "asc",
    has_direct_process_link: bool | None = None,
    has_roi_contract: bool | None = None,
    has_sub_outsourcing: bool | None = None,
    tier: str | None = None,
    criteria_override: VendorListCriteria | None = None,
    check_permission_fn=check_permission,
    visible_risk_ids_loader=get_visible_vendor_risk_ids,
) -> VendorListResponse:
    criteria = criteria_override or coerce_vendor_list_criteria(
        collection_query,
        search=search,
        include_archived=include_archived,
        vendor_type=vendor_type,
        dora_relevant=dora_relevant,
        supports_important_core_insurance_function=supports_important_core_insurance_function,
        is_significant_vendor=is_significant_vendor,
        outsourcing_owner_user_id=outsourcing_owner_user_id,
        department_id=department_id,
        process=process,
        subprocess=subprocess,
        risk_score_1_5=risk_score_1_5,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    if criteria_override is None:
        criteria = replace(
            criteria,
            has_direct_process_link=has_direct_process_link,
            has_roi_contract=has_roi_contract,
            has_sub_outsourcing=has_sub_outsourcing,
            tiers=(tier,) if tier else (),
            group_by=collection_query.group_by,
            group_value=collection_query.group_value,
        )

    # The assigned-owner exception exposes only the Vendor record itself.
    # Linked-register projection still requires canonical Vendor read authority.
    can_read_risks = bool(
        check_permission_fn(current_user, "vendors", "read") and check_permission_fn(current_user, "risks", "read")
    )
    collection_capabilities = build_vendor_collection_capabilities(
        current_user,
        check_permission_fn=check_permission_fn,
    )
    can_view_full_derivation = can_view_vendor_full_derivation(
        current_user,
        check_permission_fn=check_permission_fn,
    )
    can_view_contract_context = bool(
        check_permission_fn(current_user, "vendors", "read")
        and check_permission_fn(current_user, "vendor_contracts", "read")
    )
    can_view_process_context = bool(
        check_permission_fn(current_user, "vendors", "read") and check_permission_fn(current_user, "processes", "read")
    )
    query_options = (
        selectinload(Vendor.department),
        selectinload(Vendor.outsourcing_owner),
        selectinload(Vendor.risk_links).selectinload(VendorRiskLink.risk),
    )
    visible_query = apply_vendor_visibility_scope(select(Vendor), current_user).options(*query_options)
    candidates = list((await db.execute(visible_query.order_by(Vendor.id))).scalars().unique().all())
    candidate_ids = {vendor.id for vendor in candidates}
    links = await _load_visible_vendor_link_context(
        db,
        current_user=current_user,
        vendor_ids=candidate_ids,
        check_permission_fn=check_permission_fn,
    )
    derived: dict[int, dict[str, Any]] = {}
    if can_view_full_derivation and candidates:
        parameters = await load_ict_workbook_parameter_set(db)
        graph = await load_ict_register_graph(db, vendors=candidates)
        derivation = derive_ict_register(graph, parameters)
        derived = {
            vendor_id: canonicalize_vendor_derived(block)
            for vendor_id, block in derivation.vendors.items()
            if vendor_id in candidate_ids
        }
    roi_vendor_ids: set[int] = set()
    sub_outsourcing_vendor_ids: set[int] = set()
    if can_view_contract_context and candidate_ids:
        roi_vendor_ids = set(
            (
                await db.execute(
                    select(VendorContract.vendor_id).where(
                        VendorContract.vendor_id.in_(candidate_ids),
                        archived_clause(VendorContract, archived=False),
                        VendorContract.roi_scope == "Ano",
                    )
                )
            ).scalars()
        )
        sub_outsourcing_vendor_ids = set(
            (
                await db.execute(
                    select(VendorSubOutsourcing.vendor_id).where(
                        VendorSubOutsourcing.vendor_id.in_(candidate_ids),
                        archived_clause(VendorSubOutsourcing, archived=False),
                    )
                )
            ).scalars()
        )
    matching_candidates = [
        vendor
        for vendor in candidates
        if _vendor_matches(
            vendor,
            criteria,
            links=links,
            derived=derived,
            roi_vendor_ids=roi_vendor_ids,
            sub_outsourcing_vendor_ids=sub_outsourcing_vendor_ids,
            derived_allowed=can_view_full_derivation,
            contracts_allowed=can_view_contract_context,
            processes_allowed=can_view_process_context,
        )
    ]
    eligible_ids = [vendor.id for vendor in matching_candidates]
    facets = _build_vendor_facets(
        candidates,
        criteria,
        links=links,
        derived=derived,
        roi_vendor_ids=roi_vendor_ids,
        sub_outsourcing_vendor_ids=sub_outsourcing_vendor_ids,
        derived_allowed=can_view_full_derivation,
        contracts_allowed=can_view_contract_context,
        processes_allowed=can_view_process_context,
    )
    base_query = apply_vendor_visibility_scope(select(Vendor), current_user).where(Vendor.id.in_(eligible_ids))
    total = len(eligible_ids)
    computed_sort_fields = {"department", "outsourcing_owner", "tier", "cif"}
    if criteria.sort_by in computed_sort_fields:

        def computed_value(vendor: Vendor) -> str:
            if criteria.sort_by == "department":
                return vendor.department.name if vendor.department else ""
            if criteria.sort_by == "outsourcing_owner":
                return vendor.outsourcing_owner.name if vendor.outsourcing_owner else ""
            return str((derived.get(vendor.id) or {}).get(criteria.sort_by or "", ""))

        sorted_for_order = sorted(
            matching_candidates,
            key=lambda vendor: (computed_value(vendor).casefold(), vendor.id),
            reverse=criteria.sort_order == "desc",
        )
        order_column = case(
            {vendor.id: index for index, vendor in enumerate(sorted_for_order)},
            value=Vendor.id,
            else_=len(sorted_for_order),
        )
        direction = asc
    else:
        order_column = vendor_order_column(criteria.sort_by)
        direction = desc if criteria.sort_order == "desc" else asc
    base_query = base_query.order_by(direction(order_column), direction(Vendor.id))

    filtered_vendor_ids = base_query.with_only_columns(Vendor.id).order_by(None).subquery()
    ordered_query = base_query.options(*query_options)

    async def serialize_vendors(vendors):
        items = await serialize_vendor_reads(
            db,
            list(vendors),
            current_user=current_user,
            can_read_risks=can_read_risks,
            visible_risk_ids_loader=visible_risk_ids_loader,
        )
        if not derived:
            return items
        return [
            item.model_copy(update={"derived": VendorDerived.model_validate(derived[item.id])})
            if item.id in derived
            else item
            for item in items
        ]

    async def serialize_grouped_vendors(vendors):
        response = await serialize_vendor_list_items(
            db,
            list(vendors),
            current_user=current_user,
            can_read_risks=can_read_risks,
            total=0,
            offset=criteria.offset,
            limit=criteria.limit,
            capabilities=collection_capabilities,
            visible_risk_ids_loader=visible_risk_ids_loader,
        )
        return response.items

    listing_plan = plan_vendor_listing(
        db=db,
        filtered_ids=filtered_vendor_ids,
        current_user=current_user,
        can_read_risks=can_read_risks,
        links=links,
        group_by=collection_query.group_by,
        ordered_query=ordered_query,
        capabilities=collection_capabilities,
        serialize_items=serialize_vendors,
        serialize_sql_items=serialize_grouped_vendors,
        total=total,
    )

    response = await execute_register_listing_plan(
        db=db,
        response_model=VendorListResponse,
        query=collection_query,
        plan=listing_plan,
    )
    response.facets = facets
    return response
