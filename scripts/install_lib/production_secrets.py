from __future__ import annotations

from pathlib import Path

from install_lib.common import (
    InstallPaths,
    SharedOptions,
    have_editor,
    read_envfile_value,
    required_secret_missing,
    run_command,
    secret_value_is_placeholder,
)


def production_scaffold_missing(config_path: Path, secret_dir: Path) -> bool:
    return (
        not config_path.exists()
        or not secret_dir.exists()
        or required_secret_missing(secret_dir, "database_url")
        or required_secret_missing(secret_dir, "secret_key")
        or required_secret_missing(secret_dir, "redis_password")
    )


def ensure_production_secrets_ready(
    *,
    target: str,
    secret_dir: Path,
    config_path: Path,
    options: SharedOptions,
    paths: InstallPaths,
) -> None:
    thumbprint_value = (
        read_envfile_value(config_path, "ENTRA_CLIENT_CERTIFICATE_THUMBPRINT") or ""
    )
    native = read_envfile_value(config_path, "AUTH_MODE") == "password"
    certificate_mode = bool(thumbprint_value)

    needs_edit = any(
        secret_value_is_placeholder(secret_dir, secret_name)
        for secret_name in ("database_url", "secret_key", "redis_password")
    )
    if (
        not native
        and not certificate_mode
        and secret_value_is_placeholder(secret_dir, "entra_client_secret")
    ):
        needs_edit = True

    if needs_edit:
        if not have_editor():
            raise RuntimeError(
                "Set $EDITOR or $VISUAL before guided production secret editing."
            )
        run_command(
            [
                paths.deploy_script,
                "secrets-edit",
                "--target",
                target,
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
            ],
            options=options,
        )

    for secret_name in ("database_url", "secret_key", "redis_password"):
        if secret_value_is_placeholder(secret_dir, secret_name):
            raise RuntimeError(f"{secret_name} still contains the placeholder value.")

    if native:
        # Register approvers and provide SMTP credentials through protected files;
        # the shared renderer validates their formats without printing contents.
        for name in (
            "local_auth_keyring",
            "local_recovery_approvers",
            "local_smtp_password",
        ):
            if not (secret_dir / name).is_file():
                raise RuntimeError(
                    f"Native identity requires {secret_dir / name}; resume secrets-init and configure the protected file."
                )
    elif certificate_mode:
        if secret_value_is_placeholder(
            secret_dir, "entra_client_certificate_private_key"
        ):
            raise RuntimeError(
                f"Certificate mode is selected, but {secret_dir / 'entra_client_certificate_private_key'} still contains the placeholder value."
            )
    elif secret_value_is_placeholder(secret_dir, "entra_client_secret"):
        raise RuntimeError(
            "Client-secret mode is selected, but entra_client_secret still contains the placeholder value."
        )
