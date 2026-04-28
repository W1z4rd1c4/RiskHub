import ast
import importlib.util
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
VERSIONS_DIR = REPO_ROOT / "backend" / "alembic" / "versions"
APPROVAL_SCENARIO_SNAPSHOT_MIGRATION = VERSIONS_DIR / "c8d9e0f1a2b4_add_approval_scenario_snapshots.py"


def _migration_assignment(path: Path, name: str) -> str | tuple[str, ...] | None:
    module = ast.parse(path.read_text(encoding="utf-8"))
    for node in module.body:
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.target.id == name:
            return ast.literal_eval(node.value)
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == name:
                    return ast.literal_eval(node.value)
    return None


def test_alembic_revision_ids_are_unique() -> None:
    revisions: dict[str, list[str]] = {}
    for path in VERSIONS_DIR.glob("*.py"):
        if path.name == "__init__.py":
            continue
        revision = _migration_assignment(path, "revision")
        assert isinstance(revision, str), f"{path.name} must define a string revision"
        revisions.setdefault(revision, []).append(path.name)

    duplicates = {revision: files for revision, files in revisions.items() if len(files) > 1}

    assert duplicates == {}


def test_approval_scenario_snapshot_migration_follows_issue_source_marker() -> None:
    assert _migration_assignment(APPROVAL_SCENARIO_SNAPSHOT_MIGRATION, "revision") == "c8d9e0f1a2b4"
    assert _migration_assignment(APPROVAL_SCENARIO_SNAPSHOT_MIGRATION, "down_revision") == "b7c8d9e0f1a3"


def _load_approval_scenario_snapshot_migration():
    spec = importlib.util.spec_from_file_location(
        "approval_scenario_snapshot_migration",
        APPROVAL_SCENARIO_SNAPSHOT_MIGRATION,
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_tier_capable_scenario_roles_are_made_privileged_safe() -> None:
    migration = _load_approval_scenario_snapshot_migration()

    roles = json.loads(migration._privileged_safe_approver_roles('["risk_owner"]'))

    assert roles == ["risk_owner", "risk_manager", "cro"]


def test_privileged_safe_scenario_roles_preserve_existing_roles_without_duplicates() -> None:
    migration = _load_approval_scenario_snapshot_migration()

    roles = json.loads(migration._privileged_safe_approver_roles('["employee", "cro"]'))

    assert roles == ["employee", "cro"]
