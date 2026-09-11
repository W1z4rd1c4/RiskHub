import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RiskDetailQuestionnairesTab } from '@/components/risks/RiskDetailQuestionnairesTab';
import { RiskAssessmentSection } from '@/components/risks/detail-overview/RiskAssessmentSection';
import { ApiClientError } from '@/services/apiClient';
import type { Risk, RiskCapabilities } from '@/types/risk';
import type { RiskQuestionnaireDetail, RiskQuestionnaireListItem } from '@/types/riskQuestionnaire';
import enRisks from '@/i18n/locales/en/risks.json';
import csRisks from '@/i18n/locales/cs/risks.json';

let currentLanguage: 'en' | 'cs' = 'en';
const tMock = (key: string) => {
    const normalizedKey = key.replace(/^risks:/, '');
    if (normalizedKey === 'scores_heading') {
        return currentLanguage === 'en' ? 'Gross and net Risk scores' : 'Hrubé a čisté skóre rizika';
    }
    if (normalizedKey === 'questionnaires.title') {
        return currentLanguage === 'en' ? 'Assessment questionnaires' : 'Hodnoticí dotazníky';
    }
    return key;
};

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: tMock,
        i18n: { language: currentLanguage },
    }),
}));

vi.mock('@/hooks/useRiskHubConfig', () => ({
    useTotalAssetsValue: () => ({ totalAssets: 1_000_000 }),
}));

vi.mock('@/components/risks/RiskQuestionnaireDetail', () => ({
    RiskQuestionnaireDetail: ({
        isOpen,
        onChanged,
        questionnaireId,
    }: {
        isOpen: boolean;
        onChanged?: () => void;
        questionnaireId: number | null;
    }) => isOpen ? (
        <div>
            <span>questionnaire-detail:{questionnaireId}</span>
            <button type="button" onClick={onChanged}>refresh-questionnaires</button>
            <button type="button" onClick={onChanged}>successful-save</button>
            <button type="button" onClick={onChanged}>successful-submit</button>
        </div>
    ) : null,
}));

vi.mock('@/components/RiskScoreMatrix', () => ({
    RiskScoreMatrix: ({ type }: { type: string }) => <div>{type} score</div>,
}));

vi.mock('@/services/riskQuestionnairesApi', () => ({
    riskQuestionnairesApi: {
        listForRisk: vi.fn(),
        get: vi.fn(),
        sendForRisk: vi.fn(),
    },
}));

import { riskQuestionnairesApi } from '@/services/riskQuestionnairesApi';

function makeCapabilities(overrides: Partial<RiskCapabilities> = {}): RiskCapabilities {
    return {
        can_read: true,
        can_update: false,
        can_update_sensitive_fields: false,
        can_request_update_approval: false,
        can_archive_immediately: false,
        can_request_archive_approval: false,
        can_restore: false,
        can_create_kri: false,
        can_create_linked_control: false,
        can_link_controls: false,
        can_unlink_controls: false,
        can_view_linked_controls: false,
        can_view_linked_vendors: false,
        can_create_issue: false,
        has_pending_delete_approval: false,
        has_pending_update_approval: false,
        requires_privileged_update_approval: false,
        requires_privileged_delete_approval: false,
        ...overrides,
    };
}

function makeRisk(overrides: Partial<Risk> = {}): Risk {
    return {
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
        capabilities: makeCapabilities(),
        ...overrides,
    };
}

function questionnaire(
    id: number,
    riskId = 10,
    overrides: Partial<RiskQuestionnaireListItem> = {},
): RiskQuestionnaireListItem {
    return {
        id,
        risk_id: riskId,
        assigned_to_user_id: 1,
        sent_by_user_id: 2,
        sent_by_user_name: `Sender ${id}`,
        status: 'sent',
        template_key: 'risk_owner_reassessment',
        template_version: 'v1',
        sent_at: '2026-08-01T00:00:00Z',
        due_at: '2026-09-01T00:00:00Z',
        ...overrides,
    };
}

