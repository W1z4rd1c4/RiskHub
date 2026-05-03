from __future__ import annotations

from pathlib import Path


def _scan_for_substring(root: Path, *, substring: str) -> list[str]:
    violations: list[str] = []
    for path in root.rglob("*.py"):
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        if substring not in text:
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            if substring in line:
                violations.append(f"{path}:{lineno}: {line.strip()}")
    return violations


def test_datetime_utcnow_not_used_in_app_or_scripts() -> None:
    backend_root = Path(__file__).resolve().parents[3] / "backend"
    scan_roots = [backend_root / "app", backend_root / "scripts"]
    forbidden = ["datetime.utcnow(", "replace(tzinfo=None)"]

    violations: list[str] = []
    for root in scan_roots:
        for needle in forbidden:
            violations.extend(_scan_for_substring(root, substring=needle))

    assert not violations, "Forbidden datetime patterns found:\n" + "\n".join(violations)


def test_runtime_app_code_uses_utc_now_helper() -> None:
    backend_root = Path(__file__).resolve().parents[3] / "backend"
    app_root = backend_root / "app"
    allowed_paths = {
        Path("app/core/datetime_utils.py"),
        Path("app/models/activity_log.py"),
        Path("app/models/approval_request.py"),
        Path("app/models/issue.py"),
        Path("app/models/notification.py"),
    }

    violations: list[str] = []
    for path in app_root.rglob("*.py"):
        relative_path = path.relative_to(backend_root)
        if relative_path in allowed_paths:
            continue
        text = path.read_text(encoding="utf-8")
        if "datetime.now(UTC)" not in text:
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            if "datetime.now(UTC)" in line:
                violations.append(f"{path}:{lineno}: {line.strip()}")

    assert not violations, "Use utc_now() in runtime app code:\n" + "\n".join(violations)
