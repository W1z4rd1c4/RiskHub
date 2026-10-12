from __future__ import annotations

import ast
import re
from datetime import date
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
BACKEND_TEST_ROOT = REPO_ROOT / "tests/backend/pytest"
ARCHITECTURE_TEST_ROOT = BACKEND_TEST_ROOT / "architecture"

ALLOWED_SUBPROCESS_IMPORTABILITY_CHECKS = {
    # #202 instruments cold application composition before import and isolates global scheduler state.
    "tests/backend/pytest/test_identity_directory_isolation.py",
    "tests/backend/pytest/api/v1/test_issue_register_projection.py",
    "tests/backend/pytest/test_install_script_contracts.py",
}

# Exactly one reviewed cold composition call, never a file-wide permission.
COLD_COMPOSITION_CHECK = (
    "tests/backend/pytest/architecture/test_reporting_listing_boundaries.py",
    "test_cold_import_order_and_mounted_endpoints",
)
COLD_COMPOSITION_REASON = (
    "Three first-import orders must compose the mounted application in a fresh interpreter; "
    "the already-imported pytest process cannot expose eager package cycles."
)
COLD_COMPOSITION_EXPIRES = date(2026, 12, 5)

EXPLICIT_PYTHON_C_ARGS = re.compile(
    r'''\[\s*sys\.executable\s*,\s*["']-c["']'''
)

DEAD_KRI_HISTORY_FACADES = {
    "backend/app/api/v1/endpoints/kris/history_corrections.py",
    "backend/app/api/v1/endpoints/kris/history_helpers.py",
    "backend/app/api/v1/endpoints/kris/history_listing.py",
    "backend/app/api/v1/endpoints/kris/history_loading.py",
    "backend/app/api/v1/endpoints/kris/history_submission.py",
    "backend/app/api/v1/endpoints/kris/history_value_application.py",
}


