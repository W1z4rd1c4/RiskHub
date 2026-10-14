"""Tests for log rotation configuration."""

import logging


class TestLogRotationConfig:
    """Tests for log rotation configuration behavior."""

    def test_configure_logging_applies_custom_rotation(self):
        """Test that configure_logging applies custom rotation settings."""
        from app.core.logging import configure_logging

        # Configure with custom settings
        configure_logging(rotation_size_mb=7, retention_count=5)

        # Check handlers on root logger
        root_logger = logging.getLogger()
        rotating_handlers = [h for h in root_logger.handlers if isinstance(h, logging.handlers.RotatingFileHandler)]

        # Should have app and audit handlers
        assert len(rotating_handlers) >= 2

        # Check app.json.log handler specifically
        app_handler = next((h for h in rotating_handlers if "app.json.log" in str(h.baseFilename)), None)
        assert app_handler is not None, "App log handler should exist"
        assert app_handler.maxBytes == 7 * 1024 * 1024  # 7MB
        assert app_handler.backupCount == 5

    def test_configure_logging_uses_defaults_when_none(self):
        """Test that configure_logging uses defaults when not specified."""
        from app.core.logging import configure_logging, get_active_logging_config, get_log_settings

        # Configure without specifying rotation (uses defaults)
        configure_logging()

        root_logger = logging.getLogger()
        rotating_handlers = [h for h in root_logger.handlers if isinstance(h, logging.handlers.RotatingFileHandler)]

        app_handler = next(h for h in rotating_handlers if "app.json.log" in str(h.baseFilename))
        audit_handler = next(h for h in rotating_handlers if "audit.json.log" in str(h.baseFilename))
        assert (app_handler.maxBytes, app_handler.backupCount) == (10 * 1024 * 1024, 10)
        assert (audit_handler.maxBytes, audit_handler.backupCount) == (50 * 1024 * 1024, 30)
        assert get_log_settings() == (10 * 1024 * 1024, 10, 50 * 1024 * 1024, 30)
        assert get_active_logging_config()["audit_rotation_size_mb"] == 50
        assert get_active_logging_config()["audit_retention_count"] == 30

    def test_audit_rotation_keeps_newest_default_backup_count(self, tmp_path):
        from app.core.logging import DEFAULT_AUDIT_LOG_RETENTION_COUNT
        from app.core.logging_handlers import build_file_handler

        log_file = tmp_path / "audit.json.log"
        handler = build_file_handler(
            log_file=str(log_file),
            size_bytes=64,  # Small threshold exercises rollover without writing MiB of test data.
            backup_count=DEFAULT_AUDIT_LOG_RETENTION_COUNT,
            formatter=logging.Formatter("%(message)s"),
            audit=True,
        )
        messages = [f"entry-{index:02d}: " + "x" * 40 for index in range(35)]
        try:
            for message in messages:
                handler.handle(logging.LogRecord("audit", logging.INFO, __file__, 0, message, (), None))
        finally:
            handler.close()

        assert len(list(tmp_path.glob("audit.json.log*"))) == 31
        assert log_file.read_text().strip() == messages[-1]
        assert (tmp_path / "audit.json.log.1").read_text().strip() == messages[-2]
        assert (tmp_path / "audit.json.log.30").read_text().strip() == messages[4]

    def test_resolve_logging_config_applies_shared_and_per_handler_overrides(self):
        from app.core.logging import _resolve_logging_config

        resolved = _resolve_logging_config(
            log_level="warning",
            json_console=False,
            rotation_size_mb=7,
            retention_count=5,
            audit_rotation_size_mb=9,
        )

        assert resolved.log_level == "WARNING"
        assert resolved.json_console is False
        assert resolved.app_rotation_size_mb == 7
        assert resolved.app_retention_count == 5
        assert resolved.audit_rotation_size_mb == 9
        assert resolved.audit_retention_count == 5
        assert resolved.app_size_bytes == 7 * 1024 * 1024
        assert resolved.audit_size_bytes == 9 * 1024 * 1024

    def test_configure_logging_assigns_app_and_audit_filters(self):
        from app.core.logging import AuditFilter, NonAuditFilter, configure_logging

        configure_logging(rotation_size_mb=7, retention_count=5)

        root_logger = logging.getLogger()
        rotating_handlers = [h for h in root_logger.handlers if isinstance(h, logging.handlers.RotatingFileHandler)]

        app_handler = next((h for h in rotating_handlers if "app.json.log" in str(h.baseFilename)), None)
        audit_handler = next((h for h in rotating_handlers if "audit.json.log" in str(h.baseFilename)), None)

        assert app_handler is not None, "App log handler should exist"
        assert audit_handler is not None, "Audit log handler should exist"
        assert any(isinstance(filter_, NonAuditFilter) for filter_ in app_handler.filters)
        assert any(isinstance(filter_, AuditFilter) for filter_ in audit_handler.filters)

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

        # Reconfigure with different settings
        configure_logging(rotation_size_mb=15, retention_count=8)

        # Get new handlers
        root_logger = logging.getLogger()
        new_rotating_handlers = [h for h in root_logger.handlers if isinstance(h, logging.handlers.RotatingFileHandler)]

        # Check app.json.log handler specifically
        app_handler = next((h for h in new_rotating_handlers if "app.json.log" in str(h.baseFilename)), None)
        assert app_handler is not None, "App log handler should exist"
        assert app_handler.maxBytes == 15 * 1024 * 1024  # 15MB
        assert app_handler.backupCount == 8

    def test_reconfigure_log_rotation_preserves_active_log_level_and_console_mode(self):
        from app.core.logging import (
            configure_logging,
            get_active_logging_config,
            reconfigure_log_rotation,
        )

        configure_logging(log_level="WARNING", json_console=False)
        reconfigure_log_rotation(
            app_rotation_size_mb=12,
            app_retention_count=6,
            audit_rotation_size_mb=14,
            audit_retention_count=7,
        )

        active_config = get_active_logging_config()
        assert active_config["log_level"] == "WARNING"
        assert active_config["json_console"] is False
        assert active_config["app_rotation_size_mb"] == 12
        assert active_config["audit_rotation_size_mb"] == 14

    def test_configure_logging_from_snapshot_restores_full_runtime_settings(self):
        from app.core.logging import (
            configure_logging,
            configure_logging_from_snapshot,
            get_active_logging_config,
        )

        original_config = get_active_logging_config()
        try:
            configure_logging(
                log_level="WARNING",
                json_console=False,
                app_rotation_size_mb=12,
                app_retention_count=6,
                audit_rotation_size_mb=14,
                audit_retention_count=7,
            )
            captured_config = get_active_logging_config()

            configure_logging(
                log_level="ERROR",
                json_console=True,
                app_rotation_size_mb=4,
                app_retention_count=3,
                audit_rotation_size_mb=5,
                audit_retention_count=2,
            )
            configure_logging_from_snapshot(captured_config)

            assert get_active_logging_config() == captured_config
        finally:
            configure_logging_from_snapshot(original_config)

    def test_parse_log_rotation_config_accepts_valid_values(self):
        from app.main import parse_log_rotation_config

        parsed = parse_log_rotation_config(
            {
                "app_log_rotation_size_mb": "12",
                "app_log_retention_count": "9",
                "audit_log_rotation_size_mb": "14",
                "audit_log_retention_count": "11",
            }
        )

        assert parsed["app_log_rotation_size_mb"] == 12
        assert parsed["app_log_retention_count"] == 9
        assert parsed["audit_log_rotation_size_mb"] == 14
        assert parsed["audit_log_retention_count"] == 11

    def test_parse_log_rotation_config_rejects_invalid_values(self):
        from app.main import parse_log_rotation_config

        try:
            parse_log_rotation_config({"app_log_rotation_size_mb": "invalid"})
        except ValueError as exc:
            assert "app_log_rotation_size_mb" in str(exc)
        else:  # pragma: no cover - defensive
            raise AssertionError("Expected invalid log rotation config to raise ValueError")
