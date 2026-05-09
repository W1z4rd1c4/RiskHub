import importlib
from pathlib import Path


def _source(module) -> str:
    return Path(module.__file__).read_text()


def test_e2e_vendor_seed_uses_archive_flag_not_inactive_status():
    seed_vendors = importlib.import_module("scripts.seed_e2e_vendors")
    source = _source(seed_vendors)

    assert "VendorStatus.inactive" not in source

    archived_entries = [
        entry
        for entry in seed_vendors.E2E_VENDORS
        if entry["registration_id"] in {"E2E-VREG-004", "E2E-VREG-005"}
    ]
    assert len(archived_entries) == 2
    assert all(entry["is_archived"] is True for entry in archived_entries)
    assert "Vendor.is_archived.is_(True)" in source


def test_e2e_archive_seed_uses_archive_flags_for_matrix_rows():
    seed_archives = importlib.import_module("scripts.seed_e2e_archives")
    source = _source(seed_archives)

    archived_risk = next(entry for entry in seed_archives.RISK_MATRIX if entry["risk_id_code"].endswith("ARCHIVED"))
    archived_control = next(entry for entry in seed_archives.CONTROL_MATRIX if "Archived" in entry["name"])
    archived_vendor = next(
        entry for entry in seed_archives.VENDOR_STATUS_MATRIX if entry["registration_id"] == "E2E-VREG-004"
    )

    assert archived_risk["status"] == "active"
    assert archived_risk["is_archived"] is True
    assert archived_control["status"] == "active"
    assert archived_control["is_archived"] is True
    assert archived_vendor["is_archived"] is True
    assert 'Risk.status == "archived"' not in source
    assert 'Control.status == "archived"' not in source
    assert 'Vendor.status == "inactive"' not in source


def test_e2e_all_summary_counts_archives_by_archive_flag():
    seed_all = importlib.import_module("scripts.seed_e2e_all")
    source = _source(seed_all)

    assert 'Risk.status == "archived"' not in source
    assert 'Control.status == "archived"' not in source
    assert 'Vendor.status == "inactive"' not in source
    assert "Risk.is_archived.is_(True)" in source
    assert "Control.is_archived.is_(True)" in source
    assert "Vendor.is_archived.is_(True)" in source
