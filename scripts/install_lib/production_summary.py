from __future__ import annotations

from pathlib import Path

from install_lib.common import SharedOptions, run_command


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
