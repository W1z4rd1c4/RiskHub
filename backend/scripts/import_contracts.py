from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


@dataclass(slots=True)
class ImportIssue:
    code: str
    message: str
    sheet: str | None = None
    row: int | None = None
    details: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ImportReport:
    script: str
    input_path: str
    apply: bool
    allow_reset: bool
    creates: int = 0
    updates: int = 0
    deletes: int = 0
    skips: int = 0
    warnings: list[ImportIssue] = field(default_factory=list)
    errors: list[ImportIssue] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def add_warning(
        self,
        code: str,
        message: str,
        *,
        sheet: str | None = None,
        row: int | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.warnings.append(ImportIssue(code=code, message=message, sheet=sheet, row=row, details=details or {}))

    def add_error(
        self,
        code: str,
        message: str,
        *,
        sheet: str | None = None,
        row: int | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.errors.append(ImportIssue(code=code, message=message, sheet=sheet, row=row, details=details or {}))

    @property
    def ok(self) -> bool:
        return not self.errors

    def to_dict(self) -> dict[str, Any]:
        return {
            "script": self.script,
            "input_path": self.input_path,
            "apply": self.apply,
            "allow_reset": self.allow_reset,
            "creates": self.creates,
            "updates": self.updates,
            "deletes": self.deletes,
            "skips": self.skips,
            "warnings": [asdict(issue) for issue in self.warnings],
            "errors": [asdict(issue) for issue in self.errors],
            "metadata": self.metadata,
        }


def write_report(path: str | None, report: ImportReport) -> None:
    if not path:
        return

    report_path = Path(path)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(f"{json.dumps(report.to_dict(), indent=2, ensure_ascii=True)}\n", encoding="utf-8")
