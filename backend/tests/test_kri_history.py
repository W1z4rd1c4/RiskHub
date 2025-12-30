"""Tests for KRI history service and history recording functionality."""
import pytest
import pytest_asyncio
from datetime import datetime, date, timedelta, UTC
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.key_risk_indicator import KeyRiskIndicator, KRIFrequency
from app.models.kri_history import KRIValueHistory
from app.services.kri_history_service import KRIHistoryService, REPORTING_GRACE_DAYS


@pytest_asyncio.fixture
async def test_kri_quarterly(db_session: AsyncSession, test_risk):
    """Create a quarterly KRI with no history."""
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="Test Quarterly KRI",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.quarterly.value,
        created_at=datetime.now(UTC) - timedelta(days=10),
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    return kri


@pytest_asyncio.fixture
async def test_kri_with_history(db_session: AsyncSession, test_risk, test_user_cro):
    """Create a KRI with existing history entry."""
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="KRI With History",
        current_value=45.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
        created_at=datetime.now(UTC) - timedelta(days=60),
        last_period_end=date.today() - timedelta(days=30),
        last_reported_at=datetime.now(UTC) - timedelta(days=25),
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    
    # Add a history entry
    history = KRIValueHistory(
        kri_id=kri.id,
        period_start=date.today() - timedelta(days=60),
        period_end=date.today() - timedelta(days=30),
        recorded_at=datetime.now(UTC) - timedelta(days=25),
        recorded_by_id=test_user_cro.id,
        value=45.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        breach_status="within",
    )
    db_session.add(history)
    await db_session.commit()
    
    return kri


# Period Calculation Tests

class TestPeriodCalculation:
    """Tests for period calculation helpers."""
    
    def test_frequency_to_days(self):
        """Test frequency conversion to days."""
        assert KRIHistoryService.frequency_to_days("daily") == 1
        assert KRIHistoryService.frequency_to_days("weekly") == 7
        assert KRIHistoryService.frequency_to_days("monthly") == 30
        assert KRIHistoryService.frequency_to_days("quarterly") == 90
        assert KRIHistoryService.frequency_to_days("annually") == 365
        assert KRIHistoryService.frequency_to_days("unknown") == 90  # Default
    
    def test_due_date_calculation(self):
        """Test due date is period_end + 15 days."""
        period_end = date(2025, 3, 31)
        due = KRIHistoryService.due_date(period_end)
        assert due == date(2025, 4, 15)
    
    @pytest.mark.asyncio
    async def test_current_period_no_history(self, test_kri_quarterly):
        """Test current period for KRI without previous reporting."""
        period_start, period_end = KRIHistoryService.current_period(test_kri_quarterly)
        
        # Period should start from created_at
        assert period_start == test_kri_quarterly.created_at.date()
        assert (period_end - period_start).days == 89  # Quarterly = 90 days
    
    @pytest.mark.asyncio
    async def test_current_period_with_history(self, test_kri_with_history):
        """Test current period starts after last_period_end."""
        period_start, period_end = KRIHistoryService.current_period(test_kri_with_history)
        
        # Period should start day after last_period_end
        expected_start = test_kri_with_history.last_period_end + timedelta(days=1)
        assert period_start == expected_start


# Value Recording Tests

