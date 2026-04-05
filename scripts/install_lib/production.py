from __future__ import annotations

import shutil
from pathlib import Path

from install_lib.common import (
    InstallPaths,
    SharedOptions,
    bundle_version_guess,
    ensure_production_config_ready,
    have_editor,
    production_public_url,
    prompt_value,
    read_envfile_value,
    required_secret_missing,
    run_command,
    secret_value_is_placeholder,
    timestamp_utc,
)
from install_lib.runtime_state import load_install_state, release_source_from_args, resolve_production_target, write_production_install_state


def summary_demo() -> None:
    print(
        """
=== RiskHub Install Summary ===
Mode: demo
Command: ./scripts/install.sh demo
App URL: http://localhost/login
Verify:
  ./scripts/install.sh verify --mode demo
Status:
  ./scripts/install.sh status --mode demo
Logs:
  ./scripts/install.sh logs --mode demo --tail 200 --follow
Doctor:
  ./scripts/install.sh doctor --mode demo [--repair]
Next:
  Sign in with the demo login picker at http://localhost/login
  Use ./scripts/install.sh demo --reset test for deterministic demo data"""
    )


def summary_dev() -> None:
    print(
        """
=== RiskHub Install Summary ===
Mode: dev
Command: ./scripts/install.sh dev
Frontend URL: http://localhost:5173/login
Backend URL: http://localhost:8000
Verify:
  ./scripts/install.sh verify --mode dev
Status:
  ./scripts/install.sh status --mode dev
Logs:
  ./scripts/install.sh logs --mode dev --tail 200 --follow
Doctor:
  ./scripts/install.sh doctor --mode dev [--repair]
Next:
  Use ./scripts/install.sh dev --backend for backend-only iteration
  Set AUTH_MODE=password MOCK_AUTH_ENABLED=false to disable demo auth locally"""
    )


def summary_production_lifecycle(lifecycle_mode: str, target: str, config_path: Path, secret_dir: Path) -> None:
    print(
        f"""
=== RiskHub Install Summary ===
Mode: {lifecycle_mode}
Target: {target}
Manual prerequisites:
  External PostgreSQL is required
  A public RiskHub URL and Microsoft Entra app credentials are required
Status:
  ./scripts/install.sh status --mode production --target {target}
Verify:
  ./scripts/install.sh verify --mode production --target {target} --config {config_path} --secret-dir {secret_dir}
Logs:
  ./scripts/install.sh logs --mode production --target {target} --tail 200 --follow
Doctor:
  ./scripts/install.sh doctor --mode production --target {target} [--repair]
Rollback:
  ./scripts/deploy.sh rollback --target {target} --config {config_path} --secret-dir {secret_dir}
Next:
  Use ./scripts/install.sh upgrade --target {target} for the next release change
  Back up secrets and the database through operator-managed processes before release changes"""
    )


def verify_demo(options: SharedOptions) -> None:
    run_command(["curl", "-fsS", "http://localhost/login"], options=options)
    run_command(["curl", "-fsS", "http://localhost/api/v1/auth/config"], options=options)


def verify_dev(options: SharedOptions) -> None:
    run_command(["curl", "-fsS", "http://localhost:5173/login"], options=options)
    run_command(["curl", "-fsS", "http://localhost:8000/api/v1/health"], options=options)
    run_command(["curl", "-fsS", "http://localhost:8000/api/v1/auth/config"], options=options)


def ensure_production_release_input(
    *,
    target: str,
    version: str | None,
    bundle: str | None,
    backend_image: str | None,
    backend_db_image: str | None,
    frontend_image: str | None,
    redis_image: str | None,
    options: SharedOptions,
) -> tuple[str | None, str | None]:
    if target == "docker":
        if version:
            return version, bundle
        if backend_image and backend_db_image and frontend_image and redis_image:
            return version, bundle
        if options.dry_run or options.yes:
            raise RuntimeError("Production docker install requires --version or all image refs.")
        return prompt_value("Docker release version", "v1.2.3", options=options), bundle

    if bundle:
        return version, bundle
    if options.dry_run or options.yes:
        raise RuntimeError("Production linux install requires --bundle PATH.")
    return version, prompt_value("Linux release bundle path", "./riskhub-linux-v1.2.3.tar.gz", options=options)


def production_scaffold_missing(config_path: Path, secret_dir: Path) -> bool:
    return (
        not config_path.exists()
        or not secret_dir.exists()
        or required_secret_missing(secret_dir, "database_url")
        or required_secret_missing(secret_dir, "secret_key")
        or required_secret_missing(secret_dir, "redis_password")
    )


