const { getDepartments } = vi.hoisted(() => ({ getDepartments: vi.fn() }));
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DepartmentsPage } from '@/pages/DepartmentsPage';
import { renderWithoutProviders, screen, within } from '@test/render';

vi.mock('@/services/departmentApi', () => ({
    departmentApi: { getDepartments: getDepartments },
}));

const department = {
    id: 3, name: 'Operations', code: 'OPS', user_count: null,
    risk_count: null, control_count: null, kri_count: null,
    high_risk_count: null, breaching_kri_count: null, total_net_score: null,
};

async function card() {
    renderWithoutProviders(<MemoryRouter><DepartmentsPage /></MemoryRouter>);
    return (await screen.findByRole('heading', { level: 3, name: 'Operations' })).closest('button') as HTMLElement;
}

describe('Department aggregate authority', () => {
    beforeEach(() => getDepartments.mockReset());

    it('shows unavailable user, risk, control, KRI, and risk-score aggregates without status badges', async () => {
        getDepartments.mockResolvedValue([department]);
        const element = await card();
        expect(within(element).getAllByText('N/A')).toHaveLength(5);
        expect(within(element).queryByText('0')).not.toBeInTheDocument();
        expect(element.querySelector('[data-tone="warning"], [data-severity]')).toBeNull();
    });

    it('keeps authorized zero counts factual rather than unavailable', async () => {
        getDepartments.mockResolvedValue([{
            ...department, user_count: 0, risk_count: 0, control_count: 0,
            kri_count: 0, high_risk_count: 0, breaching_kri_count: 0, total_net_score: 0,
        }]);
        const element = await card();
        expect(within(element).getAllByText('0')).toHaveLength(5);
        expect(within(element).queryByText('N/A')).not.toBeInTheDocument();
    });
});
