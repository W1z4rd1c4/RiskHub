"""Permission-safe shared register listing implementation for Processes (#77).

Processes are the tracer for the normalized register contract.  Derived fields
and transitive Vendor membership cannot be expressed safely as a single ORM
query, so the service deliberately builds one permission-scoped candidate set,
derives once, and applies the complete filter/group/export algebra to that
bounded set.  The production register contains hundreds, not millions, of
rows; correctness and one shared plan therefore take priority over premature
SQL fragmentation.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass, replace
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ValidationError
from app.core.permissions import visible_risk_ids
from app.core.security import check_permission
from app.models import (
    Asset,
    AssetVendorLink,
    Process,
    ProcessAssetLink,
    ProcessVendorLink,
    Risk,
    RiskProcessLink,
    User,
    Vendor,
)
from app.schemas.collection import CollectionGroupRead
from app.schemas.process import ProcessFacetOption, ProcessLookupOption, ProcessRead
from app.services._collection_filters import (
    coerce_optional_bool,
    coerce_optional_int,
    coerce_optional_string,
)
from app.services._ict_register_lifecycle.asset_policy import asset_visibility_clause
from app.services._ict_register_lifecycle.policy import process_visibility_clause
from app.services._ict_register_lifecycle.projection import (
    build_process_collection_capabilities,
    load_pending_process_changes,
    load_process_derived_blocks,
    pending_process_ownership_orphan_ids,
    protected_process_changes_require_approval,
    serialize_process_detail,
)
from app.services._ict_register_reference.process_values import (
    PROCESS_BCM_LINK_CODES,
    PROCESS_DR_TEST_RESULT_CODES,
    PROCESS_LICENSED_ACTIVITY_CODES,
    PROCESS_PRELIMINARY_CRITICALITY_CODES,
)
from app.services._vendor_workflow import apply_vendor_visibility_scope

ProcessView = Literal["all", "department", "owner", "l0", "criticality", "vendor"]
ProcessGroup = Literal["department", "owner", "l0", "criticality", "vendor"]

_VALID_VIEWS = frozenset(("all", "department", "owner", "l0", "criticality", "vendor"))
_VALID_GROUPS = _VALID_VIEWS - {"all"}
_SORT_FIELDS = frozenset(
    ("f_code", "l0_area", "l1_process", "owner", "department", "criticality", "cif", "mtpd_hours", "created_at")
)
_CRITICALITY_ORDER = {value: index for index, value in enumerate(PROCESS_PRELIMINARY_CRITICALITY_CODES)}


@dataclass(frozen=True)
class ProcessListCriteria:
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
    owner_ids: tuple[int, ...] = ()
    l0_areas: tuple[str, ...] = ()
    criticality: tuple[str, ...] = ()
    cif: bool | None = None
    is_complete: bool | None = None
    licensed_activity: tuple[str, ...] = ()
    bcm_link: tuple[str, ...] = ()
    dr_test_result: tuple[str, ...] = ()
    mtpd_min: int | None = None
    mtpd_max: int | None = None
    linked_asset_ids: tuple[int, ...] = ()
    linked_vendor_ids: tuple[int, ...] = ()
    linked_risk_ids: tuple[int, ...] = ()


@dataclass(frozen=True)
class ProcessLinkContext:
    assets: dict[int, set[int]]
    vendors: dict[int, set[int]]
    risks: dict[int, set[int]]
    asset_labels: dict[int, str]
    vendor_labels: dict[int, str]
    risk_labels: dict[int, str]


@dataclass(frozen=True)
class ProcessListingResult:
    all_items: list[ProcessRead]
    matching_items: list[ProcessRead]
    page_items: list[ProcessRead]
    groups: list[CollectionGroupRead]
    facets: dict[str, list[ProcessFacetOption]]
    links: ProcessLinkContext


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


def process_criteria_from_filters(
    *,
    offset: int,
    limit: int,
    filters: dict[str, Any],
    sort_by: str | None,
    sort_order: str,
    view: str,
    group_by: str | None,
    group_value: str | None,
) -> ProcessListCriteria:
    """Validate explicit/JSON query inputs into one stable listing plan."""
    return validate_process_criteria(
        ProcessListCriteria(
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
            owner_ids=_tuple_values("owner_ids", filters.get("owner_ids"), integers=True),
            l0_areas=_tuple_values("l0_areas", filters.get("l0_areas")),
            criticality=_tuple_values("criticality", filters.get("criticality")),
            cif=coerce_optional_bool("cif", filters.get("cif")),
            is_complete=coerce_optional_bool("is_complete", filters.get("is_complete")),
            licensed_activity=_tuple_values("licensed_activity", filters.get("licensed_activity")),
            bcm_link=_tuple_values("bcm_link", filters.get("bcm_link")),
            dr_test_result=_tuple_values("dr_test_result", filters.get("dr_test_result")),
            mtpd_min=coerce_optional_int("mtpd_min", filters.get("mtpd_min"), min_value=0),
            mtpd_max=coerce_optional_int("mtpd_max", filters.get("mtpd_max"), min_value=0),
            linked_asset_ids=_tuple_values("linked_asset_ids", filters.get("linked_asset_ids"), integers=True),
            linked_vendor_ids=_tuple_values("linked_vendor_ids", filters.get("linked_vendor_ids"), integers=True),
            linked_risk_ids=_tuple_values("linked_risk_ids", filters.get("linked_risk_ids"), integers=True),
        )
    )


def validate_process_criteria(criteria: ProcessListCriteria) -> ProcessListCriteria:
    view = criteria.view or "all"
    if view not in _VALID_VIEWS:
        raise ValidationError("Invalid Process view")
    group_by = criteria.group_by or (view if view != "all" else None)
    if group_by is not None and group_by not in _VALID_GROUPS:
        raise ValidationError("Invalid Process group_by value")
    if criteria.sort_by is not None and criteria.sort_by not in _SORT_FIELDS:
        raise ValidationError("Invalid Process sort_by value")
    if criteria.sort_order not in {"asc", "desc"}:
        raise ValidationError("Invalid Process sort_order value")
    if criteria.mtpd_min is not None and criteria.mtpd_min < 0:
        raise ValidationError("mtpd_min must be at least zero")
    if criteria.mtpd_max is not None and criteria.mtpd_max < 0:
        raise ValidationError("mtpd_max must be at least zero")
    if criteria.mtpd_min is not None and criteria.mtpd_max is not None and criteria.mtpd_min > criteria.mtpd_max:
        raise ValidationError("mtpd_min must not exceed mtpd_max")
    _validate_codes("criticality", criteria.criticality, PROCESS_PRELIMINARY_CRITICALITY_CODES)
    _validate_codes("licensed_activity", criteria.licensed_activity, PROCESS_LICENSED_ACTIVITY_CODES)
    _validate_codes("bcm_link", criteria.bcm_link, PROCESS_BCM_LINK_CODES)
    _validate_codes("dr_test_result", criteria.dr_test_result, PROCESS_DR_TEST_RESULT_CODES)
    _validate_codes("lifecycle", criteria.lifecycle, ("active", "archived"))
    return replace(criteria, view=view, group_by=group_by)


def _validate_codes(name: str, values: tuple[str, ...], allowed: tuple[str, ...]) -> None:
    invalid = sorted(set(values) - set(allowed))
    if invalid:
        raise ValidationError(f"Invalid Process {name} value")


async def _load_visible_link_context(
    db: AsyncSession,
    *,
    current_user: User,
    process_ids: set[int],
) -> ProcessLinkContext:
    assets: dict[int, set[int]] = defaultdict(set)
    vendors: dict[int, set[int]] = defaultdict(set)
    risks: dict[int, set[int]] = defaultdict(set)
    asset_labels: dict[int, str] = {}
    vendor_labels: dict[int, str] = {}
    risk_labels: dict[int, str] = {}
    if not process_ids:
        return ProcessLinkContext(assets, vendors, risks, asset_labels, vendor_labels, risk_labels)

    asset_query = (
        select(ProcessAssetLink.process_id, Asset.id, Asset.name)
        .join(Asset, Asset.id == ProcessAssetLink.asset_id)
        .where(ProcessAssetLink.process_id.in_(process_ids))
    )
    asset_clause = asset_visibility_clause(current_user)
    if asset_clause is not None:
        asset_query = asset_query.where(asset_clause)
    asset_rows = (await db.execute(asset_query)).all()
    visible_asset_ids: set[int] = set()
    for process_id, asset_id, label in asset_rows:
        assets[process_id].add(asset_id)
        visible_asset_ids.add(asset_id)
        asset_labels[asset_id] = label

    direct_vendor_rows = (
        await db.execute(
            select(ProcessVendorLink.process_id, ProcessVendorLink.vendor_id).where(
                ProcessVendorLink.process_id.in_(process_ids)
            )
        )
    ).all()
    transitive_vendor_rows = []
    if visible_asset_ids:
        transitive_vendor_rows = (
            await db.execute(
                select(ProcessAssetLink.process_id, AssetVendorLink.vendor_id)
                .join(AssetVendorLink, AssetVendorLink.asset_id == ProcessAssetLink.asset_id)
                .where(
                    ProcessAssetLink.process_id.in_(process_ids),
                    ProcessAssetLink.asset_id.in_(visible_asset_ids),
                )
            )
        ).all()
    candidate_vendor_ids = {row[1] for row in (*direct_vendor_rows, *transitive_vendor_rows)}
    if candidate_vendor_ids:
        vendor_query = apply_vendor_visibility_scope(
            select(Vendor.id, Vendor.name).where(Vendor.id.in_(candidate_vendor_ids)),
            current_user,
        )
        vendor_labels = dict((await db.execute(vendor_query)).all())
        readable_vendor_ids = set(vendor_labels)
        for process_id, vendor_id in (*direct_vendor_rows, *transitive_vendor_rows):
            if vendor_id in readable_vendor_ids:
                vendors[process_id].add(vendor_id)

    risk_rows = (
        await db.execute(
            select(RiskProcessLink.process_id, RiskProcessLink.risk_id).where(
                RiskProcessLink.process_id.in_(process_ids)
            )
        )
    ).all()
    candidate_risk_ids = {row.risk_id for row in risk_rows}
    readable_risk_ids = await visible_risk_ids(db, current_user, candidate_risk_ids)
    if readable_risk_ids:
        risk_labels = dict(
            (await db.execute(select(Risk.id, Risk.risk_id_code).where(Risk.id.in_(readable_risk_ids)))).all()
        )
        for process_id, risk_id in risk_rows:
            if risk_id in readable_risk_ids:
                risks[process_id].add(risk_id)

    return ProcessLinkContext(dict(assets), dict(vendors), dict(risks), asset_labels, vendor_labels, risk_labels)


async def build_process_listing(
    db: AsyncSession,
    *,
    current_user: User,
    criteria: ProcessListCriteria,
) -> ProcessListingResult:
    criteria = validate_process_criteria(criteria)
    query = select(Process).options(
        selectinload(Process.process_owner).selectinload(User.role),
        selectinload(Process.process_owner).selectinload(User.department),
        selectinload(Process.owning_department),
    )
    visibility = process_visibility_clause(current_user)
    if visibility is not None:
        query = query.where(visibility)
    processes = list((await db.execute(query.order_by(Process.id))).scalars().unique().all())
    links = await _load_visible_link_context(
        db, current_user=current_user, process_ids={process.id for process in processes}
    )
    blocks = await load_process_derived_blocks(db, processes, current_user=current_user)
    pending_ids = await pending_process_ownership_orphan_ids(db, process_ids=[process.id for process in processes])
    pending_changes = await load_pending_process_changes(
        db,
        process_ids=[process.id for process in processes],
        current_user=current_user,
    )
    protected_change_requires_approval = await protected_process_changes_require_approval(db)
    all_items = [
        serialize_process_detail(
            process,
            current_user=current_user,
            derived=blocks.get(process.id),
            ownership_pending=process.id in pending_ids,
            pending_change=pending_changes.get(process.id),
            protected_change_requires_approval=protected_change_requires_approval,
        )
        for process in processes
    ]
    matching_items = [item for item in all_items if _matches(item, criteria, links)]
    matching_items = _sort_items(matching_items, criteria)
    facets = _build_facets(all_items, criteria, links)
    groups = _build_groups(matching_items, criteria.group_by, links)
    if criteria.group_by and criteria.group_value:
        matching_items = [
            item for item in matching_items if criteria.group_value in _group_values(item, criteria.group_by, links)
        ]
    page_items = matching_items[criteria.offset : criteria.offset + criteria.limit]
    return ProcessListingResult(all_items, matching_items, page_items, groups, facets, links)


def _matches(item: ProcessRead, criteria: ProcessListCriteria, links: ProcessLinkContext) -> bool:
    if criteria.lifecycle:
        lifecycle = "archived" if item.is_archived else "active"
        if lifecycle not in criteria.lifecycle:
            return False
    elif not criteria.include_archived and item.is_archived:
        return False
    if criteria.search:
        owner_name = item.process_owner.name if item.process_owner else ""
        department_name = item.owning_department.name if item.owning_department else ""
        haystack = " ".join(
            (item.f_code, item.l0_area, item.l1_process, item.l2_subprocess or "", owner_name, department_name)
        ).casefold()
        if criteria.search.casefold() not in haystack:
            return False
    if criteria.department_ids and item.owning_department_id not in criteria.department_ids:
        return False
    if criteria.owner_ids and item.process_owner_user_id not in criteria.owner_ids:
        return False
    if criteria.l0_areas and item.l0_area not in criteria.l0_areas:
        return False
    derived = item.derived
    if criteria.criticality and (derived is None or derived.criticality_class not in criteria.criticality):
        return False
    if criteria.cif is not None and (derived is None or (derived.cif == "yes") is not criteria.cif):
        return False
    if criteria.is_complete is not None and (derived is None or derived.is_complete is not criteria.is_complete):
        return False
    if criteria.licensed_activity and item.licensed_activity not in criteria.licensed_activity:
        return False
    if criteria.bcm_link and item.bcm_link not in criteria.bcm_link:
        return False
    if criteria.dr_test_result and item.dr_test_result not in criteria.dr_test_result:
        return False
    if criteria.mtpd_min is not None and (item.mtpd_hours is None or item.mtpd_hours < criteria.mtpd_min):
        return False
    if criteria.mtpd_max is not None and (item.mtpd_hours is None or item.mtpd_hours > criteria.mtpd_max):
        return False
    if criteria.linked_asset_ids and not (links.assets.get(item.id, set()) & set(criteria.linked_asset_ids)):
        return False
    if criteria.linked_vendor_ids and not (links.vendors.get(item.id, set()) & set(criteria.linked_vendor_ids)):
        return False
    if criteria.linked_risk_ids and not (links.risks.get(item.id, set()) & set(criteria.linked_risk_ids)):
        return False
    return True


def _sort_items(items: list[ProcessRead], criteria: ProcessListCriteria) -> list[ProcessRead]:
    field = criteria.sort_by or "f_code"

    def value(item: ProcessRead):
        if field == "f_code":
            match = re.fullmatch(r"F(\d+)", item.f_code, flags=re.IGNORECASE)
            if match is not None:
                return (0, int(match.group(1)), item.f_code.casefold())
            return (1, item.f_code.casefold(), item.f_code.casefold())
        if field == "owner":
            return (item.process_owner.name if item.process_owner else "").casefold()
        if field == "department":
            return (item.owning_department.name if item.owning_department else "").casefold()
        if field == "criticality":
            return _CRITICALITY_ORDER.get(item.derived.criticality_class if item.derived else None, -1)
        if field == "cif":
            return item.derived.cif == "yes" if item.derived else False
        raw = getattr(item, field)
        if isinstance(raw, str):
            return raw.casefold()
        return raw if raw is not None else -1

    return sorted(items, key=lambda item: (value(item), item.id), reverse=criteria.sort_order == "desc")


def _group_values(item: ProcessRead, group_by: str, links: ProcessLinkContext) -> list[str]:
    if group_by == "department":
        return [f"department:{item.owning_department_id}"] if item.owning_department_id else ["__unassigned__"]
    if group_by == "owner":
        return [f"owner:{item.process_owner_user_id}"] if item.process_owner_user_id else ["__unassigned__"]
    if group_by == "l0":
        return [f"l0:{item.l0_area}"]
    if group_by == "criticality":
        code = item.derived.criticality_class if item.derived else None
        return [f"criticality:{code}"] if code else ["__unclassified__"]
    vendor_ids = sorted(links.vendors.get(item.id, set()))
    return [f"vendor:{vendor_id}" for vendor_id in vendor_ids] or ["__unlinked_vendor__"]


def _group_label(item: ProcessRead, value: str, links: ProcessLinkContext) -> str:
    if value.startswith("department:"):
        return item.owning_department.name if item.owning_department else "Unassigned"
    if value.startswith("owner:"):
        return item.process_owner.name if item.process_owner else "Unassigned"
    if value.startswith("l0:"):
        return item.l0_area
    if value.startswith("criticality:"):
        return value.removeprefix("criticality:")
    if value.startswith("vendor:"):
        return links.vendor_labels.get(int(value.removeprefix("vendor:")), "Unknown vendor")
    return {
        "__unassigned__": "Unassigned",
        "__unclassified__": "Unclassified",
        "__unlinked_vendor__": "No linked vendor",
    }.get(value, value)


def _build_groups(
    items: list[ProcessRead], group_by: str | None, links: ProcessLinkContext
) -> list[CollectionGroupRead]:
    if group_by is None:
        return []
    counts: Counter[str] = Counter()
    active: Counter[str] = Counter()
    highlighted: Counter[str] = Counter()
    labels: dict[str, str] = {}
    for item in items:
        for value in set(_group_values(item, group_by, links)):
            counts[value] += 1
            active[value] += int(not item.is_archived)
            highlighted[value] += int(
                bool(item.derived and (item.derived.cif == "yes" or item.derived.criticality_class == "critical"))
            )
            labels[value] = _group_label(item, value, links)
    return [
        CollectionGroupRead(
            value=value,
            label=labels[value],
            count=counts[value],
            active_count=active[value],
            highlighted_count=highlighted[value],
        )
        for value in sorted(counts, key=lambda current: labels[current].casefold())
    ]


def _build_facets(
    all_items: list[ProcessRead],
    criteria: ProcessListCriteria,
    links: ProcessLinkContext,
) -> dict[str, list[ProcessFacetOption]]:
    def options(catalog: dict[str, str], counts: Counter[str], selected: set[str]) -> list[ProcessFacetOption]:
        return [
            ProcessFacetOption(
                value=value,
                label=label,
                count=counts[value],
                disabled=counts[value] == 0,
                selected=value in selected,
            )
            for value, label in sorted(catalog.items(), key=lambda pair: pair[1].casefold())
        ]

    department_catalog = {
        str(item.owning_department_id): item.owning_department.name
        for item in all_items
        if item.owning_department_id and item.owning_department
    }
    owner_catalog = {
        str(item.process_owner_user_id): item.process_owner.name
        for item in all_items
        if item.process_owner_user_id and item.process_owner
    }
    l0_catalog = {item.l0_area: item.l0_area for item in all_items}
    criteria_without_dimension = {
        "lifecycle": replace(criteria, lifecycle=(), include_archived=True),
        "department": replace(criteria, department_ids=()),
        "owner": replace(criteria, owner_ids=()),
        "l0": replace(criteria, l0_areas=()),
        "criticality": replace(criteria, criticality=()),
        "cif": replace(criteria, cif=None),
        "is_complete": replace(criteria, is_complete=None),
        "licensed_activity": replace(criteria, licensed_activity=()),
        "bcm_link": replace(criteria, bcm_link=()),
        "dr_test_result": replace(criteria, dr_test_result=()),
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
        "owner": Counter(
            str(item.process_owner_user_id) for item in facet_items["owner"] if item.process_owner_user_id
        ),
        "l0": Counter(item.l0_area for item in facet_items["l0"]),
        "criticality": Counter(
            item.derived.criticality_class
            for item in facet_items["criticality"]
            if item.derived and item.derived.criticality_class
        ),
        "cif": Counter(item.derived.cif for item in facet_items["cif"] if item.derived),
        "is_complete": Counter(
            "true" if item.derived and item.derived.is_complete else "false" for item in facet_items["is_complete"]
        ),
        "licensed_activity": Counter(
            item.licensed_activity for item in facet_items["licensed_activity"] if item.licensed_activity
        ),
        "bcm_link": Counter(item.bcm_link for item in facet_items["bcm_link"] if item.bcm_link),
        "dr_test_result": Counter(item.dr_test_result for item in facet_items["dr_test_result"] if item.dr_test_result),
    }
    return {
        "lifecycle": options(
            {"active": "active", "archived": "archived"},
            counts["lifecycle"],
            set(criteria.lifecycle),
        ),
        "department": options(
            department_catalog, counts["department"], {str(value) for value in criteria.department_ids}
        ),
        "owner": options(owner_catalog, counts["owner"], {str(value) for value in criteria.owner_ids}),
        "l0": options(l0_catalog, counts["l0"], set(criteria.l0_areas)),
        "criticality": options(
            {value: value for value in PROCESS_PRELIMINARY_CRITICALITY_CODES},
            counts["criticality"],
            set(criteria.criticality),
        ),
        "cif": options(
            {"yes": "yes", "no": "no"},
            counts["cif"],
            ({"yes"} if criteria.cif is True else {"no"} if criteria.cif is False else set()),
        ),
        "is_complete": options(
            {"true": "true", "false": "false"},
            counts["is_complete"],
            ({"true"} if criteria.is_complete is True else {"false"} if criteria.is_complete is False else set()),
        ),
        "licensed_activity": options(
            {value: value for value in PROCESS_LICENSED_ACTIVITY_CODES},
            counts["licensed_activity"],
            set(criteria.licensed_activity),
        ),
        "bcm_link": options(
            {value: value for value in PROCESS_BCM_LINK_CODES}, counts["bcm_link"], set(criteria.bcm_link)
        ),
        "dr_test_result": options(
            {value: value for value in PROCESS_DR_TEST_RESULT_CODES},
            counts["dr_test_result"],
            set(criteria.dr_test_result),
        ),
    }


async def process_filter_lookups(
    db: AsyncSession,
    *,
    current_user: User,
    kind: str,
    search: str | None,
    selected_ids: tuple[int, ...],
    limit: int,
) -> list[ProcessLookupOption]:
    """Return only labels reachable through the caller's visible Process set."""
    process_query = select(Process).options(
        selectinload(Process.process_owner),
        selectinload(Process.owning_department),
    )
    visibility = process_visibility_clause(current_user)
    if visibility is not None:
        process_query = process_query.where(visibility)
    processes = list((await db.execute(process_query)).scalars().unique().all())
    process_ids = {item.id for item in processes}
    links = await _load_visible_link_context(
        db,
        current_user=current_user,
        process_ids=process_ids,
    )
    rows: list[tuple[int, str, str | None, int]] = []
    if kind == "owners":
        counts = Counter(item.process_owner_user_id for item in processes if item.process_owner_user_id)
        rows = [
            (
                item.process_owner_user_id,
                item.process_owner.name,
                item.process_owner.email,
                counts[item.process_owner_user_id],
            )
            for item in processes
            if item.process_owner_user_id and item.process_owner
        ]
    elif kind == "departments":
        counts = Counter(item.owning_department_id for item in processes if item.owning_department_id)
        rows = [
            (
                item.owning_department_id,
                item.owning_department.name,
                item.owning_department.code,
                counts[item.owning_department_id],
            )
            for item in processes
            if item.owning_department_id and item.owning_department
        ]
    else:
        context_values = {
            "assets": (links.assets, links.asset_labels),
            "vendors": (links.vendors, links.vendor_labels),
            "risks": (links.risks, links.risk_labels),
        }
        if kind not in context_values:
            raise ValidationError("Invalid Process lookup kind")
        memberships, labels = context_values[kind]
        counts = Counter(entity_id for process_id in process_ids for entity_id in memberships.get(process_id, set()))
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
    # Selected values are resolution state, not ordinary search results. Keep
    # every visible selection even when it falls beyond the remote page while
    # preserving the requested cap for the remaining result page.
    remaining = max(limit - len(selected_rows), 0)
    filtered = [*selected_rows, *ordinary_rows[:remaining]]
    return [ProcessLookupOption(id=row[0], label=row[1], secondary_label=row[2], count=row[3]) for row in filtered]


def process_collection_capabilities(current_user: User):
    return build_process_collection_capabilities(current_user).model_copy(
        update={"can_export": check_permission(current_user, "reports", "read")}
    )
