"""Vendor state application after the caller's authorization and lock checks."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

from app.core.datetime_utils import utc_now
from app.models import OrphanedItem, User, Vendor


@dataclass(frozen=True, slots=True)
class VendorOrphanCompletion:
    """Already-validated and locked ownership evidence to complete with an edit."""

    orphan: OrphanedItem
    resolved_by_id: int


def apply_vendor_edit(
    *,
    vendor: Vendor,
    updates: Mapping[str, object],
    outsourcing_owner: User | None = None,
    orphan_completion: VendorOrphanCompletion | None = None,
    version_rule: Literal["always", "owner_changed"] = "always",
) -> None:
    """Apply validated state without auditing, flushing, or completing a transaction.

    Accepted edits advance the version once, including approved replay. Direct
    lifecycle callers filter no-ops before invoking this method. Direct orphan
    resolution uses ``owner_changed`` and completes its evidence even when the
    owner is unchanged; approved orphan edits retain the ordinary edit rule.
    """
    if version_rule not in {"always", "owner_changed"}:
        raise ValueError("Unsupported Vendor edit version rule")
    previous_owner_id = vendor.outsourcing_owner_user_id
    for field, value in updates.items():
        setattr(vendor, field, value.value if hasattr(value, "value") else value)
    if outsourcing_owner is not None:
        vendor.outsourcing_owner = outsourcing_owner
    if version_rule == "always" or previous_owner_id != vendor.outsourcing_owner_user_id:
        vendor.governance_version += 1
    if orphan_completion is not None:
        orphan = orphan_completion.orphan
        orphan.status = "resolved"
        orphan.resolved_at = utc_now()
        orphan.resolved_by_id = orphan_completion.resolved_by_id
        orphan.new_owner_id = vendor.outsourcing_owner_user_id
