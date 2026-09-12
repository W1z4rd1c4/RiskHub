"""Resolve an operator choice without changing an existing identity authority."""

from __future__ import annotations

import os
from pathlib import Path

from deploy.lib.render import _parse_env_file, validate_identity_transition
from app.core.production_contract import IDENTITY_PROFILE_CHOICES
from install_lib.common import SharedOptions


def select_identity(
    config_path: Path,
    *,
    user_management: str | None,
    mfa_policy: str | None,
    options: SharedOptions,
) -> tuple[str, str]:
    if config_path.exists():
        values = _parse_env_file(config_path)
        current = (
            values.get("AUTH_MODE", "microsoft_sso"),
            values.get("DIRECTORY_PROVIDER", "graph"),
        )
        choice = next(
            (
                name
                for name, pair in IDENTITY_PROFILE_CHOICES.items()
                if pair == current
            ),
            None,
        )
        if choice is None:
            raise RuntimeError(
                "Invalid installed AUTH_MODE/DIRECTORY_PROVIDER tuple; reconcile the configuration."
            )
        if user_management is not None and user_management != choice:
            raise RuntimeError(
                "--user-management conflicts with the existing configuration; identity switching is unsupported."
            )
        policy = values.get("LOCAL_MFA_POLICY", "required")
        if mfa_policy is not None and mfa_policy != policy:
            raise RuntimeError(
                "--mfa-policy conflicts with LOCAL_MFA_POLICY in the existing configuration."
            )
    else:
        choice = user_management
        if choice is None and not options.yes and os.isatty(0):
            choice = (
                input("User management: entra or custom [entra]: ").strip() or "entra"
            )
        choice = choice or "entra"
        policy = mfa_policy
        if choice == "custom" and policy is None and not options.yes and os.isatty(0):
            policy = (
                input("Native MFA policy: required or optional [required]: ").strip()
                or "required"
            )
        policy = policy or "required"
    if choice not in IDENTITY_PROFILE_CHOICES or policy not in {"required", "optional"}:
        raise RuntimeError(
            "Choose entra/custom user management and required/optional native MFA policy."
        )
    if choice == "entra" and mfa_policy is not None:
        raise RuntimeError(
            "--mfa-policy applies only to custom user management; Entra owns its MFA policy."
        )
    return choice, policy


def validate_installed_identity(config_path: Path, runtime_dir: Path) -> None:
    validate_identity_transition(config_path, runtime_dir / "backend.env")
