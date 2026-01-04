"""Tests for log rotation configuration."""
import logging
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock


class TestLogRotationConfig:
    """Tests for log rotation configuration behavior."""
    
    def test_configure_logging_applies_custom_rotation(self):
        """Test that configure_logging applies custom rotation settings."""
        from app.core.logging import configure_logging
        
        # Configure with custom settings
        configure_logging(rotation_size_mb=7, retention_count=5)
        
        # Check handlers on root logger
        root_logger = logging.getLogger()
        rotating_handlers = [
            h for h in root_logger.handlers 
            if isinstance(h, logging.handlers.RotatingFileHandler)
        ]
        
        # Should have app and audit handlers
        assert len(rotating_handlers) >= 2
        
        for handler in rotating_handlers:
            assert handler.maxBytes == 7 * 1024 * 1024  # 7MB
            assert handler.backupCount == 5
    
    def test_configure_logging_uses_defaults_when_none(self):
        """Test that configure_logging uses defaults when not specified."""
        from app.core.logging import configure_logging, DEFAULT_LOG_ROTATION_SIZE_MB, DEFAULT_LOG_RETENTION_COUNT
        
        # Mock get_log_settings to return defaults
        with patch("app.core.logging.get_log_settings", return_value=(
            DEFAULT_LOG_ROTATION_SIZE_MB * 1024 * 1024, 
            DEFAULT_LOG_RETENTION_COUNT
        )):
            configure_logging()
        
        root_logger = logging.getLogger()
        rotating_handlers = [
            h for h in root_logger.handlers 
            if isinstance(h, logging.handlers.RotatingFileHandler)
        ]
        
        # Check at least one handler uses defaults
        if rotating_handlers:
            handler = rotating_handlers[0]
            expected_bytes = DEFAULT_LOG_ROTATION_SIZE_MB * 1024 * 1024
            assert handler.maxBytes == expected_bytes
    
    def test_get_log_directory_returns_correct_path(self):
        """Test that get_log_directory returns backend/logs."""
        from app.core.logging import get_log_directory
        
        log_dir = get_log_directory()
        
        # Should be absolute path ending with logs
        assert log_dir.is_absolute()
        assert log_dir.name == "logs"
        # Parent should be backend
        assert log_dir.parent.name == "backend"
    
    def test_reconfigure_logging_updates_handlers(self):
        """Test that calling configure_logging again updates handlers."""
        from app.core.logging import configure_logging
        
        # Initial config
        configure_logging(rotation_size_mb=3, retention_count=2)
        
        root_logger = logging.getLogger()
        initial_handlers = [
            h for h in root_logger.handlers 
            if isinstance(h, logging.handlers.RotatingFileHandler)
        ]
        
        # Reconfigure with different settings
        configure_logging(rotation_size_mb=15, retention_count=8)
        
        # Get new handlers
        new_rotating_handlers = [
            h for h in root_logger.handlers 
            if isinstance(h, logging.handlers.RotatingFileHandler)
        ]
        
        # Should have updated settings
        for handler in new_rotating_handlers:
            assert handler.maxBytes == 15 * 1024 * 1024  # 15MB
            assert handler.backupCount == 8
