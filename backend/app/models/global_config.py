"""GlobalConfig model for system-wide configuration settings."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.services._config.lookup import (
    ConfigDefaults,
    build_risk_level_ranges,
    clear_config_cache,
    get_config_float,
    get_config_int,
    get_config_value,
    get_risk_thresholds,
    parse_global_config_value,
    serialize_global_config_value,
)

if TYPE_CHECKING:
    from app.models.user import User


class GlobalConfig(Base):
    """
    System-wide configuration settings managed by platform and business admin surfaces.

    Stores typed key-value pairs grouped by category.
    Replaces hardcoded values like HIGH_RISK_MIN_NET_SCORE.
    """

    __tablename__ = "global_config"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Unique key identifier (e.g., "high_risk_min_net_score")
    key: Mapped[str] = mapped_column(String(100), unique=True, index=True)

    # JSON-serialized value (parsed according to value_type)
    value: Mapped[str] = mapped_column(Text)

    # Type hint for parsing: "int" | "bool" | "string" | "json"
    value_type: Mapped[str] = mapped_column(String(20), default="string")

    # Category for grouping in UI: "risk_thresholds" | "approvals" | "notifications"
    category: Mapped[str] = mapped_column(String(50), index=True)

    # Human-readable name for UI
    display_name: Mapped[str] = mapped_column(String(200))

    # Optional description/help text
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Validation constraints for int types
    min_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_value: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Whether this value is editable in the owning admin surface
    is_editable: Mapped[bool] = mapped_column(Boolean, default=True)

    # Audit fields
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    updated_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    # Relationship to user who last updated
    updated_by: Mapped["User"] = relationship("User", foreign_keys=[updated_by_id])

    def get_typed_value(self):
        """Return the value parsed according to value_type."""
        return parse_global_config_value(self.value, self.value_type)

    def set_typed_value(self, value):
        """Set the value, serializing according to value_type."""
        self.value = serialize_global_config_value(value, self.value_type)

    def __repr__(self) -> str:
        return f"<GlobalConfig(key='{self.key}', value='{self.value}')>"


__all__ = [
    "GlobalConfig",
    "ConfigDefaults",
    "build_risk_level_ranges",
    "clear_config_cache",
    "get_config_float",
    "get_config_int",
    "get_config_value",
    "get_risk_thresholds",
]
