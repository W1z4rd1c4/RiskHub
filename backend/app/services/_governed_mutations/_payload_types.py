"""Typing declarations for governed proposal ``proposed_changes`` payloads.

This module contains typing declarations only — no runtime logic. The shapes
mirror what the resolution and identity modules actually read from
``GovernedMutationProposal.proposed_changes`` (JSON round-tripped, so every
value is plain ``dict``/``list``/scalar data):

- Edit and archive proposals carry ``{"before": {...}, "after": {...}}`` with
  the exclude-unset update dump under ``after`` and the expected pre-image of
  the same keys under ``before`` (optionally ``triggered_scenarios``).
- Creation proposals carry ``{"after": {...}}`` only.
- Relationship proposals carry ``{"operation": {...}}`` (optionally
  ``triggered_scenarios``) whose envelope unions the Asset link keys
  (``relationship_type``/``action``/``before``/``after`` plus
  ``related_resource_id`` for risk links) with the extended Process link keys
  (``kind``, ``process_id``, ``related_resource_name``, ``link_id``,
  ``demoted_process_id``).
"""

from __future__ import annotations

from typing import Any, NotRequired, TypedDict

__all__ = [
    "CreateProposedChanges",
    "EditProposedChanges",
    "RelationshipOperation",
    "RelationshipProposedChanges",
]


class EditProposedChanges(TypedDict):
    """Edit/archive proposal payload: proposed updates plus expected pre-image."""

    before: dict[str, Any]
    after: dict[str, Any]
    triggered_scenarios: NotRequired[list[str]]


class CreateProposedChanges(TypedDict):
    """Creation proposal payload: the validated create dump under ``after``."""

    after: dict[str, Any]
    triggered_scenarios: NotRequired[list[str]]


class RelationshipOperation(TypedDict):
    """Immutable relationship operation envelope for Asset and Process links."""

    relationship_type: str
    action: str
    before: NotRequired[dict[str, Any] | None]
    after: NotRequired[dict[str, Any] | None]
    related_resource_id: NotRequired[int]
    kind: NotRequired[str]
    process_id: NotRequired[int]
    related_resource_name: NotRequired[str | None]
    link_id: NotRequired[int | None]
    demoted_process_id: NotRequired[int | None]


class RelationshipProposedChanges(TypedDict):
    """Relationship proposal payload: one operation envelope per proposal."""

    operation: RelationshipOperation
    triggered_scenarios: NotRequired[list[str]]
