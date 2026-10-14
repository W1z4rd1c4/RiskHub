from pathlib import Path

import pytest

from ._registry_policy import load_architecture_registry

pytestmark = pytest.mark.contract


ROOT = Path(__file__).resolve().parents[4]
ARCHIVE_ALLOWLIST = ROOT / "tests/backend/pytest/architecture/_archive_allowlist.toml"


def _archive_allowlist_paths() -> set[str]:
    data = load_architecture_registry(ARCHIVE_ALLOWLIST, decision="ADR-005")
    for entry in data["paths"]:
        assert entry.get("rationale"), f"archive owner needs rationale: {entry!r}"
    return {entry["path"] for entry in data.get("paths", [])}


def test_archive_allowlist_registry_is_present_and_scoped():
    paths = _archive_allowlist_paths()

    assert paths == {
        "backend/app/models/_archivable.py",
        "backend/app/models/key_risk_indicator.py",
        "backend/alembic/versions/g2h3i4j5k6l7_add_archivable_columns.py",
        "backend/alembic/versions/h3i4j5k6l7m8_unify_archive_state.py",
    }
    assert all(path.startswith(("backend/app/", "backend/alembic/versions/")) for path in paths)


def test_archive_owner_registry_cannot_admit_new_permanent_exemptions(tmp_path, monkeypatch):
    target = tmp_path / "archive.toml"
    target.write_text(ARCHIVE_ALLOWLIST.read_text() + '''
[[paths]]
path = "backend/app/services/unreviewed_archive.py"
rationale = "Temporary debt cannot be disguised as an accepted schema owner"
''')
    monkeypatch.setitem(globals(), "ARCHIVE_ALLOWLIST", target)
    with pytest.raises(AssertionError):
        test_archive_allowlist_registry_is_present_and_scoped()


def test_register_listings_use_archivable_clause_for_default_archive_filters():
    listing_files = [
        ROOT / "backend/app/services/_register_listings/risks.py",
        ROOT / "backend/app/services/_register_listings/controls.py",
        ROOT / "backend/app/services/_register_listings/kris.py",
        ROOT / "backend/app/services/_register_listings/vendors.py",
    ]

    # Risk delegates both listing rows and facets to the shared replay/list owner.
    risk_source = listing_files[0].read_text()
    assert "risk_row_predicates(Risk, row_criteria)" in risk_source
    assert "apply_risk_lifecycle(facet_query, lifecycle)" in risk_source
    for path in listing_files[1:]:
        text = path.read_text()
        assert "archived_clause(" in text, f"{path} should use the Archivable interface"

    assert "Risk.status != RiskStatusEnum.archived.value" not in listing_files[0].read_text()
    assert "Control.status != ControlStatusEnum.archived.value" not in listing_files[1].read_text()
    assert "query = query.where(Vendor.status == VendorStatusEnum.active.value)" not in listing_files[3].read_text()


def _assert_risk_archive_delegation(monkeypatch, entrypoint, lifecycle):
    from sqlalchemy import select
    from sqlalchemy.dialects import postgresql, sqlite

    from app.models._archivable import archived_clause
    from app.models.risk import Risk
    from app.services import risk_row_criteria
    from app.services._register_listings import risks

    calls = []

    def tracked_archive_clause(source, *, archived=True):
        assert source.__tablename__ == "risks"
        assert source.is_archived is Risk.is_archived
        assert source.status is Risk.status
        calls.append(archived)
        return archived_clause(source, archived=archived)

    monkeypatch.setattr(risk_row_criteria, "archived_clause", tracked_archive_clause)
    query = select(Risk.id)
    if entrypoint == "planner":
        actual = risks.apply_risk_lifecycle(query, lifecycle)
    else:
        criteria = risk_row_criteria.parse_risk_row_criteria({"lifecycle": lifecycle})
        actual = query.where(*risk_row_criteria.risk_row_predicates(Risk, criteria))
    expected = query
    if lifecycle != "all":
        expected = query.where(Risk.archived() if lifecycle == "archived" else Risk.live())
    assert calls == ([] if lifecycle == "all" else [lifecycle == "archived"])
    for dialect in (sqlite.dialect(), postgresql.dialect()):
        options = {"dialect": dialect, "compile_kwargs": {"literal_binds": True}}
        assert str(actual.compile(**options)) == str(expected.compile(**options))


@pytest.mark.parametrize("entrypoint", ["planner", "row_predicates"])
@pytest.mark.parametrize("lifecycle", ["active", "archived", "all"])
def test_risk_archive_delegation_matches_canonical_predicate(monkeypatch, entrypoint, lifecycle):
    _assert_risk_archive_delegation(monkeypatch, entrypoint, lifecycle)


@pytest.mark.parametrize("entrypoint", ["planner", "row_predicates"])
@pytest.mark.parametrize("lifecycle", ["active", "archived"])
def test_risk_archive_contract_detects_seeded_predicate_bypass(monkeypatch, entrypoint, lifecycle):
    from app.services import risk_row_criteria
    from app.services._register_listings import risks

    owner = risks if entrypoint == "planner" else risk_row_criteria
    monkeypatch.setattr(owner, "risk_lifecycle_predicates", lambda source, lifecycle: [])
    with pytest.raises(AssertionError):
        _assert_risk_archive_delegation(monkeypatch, entrypoint, lifecycle)


@pytest.mark.parametrize("entrypoint", ["planner", "row_predicates"])
def test_risk_archive_contract_detects_seeded_all_filter(monkeypatch, entrypoint):
    from app.models.risk import Risk
    from app.services import risk_row_criteria
    from app.services._register_listings import risks

    owner = risks if entrypoint == "planner" else risk_row_criteria
    monkeypatch.setattr(owner, "risk_lifecycle_predicates", lambda source, lifecycle: [Risk.live()])
    with pytest.raises(AssertionError):
        _assert_risk_archive_delegation(monkeypatch, entrypoint, "all")


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
