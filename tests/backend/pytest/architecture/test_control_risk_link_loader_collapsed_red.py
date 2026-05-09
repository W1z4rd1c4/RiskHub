"""Lock the collapsed load_link helper in control-risk link policy."""

from __future__ import annotations

import importlib

import pytest

pytestmark = pytest.mark.contract


def test_load_link_helper_present() -> None:
    link_policy = importlib.import_module("app.services._control_execution.link_policy")
    assert callable(getattr(link_policy, "load_link", None))


def test_per_direction_loaders_removed() -> None:
    link_policy = importlib.import_module("app.services._control_execution.link_policy")
    assert not hasattr(link_policy, "load_link_for_control")
    assert not hasattr(link_policy, "load_link_for_risk")


def test_link_governance_uses_collapsed_loader() -> None:
    import inspect

    link_governance = importlib.import_module("app.services._control_execution.link_governance")
    source = inspect.getsource(link_governance)
    assert "load_link(db, control_id=" in source or "load_link(db," in source
    assert "load_link_for_control(" not in source
    assert "load_link_for_risk(" not in source
