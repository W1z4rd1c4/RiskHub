import { describe, expect, it } from 'vitest';

import enRisks from '@/i18n/locales/en/risks.json';
import csRisks from '@/i18n/locales/cs/risks.json';
import { getQuestionnaireStatusMeta, isQuestionnaireOverdue } from '@/lib/questionnaireStatus';

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
        });
    });

    it('never treats a submitted questionnaire as overdue', () => {
        expect(isQuestionnaireOverdue({ status: 'submitted', due_at: PAST }, NOW)).toBe(false);
        expect(isQuestionnaireOverdue({ status: 'sent', due_at: PAST }, NOW)).toBe(true);
    });

    it('falls back to a neutral, translated "unknown" label for an unknown stored status (never the raw code)', () => {
        const meta = getQuestionnaireStatusMeta({ status: 'archived' as never, due_at: FUTURE }, NOW);
        expect(meta.status).toBeNull();
        expect(meta.labelKey).toBe('risks:questionnaire.status.unknown');
        expect(meta.tone).toBe('neutral');
    });

    it('has an en + cs label for every display status (enum coverage, PG-03)', () => {
        for (const status of ['sent', 'in_progress', 'submitted', 'overdue', 'unknown'] as const) {
            expect(enRisks.questionnaire.status[status]).toEqual(expect.any(String));
            expect(csRisks.questionnaire.status[status]).toEqual(expect.any(String));
            expect(csRisks.questionnaire.status[status]).not.toBe(enRisks.questionnaire.status[status]);
        }
    });
});
