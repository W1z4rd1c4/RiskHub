"""
KRI History Service for recording KRI values with period boundaries.

Manages reporting windows, period calculations, and value recording
with enforcement of the 15-day grace window for non-privileged users.
"""
import logging
from datetime import datetime, date, timedelta, UTC
from typing import Optional, Tuple
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.key_risk_indicator import KeyRiskIndicator, KRIFrequency
from app.models.kri_history import KRIValueHistory
from app.models.user import User

logger = logging.getLogger(__name__)


# Reporting grace window in days after period end
REPORTING_GRACE_DAYS = 15


class KRIHistoryService:
    """Service for managing KRI value recording with period boundaries."""
    
    @staticmethod
    def frequency_to_days(frequency: str) -> int:
        """Convert KRI frequency to number of days in a period."""
        mapping = {
            KRIFrequency.daily.value: 1,
            KRIFrequency.weekly.value: 7,
            KRIFrequency.monthly.value: 30,
            KRIFrequency.quarterly.value: 90,
            KRIFrequency.annually.value: 365,
        }
        return mapping.get(frequency, 90)  # Default to quarterly
    
    @staticmethod
    def current_period(kri: KeyRiskIndicator) -> Tuple[date, date]:
        """
        Calculate the current reporting period for a KRI.
        
        Returns (period_start, period_end) based on last_period_end + frequency.
        If no previous period, uses created_at as the starting point.
        """
        frequency_days = KRIHistoryService.frequency_to_days(kri.frequency)
        
        if kri.last_period_end:
            # Next period starts the day after last period ended
            period_start = kri.last_period_end + timedelta(days=1)
        else:
            # First period starts from creation date
            period_start = kri.created_at.date() if kri.created_at else date.today()
        
        period_end = period_start + timedelta(days=frequency_days - 1)
        return period_start, period_end
    
    @staticmethod
    def due_date(period_end: date) -> date:
        """
        Calculate the due date for a period.
        
        Due date is period_end + 15 days (grace window).
        """
        return period_end + timedelta(days=REPORTING_GRACE_DAYS)
    
    @staticmethod
    def reporting_owner_id(kri: KeyRiskIndicator) -> Optional[int]:
        """
        Get the reporting owner for a KRI.
        
        Falls back to risk owner if no explicit reporting owner is set.
        """
        if kri.reporting_owner_id:
            return kri.reporting_owner_id
        if kri.risk and kri.risk.owner_id:
            return kri.risk.owner_id
        return None
    
    @staticmethod
    def is_within_reporting_window(period_end: date) -> bool:
        """Check if we're currently within the reporting window for a period."""
        due = KRIHistoryService.due_date(period_end)
        return date.today() <= due
    
    @staticmethod
    async def record_value(
        db: AsyncSession,
        kri: KeyRiskIndicator,
        value: float,
        recorded_by_id: Optional[int] = None,
        recorded_at: Optional[datetime] = None,
        period_end: Optional[date] = None,
        is_privileged: bool = False,
    ) -> KRIValueHistory:
        """
        Record a new KRI value and create a history entry.
        
        Args:
            db: Database session
            kri: The KRI to record value for
            value: The value to record
            recorded_by_id: ID of user recording the value
            recorded_at: Timestamp of recording (defaults to now)
            period_end: Period end date (for backdating by privileged users)
            is_privileged: Whether user can backdate outside current window
            
        Returns:
            Created KRIValueHistory entry
            
        Raises:
            ValueError: If non-privileged user tries to record outside window
        """
        now = datetime.now(UTC)
        
        # Determine period
        current_start, current_end = KRIHistoryService.current_period(kri)
        
        if period_end is None:
            # Default to current period
            period_end = current_end
            period_start = current_start
        else:
            # Backdating - only allowed for privileged users
            if not is_privileged:
                if period_end != current_end:
                    raise ValueError("Non-privileged users cannot backdate outside current period")
                if not KRIHistoryService.is_within_reporting_window(period_end):
                    raise ValueError(f"Reporting window closed. Due date was {KRIHistoryService.due_date(period_end)}")
            
            # Calculate period_start from period_end
            frequency_days = KRIHistoryService.frequency_to_days(kri.frequency)
            period_start = period_end - timedelta(days=frequency_days - 1)
        
        # Non-privileged users must be within window even for current period
        if not is_privileged and not KRIHistoryService.is_within_reporting_window(period_end):
            raise ValueError(f"Reporting window closed. Due date was {KRIHistoryService.due_date(period_end)}")
        
        # Calculate breach status
        if value < kri.lower_limit:
            breach_status = "below"
        elif value > kri.upper_limit:
            breach_status = "above"
        else:
            breach_status = "within"
        
        # Convert to timezone-naive for database compatibility
        history_recorded_at = recorded_at or now
        if history_recorded_at.tzinfo:
            history_recorded_at = history_recorded_at.replace(tzinfo=None)
        
        # Create history entry
        history_entry = KRIValueHistory(
            kri_id=kri.id,
            period_start=period_start,
            period_end=period_end,
            recorded_at=history_recorded_at,
            recorded_by_id=recorded_by_id,
            value=value,
            lower_limit=kri.lower_limit,
            upper_limit=kri.upper_limit,
            unit=kri.unit,
            breach_status=breach_status,
        )
        db.add(history_entry)
        
        # Update KRI current value and period tracking
        kri.current_value = value
        kri.last_period_end = period_end
        # Convert to timezone-naive for database compatibility
        reported_time = recorded_at or now
        kri.last_reported_at = reported_time.replace(tzinfo=None) if reported_time.tzinfo else reported_time
        
        await db.flush()
        logger.info(f"Recorded KRI {kri.id} value {value} for period {period_start} to {period_end}")
        
        return history_entry
    
    @staticmethod
    async def get_history(
        db: AsyncSession,
        kri_id: int,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
        page: int = 1,
        size: int = 20,
    ) -> Tuple[list[KRIValueHistory], int]:
        """
        Get paginated history for a KRI.
        
        Args:
            db: Database session
            kri_id: ID of the KRI
            from_date: Optional start date filter
            to_date: Optional end date filter
            page: Page number (1-indexed)
            size: Page size
            
        Returns:
            Tuple of (history entries, total count)
        """
        from sqlalchemy import func
        
        query = select(KRIValueHistory).where(KRIValueHistory.kri_id == kri_id)
        
        if from_date:
            query = query.where(KRIValueHistory.period_end >= from_date)
        if to_date:
            query = query.where(KRIValueHistory.period_end <= to_date)
        
        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0
        
        # Paginate and order by recorded_at desc
        query = query.order_by(KRIValueHistory.recorded_at.desc())
        query = query.offset((page - 1) * size).limit(size)
        
        result = await db.execute(query)
        entries = result.scalars().all()
        
        return list(entries), total
    
    @staticmethod
    async def get_overdue_kris(
        db: AsyncSession,
    ) -> list[dict]:
        """
        Get all KRIs that are overdue for reporting.
        
        Returns list of dicts with KRI info, due_date, and days_overdue.
        """
        today = date.today()
        
        # Fetch all KRIs with their risk relationships
        stmt = (
            select(KeyRiskIndicator)
            .options(
                selectinload(KeyRiskIndicator.risk),
                selectinload(KeyRiskIndicator.reporting_owner),
            )
        )
        result = await db.execute(stmt)
        kris = result.scalars().all()
        
        overdue = []
        for kri in kris:
            _, period_end = KRIHistoryService.current_period(kri)
            due = KRIHistoryService.due_date(period_end)
            
            if today > due:
                # Check if updated since period end
                if kri.last_period_end and kri.last_period_end >= period_end:
                    continue  # Already reported for this period
                
                days_overdue = (today - due).days
                reporting_owner = KRIHistoryService.reporting_owner_id(kri)
                
                overdue.append({
                    "kri_id": kri.id,
                    "metric_name": kri.metric_name,
                    "frequency": kri.frequency,
                    "period_end": period_end.isoformat(),
                    "due_date": due.isoformat(),
                    "days_overdue": days_overdue,
                    "reporting_owner_id": reporting_owner,
                    "reporting_owner_name": (
                        kri.reporting_owner.name if kri.reporting_owner 
                        else (kri.risk.owner.name if kri.risk and hasattr(kri.risk, 'owner') and kri.risk.owner else None)
                    ),
                    "risk_id": kri.risk_id,
                })
        
        # Sort by days overdue descending
        overdue.sort(key=lambda x: x["days_overdue"], reverse=True)
        return overdue
    
    @staticmethod
    async def apply_history_correction(
        db: AsyncSession,
        entry_id: int,
        new_value: float,
        corrected_by_id: Optional[int] = None,
    ) -> KRIValueHistory:
        """
        Apply a correction to a historical entry.
        
        If the corrected entry is the latest for the KRI, also updates current_value.
        
        Args:
            db: Database session
            entry_id: ID of the history entry to correct
            new_value: The corrected value
            corrected_by_id: ID of user making the correction
            
        Returns:
            Updated KRIValueHistory entry
        """
        # Get the entry
        result = await db.execute(
            select(KRIValueHistory)
            .where(KRIValueHistory.id == entry_id)
            .options(selectinload(KRIValueHistory.kri))
        )
        entry = result.scalar_one_or_none()
        
        if not entry:
            raise ValueError(f"History entry {entry_id} not found")
        
        # Recalculate breach status
        if new_value < entry.lower_limit:
            breach_status = "below"
        elif new_value > entry.upper_limit:
            breach_status = "above"
        else:
            breach_status = "within"
        
        # Update entry
        entry.value = new_value
        entry.breach_status = breach_status
        
        # Check if this is the latest entry for the KRI
        latest_result = await db.execute(
            select(KRIValueHistory)
            .where(KRIValueHistory.kri_id == entry.kri_id)
            .order_by(KRIValueHistory.recorded_at.desc())
            .limit(1)
        )
        latest_entry = latest_result.scalar_one_or_none()
        
        if latest_entry and latest_entry.id == entry.id:
            # Update KRI current value
            entry.kri.current_value = new_value
            logger.info(f"Updated KRI {entry.kri_id} current_value to {new_value} from history correction")
        
        await db.flush()
        logger.info(f"Applied correction to history entry {entry_id}: value {new_value}")
        
        return entry
