import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { RiskQuestionnairesPanel } from '@/components/riskhub/RiskQuestionnairesPanel';

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('@/components/ui/ThemedSelect', () => ({
    ThemedSelect: ({
        value,
        onValueChange,
        options = [],
    }: {
        value: string;
        onValueChange: (value: string) => void;
        options?: Array<{ value: string; label: string }>;
    }) => (
        <select value={value} onChange={(event) => onValueChange(event.target.value)}>
            <option value="">empty</option>
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    ),
}));

vi.mock('@/services/departmentApi', () => ({
    departmentApi: {
        getDepartments: vi.fn().mockResolvedValue([]),
    },
}));

const mockGetRisks = vi.fn();
vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisks: (...args: unknown[]) => mockGetRisks(...args),
    },
}));

vi.mock('@/services/apiClient', () => ({
    apiClient: {
        post: vi.fn(),
        toUiMessageKey: () => 'errors.failed',
    },
}));

describe('RiskQuestionnairesPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetRisks.mockResolvedValue({
            items: [
                {
                    id: 1,
                    risk_id_code: 'R-1',
                    name: 'Owner named risk',
                    process: 'Process',
                    risk_type: 'operational',
                    category: 'Category',
                    description: 'desc',
                    gross_score: 9,
                    gross_probability: 3,
                    gross_impact: 3,
                    net_score: 4,
                    status: 'active',
                    is_priority: false,
                    department_id: 1,
                    department_name: 'Ops',
                    owner_id: 42,
                    owner_name: 'Test Owner',
                },
                {
                    id: 2,
                    risk_id_code: 'R-2',
                    name: 'Unknown owner risk',
                    process: 'Process',
                    risk_type: 'operational',
                    category: 'Category',
                    description: 'desc',
                    gross_score: 9,
                    gross_probability: 3,
                    gross_impact: 3,
                    net_score: 4,
                    status: 'active',
                    is_priority: false,
                    department_id: 1,
                    department_name: 'Ops',
                    owner_id: 77,
                    owner_name: null,
                },
            ],
            total: 2,
            offset: 0,
            limit: 50,
        });
    });

    it('renders owner names instead of raw owner ids', async () => {
        render(<RiskQuestionnairesPanel />);

        await waitFor(() => {
            expect(screen.getByText('Test Owner')).toBeInTheDocument();
        });
        expect(screen.getByText('common:fallbacks.unknown_user')).toBeInTheDocument();
        expect(screen.queryByText('42')).not.toBeInTheDocument();
        expect(screen.queryByText('77')).not.toBeInTheDocument();
    });
});
