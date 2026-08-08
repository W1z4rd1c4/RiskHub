"""Permission-safe shared register listing implementation for Assets (#78)."""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, replace
from typing import Any, Literal

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ValidationError
from app.core.permissions import visible_risk_ids, visible_vendor_ids
from app.core.security import check_permission
from app.models import (
    Asset,
    AssetAssetLink,
    AssetVendorLink,
    Process,
    ProcessAssetLink,
    Risk,
    RiskAssetLink,
    User,
    Vendor,
)
from app.schemas.asset import AssetFacetOption, AssetLookupOption, AssetRead
from app.schemas.collection import CollectionGroupRead
from app.services._collection_filters import (
    coerce_optional_bool,
    coerce_optional_string,
)
from app.services._ict_register_lifecycle.asset_policy import asset_visibility_clause
from app.services._ict_register_lifecycle.asset_projection import (
    build_asset_collection_capabilities,
    load_asset_derived_blocks,
    pending_asset_responsibility_roles,
    serialize_asset_detail,
)
from app.services._ict_register_lifecycle.policy import process_visibility_clause
from app.services._ict_register_reference.asset_values import (
    ASSET_DATA_CLASSIFICATION_CODES,
    ASSET_DEPLOYMENT_MODEL_CODES,
    ASSET_INTERNET_EXPOSED_CODES,
    ASSET_LEVEL_CODES,
    ASSET_LIFECYCLE_STATE_CODES,
    ASSET_PRELIMINARY_CRITICALITY_CODES,
    ASSET_RELEVANCE_CODES,
    ASSET_TYPE_CODES,
)

AssetView = Literal["all", "department", "business_owner", "type", "criticality", "process", "vendor"]
AssetGroup = Literal["department", "business_owner", "type", "criticality", "process", "vendor"]

_VALID_VIEWS = frozenset(("all", "department", "business_owner", "type", "criticality", "process", "vendor"))
_VALID_GROUPS = _VALID_VIEWS - {"all"}
_SORT_FIELDS = frozenset(
    (
        "name",
        "asset_type",
        "asset_level",
        "business_owner",
        "ict_owner",
        "department",
        "criticality",
        "cif",
        "lifecycle_state",
        "created_at",
    )
)
# Sort-key lookup domain includes ``None`` (rows without a derived block).
_CRITICALITY_ORDER: dict[str | None, int] = {
    value: index for index, value in enumerate(ASSET_PRELIMINARY_CRITICALITY_CODES)
}


@dataclass(frozen=True)
class AssetListCriteria:
    offset: int = 0
    limit: int = 50
    search: str | None = None
    include_archived: bool = False
    lifecycle: tuple[str, ...] = ()
    sort_by: str | None = None
    sort_order: str = "asc"
    view: str = "all"
    group_by: str | None = None
    group_value: str | None = None
    department_ids: tuple[int, ...] = ()
    business_owner_ids: tuple[int, ...] = ()
    ict_owner_ids: tuple[int, ...] = ()
    asset_types: tuple[str, ...] = ()
    asset_levels: tuple[str, ...] = ()
    deployment_models: tuple[str, ...] = ()
    criticality: tuple[str, ...] = ()
    cif: bool | None = None
    lifecycle_states: tuple[str, ...] = ()
    legacy: bool | None = None
    spof: bool | None = None
    external_dependency: bool | None = None
    gdpr_relevance: tuple[str, ...] = ()
    ai_relevance: tuple[str, ...] = ()
    internet_exposed: bool | None = None
    data_classification: tuple[str, ...] = ()
    is_complete: bool | None = None
    linked_process_ids: tuple[int, ...] = ()
    linked_asset_ids: tuple[int, ...] = ()
    linked_vendor_ids: tuple[int, ...] = ()
    linked_risk_ids: tuple[int, ...] = ()
    has_process_link: bool | None = None


@dataclass(frozen=True)
class AssetLinkContext:
    processes: dict[int, set[int]]
    assets: dict[int, set[int]]
    vendors: dict[int, set[int]]
    risks: dict[int, set[int]]
    process_labels: dict[int, str]
    asset_labels: dict[int, str]
    vendor_labels: dict[int, str]
    risk_labels: dict[int, str]


