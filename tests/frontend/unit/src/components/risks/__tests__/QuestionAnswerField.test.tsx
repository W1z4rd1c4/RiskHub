import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { QuestionAnswerField } from '@/components/risks/risk-questionnaire-detail/QuestionAnswerField';
import { formatQuestionnaireAnswer } from '@/components/risks/risk-questionnaire-detail/questionnairePresentation';
import type { RiskQuestionnaireQuestion } from '@/components/risks/riskQuestionnaireQuestions';

const t = (key: string, fallback?: string | Record<string, unknown>) => (typeof fallback === 'string' && fallback ? fallback : key);

const textQuestion: RiskQuestionnaireQuestion = { key: 'risk_assessment.q3_notes', type: 'text', required: true };

function renderField(overrides: Partial<Parameters<typeof QuestionAnswerField>[0]> = {}) {
    return render(
        <dl>
            <QuestionAnswerField
                answers={{}}
                getPreviousAnswer={() => undefined}
                isChanged={() => false}
                isEditable={false}
                likelihoodOptions={[]}
                likelihoodQuestionKey="risk_assessment.q11_likelihood_12m"
                missingKeys={[]}
                question={textQuestion}
                renderAnswer={(key, value) => formatQuestionnaireAnswer(key, value, { totalAssets: 0, t })}
                setAnswers={vi.fn()}
                t={t}
                worstCaseImpactOptions={[]}
                worstCaseImpactQuestionKey="risk_assessment.q12_worst_case_impact"
                {...overrides}
            />
        </dl>,
    );
}

describe('QuestionAnswerField', () => {
    it('formats a missing or blank answer as "not answered" (null), never "Unknown" (GAP-B-24)', () => {
        for (const value of [undefined, null, '', '   ']) {
            expect(formatQuestionnaireAnswer('risk_assessment.q3_notes', value, { totalAssets: 0, t })).toBeNull();
        }
        expect(formatQuestionnaireAnswer('risk_assessment.q3_notes', 'Text', { totalAssets: 0, t })).toBe('Text');
    });

    it('shows an unanswered read-only question as a muted "Not answered" value', () => {
        renderField();

        expect(screen.getByRole('term')).toHaveTextContent('risk_assessment.q3_notes');
        const value = screen.getByText('risks:questionnaire.not_answered');
        expect(value).toHaveClass('text-muted-foreground');
        expect(screen.queryByText('labels.unknown')).not.toBeInTheDocument();
    });

    it('labels an editable required question with the Field "*" and announces the missing-answer error', () => {
        renderField({ isEditable: true, missingKeys: ['risk_assessment.q3_notes'] });

        const input = screen.getByRole('textbox', { name: 'risk_assessment.q3_notes' });
        expect(input).toHaveAttribute('aria-required', 'true');
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(input).toHaveAccessibleDescription('risks:questionnaire.validation_required');
        expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
    });

    it('describes a changed answer with the "Changed" badge and the previous answer in compare mode', () => {
        renderField({
            isEditable: true,
            answers: { 'risk_assessment.q3_notes': 'New' },
            isChanged: () => true,
            getPreviousAnswer: () => 'Old',
        });

        const input = screen.getByRole('textbox', { name: 'risk_assessment.q3_notes' });
        expect(input).toHaveAccessibleDescription('risks:questionnaire.changed risks:questionnaire.previous: Old');
    });
});
