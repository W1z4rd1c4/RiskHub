from datetime import datetime
from typing import Any

from app.api.mappers.risk import active_kris_for_risk
from app.core.datetime_utils import coerce_utc
from app.models import Control, Issue, KeyRiskIndicator, Risk, User, Vendor
from app.models.issue import IssueStatus
from app.services._issue_register.serialization import _issue_source_link, _link_display
from app.services._monitoring_status import build_control_monitoring_facts
from app.services._monitoring_status.kris import classify_kri_breach
from app.services.issue_visibility_service import issue_has_active_approved_exception

from .shared import _enum_value, _joined, _latest_exception


def _risk_to_row(risk: Risk) -> dict[str, Any]:
    active_kris = active_kris_for_risk(risk)
    return {
        "id": risk.id,
        "risk_id_code": risk.risk_id_code,
        "name": risk.name,
        "process": risk.process,
        "category": risk.category,
        "risk_type": risk.risk_type,
        "description": risk.description,
        "gross_probability": risk.gross_probability,
        "gross_impact": risk.gross_impact,
        "gross_score": risk.gross_score,
        "net_probability": risk.net_probability,
        "net_impact": risk.net_impact,
        "net_score": risk.net_score,
        "status": risk.status,
        "is_archived": bool(risk.is_archived),
        "is_priority": bool(risk.is_priority),
        "owner_id": risk.owner_id,
        "owner_name": risk.owner.name if getattr(risk, "owner", None) else None,
        "department_id": risk.department_id,
        "department_name": risk.department.name if getattr(risk, "department", None) else None,
        "control_count": len(risk.control_links or []),
        "kri_count": len(active_kris),
        "created_at": risk.created_at,
        "updated_at": risk.updated_at,
    }


def _control_to_row(control: Control) -> dict[str, Any]:
    first_risk = control.risk_links[0].risk if control.risk_links else None
    monitoring_facts = build_control_monitoring_facts(control)
    return {
        "id": control.id,
        "name": control.name,
        "description": control.description,
        "status": control.status,
        "is_archived": bool(control.is_archived),
        "frequency": control.frequency,
        "control_form": control.control_form,
        "risk_level": control.risk_level,
        "department_id": control.department_id,
        "department_name": control.department.name if getattr(control, "department", None) else None,
        "control_owner_id": control.control_owner_id,
        "control_owner_name": control.control_owner.name if getattr(control, "control_owner", None) else None,
        "risk_id_code": first_risk.risk_id_code if first_risk else None,
        "risk_name": first_risk.name if first_risk else None,
        "risk_owner_name": first_risk.owner.name if first_risk and first_risk.owner else None,
        "risk_department_name": first_risk.department.name if first_risk and first_risk.department else None,
        "linked_risk_count": len(control.risk_links or []),
        "latest_execution_result": monitoring_facts.latest_execution_result,
        "latest_executed_at": monitoring_facts.latest_executed_at,
        "execution_log_count": monitoring_facts.execution_log_count,
        "created_at": control.created_at,
    }


def _kri_to_row(kri: KeyRiskIndicator) -> dict[str, Any]:
    risk = kri.risk
    status = "archived" if kri.is_archived else "active"
    reporting_owner = getattr(kri, "reporting_owner", None)
    return {
        "id": kri.id,
        "risk_id": kri.risk_id,
        "risk_id_code": risk.risk_id_code if risk else None,
        "risk_name": risk.name if risk else None,
        "risk_status": risk.status if risk else None,
        "risk_owner_id": risk.owner_id if risk else None,
        "department_id": risk.department_id if risk else None,
        "department_name": risk.department.name if risk and risk.department else None,
        "metric_name": kri.metric_name,
        "description": kri.description,
        "current_value": kri.current_value,
        "lower_limit": kri.lower_limit,
        "upper_limit": kri.upper_limit,
        "unit": kri.unit,
        "breach_status": classify_kri_breach(
            current_value=kri.current_value,
            lower_limit=kri.lower_limit,
            upper_limit=kri.upper_limit,
        ),
        "frequency": kri.frequency,
        "status": status,
        "is_archived": bool(kri.is_archived),
        "archived_at": kri.archived_at,
        "archived_by_id": kri.archived_by_id,
        "reporting_owner_id": kri.reporting_owner_id,
        "reporting_owner_name": reporting_owner.name if reporting_owner else None,
        "last_reported_at": kri.last_reported_at,
        "last_period_end": kri.last_period_end,
        "created_at": kri.created_at,
    }


