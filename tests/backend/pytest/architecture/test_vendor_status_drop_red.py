"""RED: Vendor.status column / VendorStatusEnum / archived_clause shape."""

import inspect

import pytest
from sqlalchemy.dialects import postgresql

pytestmark = pytest.mark.contract


def test_vendor_status_column_dropped() -> None:
    from app.models import Vendor

    assert "status" not in Vendor.__table__.c, "Vendor.status column must be dropped"


def test_vendor_status_enum_class_removed() -> None:
    import app.models.vendor as vendor_module
    import app.schemas.vendor as schema_module

    assert not hasattr(vendor_module, "VendorStatus")
    assert not hasattr(schema_module, "VendorStatusEnum")


def test_archived_clause_collapsed_to_flag_only() -> None:
    from app.models import Vendor
    from app.models._archivable import archived_clause

    clause = archived_clause(Vendor, archived=True)
    sql = str(clause.compile(dialect=postgresql.dialect()))
    assert "vendors.is_archived" in sql
    assert "vendors.status" not in sql


def test_vendor_list_criteria_has_no_status_filter() -> None:
    from app.services._register_listings.vendors import VendorListCriteria

    fields = {f.name for f in VendorListCriteria.__dataclass_fields__.values()}
    assert "status_filter" not in fields
    assert "archived_status_filter" not in fields


def test_coerce_vendor_list_criteria_signature_drops_status_filter() -> None:
    from app.services._register_listings.vendors import coerce_vendor_list_criteria

    sig = inspect.signature(coerce_vendor_list_criteria)
    assert "status_filter" not in sig.parameters
