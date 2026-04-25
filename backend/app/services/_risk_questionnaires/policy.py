from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import can_read_risk_id
from app.models import Risk, RiskQuestionnaire, User
from app.models.risk_questionnaire import RiskQuestionnaireStatus
from app.models.role import RoleType

from .validation import OPEN_QUESTIONNAIRE_STATUSES


def _role_name(user: User) -> str | None:
    return getattr(getattr(user, "role", None), "name", None)


def can_submit_questionnaire(current_user: User, risk: Risk) -> bool:
    if risk.owner_id == current_user.id:
        return True
    role_name = _role_name(current_user)
    return (
        role_name == RoleType.DEPARTMENT_HEAD
        and current_user.department_id is not None
        and current_user.department_id == risk.department_id
    )


def can_send_questionnaire(current_user: User) -> bool:
    return _role_name(current_user) in {RoleType.RISK_MANAGER, RoleType.CRO}


async def can_read_questionnaire(db: AsyncSession, current_user: User, questionnaire: RiskQuestionnaire) -> bool:
    return await can_read_risk_id(db, current_user, questionnaire.risk_id)


def can_act_on_questionnaire(current_user: User, questionnaire: RiskQuestionnaire) -> bool:
    if questionnaire.assigned_to_user_id == current_user.id:
        return True
    risk = questionnaire.risk
    return (
        _role_name(current_user) == RoleType.DEPARTMENT_HEAD
        and current_user.department_id is not None
        and risk is not None
        and current_user.department_id == risk.department_id
    )


async def can_request_questionnaire_clarification(
    db: AsyncSession, current_user: User, questionnaire: RiskQuestionnaire
) -> bool:
    return can_send_questionnaire(current_user) and await can_read_questionnaire(db, current_user, questionnaire)


async def questionnaire_capabilities(
    db: AsyncSession,
    current_user: User,
    questionnaire: RiskQuestionnaire,
) -> dict[str, bool]:
    can_act = can_act_on_questionnaire(current_user, questionnaire)
    is_open = questionnaire.status in OPEN_QUESTIONNAIRE_STATUSES
    can_request_clarification = await can_request_questionnaire_clarification(db, current_user, questionnaire)
    return {
        "can_open": can_act and questionnaire.status == RiskQuestionnaireStatus.sent,
        "can_save_draft": can_act and is_open,
        "can_submit": can_act and is_open,
        "can_request_clarification": (
            can_request_clarification and questionnaire.status == RiskQuestionnaireStatus.submitted
        ),
        "can_respond_to_clarifications": questionnaire.assigned_to_user_id == current_user.id,
    }
