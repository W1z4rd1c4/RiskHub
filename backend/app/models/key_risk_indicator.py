"""
Key Risk Indicator (KRI) model for risk appetite monitoring.
Each KRI must be linked to a Risk.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Float, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class KeyRiskIndicator(Base):
    """
    Key Risk Indicator linked to a Risk.
    
    Tracks a specific metric with tolerance limits.
    Breach status is computed based on current_value vs limits.
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
    
    # Timestamps
    last_updated: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    
    # Relationships
    risk: Mapped["Risk"] = relationship("Risk", back_populates="kris")
    
    @property
    def breach_status(self) -> str:
        """Compute breach status based on value vs limits."""
        if self.current_value < self.lower_limit:
            return "below"
        elif self.current_value > self.upper_limit:
            return "above"
        return "within"


# Import for type hints
from app.models.risk import Risk
