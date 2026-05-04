from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ProdReadinessRunState:
    run_id: str
    artifact_root: Path
