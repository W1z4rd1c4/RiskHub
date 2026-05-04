from __future__ import annotations

from typing import Any

from app.models import Control, Risk


def build_pending_changes(control: Control, update_data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        key: {
            "old": getattr(control, key, None),
            "new": value.value if hasattr(value, "value") else value,
        }
        for key, value in update_data.items()
    }


def build_priority_risk_change_set(risk: Risk, update_data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        key: {"old": getattr(risk, key, None), "new": value}
        for key, value in update_data.items()
        if key in {"is_priority", "priority_reason"}
    }


async def create_risk_edit_approval_if_required(*args: Any, **kwargs: Any) -> Any:
    from . import lifecycle

    return await lifecycle._create_risk_edit_approval_if_required(*args, **kwargs)