@dataclass(frozen=True)
class AssetListingResult:
    all_items: list[AssetRead]
    matching_items: list[AssetRead]
    page_items: list[AssetRead]
    groups: list[CollectionGroupRead]
    facets: dict[str, list[AssetFacetOption]]
    links: AssetLinkContext


def _tuple_values(name: str, value: Any, *, integers: bool = False) -> tuple[Any, ...]:
    if value is None or value == "":
        return ()
    raw_values = value if isinstance(value, (list, tuple, set)) else [value]
    result: list[Any] = []
    for raw in raw_values:
        coerced: int | str | None
        if integers:
            try:
                coerced = int(raw)
            except (TypeError, ValueError) as exc:
                raise ValidationError(f"Invalid {name} value") from exc
            if coerced < 1:
                raise ValidationError(f"Invalid {name} value")
        else:
            coerced = coerce_optional_string(name, raw)
        if coerced is not None and coerced not in result:
            result.append(coerced)
    return tuple(result)


def asset_criteria_from_filters(
    *,
    offset: int,
    limit: int,
    filters: dict[str, Any],
    sort_by: str | None,
    sort_order: str,
    view: str,
    group_by: str | None,
    group_value: str | None,
) -> AssetListCriteria:
    return validate_asset_criteria(
        AssetListCriteria(
            offset=offset,
            limit=limit,
            search=coerce_optional_string("search", filters.get("search")),
            include_archived=coerce_optional_bool("include_archived", filters.get("include_archived")) or False,
            lifecycle=_tuple_values("lifecycle", filters.get("lifecycle")),
            sort_by=sort_by,
            sort_order=sort_order,
            view=view,
            group_by=group_by,
            group_value=group_value,
            department_ids=_tuple_values("department_ids", filters.get("department_ids"), integers=True),
            business_owner_ids=_tuple_values("business_owner_ids", filters.get("business_owner_ids"), integers=True),
            ict_owner_ids=_tuple_values("ict_owner_ids", filters.get("ict_owner_ids"), integers=True),
            asset_types=_tuple_values("asset_types", filters.get("asset_types")),
            asset_levels=_tuple_values("asset_levels", filters.get("asset_levels")),
            deployment_models=_tuple_values("deployment_models", filters.get("deployment_models")),
            criticality=_tuple_values("criticality", filters.get("criticality")),
            cif=coerce_optional_bool("cif", filters.get("cif")),
            lifecycle_states=_tuple_values("lifecycle_states", filters.get("lifecycle_states")),
            legacy=coerce_optional_bool("legacy", filters.get("legacy")),
            spof=coerce_optional_bool("spof", filters.get("spof")),
            external_dependency=coerce_optional_bool("external_dependency", filters.get("external_dependency")),
            gdpr_relevance=_tuple_values("gdpr_relevance", filters.get("gdpr_relevance")),
            ai_relevance=_tuple_values("ai_relevance", filters.get("ai_relevance")),
            internet_exposed=coerce_optional_bool("internet_exposed", filters.get("internet_exposed")),
            data_classification=_tuple_values("data_classification", filters.get("data_classification")),
            is_complete=coerce_optional_bool("is_complete", filters.get("is_complete")),
            linked_process_ids=_tuple_values("linked_process_ids", filters.get("linked_process_ids"), integers=True),
            linked_asset_ids=_tuple_values("linked_asset_ids", filters.get("linked_asset_ids"), integers=True),
            linked_vendor_ids=_tuple_values("linked_vendor_ids", filters.get("linked_vendor_ids"), integers=True),
            linked_risk_ids=_tuple_values("linked_risk_ids", filters.get("linked_risk_ids"), integers=True),
            has_process_link=coerce_optional_bool("has_process_link", filters.get("has_process_link")),
        )
    )


