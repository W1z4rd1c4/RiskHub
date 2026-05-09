from __future__ import annotations

from app.models._archivable import archived_clause
from app.models.control import Control
from app.models.risk import Risk
from app.models.vendor import Vendor


def _sql(clause) -> str:
    return str(clause.compile(compile_kwargs={"literal_binds": True}))


def test_archived_clause_reads_new_flag_and_legacy_archive_statuses_during_cutover() -> None:
    assert "risks.is_archived IS true" in _sql(archived_clause(Risk, archived=True))
    assert "risks.status IN ('archived')" in _sql(archived_clause(Risk, archived=True))
    assert "controls.is_archived IS true" in _sql(archived_clause(Control, archived=True))
    assert "controls.status IN ('archived')" in _sql(archived_clause(Control, archived=True))
    assert "vendors.is_archived IS true" in _sql(archived_clause(Vendor, archived=True))
    assert "vendors.status IN ('inactive')" in _sql(archived_clause(Vendor, archived=True))


def test_live_clause_excludes_new_archive_flag_and_legacy_archive_statuses_during_cutover() -> None:
    assert "risks.is_archived IS false" in _sql(archived_clause(Risk, archived=False))
    assert "(risks.status NOT IN ('archived'))" in _sql(archived_clause(Risk, archived=False))
    assert "controls.is_archived IS false" in _sql(archived_clause(Control, archived=False))
    assert "(controls.status NOT IN ('archived'))" in _sql(archived_clause(Control, archived=False))
    assert "vendors.is_archived IS false" in _sql(archived_clause(Vendor, archived=False))
    assert "(vendors.status NOT IN ('inactive'))" in _sql(archived_clause(Vendor, archived=False))
