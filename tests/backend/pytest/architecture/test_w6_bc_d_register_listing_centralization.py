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
    register_vendor_source = _read("backend/app/services/_register_listings/vendors.py")

    assert "from app.services._register_listings.vendors import list_vendor_governance" in vendor_crud_source
    assert "list_vendor_governance" in register_vendor_source
    assert not (ROOT / "backend/app/services/_vendor_governance/listing.py").exists()
