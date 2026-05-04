from __future__ import annotations

from dataclasses import dataclass

SCHEDULER_RUNTIME_JOB_NAME = "__scheduler_runtime__"
SCHEDULER_JOB_PROFILE_ENV = "SCHEDULER_JOB_PROFILE"
DEFAULT_SCHEDULER_JOB_PROFILE = "full"
FULL_SCHEDULER_JOB_IDS = (
    "kri_deadline_check",
    "questionnaire_deadline_check",
    "issue_deadline_check",
    "ad_deprovision_check",
    "orphan_scan",
    "outbox_dispatch",
)
OPTIONAL_SCHEDULER_JOB_IDS = ("sso_jwks_refresh",)
OUTBOX_ONLY_SCHEDULER_JOB_IDS = ("outbox_dispatch",)


@dataclass(frozen=True)
class SchedulerJobRegistration:
    job_id: str


def scheduler_job_profile_ids(profile: str) -> tuple[str, ...]:
    if profile == "outbox_only":
        return OUTBOX_ONLY_SCHEDULER_JOB_IDS
    return FULL_SCHEDULER_JOB_IDS
