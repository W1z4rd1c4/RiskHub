"""BE-N6: router prefix registry parity with mounted routes and include_router calls."""

from __future__ import annotations

import ast
import tomllib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO = Path(__file__).resolve().parents[4]
ROUTER_PATH = REPO / "backend/app/api/v1/router.py"
REGISTRY_PATH = REPO / "backend/app/api/v1/_router_registry.toml"


def test_registry_file_exists() -> None:
    assert REGISTRY_PATH.exists(), "BE-N6: registry must live at app/api/v1/_router_registry.toml"


def _load_registry() -> dict:
    return tomllib.loads(REGISTRY_PATH.read_text())


def _prefix_tags_from_route(path: str, tags: list[str]) -> tuple[str, tuple[str, ...]]:
    prefix = "/" + path.lstrip("/").split("/", 1)[0] if path != "/" else ""
    return prefix, tuple(sorted(tags))


def _declared_prefix_tags(registry: dict) -> set[tuple[str, tuple[str, ...]]]:
    declared: set[tuple[str, tuple[str, ...]]] = set()
    for entry in registry.get("modules", []):
        tags = tuple(sorted(entry.get("tags", [])))
        for prefix in entry.get("prefixes", []):
            declared.add((prefix, tags))
        if "prefix" in entry:
            declared.add((entry["prefix"], tags))
        if entry.get("dual_router"):
            for dual in entry.get("dual_routes", []):
                dual_tags = tuple(sorted(dual["tags"]))
                declared.add((dual["prefix"], dual_tags))
    return declared


def test_registry_covers_mounted_route_prefixes() -> None:
    from app.api.v1.router import api_router

    registry = _load_registry()
    actual = {
        _prefix_tags_from_route(
            getattr(route, "path", ""),
            list(getattr(route, "tags", []) or []),
        )
        for route in api_router.routes
    }
    declared = _declared_prefix_tags(registry)
    missing_in_registry = actual - declared
    extra_in_registry = declared - actual
    assert not missing_in_registry, f"BE-N6: routes missing from registry: {missing_in_registry}"
    assert not extra_in_registry, f"BE-N6: registry has stale entries: {extra_in_registry}"


def _router_include_refs() -> set[tuple[str, str]]:
    tree = ast.parse(ROUTER_PATH.read_text(encoding="utf-8"))
    refs: set[tuple[str, str]] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        if not isinstance(node.func, ast.Attribute) or node.func.attr != "include_router":
            continue
        if not node.args:
            continue
        router_ref = node.args[0]
        if not isinstance(router_ref, ast.Attribute) or not isinstance(router_ref.value, ast.Name):
            continue
        refs.add((router_ref.value.id, router_ref.attr))
    return refs


def _declared_include_refs(registry: dict) -> set[tuple[str, str]]:
    refs: set[tuple[str, str]] = set()
    for entry in registry.get("modules", []):
        if entry.get("dual_router"):
            for dual in entry.get("dual_routes", []):
                refs.add((entry["module"], dual["router_attr"]))
        else:
            refs.add((entry["module"], entry.get("router_attr", "router")))
    return refs


def test_registry_covers_all_include_router_modules() -> None:
    registry = _load_registry()
    actual = _router_include_refs()
    declared = _declared_include_refs(registry)
    assert actual - declared == set()
    assert declared - actual == set()


def test_dual_router_supported() -> None:
    """risk_questionnaires must be declared as a dual-router module."""

    registry = _load_registry()
    rq = next(
        (m for m in registry["modules"] if m["module"] == "risk_questionnaires"),
        None,
    )
    assert rq is not None, "registry missing risk_questionnaires"
    assert rq.get("dual_router") is True, "risk_questionnaires must set dual_router = true"
    assert len(rq.get("dual_routes", [])) == 2, "risk_questionnaires has 2 routers"
