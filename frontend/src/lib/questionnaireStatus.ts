/**
 * Risk-questionnaire status presentation: the one status → tone + label map
 * (audit 2026-09-30 PG-20 / PG-03, §4.4 A). The risk detail tab and the
 * approvals inbox both render through it, so "submitted" reads the same
 * everywhere. Colours come from the status `BADGE_TONES` only.
 */
import { BADGE_TONES, type StatusTone } from '@/lib/tones';
import type { RiskQuestionnaireListItem } from '@/types/riskQuestionnaire';

export type QuestionnaireDisplayStatus = 'overdue' | 'sent' | 'in_progress' | 'submitted';

const QUESTIONNAIRE_STATUS_TONE: Readonly<Record<QuestionnaireDisplayStatus, StatusTone>> = {
    overdue: 'danger',
    sent: 'warning',
    in_progress: 'info',
    submitted: 'success',
};

type QuestionnaireStatusInput = Pick<RiskQuestionnaireListItem, 'status' | 'due_at'>;

export function isQuestionnaireOverdue(questionnaire: QuestionnaireStatusInput, now = Date.now()): boolean {
    return questionnaire.status !== 'submitted' && new Date(questionnaire.due_at).getTime() < now;
}

export interface QuestionnaireStatusMeta {
    /** Display status (overdue wins over the stored status); `null` for an unknown stored status. */
    status: QuestionnaireDisplayStatus | null;
    /** `risks:questionnaire.status.*` key, or `null` for an unknown stored status. */
    labelKey: string | null;
    tone: StatusTone;
    /** Soft badge recipe with its border width (`BADGE_TONES[tone].badgeClassName`). */
    badgeClassName: string;
}

function toDisplayStatus(status: string): QuestionnaireDisplayStatus | null {
    return status === 'sent' || status === 'in_progress' || status === 'submitted' ? status : null;
}

export function getQuestionnaireStatusMeta(
    questionnaire: QuestionnaireStatusInput,
    now = Date.now(),
): QuestionnaireStatusMeta {
    const status = isQuestionnaireOverdue(questionnaire, now) ? 'overdue' : toDisplayStatus(questionnaire.status);
    const tone: StatusTone = status ? QUESTIONNAIRE_STATUS_TONE[status] : 'neutral';
    return {
        status,
        labelKey: status ? `risks:questionnaire.status.${status}` : null,
        tone,
        badgeClassName: BADGE_TONES[tone].badgeClassName,
    };
}
