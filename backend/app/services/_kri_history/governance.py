from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Protocol


class KRIValueMutationTarget(Protocol):
    current_value: float | None
    last_period_end: date | None
    last_reported_at: datetime | None


@dataclass(frozen=True)
class KRIValueMutationSnapshot:
    current_value: float | None
    last_period_end: date | None
    last_reported_at: datetime | None


def capture_kri_value_mutation_snapshot(kri: KRIValueMutationTarget) -> KRIValueMutationSnapshot:
    return KRIValueMutationSnapshot(
        current_value=kri.current_value,
        last_period_end=kri.last_period_end,
        last_reported_at=kri.last_reported_at,
    )


def build_kri_value_mutation_changes(
    kri: KRIValueMutationTarget,
    snapshot: KRIValueMutationSnapshot,
) -> dict[str, dict[str, object]]:
    changes: dict[str, dict[str, object]] = {}
    if snapshot.current_value != kri.current_value:
        changes["current_value"] = {"old": snapshot.current_value, "new": kri.current_value}
    if snapshot.last_period_end != kri.last_period_end:
        changes["last_period_end"] = {"old": snapshot.last_period_end, "new": kri.last_period_end}
    if snapshot.last_reported_at != kri.last_reported_at:
        changes["last_reported_at"] = {"old": snapshot.last_reported_at, "new": kri.last_reported_at}
    return changes


def build_kri_value_history_activity_changes(
    *,
    old_value: object,
    new_value: object,
    period_end: date,
) -> dict[str, dict[str, object]]:
    return {
        "value": {"old": old_value, "new": new_value},
        "period_end": {"old": None, "new": period_end.isoformat()},
    }


def describe_kri_limit_breach(
    *,
    value: float,
    lower_limit: float,
    upper_limit: float,
) -> str | None:
    if value < lower_limit:
        return f"Value {value} is below lower limit {lower_limit}"
    if value > upper_limit:
        return f"Value {value} exceeds upper limit {upper_limit}"
    return None
