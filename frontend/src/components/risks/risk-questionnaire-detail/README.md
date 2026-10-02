# Risk Questionnaire Detail Module

This module contains the `RiskQuestionnaireDetail` implementation split from
`frontend/src/components/risks/RiskQuestionnaireDetail.tsx`
to preserve the existing public import path while improving maintainability.

Answers render through `QuestionAnswerField`: editable questions are `Field`s
(label, required `*`, help and the announced "required" error) around the `ui`
controls; read-only answers are `dt` / `dd` pairs, and an unanswered question
reads a muted "Not answered" (GAP-B-24). The header meta (`RiskQuestionnaireMetaBar`)
shows the shared `QuestionnaireStatusBadge`, never the raw status code.
