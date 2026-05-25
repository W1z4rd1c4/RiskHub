from collections import Counter

OPEN_COUNTED_STATUSES = {"open", "triaged", "in_progress", "ready_for_validation"}


def _counted_issues(seed_module):
    return [
        issue
        for issue in seed_module.E2E_ISSUES
        if issue["status"] in OPEN_COUNTED_STATUSES and not issue.get("active_approved_exception", False)
    ]


def test_e2e_issue_seed_populates_dashboard_contract() -> None:
    from scripts import seed_e2e_issues

    counted = _counted_issues(seed_e2e_issues)

    assert len(counted) == 8

    aging = Counter(issue["age_bucket"] for issue in counted)
    assert aging == {"0-7": 2, "8-30": 3, "31-60": 1, "61+": 2}

    severities = Counter(issue["severity"] for issue in counted)
    assert severities == {"low": 2, "medium": 2, "high": 2, "critical": 2}

    assert sum(1 for issue in counted if issue["due_days_from_now"] < 0) == 4
    assert sum(1 for issue in counted if issue["severity"] in {"high", "critical"}) == 4

    ages = sorted(issue["opened_days_ago"] for issue in counted)
    midpoint = len(ages) // 2
    assert (ages[midpoint - 1] + ages[midpoint]) // 2 == 23


def test_e2e_issue_seed_includes_excluded_guard_fixtures() -> None:
    from scripts import seed_e2e_issues

    assert any(issue["status"] == "closed" for issue in seed_e2e_issues.E2E_ISSUES)
    assert any(issue.get("active_approved_exception") is True for issue in seed_e2e_issues.E2E_ISSUES)


def test_e2e_all_runs_issue_seed_and_summarizes_issues() -> None:
    from pathlib import Path

    import scripts.seed_e2e_all as seed_e2e_all

    source = Path(seed_e2e_all.__file__).read_text()

    assert "from scripts.seed_e2e_issues import seed_issues" in source
    assert '"Seeding Issues"' in source
    assert "issues_total" in source
    assert "Issue.title.like" in source
