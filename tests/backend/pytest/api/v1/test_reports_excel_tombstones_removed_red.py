"""RED: legacy /excel tombstones are removed while /export xlsx rejection remains."""

import pytest

pytestmark = pytest.mark.contract


@pytest.mark.asyncio
async def test_excel_tombstones_return_404(client_factory, test_user) -> None:
    async with client_factory(current_user=test_user) as client:
        for path in (
            "/api/v1/reports/controls/excel",
            "/api/v1/reports/risks/excel",
            "/api/v1/reports/summary/excel",
            "/api/v1/reports/audit-trail/excel",
        ):
            response = await client.get(path)
            assert response.status_code == 404, path


@pytest.mark.asyncio
async def test_export_xlsx_format_still_rejected(client_factory, test_user) -> None:
    async with client_factory(current_user=test_user) as client:
        for path in (
            "/api/v1/reports/audit-trail/export?format=xlsx",
            "/api/v1/reports/summary/export?format=xlsx",
        ):
            response = await client.get(path)
            assert response.status_code == 410
            assert response.json()["detail"]["code"] == "excel_export_removed"
