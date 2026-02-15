from datetime import datetime
from enum import Enum as PyEnum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.control_execution import ControlExecution
    from app.models.department import Department
    from app.models.risk import ControlRiskLink
    from app.models.user import User


class ControlForm(str, PyEnum):
    """Form of control execution."""

    manual = "manual"
    automatic = "automatic"


class ControlFrequency(str, PyEnum):
    """Frequency of control execution."""

    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    quarterly = "quarterly"
    semi_annually = "semi-annually"
    annually = "annually"
    ad_hoc = "ad_hoc"
    continuous = "continuous"


class ControlStatus(str, PyEnum):
    """Status of the control."""

    draft = "draft"
    active = "active"
    inactive = "inactive"
    archived = "archived"


class Control(Base):
    """
    Control model implementing 13-point structure from DEFINICIA KONTROL.

    Represents a control in the risk management catalog with all required
    attributes for compliance and audit purposes.
    """

    __tablename__ = "controls"

    # Primary key
    id: Mapped[int] = mapped_column(primary_key=True)

    # 1. Názov kontroly (Control name)
    name: Mapped[str] = mapped_column(String(255), index=True)

    # 2. Stručný popis kontroly (Brief description)
    description: Mapped[str] = mapped_column(Text)

    # 3. Zdroj dát/vstup (Data source/input)
    data_source: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # 4. Smernica/Metodický postup/Príkaz GR (Methodology reference)
    methodology_reference: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # 5. Forma kontroly: manuálna/automatická (Control form)
    control_form: Mapped[str] = mapped_column(String(20), default=ControlForm.manual.value)

    # 6. Pozícia zodpovedná za daný process (Process owner position)
    process_owner_position: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # 7. Pozícia zodpovedná za danú kontrolu (Control owner - FK to users)
    control_owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    control_owner: Mapped["User"] = relationship(
        "User", foreign_keys=[control_owner_id], back_populates="owned_controls"
    )

    # 8. Kto vykonáva kontrolu (Executor position)
    executor_position: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # 9. Frekvencia kontrol (Control frequency)
    frequency: Mapped[str] = mapped_column(String(20), default=ControlFrequency.monthly.value)

    # 10. Významnosť kontroly/riziko 1 až 5 (Risk level, 5 is maximum)
    risk_level: Mapped[int] = mapped_column(Integer, default=3)

    # 11. Čo je výstupom kontroly (Output description)
    output_description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 12. Komu sa výsledok kontroly reportuje (Report recipient)
    report_recipient: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # 13. Kam sa ukladá/dokumentuje vykonanie kontroly (Documentation location)
    documentation_location: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Additional: Department that owns this control catalog entry
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True, index=True)
    department: Mapped["Department"] = relationship("Department", back_populates="controls")

    # Status
    status: Mapped[str] = mapped_column(String(20), default=ControlStatus.draft.value, index=True)

    # Audit fields
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_by: Mapped["User"] = relationship("User", foreign_keys=[created_by_id])

    updated_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_by: Mapped["User"] = relationship("User", foreign_keys=[updated_by_id])

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    executions: Mapped[list["ControlExecution"]] = relationship("ControlExecution", back_populates="control")
    risk_links: Mapped[list["ControlRiskLink"]] = relationship("ControlRiskLink", back_populates="control")
