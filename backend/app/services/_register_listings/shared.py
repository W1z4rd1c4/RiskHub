from __future__ import annotations

from typing import Any

from sqlalchemy import false, select

from app.core.permissions import vendor_visibility_clause
from app.models import User, Vendor

GROUP_UNLINKED_VENDOR = "__unlinked_vendor__"
GROUP_UNCATEGORIZED = "__uncategorized__"


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