def ensure_production_secrets_ready(*, target: str, secret_dir: Path, config_path: Path, options: SharedOptions, paths: InstallPaths) -> None:
    thumbprint_value = read_envfile_value(config_path, "ENTRA_CLIENT_CERTIFICATE_THUMBPRINT") or ""
    certificate_mode = bool(thumbprint_value)

    needs_edit = any(
        secret_value_is_placeholder(secret_dir, secret_name)
        for secret_name in ("database_url", "secret_key", "redis_password")
    )
    if not certificate_mode and secret_value_is_placeholder(secret_dir, "entra_client_secret"):
        needs_edit = True

    if needs_edit:
        if not have_editor():
            raise RuntimeError("Set $EDITOR or $VISUAL before guided production secret editing.")
        run_command([paths.deploy_script, "secrets-edit", "--target", target, "--secret-dir", str(secret_dir)], options=options)

    for secret_name in ("database_url", "secret_key", "redis_password"):
        if secret_value_is_placeholder(secret_dir, secret_name):
            raise RuntimeError(f"{secret_name} still contains the placeholder value.")

    if certificate_mode:
        if secret_value_is_placeholder(secret_dir, "entra_client_certificate_private_key"):
            raise RuntimeError(
                f"Certificate mode is selected, but {secret_dir / 'entra_client_certificate_private_key'} still contains the placeholder value."
            )
    elif secret_value_is_placeholder(secret_dir, "entra_client_secret"):
        raise RuntimeError("Client-secret mode is selected, but entra_client_secret still contains the placeholder value.")


def backup_non_secret_production_state(config_path: Path, runtime_dir: Path, backup_id: str) -> None:
    backup_root = runtime_dir / "backups" / backup_id
    (backup_root / "config").mkdir(parents=True, exist_ok=True)
    (backup_root / "runtime").mkdir(parents=True, exist_ok=True)
    shutil.copy2(config_path, backup_root / "config" / config_path.name)
    for runtime_name in ("backend.env", "frontend.env", "metadata.env", "install-state.json"):
        runtime_file = runtime_dir / runtime_name
        if runtime_file.exists():
            shutil.copy2(runtime_file, backup_root / "runtime" / runtime_name)


def production_existing_install_detected(config_path: Path, secret_dir: Path, runtime_dir: Path, paths: InstallPaths) -> bool:
    return (
        (config_path.exists() and secret_dir.exists() and runtime_dir.exists())
        or load_install_state(paths, runtime_dir) is not None
    )


def run_demo(*, reset_dataset: str | None, backend_only: bool, no_build: bool, options: SharedOptions, paths: InstallPaths) -> None:
    del backend_only
    args = ["reset", "--dataset", reset_dataset] if reset_dataset else ["up"]
    if no_build:
        args.append("--no-build")
    if options.dry_run:
        args.append("--dry-run")
    run_command([paths.compose_script, *args], options=options)
    verify_demo(options)
    summary_demo()


def run_dev(*, backend_only: bool, daemon: bool, options: SharedOptions, paths: InstallPaths) -> None:
    args: list[str] = []
    if backend_only:
        args.append("--backend")
    if daemon:
        args.append("--daemon")
    run_command([paths.dev_script, *args], options=options)
    verify_dev(options)
    summary_dev()


def run_production_action(
    *,
    lifecycle_command: str,
    deploy_action: str,
    target: str,
    config_path: Path,
    secret_dir: Path,
    runtime_dir: Path,
    version: str | None,
    backend_image: str | None,
    backend_db_image: str | None,
    frontend_image: str | None,
    redis_image: str | None,
    bundle: str | None,
    options: SharedOptions,
    paths: InstallPaths,
) -> None:
    common_args = ["--target", target, "--config", str(config_path), "--secret-dir", str(secret_dir)]
    if options.yes:
        common_args.append("--yes")
    if options.dry_run:
        common_args.append("--dry-run")
    if options.verbose:
        common_args.append("--verbose")
    release_args: list[str] = []
    if target == "docker":
        if version:
            release_args.extend(["--version", version])
        else:
            if backend_image:
                release_args.extend(["--backend-image", backend_image])
            if backend_db_image:
                release_args.extend(["--backend-db-image", backend_db_image])
            if frontend_image:
                release_args.extend(["--frontend-image", frontend_image])
            if redis_image:
                release_args.extend(["--redis-image", redis_image])
    elif bundle:
        release_args.extend(["--bundle", bundle])

    for command in (
        [paths.deploy_script, "preflight", *common_args],
        [paths.deploy_script, deploy_action, *common_args, *release_args],
        [paths.deploy_script, "status", "--target", target],
        [paths.deploy_script, "smoke", *common_args],
    ):
        run_command(command, options=options)

    if not options.dry_run:
        release_source = release_source_from_args(
            target=target,
            version=version if target == "docker" else bundle_version_guess(bundle),
            bundle=bundle,
            backend_image=backend_image,
            backend_db_image=backend_db_image,
            frontend_image=frontend_image,
            redis_image=redis_image,
        )
        now = timestamp_utc()
        write_production_install_state(
            paths,
            target=target,
            config_path=config_path,
            secret_dir=secret_dir,
            runtime_dir=runtime_dir,
            last_command=lifecycle_command,
            deploy_timestamp=now,
            smoke_timestamp=now,
            release_source=release_source,
            public_url=production_public_url(config_path),
        )


