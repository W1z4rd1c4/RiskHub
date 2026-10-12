from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract


ROOT = Path(__file__).resolve().parents[4]


def _read(path: str) -> str:
    return (ROOT / path).read_text()


def test_kri_and_control_list_endpoints_are_thin_register_listing_adapters() -> None:
    endpoint_paths = [
        "backend/app/api/v1/endpoints/kris/crud/list.py",
        "backend/app/api/v1/endpoints/controls/crud/list.py",
    ]
    forbidden_snippets = (
        "from sqlalchemy import",
        "serialize_kris",
        "serialize_controls",
        "load_total",
        "get_control_group_entries",
        "select(",
        "func.",
        "selectinload",
    )

    for path in endpoint_paths:
        source = _read(path)
        for snippet in forbidden_snippets:
            assert snippet not in source, f"{path} still owns listing internals: {snippet}"


def test_vendor_listing_orchestration_lives_in_register_listings_module() -> None:
    vendor_crud_source = _read("backend/app/api/v1/endpoints/vendors/crud.py")
    import inspect

    from app.api.v1.endpoints.vendors import crud as adapter
    from app.services import _register_listings
    from tests.backend.pytest.architecture._private_api_boundary import load_surfaces, violations

    operation = _register_listings.list_vendor_governance
    assert adapter.list_vendor_governance is operation
    assert violations(vendor_crud_source, adapter.__name__, load_surfaces(ROOT)) == []
    assert operation.__name__ in inspect.getsource(inspect.getmodule(operation))
    assert not (ROOT / "backend/app/services/_vendor_governance/listing.py").exists()
