"""Permission-safe shared register listing implementation for Threats (#79)."""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, replace
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AuthorizationError, ValidationError
from app.core.permissions import visible_risk_ids
from app.core.security import check_permission
from app.models import Department, Risk, Threat, ThreatRiskLink, User
from app.models.role import RoleType
from app.schemas.collection import CollectionGroupRead
from app.schemas.threat import ThreatFacetOption, ThreatListItem, ThreatLookupOption
from app.services._collection_filters import (
    coerce_optional_bool,
    coerce_optional_int,
    coerce_optional_string,
)
from app.services._ict_register_lifecycle.threat_lifecycle import (
    _pending_stewardship_orphan_ids,
)
from app.services._ict_register_lifecycle.threat_projection import (
    build_threat_collection_capabilities,
    serialize_threat_detail,
)
from app.services._ict_register_reference import THREAT_CATEGORY_CODES

ThreatView = Literal["all", "category", "threat_steward", "relevant_subject", "linked_risk"]
ThreatGroup = Literal["category", "threat_steward", "relevant_subject", "linked_risk"]

_VALID_VIEWS = frozenset(("all", "category", "threat_steward", "relevant_subject", "linked_risk"))
_VALID_GROUPS = _VALID_VIEWS - {"all"}
_SORT_FIELDS = frozenset(
    ("name", "category", "threat_steward", "relevant_subject", "linked_risk_count", "created_at")
)
_RISK_TYPES = ("strategic", "operational")


@dataclass(frozen=True)
class ThreatListCriteria:
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
    categories: tuple[str, ...] = ()
    steward_ids: tuple[int, ...] = ()
    relevant_subjects: tuple[str, ...] = ()
    has_linked_risk: bool | None = None
    linked_risk_ids: tuple[int, ...] = ()
    linked_risk_types: tuple[str, ...] = ()
    linked_risk_department_ids: tuple[int, ...] = ()


@dataclass(frozen=True)
class ThreatRiskContext:
    risks: dict[int, set[int]]
    risk_labels: dict[int, str]
    risk_types: dict[int, str]
    risk_departments: dict[int, int]
    risk_department_labels: dict[int, str]


@dataclass(frozen=True)
class ThreatListingResult:
    all_items: list[ThreatListItem]
    matching_items: list[ThreatListItem]
    page_items: list[ThreatListItem]
    groups: list[CollectionGroupRead]
    facets: dict[str, list[ThreatFacetOption]]
    links: ThreatRiskContext


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


def threat_criteria_from_filters(
    *,
    offset: int,
    limit: int,
    filters: dict[str, Any],
    sort_by: str | None,
    sort_order: str,
    view: str,
    group_by: str | None,
    group_value: str | None,
) -> ThreatListCriteria:
    return validate_threat_criteria(
        ThreatListCriteria(
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
            categories=_tuple_values("categories", filters.get("categories")),
            steward_ids=_tuple_values("steward_ids", filters.get("steward_ids"), integers=True),
            relevant_subjects=_tuple_values("relevant_subjects", filters.get("relevant_subjects")),
            has_linked_risk=coerce_optional_bool("has_linked_risk", filters.get("has_linked_risk")),
            linked_risk_ids=_tuple_values(
                "linked_risk_ids", filters.get("linked_risk_ids"), integers=True
            ),
            linked_risk_types=_tuple_values("linked_risk_types", filters.get("linked_risk_types")),
            linked_risk_department_ids=_tuple_values(
                "linked_risk_department_ids",
                filters.get("linked_risk_department_ids"),
                integers=True,
            ),
        )
    )


