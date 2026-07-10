from datetime import date, datetime
from enum import Enum as PyEnum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models._archivable import ArchivableMixin

if TYPE_CHECKING:
    from app.models.control import Control
    from app.models.department import Department
    from app.models.key_risk_indicator import KeyRiskIndicator
    from app.models.user import User
    from app.models.vendor_risk_link import VendorRiskLink


class RiskType(str, PyEnum):
    """Type of risk from OS 18."""

    strategic = "strategic"  # S
    operational = "operational"  # O


class RiskStatus(str, PyEnum):
    """Status of the risk.

    - active: Current identified risks under management (shown in dashboards)
    - emerging: Market/country risks being monitored (excluded from dashboards)
    """

    active = "active"
    emerging = "emerging"


class ControlEffectiveness(str, PyEnum):
    """How effectively a control mitigates a risk."""

    high = "high"
    medium = "medium"
    low = "low"


class Risk(ArchivableMixin, Base):
    """
    Risk model based on OS 18 Řízení rizik - Registr rizik structure.

    Represents a risk in the risk register with gross/net scoring,
    KRI indicators, and linkage to controls that mitigate it.
    """

    __tablename__ = "risks"

    # Primary key
    id: Mapped[int] = mapped_column(primary_key=True)

    # Risk ID code (e.g., "Mkt-R01", "UP_NZ_CAT_07_01")
    risk_id_code: Mapped[str] = mapped_column(String(50), unique=True, index=True)

    # Risk name (mandatory, human-readable identifier)
    name: Mapped[str] = mapped_column(String(255), index=True)

    # Main process (e.g., "Marketing", "Vývoj produktů")
    process: Mapped[str] = mapped_column(String(255), index=True)

    # Subprocess/area
    subprocess: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Risk type: strategic (S) or operational (O) from OS 18
    risk_type: Mapped[str] = mapped_column(String(20), default=RiskType.operational.value, index=True)

    # Risk category (Operační riziko, Upisovací riziko, etc.)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)

    # Risk description
    description: Mapped[str] = mapped_column(Text)

    # Owner department
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True, index=True)
    department: Mapped["Department"] = relationship("Department", back_populates="risks")

    # Risk owner/responsible person
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    owner: Mapped["User"] = relationship("User", foreign_keys=[owner_id], back_populates="owned_risks")

    # Gross Risk (before controls) - probability × impact = score
    gross_probability: Mapped[int] = mapped_column(Integer, default=3)  # 1-5
    gross_impact: Mapped[int] = mapped_column(Integer, default=3)  # 1-5
    gross_score: Mapped[int] = mapped_column(Integer, default=9)  # 1-25

    # Net Risk (after controls applied) - probability × impact = score
    net_probability: Mapped[int] = mapped_column(Integer, default=2)  # 1-5
    net_impact: Mapped[int] = mapped_column(Integer, default=2)  # 1-5
    net_score: Mapped[int] = mapped_column(Integer, default=4)  # 1-25

    # Status
    status: Mapped[str] = mapped_column(String(20), default=RiskStatus.active.value, index=True)

    # Whether in Risk Catalog (high priority risks requiring monitoring)
    is_priority: Mapped[bool] = mapped_column(Boolean, default=False)

    # Key Risk Indicator (KRI) fields
    kri_indicator: Mapped[str | None] = mapped_column(String(500), nullable=True)
    kri_threshold_green: Mapped[str | None] = mapped_column(String(255), nullable=True)  # Expected range
    kri_threshold_yellow: Mapped[str | None] = mapped_column(String(255), nullable=True)  # Elevated risk
    kri_threshold_red: Mapped[str | None] = mapped_column(String(255), nullable=True)  # Critical

    # ICT Register acceptance governance (issue #47; workbook 13_Rizika block
    # E·ODEZVA A AKCEPTACE: akc_schval / akc_oduv / akc_datum). Entered fields,
    # always optional at the write boundary — their required-together rule when
    # accepting above tolerance is a DQ finding (#50), never a write block.
    acceptance_approver: Mapped[str | None] = mapped_column(String(255), nullable=True)
    acceptance_justification: Mapped[str | None] = mapped_column(Text, nullable=True)
    acceptance_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    control_links: Mapped[list["ControlRiskLink"]] = relationship("ControlRiskLink", back_populates="risk")
    kris: Mapped[list["KeyRiskIndicator"]] = relationship("KeyRiskIndicator", back_populates="risk")
    vendor_links: Mapped[list["VendorRiskLink"]] = relationship("VendorRiskLink", back_populates="risk")


