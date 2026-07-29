"""Immutable governed-mutation proposals and active impacted-resource locks."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, event, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.datetime_utils import utc_now
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.approval_request import ApprovalRequest
    from app.models.user import User


def _json_column() -> Any:
    return JSON().with_variant(JSONB(), "postgresql")


class GovernedMutationProposal(Base):
    """Insert-only proposal snapshot linked one-to-one with an approval envelope."""

    __tablename__ = "governed_mutation_proposals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    proposal_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    proposal_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    approval_request_id: Mapped[int] = mapped_column(
        ForeignKey("approval_requests.id", ondelete="RESTRICT"), nullable=False, unique=True
    )
    mutation_kind: Mapped[str] = mapped_column(String(50), nullable=False)
    primary_resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # Pending creations intentionally have no operational resource identity.
    # The approval ID/proposal ID identify the pending request; this column
    # remains NULL because the Process row does not exist before approval.
    primary_resource_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    primary_resource_name: Mapped[str] = mapped_column(String(255), nullable=False)
    scenario_snapshot: Mapped[dict[str, Any]] = mapped_column(_json_column(), nullable=False)
    base_versions: Mapped[dict[str, Any]] = mapped_column(_json_column(), nullable=False)
    before_snapshot: Mapped[dict[str, Any]] = mapped_column(_json_column(), nullable=False)
    after_snapshot: Mapped[dict[str, Any]] = mapped_column(_json_column(), nullable=False)
    derived_impact_snapshot: Mapped[dict[str, Any]] = mapped_column(_json_column(), nullable=False)
    proposed_changes: Mapped[dict[str, Any]] = mapped_column(_json_column(), nullable=False)
    impacted_resources_snapshot: Mapped[list[dict[str, Any]]] = mapped_column(_json_column(), nullable=False)
    requested_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    approval_request: Mapped["ApprovalRequest"] = relationship(
        "ApprovalRequest", back_populates="governed_mutation_proposal"
    )
    requested_by: Mapped["User"] = relationship("User", foreign_keys=[requested_by_id], lazy="selectin")
    impact_locks: Mapped[list["GovernedMutationImpactLock"]] = relationship(
        "GovernedMutationImpactLock",
        back_populates="proposal",
        lazy="selectin",
        passive_deletes="all",
    )

    __table_args__ = (
        CheckConstraint(
            "(primary_resource_id IS NULL AND ((primary_resource_type = 'process' "
            "AND mutation_kind = 'process.create') OR (primary_resource_type = 'asset' "
            "AND mutation_kind = 'asset.create'))) OR "
            "(primary_resource_id IS NOT NULL AND NOT "
            "((primary_resource_type = 'process' AND mutation_kind = 'process.create') OR "
            "(primary_resource_type = 'asset' AND mutation_kind = 'asset.create')))",
            name="ck_governed_mutation_process_create_resource_identity",
        ),
        Index("ux_governed_mutation_proposal_version", "proposal_id", "proposal_version", unique=True),
    )


class GovernedMutationImpactLock(Base):
    """One proposal's active lock on an impacted operational resource."""

    __tablename__ = "governed_mutation_impact_locks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    proposal_id: Mapped[int] = mapped_column(
        ForeignKey("governed_mutation_proposals.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[int] = mapped_column(Integer, nullable=False)
    base_governance_version: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    release_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    proposal: Mapped[GovernedMutationProposal] = relationship("GovernedMutationProposal", back_populates="impact_locks")

    __table_args__ = (
        Index("ix_governed_mutation_impact_resource", "resource_type", "resource_id"),
        Index(
            "ux_governed_mutation_active_impact",
            "resource_type",
            "resource_id",
            unique=True,
            sqlite_where=text("released_at IS NULL"),
            postgresql_where=text("released_at IS NULL"),
        ),
    )


def _reject_proposal_mutation(*_args: object, **_kwargs: object) -> None:
    """Keep persisted proposal evidence insert-only through the ORM."""
    raise ValueError("Governed mutation proposals are immutable after insertion")


event.listen(GovernedMutationProposal, "before_update", _reject_proposal_mutation)
event.listen(GovernedMutationProposal, "before_delete", _reject_proposal_mutation)
