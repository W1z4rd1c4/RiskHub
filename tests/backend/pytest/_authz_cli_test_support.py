"""Minimal synthetic Git repository exercising the public authorization CLI."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = Path("scripts/security/validate_authz_capability_contract.py")
MD = Path("docs/security/authorization-capability-contract.md")
MANIFEST = Path("docs/security/authorization-capability-contract.json")
CATALOG = Path("docs/security/capability-catalog.json")


def build_cli_repo(root):
    """Minimal synthetic repository, executing the unchanged public CLI and validators."""
    shutil.copytree(
        ROOT / "scripts/security",
        root / "scripts/security",
        ignore=shutil.ignore_patterns("__pycache__"),
    )
    fields = (
        "id",
        "surface",
        "action",
        "actor_scope",
        "backend_authority",
        "service_policy",
        "response_capability",
        "frontend_gate",
        "status",
        "findings",
        "tests",
    )
    headers = (
        "ID",
        "Surface",
        "Action",
        "Actor scope",
        "Backend authority",
        "Service policy",
        "Response capability",
        "Frontend gate",
        "Status",
        "Findings",
        "Tests",
    )
    backend = "backend/app/schemas/synthetic.py"
    frontend = "frontend/src/synthetic.ts"
    action = dict(
        zip(
            fields,
            (
                "AUTHZ-SYNTHETIC",
                "Synthetic",
                "Read",
                "Authenticated",
                backend,
                "Backend policy",
                "Typed catalog",
                frontend,
                "authoritative",
                [],
                ["tests/test_synthetic.py"],
            ),
            strict=True,
        )
    )
    manifest = {
        "version": "1.0",
        "last_reviewed": "2026-10-02",
        "last_architecture_refactor_reviewed": "2020-01-01",
        "sensitive_change_paths": [backend, frontend],
        "actions": [action],
    }
    sections = (
        "Purpose",
        "Architecture Principles",
        "Vocabulary",
        "Maintenance Rule",
        "Contract Matrix",
        "Capability Gap Register",
        "Evidence Map",
        "Required Verification",
        "Out Of Scope",
    )
    markdown = "> Last reviewed: 2026-10-02\nUnrelated prose date: 1999-01-01\n"
    for section in sections:
        markdown += "\n## " + section + "\n"
        if section == "Contract Matrix":
            values = [
                "None"
                if field == "findings"
                else "tests/test_synthetic.py"
                if field == "tests"
                else str(action[field])
                for field in fields
            ]
            markdown += (
                "| "
                + " | ".join(headers)
                + " |\n| "
                + " | ".join("---" for _ in fields)
                + " |\n"
            )
            markdown += "| " + " | ".join(values) + " |\n"
    catalog = {
        "surfaces": [
            {
                "id": "synthetic",
                "backend": {"path": backend, "class": "SyntheticCapabilities"},
                "frontend": {"path": frontend, "schema": "syntheticCapabilitiesSchema"},
                "fields": ["can_read", "managed_fields"],
                "string_array_fields": ["managed_fields"],
            }
        ]
    }
    files = {
        str(MD): markdown,
        str(MANIFEST): json.dumps(manifest),
        str(CATALOG): json.dumps(catalog),
        backend: (
            "from pydantic import BaseModel\nclass SyntheticCapabilities(BaseModel):\n"
            "    can_read: bool\n    managed_fields: list[str]\n"
        ),
        frontend: (
            "export const syntheticCapabilitiesSchema = passthroughObject({\n"
            "  can_read: z.boolean(),\n  managed_fields: z.array(z.string()),\n});\n"
        ),
        "frontend/src/routing/business.tsx": "export const businessRoutes = [];\n",
        "tests/test_synthetic.py": "def test_contract(): pass\n",
    }
    for path, content in files.items():
        target = root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
    for args in (
        ("init", "-q"),
        ("add", "."),
        (
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.invalid",
            "commit",
            "-qm",
            "baseline",
        ),
    ):
        subprocess.run(
            ["git", *args], cwd=root, check=True, capture_output=True, timeout=30
        )
    return root
