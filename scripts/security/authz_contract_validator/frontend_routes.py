"""Frontend route and navigation authorization validators."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Callable, Mapping

from authz_contract_manifest import BUSINESS_ROUTE_NAV_EXPECTATIONS

from .models import Finding

REPO_ROOT = Path(__file__).resolve().parents[3]

SourceReader = Callable[[Path], str]


def _read_source(path: Path) -> str:
    try:
        return (REPO_ROOT / path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def extract_route_objects_from_array(source: str, array_name: str) -> list[str]:
    array_marker = f"export const {array_name}"
    marker_index = source.find(array_marker)
    if marker_index == -1:
        return []
    assignment_index = source.find("=", marker_index)
    if assignment_index == -1:
        return []
    array_start = source.find("[", assignment_index)
    if array_start == -1:
        return []

    objects: list[str] = []
    object_start: int | None = None
    brace_depth = 0
    in_string: str | None = None
    escaped = False

    for index in range(array_start + 1, len(source)):
        char = source[index]
        if in_string is not None:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == in_string:
                in_string = None
            continue

        if char in {"'", '"', "`"}:
            in_string = char
            continue
        if char == "{":
            if brace_depth == 0:
                object_start = index
            brace_depth += 1
            continue
        if char == "}":
            if brace_depth == 0:
                continue
            brace_depth -= 1
            if brace_depth == 0 and object_start is not None:
                objects.append(source[object_start: index + 1])
                object_start = None
            continue
        if char == "]" and brace_depth == 0:
            break

    return objects


def extract_single_quoted_field(source: str, field_name: str) -> str | None:
    match = re.search(rf"\b{re.escape(field_name)}:\s*'([^']+)'", source)
    return match.group(1) if match else None


def extract_is_visible_expression(route_source: str) -> str | None:
    marker = "isVisible:"
    marker_index = route_source.find(marker)
    if marker_index == -1:
        return None

    start = marker_index + len(marker)
    expression_chars: list[str] = []
    brace_depth = 0
    bracket_depth = 0
    paren_depth = 0
    in_string: str | None = None
    escaped = False

    for char in route_source[start:]:
        if in_string is not None:
            expression_chars.append(char)
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == in_string:
                in_string = None
            continue

        if char in {"'", '"', "`"}:
            in_string = char
            expression_chars.append(char)
            continue
        if char == "{":
            brace_depth += 1
        elif char == "}":
            if brace_depth == 0 and bracket_depth == 0 and paren_depth == 0:
                break
            brace_depth = max(0, brace_depth - 1)
        elif char == "[":
            bracket_depth += 1
        elif char == "]":
            bracket_depth = max(0, bracket_depth - 1)
        elif char == "(":
            paren_depth += 1
        elif char == ")":
            paren_depth = max(0, paren_depth - 1)
        elif char == "," and brace_depth == 0 and bracket_depth == 0 and paren_depth == 0:
            break
        expression_chars.append(char)

    expression = "".join(expression_chars).strip()
    return expression or None


def normalize_typescript_expression(expression: str) -> str:
    return re.sub(r"\s+", " ", expression.strip())


def describe_business_nav_authority(expression: str) -> str:
    permission_match = re.search(r"hasPermission\('([^']+)', '([^']+)'\)", expression)
    if permission_match:
        return f"{permission_match.group(1)}:{permission_match.group(2)}"
    capability_match = re.search(r"authz\.can\('([^']+)', '([^']+)'\)", expression)
    if capability_match:
        return f"{capability_match.group(2)}:{capability_match.group(1)}"
    return normalize_typescript_expression(expression)


def validate_business_route_nav_context(
    source: str | None = None,
    *,
    expectations: Mapping[str, str] = BUSINESS_ROUTE_NAV_EXPECTATIONS,
    read_source: SourceReader = _read_source,
) -> list[Finding]:
    findings: list[Finding] = []
    business_source = source if source is not None else read_source(Path("frontend/src/routing/business.tsx"))
    for route_source in extract_route_objects_from_array(business_source, "businessRoutes"):
        if "nav:" not in route_source:
            continue
        key = extract_single_quoted_field(route_source, "key")
        if key is None:
            continue
        expected_expression = expectations.get(key)
        if expected_expression is None:
            continue
        actual_expression = extract_is_visible_expression(route_source)
        if actual_expression is None:
            findings.append(
                Finding(
                    "frontend_business_nav_gate_mismatch",
                    f"frontend/src/routing/business.tsx route {key!r} is missing nav.isVisible; "
                    f"expected {expected_expression!r}.",
                )
            )
            continue

        normalized_actual = normalize_typescript_expression(actual_expression)
        normalized_expected = normalize_typescript_expression(expected_expression)
        if normalized_actual != normalized_expected:
            path = extract_single_quoted_field(route_source, "path")
            href = extract_single_quoted_field(route_source, "href")
            expected_authority = describe_business_nav_authority(expected_expression)
            findings.append(
                Finding(
                    "frontend_business_nav_gate_mismatch",
                    f"frontend/src/routing/business.tsx route {key!r}"
                    f" path={path!r} href={href!r} has nav.isVisible {normalized_actual!r}; "
                    f"expected {normalized_expected!r} ({expected_authority}).",
                )
            )
    return findings
