from __future__ import annotations

import os
import re
import socket
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path


def default_run_id() -> str:
    return datetime.now(UTC).strftime("%Y%m%d-%H%M%S")


def pick_free_port(start: int, end: int) -> int:
    for port in range(start, end + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    raise RuntimeError(f"No free port found in range {start}-{end}")


def _safe_run_fragment(run_id: str) -> str:
    fragment = re.sub(r"[^a-zA-Z0-9_.-]+", "-", run_id).strip("-")
    return fragment or "run"


@dataclass
class ProdReadinessRunState:
    root_dir: Path
    run_id: str
    report_date: str
    artifact_root: Path
    report_path: Path
    postgres_port: int = field(default_factory=lambda: pick_free_port(55432, 55999))
    frontend_host_port: int = field(default_factory=lambda: pick_free_port(28081, 28999))
    registry_port: int = field(default_factory=lambda: pick_free_port(56000, 56499))
    required_failures: int = 0
    planned_run_complete: bool = False
    command_results: list[dict[str, object]] = field(default_factory=list)

    @property
    def meta_dir(self) -> Path:
        return self.artifact_root / "meta"

    @property
    def log_dir(self) -> Path:
        return self.artifact_root / "logs"

    @property
    def reports_dir(self) -> Path:
        return self.artifact_root / "reports"

    @property
    def tmp_dir(self) -> Path:
        return self.artifact_root / "tmp"

    @property
    def matrix_ndjson(self) -> Path:
        return self.tmp_dir / "command-matrix.ndjson"

    @property
    def matrix_json(self) -> Path:
        return self.reports_dir / "command-matrix.json"

    @property
    def run_status_json(self) -> Path:
        return self.reports_dir / "run_status.json"

    @property
    def report_artifact_path(self) -> Path:
        return self.reports_dir / "report.md"

    @property
    def runtime_dir(self) -> Path:
        return self.tmp_dir / "runtime"

    @property
    def config_path(self) -> Path:
        return self.tmp_dir / "riskhub.prod.env"

    @property
    def secret_dir(self) -> Path:
        return self.tmp_dir / "secrets"

    @property
    def run_fragment(self) -> str:
        return _safe_run_fragment(self.run_id)

    @property
    def postgres_container(self) -> str:
        return f"riskhub-audit-pg-{self.run_fragment}"

    @property
    def registry_container(self) -> str:
        return f"riskhub-audit-reg-{self.run_fragment}"

    @property
    def local_registry(self) -> str:
        return f"127.0.0.1:{self.registry_port}"

    @property
    def deploy_tag(self) -> str:
        return f"audit-{self.run_fragment}"

    @property
    def upgrade_tag(self) -> str:
        return f"{self.deploy_tag}-u1"

    @property
    def backend_image_deploy(self) -> str:
        return f"{self.local_registry}/riskhub-backend:{self.deploy_tag}"

    @property
    def backend_db_image_deploy(self) -> str:
        return f"{self.local_registry}/riskhub-backend-db:{self.deploy_tag}"

    @property
    def frontend_image_deploy(self) -> str:
        return f"{self.local_registry}/riskhub-frontend:{self.deploy_tag}"

    @property
    def redis_image_deploy(self) -> str:
        return f"{self.local_registry}/riskhub-redis:{self.deploy_tag}"

    @property
    def backend_image_upgrade(self) -> str:
        return f"{self.local_registry}/riskhub-backend:{self.upgrade_tag}"

    @property
    def backend_db_image_upgrade(self) -> str:
        return f"{self.local_registry}/riskhub-backend-db:{self.upgrade_tag}"

    @property
    def frontend_image_upgrade(self) -> str:
        return f"{self.local_registry}/riskhub-frontend:{self.upgrade_tag}"

    @property
    def redis_image_upgrade(self) -> str:
        return f"{self.local_registry}/riskhub-redis:{self.upgrade_tag}"

    def ensure_directories(self) -> None:
        for path in (self.meta_dir, self.log_dir, self.reports_dir, self.tmp_dir, self.runtime_dir, self.secret_dir):
            path.mkdir(parents=True, exist_ok=True)
        (self.root_dir / "tests" / "results" / "prod").mkdir(parents=True, exist_ok=True)
        (self.root_dir / "docs" / "security" / "reports").mkdir(parents=True, exist_ok=True)
        self.matrix_ndjson.write_text("", encoding="utf-8")


def build_run_state(*, root_dir: Path, run_id: str | None = None) -> ProdReadinessRunState:
    effective_run_id = run_id or os.environ.get("RUN_ID") or default_run_id()
    report_date = os.environ.get("REPORT_DATE") or datetime.now(UTC).strftime("%Y-%m-%d")
    artifact_root = Path(
        os.environ.get(
            "ARTIFACT_ROOT",
            str(root_dir / "tests" / "results" / "prod" / f"prod-readiness-audit-{effective_run_id}"),
        )
    )
    report_path = root_dir / "docs" / "security" / "reports" / f"prod-readiness-deep-audit-{report_date}.md"
    return ProdReadinessRunState(
        root_dir=root_dir,
        run_id=effective_run_id,
        report_date=report_date,
        artifact_root=artifact_root,
        report_path=report_path,
    )
