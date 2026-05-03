from types import SimpleNamespace

from app.models.issue import IssueSourceType
from app.services._issue_register import (
    ISSUE_GROUP_NO_PROCESS,
    ISSUE_GROUP_UNCATEGORIZED,
    ISSUE_GROUP_UNLINKED_VENDOR,
    issue_group_entries,
)
from app.services._issue_register.constants import UNKNOWN_RISK_LABEL
from app.services._issue_register.linked_context import (
    IssueLinkedVisibility,
    issue_source_link,
    link_display,
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


def test_issue_linked_context_redacts_hidden_labels_and_selects_source_deterministically():
    visibility = IssueLinkedVisibility(risk_ids={1}, control_ids=set(), kri_ids={99}, vendor_ids=set())
    visible_risk_link = _issue_link(
        20,
        risk_id=1,
        risk=SimpleNamespace(name=" "),
        is_source_link=True,
    )
    hidden_risk_link = _issue_link(10, risk_id=2, risk=SimpleNamespace(name="Hidden risk"))
    kri_source_link = _issue_link(30, kri_id=99, kri=SimpleNamespace(metric_name="KRI source"))

    assert link_display(hidden_risk_link, linked_visibility=visibility) == ("risk", None)
    assert link_display(visible_risk_link, linked_visibility=visibility) == ("risk", UNKNOWN_RISK_LABEL)

    explicit_source_issue = SimpleNamespace(
        source_type=IssueSourceType.kri_breach.value,
        source_id=99,
        links=[hidden_risk_link, kri_source_link, visible_risk_link],
    )
    inferred_source_issue = SimpleNamespace(
        source_type=IssueSourceType.kri_breach.value,
        source_id=99,
        links=[kri_source_link, hidden_risk_link],
    )

    assert issue_source_link(explicit_source_issue) is visible_risk_link
    assert issue_source_link(inferred_source_issue) is kri_source_link


def _issue_link(
    link_id: int,
    *,
    risk_id: int | None = None,
    control_id: int | None = None,
    execution_id: int | None = None,
    kri_id: int | None = None,
    vendor_id: int | None = None,
    risk=None,
    control=None,
    execution=None,
    kri=None,
    vendor=None,
    is_source_link: bool = False,
):
    return SimpleNamespace(
        id=link_id,
        risk_id=risk_id,
        control_id=control_id,
        execution_id=execution_id,
        kri_id=kri_id,
        vendor_id=vendor_id,
        risk=risk,
        control=control,
        execution=execution,
        kri=kri,
        vendor=vendor,
        is_source_link=is_source_link,
    )