def validate_asset_criteria(criteria: AssetListCriteria) -> AssetListCriteria:
    view = criteria.view or "all"
    if view not in _VALID_VIEWS:
        raise ValidationError("Invalid Asset view")
    group_by = criteria.group_by or (view if view != "all" else None)
    if group_by is not None and group_by not in _VALID_GROUPS:
        raise ValidationError("Invalid Asset group_by value")
    if criteria.sort_by is not None and criteria.sort_by not in _SORT_FIELDS:
        raise ValidationError("Invalid Asset sort_by value")
    if criteria.sort_order not in {"asc", "desc"}:
        raise ValidationError("Invalid Asset sort_order value")
    _validate_codes("lifecycle", criteria.lifecycle, ("active", "archived"))
    _validate_codes("asset_types", criteria.asset_types, ASSET_TYPE_CODES)
    _validate_codes("asset_levels", criteria.asset_levels, ASSET_LEVEL_CODES)
    _validate_codes("deployment_models", criteria.deployment_models, ASSET_DEPLOYMENT_MODEL_CODES)
    _validate_codes("criticality", criteria.criticality, ASSET_PRELIMINARY_CRITICALITY_CODES)
    _validate_codes("lifecycle_states", criteria.lifecycle_states, ASSET_LIFECYCLE_STATE_CODES)
    _validate_codes("gdpr_relevance", criteria.gdpr_relevance, ASSET_RELEVANCE_CODES)
    _validate_codes("ai_relevance", criteria.ai_relevance, ASSET_RELEVANCE_CODES)
    _validate_codes("data_classification", criteria.data_classification, ASSET_DATA_CLASSIFICATION_CODES)
    return replace(criteria, view=view, group_by=group_by)


def _validate_codes(name: str, values: tuple[str, ...], allowed: tuple[str, ...]) -> None:
    invalid = sorted(set(values) - set(allowed))
    if invalid:
        raise ValidationError(f"Invalid Asset {name} value")


async def _load_visible_link_context(
    db: AsyncSession,
    *,
    current_user: User,
    asset_ids: set[int],
) -> AssetLinkContext:
    processes: dict[int, set[int]] = defaultdict(set)
    assets: dict[int, set[int]] = defaultdict(set)
    vendors: dict[int, set[int]] = defaultdict(set)
    risks: dict[int, set[int]] = defaultdict(set)
    if not asset_ids:
        return AssetLinkContext(processes, assets, vendors, risks, {}, {}, {}, {})

    process_query = (
        select(ProcessAssetLink.asset_id, Process.id, Process.f_code)
        .join(Process, Process.id == ProcessAssetLink.process_id)
        .where(ProcessAssetLink.asset_id.in_(asset_ids))
    )
    process_clause = process_visibility_clause(current_user)
    if process_clause is not None:
        process_query = process_query.where(process_clause)
    process_rows = (await db.execute(process_query)).all()
    process_labels = {process_id: label for _, process_id, label in process_rows}
    for asset_id, process_id, _ in process_rows:
        processes[asset_id].add(process_id)

    asset_link_rows = (
        await db.execute(
            select(AssetAssetLink.dependent_asset_id, AssetAssetLink.supporting_asset_id).where(
                or_(
                    AssetAssetLink.dependent_asset_id.in_(asset_ids),
                    AssetAssetLink.supporting_asset_id.in_(asset_ids),
                )
            )
        )
    ).all()
    candidate_asset_ids = {
        counterpart_id
        for dependent_id, supporting_id in asset_link_rows
        for counterpart_id in (dependent_id, supporting_id)
    }
    asset_query = select(Asset.id, Asset.name).where(Asset.id.in_(candidate_asset_ids))
    asset_clause = asset_visibility_clause(current_user)
    if asset_clause is not None:
        asset_query = asset_query.where(asset_clause)
    asset_labels: dict[int, str] = (
        dict((await db.execute(asset_query)).tuples().all()) if candidate_asset_ids else {}
    )
    readable_asset_ids = set(asset_labels)
    for dependent_id, supporting_id in asset_link_rows:
        if dependent_id in asset_ids and supporting_id in readable_asset_ids:
            assets[dependent_id].add(supporting_id)
        if supporting_id in asset_ids and dependent_id in readable_asset_ids:
            assets[supporting_id].add(dependent_id)

    vendor_rows = (
        await db.execute(
            select(AssetVendorLink.asset_id, AssetVendorLink.vendor_id).where(AssetVendorLink.asset_id.in_(asset_ids))
        )
    ).all()
    candidate_vendor_ids = {vendor_id for _, vendor_id in vendor_rows}
    readable_vendor_ids = await visible_vendor_ids(db, current_user, candidate_vendor_ids)
    vendor_labels = dict(
        (await db.execute(select(Vendor.id, Vendor.name).where(Vendor.id.in_(readable_vendor_ids)))).tuples().all()
    )
    for asset_id, vendor_id in vendor_rows:
        if vendor_id in readable_vendor_ids:
            vendors[asset_id].add(vendor_id)

    risk_rows = (
        await db.execute(
            select(RiskAssetLink.asset_id, RiskAssetLink.risk_id).where(RiskAssetLink.asset_id.in_(asset_ids))
        )
    ).all()
    candidate_risk_ids = {risk_id for _, risk_id in risk_rows}
    readable_risk_ids = await visible_risk_ids(db, current_user, candidate_risk_ids)
    risk_labels = dict(
        (await db.execute(select(Risk.id, Risk.risk_id_code).where(Risk.id.in_(readable_risk_ids)))).tuples().all()
    )
    for asset_id, risk_id in risk_rows:
        if risk_id in readable_risk_ids:
            risks[asset_id].add(risk_id)

    return AssetLinkContext(
        dict(processes),
        dict(assets),
        dict(vendors),
        dict(risks),
        process_labels,
        asset_labels,
        vendor_labels,
        risk_labels,
    )


