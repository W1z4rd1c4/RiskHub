"""Read installed identity through the target runtime, without host app dependencies."""

from __future__ import annotations

import json
from pathlib import Path

from deploy.lib.render import DeployConfig, validate_identity_transition
from install_lib.common import InstallPaths, run_capture


def identity_diagnostics(
    paths: InstallPaths,
    *,
    target: str,
    config_path: Path,
    secret_dir: Path,
    runtime_dir: Path,
    deep: bool = False,
) -> dict:
    result: dict = {
        "configuration": "unavailable",
        "security": "unavailable",
        "onboarding": "unchecked",
    }
    try:
        config = DeployConfig.from_env_file(config_path)
        validate_identity_transition(config_path, runtime_dir / "backend.env")
        result.update(
            configuration="valid",
            auth_mode=config.auth_mode,
            directory_provider=config.directory_provider,
            local_mfa_policy=config.local_mfa_policy
            if config.auth_mode == "password"
            else "not_applicable",
            external_directory="not_applicable"
            if config.auth_mode == "password"
            else "unchecked",
        )
    except ValueError:
        return result
    command = [
        str(paths.deploy_script),
        "diagnose",
        "--target",
        target,
        "--config",
        str(config_path),
        "--secret-dir",
        str(secret_dir),
    ]
    if deep:
        command.append("--deep")
    response = run_capture(command)
    if response.returncode == 0:
        try:
            live = json.loads(response.stdout)
            if not isinstance(live, dict):
                return result
            # The running profile, including MFA policy, must match the desired configuration.
            if any(
                live.get(key) != result[key]
                for key in ("auth_mode", "directory_provider", "local_mfa_policy")
            ):
                result["configuration"] = "runtime_mismatch"
                return result
            result.update(live)
        except (ValueError, TypeError):
            pass
    return result


def require_completed_onboarding(identity: dict) -> None:
    if (
        identity.get("configuration") != "valid"
        or identity.get("security") != "available"
    ):
        raise RuntimeError(
            "Identity security is unavailable; use doctor and reconcile configuration or protected state."
        )
    if (
        identity.get("auth_mode") == "password"
        and identity.get("onboarding") != "completed"
    ):
        raise RuntimeError(
            "Initial native account enrollment is pending; deliver the protected handoffs and complete setup."
        )
    if identity.get("delivery") == "degraded":
        raise RuntimeError(
            "Native account delivery is degraded; restore SMTP TLS/authentication and retry verification."
        )
    if identity.get("release_admission") == "awaiting_208":
        raise RuntimeError("Native production release acceptance #208 is not complete.")
