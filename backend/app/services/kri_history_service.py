"""
KRI History Service for recording KRI values with period boundaries.

Manages reporting windows, period calculations, and value recording
with enforcement of the 15-day grace window for non-privileged users.
"""

from app.services._kri_history.constants import REPORTING_GRACE_DAYS
from app.services._kri_history.service import KRIHistoryService

__all__ = [
    "KRIHistoryService",
    "REPORTING_GRACE_DAYS",
]
