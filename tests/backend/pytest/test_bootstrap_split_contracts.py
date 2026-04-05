from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.bootstrap_app import configure_app_dependencies, register_routes
from app.bootstrap_runtime import configure_default_runtime_state
from app.bootstrap_validation import parse_log_rotation_config
from app.core.config import Settings, get_settings


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "debug": True,
        "secret_key": "test-secret-key-32-chars-minimum-value",
        "app_name": "RiskHub",
        "app_version": "1.0.0-test",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_parse_log_rotation_config_stays_owned_by_validation_module() -> None:
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
