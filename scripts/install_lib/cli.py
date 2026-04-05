from __future__ import annotations

import argparse
from pathlib import Path

from install_lib.common import SharedOptions, get_paths, show_help, run_command
from install_lib.doctor import run_doctor
from install_lib.production import run_demo, run_dev, run_production, run_upgrade, run_verify
from install_lib.runtime_state import resolve_production_target
from install_lib.status import run_status


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(add_help=False)
    subparsers = parser.add_subparsers(dest="command")

    demo = subparsers.add_parser("demo", add_help=False)
    demo.add_argument("--dry-run", action="store_true")
    demo.add_argument("--yes", action="store_true")
    demo.add_argument("--verbose", action="store_true")
    demo.add_argument("--reset")
    demo.add_argument("--no-build", action="store_true")

    dev = subparsers.add_parser("dev", add_help=False)
    dev.add_argument("--dry-run", action="store_true")
    dev.add_argument("--yes", action="store_true")
    dev.add_argument("--verbose", action="store_true")
    dev.add_argument("--backend", action="store_true")
    dev.add_argument("--daemon", action="store_true")

    for name in ("production", "upgrade"):
        command = subparsers.add_parser(name, add_help=False)
        command.add_argument("--dry-run", action="store_true")
        command.add_argument("--yes", action="store_true")
        command.add_argument("--verbose", action="store_true")
        command.add_argument("--target")
        command.add_argument("--config")
        command.add_argument("--secret-dir")
        command.add_argument("--version")
        command.add_argument("--backend-image")
        command.add_argument("--backend-db-image")
        command.add_argument("--frontend-image")
        command.add_argument("--redis-image")
        command.add_argument("--bundle")

    verify = subparsers.add_parser("verify", add_help=False)
    verify.add_argument("--dry-run", action="store_true")
    verify.add_argument("--yes", action="store_true")
    verify.add_argument("--verbose", action="store_true")
    verify.add_argument("--mode")
    verify.add_argument("--target")
    verify.add_argument("--config")
    verify.add_argument("--secret-dir")

    status = subparsers.add_parser("status", add_help=False)
    status.add_argument("--dry-run", action="store_true")
    status.add_argument("--yes", action="store_true")
    status.add_argument("--verbose", action="store_true")
    status.add_argument("--mode")
    status.add_argument("--target")
    status.add_argument("--config")
    status.add_argument("--secret-dir")
    status.add_argument("--json", action="store_true")

    logs = subparsers.add_parser("logs", add_help=False)
    logs.add_argument("--dry-run", action="store_true")
    logs.add_argument("--yes", action="store_true")
    logs.add_argument("--verbose", action="store_true")
    logs.add_argument("--mode")
    logs.add_argument("--target")
    logs.add_argument("--tail", default="200")
    logs.add_argument("--follow", action="store_true")

    doctor = subparsers.add_parser("doctor", add_help=False)
    doctor.add_argument("--dry-run", action="store_true")
    doctor.add_argument("--yes", action="store_true")
    doctor.add_argument("--verbose", action="store_true")
    doctor.add_argument("--mode")
    doctor.add_argument("--target")
    doctor.add_argument("--config")
    doctor.add_argument("--secret-dir")
    doctor.add_argument("--json", action="store_true")
    doctor.add_argument("--repair", action="store_true")
    doctor.add_argument("--deep", action="store_true")

    return parser


def _shared_options(args: argparse.Namespace) -> SharedOptions:
    return SharedOptions(dry_run=bool(getattr(args, "dry_run", False)), yes=bool(getattr(args, "yes", False)), verbose=bool(getattr(args, "verbose", False)))


def main(argv: list[str] | None = None) -> int:
    argv = argv or []
    if not argv or argv[0] in {"-h", "--help", "help"}:
        show_help()
        return 0

    parser = build_parser()
    args = parser.parse_args(argv)
    if not args.command:
        show_help()
        return 1

    paths = get_paths()
    options = _shared_options(args)
    config_path = Path(getattr(args, "config", None) or paths.config_path)
    secret_dir = Path(getattr(args, "secret_dir", None) or paths.secret_dir)
    runtime_dir = paths.runtime_dir

    try:
        if args.command == "demo":
            run_demo(reset_dataset=args.reset, backend_only=False, no_build=args.no_build, options=options, paths=paths)
            return 0
        if args.command == "dev":
            run_dev(backend_only=args.backend, daemon=args.daemon, options=options, paths=paths)
            return 0
        if args.command == "production":
            run_production(
                target=args.target,
                config_path=config_path,
                secret_dir=secret_dir,
                runtime_dir=runtime_dir,
                version=args.version,
                backend_image=args.backend_image,
                backend_db_image=args.backend_db_image,
                frontend_image=args.frontend_image,
                redis_image=args.redis_image,
                bundle=args.bundle,
                options=options,
                paths=paths,
            )
            return 0
        if args.command == "upgrade":
            run_upgrade(
                target=args.target,
                config_path=config_path,
                secret_dir=secret_dir,
                runtime_dir=runtime_dir,
                version=args.version,
                backend_image=args.backend_image,
                backend_db_image=args.backend_db_image,
                frontend_image=args.frontend_image,
                redis_image=args.redis_image,
                bundle=args.bundle,
                options=options,
                paths=paths,
            )
            return 0
        if args.command == "verify":
            run_verify(
                mode=args.mode or "",
                target=args.target,
                config_path=config_path,
                secret_dir=secret_dir,
                runtime_dir=runtime_dir,
                options=options,
                paths=paths,
            )
            return 0
        if args.command == "status":
            run_status(
                args.mode or "",
                target=args.target,
                config_path=config_path,
                secret_dir=secret_dir,
                runtime_dir=runtime_dir,
                json_output=args.json,
                options=options,
                paths=paths,
            )
            return 0
        if args.command == "logs":
            if args.mode == "demo":
                command = [paths.compose_script, "logs", "--tail", args.tail]
                if args.follow:
                    command.append("--follow")
                run_command(command, options=options)
                return 0
            if args.mode == "dev":
                command = ["tail", "-n", args.tail]
                if args.follow:
                    command.append("-f")
                command.extend([str(paths.repo_root / ".dev-backend.log"), str(paths.repo_root / ".dev-frontend.log")])
                run_command(command, options=options)
                return 0
            resolved_target = resolve_production_target(paths, args.target, runtime_dir)
            command = [paths.deploy_script, "logs", "--target", resolved_target, "--service", "all", "--tail", args.tail]
            if args.follow:
                command.append("--follow")
            run_command(command, options=options)
            return 0
        if args.command == "doctor":
            run_doctor(
                mode=args.mode or "",
                target=args.target,
                config_path=config_path,
                secret_dir=secret_dir,
                runtime_dir=runtime_dir,
                json_output=args.json,
                repair=args.repair,
                deep=args.deep,
                options=options,
                paths=paths,
            )
            return 0
    except Exception as exc:
        parser.exit(1, f"ERROR: {exc}\n")

    show_help()
    return 1
