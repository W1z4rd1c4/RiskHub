"""RED: _monitoring_response endpoints shim deleted; canonical service path used."""

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract


def test_endpoint_shim_file_deleted() -> None:
    assert not Path("backend/app/api/v1/endpoints/_monitoring_response.py").exists()


def test_no_endpoint_imports_shim() -> None:
    import subprocess

    out = subprocess.run(
        ["grep", "-rn", "from app.api.v1.endpoints._monitoring_response", "backend", "--include=*.py"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert out.stdout == "", f"Unexpected importers:\n{out.stdout}"


def test_canonical_service_module_exposes_surface() -> None:
    from app.services import _monitoring_response as svc

    for name in (
        "MonitoringResponseContext",
        "build_control_monitoring_fields",
        "build_kri_monitoring_fields",
        "load_monitoring_response_context",
        "serialize_control_brief_for_link",
        "serialize_control_read",
        "serialize_control_risk_link",
        "serialize_kri_response",
        "serialize_risk_read",
    ):
        assert hasattr(svc, name), name
