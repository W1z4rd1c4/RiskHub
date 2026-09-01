from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.core.permissions import get_user_department_ids
from app.core.snapshot_service import SNAPSHOT_METRIC_DEFINITION_IDS, get_quarter_label
from app.models import User
from app.models.quarterly_metric_snapshot import SnapshotType
from app.services._quarterly_comparison.changes import SuppressionReason, calculate_changes
from app.services._quarterly_comparison.period_metrics import get_quarter_period_metrics
from app.services._quarterly_comparison.periods import calculate_quarter_boundaries, validate_quarter_selection
from app.services._quarterly_comparison.snapshots import (
    resolve_snapshot_department_id,
    resolve_snapshot_metrics,
)

PERIOD_METRICS = [
    "new_risks",
    "archived_risks",
    "audit_activity",
    "failed_audits",
    "unaudited_controls",
    "activity_volume",
]

SNAPSHOT_METRICS = list(SNAPSHOT_METRIC_DEFINITION_IDS)


@dataclass(frozen=True)
class SnapshotSourceDecision:
    current: str
    compare: str


@dataclass(frozen=True)
class QuarterMetricComposition:
    this_quarter: dict
    last_quarter: dict
    changes: dict
    period: dict
    snapshot_info: dict
    metric_observations: dict

    def as_response(self) -> dict:
        return {
            "this_quarter": self.this_quarter,
            "last_quarter": self.last_quarter,
            "changes": self.changes,
            "period": self.period,
            "snapshot_info": self.snapshot_info,
            "metric_observations": self.metric_observations,
        }


