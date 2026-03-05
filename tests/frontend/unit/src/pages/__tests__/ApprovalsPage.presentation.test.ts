import { describe, expect, it } from 'vitest';

import type { RiskQuestionnaireListItem } from '@/types/riskQuestionnaire';
import {
    buildApprovalListParams,
    getQuestionnaireStatusBadge,
    getQuestionnaireStatusLabel,
    isQuestionnaireOverdue,
} from '@/pages/approvals/approvalsPresentation';

const translate = (key: string) => key;

function createQuestionnaire(overrides: Partial<RiskQuestionnaireListItem> = {}): RiskQuestionnaireListItem {
    return {
        id: 1,
        risk_id: 10,
        assigned_to_user_id: 1,
        sent_by_user_id: 2,
        status: 'sent',
        template_key: 'default',
        template_version: '1',
        sent_at: '2026-03-01T09:00:00Z',
        due_at: '2026-03-10T09:00:00Z',
        ...overrides,
    };
}

describe('Approvals page presentation helpers', () => {
    describe('buildApprovalListParams', () => {
        it('adds pending status and my_requests for non-resolvers', () => {
            expect(buildApprovalListParams('pending', false)).toEqual({
                limit: 100,
                status: 'pending',
                my_requests: true,
            });
        });

        it('keeps pending queue global for resolvers', () => {
            expect(buildApprovalListParams('pending', true)).toEqual({
                limit: 100,
                status: 'pending',
            });
        });

        it('maps mine to my_requests only', () => {
            expect(buildApprovalListParams('mine', true)).toEqual({
                limit: 100,
                my_requests: true,
            });
        });

        it('keeps all/history unfiltered', () => {
            expect(buildApprovalListParams('all', true)).toEqual({ limit: 100 });
        });
    });

    describe('questionnaire helpers', () => {
        it('treats past-due non-submitted questionnaires as overdue', () => {
            const questionnaire = createQuestionnaire({ due_at: '2026-03-02T09:00:00Z' });
            expect(isQuestionnaireOverdue(questionnaire, Date.parse('2026-03-05T09:00:00Z'))).toBe(true);
            expect(getQuestionnaireStatusLabel(questionnaire, translate, Date.parse('2026-03-05T09:00:00Z'))).toBe(
                'risks:questionnaire.status.overdue',
            );
        });

        it('does not mark submitted questionnaires overdue after due date', () => {
            const questionnaire = createQuestionnaire({
                status: 'submitted',
                due_at: '2026-03-02T09:00:00Z',
            });

            expect(isQuestionnaireOverdue(questionnaire, Date.parse('2026-03-05T09:00:00Z'))).toBe(false);
            expect(getQuestionnaireStatusLabel(questionnaire, translate, Date.parse('2026-03-05T09:00:00Z'))).toBe(
                'risks:questionnaire.status.submitted',
            );
        });

        it('returns the in-progress accent badge', () => {
            const questionnaire = createQuestionnaire({ status: 'in_progress' });
            expect(getQuestionnaireStatusBadge(questionnaire)).toContain('text-accent');
        });
    });
});
