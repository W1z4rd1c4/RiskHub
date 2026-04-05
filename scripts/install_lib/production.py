from __future__ import annotations

from pathlib import Path

from install_lib.common import (
    InstallPaths,
    SharedOptions,
    ensure_production_config_ready,
    run_command,
    timestamp_utc,
)
from install_lib.production_lifecycle import run_production_action
from install_lib.production_release import (
    backup_non_secret_production_state,
    ensure_production_release_input,
    production_existing_install_detected,
)
from install_lib.production_secrets import ensure_production_secrets_ready, production_scaffold_missing
from install_lib.production_summary import (
    summary_demo,
    summary_dev,
    summary_production_lifecycle,
    verify_demo,
    verify_dev,
)
from install_lib.runtime_state import resolve_production_target


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
    needs_secret_init = production_scaffold_missing(config_path, secret_dir) and not needs_config_init

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
