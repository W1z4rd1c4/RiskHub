"""Read-shape projection for monitoring responses.

Pairs with _monitoring_status (see services/_monitoring_status/README.md).
File-level entry per ADR-007 amendment.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from sqlalchemy import inspect as sa_inspect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import NO_VALUE

from app.api.mappers.risk import filter_active_kris
from app.schemas.control import ControlCapabilities, ControlRead
from app.schemas.kri import KRICapabilities, KRIResponse
from app.schemas.risk import ControlBriefForLink, ControlRiskLinkRead, RiskBriefForLink, RiskCapabilities, RiskRead
from app.schemas.vendor_shared import LinkedVendorRead
from app.services._monitoring_status import (
    build_control_monitoring_facts,
    build_kri_monitoring_facts,
    derive_control_monitoring_snapshot,
    derive_kri_monitoring_snapshot,
    get_control_monitoring_config,
    get_kri_monitoring_config,
)


@dataclass(frozen=True)
class MonitoringResponseContext:
    now: datetime
    today: date
    control_config: Any
    kri_config: Any


async def load_monitoring_response_context(
    db: AsyncSession,
    *,
    now: datetime,
    today: date,
) -> MonitoringResponseContext:
    control_config = await get_control_monitoring_config(db)
    kri_config = await get_kri_monitoring_config(db)
    return MonitoringResponseContext(
        now=now,
        today=today,
        control_config=control_config,
        kri_config=kri_config,
    )


def _loaded_attr(instance: Any, attribute_name: str, default: Any = None) -> Any:
    """Return an ORM attribute only when it is already loaded."""
    state = sa_inspect(instance)
    attr_state = state.attrs.get(attribute_name)
    if attr_state is None:
        return default
    loaded_value = attr_state.loaded_value
    if loaded_value is NO_VALUE:
        return default
    return loaded_value


def _serialize_control_base(control) -> dict[str, Any]:
    return {
        "name": control.name,
        "description": control.description,
        "data_source": control.data_source,
        "methodology_reference": control.methodology_reference,
        "control_form": control.control_form,
        "process_owner_position": control.process_owner_position,
        "control_owner_id": control.control_owner_id,
        "executor_position": control.executor_position,
        "frequency": control.frequency,
        "risk_level": control.risk_level,
        "output_description": control.output_description,
        "report_recipient": control.report_recipient,
        "documentation_location": control.documentation_location,
        "department_id": control.department_id,
        "status": control.status,
    }


def _serialize_kri_base(kri) -> dict[str, Any]:
    return {
        "metric_name": kri.metric_name,
        "description": kri.description,
        "current_value": kri.current_value,
        "lower_limit": kri.lower_limit,
        "upper_limit": kri.upper_limit,
        "unit": kri.unit,
        "frequency": kri.frequency,
        "reporting_owner_id": kri.reporting_owner_id,
    }


def _serialize_risk_base(risk) -> dict[str, Any]:
    return {
        "risk_id_code": risk.risk_id_code,
        "name": risk.name,
        "process": risk.process,
        "subprocess": risk.subprocess,
        "risk_type": risk.risk_type,
        "category": risk.category,
        "description": risk.description,
        "department_id": risk.department_id,
        "owner_id": risk.owner_id,
        "gross_probability": risk.gross_probability,
        "gross_impact": risk.gross_impact,
        "net_probability": risk.net_probability,
        "net_impact": risk.net_impact,
        "status": risk.status,
        "is_priority": risk.is_priority,
    }


def build_control_monitoring_fields(control, context: MonitoringResponseContext) -> dict[str, Any]:
    snapshot = derive_control_monitoring_snapshot(
        build_control_monitoring_facts(control),
        context.control_config,
        now=context.now,
    )
    return {
        "monitoring_status": snapshot.monitoring_status,
        "monitoring_status_reason": snapshot.monitoring_status_reason,
        "latest_execution_result": snapshot.latest_execution_result,
        "latest_executed_at": snapshot.latest_executed_at,
        "days_since_last_execution": snapshot.days_since_last_execution,
        "execution_log_count": snapshot.execution_log_count,
    }


def build_kri_monitoring_fields(kri, context: MonitoringResponseContext) -> dict[str, Any]:
    snapshot = derive_kri_monitoring_snapshot(
        build_kri_monitoring_facts(kri),
        context.kri_config,
        today=context.today,
    )
    return {
        "monitoring_status": snapshot.monitoring_status,
        "monitoring_status_reason": snapshot.monitoring_status_reason,
        "is_submitted_for_required_period": snapshot.is_submitted_for_required_period,
        "required_period_end": snapshot.required_period_end,
        "required_due_date": snapshot.required_due_date,
        "days_overdue": snapshot.days_overdue,
        "warning_upper_margin_ratio": snapshot.warning_upper_margin_ratio,
    }


def serialize_control_read(
    control,
    context: MonitoringResponseContext,
    *,
    capabilities: ControlCapabilities | None = None,
) -> ControlRead:
    return ControlRead.model_validate(
        {
            **_serialize_control_base(control),
            "id": control.id,
            "control_owner": _loaded_attr(control, "control_owner"),
            "department": _loaded_attr(control, "department"),
            "created_by_id": control.created_by_id,
            "updated_by_id": control.updated_by_id,
            "is_archived": control.is_archived,
            "capabilities": capabilities,
            "created_at": control.created_at,
            "updated_at": control.updated_at,
            **build_control_monitoring_fields(control, context),
        }
    )


def serialize_control_brief_for_link(control, context: MonitoringResponseContext) -> ControlBriefForLink:
    return ControlBriefForLink.model_validate(
        {
            "id": control.id,
            "name": control.name,
            "frequency": control.frequency,
            "risk_level": control.risk_level,
            "status": control.status,
            "is_archived": control.is_archived,
            **build_control_monitoring_fields(control, context),
        }
    )


def serialize_control_risk_link(link, context: MonitoringResponseContext) -> ControlRiskLinkRead:
    risk = _loaded_attr(link, "risk")
    return ControlRiskLinkRead.model_validate(
        {
            "id": link.id,
            "control_id": link.control_id,
            "risk_id": link.risk_id,
            "effectiveness": link.effectiveness,
            "notes": link.notes,
            "control": serialize_control_brief_for_link(link.control, context) if link.control is not None else None,
            "risk": RiskBriefForLink.model_validate(risk) if risk is not None else None,
            "created_at": link.created_at,
        }
    )


def serialize_kri_response(
    kri,
    context: MonitoringResponseContext,
    *,
    linked_vendors: list[LinkedVendorRead] | None = None,
    capabilities: KRICapabilities | None = None,
) -> KRIResponse:
    risk = _loaded_attr(kri, "risk")
    risk_owner = _loaded_attr(risk, "owner") if risk is not None else None
    risk_department = _loaded_attr(risk, "department") if risk is not None else None
    reporting_owner = _loaded_attr(kri, "reporting_owner")
    resolved_linked_vendors = (
        linked_vendors
        if linked_vendors is not None
        else [
            LinkedVendorRead(
                id=vendor.id,
                name=vendor.name,
                is_archived=vendor.is_archived,
            )
            for link in (_loaded_attr(kri, "vendor_links", []) or [])
            if (vendor := _loaded_attr(link, "vendor")) is not None
        ]
    )
    return KRIResponse.model_validate(
        {
            **_serialize_kri_base(kri),
            "id": kri.id,
            "risk_id": kri.risk_id,
            "is_archived": kri.is_archived,
            "archived_at": kri.archived_at,
            "archived_by_id": kri.archived_by_id,
            "risk_category": getattr(risk, "category", None),
            "risk_process": getattr(risk, "process", None),
            "risk_description": getattr(risk, "description", None),
            "risk_name": getattr(risk, "name", None),
            "risk_type": getattr(risk, "risk_type", None),
            "risk_id_code": getattr(risk, "risk_id_code", None),
            "risk_owner_name": getattr(risk_owner, "name", None),
            "risk_department_name": getattr(risk_department, "name", None),
            "department_name": getattr(risk_department, "name", None),
            "reporting_owner_name": getattr(reporting_owner, "name", None),
            "linked_vendors": resolved_linked_vendors,
            "capabilities": capabilities,
            "last_period_end": kri.last_period_end,
            "last_reported_at": kri.last_reported_at,
            "last_updated": kri.last_updated,
            "created_at": kri.created_at,
            **build_kri_monitoring_fields(kri, context),
        }
    )


def serialize_risk_read(
    risk,
    context: MonitoringResponseContext,
    *,
    capabilities: RiskCapabilities | None = None,
) -> RiskRead:
    active_kris = filter_active_kris(_loaded_attr(risk, "kris", []) or [])
    return RiskRead.model_validate(
        {
            **_serialize_risk_base(risk),
            "id": risk.id,
            "gross_score": risk.gross_score,
            "net_score": risk.net_score,
            "is_archived": risk.is_archived,
            "archived_at": risk.archived_at,
            "archived_by_id": risk.archived_by_id,
            "owner": _loaded_attr(risk, "owner"),
            "department": _loaded_attr(risk, "department"),
            "kris": [serialize_kri_response(kri, context) for kri in active_kris],
            "capabilities": capabilities,
            "created_at": risk.created_at,
            "updated_at": risk.updated_at,
        }
    )
