"""Canonical policy snapshots for mutations protected by multiple scenarios."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from app.core.exceptions import ConflictError

ALLOWED_APPROVER_ROLES = frozenset({"risk_manager", "cro"})
POLICY_INVARIANTS = {"independent": True, "allow_self_approval": False}


def triggered_policy_snapshot(key: str, roles: Sequence[str]) -> dict[str, Any]:
    """Persist the complete policy input used to calculate effective authority."""
    return {
        "key": key,
        "enabled": True,
        "policy_version": 1,
        "configured_roles": list(roles),
        "invariants": dict(POLICY_INVARIANTS),
    }


def effective_triggered_policy_roles(policies: Sequence[dict[str, Any]]) -> list[str]:
    """Return the ordered role intersection, failing closed when it is empty."""
    if not policies:
        return []
    role_lists = [policy["configured_roles"] for policy in policies]
    effective = [role for role in role_lists[0] if all(role in roles for roles in role_lists[1:])]
    if not effective:
        raise ConflictError(
            "No role is authorized by every triggered approval policy",
            code="governed_mutation_approver_missing",
        )
    return effective


def strict_triggered_policy_snapshots(
    value: object,
    *,
    scenario_keys: Sequence[str],
    effective_roles: Sequence[str],
) -> tuple[dict[str, Any], ...]:
    """Totally validate stored policy inputs and their effective intersection."""
    if not isinstance(value, list) or len(value) != len(scenario_keys):
        raise ValueError("Malformed governed mutation policy snapshots")
    snapshots: list[dict[str, Any]] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict) or set(item) != {
            "key",
            "enabled",
            "policy_version",
            "configured_roles",
            "invariants",
        }:
            raise ValueError("Malformed governed mutation policy snapshot")
        roles = item.get("configured_roles")
        invariants = item.get("invariants")
        if not (
            item.get("key") == scenario_keys[index]
            and item.get("enabled") is True
            and item.get("policy_version") == 1
            and isinstance(roles, list)
            and roles
            and all(isinstance(role, str) for role in roles)
            and len(roles) == len(set(roles))
            and set(roles).issubset(ALLOWED_APPROVER_ROLES)
            and isinstance(invariants, dict)
            and invariants == POLICY_INVARIANTS
        ):
            raise ValueError("Malformed governed mutation policy snapshot")
        snapshots.append(dict(item))
    calculated = [
        role
        for role in snapshots[0]["configured_roles"]
        if all(role in snapshot["configured_roles"] for snapshot in snapshots[1:])
    ]
    if list(effective_roles) != calculated or not calculated:
        raise ValueError("Malformed governed mutation effective policy roles")
    return tuple(snapshots)


def live_visibility_policy_roles(enabled: bool, roles: object) -> tuple[str, ...] | None:
    """Normalize a fixed live policy for read visibility, failing closed."""
    if not (
        enabled
        and isinstance(roles, list)
        and roles
        and all(isinstance(role, str) for role in roles)
        and len(roles) == len(set(roles))
        and set(roles).issubset(ALLOWED_APPROVER_ROLES)
    ):
        return None
    return tuple(roles)


def role_visible_in_snapshot(
    role_name: str | None,
    snapshot_roles: Sequence[str],
    *,
    live_policy_roles: Sequence[Sequence[str] | None] | None = None,
) -> bool:
    """One current-role/snapshot rule; adapters retain family authority.

    Callers first validate immutable proposal identity. Process intentionally
    omits live-policy filtering so existing resolvers can discover stale work.
    Fixed Asset/Vendor/Threat adapters supply every actual triggering policy.
    This read predicate never grants business-mutation or cleanup authority.
    """
    return bool(
        isinstance(role_name, str)
        and role_name
        and not isinstance(snapshot_roles, (str, bytes))
        and snapshot_roles
        and all(isinstance(role, str) for role in snapshot_roles)
        and role_name in snapshot_roles
        and (
            live_policy_roles is None
            or (live_policy_roles and all(roles is not None and role_name in roles for roles in live_policy_roles))
        )
    )
