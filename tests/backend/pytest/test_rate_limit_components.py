from __future__ import annotations

from app.core.config import Settings
from app.middleware.rate_limit.backend import InMemoryRateLimitBackend
from app.middleware.rate_limit.policy import get_limit_for_path, resolve_rate_limit_rules


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "secret_key": "test-secret-key-32-chars-minimum-value",
        "debug": False,
        "database_url": "postgresql+asyncpg://riskhub:secret@postgres.example.com:5432/riskhub",
        "cors_origins": ["https://riskhub.example.com"],
        "allowed_hosts": ["riskhub.example.com"],
        "auth_mode": "microsoft_sso",
        "entra_tenant_id": "00000000-0000-0000-0000-000000000000",
        "entra_client_id": "11111111-1111-1111-1111-111111111111",
        "entra_client_secret": "entra-client-secret",
    }
    values.update(overrides)
    return Settings(**values)


def test_rate_limit_policy_prefers_longest_prefix_match() -> None:
    limits = {
        "/api/v1/auth": (2, 60),
        "/api/v1/auth/config": (9, 60),
        "default": (100, 60),
    }

    assert get_limit_for_path(limits, "/api/v1/auth/config") == (9, 60)
    assert get_limit_for_path(limits, "/api/v1/auth/login") == (2, 60)


def test_rate_limit_policy_merges_settings_overrides() -> None:
    settings = _settings(rate_limit_limits={"/api/v1/auth/config": (9, 60), "/api/v1/reports": (4, 30)})

    rules = resolve_rate_limit_rules(settings)

    assert rules["/api/v1/auth/config"] == (9, 60)
    assert rules["/api/v1/reports"] == (4, 30)
    assert rules["default"] == (200, 60)


def test_rate_limit_fail_closed_on_backend_error_defaults_true() -> None:
    settings = _settings()

    assert settings.redis.rate_limit_fail_closed_on_backend_error is True


def test_in_memory_rate_limit_backend_keeps_per_key_state_bounded() -> None:
    backend = InMemoryRateLimitBackend()
    now = 1_000.0

    for offset in range(10):
        allowed, _ = backend.check(
            client_ip="198.51.100.10",
            path="/api/v1/auth/login",
            max_requests=3,
            window=60,
            now=now + offset,
        )
        if offset < 3:
            assert allowed is True
        else:
            assert allowed is False

    state = backend.state["198.51.100.10:/api/v1/auth/login"]
    assert len(state.requests) <= 3