def validate_threat_criteria(criteria: ThreatListCriteria) -> ThreatListCriteria:
    view = criteria.view or "all"
    if view not in _VALID_VIEWS:
        raise ValidationError("Invalid Threat view")
    group_by = criteria.group_by or (view if view != "all" else None)
    if group_by is not None and group_by not in _VALID_GROUPS:
        raise ValidationError("Invalid Threat group_by value")
    if criteria.sort_by is not None and criteria.sort_by not in _SORT_FIELDS:
        raise ValidationError("Invalid Threat sort_by value")
    if criteria.sort_order not in {"asc", "desc"}:
        raise ValidationError("Invalid Threat sort_order value")
    _validate_codes("lifecycle", criteria.lifecycle, ("active", "archived"))
    _validate_codes("categories", criteria.categories, THREAT_CATEGORY_CODES)
    _validate_codes("linked_risk_types", criteria.linked_risk_types, _RISK_TYPES)
    return replace(criteria, view=view, group_by=group_by)


def _validate_codes(name: str, values: tuple[str, ...], allowed: tuple[str, ...]) -> None:
    if set(values) - set(allowed):
        raise ValidationError(f"Invalid Threat {name} value")


async def _load_visible_risk_context(
    db: AsyncSession,
    *,
    current_user: User,
    threat_ids: set[int],
) -> ThreatRiskContext:
    risk_memberships: dict[int, set[int]] = defaultdict(set)
    if not threat_ids:
        return ThreatRiskContext({}, {}, {}, {}, {})

    link_rows = (
        await db.execute(
            select(ThreatRiskLink.threat_id, ThreatRiskLink.risk_id).where(
                ThreatRiskLink.threat_id.in_(threat_ids)
            )
        )
    ).all()
    candidate_risk_ids = {risk_id for _, risk_id in link_rows}
    readable_risk_ids = await visible_risk_ids(db, current_user, candidate_risk_ids)
    if not readable_risk_ids:
        return ThreatRiskContext({}, {}, {}, {}, {})

    risk_rows = (
        await db.execute(
            select(
                Risk.id,
                Risk.risk_id_code,
                Risk.name,
                Risk.risk_type,
                Risk.department_id,
                Department.name,
            )
            .outerjoin(Department, Department.id == Risk.department_id)
            .where(Risk.id.in_(readable_risk_ids))
        )
    ).all()
    risk_labels = {risk_id: f"{code} — {name}" for risk_id, code, name, *_ in risk_rows}
    risk_types = {risk_id: risk_type for risk_id, _, _, risk_type, _, _ in risk_rows}
    risk_departments = {
        risk_id: department_id
        for risk_id, _, _, _, department_id, _ in risk_rows
        if department_id is not None
    }
    risk_department_labels = {
        department_id: department_name
        for _, _, _, _, department_id, department_name in risk_rows
        if department_id is not None and department_name is not None
    }
    for threat_id, risk_id in link_rows:
        if risk_id in readable_risk_ids:
            risk_memberships[threat_id].add(risk_id)
    return ThreatRiskContext(
        dict(risk_memberships),
        risk_labels,
        risk_types,
        risk_departments,
        risk_department_labels,
    )


async def build_threat_listing(
    db: AsyncSession,
    *,
    current_user: User,
    criteria: ThreatListCriteria,
) -> ThreatListingResult:
    if not check_permission(current_user, "threats", "read"):
        raise AuthorizationError("Permission denied: threats:read")
    criteria = validate_threat_criteria(criteria)
    threats = list(
        (
            await db.execute(
                select(Threat)
                .options(
                    selectinload(Threat.threat_steward).selectinload(User.role),
                    selectinload(Threat.threat_steward).selectinload(User.department),
                )
                .order_by(Threat.id)
            )
        )
        .scalars()
        .unique()
        .all()
    )
    threat_ids = {threat.id for threat in threats}
    links = await _load_visible_risk_context(
        db,
        current_user=current_user,
        threat_ids=threat_ids,
    )
    pending_ids = await _pending_stewardship_orphan_ids(db, threat_ids=list(threat_ids))
    all_items = []
    for threat in threats:
        projected = serialize_threat_detail(
            threat,
            current_user=current_user,
            stewardship_pending=threat.id in pending_ids,
        )
        all_items.append(
            ThreatListItem.model_validate(
                {
                    **projected.model_dump(),
                    "visible_linked_risk_count": len(links.risks.get(threat.id, set())),
                }
            )
        )

    matching_items = _sort_items(
        [item for item in all_items if _matches(item, criteria, links)],
        criteria,
    )
    facets = _build_facets(all_items, criteria, links)
    groups = _build_groups(matching_items, criteria.group_by, links)
    if criteria.group_by and criteria.group_value:
        matching_items = [
            item
            for item in matching_items
            if criteria.group_value in _group_values(item, criteria.group_by, links)
        ]
    page_items = matching_items[criteria.offset : criteria.offset + criteria.limit]
    return ThreatListingResult(all_items, matching_items, page_items, groups, facets, links)


