"""Small explicit model factories for backend tests."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Control, KeyRiskIndicator, Risk, Vendor
from app.models.risk import RiskStatus


async def create_test_risk(
    db: AsyncSession,
    *,
    department_id: int,
    owner_id: int | None,
    risk_id_code: str = "R-TEST-001",
    name: str = "Test Risk",
    process: str = "Test Process",
    overrides: Mapping[str, Any] | None = None,
) -> Risk:
    payload: dict[str, Any] = {
        "risk_id_code": risk_id_code,
        "name": name,
        "process": process,
        "description": "Risk for testing",
        "department_id": department_id,
        "owner_id": owner_id,
        "risk_type": "operational",
        "gross_probability": 3,
        "gross_impact": 3,
        "net_probability": 2,
        "net_impact": 2,
        "status": RiskStatus.active.value,
    }
    payload.update(overrides or {})
    risk = Risk(**payload)
    db.add(risk)
    await db.commit()
    await db.refresh(risk)
    return risk


async def create_test_kri(
    db: AsyncSession,
    *,
    risk_id: int,
    metric_name: str = "Test KRI",
    overrides: Mapping[str, Any] | None = None,
) -> KeyRiskIndicator:
    payload: dict[str, Any] = {
        "risk_id": risk_id,
        "metric_name": metric_name,
        "description": "Test KRI description",
        "unit": "%",
        "current_value": 50.0,
        "lower_limit": 0.0,
        "upper_limit": 100.0,
    }
    payload.update(overrides or {})
    kri = KeyRiskIndicator(**payload)
    db.add(kri)
    await db.commit()
    await db.refresh(kri)
    return kri


async def create_test_vendor(
    db: AsyncSession,
    *,
    department_id: int,
    owner_id: int,
    name: str = "Test Vendor",
    process: str = "Test Process",
    overrides: Mapping[str, Any] | None = None,
) -> Vendor:
    payload: dict[str, Any] = {
        "name": name,
        "process": process,
        "department_id": department_id,
        "outsourcing_owner_user_id": owner_id,
        "vendor_type": "outsourcing",
        "risk_score_1_5": 3,
        "supports_important_core_insurance_function": False,
        "dora_relevant": False,
        "is_significant_vendor": False,
        "has_alternative_providers": True,
        "status": "active",
    }
    payload.update(overrides or {})
    vendor = Vendor(**payload)
    db.add(vendor)
    await db.commit()
    await db.refresh(vendor)
    return vendor


async def create_test_control(
    db: AsyncSession,
    *,
    department_id: int,
    owner_id: int | None,
    name: str = "Test Control",
    overrides: Mapping[str, Any] | None = None,
) -> Control:
    payload: dict[str, Any] = {
        "name": name,
        "description": "Control for testing",
        "department_id": department_id,
        "control_owner_id": owner_id,
        "status": "active",
    }
    payload.update(overrides or {})
    control = Control(**payload)
    db.add(control)
    await db.commit()
    await db.refresh(control)
    return control
