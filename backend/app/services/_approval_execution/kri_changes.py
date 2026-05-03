from __future__ import annotations

from app.models import KeyRiskIndicator
from app.services._kri_history.governance import (
    KRIValueMutationSnapshot,
    build_kri_value_mutation_changes,
)


def build_kri_changes(
    kri: KeyRiskIndicator,
    old_current_value,
    old_last_period_end,
    old_last_reported_at,
) -> dict[str, dict[str, object]]:
    snapshot = KRIValueMutationSnapshot(
        current_value=old_current_value,
        last_period_end=old_last_period_end,
        last_reported_at=old_last_reported_at,
    )
    return build_kri_value_mutation_changes(kri, snapshot)
