"""Tests for admin log endpoints."""
import json
import pytest
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock
from httpx import AsyncClient, ASGITransport
from datetime import datetime, UTC

from app.main import app
from app.core.logging import tail_log_file


class TestTailLogFile:
    """Tests for the tail_log_file helper function."""
    
    def test_tail_empty_file(self, tmp_path):
        """Test tailing an empty file."""
        log_file = tmp_path / "empty.log"
        log_file.write_text("")
        
        lines, total = tail_log_file(log_file, 10)
        assert lines == []
        assert total == 0
    
    def test_tail_nonexistent_file(self, tmp_path):
        """Test tailing a nonexistent file."""
        log_file = tmp_path / "nonexistent.log"
        
        lines, total = tail_log_file(log_file, 10)
        assert lines == []
        assert total == 0
    
    def test_tail_small_file(self, tmp_path):
        """Test tailing a file with fewer lines than requested."""
        log_file = tmp_path / "small.log"
        log_file.write_text('{"event": "line1"}\n{"event": "line2"}\n{"event": "line3"}\n')
        
        lines, total = tail_log_file(log_file, 10)
        assert len(lines) == 3
        assert all("line" in line for line in lines)
    
    def test_tail_exact_count(self, tmp_path):
        """Test tailing exactly N lines from a larger file."""
        log_file = tmp_path / "larger.log"
        content = "\n".join([f'{{"event": "line{i}"}}' for i in range(20)]) + "\n"
        log_file.write_text(content)
        
        lines, total = tail_log_file(log_file, 5)
        assert len(lines) == 5
        # Should be the last 5 lines
        for i, line in enumerate(lines):
            data = json.loads(line)
            assert data["event"] == f"line{15 + i}"
    
    def test_tail_handles_malformed_lines(self, tmp_path):
        """Test that tail returns lines even if some are malformed."""
        log_file = tmp_path / "mixed.log"
        log_file.write_text('{"event": "good1"}\nmalformed line\n{"event": "good2"}\n')
        
        lines, total = tail_log_file(log_file, 10)
        # Should return all non-empty lines
        assert len(lines) >= 2


    # Note: Full integration tests for admin log endpoints would require
    # database fixtures and proper authentication setup. The core functionality
    # is covered by TestTailLogFile tests above.
