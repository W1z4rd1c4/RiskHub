import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Risk } from '@/types/risk';
import type { RiskQuestionnaireDetail as RiskQuestionnaireDetailType } from '@/types/riskQuestionnaire';
import { RiskQuestionnaireDetail } from '@/components/risks/RiskQuestionnaireDetail';

const tMock = (_key: string, fallback?: string) => fallback ?? _key;

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: tMock,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/hooks/useRiskHubConfig', () => ({
    useTotalAssetsValue: () => ({ totalAssets: 1_000_000 }),
}));

const mockUseAuth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => mockUseAuth(),
}));

const mockUseAuthz = vi.fn();
vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => mockUseAuthz(),
}));

vi.mock('@/services/riskQuestionnairesApi', () => ({
    riskQuestionnairesApi: {
        get: vi.fn(),
        open: vi.fn(),
        listClarifications: vi.fn(),
        saveDraft: vi.fn(),
        submit: vi.fn(),
        createClarification: vi.fn(),
        respondClarification: vi.fn(),
    },
}));

import { riskQuestionnairesApi } from '@/services/riskQuestionnairesApi';

const baseRisk: Risk = {
    id: 10,
    risk_id_code: 'R-001',
    name: 'Risk',
    process: 'Process',
    risk_type: 'operational',
    description: 'desc',
    department_id: 1,
    owner_id: 1,
    gross_probability: 3,
    gross_impact: 3,
    gross_score: 9,
    net_probability: 2,
    net_impact: 2,
    net_score: 4,
    status: 'active',
    is_priority: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
};

function sentQuestionnaire(overrides: Partial<RiskQuestionnaireDetailType> = {}): RiskQuestionnaireDetailType {
    return {
        id: 123,
        risk_id: baseRisk.id,
        risk_name: baseRisk.name,
        assigned_to_user_id: 1,
        sent_by_user_id: 2,
        status: 'sent',
        template_key: 'risk_owner_reassessment',
        template_version: 'v1',
        sent_at: '2025-01-01T00:00:00Z',
        due_at: '2025-01-10T00:00:00Z',
        answers: {},
        capabilities: {
            can_open: true,
            can_save_draft: true,
            can_submit: true,
            can_request_clarification: false,
            can_respond_to_clarifications: false,
        },
        ...overrides,
    };
}

const completeAnswers = {
    'risk_assessment.q1_description_changed': true,
    'risk_assessment.q4_controls_effective': true,
    'risk_assessment.q8_outlook_trend': 'risk_assessment.options.trend.stable',
    'risk_assessment.q9_mitigation_actions': 'Mitigate',
};

