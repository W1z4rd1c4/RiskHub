"""Tests for the verify_audit_logs.py verification script."""
import json
import pytest
import sys
from pathlib import Path

# Add scripts directory to path for import
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
from verify_audit_logs import verify_audit_log, verify_log_separation, VerificationResult


class TestVerifyAuditLog:
    """Tests for the verify_audit_log function."""
    
    def test_valid_audit_log_passes(self, tmp_path):
        """Test that a valid audit log passes verification."""
        log_file = tmp_path / "audit.json.log"
        log_file.write_text("\n".join([
            json.dumps({
                "timestamp": "2024-01-01T12:00:00+00:00",
                "level": "info",
                "event": "login",
                "logger": "audit",
                "request_id": "req-123"
            }),
            json.dumps({
                "timestamp": "2024-01-01T12:01:00+00:00",
                "level": "info",
                "event": "create",
                "logger": "audit.activity",
                "request_id": "req-456",
                "user_id": 1,
                "client_ip": "127.0.0.1"
            }),
        ]) + "\n")
        
        result = verify_audit_log(log_file)
        assert result.passed
        assert result.errors == 0
        assert result.lines_verified == 2
    
    def test_malformed_json_fails(self, tmp_path):
        """Test that malformed JSON causes error."""
        log_file = tmp_path / "bad.json.log"
        # Good lines have all required fields, only middle line is invalid JSON
        log_file.write_text(
            '{"timestamp": "2024-01-01T12:00:00Z", "level": "info", "event": "good1", "logger": "audit", "request_id": "1"}\n'
            'not valid json\n'
            '{"timestamp": "2024-01-01T12:01:00Z", "level": "info", "event": "good2", "logger": "audit", "request_id": "2"}\n'
        )
        
        result = verify_audit_log(log_file, enforce_logger=True)
        assert not result.passed
        # Only the malformed line should cause an error
        assert result.errors == 1
        assert "Invalid JSON" in result.error_messages[0]
    
    def test_missing_required_fields_fails(self, tmp_path):
        """Test that missing required fields cause error."""
        log_file = tmp_path / "incomplete.json.log"
        log_file.write_text(json.dumps({
            "level": "info",
            # Missing: timestamp, event, logger
        }) + "\n")
        
        result = verify_audit_log(log_file, enforce_logger=False)
        assert not result.passed
        assert result.errors == 1
        assert "Missing required fields" in result.error_messages[0]
    
    def test_wrong_logger_fails_when_enforced(self, tmp_path):
        """Test that non-audit logger fails when enforcement is on."""
        log_file = tmp_path / "wrong_logger.json.log"
        log_file.write_text(json.dumps({
            "timestamp": "2024-01-01T12:00:00+00:00",
            "level": "info",
            "event": "test",
            "logger": "app.main",  # Wrong logger for audit log
            "request_id": "req-123"
        }) + "\n")
        
        result = verify_audit_log(log_file, enforce_logger=True)
        assert not result.passed
        assert result.errors == 1
        assert "Invalid logger for audit log" in result.error_messages[0]
    
    def test_logger_prefix_accepted(self, tmp_path):
        """Test that audit.* logger names are accepted."""
        log_file = tmp_path / "prefixed.json.log"
        log_file.write_text(json.dumps({
            "timestamp": "2024-01-01T12:00:00+00:00",
            "level": "info",
            "event": "test",
            "logger": "audit.activity",
            "request_id": "req-123"
        }) + "\n")
        
        result = verify_audit_log(log_file, enforce_logger=True)
        assert result.passed
    
    def test_secret_pattern_triggers_warning(self, tmp_path):
        """Test that potential secrets trigger warnings."""
        log_file = tmp_path / "secrets.json.log"
        log_file.write_text(json.dumps({
            "timestamp": "2024-01-01T12:00:00+00:00",
            "level": "info",
            "event": "test",
            "logger": "audit",
            "password": "supersecret123"  # Should trigger warning
        }) + "\n")
        
        result = verify_audit_log(log_file, check_secrets=True)
        assert result.warnings >= 1
        assert any("password" in msg for msg in result.warning_messages)
    
    def test_nonexistent_file_returns_error(self, tmp_path):
        """Test that nonexistent file returns error result."""
        result = verify_audit_log(tmp_path / "nonexistent.log")
        assert not result.passed
        assert result.errors == 1
        assert "not found" in result.error_messages[0].lower()
    
    def test_missing_context_fields_warn(self, tmp_path):
        """Test that missing context fields trigger warnings."""
        log_file = tmp_path / "no_context.json.log"
        log_file.write_text(json.dumps({
            "timestamp": "2024-01-01T12:00:00+00:00",
            "level": "info",
            "event": "test",
            "logger": "audit",
            # Missing: request_id
        }) + "\n")
        
        result = verify_audit_log(log_file)
        # Should pass (warnings don't fail)
        assert result.passed
        assert result.warnings >= 1


class TestLogSeparation:
    """Tests for log separation verification."""
    
    def test_clean_separation_passes(self, tmp_path):
        """Test that properly separated logs pass."""
        app_log = tmp_path / "app.json.log"
        audit_log = tmp_path / "audit.json.log"
        
        app_log.write_text(json.dumps({
            "timestamp": "2024-01-01T12:00:00+00:00",
            "level": "info",
            "event": "request",
            "logger": "app.main"  # Non-audit logger
        }) + "\n")
        
        audit_log.write_text(json.dumps({
            "timestamp": "2024-01-01T12:00:00+00:00",
            "level": "info",
            "event": "login",
            "logger": "audit"
        }) + "\n")
        
        result = verify_log_separation(app_log, audit_log)
        assert result.passed
        assert result.errors == 0
    
    def test_audit_in_app_log_fails(self, tmp_path):
        """Test that audit entries in app log fail separation check."""
        app_log = tmp_path / "app.json.log"
        audit_log = tmp_path / "audit.json.log"
        
        # App log contains audit logger entry (violation!)
        app_log.write_text(json.dumps({
            "timestamp": "2024-01-01T12:00:00+00:00",
            "level": "info",
            "event": "login",
            "logger": "audit"  # Wrong! Should only be in audit log
        }) + "\n")
        
        audit_log.write_text("")
        
        result = verify_log_separation(app_log, audit_log)
        assert not result.passed
        assert result.errors >= 1
        assert "separation violation" in result.error_messages[0].lower()


class TestLogRotationConfig:
    """Tests for log rotation configuration."""
    
    def test_configure_logging_applies_rotation(self):
        """Test that configure_logging applies rotation settings."""
        import logging
        from app.core.logging import configure_logging
        
        # Call with explicit settings
        configure_logging(app_rotation_size_mb=5, app_retention_count=3)
        
        # Check root logger handlers
        root_logger = logging.getLogger()
        rotating_handlers = [
            h for h in root_logger.handlers 
            if isinstance(h, logging.handlers.RotatingFileHandler)
        ]
        
        # Should have at least app and audit handlers
        assert len(rotating_handlers) >= 2
        
        # Check app.json.log handler specifically
        app_handler = next(
            (h for h in rotating_handlers if "app.json.log" in str(h.baseFilename)),
            None
        )
        assert app_handler is not None, "App log handler should exist"
        assert app_handler.maxBytes == 5 * 1024 * 1024  # 5MB
        assert app_handler.backupCount == 3

