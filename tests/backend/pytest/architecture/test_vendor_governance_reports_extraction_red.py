"""RED: row formatters live in _vendor_governance.reports, not in the endpoint."""

import inspect

import pytest

pytestmark = pytest.mark.contract


def test_annual_report_rows_lives_in_vendor_governance() -> None:
    from app.services._vendor_governance.reports import annual_report_rows

    assert callable(annual_report_rows)


def test_dora_register_rows_lives_in_vendor_governance() -> None:
    from app.services._vendor_governance.reports import dora_register_rows

    assert callable(dora_register_rows)


def test_endpoint_does_not_redefine_row_formatters() -> None:
    from app.api.v1.endpoints import vendor_reports as ep

    src = inspect.getsource(ep)
    assert "def _annual_report_rows" not in src
    assert "def _dora_register_rows" not in src
    assert "from app.services._vendor_governance.reports import" in src


def test_annual_headers_preserved() -> None:
    from app.services._vendor_governance.reports import annual_report_rows

    sig = inspect.signature(annual_report_rows)
    assert list(sig.parameters) == ["report"]
