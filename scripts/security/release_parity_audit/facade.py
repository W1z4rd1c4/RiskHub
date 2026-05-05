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
        ReleaseParityPhase("capture_baseline", audit.capture_baseline),
        ReleaseParityPhase("startup_inventory", audit.build_startup_inventory),
        ReleaseParityPhase("static_resolution", audit.extract_static_resolution),
        ReleaseParityPhase("toolchain", audit.capture_toolchain),
        ReleaseParityPhase("startup_preflight", audit.capture_startup_preflight),
        ReleaseParityPhase("dynamic_paths", audit.run_dynamic_paths),
        ReleaseParityPhase("dependencies", audit.capture_dependencies),
        ReleaseParityPhase("ui_parity", audit.evaluate_ui_parity),
        ReleaseParityPhase("decision", audit.evaluate_findings_and_decision),
        ReleaseParityPhase("report", audit.write_report),
    ]
