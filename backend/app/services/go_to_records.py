from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from sqlalchemy import String, case, cast, func, literal, null, or_, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.core.permissions import (
    control_visibility_clause,
    get_issue_scope_clause,
    has_permission,
    kri_visibility_clause,
    risk_visibility_clause,
)
from app.models import Asset, Control, Issue, KeyRiskIndicator, Process, Risk, Threat, User, Vendor
from app.models._archivable import archived_clause
from app.schemas.go_to import GoToRecordRead
from app.services._ict_register_lifecycle.asset_policy import asset_visibility_clause
from app.services._ict_register_lifecycle.policy import process_visibility_clause
from app.services._vendor_workflow import apply_vendor_visibility_scope

GO_TO_RESULT_LIMIT = 20
_LIKE_ESCAPE = "\\"


def _escape_like(value: str) -> str:
    return (
        value.replace(_LIKE_ESCAPE, _LIKE_ESCAPE * 2).replace("%", f"{_LIKE_ESCAPE}%").replace("_", f"{_LIKE_ESCAPE}_")
    )


def _record_select(
    *,
    entity_type: str,
    entity_order: int,
    internal_id: Any,
    business_identifier: Any,
    display_name: Any,
    status: Any,
    destination_prefix: str,
    normalized_query: str,
    clauses: Sequence[ColumnElement[bool]],
):
    normalized_identifier = func.lower(func.trim(func.coalesce(cast(business_identifier, String), "")))
    normalized_name = func.lower(func.trim(cast(display_name, String)))
    escaped_query = _escape_like(normalized_query)
    prefix_pattern = f"{escaped_query}%"
    substring_pattern = f"%{escaped_query}%"
    matches = or_(
        normalized_identifier.like(substring_pattern, escape=_LIKE_ESCAPE),
        normalized_name.like(substring_pattern, escape=_LIKE_ESCAPE),
    )
    match_rank = case(
        (normalized_identifier == normalized_query, 0),
        (
            or_(
                normalized_identifier.like(prefix_pattern, escape=_LIKE_ESCAPE),
                normalized_name.like(prefix_pattern, escape=_LIKE_ESCAPE),
            ),
            1,
        ),
        else_=2,
    )
    return select(
        literal(entity_type).label("entity_type"),
        cast(business_identifier, String).label("business_identifier"),
        cast(display_name, String).label("display_name"),
        cast(status, String).label("status"),
        (literal(destination_prefix) + cast(internal_id, String)).label("destination"),
        match_rank.label("match_rank"),
        literal(entity_order).label("entity_order"),
        normalized_identifier.label("normalized_identifier"),
        normalized_name.label("normalized_name"),
        internal_id.label("internal_id"),
    ).where(*clauses, matches)


