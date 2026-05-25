from __future__ import annotations

import inspect
from enum import Enum

from app.services._approval_execution import kri_side_effects
from app.services._approval_execution.kri_generic_edit import _apply_kri_generic_edit
from app.services._approval_execution.kri_history_correction import _apply_kri_history_correction
from app.services._approval_execution.kri_value_submission import _apply_kri_value_submission


def test_kri_edit_kind_discriminator_covers_all_side_effect_paths() -> None:
    assert hasattr(kri_side_effects, "KRIEditKind")
    assert issubclass(kri_side_effects.KRIEditKind, Enum)
    assert {item.value for item in kri_side_effects.KRIEditKind} == {
        "generic_edit",
        "value_submission",
        "history_correction",
    }
    assert set(kri_side_effects.KRI_EDIT_HANDLERS) == set(kri_side_effects.KRIEditKind)


def test_kri_edit_kind_classifier_uses_explicit_discriminator() -> None:
    classify = kri_side_effects.classify_kri_edit_kind

    assert classify({"history_entry_id": 10}) is kri_side_effects.KRIEditKind.HISTORY_CORRECTION
    assert (
        classify({"period_end": {"new": "2026-03-31"}, "current_value": {"old": 1.0, "new": 2.0}})
        is kri_side_effects.KRIEditKind.VALUE_SUBMISSION
    )
    assert classify({"description": {"old": "old", "new": "new"}}) is kri_side_effects.KRIEditKind.GENERIC_EDIT


def test_kri_edit_dispatch_routes_through_kind_registry() -> None:
    source = inspect.getsource(kri_side_effects._apply_edit_kri)

    assert "classify_kri_edit_kind(" in source
    assert "KRI_EDIT_HANDLERS[" in source
    assert 'if "history_entry_id" in changes' not in source
    assert 'if "period_end" in changes and "current_value" in changes' not in source


def test_kri_side_effect_functions_do_not_accept_unused_department_id() -> None:
    for handler in (_apply_kri_generic_edit, _apply_kri_value_submission, _apply_kri_history_correction):
        assert "department_id" not in inspect.signature(handler).parameters
