"""Generalized immutable proposal workflow for protected business mutations."""

from __future__ import annotations

from typing import Any

__all__ = [
    "approve_governed_mutation",
    "assert_no_pending_process_mutation",
    "cancel_governed_mutation",
    "governed_proposal_dispatch_kind",
    "is_governed_approval",
    "reject_governed_mutation",
    "submit_process_mutation_if_required",
]


def __getattr__(name: str) -> Any:
    if name in {
        "assert_no_pending_process_mutation",
        "submit_process_mutation_if_required",
    }:
        from . import process_updates

        return getattr(process_updates, name)
    if name in {
        "approve_governed_mutation",
        "cancel_governed_mutation",
        "governed_proposal_dispatch_kind",
        "is_governed_approval",
        "reject_governed_mutation",
    }:
        from . import resolution

        return getattr(resolution, name)
    raise AttributeError(name)
