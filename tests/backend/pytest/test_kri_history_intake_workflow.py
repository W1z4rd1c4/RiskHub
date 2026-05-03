import subprocess
import sys
from pathlib import Path

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
