from pathlib import Path
import re


REPO_ROOT = Path(__file__).resolve().parents[3]
EXECUTION_DOMAIN_FILES = [
    "backend/app/api/v1/endpoints/executions.py",
    "backend/app/api/v1/endpoints/controls/executions.py",
    "backend/app/schemas/execution.py",
    "frontend/src/components/executions/ExecutionHistory.tsx",
    "frontend/src/components/executions/ExecutionLogModal.tsx",
    "frontend/src/pages/AuditTrailPage.tsx",
    "frontend/src/lib/executionResult.ts",
    "frontend/src/services/executionApi.ts",
    "frontend/src/types/execution.ts",
]
LEGACY_LITERAL_PATTERNS = [
    re.compile(r"['\"]pass['\"]"),
    re.compile(r"['\"]fail['\"]"),
    re.compile(r"['\"]issues_found['\"]"),
]


def test_execution_domain_uses_only_canonical_execution_result_literals() -> None:
    offenders: list[str] = []

    for relative_path in EXECUTION_DOMAIN_FILES:
        file_path = REPO_ROOT / relative_path
        text = file_path.read_text(encoding="utf-8")
        for pattern in LEGACY_LITERAL_PATTERNS:
            if pattern.search(text):
                offenders.append(f"{relative_path}: {pattern.pattern}")

    assert not offenders, "Legacy execution result literals found:\n" + "\n".join(offenders)