class TestRecordValue:
    """Tests for recording KRI values."""
    
    @pytest.mark.asyncio
    async def test_record_value_creates_history(
        self, db_session: AsyncSession, test_kri_quarterly, test_user_cro
    ):
        """Test that recording a value creates a history entry."""
        entry = await KRIHistoryService.record_value(
            db=db_session,
            kri=test_kri_quarterly,
            value=75.0,
            recorded_by_id=test_user_cro.id,
            is_privileged=True,
        )
        
        await db_session.commit()
        
        assert entry is not None
        assert entry.value == 75.0
        assert entry.kri_id == test_kri_quarterly.id
        assert entry.recorded_by_id == test_user_cro.id
        assert entry.breach_status == "within"
    
    @pytest.mark.asyncio
    async def test_record_value_updates_kri(
        self, db_session: AsyncSession, test_kri_quarterly, test_user_cro
    ):
        """Test that recording updates KRI current_value and last_period_end."""
        original_value = test_kri_quarterly.current_value
        
        await KRIHistoryService.record_value(
            db=db_session,
            kri=test_kri_quarterly,
            value=80.0,
            recorded_by_id=test_user_cro.id,
            is_privileged=True,
        )
        await db_session.commit()
        
        await db_session.refresh(test_kri_quarterly)
        
        assert test_kri_quarterly.current_value == 80.0
        assert test_kri_quarterly.current_value != original_value
        assert test_kri_quarterly.last_period_end is not None
    
    @pytest.mark.asyncio
    async def test_record_value_breach_above(
        self, db_session: AsyncSession, test_kri_quarterly, test_user_cro
    ):
        """Test breach status is set when value exceeds upper limit."""
        entry = await KRIHistoryService.record_value(
            db=db_session,
            kri=test_kri_quarterly,
            value=110.0,  # Above upper limit of 100
            recorded_by_id=test_user_cro.id,
            is_privileged=True,
        )
        
        assert entry.breach_status == "above"
    
    @pytest.mark.asyncio
    async def test_record_value_breach_below(
        self, db_session: AsyncSession, test_kri_quarterly, test_user_cro
    ):
        """Test breach status is set when value is below lower limit."""
        entry = await KRIHistoryService.record_value(
            db=db_session,
            kri=test_kri_quarterly,
            value=-5.0,  # Below lower limit of 0
            recorded_by_id=test_user_cro.id,
            is_privileged=True,
        )
        
        assert entry.breach_status == "below"
    
    @pytest.mark.asyncio
    async def test_privileged_backdating(
        self, db_session: AsyncSession, test_kri_quarterly, test_user_cro
    ):
        """Test that privileged users can backdate entries."""
        past_period_end = date.today() - timedelta(days=60)
        
        entry = await KRIHistoryService.record_value(
            db=db_session,
            kri=test_kri_quarterly,
            value=55.0,
            recorded_by_id=test_user_cro.id,
            period_end=past_period_end,
            is_privileged=True,
        )
        
        assert entry.period_end == past_period_end


# History Retrieval Tests

class TestGetHistory:
    """Tests for retrieving KRI history."""
    
    @pytest.mark.asyncio
    async def test_get_history_returns_entries(
        self, db_session: AsyncSession, test_kri_with_history
    ):
        """Test that get_history returns history entries."""
        entries, total = await KRIHistoryService.get_history(
            db=db_session,
            kri_id=test_kri_with_history.id,
        )
        
        assert total >= 1
        assert len(entries) >= 1
    
    @pytest.mark.asyncio
    async def test_get_history_empty_for_new_kri(
        self, db_session: AsyncSession, test_kri_quarterly
    ):
        """Test that get_history returns empty for KRI without history."""
        entries, total = await KRIHistoryService.get_history(
            db=db_session,
            kri_id=test_kri_quarterly.id,
        )
        
        assert total == 0
        assert len(entries) == 0
    
    @pytest.mark.asyncio
    async def test_get_history_pagination(
        self, db_session: AsyncSession, test_kri_quarterly, test_user_cro
    ):
        """Test history pagination works correctly."""
        # Create 5 history entries
        for i in range(5):
            await KRIHistoryService.record_value(
                db=db_session,
                kri=test_kri_quarterly,
                value=50.0 + i,
                recorded_by_id=test_user_cro.id,
                period_end=date.today() - timedelta(days=i * 90),
                is_privileged=True,
            )
        await db_session.commit()
        
        # Get page 1 with size 2
        entries, total = await KRIHistoryService.get_history(
            db=db_session,
            kri_id=test_kri_quarterly.id,
            page=1,
            size=2,
        )
        
        assert total == 5
        assert len(entries) == 2


# Correction Tests

class TestHistoryCorrection:
    """Tests for applying corrections to history entries."""
    
    @pytest.mark.asyncio
    async def test_apply_correction_updates_value(
        self, db_session: AsyncSession, test_kri_with_history, test_user_cro
    ):
        """Test that applying a correction updates the entry value."""
        # Get the existing history entry
        entries, _ = await KRIHistoryService.get_history(
            db=db_session,
            kri_id=test_kri_with_history.id,
        )
        entry = entries[0]
        
        # Apply correction
        corrected = await KRIHistoryService.apply_history_correction(
            db=db_session,
            entry_id=entry.id,
            new_value=99.0,
            corrected_by_id=test_user_cro.id,
        )
        
        assert corrected.value == 99.0
    
    @pytest.mark.asyncio
    async def test_correction_recalculates_breach_status(
        self, db_session: AsyncSession, test_kri_with_history, test_user_cro
    ):
        """Test that correction recalculates breach status."""
        entries, _ = await KRIHistoryService.get_history(
            db=db_session,
            kri_id=test_kri_with_history.id,
        )
        entry = entries[0]
        
        # Apply correction that causes breach
        corrected = await KRIHistoryService.apply_history_correction(
            db=db_session,
            entry_id=entry.id,
            new_value=150.0,  # Above upper limit 100
            corrected_by_id=test_user_cro.id,
        )
        
        assert corrected.breach_status == "above"
