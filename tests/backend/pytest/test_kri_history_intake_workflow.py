import subprocess
import sys
from datetime import date
from pathlib import Path
from types import SimpleNamespace

from app.services._kri_history.intake import KRIValueIntakeMode, select_kri_value_intake_mode


def test_kri_value_intake_mode_names_are_stable():
    assert KRIValueIntakeMode.DIRECT.value == "direct"
    assert KRIValueIntakeMode.APPROVAL.value == "approval"
    assert select_kri_value_intake_mode(can_resolve=True) is KRIValueIntakeMode.DIRECT
    assert select_kri_value_intake_mode(can_resolve=False) is KRIValueIntakeMode.APPROVAL


def test_kri_value_intake_service_imports_without_endpoint_bootstrap():
    repo_root = Path(__file__).resolve().parents[3]
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "from app.services._kri_history.intake import record_kri_value_intake; "
                "print(record_kri_value_intake.__name__)"
            ),
        ],
        cwd=repo_root / "backend",
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "record_kri_value_intake"


def test_kri_value_governance_centralizes_mutation_and_breach_rules():
    from app.services._kri_history.governance import (
        build_kri_value_history_activity_changes,
        build_kri_value_mutation_changes,
        capture_kri_value_mutation_snapshot,
        describe_kri_limit_breach,
    )

    kri = SimpleNamespace(current_value=4.0, last_period_end=date(2026, 3, 31), last_reported_at=None)
    snapshot = capture_kri_value_mutation_snapshot(kri)

    kri.current_value = 7.0
    kri.last_period_end = date(2026, 4, 30)

    assert build_kri_value_mutation_changes(kri, snapshot) == {
        "current_value": {"old": 4.0, "new": 7.0},
        "last_period_end": {"old": date(2026, 3, 31), "new": date(2026, 4, 30)},
    }
    assert build_kri_value_history_activity_changes(
        old_value=4.0,
        new_value=7.0,
        period_end=date(2026, 4, 30),
    ) == {
        "value": {"old": 4.0, "new": 7.0},
        "period_end": {"old": None, "new": "2026-04-30"},
    }
    assert describe_kri_limit_breach(value=3.0, lower_limit=5.0, upper_limit=10.0) == (
        "Value 3.0 is below lower limit 5.0"
    )
    assert describe_kri_limit_breach(value=12.0, lower_limit=5.0, upper_limit=10.0) == (
        "Value 12.0 exceeds upper limit 10.0"
    )
    assert describe_kri_limit_breach(value=7.0, lower_limit=5.0, upper_limit=10.0) is None
