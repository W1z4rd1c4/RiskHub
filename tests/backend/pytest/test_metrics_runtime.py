from __future__ import annotations

import sys

from app.core.config import Settings
from app.main import create_app
from app.middleware.rate_limit.middleware import RATE_LIMIT_BACKEND_UNAVAILABLE_TOTAL


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "debug": True,
        "secret_key": "test-secret-key-32-chars-minimum-value",
        "app_name": "RiskHub",
        "app_version": "1.0.0-test",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_metrics_route_absent_by_default_and_present_when_enabled() -> None:
    default_app = create_app(_settings(metrics_enabled=False))
    metrics_app = create_app(_settings(metrics_enabled=True))

    assert "/metrics" not in {getattr(route, "path", "") for route in default_app.routes}
    assert "/metrics" in {getattr(route, "path", "") for route in metrics_app.routes}


def test_rate_limit_backend_unavailable_counter_is_scrapable_when_metrics_enabled() -> None:
    create_app(_settings(metrics_enabled=True))

    RATE_LIMIT_BACKEND_UNAVAILABLE_TOTAL.inc()

    samples = [
        sample
        for metric in RATE_LIMIT_BACKEND_UNAVAILABLE_TOTAL.collect()
        for sample in metric.samples
        if sample.name == "riskhub_rate_limit_backend_unavailable_total"
    ]
    assert samples
    assert samples[0].labels == {}


def test_otel_exporter_is_configured_only_when_endpoint_set(monkeypatch) -> None:
    from app.core.otel import configure_opentelemetry

    calls: list[tuple[str, str]] = []

    def fake_configure(endpoint: str, service_name: str) -> None:
        calls.append((endpoint, service_name))

    assert configure_opentelemetry(_settings(), configure_exporter=fake_configure) is False
    assert calls == []

    assert (
        configure_opentelemetry(
            _settings(
                otel_exporter_otlp_endpoint="http://otel-collector:4318/v1/traces",
                otel_service_name="riskhub-api",
            ),
            configure_exporter=fake_configure,
        )
        is True
    )
    assert calls == [("http://otel-collector:4318/v1/traces", "riskhub-api")]


def test_otel_exporter_normalizes_collector_base_url_to_traces_endpoint(monkeypatch) -> None:
    from app.core.otel import configure_opentelemetry

    calls: list[tuple[str, str]] = []

    def fake_configure(endpoint: str, service_name: str) -> None:
        calls.append((endpoint, service_name))

    assert (
        configure_opentelemetry(
            _settings(otel_exporter_otlp_endpoint="http://otel-collector:4318"),
            configure_exporter=fake_configure,
        )
        is True
    )
    assert (
        configure_opentelemetry(
            _settings(otel_exporter_otlp_endpoint="http://otel-collector:4318/"),
            configure_exporter=fake_configure,
        )
        is True
    )
    assert calls == [
        ("http://otel-collector:4318/v1/traces", "riskhub-api"),
        ("http://otel-collector:4318/v1/traces", "riskhub-api"),
    ]


def test_otel_missing_dependency_error_is_actionable(monkeypatch) -> None:
    import builtins

    from app.core.otel import configure_opentelemetry

    for name in list(sys.modules):
        if name.startswith("opentelemetry"):
            monkeypatch.delitem(sys.modules, name, raising=False)

    original_import = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name.startswith("opentelemetry"):
            raise ModuleNotFoundError(name)
        return original_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    try:
        configure_opentelemetry(
            _settings(otel_exporter_otlp_endpoint="http://otel-collector:4318/v1/traces"),
        )
    except RuntimeError as exc:
        assert "opentelemetry" in str(exc)
        assert "OTEL_EXPORTER_OTLP_ENDPOINT" in str(exc)
    else:
        raise AssertionError("missing OpenTelemetry dependencies should fail with an actionable error")