async def build_asset_listing(
    db: AsyncSession,
    *,
    current_user: User,
    criteria: AssetListCriteria,
) -> AssetListingResult:
    criteria = validate_asset_criteria(criteria)
    query = select(Asset).options(
        selectinload(Asset.business_owner).selectinload(User.role),
        selectinload(Asset.business_owner).selectinload(User.department),
        selectinload(Asset.ict_owner).selectinload(User.role),
        selectinload(Asset.ict_owner).selectinload(User.department),
        selectinload(Asset.owning_department),
    )
    visibility = asset_visibility_clause(current_user)
    if visibility is not None:
        query = query.where(visibility)
    asset_rows = list((await db.execute(query.order_by(Asset.id))).scalars().unique().all())
    asset_ids = {asset.id for asset in asset_rows}
    links = await _load_visible_link_context(db, current_user=current_user, asset_ids=asset_ids)
    blocks = await load_asset_derived_blocks(db, asset_rows, current_user=current_user)
    pending_roles = await pending_asset_responsibility_roles(db, asset_ids=list(asset_ids))
    all_items = [
        serialize_asset_detail(
            asset,
            current_user=current_user,
            primary_process_id=(
                blocks[asset.id].inputs.primary_process_id if blocks.get(asset.id) is not None else None
            ),
            derived=blocks.get(asset.id),
            orphaned_roles=pending_roles.get(asset.id),
        )
        for asset in asset_rows
    ]
    matching_items = _sort_items(
        [item for item in all_items if _matches(item, criteria, links)],
        criteria,
    )
    facets = _build_facets(all_items, criteria, links)
    groups = _build_groups(matching_items, criteria.group_by, links)
    if criteria.group_by and criteria.group_value:
        matching_items = [
            item for item in matching_items if criteria.group_value in _group_values(item, criteria.group_by, links)
        ]
    page_items = matching_items[criteria.offset : criteria.offset + criteria.limit]
    return AssetListingResult(all_items, matching_items, page_items, groups, facets, links)


