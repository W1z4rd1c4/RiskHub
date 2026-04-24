import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

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

function sentQuestionnaire(): RiskQuestionnaireDetailType {
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
    };
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
            expect(riskQuestionnairesApi.open).toHaveBeenCalledWith(123, { includePrevious: false });
        });
    });

    it('does not call open() when user cannot submit', async () => {
        mockUseAuth.mockReturnValue({ user: { id: 999, department_id: 2 } });

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
});
