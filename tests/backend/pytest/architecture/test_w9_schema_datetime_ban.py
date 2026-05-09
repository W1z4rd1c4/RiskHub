from pathlib import Path

import pytest

pytestmark = pytest.mark.contract


SCHEMA_ROOT = Path(__file__).resolve().parents[4] / "backend/app/schemas"


def test_no_bare_datetime_import_in_schemas() -> None:
    violations: list[str] = []
    for path in SCHEMA_ROOT.rglob("*.py"):
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if not line.startswith("from datetime import"):
                continue
            imported_names = {
                part.strip().split(" as ")[0]
                for part in line.removeprefix("from datetime import").split(",")
            }
            if "datetime" in imported_names:
                violations.append(f"{path}:{lineno}: {line.strip()}")

    assert not violations, "Use UtcAwareDatetime in schema boundaries:\n" + "\n".join(violations)
