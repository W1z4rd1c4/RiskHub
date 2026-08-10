"""Strict shared identity for governed mutation notification delivery."""

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
    """Normalize every supported governed kind through its strict parser.

    The historical function name is retained because notification callers use it
    as their shared compatibility seam. Asset proposals are admitted only after
    their immutable envelope has passed the Asset-specific fail-closed validator.
    """
    if proposal is None:
        return None
    # Keep outbox startup acyclic: mutation intake depends on approval_helpers,
    # which imports the outbox registry that imports notification handlers.
    from .asset_mutations import is_asset_governed_kind, valid_asset_governed_envelope
    from .process_mutations import is_extended_process_kind, strict_extended_process_identity
    from .threat_identity import THREAT_EDIT_KIND, strict_threat_mutation_kind
    from .vendor_identity import (
        is_vendor_governed_kind,
        strict_vendor_mutation_kind,
    )

    if proposal.mutation_kind == THREAT_EDIT_KIND:
        if strict_threat_mutation_kind(proposal) is None:
            raise InvalidGovernedProcessNotificationIdentity(
                "Malformed governed Threat notification identity"
            )
        scenario = proposal.scenario_snapshot
        return GovernedProcessNotificationIdentity(
            requested_by_id=proposal.requested_by_id,
            approver_roles=tuple(scenario["approver_roles"]),
            mutation_kind=proposal.mutation_kind,
            primary_resource_name=proposal.primary_resource_name,
        )

    if is_asset_governed_kind(proposal.mutation_kind):
        if not valid_asset_governed_envelope(proposal):
            raise InvalidGovernedProcessNotificationIdentity("Malformed governed Asset notification identity")
        scenario = proposal.scenario_snapshot
        return GovernedProcessNotificationIdentity(
            requested_by_id=proposal.requested_by_id,
            approver_roles=tuple(scenario["approver_roles"]),
            mutation_kind=proposal.mutation_kind,
            primary_resource_name=proposal.primary_resource_name,
        )

    if is_vendor_governed_kind(proposal.mutation_kind):
        if strict_vendor_mutation_kind(proposal) is None:
            raise InvalidGovernedProcessNotificationIdentity(
                "Malformed governed Vendor notification identity"
            )
        scenario = proposal.scenario_snapshot
        return GovernedProcessNotificationIdentity(
            requested_by_id=proposal.requested_by_id,
            approver_roles=tuple(scenario["approver_roles"]),
            mutation_kind=proposal.mutation_kind,
            primary_resource_name=proposal.primary_resource_name,
        )

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