def _matches(item: ThreatListItem, criteria: ThreatListCriteria, links: ThreatRiskContext) -> bool:
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
                item.category or "",
                item.description or "",
                item.typical_weaknesses or "",
                item.relevant_subject or "",
                item.threat_steward.name if item.threat_steward else "",
            )
        ).casefold()
        if criteria.search.casefold() not in haystack:
            return False
    if criteria.categories and item.category not in criteria.categories:
        return False
    if criteria.steward_ids and item.threat_steward_user_id not in criteria.steward_ids:
        return False
    if criteria.relevant_subjects and item.relevant_subject not in criteria.relevant_subjects:
        return False

    readable_risk_ids = links.risks.get(item.id, set())
    if criteria.has_linked_risk is not None and bool(readable_risk_ids) is not criteria.has_linked_risk:
        return False
    if criteria.linked_risk_ids or criteria.linked_risk_types or criteria.linked_risk_department_ids:
        matching_risk_ids = set(readable_risk_ids)
        if criteria.linked_risk_ids:
            matching_risk_ids &= set(criteria.linked_risk_ids)
        if criteria.linked_risk_types:
            matching_risk_ids = {
                risk_id
                for risk_id in matching_risk_ids
                if links.risk_types.get(risk_id) in criteria.linked_risk_types
            }
        if criteria.linked_risk_department_ids:
            matching_risk_ids = {
                risk_id
                for risk_id in matching_risk_ids
                if links.risk_departments.get(risk_id) in criteria.linked_risk_department_ids
            }
        if not matching_risk_ids:
            return False
    return True


def _sort_items(items: list[ThreatListItem], criteria: ThreatListCriteria) -> list[ThreatListItem]:
    field = criteria.sort_by or "name"

    def value(item: ThreatListItem):
        if field == "threat_steward":
            return (item.threat_steward.name if item.threat_steward else "").casefold()
        if field == "linked_risk_count":
            return item.visible_linked_risk_count
        raw = getattr(item, field)
        if isinstance(raw, str):
            return raw.casefold()
        return raw if raw is not None else ""

    return sorted(items, key=lambda item: (value(item), item.id), reverse=criteria.sort_order == "desc")


def _group_values(item: ThreatListItem, group_by: str, links: ThreatRiskContext) -> list[str]:
    if group_by == "category":
        return [f"category:{item.category}"] if item.category else ["__uncategorized__"]
    if group_by == "threat_steward":
        return [f"steward:{item.threat_steward_user_id}"] if item.threat_steward_user_id else ["__unassigned__"]
    if group_by == "relevant_subject":
        return [f"relevant_subject:{item.relevant_subject}"] if item.relevant_subject else ["__unspecified__"]
    risk_ids = sorted(links.risks.get(item.id, set()))
    return [f"risk:{risk_id}" for risk_id in risk_ids] or ["__unlinked_risk__"]