def run_production(
    *,
    target: str,
    config_path: Path,
    secret_dir: Path,
    runtime_dir: Path,
    version: str | None,
    backend_image: str | None,
    backend_db_image: str | None,
    frontend_image: str | None,
    redis_image: str | None,
    bundle: str | None,
    options: SharedOptions,
    paths: InstallPaths,
) -> None:
    if target not in {"docker", "linux"}:
        raise RuntimeError("Production install requires --target docker|linux.")
    version, bundle = ensure_production_release_input(
        target=target,
        version=version,
        bundle=bundle,
        backend_image=backend_image,
        backend_db_image=backend_db_image,
        frontend_image=frontend_image,
        redis_image=redis_image,
        options=options,
    )

    needs_config_init = not config_path.exists()
    needs_secret_init = (
        not secret_dir.exists()
        or required_secret_missing(secret_dir, "database_url")
        or required_secret_missing(secret_dir, "secret_key")
        or required_secret_missing(secret_dir, "redis_password")
    )

    if needs_config_init:
        run_command([paths.deploy_script, "init", "--target", target, "--config", str(config_path), "--secret-dir", str(secret_dir)], options=options)
    if needs_secret_init and not needs_config_init:
        run_command([paths.deploy_script, "secrets-init", "--target", target, "--secret-dir", str(secret_dir)], options=options)
    if options.dry_run and (needs_config_init or needs_secret_init):
        summary_production_lifecycle("production", target, config_path, secret_dir)
        return

    if not options.dry_run:
        ensure_production_config_ready(config_path, options=options)
        ensure_production_secrets_ready(target=target, secret_dir=secret_dir, config_path=config_path, options=options, paths=paths)

    run_production_action(
        lifecycle_command="production",
        deploy_action="upgrade" if production_existing_install_detected(config_path, secret_dir, runtime_dir, paths) else "deploy",
        target=target,
        config_path=config_path,
        secret_dir=secret_dir,
        runtime_dir=runtime_dir,
        version=version,
        backend_image=backend_image,
        backend_db_image=backend_db_image,
        frontend_image=frontend_image,
        redis_image=redis_image,
        bundle=bundle,
        options=options,
        paths=paths,
    )
    summary_production_lifecycle("production", target, config_path, secret_dir)


def run_upgrade(
    *,
    target: str,
    config_path: Path,
    secret_dir: Path,
    runtime_dir: Path,
    version: str | None,
    backend_image: str | None,
    backend_db_image: str | None,
    frontend_image: str | None,
    redis_image: str | None,
    bundle: str | None,
    options: SharedOptions,
    paths: InstallPaths,
) -> None:
    if target not in {"docker", "linux"}:
        raise RuntimeError("Upgrade requires --target docker|linux.")
    if not config_path.exists():
        raise RuntimeError(f"Upgrade requires an existing production config at {config_path}.")
    if not secret_dir.exists():
        raise RuntimeError(f"Upgrade requires an existing secret directory at {secret_dir}.")

    if not options.dry_run and runtime_dir.exists():
        backup_non_secret_production_state(config_path, runtime_dir, timestamp_utc().replace(":", ""))
    if not options.dry_run:
        ensure_production_secrets_ready(target=target, secret_dir=secret_dir, config_path=config_path, options=options, paths=paths)

    run_production_action(
        lifecycle_command="upgrade",
        deploy_action="upgrade",
        target=target,
        config_path=config_path,
        secret_dir=secret_dir,
        runtime_dir=runtime_dir,
        version=version,
        backend_image=backend_image,
        backend_db_image=backend_db_image,
        frontend_image=frontend_image,
        redis_image=redis_image,
        bundle=bundle,
        options=options,
        paths=paths,
    )
    summary_production_lifecycle("upgrade", target, config_path, secret_dir)


def run_verify(
    *,
    mode: str,
    target: str | None,
    config_path: Path,
    secret_dir: Path,
    runtime_dir: Path,
    options: SharedOptions,
    paths: InstallPaths,
) -> None:
    if mode == "demo":
        verify_demo(options)
        summary_demo()
        return
    if mode == "dev":
        verify_dev(options)
        summary_dev()
        return
    resolved_target = resolve_production_target(paths, target, runtime_dir)
    run_command([paths.deploy_script, "status", "--target", resolved_target], options=options)
    smoke_command = [paths.deploy_script, "smoke", "--target", resolved_target, "--config", str(config_path), "--secret-dir", str(secret_dir)]
    if options.yes:
        smoke_command.append("--yes")
    if options.dry_run:
        smoke_command.append("--dry-run")
    if options.verbose:
        smoke_command.append("--verbose")
    run_command(smoke_command, options=options)
    summary_production_lifecycle("verify", resolved_target, config_path, secret_dir)
