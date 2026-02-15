"""GlobalConfig model for system-wide configuration settings."""

import time
from datetime import datetime
from typing import TYPE_CHECKING, Any, Dict, TypeVar

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

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
        import json

        if self.value_type == "int":
            return int(self.value)
        elif self.value_type == "bool":
            return self.value.lower() in ("true", "1", "yes")
        elif self.value_type == "json":
            return json.loads(self.value)
        else:
            return self.value

    def set_typed_value(self, value):
        """Set the value, serializing according to value_type."""
        import json

        if self.value_type == "int":
            self.value = str(int(value))
        elif self.value_type == "bool":
            self.value = "true" if value else "false"
        elif self.value_type == "json":
            self.value = json.dumps(value)
        else:
            self.value = str(value)

    def __repr__(self) -> str:
        return f"<GlobalConfig(key='{self.key}', value='{self.value}')>"


# ============================================================================
# Config Lookup Helper with TTL Caching
# ============================================================================

T = TypeVar("T")

# Module-level cache with TTL
_config_cache: Dict[str, tuple[Any, float]] = {}
_CACHE_TTL_SECONDS = 60  # 1 minute cache


class ConfigDefaults:
    """Default values for global configuration keys.

    These values must match the seeded defaults in migration 74f4ad1b68cb_add_risk_hub_tables.py:
    - medium_risk_min_net_score = 5
    - high_risk_min_net_score = 10
    - critical_risk_min_net_score = 16
    """

    # Risk thresholds (must match seeded values)
    MEDIUM_RISK_MIN_NET_SCORE = 5  # net_score >= 5 = medium risk
    HIGH_RISK_MIN_NET_SCORE = 10  # net_score >= 10 = high risk
    CRITICAL_RISK_MIN_NET_SCORE = 16  # net_score >= 16 = critical risk
    TOTAL_ASSETS_VALUE = 10_000_000_000  # 10B CZK - used for financial loss calculations

    # Notification timing (days)
    ADVANCE_REMINDER_DAYS = 7  # Days before period end to send reminder
    REPORTING_GRACE_DAYS = 15  # Days after period end for reporting
    OVERDUE_REMINDER_WEEKS = 1  # Weeks between overdue reminders
    DUPLICATE_LOOKBACK_DAYS = 7  # Days to check for duplicate notifications

    # Questionnaire reminders (Phase 16)
    QUESTIONNAIRE_PRE_DUE_REMINDER_DAYS = 2  # due_at.date() == today + N
    QUESTIONNAIRE_OVERDUE_REMINDER_WEEKDAY = 0  # Monday=0 ... Sunday=6

    # Breach thresholds
    NEAR_BREACH_THRESHOLD = 0.80  # 80% towards limit = near breach


async def get_risk_thresholds(db: "AsyncSession") -> tuple[int, int, int]:
    """
    Get risk classification thresholds from GlobalConfig.

    Returns:
        Tuple of (medium, high, critical) threshold values.
        A risk is classified as:
        - critical: net_score >= critical
        - high: net_score >= high and < critical
        - medium: net_score >= medium and < high
        - low: net_score < medium
    """
    medium = await get_config_int(db, "medium_risk_min_net_score", ConfigDefaults.MEDIUM_RISK_MIN_NET_SCORE)
    high = await get_config_int(db, "high_risk_min_net_score", ConfigDefaults.HIGH_RISK_MIN_NET_SCORE)
    critical = await get_config_int(db, "critical_risk_min_net_score", ConfigDefaults.CRITICAL_RISK_MIN_NET_SCORE)
    return medium, high, critical


def build_risk_level_ranges(medium: int, high: int, critical: int) -> dict[str, tuple[int, int]]:
    """
    Build RISK_LEVEL_RANGES dict from thresholds.

    Args:
        medium: Minimum net_score for medium classification
        high: Minimum net_score for high classification
        critical: Minimum net_score for critical classification

    Returns:
        Dict mapping level name to (min_score, max_score) inclusive range.
    """
    return {
        "critical": (critical, 25),
        "high": (high, critical - 1),
        "medium": (medium, high - 1),
        "low": (1, medium - 1),
    }


async def get_config_value(
    db: "AsyncSession",
    key: str,
    default: T = None,
) -> T:
    """
    Fetch a typed config value from the database with caching.

    Args:
        db: Database session
        key: Config key to look up
        default: Default value if config not found

    Returns:
        Typed value from config or default if not found
    """
    from sqlalchemy import select

    # Check cache first
    now = time.time()
    if key in _config_cache:
        value, cached_at = _config_cache[key]
        if now - cached_at < _CACHE_TTL_SECONDS:
            return value

    # Query database
    result = await db.execute(select(GlobalConfig).where(GlobalConfig.key == key))
    config = result.scalar_one_or_none()

    if config:
        typed_value = config.get_typed_value()
        _config_cache[key] = (typed_value, now)
        return typed_value

    # Store default in cache to avoid repeated misses
    _config_cache[key] = (default, now)
    return default


async def get_config_int(
    db: "AsyncSession",
    key: str,
    default: int,
) -> int:
    """Get an integer config value with guaranteed int return type."""
    value = await get_config_value(db, key, default)
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


async def get_config_float(
    db: "AsyncSession",
    key: str,
    default: float,
) -> float:
    """Get a float config value with guaranteed float return type."""
    value = await get_config_value(db, key, default)
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def get_config_sync(key: str, default: T = None) -> T:
    """
    Get config value synchronously from cache only.

    Returns cached value or default. Does not query DB.
    Use this in sync contexts after config has been loaded via get_config_value.
    """
    now = time.time()
    if key in _config_cache:
        value, cached_at = _config_cache[key]
        if now - cached_at < _CACHE_TTL_SECONDS:
            return value
    return default


def clear_config_cache() -> None:
    """Clear the config cache. Useful for testing."""
    _config_cache.clear()