async def build_quarterly_comparison(
    db: AsyncSession,
    current_user: User,
    current_quarter: Optional[str] = None,
    compare_quarter: Optional[str] = None,
) -> dict:
    now = utc_now()
    dept_ids = get_user_department_ids(current_user)

    (
        current_quarter_start,
        current_quarter_end,
        last_quarter_start,
        last_quarter_end,
    ) = calculate_quarter_boundaries(now, current_quarter, compare_quarter)
    validate_quarter_selection(now, current_quarter_start, last_quarter_start)
    effective_current_quarter_end = min(current_quarter_end, now)

    selected_current_quarter_label = get_quarter_label(current_quarter_start)
    actual_current_quarter_label = get_quarter_label(now)
    is_live_current_quarter = selected_current_quarter_label == actual_current_quarter_label
    effective_last_quarter_end = last_quarter_end
    window_type = "complete_quarters"
    if is_live_current_quarter:
        elapsed = effective_current_quarter_end - current_quarter_start
        effective_last_quarter_end = min(last_quarter_start + elapsed, last_quarter_end)
        window_type = "equal_elapsed"

    this_quarter_period = await get_quarter_period_metrics(
        db, current_quarter_start, effective_current_quarter_end, dept_ids
    )
    last_quarter_period = await get_quarter_period_metrics(
        db, last_quarter_start, effective_last_quarter_end, dept_ids
    )

    last_quarter_label = get_quarter_label(last_quarter_start)

    snapshot_department_id = resolve_snapshot_department_id(dept_ids)

    (
        current_snapshot,
        current_snapshot_source,
        current_snapshot_observed_at,
        current_snapshot_type,
        current_metric_definitions,
    ) = await resolve_snapshot_metrics(
        db,
        quarter_label=selected_current_quarter_label,
        is_live_current_quarter=is_live_current_quarter,
        dept_ids=dept_ids,
        snapshot_department_id=snapshot_department_id,
    )
    (
        last_quarter_snapshot,
        last_quarter_snapshot_source,
        last_snapshot_observed_at,
        last_snapshot_type,
        last_metric_definitions,
    ) = await resolve_snapshot_metrics(
        db,
        quarter_label=last_quarter_label,
        is_live_current_quarter=False,
        dept_ids=dept_ids,
        snapshot_department_id=snapshot_department_id,
    )

    this_quarter_combined = {**this_quarter_period, **current_snapshot}
    last_quarter_combined = {**last_quarter_period, **last_quarter_snapshot}

    missing_snapshot_quarters = []
    if current_snapshot_source == "missing":
        missing_snapshot_quarters.append(selected_current_quarter_label)
    if last_quarter_snapshot_source == "missing":
        missing_snapshot_quarters.append(last_quarter_label)

    missing_current_snapshot_metrics = {metric for metric in SNAPSHOT_METRICS if metric not in current_snapshot}
    missing_compare_snapshot_metrics = {metric for metric in SNAPSHOT_METRICS if metric not in last_quarter_snapshot}
    suppressed_metrics: dict[str, SuppressionReason] = {}
    if window_type == "equal_elapsed" and (
        effective_current_quarter_end - current_quarter_start
        != effective_last_quarter_end - last_quarter_start
    ):
        suppressed_metrics.update({metric: "unequal_window" for metric in PERIOD_METRICS})
    for metric in SNAPSHOT_METRICS:
        if metric in missing_current_snapshot_metrics or metric in missing_compare_snapshot_metrics:
            suppressed_metrics[metric] = "missing_observation"
        elif current_snapshot_source != last_quarter_snapshot_source:
            suppressed_metrics[metric] = "incomparable_source"
        elif current_snapshot_source == "stored":
            if current_snapshot_type != last_snapshot_type:
                suppressed_metrics[metric] = "incomparable_source"
            elif current_snapshot_type == SnapshotType.MANUAL:
                if current_snapshot_observed_at is None or last_snapshot_observed_at is None:
                    suppressed_metrics[metric] = "missing_observation"
                elif not (
                    current_snapshot_observed_at == current_quarter_end
                    and last_snapshot_observed_at == last_quarter_end
                ) and (
                    current_snapshot_observed_at - current_quarter_start
                    != last_snapshot_observed_at - last_quarter_start
                ):
                    suppressed_metrics[metric] = "unequal_window"
        if metric not in suppressed_metrics:
            current_definition = current_metric_definitions.get(metric)
            compare_definition = last_metric_definitions.get(metric)
            if not current_definition or not compare_definition:
                suppressed_metrics[metric] = "missing_definition"
            elif current_definition != compare_definition:
                suppressed_metrics[metric] = "different_definition"

    changes = calculate_changes(this_quarter_combined, last_quarter_combined, suppressed_metrics)

    flow_observation = {
        "metric_type": "flow",
        "current": {
            "source": "live",
            "start": current_quarter_start.isoformat(),
            "end": effective_current_quarter_end.isoformat(),
        },
        "compare": {
            "source": "live",
            "start": last_quarter_start.isoformat(),
            "end": effective_last_quarter_end.isoformat(),
        },
    }
    def snapshot_observation(
        metric: str,
        metrics: dict,
        source: str,
        observed_at: datetime | None,
        definitions: dict[str, str],
    ) -> dict:
        if metric not in metrics:
            return {"source": "missing", "observed_at": None}
        observation = {
            "source": source,
            "observed_at": (
                now.isoformat()
                if source == "live"
                else observed_at.isoformat()
                if observed_at is not None
                else None
            ),
        }
        if metric in definitions:
            observation["definition_id"] = definitions[metric]
        return observation

    metric_observations = {
        **{metric: flow_observation for metric in PERIOD_METRICS},
        **{
            metric: {
                "metric_type": "stock",
                "current": snapshot_observation(
                    metric,
                    current_snapshot,
                    current_snapshot_source,
                    current_snapshot_observed_at,
                    current_metric_definitions,
                ),
                "compare": snapshot_observation(
                    metric,
                    last_quarter_snapshot,
                    last_quarter_snapshot_source,
                    last_snapshot_observed_at,
                    last_metric_definitions,
                ),
            }
            for metric in SNAPSHOT_METRICS
        },
    }

    composition = QuarterMetricComposition(
        this_quarter=this_quarter_combined,
        last_quarter=last_quarter_combined,
        changes=changes,
        period={
            "this_start": current_quarter_start.isoformat(),
            "this_end": effective_current_quarter_end.isoformat(),
            "last_start": last_quarter_start.isoformat(),
            "last_end": effective_last_quarter_end.isoformat(),
            "window_type": window_type,
        },
        snapshot_info={
            "current_quarter": selected_current_quarter_label,
            "last_quarter": last_quarter_label,
            "last_quarter_snapshot_available": last_quarter_snapshot_source != "missing",
            "current_quarter_snapshot_available": current_snapshot_source != "missing",
            "missing_snapshot_quarters": missing_snapshot_quarters,
            "snapshot_sources": SnapshotSourceDecision(
                current=current_snapshot_source,
                compare=last_quarter_snapshot_source,
            ).__dict__,
            "missing_snapshot_metrics": {
                "current": sorted(missing_current_snapshot_metrics),
                "compare": sorted(missing_compare_snapshot_metrics),
            },
            "period_metrics": PERIOD_METRICS,
            "snapshot_metrics": SNAPSHOT_METRICS,
        },
        metric_observations=metric_observations,
    )
    return composition.as_response()
