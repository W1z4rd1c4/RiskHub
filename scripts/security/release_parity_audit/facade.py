from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from release_parity_audit.phase_runner import ReleaseParityPhase


@dataclass(frozen=True)
class ReleaseParityFacadePlan:
    phases: list[str]
    facts: dict[str, Any]


def build_release_parity_facade_plan(*, phases: list[str], facts: dict[str, Any]) -> ReleaseParityFacadePlan:
    return ReleaseParityFacadePlan(phases=list(phases), facts=dict(facts))


def release_parity_phases(audit) -> list[ReleaseParityPhase]:
    return [
        ReleaseParityPhase("capture_baseline", audit._capture_baseline),
        ReleaseParityPhase("startup_inventory", audit._build_startup_inventory),
        ReleaseParityPhase("static_resolution", audit._extract_static_resolution),
        ReleaseParityPhase("toolchain", audit._capture_toolchain),
        ReleaseParityPhase("startup_preflight", audit._capture_startup_preflight),
        ReleaseParityPhase("dynamic_paths", audit._run_dynamic_paths),
        ReleaseParityPhase("dependencies", audit._capture_dependencies),
        ReleaseParityPhase("ui_parity", audit._evaluate_ui_parity),
        ReleaseParityPhase("decision", audit._evaluate_findings_and_decision),
        ReleaseParityPhase("report", audit._write_report),
    ]
