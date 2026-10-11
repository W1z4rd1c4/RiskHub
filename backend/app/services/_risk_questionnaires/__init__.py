from .lifecycle import (
    QuestionnaireClarificationOutcome as QuestionnaireClarificationOutcome,
)
from .lifecycle import (
    QuestionnaireLifecycleOptions as QuestionnaireLifecycleOptions,
)
from .lifecycle import (
    QuestionnaireLifecycleOutcome as QuestionnaireLifecycleOutcome,
)
from .lifecycle import (
    open_questionnaire_detail as open_questionnaire_detail,
)
from .lifecycle import (
    read_questionnaire_detail as read_questionnaire_detail,
)
from .lifecycle import (
    request_questionnaire_clarification_detail as request_questionnaire_clarification_detail,
)
from .lifecycle import (
    respond_questionnaire_clarification_detail as respond_questionnaire_clarification_detail,
)
from .lifecycle import (
    save_questionnaire_draft_detail as save_questionnaire_draft_detail,
)
from .lifecycle import (
    submit_questionnaire_detail as submit_questionnaire_detail,
)
from .policy import (
    can_act_on_questionnaire as can_act_on_questionnaire,
)
from .policy import (
    can_read_questionnaire as can_read_questionnaire,
)
from .policy import (
    can_request_questionnaire_clarification as can_request_questionnaire_clarification,
)
from .policy import (
    can_send_questionnaire as can_send_questionnaire,
)
from .policy import (
    can_submit_questionnaire as can_submit_questionnaire,
)
from .policy import (
    questionnaire_capabilities as questionnaire_capabilities,
)
from .repository import (
    count_questionnaire_inbox as count_questionnaire_inbox,
)
from .repository import (
    find_open_questionnaire_for_risk as find_open_questionnaire_for_risk,
)
from .repository import (
    get_previous_submitted_questionnaire as get_previous_submitted_questionnaire,
)
from .repository import (
    list_questionnaire_inbox as list_questionnaire_inbox,
)
from .repository import (
    load_questionnaire as load_questionnaire,
)
from .repository import (
    load_risk as load_risk,
)
from .repository import (
    questionnaire_load_options as questionnaire_load_options,
)
from .validation import (
    OPEN_QUESTIONNAIRE_STATUSES as OPEN_QUESTIONNAIRE_STATUSES,
)
from .validation import (
    QUESTION_KEYS_V1 as QUESTION_KEYS_V1,
)
from .validation import (
    QUESTION_KEYS_V2 as QUESTION_KEYS_V2,
)
from .validation import (
    QUESTIONNAIRE_TEMPLATE_KEY as QUESTIONNAIRE_TEMPLATE_KEY,
)
from .validation import (
    QUESTIONNAIRE_TEMPLATE_VERSION as QUESTIONNAIRE_TEMPLATE_VERSION,
)
from .validation import (
    REQUIRED_KEYS_V1 as REQUIRED_KEYS_V1,
)
from .validation import (
    REQUIRED_KEYS_V2 as REQUIRED_KEYS_V2,
)
from .validation import (
    validate_submit_answers as validate_submit_answers,
)
from .validation import (
    validate_submit_answers_v1 as validate_submit_answers_v1,
)
from .workflow import (
    create_questionnaire_instance as create_questionnaire_instance,
)
from .workflow import (
    open_questionnaire_for_user as open_questionnaire_for_user,
)
from .workflow import (
    request_questionnaire_clarification as request_questionnaire_clarification,
)
from .workflow import (
    respond_to_questionnaire_clarification as respond_to_questionnaire_clarification,
)
from .workflow import (
    save_questionnaire_draft as save_questionnaire_draft,
)
from .workflow import (
    send_questionnaire_for_risk as send_questionnaire_for_risk,
)
from .workflow import (
    submit_questionnaire_for_user as submit_questionnaire_for_user,
)

# Caller-facing names are declared once; internal implementation files may move.
CALLER_EXPORTS = {
    "OPEN_QUESTIONNAIRE_STATUSES": ("service",),
    "QUESTIONNAIRE_TEMPLATE_KEY": ("service",),
    "QUESTIONNAIRE_TEMPLATE_VERSION": ("service",),
    "QUESTION_KEYS_V1": ("service",),
    "QUESTION_KEYS_V2": ("service",),
    "REQUIRED_KEYS_V1": ("service",),
    "REQUIRED_KEYS_V2": ("service",),
    "can_act_on_questionnaire": ("service",),
    "can_read_questionnaire": ("service", "query_adapter"),
    "can_request_questionnaire_clarification": ("service",),
    "can_send_questionnaire": ("service", "send_adapter"),
    "can_submit_questionnaire": ("service",),
    "count_questionnaire_inbox": ("service", "query_adapter"),
    "create_questionnaire_instance": ("service",),
    "find_open_questionnaire_for_risk": ("service",),
    "get_previous_submitted_questionnaire": ("service",),
    "list_questionnaire_inbox": ("service", "query_adapter"),
    "load_questionnaire": ("service", "send_adapter"),
    "load_risk": ("service",),
    "open_questionnaire_for_user": ("service",),
    "QuestionnaireClarificationOutcome": ("service", "endpoint"),
    "QuestionnaireLifecycleOptions": ("service", "endpoint"),
    "QuestionnaireLifecycleOutcome": ("service", "endpoint"),
    "open_questionnaire_detail": ("service", "endpoint"),
    "questionnaire_capabilities": ("service", "query_adapter"),
    "questionnaire_load_options": ("service", "query_adapter", "send_adapter"),
    "read_questionnaire_detail": ("service", "endpoint"),
    "request_questionnaire_clarification_detail": ("service", "endpoint"),
    "request_questionnaire_clarification": ("service",),
    "respond_questionnaire_clarification_detail": ("service", "endpoint"),
    "respond_to_questionnaire_clarification": ("service",),
    "save_questionnaire_draft": ("service",),
    "save_questionnaire_draft_detail": ("service", "endpoint"),
    "send_questionnaire_for_risk": ("service", "send_adapter"),
    "submit_questionnaire_for_user": ("service",),
    "submit_questionnaire_detail": ("service", "endpoint"),
    "validate_submit_answers": ("service",),
    "validate_submit_answers_v1": ("service",),
}

CALLER_ROLES = {
    "app.api.v1.endpoints.risk_questionnaires._shared": "query_adapter",
    "app.api.v1.endpoints.risk_questionnaires.inbox": "query_adapter",
    "app.api.v1.endpoints.users.summary": "query_adapter",
    "app.api.v1.endpoints.risk_questionnaires.risk_routes": "send_adapter",
    "app.api.v1.endpoints.riskhub_questionnaires": "send_adapter",
}

CALLER_FACADES = ("app.services.risk_questionnaire_service",)

__all__ = list(CALLER_EXPORTS)
