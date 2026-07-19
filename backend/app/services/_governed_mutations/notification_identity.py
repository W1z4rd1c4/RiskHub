"""Strict shared identity for governed Process notification delivery."""

from __future__ import annotations

from dataclasses import dataclass

from app.models import GovernedMutationProposal

from .process_identity import InvalidGovernedProcessIdentity, strict_governed_process_identity


class InvalidGovernedProcessNotificationIdentity(ValueError):
    """Stored Process proposal cannot be trusted for notification delivery."""


@dataclass(frozen=True, slots=True)
class GovernedProcessNotificationIdentity:
    requested_by_id: int
    approver_roles: tuple[str, ...]
    mutation_kind: str
    primary_resource_name: str


def strict_governed_process_notification_identity(
    proposal: GovernedMutationProposal | None,
) -> GovernedProcessNotificationIdentity | None:
    """Normalize every supported governed Process kind through its strict parser."""
    if proposal is None:
        return None
    # Keep outbox startup acyclic: process_mutations depends on approval_helpers,
    # which imports the outbox registry that imports notification handlers.
    from .process_mutations import is_extended_process_kind, strict_extended_process_identity

    try:
        identity = (
            strict_extended_process_identity(proposal)
            if is_extended_process_kind(proposal.mutation_kind)
            else strict_governed_process_identity(proposal)
        )
    except (InvalidGovernedProcessIdentity, ValueError) as exc:
        raise InvalidGovernedProcessNotificationIdentity("Malformed governed Process notification identity") from exc
    if identity is None:
        return None
    return GovernedProcessNotificationIdentity(
        requested_by_id=identity.requested_by_id,
        approver_roles=tuple(identity.approver_roles),
        mutation_kind=identity.mutation_kind,
        primary_resource_name=identity.primary_resource_name,
    )


__all__ = [
    "GovernedProcessNotificationIdentity",
    "InvalidGovernedProcessNotificationIdentity",
    "strict_governed_process_notification_identity",
]
