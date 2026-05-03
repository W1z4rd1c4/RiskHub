from types import SimpleNamespace

from app.services._issue_register import (
    ISSUE_GROUP_NO_PROCESS,
    ISSUE_GROUP_UNCATEGORIZED,
    ISSUE_GROUP_UNLINKED_VENDOR,
    issue_group_entries,
)


def test_issue_register_group_entries_use_risk_contexts_and_fallbacks():
    issue = SimpleNamespace(
        risk_contexts=[
            SimpleNamespace(risk_category="Operational", risk_process="Claims", risk_type="Process"),
            SimpleNamespace(risk_category="Operational", risk_process=" ", risk_type=""),
        ],
        vendor_contexts=[],
        department_name=None,
    )

    assert issue_group_entries(issue, "category")[0].value == "Operational"
    assert issue_group_entries(issue, "process")[0].value == "Claims"
    assert issue_group_entries(SimpleNamespace(risk_contexts=[], vendor_contexts=[]), "category")[0].value == (
        ISSUE_GROUP_UNCATEGORIZED
    )
    assert issue_group_entries(SimpleNamespace(risk_contexts=[], vendor_contexts=[]), "process")[0].value == (
        ISSUE_GROUP_NO_PROCESS
    )


def test_issue_register_group_entries_use_vendor_contexts_without_raw_ids():
    issue = SimpleNamespace(
        risk_contexts=[],
        vendor_contexts=[
            SimpleNamespace(vendor_name=" Vendor B "),
            SimpleNamespace(vendor_name="Vendor A"),
        ],
        department_name=None,
    )

    assert [entry.value for entry in issue_group_entries(issue, "vendor")] == ["Vendor A", "Vendor B"]
    assert issue_group_entries(SimpleNamespace(risk_contexts=[], vendor_contexts=[]), "vendor")[0].value == (
        ISSUE_GROUP_UNLINKED_VENDOR
    )
