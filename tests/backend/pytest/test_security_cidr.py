"""Tests for CIDR matching in security middleware.

Verifies that the trusted proxy detection correctly handles:
- IPv4 CIDR ranges
- IPv6 CIDR ranges
- Single IP addresses
- Invalid inputs (graceful handling)
"""

from unittest.mock import MagicMock

import pytest

from app.core.config import Settings
from app.main import _validate_production_settings
from app.middleware.security import RateLimitMiddleware


class TestCIDRMatching:
    """Tests for _is_trusted_proxy method."""

    @pytest.fixture
    def middleware(self):
        """Create middleware instance with default trusted proxies."""
        app = MagicMock()
        return RateLimitMiddleware(app, enabled=True)

    def test_default_trusted_proxies_are_loopback_only(self, middleware):
        """Default trusted proxies should not trust broad private networks."""
        assert middleware._is_trusted_proxy("127.0.0.1")
        assert middleware._is_trusted_proxy("::1")
        assert not middleware._is_trusted_proxy("10.0.0.5")
        assert not middleware._is_trusted_proxy("192.168.1.100")
        assert not middleware._is_trusted_proxy("172.20.30.40")

    def test_ipv4_not_in_cidr_range(self, middleware):
        """IP outside CIDR range should not be trusted."""
        assert not middleware._is_trusted_proxy("8.8.8.8")
        assert not middleware._is_trusted_proxy("11.0.0.1")  # Just outside 10.0.0.0/8
        assert not middleware._is_trusted_proxy("203.0.113.1")  # Public IP

    def test_loopback_trusted(self, middleware):
        """Loopback addresses should be trusted."""
        assert middleware._is_trusted_proxy("127.0.0.1")
        assert middleware._is_trusted_proxy("::1")

    def test_ipv6_loopback(self, middleware):
        """IPv6 loopback should be trusted."""
        assert middleware._is_trusted_proxy("::1")

    def test_edge_of_cidr_range(self):
        """Edge cases at CIDR boundaries for explicitly configured networks."""
        app = MagicMock()
        middleware = RateLimitMiddleware(app, enabled=True, trusted_proxies={"10.0.0.0/8"})

        # First IP in 10.0.0.0/8
        assert middleware._is_trusted_proxy("10.0.0.0")
        # Last IP in 10.0.0.0/8
        assert middleware._is_trusted_proxy("10.255.255.255")
        # Just outside
        assert not middleware._is_trusted_proxy("9.255.255.255")
        assert not middleware._is_trusted_proxy("11.0.0.0")

    def test_invalid_ip_format(self, middleware):
        """Invalid IP should return False, not crash."""
        assert not middleware._is_trusted_proxy("not-an-ip")
        assert not middleware._is_trusted_proxy("")
        assert not middleware._is_trusted_proxy("256.256.256.256")
        assert not middleware._is_trusted_proxy("10.0.0")  # Incomplete

    def test_custom_trusted_proxies(self):
        """Custom trusted proxy configuration."""
        app = MagicMock()
        middleware = RateLimitMiddleware(app, enabled=True, trusted_proxies={"1.2.3.4", "5.6.0.0/16"})

        # Custom entries should work
        assert middleware._is_trusted_proxy("1.2.3.4")
        assert middleware._is_trusted_proxy("5.6.100.200")

        # Defaults should NOT be in custom list
        assert not middleware._is_trusted_proxy("10.0.0.5")  # Not in custom list

    def test_custom_private_cidr_can_still_be_explicitly_trusted(self):
        """Private proxy networks remain supported when configured explicitly."""
        app = MagicMock()
        middleware = RateLimitMiddleware(app, enabled=True, trusted_proxies={"10.0.0.0/8"})

        assert middleware._is_trusted_proxy("10.0.0.5")
        assert middleware._is_trusted_proxy("10.255.255.255")


class TestInvalidConfig:
    """Tests for graceful handling of invalid configuration."""

    def test_invalid_cidr_in_config_skipped(self):
        """Invalid CIDR entries should be skipped, not crash."""
        app = MagicMock()
        # This should not raise, just log a warning
        middleware = RateLimitMiddleware(app, enabled=True, trusted_proxies={"invalid-cidr", "10.0.0.0/8", "also-bad"})

        # Valid entry should still work
        assert middleware._is_trusted_proxy("10.0.0.5")
        # Invalid entries were skipped, not crashing
        assert not middleware._is_trusted_proxy("invalid-cidr")


def test_validate_production_settings_warns_on_broad_trusted_proxy_ranges(monkeypatch):
    warnings: list[tuple[str, dict[str, object]]] = []

    def capture_warning(event: str, **kwargs):
        warnings.append((event, kwargs))

    monkeypatch.setattr("app.main.logger.warning", capture_warning)

    settings = Settings(
        secret_key="test-secret-key-32-chars-minimum-value",
        debug=False,
        database_url="postgresql+asyncpg://riskhub:secret@postgres.example.com:5432/riskhub",
        cors_origins=["https://riskhub.example.com"],
        auth_mode="microsoft_sso",
        entra_tenant_id="00000000-0000-0000-0000-000000000000",
        entra_client_id="11111111-1111-1111-1111-111111111111",
        trusted_proxies=["127.0.0.1", "10.0.0.0/8"],
    )

    _validate_production_settings(settings)

    assert warnings
    assert warnings[-1][0] == "trusted_proxy_broad_network_warning"
    assert warnings[-1][1]["trusted_proxies"] == ["10.0.0.0/8"]