function submittedDetail(id: number, likelihood = 4): RiskQuestionnaireDetail {
    return {
        ...questionnaire(id, 10, {
            status: 'submitted',
            submitted_at: '2026-08-15T00:00:00Z',
        }),
        risk_name: 'Risk',
        answers: { 'risk_assessment.q11_likelihood_12m': likelihood },
        capabilities: null,
    };
}

describe('RiskDetailQuestionnairesTab', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        currentLanguage = 'en';
        (riskQuestionnairesApi.listForRisk as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
        (riskQuestionnairesApi.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(submittedDetail(31));
        (riskQuestionnairesApi.sendForRisk as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    });

    it('hides send when backend risk capability is missing', async () => {
        render(<RiskDetailQuestionnairesTab risk={makeRisk({ capabilities: null })} />);

        await waitFor(() => {
            expect(riskQuestionnairesApi.listForRisk).toHaveBeenCalledWith(10, {
                signal: expect.any(AbortSignal),
            });
        });
        expect(screen.queryByRole('button', { name: 'risks:questionnaires.send' })).not.toBeInTheDocument();
    });

    it('uses backend risk capability to show and submit send action', async () => {
        render(
            <RiskDetailQuestionnairesTab
                risk={makeRisk({ capabilities: makeCapabilities({ can_send_questionnaire: true }) })}
            />,
        );

        await userEvent.click(await screen.findByRole('button', { name: 'risks:questionnaires.send' }));

        await waitFor(() => {
            expect(riskQuestionnairesApi.sendForRisk).toHaveBeenCalledWith(10, {
                signal: expect.any(AbortSignal),
            });
        });
    });

    it('renders distinct score and questionnaire headings in English and Czech', async () => {
        expect(enRisks.scores_heading).toBe('Gross and net Risk scores');
        expect(enRisks.questionnaires.title).toBe('Assessment questionnaires');
        expect(csRisks.scores_heading).toBe('Hrubé a čisté skóre rizika');
        expect(csRisks.questionnaires.title).toBe('Hodnoticí dotazníky');

        const risk = makeRisk();
        const { rerender } = render(
            <>
                <RiskAssessmentSection risk={risk} />
                <RiskDetailQuestionnairesTab risk={risk} />
            </>,
        );
        expect(screen.getByRole('heading', { name: 'Gross and net Risk scores' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Assessment questionnaires' })).toBeInTheDocument();

        currentLanguage = 'cs';
        rerender(
            <>
                <RiskAssessmentSection risk={risk} />
                <RiskDetailQuestionnairesTab risk={risk} />
            </>,
        );
        expect(screen.getByRole('heading', { name: 'Hrubé a čisté skóre rizika' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Hodnoticí dotazníky' })).toBeInTheDocument();
    });

    it('shows a truthful retryable state when the initial questionnaire request fails', async () => {
        vi.mocked(riskQuestionnairesApi.listForRisk).mockRejectedValueOnce(new Error('questionnaires unavailable'));
        render(<RiskDetailQuestionnairesTab risk={makeRisk()} />);

        const failure = await screen.findByTestId('risk-questionnaires-load-state');
        expect(screen.queryByText('risks:questionnaires.empty')).not.toBeInTheDocument();

        vi.mocked(riskQuestionnairesApi.listForRisk).mockResolvedValueOnce([questionnaire(31)]);
        await userEvent.click(screen.getByRole('button', { name: /retry/i }));
        expect(await screen.findByText('Sender 31')).toBeInTheDocument();
        expect(failure).not.toBeInTheDocument();
    });

    it('retains stale questionnaire content with Retry after an ordinary refresh failure', async () => {
        vi.mocked(riskQuestionnairesApi.listForRisk).mockResolvedValueOnce([questionnaire(31)]);
        render(<RiskDetailQuestionnairesTab risk={makeRisk()} />);
        await userEvent.click(await screen.findByText('Sender 31'));
        expect(await screen.findByText('questionnaire-detail:31')).toBeInTheDocument();

        vi.mocked(riskQuestionnairesApi.listForRisk).mockRejectedValueOnce(new Error('refresh unavailable'));
        await userEvent.click(screen.getByRole('button', { name: 'refresh-questionnaires' }));

        const stale = await screen.findByTestId('risk-questionnaires-load-state');
        expect(screen.getByText('Sender 31')).toBeInTheDocument();
        expect(screen.getByText('questionnaire-detail:31')).toBeInTheDocument();
        expect(within(stale).getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('keeps returned detail and existing rows when post-save reconciliation is denied', async () => {
        vi.mocked(riskQuestionnairesApi.listForRisk).mockResolvedValueOnce([questionnaire(31)]);
        render(<RiskDetailQuestionnairesTab risk={makeRisk()} />);
        await userEvent.click(await screen.findByText('Sender 31'));
        expect(await screen.findByText('questionnaire-detail:31')).toBeInTheDocument();

        vi.mocked(riskQuestionnairesApi.listForRisk).mockRejectedValueOnce(new ApiClientError({
            status: 403,
            messageKey: 'errorKeys.forbidden',
        }));
        await userEvent.click(screen.getByRole('button', { name: 'successful-save' }));

        const stale = await screen.findByTestId('risk-questionnaires-load-state');
        expect(screen.getByText('Sender 31')).toBeInTheDocument();
        expect(screen.getByText('questionnaire-detail:31')).toBeInTheDocument();
        expect(within(stale).getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('keeps returned detail and existing rows when post-submit reconciliation returns anti-enumeration 404', async () => {
        vi.mocked(riskQuestionnairesApi.listForRisk).mockResolvedValueOnce([questionnaire(31)]);
        render(<RiskDetailQuestionnairesTab risk={makeRisk()} />);
        await userEvent.click(await screen.findByText('Sender 31'));

        vi.mocked(riskQuestionnairesApi.listForRisk).mockRejectedValueOnce(new ApiClientError({
            status: 404,
            messageKey: 'errorKeys.not_found',
        }));
        await userEvent.click(screen.getByRole('button', { name: 'successful-submit' }));

        const stale = await screen.findByTestId('risk-questionnaires-load-state');
        expect(screen.getByText('Sender 31')).toBeInTheDocument();
        expect(screen.getByText('questionnaire-detail:31')).toBeInTheDocument();
        expect(within(stale).getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('still clears content when an explicit retry is denied', async () => {
        vi.mocked(riskQuestionnairesApi.listForRisk).mockResolvedValueOnce([questionnaire(31)]);
        render(<RiskDetailQuestionnairesTab risk={makeRisk()} />);
        await userEvent.click(await screen.findByText('Sender 31'));

        vi.mocked(riskQuestionnairesApi.listForRisk).mockRejectedValueOnce(new Error('refresh unavailable'));
        await userEvent.click(screen.getByRole('button', { name: 'successful-save' }));
        const stale = await screen.findByTestId('risk-questionnaires-load-state');

        vi.mocked(riskQuestionnairesApi.listForRisk).mockRejectedValueOnce(new ApiClientError({
            status: 403,
            messageKey: 'errorKeys.forbidden',
        }));
        await userEvent.click(within(stale).getByRole('button', { name: /retry/i }));

        const denied = await screen.findByTestId('risk-questionnaires-load-state');
        expect(screen.queryByText('Sender 31')).not.toBeInTheDocument();
        expect(screen.queryByText('questionnaire-detail:31')).not.toBeInTheDocument();
        expect(within(denied).queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    });

    it('still denies the initial questionnaire load on anti-enumeration 404', async () => {
        vi.mocked(riskQuestionnairesApi.listForRisk).mockRejectedValueOnce(new ApiClientError({
            status: 404,
            messageKey: 'errorKeys.not_found',
        }));
        render(<RiskDetailQuestionnairesTab risk={makeRisk()} />);

        const denied = await screen.findByTestId('risk-questionnaires-load-state');
        expect(screen.queryByText('Sender 31')).not.toBeInTheDocument();
        expect(within(denied).queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    });

    it('retains a safe stale latest summary with Retry after an ordinary summary refresh failure', async () => {
        vi.mocked(riskQuestionnairesApi.listForRisk).mockResolvedValue([
            questionnaire(31, 10, { status: 'submitted', submitted_at: '2026-08-15T00:00:00Z' }),
        ]);
        render(<RiskDetailQuestionnairesTab risk={makeRisk()} />);

        expect(await screen.findByTestId('risk-questionnaire-summary-content')).toHaveTextContent('4');
        await userEvent.click(screen.getByText('Sender 31'));
        vi.mocked(riskQuestionnairesApi.get).mockRejectedValueOnce(new Error('summary unavailable'));
        await userEvent.click(screen.getByRole('button', { name: 'refresh-questionnaires' }));

        const stale = await screen.findByTestId('risk-questionnaire-summary-load-state');
        expect(screen.getByTestId('risk-questionnaire-summary-content')).toHaveTextContent('4');
        expect(within(stale).getByRole('button', { name: /retry/i })).toBeInTheDocument();

        vi.mocked(riskQuestionnairesApi.get).mockResolvedValueOnce(submittedDetail(31, 5));
        await userEvent.click(within(stale).getByRole('button', { name: /retry/i }));
        expect(await screen.findByTestId('risk-questionnaire-summary-content')).toHaveTextContent('5');
        expect(screen.queryByTestId('risk-questionnaire-summary-load-state')).not.toBeInTheDocument();
    });

    it('clears only the latest summary on 403 and keeps its authorized history list', async () => {
        vi.mocked(riskQuestionnairesApi.listForRisk).mockResolvedValue([
            questionnaire(31, 10, { status: 'submitted', submitted_at: '2026-08-15T00:00:00Z' }),
        ]);
        render(<RiskDetailQuestionnairesTab risk={makeRisk()} />);
        expect(await screen.findByTestId('risk-questionnaire-summary-content')).toHaveTextContent('4');

        await userEvent.click(screen.getByText('Sender 31'));
        vi.mocked(riskQuestionnairesApi.get).mockRejectedValueOnce(new ApiClientError({
            status: 403,
            messageKey: 'errorKeys.forbidden',
        }));
        await userEvent.click(screen.getByRole('button', { name: 'refresh-questionnaires' }));

        const denied = await screen.findByTestId('risk-questionnaire-summary-load-state');
        expect(screen.getByText('Sender 31')).toBeInTheDocument();
        expect(screen.queryByTestId('risk-questionnaire-summary-content')).not.toBeInTheDocument();
        expect(screen.queryByText('risks:questionnaires.assessment_summary_empty')).not.toBeInTheDocument();
        expect(within(denied).queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    });

    it('clears only the latest summary on anti-enumeration 404', async () => {
        vi.mocked(riskQuestionnairesApi.listForRisk).mockResolvedValue([
            questionnaire(31, 10, { status: 'submitted', submitted_at: '2026-08-15T00:00:00Z' }),
        ]);
        render(<RiskDetailQuestionnairesTab risk={makeRisk()} />);
        expect(await screen.findByTestId('risk-questionnaire-summary-content')).toHaveTextContent('4');

        await userEvent.click(screen.getByText('Sender 31'));
        vi.mocked(riskQuestionnairesApi.get).mockRejectedValueOnce(new ApiClientError({
            status: 404,
            messageKey: 'errorKeys.not_found',
        }));
        await userEvent.click(screen.getByRole('button', { name: 'refresh-questionnaires' }));

        const denied = await screen.findByTestId('risk-questionnaire-summary-load-state');
        expect(screen.getByText('Sender 31')).toBeInTheDocument();
        expect(screen.queryByTestId('risk-questionnaire-summary-content')).not.toBeInTheDocument();
        expect(within(denied).queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    });

    it('does not report an empty latest summary when its initial detail request fails', async () => {
        vi.mocked(riskQuestionnairesApi.listForRisk).mockResolvedValue([
            questionnaire(31, 10, { status: 'submitted', submitted_at: '2026-08-15T00:00:00Z' }),
        ]);
        vi.mocked(riskQuestionnairesApi.get).mockRejectedValueOnce(new Error('summary unavailable'));
        render(<RiskDetailQuestionnairesTab risk={makeRisk()} />);

        const failure = await screen.findByTestId('risk-questionnaire-summary-load-state');
        expect(within(failure).getByRole('button', { name: /retry/i })).toBeInTheDocument();
        expect(screen.queryByText('risks:questionnaires.assessment_summary_empty')).not.toBeInTheDocument();
    });
});
