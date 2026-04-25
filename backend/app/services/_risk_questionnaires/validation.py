from app.models.risk_questionnaire import RiskQuestionnaireStatus

QUESTIONNAIRE_TEMPLATE_KEY = "risk_owner_reassessment"
# New sends use v2, but v1 questionnaires remain readable/valid.
QUESTIONNAIRE_TEMPLATE_VERSION = "v2"
OPEN_QUESTIONNAIRE_STATUSES = {RiskQuestionnaireStatus.sent, RiskQuestionnaireStatus.in_progress}

# Note: frontend and backend should share these stable keys; frontend question rendering
# owns full validation and localization while backend enforces minimal required keys.
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
    - v2: enforce required keys exist + quantified fields are integers 1-5
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
