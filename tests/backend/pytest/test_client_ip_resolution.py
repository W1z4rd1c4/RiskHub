from unittest.mock import MagicMock

from starlette.requests import Request

from app.core.tokens import get_request_client_ip
from app.middleware.logging_context import LoggingContextMiddleware
from app.middleware.security import RateLimitMiddleware


def _build_request(peer_ip: str, xff: str | None = None) -> Request:
    headers: list[tuple[bytes, bytes]] = []
    if xff is not None:
        headers.append((b"x-forwarded-for", xff.encode("utf-8")))

    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/api/v1/health",
        "raw_path": b"/api/v1/health",
        "query_string": b"",
        "headers": headers,
        "client": (peer_ip, 12345),
        "server": ("testserver", 80),
    }
    return Request(scope)


def _build_middlewares(trusted_proxies: set[str]) -> tuple[RateLimitMiddleware, LoggingContextMiddleware]:
    app = MagicMock()
    rate_limit = RateLimitMiddleware(app, enabled=True, trusted_proxies=trusted_proxies)
    logging_context = LoggingContextMiddleware(app, trusted_proxies=trusted_proxies)
    return rate_limit, logging_context


def test_trusted_proxy_spoofed_leading_xff_returns_rightmost_untrusted_hop():
    rate_limit, _ = _build_middlewares({"10.0.0.0/8"})
    request = _build_request("10.0.0.9", "198.51.100.1, 203.0.113.5")
    assert rate_limit._get_client_ip(request) == "203.0.113.5"


def test_untrusted_peer_ignores_xff():
    rate_limit, _ = _build_middlewares({"10.0.0.0/8"})
    request = _build_request("203.0.113.25", "198.51.100.1, 203.0.113.5")
    assert rate_limit._get_client_ip(request) == "203.0.113.25"


def test_default_helper_ignores_private_peer_xff_without_explicit_proxy_config():
    request = _build_request("10.0.0.9", "198.51.100.1, 203.0.113.5")
    assert get_request_client_ip(request) == "10.0.0.9"


def test_multi_proxy_chain_strips_trusted_hops_from_right():
    trusted = {"10.0.0.0/8", "172.16.0.0/12"}
    rate_limit, _ = _build_middlewares(trusted)
    request = _build_request("10.0.0.8", "198.51.100.42, 172.16.1.10, 10.1.2.3")
    assert rate_limit._get_client_ip(request) == "198.51.100.42"


def test_invalid_xff_tokens_are_ignored_with_safe_fallback():
    rate_limit, _ = _build_middlewares({"10.0.0.0/8"})
    request = _build_request("10.0.0.8", "totally-invalid, also-invalid")
    assert rate_limit._get_client_ip(request) == "10.0.0.8"


def test_ipv6_trusted_proxy_chain_resolution():
    trusted = {"::1", "fd00::/8"}
    rate_limit, _ = _build_middlewares(trusted)
    request = _build_request("::1", "2001:db8::10, fd00::1")
    assert rate_limit._get_client_ip(request) == "2001:db8::10"


def test_ipv6_untrusted_peer_ignores_xff():
    rate_limit, _ = _build_middlewares({"::1"})
    request = _build_request("2001:db8::99", "2001:db8::10")
    assert rate_limit._get_client_ip(request) == "2001:db8::99"


def test_logging_and_rate_limit_share_identical_client_ip_resolution():
    trusted = {"10.0.0.0/8", "172.16.0.0/12"}
    rate_limit, logging_context = _build_middlewares(trusted)
    request = _build_request("10.0.0.9", "198.51.100.1, 203.0.113.5, 172.16.8.7")

    assert rate_limit._get_client_ip(request) == logging_context._get_client_ip(request)


def test_token_helper_shares_identical_client_ip_resolution():
    trusted = {"10.0.0.0/8", "172.16.0.0/12"}
    rate_limit, logging_context = _build_middlewares(trusted)
    request = _build_request("10.0.0.9", "198.51.100.1, 203.0.113.5, 172.16.8.7")

    expected = "203.0.113.5"
    assert rate_limit._get_client_ip(request) == expected
    assert logging_context._get_client_ip(request) == expected
    assert get_request_client_ip(request, trusted) == expected