describe('RiskQuestionnaireDetail open flow', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mockUseAuth.mockReturnValue({ user: { id: 1, department_id: 1 } });
        mockUseAuthz.mockReturnValue({ isDepartmentHead: false, canRequestRiskClarification: false });
        (riskQuestionnairesApi.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sentQuestionnaire());
        (riskQuestionnairesApi.open as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            ...sentQuestionnaire(),
            status: 'in_progress',
        });
        (riskQuestionnairesApi.listClarifications as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    });

    it('calls open() when questionnaire is sent and user can submit', async () => {
        render(
            <RiskQuestionnaireDetail
                isOpen={true}
                onClose={() => {}}
                questionnaireId={123}
                risk={baseRisk}
            />
        );

        await waitFor(() => {
            expect(riskQuestionnairesApi.open).toHaveBeenCalledWith(123, { includePrevious: false });
        });
    });

    it('does not call open() when backend capability denies submit', async () => {
        mockUseAuth.mockReturnValue({ user: { id: 999, department_id: 2 } });
        (riskQuestionnairesApi.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sentQuestionnaire({
            capabilities: {
                can_open: false,
                can_save_draft: false,
                can_submit: false,
                can_request_clarification: false,
                can_respond_to_clarifications: false,
            },
        }));

        render(
            <RiskQuestionnaireDetail
                isOpen={true}
                onClose={() => {}}
                questionnaireId={123}
                risk={baseRisk}
            />
        );

        // Still fetches the questionnaire…
        await waitFor(() => {
            expect(riskQuestionnairesApi.get).toHaveBeenCalled();
        });
        // …but does not attempt to open it.
        expect(riskQuestionnairesApi.open).not.toHaveBeenCalled();
    });

    it('uses backend capabilities to suppress automatic open', async () => {
        (riskQuestionnairesApi.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            ...sentQuestionnaire(),
            capabilities: {
                can_open: false,
                can_save_draft: false,
                can_submit: false,
                can_request_clarification: false,
                can_respond_to_clarifications: false,
            },
        });

        render(
            <RiskQuestionnaireDetail
                isOpen={true}
                onClose={() => {}}
                questionnaireId={123}
                risk={baseRisk}
            />
        );

        await waitFor(() => {
            expect(riskQuestionnairesApi.get).toHaveBeenCalled();
        });
        expect(riskQuestionnairesApi.open).not.toHaveBeenCalled();
        expect(screen.queryByText('risks:questionnaire.actions.save')).not.toBeInTheDocument();
        expect(screen.queryByText('common:actions.submit')).not.toBeInTheDocument();
    });

    it('saves a draft, refreshes detail, and reports a change', async () => {
        const onChanged = vi.fn();
        (riskQuestionnairesApi.get as unknown as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce(sentQuestionnaire())
            .mockResolvedValue(sentQuestionnaire({
                status: 'in_progress',
                answers: { ...completeAnswers, 'risk_assessment.q2_new_triggers': 'Updated draft' },
            }));
        (riskQuestionnairesApi.open as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sentQuestionnaire({
            status: 'in_progress',
            answers: completeAnswers,
        }));
        (riskQuestionnairesApi.saveDraft as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 123 });

        render(
            <RiskQuestionnaireDetail
                isOpen={true}
                onClose={() => {}}
                questionnaireId={123}
                risk={baseRisk}
                onChanged={onChanged}
            />
        );

        await userEvent.click(await screen.findByRole('button', { name: 'risks:questionnaire.actions.save' }));

        await waitFor(() => {
            expect(riskQuestionnairesApi.saveDraft).toHaveBeenCalledWith(123, completeAnswers);
        });
        expect(riskQuestionnairesApi.get).toHaveBeenLastCalledWith(123, { includePrevious: false });
        expect(onChanged).toHaveBeenCalledTimes(1);
        expect(await screen.findByText('Updated draft')).toBeInTheDocument();
    });

    it('blocks submit when required answers are missing', async () => {
        render(
            <RiskQuestionnaireDetail
                isOpen={true}
                onClose={() => {}}
                questionnaireId={123}
                risk={baseRisk}
            />
        );

        await userEvent.click(await screen.findByRole('button', { name: 'common:actions.submit' }));

        expect(riskQuestionnairesApi.submit).not.toHaveBeenCalled();
        expect(await screen.findByText('risks:questionnaire.validation_missing')).toBeInTheDocument();
        expect(screen.getByText('risk_assessment.q1_description_changed')).toBeInTheDocument();
    });

    it('submits complete answers, refreshes detail, and reports a change', async () => {
        const onChanged = vi.fn();
        (riskQuestionnairesApi.get as unknown as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce(sentQuestionnaire())
            .mockResolvedValue(sentQuestionnaire({
                status: 'submitted',
                answers: completeAnswers,
            }));
        (riskQuestionnairesApi.open as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sentQuestionnaire({
            status: 'in_progress',
            answers: completeAnswers,
        }));
        (riskQuestionnairesApi.submit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 123 });

        render(
            <RiskQuestionnaireDetail
                isOpen={true}
                onClose={() => {}}
                questionnaireId={123}
                risk={baseRisk}
                onChanged={onChanged}
            />
        );

        await userEvent.click(await screen.findByRole('button', { name: 'common:actions.submit' }));

        await waitFor(() => {
            expect(riskQuestionnairesApi.submit).toHaveBeenCalledWith(123, completeAnswers);
        });
        expect(riskQuestionnairesApi.get).toHaveBeenLastCalledWith(123, { includePrevious: false });
        expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it('loads previous submission in compare mode and marks changed answers', async () => {
        (riskQuestionnairesApi.get as unknown as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce(sentQuestionnaire({
                status: 'submitted',
                answers: {
                    ...completeAnswers,
                    'risk_assessment.q2_new_triggers': 'Current trigger',
                },
                previous_submission: undefined,
            }))
            .mockResolvedValueOnce(sentQuestionnaire({
                status: 'submitted',
                answers: {
                    ...completeAnswers,
                    'risk_assessment.q2_new_triggers': 'Current trigger',
                },
                previous_submission: {
                    id: 99,
                    submitted_at: '2024-01-01T00:00:00Z',
                    template_version: 'v1',
                    answers: {
                        ...completeAnswers,
                        'risk_assessment.q2_new_triggers': 'Previous trigger',
                    },
                },
            }));

        render(
            <RiskQuestionnaireDetail
                isOpen={true}
                onClose={() => {}}
                questionnaireId={123}
                risk={baseRisk}
            />
        );

        await userEvent.click(await screen.findByRole('button', { name: 'risks:questionnaire.compare_toggle' }));

        await waitFor(() => {
            expect(riskQuestionnairesApi.get).toHaveBeenLastCalledWith(123, { includePrevious: true });
        });
        expect(await screen.findByText('risks:questionnaire.changed')).toBeInTheDocument();
        expect(screen.getByText('risks:questionnaire.previous: Previous trigger')).toBeInTheDocument();
    });

    it('requests clarification, refreshes detail, and clears request state', async () => {
        (riskQuestionnairesApi.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sentQuestionnaire({
            status: 'submitted',
            answers: completeAnswers,
            capabilities: {
                can_open: false,
                can_save_draft: false,
                can_submit: false,
                can_request_clarification: true,
                can_respond_to_clarifications: false,
            },
        }));
        (riskQuestionnairesApi.createClarification as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 });

        render(
            <RiskQuestionnaireDetail
                isOpen={true}
                onClose={() => {}}
                questionnaireId={123}
                risk={baseRisk}
            />
        );

        await userEvent.click((await screen.findAllByRole('button', { name: 'risks:questionnaire.request_clarification' }))[0]);
        await userEvent.type(screen.getByPlaceholderText('risks:questionnaire.clarification_request_placeholder'), 'Please clarify');
        await userEvent.click(screen.getByLabelText('risk_assessment.q1_description_changed'));
        await userEvent.click(screen.getByRole('button', { name: 'common:actions.submit' }));

        await waitFor(() => {
            expect(riskQuestionnairesApi.createClarification).toHaveBeenCalledWith(123, {
                section_key: 'questionnaire.sections.risk_changes',
                request_message: 'Please clarify',
                question_keys: ['risk_assessment.q1_description_changed'],
            });
        });
        expect(riskQuestionnairesApi.listClarifications).toHaveBeenLastCalledWith(123);
        expect(riskQuestionnairesApi.get).toHaveBeenLastCalledWith(123, { includePrevious: false });
        expect(screen.queryByPlaceholderText('risks:questionnaire.clarification_request_placeholder')).not.toBeInTheDocument();
    });

    it('responds to clarification, refreshes detail, and clears response state', async () => {
        (riskQuestionnairesApi.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sentQuestionnaire({
            status: 'submitted',
            answers: completeAnswers,
            capabilities: {
                can_open: false,
                can_save_draft: false,
                can_submit: false,
                can_request_clarification: false,
                can_respond_to_clarifications: true,
            },
        }));
        (riskQuestionnairesApi.listClarifications as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
            {
                id: 44,
                questionnaire_id: 123,
                section_key: 'questionnaire.sections.risk_changes',
                request_message: 'Please clarify',
                requested_by_user_id: 2,
                requested_by_user_name: 'Reviewer',
                requested_at: '2025-01-02T00:00:00Z',
                response_message: null,
            },
        ]);
        (riskQuestionnairesApi.respondClarification as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 44 });

        render(
            <RiskQuestionnaireDetail
                isOpen={true}
                onClose={() => {}}
                questionnaireId={123}
                risk={baseRisk}
            />
        );

        await userEvent.click(await screen.findByRole('button', { name: 'risks:questionnaire.respond' }));
        await userEvent.type(screen.getByPlaceholderText('risks:questionnaire.clarification_response_placeholder'), 'Response text');
        await userEvent.click(screen.getByRole('button', { name: 'common:actions.submit' }));

        await waitFor(() => {
            expect(riskQuestionnairesApi.respondClarification).toHaveBeenCalledWith(123, 44, {
                response_message: 'Response text',
            });
        });
        expect(riskQuestionnairesApi.listClarifications).toHaveBeenLastCalledWith(123);
        expect(riskQuestionnairesApi.get).toHaveBeenLastCalledWith(123, { includePrevious: false });
        expect(screen.queryByPlaceholderText('risks:questionnaire.clarification_response_placeholder')).not.toBeInTheDocument();
    });
});