def _source(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_architecture_tests_are_marked_contract() -> None:
    architecture_tests = sorted(ARCHITECTURE_TEST_ROOT.glob("test_*.py")) + [
        BACKEND_TEST_ROOT / "test_architecture_deepening_contracts.py"
    ]

    unmarked = []
    for path in architecture_tests:
        source = _source(path)
        if "pytestmark = pytest.mark.contract" not in source:
            unmarked.append(str(path.relative_to(REPO_ROOT)))

    assert unmarked == []


def _subprocess_importability_offenders(source: str, path: str, *, today: date | None = None) -> list[str]:
    """Inspect literal list/tuple argv and simple-assignment aliases, not dynamic argv."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return [f"{path}: unparseable Python"]
    if path in ALLOWED_SUBPROCESS_IMPORTABILITY_CHECKS:
        return []
    sys_names = {"sys"}
    executable_names = {"sys.executable"}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            sys_names.update(alias.asname or alias.name for alias in node.names if alias.name == "sys")
        elif isinstance(node, ast.ImportFrom) and node.module == "sys":
            executable_names.update(alias.asname or alias.name for alias in node.names if alias.name == "executable")
    # Conservative fixed-point alias tracking also covers branch-local aliases.
    changed = True
    while changed:
        before = (set(sys_names), set(executable_names))
        executable_names.update(f"{name}.executable" for name in sys_names)
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                targets = [target.id for target in node.targets if isinstance(target, ast.Name)]
                value = ast.unparse(node.value)
                if value in sys_names:
                    sys_names.update(targets)
                if value in executable_names:
                    executable_names.update(targets)
        changed = before != (sys_names, executable_names)

    invocations = []

    class Calls(ast.NodeVisitor):
        def __init__(self):
            self.functions = []

        def visit_FunctionDef(self, node):
            self.functions.append(node.name)
            self.generic_visit(node)
            self.functions.pop()

        visit_AsyncFunctionDef = visit_FunctionDef
        visit_ClassDef = visit_FunctionDef

        def visit_List(self, node):
            if (len(node.elts) >= 2 and ast.unparse(node.elts[0]) in executable_names
                    and isinstance(node.elts[1], ast.Constant) and node.elts[1].value == "-c"):
                payload = node.elts[2] if len(node.elts) > 2 else None
                invocations.append((".".join(self.functions), node.lineno, payload, len(node.elts)))
            self.generic_visit(node)

        visit_Tuple = visit_List

    Calls().visit(tree)
    offenders = []
    for function, line, payload, argument_count in invocations:
        permitted = (
            (path, function) == COLD_COMPOSITION_CHECK
            and len([item for item in invocations if item[0] == function]) == 1
            and argument_count == 3
            and isinstance(payload, ast.Name) and payload.id == "script"
            and (today or date.today()) <= COLD_COMPOSITION_EXPIRES
            and bool(COLD_COMPOSITION_REASON.strip())
        )
        if not permitted:
            offenders.append(f"{path}:{line}:{function or '<module>'}")
    return offenders


def test_no_unapproved_subprocess_importability_checks_remain() -> None:
    offenders = []
    for path in sorted(BACKEND_TEST_ROOT.rglob("test_*.py")):
        offenders.extend(_subprocess_importability_offenders(_source(path), str(path.relative_to(REPO_ROOT))))
    assert offenders == []


def test_cold_composition_exception_is_call_local_and_expires() -> None:
    path, function = COLD_COMPOSITION_CHECK
    source = (f"def {function}():\n    script = 'mounted application contract'\n"
              "    subprocess.run([sys.executable, '-c', script])\n")
    assert _subprocess_importability_offenders(source, path, today=date(2026, 10, 11)) == []
    unrelated = "\ndef unrelated():\n    subprocess.run([sys.executable, '-c', 'import os'])\n"
    assert _subprocess_importability_offenders(source + unrelated, path)
    extra = "    subprocess.run([sys.executable, '-c', 'import os'])\n"
    assert _subprocess_importability_offenders(source + extra, path)
    extra_argument = source.replace("'-c', script]", "'-c', script, 'unexpected']")
    assert _subprocess_importability_offenders(extra_argument, path)
    assert _subprocess_importability_offenders(source, path, today=date(2026, 12, 6))
    assert _subprocess_importability_offenders(source, "tests/backend/pytest/unapproved.py")


@pytest.mark.parametrize("source", [
    "import sys as interpreter\nimport subprocess as process\nprocess.run([interpreter.executable, '-c', 'import os'])",
    "from sys import executable as python\nfrom subprocess import run as launch\nlaunch([python, '-c', 'import os'])",
    "import sys\npython = sys.executable\nargs = [python, '-c', 'import os']\nhelper(args)",
    "def broken(:",
])
def test_subprocess_detector_preserves_alias_and_syntax_rejection(source):
    assert _subprocess_importability_offenders(source, COLD_COMPOSITION_CHECK[0])


def test_subprocess_detector_does_not_conflate_bash_and_python_tokens():
    source = "subprocess.run([sys.executable, 'tool.py'])\nsubprocess.run(['bash', '-c', 'echo ok'])"
    assert _subprocess_importability_offenders(source, COLD_COMPOSITION_CHECK[0]) == []


@pytest.mark.parametrize(
    ("source", "detected"),
    [
        ("[" + 'sys.executable, "-c", "import package"]', True),
        ("[\n" + '    sys.executable,\n    "-c",\n    "import package",\n]', True),
        ('["bash", "-c", "run-harness"]', False),
    ],
)
def test_explicit_python_c_detector_is_call_local(source: str, detected: bool) -> None:
    assert bool(EXPLICIT_PYTHON_C_ARGS.search(source)) is detected


def test_dead_kri_history_endpoint_facades_are_removed() -> None:
    existing = sorted(path for path in DEAD_KRI_HISTORY_FACADES if (REPO_ROOT / path).exists())

    assert existing == []
