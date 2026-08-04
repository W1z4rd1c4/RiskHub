"""Dependency capture helpers for release parity audit."""

from __future__ import annotations

import json
import shlex
from pathlib import Path
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
    backend_local_result = audit._run(
        "deps_backend_local_freeze",
        "cd backend && ./venv/bin/pip freeze > "
        + shlex.quote(str(audit.deps_dir / "backend-local.txt")),
        timeout_sec=180,
    )

    image_tag = f"riskhub-backend:release-parity-{audit.run_id}"
    backend_image_build_result = audit._run(
        "deps_build_backend_image",
        f"docker build -t {shlex.quote(image_tag)} backend",
        timeout_sec=3600,
    )
    backend_image_result = audit._run(
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
        timeout_sec=180,
    )

    frontend_installed_result = audit._run(
        "deps_frontend_installed",
        "cd frontend && npm ls --depth=0 --json > "
        + shlex.quote(str(audit.deps_dir / "frontend-installed.json")),
        timeout_sec=180,
    )
    frontend_lock_result = audit._run(
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
        timeout_sec=120,
    )

    evidence_status: dict[str, dict[str, Any]] = {}

    def record_status(
        name: str,
        *,
        available: bool,
        error: str | None,
        command_id: str | None = None,
        command_result: Any = None,
    ) -> None:
        status = {"available": available, "error": error}
        command_log = getattr(command_result, "log_path", None)
        if (
            error is not None
            and command_id is not None
            and isinstance(command_log, str)
        ):
            status.update({"command_id": command_id, "command_log": command_log})
        evidence_status[name] = status

    def read_backend_versions(
        evidence_name: str,
        command_result: Any,
        evidence_file: Path,
        *,
        command_id: str | None = None,
    ) -> dict[str, str | None]:
        if command_result.rc != 0:
            record_status(
                evidence_name,
                available=False,
                error=f"command failed with exit code {command_result.rc}",
                command_id=command_id,
                command_result=command_result,
            )
            return {}
        if not evidence_file.is_file():
            record_status(
                evidence_name, available=False, error="evidence file is missing"
            )
            return {}

        parsed_versions = audit._parse_package_versions(
            evidence_file.read_text(encoding="utf-8", errors="replace")
        )
        versions = {
            package: parsed_versions.get(audit._canonical_package_name(package))
            for package in critical_backend_packages
        }
        missing_records = [
            package
            for package in critical_backend_packages
            if audit._canonical_package_name(package) not in parsed_versions
        ]
        record_status(
            evidence_name,
            available=not missing_records,
            error=(
                None
                if not missing_records
                else "missing package records: " + ", ".join(missing_records)
            ),
        )
        return versions

    record_status(
        "backend_image_build",
        available=backend_image_build_result.rc == 0,
        error=(
            None
            if backend_image_build_result.rc == 0
            else f"command failed with exit code {backend_image_build_result.rc}"
        ),
        command_id="deps_build_backend_image",
        command_result=backend_image_build_result,
    )

    backend_local_versions = read_backend_versions(
        "backend_local",
        backend_local_result,
        audit.deps_dir / "backend-local.txt",
    )
    backend_image_versions = read_backend_versions(
        "backend_image",
        backend_image_result,
        audit.deps_dir / "backend-image.txt",
        command_id="deps_backend_image_versions",
    )

    frontend_installed_versions: dict[str, str | None] = {}
    installed_file = audit.deps_dir / "frontend-installed.json"
    if frontend_installed_result.rc != 0:
        record_status(
            "frontend_installed",
            available=False,
            error=f"command failed with exit code {frontend_installed_result.rc}",
        )
    elif not installed_file.is_file():
        record_status(
            "frontend_installed", available=False, error="evidence file is missing"
        )
    else:
        try:
            installed_payload = json.loads(installed_file.read_text(encoding="utf-8"))
            if not isinstance(installed_payload, dict):
                raise ValueError("expected a JSON object")
            deps = installed_payload.get("dependencies")
            if not isinstance(deps, dict):
                raise ValueError("expected a dependencies object")
            missing_records = [
                package for package in core_frontend_packages if package not in deps
            ]
            invalid_records = []
            for package in core_frontend_packages:
                value = deps.get(package)
                version = value.get("version") if isinstance(value, dict) else None
                valid_version = isinstance(version, str) and bool(version.strip())
                frontend_installed_versions[package] = (
                    version if valid_version else None
                )
                if package in deps and not valid_version:
                    invalid_records.append(package)
            errors = []
            if missing_records:
                errors.append("missing package records: " + ", ".join(missing_records))
            if invalid_records:
                errors.append(
                    "invalid package version records: " + ", ".join(invalid_records)
                )
            record_status(
                "frontend_installed",
                available=not errors,
                error="; ".join(errors) if errors else None,
            )
        except (json.JSONDecodeError, OSError, UnicodeError, ValueError) as exc:
            record_status(
                "frontend_installed",
                available=False,
                error=f"invalid dependency JSON: {exc}",
            )

    frontend_lock_versions: dict[str, str | None] = {}
    lock_file = audit.deps_dir / "frontend-lock.json"
    if frontend_lock_result.rc != 0:
        record_status(
            "frontend_lock",
            available=False,
            error=f"command failed with exit code {frontend_lock_result.rc}",
        )
    elif not lock_file.is_file():
        record_status(
            "frontend_lock", available=False, error="evidence file is missing"
        )
    else:
        try:
            lock_payload = json.loads(lock_file.read_text(encoding="utf-8"))
            if not isinstance(lock_payload, dict):
                raise ValueError("expected a JSON object")
            missing_records = [
                package
                for package in core_frontend_packages
                if package not in lock_payload
            ]
            invalid_records = []
            for package in core_frontend_packages:
                version = lock_payload.get(package)
                valid_version = isinstance(version, str) and bool(version.strip())
                frontend_lock_versions[package] = version if valid_version else None
                if package in lock_payload and not valid_version:
                    invalid_records.append(package)
            errors = []
            if missing_records:
                errors.append("missing package records: " + ", ".join(missing_records))
            if invalid_records:
                errors.append(
                    "invalid package version records: " + ", ".join(invalid_records)
                )
            record_status(
                "frontend_lock",
                available=not errors,
                error="; ".join(errors) if errors else None,
            )
        except (json.JSONDecodeError, OSError, UnicodeError, ValueError) as exc:
            record_status(
                "frontend_lock",
                available=False,
                error=f"invalid dependency JSON: {exc}",
            )

    backend_drift = []
    if all(
        evidence_status[name]["available"]
        for name in ("backend_local", "backend_image")
    ):
        for package in critical_backend_packages:
            if backend_local_versions.get(package) != backend_image_versions.get(
                package
            ):
                backend_drift.append(
                    {
                        "package": package,
                        "local": backend_local_versions.get(package),
                        "image": backend_image_versions.get(package),
                    }
                )

    frontend_drift = []
    for package in core_frontend_packages:
        if frontend_installed_versions.get(package) != frontend_lock_versions.get(
            package
        ):
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
        "evidence_status": evidence_status,
    }
    audit._write_json(audit.deps_dir / "diffs.json", audit.dep_diffs)
