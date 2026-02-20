"""Tests for CIDR matching in security middleware.

Verifies that the trusted proxy detection correctly handles:
- IPv4 CIDR ranges
- IPv6 CIDR ranges
- Single IP addresses
- Invalid inputs (graceful handling)
"""

from unittest.mock import MagicMock

import pytest

from app.middleware.security import RateLimitMiddleware


class TestCIDRMatching:
    """Tests for _is_trusted_proxy method."""

    @pytest.fixture
    def middleware(self):
        """Create middleware instance with default trusted proxies."""
        app = MagicMock()
        return RateLimitMiddleware(app, enabled=True)

    def test_ipv4_in_cidr_range(self, middleware):
        """IP within CIDR range should be trusted."""
        assert middleware._is_trusted_proxy("10.0.0.5")
        assert middleware._is_trusted_proxy("10.255.255.255")
        assert middleware._is_trusted_proxy("192.168.1.100")
        assert middleware._is_trusted_proxy("172.20.30.40")

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

    def test_edge_of_cidr_range(self, middleware):
        """Edge cases at CIDR boundaries."""
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
