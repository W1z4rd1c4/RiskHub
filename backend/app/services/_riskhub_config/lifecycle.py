from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from app.models.activity_log import ActivityAction, ActivityEntityType


@dataclass(frozen=True)
class ConfigEntityDefinition:
    entity_name: str
    activity_entity_type: ActivityEntityType


@dataclass(frozen=True)
class ConfigAuditPlan:
    action: ActivityAction
    entity_type: ActivityEntityType
    entity_id: int
    entity_name: str
    safe_entity_label: str
    description: str
    changes: dict[str, dict[str, object]] | None = None
    safe_description: str | None = None
    safe_description_siem: str | None = None

    def as_log_kwargs(self) -> dict[str, Any]:
        kwargs: dict[str, Any] = {
            "action": self.action,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "entity_name": self.entity_name,
            "safe_entity_label": self.safe_entity_label,
            "description": self.description,
        }
        if self.changes is not None:
            kwargs["changes"] = self.changes
        if self.safe_description is not None:
            kwargs["safe_description"] = self.safe_description
        if self.safe_description_siem is not None:
            kwargs["safe_description_siem"] = self.safe_description_siem
        return kwargs


@dataclass(frozen=True)
class ConfigLifecycleOutcome:
    status: Literal["created", "updated", "deleted", "restored", "blocked"]
    entity: object | None = None
    audit_plan: ConfigAuditPlan | None = None
    response_payload: dict[str, object] | None = None


def build_config_audit_plan(
    *,
    action: ActivityAction,
    entity_type: ActivityEntityType,
    entity_id: int,
    entity_name: str,
    safe_entity_label: str,
    description: str,
    changes: dict[str, dict[str, object]] | None = None,
    safe_description: str | None = None,
    safe_description_siem: str | None = None,
) -> ConfigAuditPlan:
    return ConfigAuditPlan(
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_name=entity_name,
        safe_entity_label=safe_entity_label,
        description=description,
        changes=changes,
        safe_description=safe_description,
        safe_description_siem=safe_description_siem,
    )
