from app.models.global_config import ConfigDefaults, get_config_int

_NOT_PROVIDED = object()

# Sensitive fields that require approval when changed
SENSITIVE_FIELDS: dict[str, set[str]] = {
    "risk": {"owner_id", "department_id", "category", "is_priority"},
    "control": {"control_owner_id", "department_id"},
    "kri": set(),  # KRIs inherit sensitivity from linked risk
}


def is_high_risk_for_approval(risk) -> bool:
    """
    Check if a risk meets the approval gating threshold.

    A risk requires approval for linked item edits if:
    - is_priority = True, OR
    - net_score >= high_risk_min_net_score threshold (default: 10)

    Note: Uses ConfigDefaults for sync contexts. For dynamic config,
    use is_high_risk_for_approval_async() with a db session.

    This is the correct name for the threshold check - it uses
    HIGH_RISK_MIN_NET_SCORE, not CRITICAL_RISK_MIN_NET_SCORE.
    """
    if risk.is_priority:
        return True
    threshold = ConfigDefaults.HIGH_RISK_MIN_NET_SCORE
    return risk.net_score >= threshold


async def is_high_risk_for_approval_async(risk, db) -> bool:
    """
    Async version that fetches threshold from global_config.

    Use this in async contexts where you have a db session and
    want to respect CRO-configured thresholds.

    This is the correct name for the threshold check - it uses
    high_risk_min_net_score from config, not critical_risk_min_net_score.
    """
    if risk.is_priority:
        return True
    threshold = await get_config_int(db, "high_risk_min_net_score", ConfigDefaults.HIGH_RISK_MIN_NET_SCORE)
    return risk.net_score >= threshold


def _is_priority_downgrade(old_val: object, new_val: object) -> bool:
    """
    Check if is_priority is being downgraded (True → False).

    Only true→false requires approval because it's a risk downgrade.
    Upgrades (false→true) are allowed without approval.
    """
    return old_val is True and new_val is False


def has_sensitive_field_changes(
    resource_type: str, old_data: dict[str, object], new_data: dict[str, object]
) -> tuple[bool, dict[str, dict[str, object]]]:
    """
    Check if any sensitive fields are being changed, including clearing to None.

    Args:
        resource_type: "risk", "control", or "kri"
        old_data: Current field values
        new_data: Proposed new field values (from update request)

    Returns:
        Tuple of (has_sensitive_changes, changed_fields_dict)
        changed_fields_dict format: {"field_name": {"old": value, "new": value}}

    Note:
        Uses _NOT_PROVIDED sentinel to distinguish between:
        - Field not in payload → no change
        - Field explicitly set to None → counts as a change (clearing)
    """
    sensitive = SENSITIVE_FIELDS.get(resource_type, set())
    changed: dict[str, dict[str, object]] = {}

    for field in sensitive:
        new_val = new_data.get(field, _NOT_PROVIDED)
        if new_val is _NOT_PROVIDED:  # Field not in update payload - no change
            continue

        old_val = old_data.get(field)
        if old_val == new_val:  # No actual change
            continue

        # is_priority: only true→false requires approval (downgrade)
        if field == "is_priority":
            if _is_priority_downgrade(old_val, new_val):
                changed[field] = {"old": old_val, "new": new_val}
            # false→true or any other transition is allowed without approval
            continue

        # All other sensitive fields: ANY change requires approval
        # Including owner_id: 5→None (clearing owner)
        changed[field] = {"old": old_val, "new": new_val}

    return bool(changed), changed
