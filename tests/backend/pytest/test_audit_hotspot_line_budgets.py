from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]

HOTSPOT_LINE_BUDGETS = {
    "backend/app/api/v1/endpoints/risks/crud/list.py": 524,
    "backend/app/api/v1/endpoints/controls/crud/list.py": 626,
    "backend/app/api/v1/endpoints/issues/crud/list.py": 593,
    "backend/app/api/v1/endpoints/kris/crud/list.py": 470,
    "backend/app/api/v1/endpoints/riskhub/departments.py": 235,
    "backend/app/api/v1/endpoints/riskhub/approval_scenarios.py": 116,
    "backend/app/api/v1/endpoints/riskhub/global_config.py": 171,
    "backend/app/services/issue_deadline_service.py": 372,
    "backend/app/services/kri_deadline_service.py": 365,
    "backend/app/services/_notification_approval_helpers.py": 102,
}


def test_remaining_audit_hotspots_do_not_grow() -> None:
    over_budget: list[str] = []
    for relative_path, max_lines in HOTSPOT_LINE_BUDGETS.items():
        line_count = len((REPO_ROOT / relative_path).read_text(encoding="utf-8").splitlines())
        if line_count > max_lines:
            over_budget.append(f"{relative_path}: {line_count} > {max_lines}")

    assert over_budget == []
