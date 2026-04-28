import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RiskDetailQuestionnairesTab } from '@/components/risks/RiskDetailQuestionnairesTab';
import type { Risk, RiskCapabilities } from '@/types/risk';

const tMock = (key: string) => key;

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: tMock,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/hooks/useRiskHubConfig', () => ({
    useTotalAssetsValue: () => ({ totalAssets: 1_000_000 }),
}));

vi.mock('@/components/risks/RiskQuestionnaireDetail', () => ({
    RiskQuestionnaireDetail: () => null,
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

describe('RiskDetailQuestionnairesTab', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        (riskQuestionnairesApi.listForRisk as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
        (riskQuestionnairesApi.sendForRisk as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    });

    it('hides send when backend risk capability is missing', async () => {
        render(<RiskDetailQuestionnairesTab risk={makeRisk({ capabilities: null })} />);

        await waitFor(() => {
            expect(riskQuestionnairesApi.listForRisk).toHaveBeenCalledWith(10);
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
            expect(riskQuestionnairesApi.sendForRisk).toHaveBeenCalledWith(10);
        });
    });
});
