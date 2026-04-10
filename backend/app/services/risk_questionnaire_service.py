"""Business rules for risk questionnaires."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Risk, RiskQuestionnaire, User
from app.models.risk_questionnaire import RiskQuestionnaireStatus
from app.models.role import RoleType

QUESTIONNAIRE_TEMPLATE_KEY = "risk_owner_reassessment"
# New sends use v2, but v1 questionnaires remain readable/valid.
QUESTIONNAIRE_TEMPLATE_VERSION = "v2"

# Note: frontend and backend should share these stable keys; frontend question rendering
# owns full validation and localization while backend enforces minimal required keys.
#
# Keep these contracts versioned to prevent key drift (Phase 16).
QUESTION_KEYS_V1: list[str] = [
    "risk_assessment.q1_description_changed",
    "risk_assessment.q2_new_triggers",
    "risk_assessment.q3_recent_incidents",
    "risk_assessment.q4_controls_effective",
    "risk_assessment.q5_control_gaps",
    "risk_assessment.q6_kri_changes",
    "risk_assessment.q7_kri_breaches",
    "risk_assessment.q8_outlook_trend",
    "risk_assessment.q9_mitigation_actions",
    "risk_assessment.q10_support_needed",
]
REQUIRED_KEYS_V1: set[str] = {
    "risk_assessment.q1_description_changed",
    "risk_assessment.q4_controls_effective",
    "risk_assessment.q8_outlook_trend",
    "risk_assessment.q9_mitigation_actions",
}

QUESTION_KEYS_V2: list[str] = [
    *QUESTION_KEYS_V1,
    "risk_assessment.q11_likelihood_12m",
    "risk_assessment.q12_worst_case_impact",
]
REQUIRED_KEYS_V2: set[str] = {
    *REQUIRED_KEYS_V1,
    "risk_assessment.q11_likelihood_12m",
    "risk_assessment.q12_worst_case_impact",
}


def can_submit_questionnaire(current_user: User, risk: Risk) -> bool:
    if risk.owner_id == current_user.id:
        return True
    role_name = getattr(getattr(current_user, "role", None), "name", None)
    return (
        role_name == RoleType.DEPARTMENT_HEAD
        and current_user.department_id is not None
        and current_user.department_id == risk.department_id
    )


def can_send_questionnaire(current_user: User) -> bool:
    role_name = getattr(getattr(current_user, "role", None), "name", None)
    return role_name in {RoleType.RISK_MANAGER, RoleType.CRO}


async def find_open_questionnaire_for_risk(db: AsyncSession, risk_id: int) -> RiskQuestionnaire | None:
    open_statuses = {RiskQuestionnaireStatus.sent, RiskQuestionnaireStatus.in_progress}
    result = await db.execute(
        select(RiskQuestionnaire)
        .where(RiskQuestionnaire.risk_id == risk_id, RiskQuestionnaire.status.in_(open_statuses))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def create_questionnaire_instance(
    *,
    db: AsyncSession,
    risk: Risk,
    assigned_to_user_id: int,
    sent_by_user_id: int,
    template_key: str,
    template_version: str,
    sent_at: datetime,
    due_at: datetime,
) -> RiskQuestionnaire:
    questionnaire = RiskQuestionnaire(
        risk_id=risk.id,
        assigned_to_user_id=assigned_to_user_id,
        sent_by_user_id=sent_by_user_id,
        status=RiskQuestionnaireStatus.sent,
        template_key=template_key,
        template_version=template_version,
        answers=None,
        sent_at=sent_at,
        due_at=due_at,
        submitted_at=None,
        submitted_by_user_id=None,
    )
    db.add(questionnaire)
    await db.flush()
    return questionnaire


async def get_previous_submitted_questionnaire(
    db: AsyncSession,
    *,
    questionnaire: RiskQuestionnaire,
) -> RiskQuestionnaire | None:
    """
    "Previous cycle" lookup used for compare and reporting.

    Definition (Phase 16):
    - Previous cycle = previous submitted questionnaire for the same risk:
      - If current questionnaire is submitted: greatest submitted_at strictly before current submitted_at
      - If current questionnaire is not submitted: greatest submitted_at overall (latest submitted)
    """
    base = select(RiskQuestionnaire).where(
        RiskQuestionnaire.risk_id == questionnaire.risk_id,
        RiskQuestionnaire.id != questionnaire.id,
        RiskQuestionnaire.status == RiskQuestionnaireStatus.submitted,
        RiskQuestionnaire.submitted_at.is_not(None),
    )

    if questionnaire.submitted_at is not None:
        base = base.where(RiskQuestionnaire.submitted_at < questionnaire.submitted_at)

    result = await db.execute(base.order_by(RiskQuestionnaire.submitted_at.desc()).limit(1))
    return result.scalar_one_or_none()


def validate_submit_answers_v1(answers: dict[str, object]) -> set[str]:
    keys = set(answers.keys())
    return REQUIRED_KEYS_V1.difference(keys)


def validate_submit_answers(
    *,
    template_version: str,
    answers: dict[str, object],
) -> tuple[set[str], dict[str, str]]:
    """
    Minimal backend-side submission validation.

    - v1: enforce required keys exist
    - v2: enforce required keys exist + quantified fields are integers 1–5
    """
    required = REQUIRED_KEYS_V1 if template_version == "v1" else REQUIRED_KEYS_V2
    keys = set(answers.keys())
    missing = required.difference(keys)

    invalid: dict[str, str] = {}
    if template_version == "v2":
        for key in ("risk_assessment.q11_likelihood_12m", "risk_assessment.q12_worst_case_impact"):
            value = answers.get(key)
            if isinstance(value, bool):
                invalid[key] = "Must be an integer 1–5"
                continue
            if not isinstance(value, int):
                invalid[key] = "Must be an integer 1–5"
                continue
            if value < 1 or value > 5:
                invalid[key] = "Must be between 1 and 5"

    return missing, invalid
