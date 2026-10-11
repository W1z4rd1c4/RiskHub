"""#266 export adapters must not recreate KRI period or window rules."""

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract
ROOT = Path(__file__).resolve().parents[4] / "backend/app/services/_reporting/exports"
PERIOD_HELPERS = {
    "period_bounds_for_date",
    "latest_closed_period_for_date",
    "overdue_required_period_end",
    "never_reported_is_overdue",
    "timedelta",
}


def offenders(sources):
    found = []
    for name, source in sources.items():
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                called = node.func.id if isinstance(node.func, ast.Name) else getattr(node.func, "attr", None)
                if called in PERIOD_HELPERS:
                    found.append(name)
                    break
            if isinstance(node, ast.Compare) and any(
                isinstance(child, ast.Constant) and child.value == "last_period_end" for child in ast.walk(node)
            ):
                found.append(name)
                break
    return sorted(set(found))


def test_export_population_rules_are_delegated():
    assert offenders({str(path.relative_to(ROOT)): path.read_text() for path in ROOT.rglob("*.py")}) == []


@pytest.mark.parametrize(
    "copy",
    [
        "cutoff = period_bounds_for_date(today, frequency)",
        "advance = timedelta(days=7)",
        'overdue = row["last_period_end"] < today',
    ],
)
def test_seeded_new_export_caller_cannot_copy_rules(copy):
    assert offenders({"new_unlisted_caller.py": copy}) == ["new_unlisted_caller.py"]


def test_export_adapter_relocation_preserves_lock():
    source = "answer = is_overdue(population_state(row), today=as_of_date)"
    assert offenders({"filters.py": source}) == offenders({"internal/filters.py": source}) == []
