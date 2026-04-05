from __future__ import annotations

from pathlib import Path

from install_lib.common import (
    InstallPaths,
    SharedOptions,
    bundle_version_guess,
    production_public_url,
    run_command,
    timestamp_utc,
)
from install_lib.runtime_state import release_source_from_args, write_production_install_state


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
