"""Dependency capture helpers for release parity audit."""

from __future__ import annotations

import json
import shlex
from typing import Any, Protocol


class DependencyAuditFacade(Protocol):
    run_id: str
    deps_dir: Any
    dep_diffs: dict[str, Any]

    def _run(
        self,
        command_id: str,
        command: str,
        *,
        required: bool = True,
        timeout_sec: int | None = None,
    ) -> Any: ...

    @staticmethod
    def _canonical_package_name(name: str) -> str: ...

    def _parse_package_versions(self, text: str) -> dict[str, str | None]: ...

    def _write_json(self, path: Any, payload: Any) -> None: ...


def capture_dependencies(
    audit: DependencyAuditFacade,
    *,
    critical_backend_packages: list[str],
    core_frontend_packages: list[str],
) -> None:
    audit._run(
        "deps_backend_local_freeze",
        "cd backend && ./venv/bin/pip freeze > " + shlex.quote(str(audit.deps_dir / "backend-local.txt")),
        required=False,
        timeout_sec=180,
    )

    image_tag = f"riskhub-backend:release-parity-{audit.run_id}"
    audit._run(
        "deps_build_backend_image",
        f"docker build -t {shlex.quote(image_tag)} backend",
        required=False,
        timeout_sec=3600,
    )
    audit._run(
        "deps_backend_image_versions",
        "docker run --rm "
        + shlex.quote(image_tag)
        + " sh -lc "
        + shlex.quote(
            "python - <<'PY'\n"
            "import importlib.metadata as m\n"
            f"pkgs={critical_backend_packages!r}\n"
            "for p in pkgs:\n"
            "  try:\n"
            "    print(f'{p}=={m.version(p)}')\n"
            "  except Exception:\n"
            "    print(f'{p}=missing')\n"
            "PY"
        )
        + " > "
        + shlex.quote(str(audit.deps_dir / "backend-image.txt")),
        required=False,
        timeout_sec=180,
    )

    audit._run(
        "deps_frontend_installed",
        "cd frontend && npm ls --depth=0 --json > "
        + shlex.quote(str(audit.deps_dir / "frontend-installed.json")),
        required=False,
        timeout_sec=180,
    )
    audit._run(
        "deps_frontend_lock_extract",
        "cd frontend && node - <<'NODE' > "
        + shlex.quote(str(audit.deps_dir / "frontend-lock.json"))
        + "\n"
        + "const fs = require('fs');\n"
        + "const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));\n"
        + f"const keys = {core_frontend_packages!r};\n"
        + "const out = {};\n"
        + "for (const key of keys) {\n"
        + "  const pkgKey = `node_modules/${key}`;\n"
        + "  out[key] = lock.packages && lock.packages[pkgKey] ? lock.packages[pkgKey].version : null;\n"
        + "}\n"
        + "console.log(JSON.stringify(out, null, 2));\n"
        + "NODE",
        required=False,
        timeout_sec=120,
    )

    backend_local_versions: dict[str, str | None] = {}
    local_file = audit.deps_dir / "backend-local.txt"
    if local_file.exists():
        text = local_file.read_text(encoding="utf-8", errors="replace")
        parsed_versions = audit._parse_package_versions(text)
        for package in critical_backend_packages:
            backend_local_versions[package] = parsed_versions.get(audit._canonical_package_name(package))

    backend_image_versions: dict[str, str | None] = {}
    image_file = audit.deps_dir / "backend-image.txt"
    if image_file.exists():
        text = image_file.read_text(encoding="utf-8", errors="replace")
        parsed_versions = audit._parse_package_versions(text)
        for package in critical_backend_packages:
            backend_image_versions[package] = parsed_versions.get(audit._canonical_package_name(package))

    frontend_installed_versions: dict[str, str | None] = {}
    installed_file = audit.deps_dir / "frontend-installed.json"
    if installed_file.exists():
        try:
            installed_payload = json.loads(installed_file.read_text(encoding="utf-8"))
            deps = installed_payload.get("dependencies", {})
            for package in core_frontend_packages:
                value = deps.get(package, {})
                frontend_installed_versions[package] = value.get("version") if isinstance(value, dict) else None
        except json.JSONDecodeError:
            pass

    frontend_lock_versions: dict[str, str | None] = {}
    lock_file = audit.deps_dir / "frontend-lock.json"
    if lock_file.exists():
        try:
            frontend_lock_versions = json.loads(lock_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            frontend_lock_versions = {}

    backend_drift = []
    for package in critical_backend_packages:
        if backend_local_versions.get(package) != backend_image_versions.get(package):
            backend_drift.append(
                {
                    "package": package,
                    "local": backend_local_versions.get(package),
                    "image": backend_image_versions.get(package),
                }
            )

    frontend_drift = []
    for package in core_frontend_packages:
        if frontend_installed_versions.get(package) != frontend_lock_versions.get(package):
            frontend_drift.append(
                {
                    "package": package,
                    "installed": frontend_installed_versions.get(package),
                    "lock": frontend_lock_versions.get(package),
                }
            )

    audit.dep_diffs = {
        "backend_local_versions": backend_local_versions,
        "backend_image_versions": backend_image_versions,
        "backend_drift": backend_drift,
        "frontend_installed_versions": frontend_installed_versions,
        "frontend_lock_versions": frontend_lock_versions,
        "frontend_drift": frontend_drift,
        "backend_image_tag": image_tag,
    }
    audit._write_json(audit.deps_dir / "diffs.json", audit.dep_diffs)
