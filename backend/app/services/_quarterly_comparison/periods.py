from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Optional

from dateutil.relativedelta import relativedelta


def parse_quarter(quarter_str: str) -> datetime:
    match = re.match(r"^(\d{4})-Q([1-4])$", quarter_str)
    if not match:
        raise ValueError(f"Invalid quarter format: {quarter_str}. Expected 'YYYY-QN' (e.g., '2026-Q1')")
    year = int(match.group(1))
    quarter = int(match.group(2))
    month = (quarter - 1) * 3 + 1
    return datetime(year, month, 1, tzinfo=timezone.utc)


def calculate_quarter_boundaries(
    now: datetime,
    current_quarter: Optional[str] = None,
    compare_quarter: Optional[str] = None,
) -> tuple[datetime, datetime, datetime, datetime]:
    if current_quarter:
        current_quarter_start = parse_quarter(current_quarter)
        current_quarter_end = current_quarter_start + relativedelta(months=3)
        actual_current_quarter_start = datetime(now.year, ((now.month - 1) // 3) * 3 + 1, 1, tzinfo=timezone.utc)
        if current_quarter_start == actual_current_quarter_start:
            current_quarter_end = now
    else:
        current_quarter_start = datetime(now.year, ((now.month - 1) // 3) * 3 + 1, 1, tzinfo=timezone.utc)
        current_quarter_end = now

    if compare_quarter:
        last_quarter_start = parse_quarter(compare_quarter)
        last_quarter_end = last_quarter_start + relativedelta(months=3)
    else:
        last_quarter_start = current_quarter_start - relativedelta(months=3)
        last_quarter_end = current_quarter_start

    return current_quarter_start, current_quarter_end, last_quarter_start, last_quarter_end


def validate_quarter_selection(
    now: datetime,
    current_quarter_start: datetime,
    last_quarter_start: datetime,
) -> None:
    actual_current_quarter_start = datetime(now.year, ((now.month - 1) // 3) * 3 + 1, 1, tzinfo=timezone.utc)
    if current_quarter_start > actual_current_quarter_start:
        raise ValueError("current_quarter cannot be in the future")
    if last_quarter_start >= current_quarter_start:
        raise ValueError("compare_quarter must be before current_quarter")
