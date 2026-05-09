from __future__ import annotations

from enum import Enum

import pytest

from app.models.issue import IssueSourceType
from app.services._issue_register import constants


class _OtherEnum(str, Enum):
    foo = "foo"


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (IssueSourceType.manual, "manual"),
        (IssueSourceType.audit, "audit"),
        (IssueSourceType.control_execution, "control_execution"),
        (IssueSourceType.kri_breach, "kri_breach"),
        ("manual", "manual"),
        (_OtherEnum.foo, "foo"),
        (None, ""),
    ],
)
def test_source_type_value_normalizes_inputs(value, expected) -> None:
    source_type_value = getattr(constants, "source_type_value", None)
    assert source_type_value is not None
    assert source_type_value(value) == expected