def _group_label(item: ThreatListItem, value: str, links: ThreatRiskContext) -> str:
    if value.startswith("category:"):
        return value.removeprefix("category:")
    if value.startswith("steward:"):
        return item.threat_steward.name if item.threat_steward else "Unassigned"
    if value.startswith("relevant_subject:"):
        return item.relevant_subject or "Unspecified"
    if value.startswith("risk:"):
        return links.risk_labels.get(int(value.removeprefix("risk:")), "Unknown risk")
    return {
        "__uncategorized__": "Uncategorized",
        "__unassigned__": "Unassigned",
        "__unspecified__": "Unspecified",
        "__unlinked_risk__": "No readable linked Risk",
    }.get(value, value)


def _build_groups(
    items: list[ThreatListItem],
    group_by: str | None,
    links: ThreatRiskContext,
) -> list[CollectionGroupRead]:
    if group_by is None:
        return []
    counts: Counter[str] = Counter()
    active: Counter[str] = Counter()
    pending: Counter[str] = Counter()
    labels: dict[str, str] = {}
    for item in items:
        for value in set(_group_values(item, group_by, links)):
            counts[value] += 1
            active[value] += int(not item.is_archived)
            pending[value] += int(item.stewardship_status == "pending_governance")
            labels[value] = _group_label(item, value, links)
    return [
        CollectionGroupRead(
            value=value,
            label=labels[value],
            count=counts[value],
            active_count=active[value],
            highlighted_count=pending[value],
        )
        for value in sorted(counts, key=lambda current: (labels[current].casefold(), current))
    ]


def _build_facets(
    all_items: list[ThreatListItem],
    criteria: ThreatListCriteria,
    links: ThreatRiskContext,
) -> dict[str, list[ThreatFacetOption]]:
    def options(
        catalog: dict[str, str],
        counts: Counter[str],
        selected: set[str],
    ) -> list[ThreatFacetOption]:
        return [
            ThreatFacetOption(
                value=value,
                label=label,
                count=counts[value],
                disabled=counts[value] == 0,
                selected=value in selected,
            )
            for value, label in sorted(catalog.items(), key=lambda pair: (pair[1].casefold(), pair[0]))
        ]

    subject_catalog = {
        item.relevant_subject: item.relevant_subject
        for item in all_items
        if item.relevant_subject
    }
    dimension_criteria = {
        "lifecycle": replace(criteria, lifecycle=(), include_archived=True),
        "category": replace(criteria, categories=()),
        "relevant_subject": replace(criteria, relevant_subjects=()),
        "has_linked_risk": replace(criteria, has_linked_risk=None),
        "linked_risk_type": replace(criteria, linked_risk_types=()),
    }
    facet_items = {
        dimension: [item for item in all_items if _matches(item, narrowed, links)]
        for dimension, narrowed in dimension_criteria.items()
    }
    counts = {
        "lifecycle": Counter("archived" if item.is_archived else "active" for item in facet_items["lifecycle"]),
        "category": Counter(item.category for item in facet_items["category"] if item.category),
        "relevant_subject": Counter(
            item.relevant_subject for item in facet_items["relevant_subject"] if item.relevant_subject
        ),
        "has_linked_risk": Counter(
            "yes" if links.risks.get(item.id) else "no" for item in facet_items["has_linked_risk"]
        ),
        "linked_risk_type": Counter(
            risk_type
            for item in facet_items["linked_risk_type"]
            for risk_type in {
                links.risk_types[risk_id]
                for risk_id in links.risks.get(item.id, set())
                if risk_id in links.risk_types
            }
        ),
    }
    return {
        "lifecycle": options(
            {"active": "active", "archived": "archived"},
            counts["lifecycle"],
            set(criteria.lifecycle),
        ),
        "category": options(
            {value: value for value in THREAT_CATEGORY_CODES},
            counts["category"],
            set(criteria.categories),
        ),
        "relevant_subject": options(
            subject_catalog,
            counts["relevant_subject"],
            set(criteria.relevant_subjects),
        ),
        "has_linked_risk": options(
            {"yes": "yes", "no": "no"},
            counts["has_linked_risk"],
            ({"yes"} if criteria.has_linked_risk is True else {"no"} if criteria.has_linked_risk is False else set()),
        ),
        "linked_risk_type": options(
            {value: value for value in _RISK_TYPES},
            counts["linked_risk_type"],
            set(criteria.linked_risk_types),
        ),
    }


