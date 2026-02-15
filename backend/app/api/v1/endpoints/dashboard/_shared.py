from sqlalchemy import and_

from app.models import Risk
from app.models.global_config import ConfigDefaults, build_risk_level_ranges

# Default risk level score ranges (fallback, uses ConfigDefaults)
# For dynamic thresholds, use get_risk_level_ranges_async() in endpoint handlers
RISK_LEVEL_RANGES = build_risk_level_ranges(
    ConfigDefaults.MEDIUM_RISK_MIN_NET_SCORE,
    ConfigDefaults.HIGH_RISK_MIN_NET_SCORE,
    ConfigDefaults.CRITICAL_RISK_MIN_NET_SCORE,
)


def build_risk_level_condition(risk_level: str):
    """Build SQLAlchemy condition for risk level filtering."""
    if risk_level not in RISK_LEVEL_RANGES:
        return None
    min_score, max_score = RISK_LEVEL_RANGES[risk_level]
    return and_(Risk.net_score >= min_score, Risk.net_score <= max_score)