def _matches(item: AssetRead, criteria: AssetListCriteria, links: AssetLinkContext) -> bool:
    if criteria.lifecycle:
        lifecycle = "archived" if item.is_archived else "active"
        if lifecycle not in criteria.lifecycle:
            return False
    elif not criteria.include_archived and item.is_archived:
        return False
    if criteria.search:
        haystack = " ".join(
            (
                item.name,
                item.alternative_names or "",
                item.asset_type or "",
                item.business_owner.name if item.business_owner else "",
                item.ict_owner.name if item.ict_owner else "",
                item.owning_department.name if item.owning_department else "",
                item.physical_location or "",
            )
        ).casefold()
        if criteria.search.casefold() not in haystack:
            return False
    if criteria.department_ids and item.owning_department_id not in criteria.department_ids:
        return False
    if criteria.business_owner_ids and item.business_owner_user_id not in criteria.business_owner_ids:
        return False
    if criteria.ict_owner_ids and item.ict_owner_user_id not in criteria.ict_owner_ids:
        return False
    if criteria.asset_types and item.asset_type not in criteria.asset_types:
        return False
    if criteria.asset_levels and item.asset_level not in criteria.asset_levels:
        return False
    if criteria.deployment_models and item.deployment_model not in criteria.deployment_models:
        return False
    derived = item.derived
    if criteria.criticality and (derived is None or derived.resulting_criticality not in criteria.criticality):
        return False
    if criteria.cif is not None and (derived is None or (derived.cif == "yes") is not criteria.cif):
        return False
    if criteria.lifecycle_states and item.lifecycle_state not in criteria.lifecycle_states:
        return False
    for expected, value in (
        (criteria.legacy, derived.legacy if derived else None),
        (criteria.spof, derived.spof if derived else None),
        (criteria.external_dependency, derived.external_dependency if derived else None),
    ):
        if expected is not None and (value == "yes") is not expected:
            return False
    if criteria.gdpr_relevance and item.gdpr_relevance not in criteria.gdpr_relevance:
        return False
    if criteria.ai_relevance and item.ai_relevance not in criteria.ai_relevance:
        return False
    if criteria.internet_exposed is not None and (item.internet_exposed == "yes") is not criteria.internet_exposed:
        return False
    if criteria.data_classification and item.data_classification not in criteria.data_classification:
        return False
    if criteria.is_complete is not None and (derived is None or derived.is_complete is not criteria.is_complete):
        return False
    if criteria.has_process_link is not None and (bool(links.processes.get(item.id)) is not criteria.has_process_link):
        return False
    for selected, memberships in (
        (criteria.linked_process_ids, links.processes),
        (criteria.linked_asset_ids, links.assets),
        (criteria.linked_vendor_ids, links.vendors),
        (criteria.linked_risk_ids, links.risks),
    ):
        if selected and not (memberships.get(item.id, set()) & set(selected)):
            return False
    return True


def _sort_items(items: list[AssetRead], criteria: AssetListCriteria) -> list[AssetRead]:
    field = criteria.sort_by or "name"

    def value(item: AssetRead):
        if field == "business_owner":
            return (item.business_owner.name if item.business_owner else "").casefold()
        if field == "ict_owner":
            return (item.ict_owner.name if item.ict_owner else "").casefold()
        if field == "department":
            return (item.owning_department.name if item.owning_department else "").casefold()
        if field == "criticality":
            return _CRITICALITY_ORDER.get(item.derived.resulting_criticality if item.derived else None, -1)
        if field == "cif":
            return item.derived.cif == "yes" if item.derived else False
        raw = getattr(item, field)
        if isinstance(raw, str):
            return raw.casefold()
        return raw if raw is not None else ""

    return sorted(items, key=lambda item: (value(item), item.id), reverse=criteria.sort_order == "desc")


def _group_values(item: AssetRead, group_by: str, links: AssetLinkContext) -> list[str]:
    if group_by == "department":
        return [f"department:{item.owning_department_id}"] if item.owning_department_id else ["__unassigned__"]
    if group_by == "business_owner":
        return [f"business_owner:{item.business_owner_user_id}"] if item.business_owner_user_id else ["__unassigned__"]
    if group_by == "type":
        return [f"type:{item.asset_type}"] if item.asset_type else ["__unclassified__"]
    if group_by == "criticality":
        code = item.derived.resulting_criticality if item.derived else None
        return [f"criticality:{code}"] if code else ["__unclassified__"]
    if group_by == "process":
        ids = sorted(links.processes.get(item.id, set()))
        return [f"process:{entity_id}" for entity_id in ids] or ["__unlinked_process__"]
    ids = sorted(links.vendors.get(item.id, set()))
    return [f"vendor:{entity_id}" for entity_id in ids] or ["__unlinked_vendor__"]


