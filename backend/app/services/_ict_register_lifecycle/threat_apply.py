"""Threat edit state application after stewardship eligibility and lock checks."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

from app.core.datetime_utils import utc_now
from app.models import OrphanedItem, Threat, User


@dataclass(frozen=True, slots=True)
class ThreatOrphanCompletion:
    orphan: OrphanedItem
    resolved_by_id: int


def apply_threat_edit(
    *,
    threat: Threat,
    updates: Mapping[str, object],
    steward: User | None = None,
    orphan_completion: ThreatOrphanCompletion | None = None,
    version_rule: Literal["always", "steward_changed"] = "always",
) -> None:
    """Accepted edits advance once; direct orphan repair advances on steward change."""
    if version_rule not in {"always", "steward_changed"}:
        raise ValueError("Unsupported Threat edit version rule")
    previous_steward_id = threat.threat_steward_user_id
    for field, value in updates.items():
        setattr(threat, field, value)
    if steward is not None:
        threat.threat_steward = steward
    if version_rule == "always" or previous_steward_id != threat.threat_steward_user_id:
        threat.governance_version += 1
    if orphan_completion is not None:
        orphan = orphan_completion.orphan
        orphan.status = "resolved"
        orphan.resolved_at = utc_now()
        orphan.resolved_by_id = orphan_completion.resolved_by_id
        orphan.new_owner_id = threat.threat_steward_user_id


__all__ = ["ThreatOrphanCompletion", "apply_threat_edit"]
