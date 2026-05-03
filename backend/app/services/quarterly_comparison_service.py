"""Compatibility facade for Risk Committee quarterly comparison metrics."""

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
