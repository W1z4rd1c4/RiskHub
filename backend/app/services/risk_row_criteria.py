"""Risk row predicates shared by current SQL lists and final replay facts."""

from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any

from sqlalchemy import or_
from sqlalchemy.sql.elements import ColumnElement

from app.models._archivable import archived_clause
from app.schemas.risk import RiskStatusEnum
from app.services._collection_filters import coerce_optional_bool, coerce_optional_enum, coerce_optional_string
from app.services._register_listings.shared import RegisterLifecycle, resolve_register_lifecycle

RISK_SEARCH_FIELDS = ("risk_id_code", "name", "description", "process")


@dataclass(frozen=True)
class RiskRowCriteria:
    lifecycle: RegisterLifecycle
    status: RiskStatusEnum | None
    risk_type: str | None
    is_priority: bool | None
    search: str | None
    consumed_legacy_archived_status: bool


def parse_risk_row_criteria(filters: dict[str, Any]) -> RiskRowCriteria:
    lifecycle, consumed = resolve_register_lifecycle(filters)
    return RiskRowCriteria(
        lifecycle=lifecycle,
        status=None if consumed else coerce_optional_enum(RiskStatusEnum, filters.get("status"), "status"),
        risk_type=coerce_optional_string("risk_type", filters.get("risk_type")),
        is_priority=coerce_optional_bool("is_priority", filters.get("is_priority")),
        search=coerce_optional_string("search", filters.get("search")),
        consumed_legacy_archived_status=consumed,
    )


def risk_lifecycle_predicates(source: Any, lifecycle: RegisterLifecycle) -> list[ColumnElement[bool]]:
    if lifecycle == "all":
        return []
    # Reuse canonical Risk archive semantics for ORM or projected replay columns.
    archive_source = SimpleNamespace(__tablename__="risks", is_archived=source.is_archived, status=source.status)
    return [archived_clause(archive_source, archived=lifecycle == "archived")]


def risk_row_predicates(source: Any, criteria: RiskRowCriteria) -> list[ColumnElement[bool]]:
    conditions = risk_lifecycle_predicates(source, criteria.lifecycle)
    if criteria.status is not None:
        conditions.append(source.status == criteria.status.value)
    if criteria.risk_type:
        conditions.append(source.risk_type == criteria.risk_type)
    if criteria.is_priority is not None:
        conditions.append(source.is_priority == criteria.is_priority)
    if criteria.search:
        pattern = f"%{criteria.search}%"
        conditions.append(or_(*(getattr(source, field).ilike(pattern) for field in RISK_SEARCH_FIELDS)))
    return conditions