def _group_label(item: AssetRead, value: str, links: AssetLinkContext) -> str:
    if value.startswith("department:"):
        return item.owning_department.name if item.owning_department else "Unassigned"
    if value.startswith("business_owner:"):
        return item.business_owner.name if item.business_owner else "Unassigned"
    if value.startswith("type:"):
        return value.removeprefix("type:")
    if value.startswith("criticality:"):
        return value.removeprefix("criticality:")
    if value.startswith("process:"):
        return links.process_labels.get(int(value.removeprefix("process:")), "Unknown process")
    if value.startswith("vendor:"):
        return links.vendor_labels.get(int(value.removeprefix("vendor:")), "Unknown vendor")
    return {
        "__unassigned__": "Unassigned",
        "__unclassified__": "Unclassified",
        "__unlinked_process__": "No linked process",
        "__unlinked_vendor__": "No linked vendor",
    }.get(value, value)


def _build_groups(items: list[AssetRead], group_by: str | None, links: AssetLinkContext) -> list[CollectionGroupRead]:
    if group_by is None:
        return []
    counts: Counter[str] = Counter()
    active: Counter[str] = Counter()
    highlighted: Counter[str] = Counter()
    labels: dict[str, str] = {}
    for item in items:
        for group_value in set(_group_values(item, group_by, links)):
            counts[group_value] += 1
            active[group_value] += int(not item.is_archived)
            highlighted[group_value] += int(
                bool(item.derived and (item.derived.cif == "yes" or item.derived.resulting_criticality == "critical"))
            )
            labels[group_value] = _group_label(item, group_value, links)
    return [
        CollectionGroupRead(
            value=group_value,
            label=labels[group_value],
            count=counts[group_value],
            active_count=active[group_value],
            highlighted_count=highlighted[group_value],
        )
        for group_value in sorted(counts, key=lambda current: labels[current].casefold())
    ]


def _selected_bool(value: bool | None) -> set[str]:
    return {"yes"} if value is True else {"no"} if value is False else set()