class ControlRiskLink(Base):
    """
    Junction table for many-to-many relationship between Controls and Risks.

    Tracks which controls mitigate which risks and how effectively.
    """

    __tablename__ = "control_risk_links"
    __table_args__ = (
        UniqueConstraint("control_id", "risk_id", name="ux_control_risk_links_control_risk"),
    )

    # Primary key
    id: Mapped[int] = mapped_column(primary_key=True)

    # Foreign keys
    control_id: Mapped[int] = mapped_column(ForeignKey("controls.id"), index=True)
    risk_id: Mapped[int] = mapped_column(ForeignKey("risks.id"), index=True)

    # How effectively the control mitigates the risk
    effectiveness: Mapped[str] = mapped_column(String(20), default=ControlEffectiveness.medium.value)

    # Notes explaining how the control mitigates the risk
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    control: Mapped["Control"] = relationship("Control", back_populates="risk_links")
    risk: Mapped["Risk"] = relationship("Risk", back_populates="control_links")


class ThreatRiskLink(Base):
    """Threat<->Risk Link relation (issue #47; workbook 13_Rizika id_hrozby).

    One row = the Risk arises from the Threat. The pair is unique; the row
    carries no entered columns of its own (the workbook's threat reference is
    a bare ID lookup). Manageable from BOTH ends — the Threat page under
    threats:write and the Risk detail under risks:write.
    """

    __tablename__ = "threat_risk_links"
    __table_args__ = (UniqueConstraint("threat_id", "risk_id", name="uq_threat_risk_link"),)

    id: Mapped[int] = mapped_column(primary_key=True)

    threat_id: Mapped[int] = mapped_column(
        ForeignKey("threats.id", ondelete="CASCADE"), index=True, nullable=False
    )
    risk_id: Mapped[int] = mapped_column(
        ForeignKey("risks.id", ondelete="CASCADE"), index=True, nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RiskProcessLink(Base):
    """Risk<->Process Link relation (issue #47; workbook 13_Rizika subject Proces).

    One row = the Risk concerns the Process. The pair is unique and the row
    carries no entered columns. Managed from the Risk detail (risks:write);
    readable from the Process end.
    """

    __tablename__ = "risk_process_links"
    __table_args__ = (UniqueConstraint("risk_id", "process_id", name="uq_risk_process_link"),)

    id: Mapped[int] = mapped_column(primary_key=True)

    risk_id: Mapped[int] = mapped_column(
        ForeignKey("risks.id", ondelete="CASCADE"), index=True, nullable=False
    )
    process_id: Mapped[int] = mapped_column(
        ForeignKey("processes.id", ondelete="CASCADE"), index=True, nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RiskAssetLink(Base):
    """Risk<->Asset Link relation (issue #47; workbook 13_Rizika subject Aktivum).

    One row = the Risk concerns the Asset. The pair is unique and the row
    carries no entered columns. Managed from the Risk detail (risks:write);
    readable from the Asset end.
    """

    __tablename__ = "risk_asset_links"
    __table_args__ = (UniqueConstraint("risk_id", "asset_id", name="uq_risk_asset_link"),)

    id: Mapped[int] = mapped_column(primary_key=True)

    risk_id: Mapped[int] = mapped_column(
        ForeignKey("risks.id", ondelete="CASCADE"), index=True, nullable=False
    )
    asset_id: Mapped[int] = mapped_column(
        ForeignKey("assets.id", ondelete="CASCADE"), index=True, nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
