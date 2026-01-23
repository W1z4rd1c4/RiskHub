"""Tests for risk ID code generation.

Verifies that the generate_risk_id_code function correctly handles:
- R99/R100 boundary (lexicographic ordering bug)
- Basic sequence generation
- Empty start case
"""
import pytest
from unittest.mock import AsyncMock, MagicMock
from sqlalchemy import select

from app.api.v1.endpoints.risks import generate_risk_id_code
from app.models import Risk


class FakeRow:
    """Fake row tuple for mocking query results."""
    def __init__(self, value):
        self._value = value
    
    def __getitem__(self, idx):
        if idx == 0:
            return self._value
        raise IndexError(idx)


class FakeResult:
    """Fake result object for mocking db.execute results."""
    def __init__(self, codes):
        self._codes = codes
    
    def all(self):
        return [FakeRow(code) for code in self._codes]


@pytest.mark.asyncio
async def test_generate_risk_id_handles_r99_r100_boundary():
    """Test that generator correctly handles R99/R100 boundary.
    
    This is a regression test for the lexicographic ordering bug where
    "CLAI-R99" > "CLAI-R100" in string sorting, causing the generator
    to stall at R99.
    
    The mock data is intentionally UNSORTED to verify the generator
    doesn't rely on any particular DB row ordering.
    """
    # Mock DB session with UNSORTED codes (arbitrary order to catch ordering bugs)
    db = AsyncMock()
    db.execute = AsyncMock(return_value=FakeResult([
        "CLAI-R09",   # Low number first
        "CLAI-R100",  # Highest, but not first or last
        "CLAI-R99",   # Second highest, after R100
        "CLAI-R10",   # Low number last
    ]))
    
    result = await generate_risk_id_code(db, "Claims")
    
    # Should return R101 (max=100, so next=101)
    assert result == "CLAI-R101", f"Expected CLAI-R101 but got {result}"



@pytest.mark.asyncio
async def test_generate_risk_id_basic_sequence():
    """Test basic sequence generation."""
    db = AsyncMock()
    db.execute = AsyncMock(return_value=FakeResult([
        "CLAI-R01",
    ]))
    
    result = await generate_risk_id_code(db, "Claims")
    
    assert result == "CLAI-R02"


@pytest.mark.asyncio
async def test_generate_risk_id_empty_start():
    """Test generation when no existing codes."""
    db = AsyncMock()
    db.execute = AsyncMock(return_value=FakeResult([]))
    
    result = await generate_risk_id_code(db, "Underwriting")
    
    assert result == "UNDE-R01"


@pytest.mark.asyncio
async def test_generate_risk_id_high_numbers():
    """Test that high numbers (100+) work correctly."""
    db = AsyncMock()
    db.execute = AsyncMock(return_value=FakeResult([
        "OPER-R150",
        "OPER-R149",
        "OPER-R100",
        "OPER-R99",
    ]))
    
    result = await generate_risk_id_code(db, "Operations")
    
    assert result == "OPER-R151"


@pytest.mark.asyncio
async def test_generate_risk_id_process_abbreviation():
    """Test process name abbreviation logic."""
    db = AsyncMock()
    db.execute = AsyncMock(return_value=FakeResult([]))
    
    # Various process names
    assert (await generate_risk_id_code(db, "IT Security")).startswith("ITSE-R")
    assert (await generate_risk_id_code(db, "HR")).startswith("HR-R")  # Shorter than 4 chars
    assert (await generate_risk_id_code(db, "123-Test")).startswith("TEST-R")  # Ignores numbers
    assert (await generate_risk_id_code(db, "")).startswith("RISK-R")  # Fallback for empty
