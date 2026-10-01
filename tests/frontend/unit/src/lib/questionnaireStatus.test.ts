import { describe, expect, it } from 'vitest';

import { getQuestionnaireStatusMeta, isQuestionnaireOverdue } from '@/lib/questionnaireStatus';
import { BADGE_TONES } from '@/lib/tones';

const NOW = Date.parse('2026-03-05T09:00:00Z');
const PAST = '2026-03-01T00:00:00Z';
const FUTURE = '2026-04-01T00:00:00Z';

describe('questionnaire status — one map for every surface (PG-20)', () => {
    it.each([
        ['sent', FUTURE, 'sent', 'warning'],
        ['in_progress', FUTURE, 'in_progress', 'info'],
        ['submitted', FUTURE, 'submitted', 'success'],
        ['submitted', PAST, 'submitted', 'success'],
        ['sent', PAST, 'overdue', 'danger'],
        ['in_progress', PAST, 'overdue', 'danger'],
    ] as const)('%s due %s → %s (%s)', (status, dueAt, display, tone) => {
        const meta = getQuestionnaireStatusMeta({ status, due_at: dueAt }, NOW);
        expect(meta).toEqual({
            status: display,
            labelKey: `risks:questionnaire.status.${display}`,
            tone,
            badgeClassName: BADGE_TONES[tone].badgeClassName,
        });
    });

    it('never treats a submitted questionnaire as overdue', () => {
        expect(isQuestionnaireOverdue({ status: 'submitted', due_at: PAST }, NOW)).toBe(false);
        expect(isQuestionnaireOverdue({ status: 'sent', due_at: PAST }, NOW)).toBe(true);
    });

    it('falls back to a neutral tone without a label key for an unknown stored status', () => {
        const meta = getQuestionnaireStatusMeta({ status: 'archived' as never, due_at: FUTURE }, NOW);
        expect(meta.status).toBeNull();
        expect(meta.labelKey).toBeNull();
        expect(meta.tone).toBe('neutral');
    });
});
