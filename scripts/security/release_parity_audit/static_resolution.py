from __future__ import annotations

import re
from pathlib import Path
from typing import Any


def extract_static_resolution(*, root_dir: Path) -> dict[str, Any]:
    dev_sh = (root_dir / "scripts" / "dev.sh").read_text(encoding="utf-8")
    req_root = root_dir / "backend"
    req_text = "\n".join(
        (
            (req_root / "requirements.txt").read_text(encoding="utf-8"),
            (req_root / "requirements-runtime.txt").read_text(encoding="utf-8"),
            (req_root / "requirements-db.txt").read_text(encoding="utf-8"),
        )
    )
    backend_docker = (root_dir / "backend" / "Dockerfile").read_text(encoding="utf-8")
    frontend_docker = (root_dir / "frontend" / "Dockerfile").read_text(encoding="utf-8")
    e2e = (root_dir / ".github" / "workflows" / "e2e.yml").read_text(encoding="utf-8")
    lint = (root_dir / ".github" / "workflows" / "lint.yml").read_text(encoding="utf-8")
    security = (root_dir / ".github" / "workflows" / "security.yml").read_text(encoding="utf-8")

    ci_node_versions = re.findall(r"node-version:\s*'([^']+)'", "\n".join([e2e, lint, security]))
    ci_python_versions = re.findall(r"python-version:\s*'([^']+)'", "\n".join([e2e, lint, security]))
    floating_lines = [line.strip() for line in req_text.splitlines() if ">=" in line and not line.strip().startswith("#")]
    pinned_lines = [line.strip() for line in req_text.splitlines() if "==" in line and not line.strip().startswith("#")]

    return {
        "dev_startup": {
            "backend_venv_conditional_install": 'requirements.txt" -nt "venv/.deps_installed' in dev_sh,
            "backend_uses_pip_install_requirements": "pip install -q -r requirements.txt" in dev_sh,
            "backend_has_layered_requirements": all(
                (req_root / name).exists()
                for name in ("requirements.txt", "requirements-runtime.txt", "requirements-db.txt")
            ),
            "frontend_conditional_install_on_missing_node_modules": "if [ ! -d node_modules ]; then" in dev_sh,
            "frontend_has_npm_install_fallback": "npm install" in dev_sh,
            "frontend_lockfile_install_enforced": "npm ci" in dev_sh,
            "frontend_prefers_npm_ci_with_lockfile": 'if [ "$install_mode" = "npm_ci" ]; then' in dev_sh,
        },
        "backend_requirements_policy": {
            "floating_constraints_count": len(floating_lines),
            "floating_constraints": floating_lines,
            "pinned_constraints_count": len(pinned_lines),
            "pinned_constraints": pinned_lines,
        },
        "docker_runtime_policy": {
            "backend_python_image": re.findall(r"FROM\s+(python:[^\s]+)", backend_docker),
            "frontend_node_image": re.findall(r"FROM\s+(node:[^\s]+)", frontend_docker),
            "frontend_build_uses_npm_ci": "npm ci" in frontend_docker,
        },
        "ci_runtime_policy": {
            "node_versions": sorted(set(ci_node_versions)),
            "python_versions": sorted(set(ci_python_versions)),
            "frontend_ci_lockfile_install": "npm ci" in e2e and "npm ci" in lint and "npm ci" in security,
            "backend_ci_uses_pip_install_requirements": "pip install -r requirements.txt" in e2e
            or "pip install -r requirements.txt" in lint,
        },
        "evidence": [
            "scripts/dev.sh:231",
            "scripts/dev.sh:233",
            "scripts/dev.sh:295",
            "scripts/dev.sh:313",
            "backend/requirements.txt:1",
            "backend/requirements-runtime.txt:1",
            "backend/requirements-db.txt:1",
            "backend/Dockerfile:7",
            "frontend/Dockerfile:7",
            "frontend/Dockerfile:16",
            ".github/workflows/e2e.yml:39",
            ".github/workflows/e2e.yml:45",
            ".github/workflows/e2e.yml:55",
        ],
    }
