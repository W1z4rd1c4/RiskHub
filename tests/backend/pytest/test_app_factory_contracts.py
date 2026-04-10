from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import (
    configure_app_dependencies,
    configure_default_runtime_state,
    parse_log_rotation_config,
    register_routes,
)


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "debug": True,
        "secret_key": "test-secret-key-32-chars-minimum-value",
        "app_name": "RiskHub",
        "app_version": "1.0.0-test",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_parse_log_rotation_config_returns_canonical_values() -> None:
    parsed = parse_log_rotation_config(
        {
            "app_log_rotation_size_mb": "50",
            "app_log_retention_count": "7",
            "audit_log_rotation_size_mb": None,
            "audit_log_retention_count": "14",
        }
    )

    assert parsed == {
        "app_log_rotation_size_mb": 50,
        "app_log_retention_count": 7,
        "audit_log_rotation_size_mb": None,
        "audit_log_retention_count": 14,
    }


def test_configure_default_runtime_state_initializes_in_memory_services() -> None:
    app = FastAPI()

    configure_default_runtime_state(app, _settings())

    assert app.state.redis is None
    assert app.state.account_lockout is not None
    assert app.state.sso_challenge_store is not None
    assert app.state.process_started_at.tzinfo is not None


def test_configure_app_dependencies_overrides_get_settings() -> None:
    app = FastAPI()
    settings = _settings(app_name="RiskHub Override")

    configure_app_dependencies(app, settings)

    override = app.dependency_overrides[get_settings]
    assert override() is settings


def test_register_routes_keeps_debug_docs_pointer_behavior() -> None:
    production_app = FastAPI()
    register_routes(production_app, _settings(debug=False))
    with TestClient(production_app) as client:
        assert client.get("/").json() == {"name": "RiskHub", "version": "1.0.0-test"}

    debug_app = FastAPI()
    register_routes(debug_app, _settings(debug=True))
    with TestClient(debug_app) as client:
        assert client.get("/").json() == {
            "name": "RiskHub",
            "version": "1.0.0-test",
            "docs": "/docs",
        }


def test_main_source_does_not_call_configure_logging_at_import() -> None:
    main_source = Path(__file__).resolve().parents[3] / "backend" / "app" / "main.py"
    text = main_source.read_text(encoding="utf-8")

    assert "configure_logging()" not in text
