"""Compatibility facade for Risk Committee quarterly comparison metrics.

Audit #57 verdict: Reject deletion. This facade is kept as the stable
backwards-compatible import path for existing quarterly comparison callers.
"""

from app.services._quarterly_comparison.composition import (
    PERIOD_METRICS,
    SNAPSHOT_METRICS,
    build_quarterly_comparison,
)
from app.services._quarterly_comparison.periods import parse_quarter as _parse_quarter


def parse_quarter(quarter_str: str):
    return _parse_quarter(quarter_str)


__all__ = [
    "PERIOD_METRICS",
    "SNAPSHOT_METRICS",
    "build_quarterly_comparison",
    "parse_quarter",
]
