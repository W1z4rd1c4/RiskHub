from __future__ import annotations

from collections import Counter
from typing import Any, Literal

from sqlalchemy import false, select

from app.core.permissions import vendor_visibility_clause
from app.models import User, Vendor
from app.schemas.collection import CollectionFacetOption
from app.services._collection_filters import coerce_optional_bool, coerce_optional_literal

GROUP_UNLINKED_VENDOR = "__unlinked_vendor__"
GROUP_UNCATEGORIZED = "__uncategorized__"
RegisterLifecycle = Literal["active", "archived", "all"]
REGISTER_LIFECYCLES = {"active", "archived", "all"}


def resolve_register_lifecycle(filters: dict[str, Any]) -> tuple[RegisterLifecycle, bool]:
    """Resolve lifecycle independently, with narrow legacy compatibility.

    The boolean return value means the legacy overloaded ``status=archived``
    value was consumed as lifecycle and must not be parsed as domain status.
    Explicit ``lifecycle`` always wins over legacy ``include_archived``.
    """

    explicit = coerce_optional_literal("lifecycle", filters.get("lifecycle"), REGISTER_LIFECYCLES)
    if explicit is not None:
        return explicit, False

    raw_status = filters.get("status")
    normalized_status = str(getattr(raw_status, "value", raw_status)).lower() if raw_status is not None else ""
    if normalized_status == "archived":
        return "archived", True
    if coerce_optional_bool("include_archived", filters.get("include_archived")):
        return "all", False
    return "active", False


def build_facet_options(
    catalog: dict[str, tuple[str, dict[str, Any]]],
    counts: Counter[str],
    *,
    selected: set[str] | None = None,
) -> list[CollectionFacetOption]:
    """Build stable permission-scoped facets, retaining selected zero matches."""

    selected_values = selected or set()
    values = set(catalog) | selected_values
    return [
        CollectionFacetOption(
            value=value,
            label=catalog.get(value, (value, {}))[0],
            count=counts.get(value, 0),
            selected=value in selected_values,
            disabled=counts.get(value, 0) == 0,
            meta=catalog.get(value, (value, {}))[1],
        )
        for value in sorted(values, key=lambda item: catalog.get(item, (item, {}))[0].casefold())
    ]


def parse_prefixed_group_value(group_value: str, *, prefix: str) -> int | None:
    raw_prefix = f"{prefix}:"
    if not group_value.startswith(raw_prefix):
        return None
    try:
        return int(group_value.removeprefix(raw_prefix))
    except ValueError:
        return None


def visible_vendor_link_context(
    *,
    filtered_ids,
    current_user: User,
    can_read_vendors: bool,
    link_model: type[Any],
    entity_id_column,
    entity_id_label: str,
    vendor_id_column,
):
    query = (
        select(
            entity_id_column.label(entity_id_label),
            Vendor.id.label("vendor_id"),
            Vendor.name.label("vendor_name"),
        )
        .select_from(link_model)
        .join(filtered_ids, filtered_ids.c.id == entity_id_column)
        .join(Vendor, Vendor.id == vendor_id_column)
    )
    vendor_visibility = vendor_visibility_clause(current_user) if can_read_vendors else false()
    if vendor_visibility is not None:
        query = query.where(vendor_visibility)
    return query.subquery()