async def threat_filter_lookups(
    db: AsyncSession,
    *,
    current_user: User,
    kind: str,
    search: str | None,
    selected_ids: tuple[int, ...],
    limit: int,
) -> list[ThreatLookupOption]:
    if not check_permission(current_user, "threats", "read"):
        raise AuthorizationError("Permission denied: threats:read")
    threats = list(
        (
            await db.execute(
                select(Threat).options(
                    selectinload(Threat.threat_steward).selectinload(User.role),
                )
            )
        )
        .scalars()
        .unique()
        .all()
    )
    threat_ids = {threat.id for threat in threats}
    links = await _load_visible_risk_context(db, current_user=current_user, threat_ids=threat_ids)
    rows: list[tuple[int, str, str | None, int]]
    ordinary_ids: set[int] | None = None
    if kind == "stewards":
        counts = Counter(threat.threat_steward_user_id for threat in threats if threat.threat_steward_user_id)
        ordinary_ids = {
            threat.threat_steward_user_id
            for threat in threats
            if threat.threat_steward_user_id
            and threat.threat_steward
            and threat.threat_steward.is_active
            and threat.threat_steward.role
            and threat.threat_steward.role.is_active
            and threat.threat_steward.role.name == RoleType.CISO
        }
        rows = [
            (
                threat.threat_steward_user_id,
                threat.threat_steward.name,
                threat.threat_steward.email,
                counts[threat.threat_steward_user_id],
            )
            for threat in threats
            if threat.threat_steward_user_id and threat.threat_steward
        ]
    elif kind == "risks":
        counts = Counter(
            risk_id for threat_id in threat_ids for risk_id in links.risks.get(threat_id, set())
        )
        rows = [
            (risk_id, label, links.risk_types.get(risk_id), counts[risk_id])
            for risk_id, label in links.risk_labels.items()
        ]
    elif kind == "risk-departments":
        department_memberships = {
            threat_id: {
                links.risk_departments[risk_id]
                for risk_id in links.risks.get(threat_id, set())
                if risk_id in links.risk_departments
            }
            for threat_id in threat_ids
        }
        counts = Counter(
            department_id
            for values in department_memberships.values()
            for department_id in values
        )
        rows = [
            (department_id, label, None, counts[department_id])
            for department_id, label in links.risk_department_labels.items()
        ]
    else:
        raise ValidationError("Invalid Threat lookup kind")

    deduplicated = {row[0]: row for row in rows}
    needle = (search or "").casefold()
    visible_selected = set(selected_ids) & set(deduplicated)
    selected_rows = [row for row in deduplicated.values() if row[0] in visible_selected]
    ordinary_rows = [
        row
        for row in deduplicated.values()
        if row[0] not in visible_selected
        and (ordinary_ids is None or row[0] in ordinary_ids)
        and (not needle or needle in row[1].casefold() or needle in (row[2] or "").casefold())
    ]
    selected_rows.sort(key=lambda row: (row[1].casefold(), row[0]))
    ordinary_rows.sort(key=lambda row: (row[1].casefold(), row[0]))
    remaining = max(limit - len(selected_rows), 0)
    return [
        ThreatLookupOption(id=row[0], label=row[1], secondary_label=row[2], count=row[3])
        for row in [*selected_rows, *ordinary_rows[:remaining]]
    ]


def threat_collection_capabilities(current_user: User):
    return build_threat_collection_capabilities(current_user).model_copy(
        update={"can_export": check_permission(current_user, "reports", "read")}
    )