def _build_facets(
    all_items: list[AssetRead],
    criteria: AssetListCriteria,
    links: AssetLinkContext,
) -> dict[str, list[AssetFacetOption]]:
    def options(catalog: dict[str, str], counts: Counter[str], selected: set[str]) -> list[AssetFacetOption]:
        return [
            AssetFacetOption(
                value=value,
                label=label,
                count=counts[value],
                disabled=counts[value] == 0,
                selected=value in selected,
            )
            for value, label in sorted(catalog.items(), key=lambda pair: pair[1].casefold())
        ]

    criteria_without_dimension = {
        "lifecycle": replace(criteria, lifecycle=(), include_archived=True),
        "department": replace(criteria, department_ids=()),
        "business_owner": replace(criteria, business_owner_ids=()),
        "ict_owner": replace(criteria, ict_owner_ids=()),
        "asset_type": replace(criteria, asset_types=()),
        "asset_level": replace(criteria, asset_levels=()),
        "deployment_model": replace(criteria, deployment_models=()),
        "criticality": replace(criteria, criticality=()),
        "cif": replace(criteria, cif=None),
        "lifecycle_state": replace(criteria, lifecycle_states=()),
        "legacy": replace(criteria, legacy=None),
        "spof": replace(criteria, spof=None),
        "external_dependency": replace(criteria, external_dependency=None),
        "gdpr_relevance": replace(criteria, gdpr_relevance=()),
        "ai_relevance": replace(criteria, ai_relevance=()),
        "internet_exposed": replace(criteria, internet_exposed=None),
        "data_classification": replace(criteria, data_classification=()),
        "is_complete": replace(criteria, is_complete=None),
    }
    facet_items = {
        dimension: [item for item in all_items if _matches(item, dimension_criteria, links)]
        for dimension, dimension_criteria in criteria_without_dimension.items()
    }
    counts: dict[str, Counter[str]] = {
        "lifecycle": Counter("archived" if item.is_archived else "active" for item in facet_items["lifecycle"]),
        "department": Counter(
            str(item.owning_department_id) for item in facet_items["department"] if item.owning_department_id
        ),
        "business_owner": Counter(
            str(item.business_owner_user_id) for item in facet_items["business_owner"] if item.business_owner_user_id
        ),
        "ict_owner": Counter(
            str(item.ict_owner_user_id) for item in facet_items["ict_owner"] if item.ict_owner_user_id
        ),
        "asset_type": Counter(item.asset_type for item in facet_items["asset_type"] if item.asset_type),
        "asset_level": Counter(item.asset_level for item in facet_items["asset_level"] if item.asset_level),
        "deployment_model": Counter(
            item.deployment_model for item in facet_items["deployment_model"] if item.deployment_model
        ),
        "criticality": Counter(
            item.derived.resulting_criticality
            for item in facet_items["criticality"]
            if item.derived and item.derived.resulting_criticality
        ),
        "cif": Counter(item.derived.cif for item in facet_items["cif"] if item.derived),
        "lifecycle_state": Counter(
            item.lifecycle_state for item in facet_items["lifecycle_state"] if item.lifecycle_state
        ),
        "legacy": Counter(item.derived.legacy for item in facet_items["legacy"] if item.derived),
        "spof": Counter(item.derived.spof for item in facet_items["spof"] if item.derived),
        "external_dependency": Counter(
            item.derived.external_dependency for item in facet_items["external_dependency"] if item.derived
        ),
        "gdpr_relevance": Counter(item.gdpr_relevance for item in facet_items["gdpr_relevance"] if item.gdpr_relevance),
        "ai_relevance": Counter(item.ai_relevance for item in facet_items["ai_relevance"] if item.ai_relevance),
        "internet_exposed": Counter(
            item.internet_exposed for item in facet_items["internet_exposed"] if item.internet_exposed
        ),
        "data_classification": Counter(
            item.data_classification for item in facet_items["data_classification"] if item.data_classification
        ),
        "is_complete": Counter(
            "true" if item.derived and item.derived.is_complete else "false" for item in facet_items["is_complete"]
        ),
    }
    department_catalog = {
        str(item.owning_department_id): item.owning_department.name
        for item in all_items
        if item.owning_department_id and item.owning_department
    }
    business_owner_catalog = {
        str(item.business_owner_user_id): item.business_owner.name
        for item in all_items
        if item.business_owner_user_id and item.business_owner
    }
    ict_owner_catalog = {
        str(item.ict_owner_user_id): item.ict_owner.name
        for item in all_items
        if item.ict_owner_user_id and item.ict_owner
    }
    yes_no = {"yes": "yes", "no": "no"}
    return {
        "lifecycle": options(
            {"active": "active", "archived": "archived"}, counts["lifecycle"], set(criteria.lifecycle)
        ),
        "department": options(
            department_catalog, counts["department"], {str(value) for value in criteria.department_ids}
        ),
        "business_owner": options(
            business_owner_catalog,
            counts["business_owner"],
            {str(value) for value in criteria.business_owner_ids},
        ),
        "ict_owner": options(ict_owner_catalog, counts["ict_owner"], {str(value) for value in criteria.ict_owner_ids}),
        "asset_type": options(
            {value: value for value in ASSET_TYPE_CODES}, counts["asset_type"], set(criteria.asset_types)
        ),
        "asset_level": options(
            {value: value for value in ASSET_LEVEL_CODES}, counts["asset_level"], set(criteria.asset_levels)
        ),
        "deployment_model": options(
            {value: value for value in ASSET_DEPLOYMENT_MODEL_CODES},
            counts["deployment_model"],
            set(criteria.deployment_models),
        ),
        "criticality": options(
            {value: value for value in ASSET_PRELIMINARY_CRITICALITY_CODES},
            counts["criticality"],
            set(criteria.criticality),
        ),
        "cif": options(yes_no, counts["cif"], _selected_bool(criteria.cif)),
        "lifecycle_state": options(
            {value: value for value in ASSET_LIFECYCLE_STATE_CODES},
            counts["lifecycle_state"],
            set(criteria.lifecycle_states),
        ),
        "legacy": options(yes_no, counts["legacy"], _selected_bool(criteria.legacy)),
        "spof": options(yes_no, counts["spof"], _selected_bool(criteria.spof)),
        "external_dependency": options(
            yes_no, counts["external_dependency"], _selected_bool(criteria.external_dependency)
        ),
        "gdpr_relevance": options(
            {value: value for value in ASSET_RELEVANCE_CODES},
            counts["gdpr_relevance"],
            set(criteria.gdpr_relevance),
        ),
        "ai_relevance": options(
            {value: value for value in ASSET_RELEVANCE_CODES},
            counts["ai_relevance"],
            set(criteria.ai_relevance),
        ),
        "internet_exposed": options(
            {value: value for value in ASSET_INTERNET_EXPOSED_CODES},
            counts["internet_exposed"],
            _selected_bool(criteria.internet_exposed),
        ),
        "data_classification": options(
            {value: value for value in ASSET_DATA_CLASSIFICATION_CODES},
            counts["data_classification"],
            set(criteria.data_classification),
        ),
        "is_complete": options(
            {"true": "true", "false": "false"},
            counts["is_complete"],
            {"true"} if criteria.is_complete is True else {"false"} if criteria.is_complete is False else set(),
        ),
    }


