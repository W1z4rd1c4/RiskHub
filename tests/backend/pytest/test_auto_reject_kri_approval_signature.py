from __future__ import annotations

from inspect import signature
from typing import get_type_hints

from app.services._approval_execution.results import auto_reject_kri_approval


def test_auto_reject_kri_approval_takes_only_reason() -> None:
    parameters = list(signature(auto_reject_kri_approval).parameters.values())

    assert [parameter.name for parameter in parameters] == ["reason"]
    assert get_type_hints(auto_reject_kri_approval)["reason"] is str
