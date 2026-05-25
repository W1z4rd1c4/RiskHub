"""Deployment docs must advertise opt-in metrics and OpenTelemetry settings."""

from __future__ import annotations

from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[4]

pytestmark = pytest.mark.contract


def test_metrics_enabled_is_documented_for_production_deployment() -> None:
    docs = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (
            REPO_ROOT / "docs" / "deployment" / "README.md",
            REPO_ROOT / "docs" / "deployment" / "reference.md",
            REPO_ROOT / "scripts" / "deploy" / "templates" / "riskhub.env.example",
            REPO_ROOT / "scripts" / "prod" / "config" / "backend.env.example",
            REPO_ROOT / "scripts" / "deploy" / "lib" / "render.py",
        )
    )

    assert "METRICS_ENABLED" in docs
    assert "/metrics" in docs
    assert "OpenTelemetry" in docs
    assert "OTEL_EXPORTER_OTLP_ENDPOINT" in docs
    assert "emitted spans" in docs
    assert "enables OpenTelemetry OTLP HTTP trace export" not in docs
