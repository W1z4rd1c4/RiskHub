"""
Key Risk Indicator (KRI) model for risk appetite monitoring.
Each KRI must be linked to a Risk.
"""
from enum import Enum as PyEnum
from datetime import datetime, date
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Float, ForeignKey, DateTime, Date, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.risk import Risk
    from app.models.user import User
    from app.models.kri_history import KRIValueHistory


class KRIFrequency(str, PyEnum):
    """Frequency of KRI value reporting."""
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    quarterly = "quarterly"
    annually = "annually"


class KeyRiskIndicator(Base):
    """
    Key Risk Indicator linked to a Risk.
    
    Tracks a specific metric with tolerance limits.
    Breach status is computed based on current_value vs limits.
    Supports historization with reporting frequency and ownership.
    """
    __tablename__ = "key_risk_indicators"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    
    # Required FK - each KRI must belong to a Risk
    risk_id: Mapped[int] = mapped_column(ForeignKey("risks.id"), index=True)
    
    # Core KRI fields
    metric_name: Mapped[str] = mapped_column(String(500))
    current_value: Mapped[float] = mapped_column(Float)
    lower_limit: Mapped[float] = mapped_column(Float)
    upper_limit: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(50), default="%")
    
    # Reporting frequency (how often this KRI should be updated)
    frequency: Mapped[str] = mapped_column(String(20), default=KRIFrequency.quarterly.value)
    
    # Reporting owner - who is responsible for updating this KRI
    # If null, responsibility falls back to the linked Risk owner (handled in service layer)
    reporting_owner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    
    # Period tracking for historization
    last_period_end: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    last_reported_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    
    # Timestamps
    last_updated: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    
    # Relationships
    risk: Mapped["Risk"] = relationship("Risk", back_populates="kris")
    reporting_owner: Mapped[Optional["User"]] = relationship("User")
    history_entries: Mapped[list["KRIValueHistory"]] = relationship(
        "KRIValueHistory", 
        back_populates="kri", 
        cascade="all, delete-orphan",
        order_by="desc(KRIValueHistory.recorded_at)"
    )
    
    @property
    def breach_status(self) -> str:
        """Compute breach status based on value vs limits."""
        if self.current_value < self.lower_limit:
            return "below"
        elif self.current_value > self.upper_limit:
            return "above"
        return "within"