async def search_go_to_records(
    db: AsyncSession,
    *,
    current_user: User,
    query: str,
) -> list[GoToRecordRead]:
    normalized_query = query.lower()
    empty_identifier = cast(null(), String)

    risk_clauses: list[ColumnElement[bool]] = [archived_clause(Risk, archived=False)]
    risk_scope = await risk_visibility_clause(db, current_user)
    if risk_scope is not None:
        risk_clauses.append(risk_scope)

    control_clauses: list[ColumnElement[bool]] = [archived_clause(Control, archived=False)]
    control_scope = control_visibility_clause(current_user)
    if control_scope is not None:
        control_clauses.append(control_scope)

    kri_clauses: list[ColumnElement[bool]] = [
        archived_clause(KeyRiskIndicator, archived=False),
        archived_clause(Risk, archived=False),
    ]
    kri_scope = await kri_visibility_clause(db, current_user)
    if kri_scope is not None:
        kri_clauses.append(kri_scope)

    queries = [
        _record_select(
            entity_type="risk",
            entity_order=0,
            internal_id=Risk.id,
            business_identifier=Risk.risk_id_code,
            display_name=Risk.name,
            status=Risk.status,
            destination_prefix="/risks/",
            normalized_query=normalized_query,
            clauses=risk_clauses,
        ),
        _record_select(
            entity_type="control",
            entity_order=1,
            internal_id=Control.id,
            business_identifier=empty_identifier,
            display_name=Control.name,
            status=Control.status,
            destination_prefix="/controls/",
            normalized_query=normalized_query,
            clauses=control_clauses,
        ),
        _record_select(
            entity_type="kri",
            entity_order=2,
            internal_id=KeyRiskIndicator.id,
            business_identifier=empty_identifier,
            display_name=KeyRiskIndicator.metric_name,
            status=literal("active"),
            destination_prefix="/kris/",
            normalized_query=normalized_query,
            clauses=kri_clauses,
        ).join(Risk, Risk.id == KeyRiskIndicator.risk_id),
    ]

    if has_permission(current_user, "issues", "read"):
        issue_clauses: list[ColumnElement[bool]] = []
        issue_scope = await get_issue_scope_clause(db, current_user)
        if issue_scope is not None:
            issue_clauses.append(issue_scope)
        queries.append(
            _record_select(
                entity_type="issue",
                entity_order=3,
                internal_id=Issue.id,
                business_identifier=empty_identifier,
                display_name=Issue.title,
                status=Issue.status,
                destination_prefix="/issues/",
                normalized_query=normalized_query,
                clauses=issue_clauses,
            )
        )

    vendor_query = _record_select(
        entity_type="vendor",
        entity_order=4,
        internal_id=Vendor.id,
        business_identifier=Vendor.registration_id,
        display_name=Vendor.name,
        status=literal("active"),
        destination_prefix="/vendors/",
        normalized_query=normalized_query,
        clauses=[archived_clause(Vendor, archived=False)],
    )
    queries.append(apply_vendor_visibility_scope(vendor_query, current_user))

    process_clauses: list[ColumnElement[bool]] = [archived_clause(Process, archived=False)]
    process_scope = process_visibility_clause(current_user)
    if process_scope is not None:
        process_clauses.append(process_scope)
    queries.append(
        _record_select(
            entity_type="process",
            entity_order=5,
            internal_id=Process.id,
            business_identifier=Process.f_code,
            display_name=Process.l1_process,
            status=literal("active"),
            destination_prefix="/processes/",
            normalized_query=normalized_query,
            clauses=process_clauses,
        )
    )

    asset_clauses: list[ColumnElement[bool]] = [archived_clause(Asset, archived=False)]
    asset_scope = asset_visibility_clause(current_user)
    if asset_scope is not None:
        asset_clauses.append(asset_scope)
    queries.append(
        _record_select(
            entity_type="asset",
            entity_order=6,
            internal_id=Asset.id,
            business_identifier=empty_identifier,
            display_name=Asset.name,
            status=literal("active"),
            destination_prefix="/assets/",
            normalized_query=normalized_query,
            clauses=asset_clauses,
        )
    )

    if has_permission(current_user, "threats", "read"):
        queries.append(
            _record_select(
                entity_type="threat",
                entity_order=7,
                internal_id=Threat.id,
                business_identifier=empty_identifier,
                display_name=Threat.name,
                status=literal("active"),
                destination_prefix="/threats/",
                normalized_query=normalized_query,
                clauses=[archived_clause(Threat, archived=False)],
            )
        )

    combined = union_all(*queries).subquery()
    rows = (
        await db.execute(
            select(
                combined.c.entity_type,
                combined.c.business_identifier,
                combined.c.display_name,
                combined.c.status,
                combined.c.destination,
            )
            .order_by(
                combined.c.match_rank,
                combined.c.entity_order,
                combined.c.normalized_identifier,
                combined.c.normalized_name,
                combined.c.internal_id,
            )
            .limit(GO_TO_RESULT_LIMIT)
        )
    ).mappings()
    return [GoToRecordRead.model_validate(row) for row in rows]
