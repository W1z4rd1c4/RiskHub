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
    backend_root = Path(__file__).resolve().parents[1]
    scan_roots = [backend_root / "app", backend_root / "scripts"]
    forbidden = ["datetime.utcnow(", "replace(tzinfo=None)"]

    violations: list[str] = []
    for root in scan_roots:
        for needle in forbidden:
            violations.extend(_scan_for_substring(root, substring=needle))

    assert not violations, "Forbidden datetime patterns found:\n" + "\n".join(violations)