async def asset_filter_lookups(
    db: AsyncSession,
    *,
    current_user: User,
    kind: str,
    search: str | None,
    selected_ids: tuple[int, ...],
    limit: int,
) -> list[AssetLookupOption]:
    query = select(Asset).options(
        selectinload(Asset.business_owner).selectinload(User.department),
        selectinload(Asset.ict_owner).selectinload(User.department),
        selectinload(Asset.owning_department),
    )
    visibility = asset_visibility_clause(current_user)
    if visibility is not None:
        query = query.where(visibility)
    asset_rows = list((await db.execute(query)).scalars().unique().all())
    asset_ids = {asset.id for asset in asset_rows}
    links = await _load_visible_link_context(db, current_user=current_user, asset_ids=asset_ids)
    rows: list[tuple[int, str, str | None, int]] = []
    if kind in {"business-owners", "ict-owners"}:
        id_attribute = "business_owner_user_id" if kind == "business-owners" else "ict_owner_user_id"
        owner_attribute = "business_owner" if kind == "business-owners" else "ict_owner"
        counts = Counter(getattr(asset, id_attribute) for asset in asset_rows if getattr(asset, id_attribute))
        rows = [
            (
                getattr(asset, id_attribute),
                getattr(asset, owner_attribute).name,
                getattr(asset, owner_attribute).email,
                counts[getattr(asset, id_attribute)],
            )
            for asset in asset_rows
            if getattr(asset, id_attribute) and getattr(asset, owner_attribute)
        ]
    elif kind == "departments":
        counts = Counter(asset.owning_department_id for asset in asset_rows if asset.owning_department_id)
        rows = [
            (
                asset.owning_department_id,
                asset.owning_department.name,
                asset.owning_department.code,
                counts[asset.owning_department_id],
            )
            for asset in asset_rows
            if asset.owning_department_id and asset.owning_department
        ]
    else:
        context_values = {
            "processes": (links.processes, links.process_labels),
            "assets": (links.assets, links.asset_labels),
            "vendors": (links.vendors, links.vendor_labels),
            "risks": (links.risks, links.risk_labels),
        }
        if kind not in context_values:
            raise ValidationError("Invalid Asset lookup kind")
        memberships, labels = context_values[kind]
        counts = Counter(entity_id for asset_id in asset_ids for entity_id in memberships.get(asset_id, set()))
        rows = [(entity_id, label, None, counts[entity_id]) for entity_id, label in labels.items()]

    deduplicated = {row[0]: row for row in rows}
    needle = (search or "").casefold()
    visible_selected = set(selected_ids) & set(deduplicated)
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
        AssetLookupOption(id=row[0], label=row[1], secondary_label=row[2], count=row[3])
        for row in (*selected_rows, *ordinary_rows[:remaining])
    ]


def asset_collection_capabilities(current_user: User):
    return build_asset_collection_capabilities(current_user).model_copy(
        update={"can_export": check_permission(current_user, "reports", "read")}
    )
