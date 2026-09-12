import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Risk } from '@/types/risk';
import type { RiskQuestionnaireDetail as RiskQuestionnaireDetailType } from '@/types/riskQuestionnaire';
import { RiskQuestionnaireDetail } from '@/components/risks/RiskQuestionnaireDetail';
import { ApiClientError } from '@/services/apiClient';

const tMock = (_key: string, fallback?: string | Record<string, unknown>) => (
    typeof fallback === 'string' ? fallback : _key
);

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

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((accept, rejectPromise) => {
        resolve = accept;
        reject = rejectPromise;
    });
    return { promise, reject, resolve };
}

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
            expect(riskQuestionnairesApi.open).toHaveBeenCalledWith(
                123,
                { includePrevious: false },
                { signal: expect.any(AbortSignal) },
            );
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

    it('applies the authoritative saved draft without a correctness reload', async () => {
        const onChanged = vi.fn();
        (riskQuestionnairesApi.open as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sentQuestionnaire({
            status: 'in_progress',
            answers: completeAnswers,
        }));
        (riskQuestionnairesApi.saveDraft as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sentQuestionnaire({
            status: 'in_progress',
            answers: { ...completeAnswers, 'risk_assessment.q2_new_triggers': 'Updated draft' },
        }));

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
            expect(riskQuestionnairesApi.saveDraft).toHaveBeenCalledWith(
                123,
                completeAnswers,
                { signal: expect.any(AbortSignal) },
            );
        });
        expect(riskQuestionnairesApi.get).toHaveBeenCalledTimes(1);
        expect(onChanged).toHaveBeenCalledTimes(1);
        expect(await screen.findByText('Updated draft')).toBeInTheDocument();
    });

    it('aborts an owned questionnaire action when the detail unmounts', async () => {
        (riskQuestionnairesApi.open as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sentQuestionnaire({
            status: 'in_progress',
            answers: completeAnswers,
        }));
        (riskQuestionnairesApi.saveDraft as unknown as ReturnType<typeof vi.fn>)
            .mockReturnValue(new Promise(() => undefined));
        const view = render(
            <RiskQuestionnaireDetail
                isOpen={true}
                onClose={() => {}}
                questionnaireId={123}
                risk={baseRisk}
            />
        );

        await userEvent.click(await screen.findByRole('button', { name: 'risks:questionnaire.actions.save' }));
        const signal = (riskQuestionnairesApi.saveDraft as unknown as ReturnType<typeof vi.fn>)
            .mock.calls[0]?.[2]?.signal as AbortSignal;
        expect(signal).toBeInstanceOf(AbortSignal);

        view.unmount();

        expect(signal.aborted).toBe(true);
    });

    it('clears Risk A detail and actions while Risk B is loading during an owned save', async () => {
        const save = deferred<{ id: number }>();
        const riskB = deferred<RiskQuestionnaireDetailType>();
        const onChanged = vi.fn();
        vi.mocked(riskQuestionnairesApi.get).mockImplementation((id) => (
            id === 124 ? riskB.promise : Promise.resolve(sentQuestionnaire())
        ));
        vi.mocked(riskQuestionnairesApi.open).mockResolvedValue(sentQuestionnaire({
            status: 'in_progress',
            answers: completeAnswers,
        }));
        vi.mocked(riskQuestionnairesApi.saveDraft).mockReturnValue(save.promise);

        const view = render(
            <RiskQuestionnaireDetail
                isOpen
                onClose={() => {}}
                questionnaireId={123}
                risk={baseRisk}
                onChanged={onChanged}
            />,
        );
        await userEvent.click(await screen.findByRole('button', { name: 'risks:questionnaire.actions.save' }));
        const saveSignal = vi.mocked(riskQuestionnairesApi.saveDraft).mock.calls[0]?.[2]?.signal as AbortSignal;

        await act(async () => view.rerender(
            <RiskQuestionnaireDetail
                isOpen
                onClose={() => {}}
                questionnaireId={124}
                risk={baseRisk}
                onChanged={onChanged}
            />,
        ));

        expect(saveSignal.aborted).toBe(true);
        expect(screen.queryByTestId('risk-questionnaire-ready')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'risks:questionnaire.actions.save' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'common:actions.submit' })).not.toBeInTheDocument();

        await act(async () => save.resolve({ id: 123 }));
        expect(onChanged).not.toHaveBeenCalled();
    });

    it('clears protected detail and actions when the next questionnaire is denied', async () => {
        vi.mocked(riskQuestionnairesApi.get).mockImplementation((id) => (
            id === 124
                ? Promise.reject(new ApiClientError({ status: 403, messageKey: 'errorKeys.forbidden' }))
                : Promise.resolve(sentQuestionnaire())
        ));

        const view = render(
            <RiskQuestionnaireDetail isOpen onClose={() => {}} questionnaireId={123} risk={baseRisk} />,
        );
        expect(await screen.findByTestId('risk-questionnaire-ready')).toBeInTheDocument();

        view.rerender(
            <RiskQuestionnaireDetail isOpen onClose={() => {}} questionnaireId={124} risk={baseRisk} />,
        );

        await waitFor(() => expect(riskQuestionnairesApi.get).toHaveBeenCalledWith(
            124,
            { includePrevious: false },
            { signal: expect.any(AbortSignal) },
        ));
        expect(screen.queryByTestId('risk-questionnaire-ready')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'risks:questionnaire.actions.save' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'common:actions.submit' })).not.toBeInTheDocument();
    });

    it('clears protected detail and actions when anti-enumeration open returns 404', async () => {
        vi.mocked(riskQuestionnairesApi.get).mockResolvedValue(sentQuestionnaire());
        vi.mocked(riskQuestionnairesApi.open).mockRejectedValue(new ApiClientError({
            status: 404,
            messageKey: 'errorKeys.not_found',
        }));

        render(
            <RiskQuestionnaireDetail isOpen onClose={() => {}} questionnaireId={123} risk={baseRisk} />,
        );

        await waitFor(() => expect(riskQuestionnairesApi.open).toHaveBeenCalledWith(
            123,
            { includePrevious: false },
            { signal: expect.any(AbortSignal) },
        ));
        expect(screen.queryByTestId('risk-questionnaire-ready')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'risks:questionnaire.actions.save' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'common:actions.submit' })).not.toBeInTheDocument();
    });

    it.each([
        ['save', 'risks:questionnaire.actions.save', 'saveDraft'],
        ['submit', 'common:actions.submit', 'submit'],
    ] as const)('does not leave %s pending after close and reopen', async (_label, buttonName, apiMethod) => {
        vi.mocked(riskQuestionnairesApi.open).mockResolvedValue(sentQuestionnaire({
            status: 'in_progress',
            answers: completeAnswers,
        }));
        vi.mocked(riskQuestionnairesApi[apiMethod]).mockReturnValue(new Promise(() => undefined));
        const onClose = vi.fn();
        const view = render(
            <RiskQuestionnaireDetail isOpen onClose={onClose} questionnaireId={123} risk={baseRisk} />,
        );

        await userEvent.click(await screen.findByRole('button', { name: buttonName }));
        const closeButtons = screen.getAllByRole('button', { name: 'common:actions.close' });
        await userEvent.click(closeButtons[closeButtons.length - 1]);
        expect(onClose).toHaveBeenCalledTimes(1);
        view.rerender(
            <RiskQuestionnaireDetail isOpen={false} onClose={onClose} questionnaireId={123} risk={baseRisk} />,
        );
        view.rerender(
            <RiskQuestionnaireDetail isOpen onClose={onClose} questionnaireId={123} risk={baseRisk} />,
        );

        expect(await screen.findByRole('button', { name: buttonName })).not.toBeDisabled();
    });

    it('retains answers and focuses the associated first required field after validation', async () => {
        render(
            <RiskQuestionnaireDetail
                isOpen={true}
                onClose={() => {}}
                questionnaireId={123}
                risk={baseRisk}
            />
        );

        const optionalAnswer = await screen.findByRole('textbox', { name: 'risk_assessment.q2_new_triggers' });
        await userEvent.type(optionalAnswer, 'Keep this answer');
        await userEvent.click(await screen.findByRole('button', { name: 'common:actions.submit' }));

        expect(riskQuestionnairesApi.submit).not.toHaveBeenCalled();
        expect(await screen.findByText('risks:questionnaire.validation_missing')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Keep this answer')).toBeInTheDocument();
        const firstMissing = screen.getByRole('combobox', { name: 'risk_assessment.q1_description_changed' });
        await waitFor(() => expect(firstMissing).toHaveFocus());
        expect(firstMissing).toHaveAttribute('aria-invalid', 'true');
        expect(firstMissing).toHaveAccessibleDescription('risks:questionnaire.validation_required');
    });

    it('treats a cleared required boolean as unanswered and blocks submission', async () => {
        vi.mocked(riskQuestionnairesApi.open).mockResolvedValue(sentQuestionnaire({
            status: 'in_progress',
            answers: completeAnswers,
        }));

        render(
            <RiskQuestionnaireDetail isOpen onClose={() => {}} questionnaireId={123} risk={baseRisk} />,
        );

        const requiredBoolean = await screen.findByRole('combobox', {
            name: 'risk_assessment.q1_description_changed',
        });
        await userEvent.click(requiredBoolean);
        await userEvent.click(await screen.findByRole('option', { name: 'common:labels.none' }));
        await userEvent.click(screen.getByRole('button', { name: 'common:actions.submit' }));

        expect(riskQuestionnairesApi.submit).not.toHaveBeenCalled();
        await waitFor(() => expect(requiredBoolean).toHaveFocus());
        expect(requiredBoolean).toHaveAttribute('aria-invalid', 'true');
        expect(requiredBoolean).toHaveAccessibleDescription('risks:questionnaire.validation_required');
    });

    it('applies the authoritative submitted questionnaire without a correctness reload', async () => {
        const onChanged = vi.fn();
        (riskQuestionnairesApi.open as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sentQuestionnaire({
            status: 'in_progress',
            answers: completeAnswers,
        }));
        (riskQuestionnairesApi.submit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sentQuestionnaire({
            status: 'submitted',
            answers: completeAnswers,
            submitted_at: '2025-01-03T00:00:00Z',
            capabilities: {
                can_open: false,
                can_save_draft: false,
                can_submit: false,
                can_request_clarification: false,
                can_respond_to_clarifications: true,
            },
        }));

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
            expect(riskQuestionnairesApi.submit).toHaveBeenCalledWith(
                123,
                completeAnswers,
                { signal: expect.any(AbortSignal) },
            );
            expect(onChanged).toHaveBeenCalledTimes(1);
        });
        expect(riskQuestionnairesApi.get).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', { name: 'common:actions.submit' })).not.toBeInTheDocument();
    });

    it.each([
        { action: 'save', buttonName: 'risks:questionnaire.actions.save', apiMethod: 'saveDraft', status: 403 },
        { action: 'save', buttonName: 'risks:questionnaire.actions.save', apiMethod: 'saveDraft', status: 404 },
        { action: 'submit', buttonName: 'common:actions.submit', apiMethod: 'submit', status: 403 },
        { action: 'submit', buttonName: 'common:actions.submit', apiMethod: 'submit', status: 404 },
    ] as const)(
        'retains editable detail and input when $action is rejected with $status',
        async ({ buttonName, apiMethod, status }) => {
            const onChanged = vi.fn();
            vi.mocked(riskQuestionnairesApi.open).mockResolvedValue(sentQuestionnaire({
                status: 'in_progress',
                answers: completeAnswers,
            }));
            vi.mocked(riskQuestionnairesApi[apiMethod]).mockRejectedValue(new ApiClientError({
                status,
                messageKey: status === 403 ? 'errorKeys.forbidden' : 'errorKeys.not_found',
            }));

            render(
                <RiskQuestionnaireDetail
                    isOpen
                    onClose={() => {}}
                    questionnaireId={123}
                    risk={baseRisk}
                    onChanged={onChanged}
                />,
            );

            const retainedAnswer = await screen.findByRole('textbox', {
                name: 'risk_assessment.q2_new_triggers',
            });
            await userEvent.type(retainedAnswer, 'Keep this action input');
            await userEvent.click(screen.getByRole('button', { name: buttonName }));
            await waitFor(() => expect(riskQuestionnairesApi[apiMethod]).toHaveBeenCalledTimes(1));

            expect(screen.getByTestId('risk-questionnaire-ready')).toBeInTheDocument();
            expect(screen.getByDisplayValue('Keep this action input')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'risks:questionnaire.actions.save' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'common:actions.submit' })).toBeInTheDocument();
            expect(screen.getByRole('alert')).toHaveTextContent(status === 403 ? 'forbidden' : 'not_found');
            expect(onChanged).not.toHaveBeenCalled();
        },
    );

    it.each([403, 404])(
        'retains questionnaire and clarification input when creation is rejected with %i',
        async (status) => {
            vi.mocked(riskQuestionnairesApi.get).mockResolvedValue(sentQuestionnaire({
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
            vi.mocked(riskQuestionnairesApi.createClarification).mockRejectedValue(new ApiClientError({
                status,
                messageKey: status === 403 ? 'errorKeys.forbidden' : 'errorKeys.not_found',
            }));

            render(
                <RiskQuestionnaireDetail isOpen onClose={() => {}} questionnaireId={123} risk={baseRisk} />,
            );

            await userEvent.click((await screen.findAllByRole('button', {
                name: 'risks:questionnaire.request_clarification',
            }))[0]);
            await userEvent.type(
                screen.getByPlaceholderText('risks:questionnaire.clarification_request_placeholder'),
                'Please clarify',
            );
            await userEvent.click(screen.getByRole('button', { name: 'common:actions.submit' }));
            await waitFor(() => expect(riskQuestionnairesApi.createClarification).toHaveBeenCalledTimes(1));

            expect(screen.getByTestId('risk-questionnaire-ready')).toBeInTheDocument();
            expect(screen.getByPlaceholderText('risks:questionnaire.clarification_request_placeholder')).toHaveValue('Please clarify');
            expect(screen.getAllByRole('button', { name: 'risks:questionnaire.request_clarification' })).not.toHaveLength(0);
            expect(screen.queryByRole('button', { name: 'risks:questionnaire.actions.save' })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'common:actions.submit' })).toBeEnabled();
            expect(screen.getByRole('alert')).toHaveTextContent(status === 403 ? 'forbidden' : 'not_found');
        },
    );

    it('clears a superseded save pending flag when clarification takes ownership', async () => {
        const saveDraft = new Promise<{ id: number }>(() => undefined);
        vi.mocked(riskQuestionnairesApi.get).mockResolvedValue(sentQuestionnaire({
            status: 'submitted',
            answers: completeAnswers,
            capabilities: {
                can_open: false,
                can_save_draft: true,
                can_submit: false,
                can_request_clarification: true,
                can_respond_to_clarifications: false,
            },
        }));
        vi.mocked(riskQuestionnairesApi.saveDraft).mockReturnValue(saveDraft);
        vi.mocked(riskQuestionnairesApi.createClarification).mockResolvedValue({ id: 1 } as never);

        render(
            <RiskQuestionnaireDetail isOpen onClose={() => {}} questionnaireId={123} risk={baseRisk} />,
        );

        const saveButton = await screen.findByRole('button', { name: 'risks:questionnaire.actions.save' });
        await userEvent.click(saveButton);
        expect(saveButton).toBeDisabled();
        const saveSignal = vi.mocked(riskQuestionnairesApi.saveDraft).mock.calls[0]?.[2]?.signal as AbortSignal;

        await userEvent.click((await screen.findAllByRole('button', {
            name: 'risks:questionnaire.request_clarification',
        }))[0]);
        await userEvent.type(
            screen.getByPlaceholderText('risks:questionnaire.clarification_request_placeholder'),
            'Please clarify',
        );
        await userEvent.click(screen.getByRole('button', { name: 'common:actions.submit' }));

        await waitFor(() => expect(saveSignal.aborted).toBe(true));
        await waitFor(() => expect(saveButton).not.toBeDisabled());
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
            expect(riskQuestionnairesApi.get).toHaveBeenLastCalledWith(
                123,
                { includePrevious: true },
                { signal: expect.any(AbortSignal) },
            );
        });
        expect(await screen.findByText('risks:questionnaire.changed')).toBeInTheDocument();
        expect(screen.getByText('risks:questionnaire.previous: Previous trigger')).toBeInTheDocument();
    });

    it('applies a created clarification without detail or list correctness reloads', async () => {
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
        (riskQuestionnairesApi.createClarification as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 1,
            questionnaire_id: 123,
            section_key: 'questionnaire.sections.risk_changes',
            question_keys: ['risk_assessment.q1_description_changed'],
            request_message: 'Please clarify',
            requested_by_user_id: 2,
            requested_by_user_name: 'Reviewer',
            requested_at: '2025-01-02T00:00:00Z',
            response_message: null,
        });

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
            }, { signal: expect.any(AbortSignal) });
        });
        expect(riskQuestionnairesApi.listClarifications).toHaveBeenCalledTimes(1);
        expect(riskQuestionnairesApi.get).toHaveBeenCalledTimes(1);
        expect(await screen.findByText('Please clarify')).toBeInTheDocument();
        expect(screen.queryByPlaceholderText('risks:questionnaire.clarification_request_placeholder')).not.toBeInTheDocument();
    });

    it('keeps a created clarification when the initial clarification list returns late', async () => {
        const initialList = deferred<Awaited<ReturnType<typeof riskQuestionnairesApi.listClarifications>>>();
        vi.mocked(riskQuestionnairesApi.get).mockResolvedValue(sentQuestionnaire({
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
        vi.mocked(riskQuestionnairesApi.listClarifications).mockReturnValue(initialList.promise);
        vi.mocked(riskQuestionnairesApi.createClarification).mockResolvedValue({
            id: 2,
            questionnaire_id: 123,
            section_key: 'questionnaire.sections.risk_changes',
            request_message: 'Authoritative clarification',
            requested_by_user_id: 2,
            requested_at: '2025-01-02T00:00:00Z',
        });

        render(<RiskQuestionnaireDetail isOpen onClose={() => {}} questionnaireId={123} risk={baseRisk} />);

        await userEvent.click((await screen.findAllByRole('button', {
            name: 'risks:questionnaire.request_clarification',
        }))[0]);
        await userEvent.type(
            screen.getByPlaceholderText('risks:questionnaire.clarification_request_placeholder'),
            'Authoritative clarification',
        );
        await userEvent.click(screen.getByRole('button', { name: 'common:actions.submit' }));
        await waitFor(() => expect(riskQuestionnairesApi.createClarification).toHaveBeenCalledTimes(1));

        await act(async () => initialList.resolve([]));

        expect(await screen.findByText('Authoritative clarification')).toBeInTheDocument();
    });

    it('keeps a created clarification when the initial clarification list rejects late', async () => {
        const initialList = deferred<Awaited<ReturnType<typeof riskQuestionnairesApi.listClarifications>>>();
        vi.mocked(riskQuestionnairesApi.get).mockResolvedValue(sentQuestionnaire({
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
        vi.mocked(riskQuestionnairesApi.listClarifications).mockReturnValue(initialList.promise);
        vi.mocked(riskQuestionnairesApi.createClarification).mockResolvedValue({
            id: 2,
            questionnaire_id: 123,
            section_key: 'questionnaire.sections.risk_changes',
            request_message: 'Authoritative clarification',
            requested_by_user_id: 2,
            requested_at: '2025-01-02T00:00:00Z',
        });

        render(<RiskQuestionnaireDetail isOpen onClose={() => {}} questionnaireId={123} risk={baseRisk} />);

        await userEvent.click((await screen.findAllByRole('button', {
            name: 'risks:questionnaire.request_clarification',
        }))[0]);
        await userEvent.type(
            screen.getByPlaceholderText('risks:questionnaire.clarification_request_placeholder'),
            'Authoritative clarification',
        );
        await userEvent.click(screen.getByRole('button', { name: 'common:actions.submit' }));
        await waitFor(() => expect(riskQuestionnairesApi.createClarification).toHaveBeenCalledTimes(1));

        await act(async () => initialList.reject(new Error('late initial read failed')));

        expect(await screen.findByText('Authoritative clarification')).toBeInTheDocument();
    });

    it('sends one clarification request while rapid activation is in flight', async () => {
        const create = deferred<Awaited<ReturnType<typeof riskQuestionnairesApi.createClarification>>>();
        vi.mocked(riskQuestionnairesApi.get).mockResolvedValue(sentQuestionnaire({
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
        vi.mocked(riskQuestionnairesApi.createClarification).mockReturnValue(create.promise);

        render(<RiskQuestionnaireDetail isOpen onClose={() => {}} questionnaireId={123} risk={baseRisk} />);

        await userEvent.click((await screen.findAllByRole('button', {
            name: 'risks:questionnaire.request_clarification',
        }))[0]);
        await userEvent.type(
            screen.getByPlaceholderText('risks:questionnaire.clarification_request_placeholder'),
            'Please clarify once',
        );
        const submit = screen.getByRole('button', { name: 'common:actions.submit' });
        await userEvent.dblClick(submit);

        expect(riskQuestionnairesApi.createClarification).toHaveBeenCalledTimes(1);
        expect(submit).toBeDisabled();

        await act(async () => create.resolve({
            id: 2,
            questionnaire_id: 123,
            section_key: 'questionnaire.sections.risk_changes',
            request_message: 'Please clarify once',
            requested_by_user_id: 2,
            requested_at: '2025-01-02T00:00:00Z',
        }));
    });

    it('applies a clarification response without detail or list correctness reloads', async () => {
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
        (riskQuestionnairesApi.respondClarification as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 44,
            questionnaire_id: 123,
            section_key: 'questionnaire.sections.risk_changes',
            request_message: 'Please clarify',
            requested_by_user_id: 2,
            requested_by_user_name: 'Reviewer',
            requested_at: '2025-01-02T00:00:00Z',
            response_message: 'Response text',
            responded_by_user_id: 1,
            responded_by_user_name: 'Risk Owner',
            responded_at: '2025-01-03T00:00:00Z',
        });

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
            }, { signal: expect.any(AbortSignal) });
        });
        expect(riskQuestionnairesApi.listClarifications).toHaveBeenCalledTimes(1);
        expect(riskQuestionnairesApi.get).toHaveBeenCalledTimes(1);
        expect(await screen.findByText('Response text')).toBeInTheDocument();
        expect(screen.queryByPlaceholderText('risks:questionnaire.clarification_response_placeholder')).not.toBeInTheDocument();
    });

    it('sends one clarification response while rapid activation is in flight', async () => {
        const response = deferred<Awaited<ReturnType<typeof riskQuestionnairesApi.respondClarification>>>();
        vi.mocked(riskQuestionnairesApi.get).mockResolvedValue(sentQuestionnaire({
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
        vi.mocked(riskQuestionnairesApi.listClarifications).mockResolvedValue([{
            id: 44,
            questionnaire_id: 123,
            section_key: 'questionnaire.sections.risk_changes',
            request_message: 'Please clarify',
            requested_by_user_id: 2,
            requested_at: '2025-01-02T00:00:00Z',
            response_message: null,
        }]);
        vi.mocked(riskQuestionnairesApi.respondClarification).mockReturnValue(response.promise);

        render(<RiskQuestionnaireDetail isOpen onClose={() => {}} questionnaireId={123} risk={baseRisk} />);

        await userEvent.click(await screen.findByRole('button', { name: 'risks:questionnaire.respond' }));
        await userEvent.type(
            screen.getByPlaceholderText('risks:questionnaire.clarification_response_placeholder'),
            'Respond once',
        );
        const submit = screen.getByRole('button', { name: 'common:actions.submit' });
        await userEvent.dblClick(submit);

        expect(riskQuestionnairesApi.respondClarification).toHaveBeenCalledTimes(1);
        expect(submit).toBeDisabled();

        await act(async () => response.resolve({
            id: 44,
            questionnaire_id: 123,
            section_key: 'questionnaire.sections.risk_changes',
            request_message: 'Please clarify',
            requested_by_user_id: 2,
            requested_at: '2025-01-02T00:00:00Z',
            response_message: 'Respond once',
            responded_by_user_id: 1,
            responded_at: '2025-01-03T00:00:00Z',
        }));
    });
});
