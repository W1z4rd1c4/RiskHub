import { describe, expect, it } from 'vitest';

import { shouldAutoOpenQuestionnaire } from '@/components/risks/risk-questionnaire-detail/questionnaireWorkflowState';
import type { RiskQuestionnaireDetail } from '@/types/riskQuestionnaire';

function detail(
    status: RiskQuestionnaireDetail['status'],
    capabilities: RiskQuestionnaireDetail['capabilities'],
): RiskQuestionnaireDetail {
    return {
        id: 1,
        risk_id: 2,
        assigned_to_user_id: 3,
        sent_by_user_id: 4,
        status,
        template_key: 'risk_owner_reassessment',
        template_version: 'v1',
        answers: null,
        sent_at: '2026-01-01T00:00:00Z',
        due_at: '2026-01-16T00:00:00Z',
        submitted_at: null,
        submitted_by_user_id: null,
        capabilities,
        previous_submission: null,
    };
}

describe('questionnaire workflow state', () => {
    it('centralizes the automatic open decision around backend capabilities', () => {
        expect(shouldAutoOpenQuestionnaire(detail('sent', { can_open: true }))).toBe(true);
        expect(shouldAutoOpenQuestionnaire(detail('sent', { can_open: false }))).toBe(false);
        expect(shouldAutoOpenQuestionnaire(detail('submitted', { can_open: true }))).toBe(false);
        expect(shouldAutoOpenQuestionnaire(detail('sent', null))).toBe(false);
    });
});
