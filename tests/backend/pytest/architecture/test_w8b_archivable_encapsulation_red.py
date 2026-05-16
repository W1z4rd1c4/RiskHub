import tomllib
from pathlib import Path

import pytest

from ._allowlist_expiry import assert_not_expired

pytestmark = pytest.mark.contract


ROOT = Path(__file__).resolve().parents[4]
ARCHIVE_ALLOWLIST = ROOT / "tests/backend/pytest/architecture/_archive_allowlist.toml"


def _archive_allowlist_paths() -> set[str]:
    assert_not_expired(ARCHIVE_ALLOWLIST)
    data = tomllib.loads(ARCHIVE_ALLOWLIST.read_text())
    return {entry["path"] for entry in data.get("paths", [])}


def test_archive_allowlist_registry_is_present_and_scoped():
    paths = _archive_allowlist_paths()

    assert "backend/app/models/_archivable.py" in paths
    assert all(path.startswith(("backend/app/", "backend/alembic/versions/")) for path in paths)


def test_register_listings_use_archivable_clause_for_default_archive_filters():
    listing_files = [
        ROOT / "backend/app/services/_register_listings/risks.py",
        ROOT / "backend/app/services/_register_listings/controls.py",
        ROOT / "backend/app/services/_register_listings/kris.py",
        ROOT / "backend/app/services/_register_listings/vendors.py",
    ]

    for path in listing_files:
        text = path.read_text()
        assert "archived_clause(" in text, f"{path} should use the Archivable interface"

    assert "Risk.status != RiskStatusEnum.archived.value" not in listing_files[0].read_text()
    assert "Control.status != ControlStatusEnum.archived.value" not in listing_files[1].read_text()
    assert "query = query.where(Vendor.status == VendorStatusEnum.active.value)" not in listing_files[3].read_text()


def test_archivable_mixin_exposes_deep_interface():
    source = (ROOT / "backend/app/models/_archivable.py").read_text()

    for symbol in (
        "def live(",
        "def archived(",
        "def mark_archived(",
        "def mark_restored(",
    ):
        assert symbol in source


def test_vendor_capabilities_use_archivable_state_not_inactive_status():
    source = (ROOT / "backend/app/services/_authorization_capabilities/vendors.py").read_text()

    assert 'vendor.status == "inactive"' not in source
    assert "vendor.is_archived" in source


def test_archive_status_literals_are_not_model_lifecycle_values():
    model_sources = [
        ROOT / "backend/app/models/risk.py",
        ROOT / "backend/app/models/control.py",
        ROOT / "backend/app/models/key_risk_indicator.py",
        ROOT / "backend/app/models/vendor.py",
        ROOT / "backend/app/schemas/risk.py",
        ROOT / "backend/app/schemas/control.py",
        ROOT / "backend/app/schemas/vendor.py",
    ]

    for path in model_sources:
        source = path.read_text()
        assert 'archived = "archived"' not in source, f"{path} still exposes archive state as lifecycle status"
        if path.name == "vendor.py":
            assert 'inactive = "inactive"' not in source, f"{path} still exposes vendor archive state as status"


def test_key_risk_indicator_uses_archivable_contract():
    from app.models.key_risk_indicator import KeyRiskIndicator

    for symbol in (
        "is_archived",
        "archived_at",
        "archived_by_id",
        "live",
        "archived",
        "mark_archived",
        "mark_restored",
    ):
        assert hasattr(KeyRiskIndicator, symbol)

    source = (ROOT / "backend/app/models/key_risk_indicator.py").read_text()
    assert "class KeyRiskIndicator(ArchivableMixin, Base):" in source
    assert "is_archived: Mapped[bool] = mapped_column" not in source
    assert "archived_at: Mapped[Optional[datetime]] = mapped_column" not in source
    assert "archived_by_id: Mapped[Optional[int]] = mapped_column" not in source
