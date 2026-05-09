"""Capability catalog validation for backend/frontend schema parity."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Callable, Mapping

from .models import Finding

REPO_ROOT = Path(__file__).resolve().parents[3]

BACKEND_BOOL_FIELD_PATTERN = re.compile(
    r"^\s+([A-Za-z_][A-Za-z0-9_]*):\s*bool(?:\s*=.*)?(?:\s*#.*)?$"
)
BACKEND_BOOL_DICT_FIELD_PATTERN = re.compile(
    r"^\s+([A-Za-z_][A-Za-z0-9_]*):\s*dict\s*\[\s*str\s*,\s*bool\s*\](?:\s*=.*)?(?:\s*#.*)?$"
)
FRONTEND_BOOL_FIELD_PATTERN = re.compile(
    r"^\s*([A-Za-z_][A-Za-z0-9_]*):\s*z\.boolean\(\)"
)
FRONTEND_BOOL_RECORD_FIELD_PATTERN = re.compile(
    r"^\s*([A-Za-z_][A-Za-z0-9_]*):\s*z\.record\(\s*z\.string\(\)\s*,\s*z\.boolean\(\)\s*\)"
)

SourceReader = Callable[[Path], str]


def _read_source(path: Path) -> str:
    try:
        return (REPO_ROOT / path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _read_catalog_source(
    path: Path,
    source_by_path: Mapping[Path | str, str] | None = None,
    read_source: SourceReader = _read_source,
) -> str:
    if source_by_path is not None:
        if path in source_by_path:
            return source_by_path[path]
        path_posix = path.as_posix()
        if path_posix in source_by_path:
            return source_by_path[path_posix]
    return read_source(path)


def _extract_python_class_body(source: str, class_name: str) -> str | None:
    lines = source.splitlines()
    class_pattern = re.compile(rf"^\s*class\s+{re.escape(class_name)}\b")
    for index, line in enumerate(lines):
        if not class_pattern.search(line):
            continue
        class_indent = len(line) - len(line.lstrip())
        body_lines: list[str] = []
        for body_line in lines[index + 1:]:
            if not body_line.strip():
                body_lines.append(body_line)
                continue
            body_indent = len(body_line) - len(body_line.lstrip())
            if body_indent <= class_indent:
                break
            body_lines.append(body_line)
        return "\n".join(body_lines)
    return None


def _extract_backend_capability_fields(source: str, class_name: str) -> set[str] | None:
    body = _extract_python_class_body(source, class_name)
    if body is None:
        return None
    fields: set[str] = set()
    for line in body.splitlines():
        if match := BACKEND_BOOL_FIELD_PATTERN.match(line):
            fields.add(match.group(1))
            continue
        if match := BACKEND_BOOL_DICT_FIELD_PATTERN.match(line):
            fields.add(match.group(1))
    return fields


def _find_matching_closing_brace(source: str, open_brace_index: int) -> int | None:
    depth = 0
    in_string: str | None = None
    escaped = False
    for index in range(open_brace_index, len(source)):
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
            depth += 1
            continue
        if char == "}":
            depth -= 1
            if depth == 0:
                return index
    return None


def _extract_typescript_schema_body(source: str, schema_name: str) -> str | None:
    schema_pattern = re.compile(
        rf"\b(?:export\s+)?const\s+{re.escape(schema_name)}\b(?:\s*:\s*[^=]+)?\s*=\s*passthroughObject\s*\("
    )
    match = schema_pattern.search(source)
    if match is None:
        return None

    open_brace_index = source.find("{", match.end())
    if open_brace_index == -1:
        return None
    closing_brace_index = _find_matching_closing_brace(source, open_brace_index)
    if closing_brace_index is None:
        return None
    return source[open_brace_index + 1: closing_brace_index]


def _extract_frontend_capability_fields(source: str, schema_name: str) -> set[str] | None:
    body = _extract_typescript_schema_body(source, schema_name)
    if body is None:
        return None
    fields: set[str] = set()
    for line in body.splitlines():
        if match := FRONTEND_BOOL_FIELD_PATTERN.match(line):
            fields.add(match.group(1))
            continue
        if match := FRONTEND_BOOL_RECORD_FIELD_PATTERN.match(line):
            fields.add(match.group(1))
    return fields


def validate_capability_catalog(
    catalog: Any,
    *,
    source_by_path: Mapping[Path | str, str] | None = None,
    read_source: SourceReader = _read_source,
) -> list[Finding]:
    findings: list[Finding] = []
    if not isinstance(catalog, dict):
        return [Finding("capability_catalog_shape", "root must be a JSON object")]

    surfaces = catalog.get("surfaces")
    if not isinstance(surfaces, list) or not surfaces:
        return [Finding("capability_catalog_surfaces", "surfaces must be a non-empty list")]

    seen_ids: set[str] = set()
    for index, surface in enumerate(surfaces, start=1):
        if not isinstance(surface, dict):
            findings.append(Finding("capability_catalog_surface_shape", f"surface #{index} must be an object"))
            continue

        surface_id = surface.get("id")
        if not isinstance(surface_id, str) or not surface_id:
            surface_id = f"#{index}"
            findings.append(Finding("capability_catalog_surface_id", f"surface #{index} needs an id"))
        elif surface_id in seen_ids:
            findings.append(Finding("capability_catalog_duplicate_surface", surface_id))
        else:
            seen_ids.add(surface_id)

        interface = surface.get("interface")
        if isinstance(interface, dict):
            _validate_interface_surface(findings, str(surface_id), interface)
            continue

        fields = surface.get("fields")
        if (
            not isinstance(fields, list)
            or not fields
            or not all(isinstance(field, str) and field for field in fields)
        ):
            findings.append(
                Finding("capability_catalog_fields", f"{surface_id}: fields must be non-empty strings")
            )
            continue
        expected_fields = set(fields)
        if len(expected_fields) != len(fields):
            findings.append(Finding("capability_catalog_duplicate_field", str(surface_id)))

        backend = surface.get("backend")
        frontend = surface.get("frontend")
        if not isinstance(backend, dict):
            findings.append(Finding("capability_catalog_backend_shape", str(surface_id)))
            continue
        if not isinstance(frontend, dict):
            findings.append(Finding("capability_catalog_frontend_shape", str(surface_id)))
            continue

        backend_path_raw = backend.get("path")
        backend_class = backend.get("class")
        frontend_path_raw = frontend.get("path")
        frontend_schema = frontend.get("schema")
        if not isinstance(backend_path_raw, str) or not isinstance(backend_class, str):
            findings.append(Finding("capability_catalog_backend_reference", str(surface_id)))
            continue
        if not isinstance(frontend_path_raw, str) or not isinstance(frontend_schema, str):
            findings.append(Finding("capability_catalog_frontend_reference", str(surface_id)))
            continue

        _validate_backend_fields(
            findings,
            surface_id=str(surface_id),
            expected_fields=expected_fields,
            backend_path=Path(backend_path_raw),
            backend_class=backend_class,
            source_by_path=source_by_path,
            read_source=read_source,
        )
        _validate_frontend_fields(
            findings,
            surface_id=str(surface_id),
            expected_fields=expected_fields,
            frontend_path=Path(frontend_path_raw),
            frontend_schema=frontend_schema,
            source_by_path=source_by_path,
            read_source=read_source,
        )

    return findings


def _validate_interface_surface(findings: list[Finding], surface_id: str, interface: dict[str, Any]) -> None:
    path_raw = interface.get("path")
    class_name = interface.get("class")
    method_name = interface.get("method")
    if not isinstance(path_raw, str) or not isinstance(class_name, str) or not isinstance(method_name, str):
        findings.append(Finding("capability_catalog_interface_reference", surface_id))
        return

    source = _read_source(Path(path_raw))
    if _extract_python_class_body(source, class_name) is None:
        findings.append(Finding("capability_catalog_interface_class_missing", f"{surface_id}: {class_name}"))
        return
    if not re.search(rf"^\s+def\s+{re.escape(method_name)}\b", source, flags=re.MULTILINE):
        findings.append(Finding("capability_catalog_interface_method_missing", f"{surface_id}: {method_name}"))


def _validate_backend_fields(
    findings: list[Finding],
    *,
    surface_id: str,
    expected_fields: set[str],
    backend_path: Path,
    backend_class: str,
    source_by_path: Mapping[Path | str, str] | None,
    read_source: SourceReader,
) -> None:
    backend_source = _read_catalog_source(backend_path, source_by_path, read_source)
    backend_fields = _extract_backend_capability_fields(backend_source, backend_class)
    if backend_fields is None:
        findings.append(
            Finding(
                "capability_catalog_backend_class_missing",
                f"{surface_id}: {backend_path.as_posix()} {backend_class}",
            )
        )
        return
    for field in sorted(expected_fields - backend_fields):
        findings.append(
            Finding("capability_catalog_backend_field_missing", f"{surface_id}: {backend_class}.{field}")
        )
    for field in sorted(backend_fields - expected_fields):
        findings.append(
            Finding("capability_catalog_backend_field_extra", f"{surface_id}: {backend_class}.{field}")
        )


def _validate_frontend_fields(
    findings: list[Finding],
    *,
    surface_id: str,
    expected_fields: set[str],
    frontend_path: Path,
    frontend_schema: str,
    source_by_path: Mapping[Path | str, str] | None,
    read_source: SourceReader,
) -> None:
    frontend_source = _read_catalog_source(frontend_path, source_by_path, read_source)
    frontend_fields = _extract_frontend_capability_fields(frontend_source, frontend_schema)
    if frontend_fields is None:
        findings.append(
            Finding(
                "capability_catalog_frontend_schema_missing",
                f"{surface_id}: {frontend_path.as_posix()} {frontend_schema}",
            )
        )
        return
    for field in sorted(expected_fields - frontend_fields):
        findings.append(
            Finding("capability_catalog_frontend_field_missing", f"{surface_id}: {frontend_schema}.{field}")
        )
    for field in sorted(frontend_fields - expected_fields):
        findings.append(
            Finding("capability_catalog_frontend_field_extra", f"{surface_id}: {frontend_schema}.{field}")
        )