def _vendor_to_row(vendor: Vendor) -> dict[str, Any]:
    return {
        "id": vendor.id,
        "name": vendor.name,
        "legal_name": vendor.legal_name,
        "vendor_type": vendor.vendor_type,
        "process": vendor.process,
        "subprocess": vendor.subprocess,
        "description": vendor.description,
        "status": vendor.status,
        "is_archived": bool(vendor.is_archived),
        "department_id": vendor.department_id,
        "department_name": vendor.department.name if getattr(vendor, "department", None) else None,
        "outsourcing_owner_user_id": vendor.outsourcing_owner_user_id,
        "owner_name": vendor.outsourcing_owner.name if getattr(vendor, "outsourcing_owner", None) else None,
        "risk_score_1_5": vendor.risk_score_1_5,
        "dora_relevant": bool(vendor.dora_relevant),
        "is_significant_vendor": bool(vendor.is_significant_vendor),
        "supports_core_function": bool(vendor.supports_important_core_insurance_function),
        "created_at": vendor.created_at,
        "updated_at": vendor.updated_at,
    }


def _issue_to_row(issue: Issue, *, as_of_dt: datetime, current_user: User) -> dict[str, Any]:
    links = issue.links or []
    risk_ids = [str(link.risk_id) for link in links if link.risk_id is not None]
    control_ids = [str(link.control_id) for link in links if link.control_id is not None]
    execution_ids = [str(link.execution_id) for link in links if link.execution_id is not None]
    kri_ids = [str(link.kri_id) for link in links if link.kri_id is not None]
    risk_names = [link.risk.name for link in links if link.risk is not None]
    control_names = [link.control.name for link in links if link.control is not None]
    kri_names = [link.kri.metric_name for link in links if link.kri is not None]

    remediation = issue.remediation_plan
    latest_exception = _latest_exception(issue)
    active_exception = issue_has_active_approved_exception(issue, as_of_dt)
    due_at = coerce_utc(issue.due_at)
    opened_at = coerce_utc(issue.opened_at)
    age_days = (as_of_dt - opened_at).days if opened_at is not None else 0
    age_days = max(age_days, 0)
    is_overdue = (
        issue.status != IssueStatus.closed.value and not active_exception and due_at is not None and due_at < as_of_dt
    )
    source_link = _issue_source_link(issue)
    source_link_type, source_link_label = (
        _link_display(source_link, current_user=current_user) if source_link is not None else (None, None)
    )

    return {
        "id": issue.id,
        "title": issue.title,
        "status": _enum_value(issue.status),
        "severity": _enum_value(issue.severity),
        "source_type": _enum_value(issue.source_type),
        "source_id": issue.source_id,
        "source_display": source_link_label,
        "source_link_type": source_link_type,
        "source_link_label": source_link_label,
        "department_id": issue.department_id,
        "department_name": issue.department.name if issue.department else None,
        "owner_user_id": issue.owner_user_id,
        "owner_name": issue.owner.name if issue.owner else None,
        "due_at": due_at,
        "is_overdue": is_overdue,
        "age_days": age_days,
        "risk_ids": _joined(risk_ids),
        "risk_names": _joined(risk_names),
        "control_ids": _joined(control_ids),
        "control_names": _joined(control_names),
        "execution_ids": _joined(execution_ids),
        "kri_ids": _joined(kri_ids),
        "kri_names": _joined(kri_names),
        "remediation_status": _enum_value(remediation.status) if remediation else None,
        "remediation_progress_percent": remediation.progress_percent if remediation else None,
        "remediation_owner_id": remediation.owner_user_id if remediation else None,
        "remediation_owner_name": remediation.owner.name if remediation and remediation.owner else None,
        "remediation_target_date": remediation.target_date if remediation else None,
        "exception_status": _enum_value(latest_exception.status) if latest_exception else None,
        "exception_expires_at": coerce_utc(latest_exception.expires_at) if latest_exception else None,
    }
