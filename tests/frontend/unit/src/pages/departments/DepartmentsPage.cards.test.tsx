import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LucideIcon } from 'lucide-react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ENTITY_ICONS } from '@/constants/entityIcons';
import { DepartmentsPage } from '@/pages/DepartmentsPage';
import { renderWithoutProviders, screen, within } from '@test/render';

/**
 * Departments list (3f): each department is one native button (name, code, counts), its
 * status counts are `Badge`s, and its metric icons come from the shared entity-icon map (NAV-03).
 */
const getDepartments = vi.fn();
vi.mock('@/services/departmentApi', () => ({
    departmentApi: { getDepartments: (...args: unknown[]) => getDepartments(...args) },
}));

const department = {
    id: 3,
    name: 'Operations',
    code: 'OPS',
    user_count: 12,
    risk_count: 7,
    control_count: 20,
    kri_count: 5,
    high_risk_count: 2,
    breaching_kri_count: 1,
    total_net_score: 88,
};

describe('DepartmentsPage cards', () => {
    beforeEach(() => {
        getDepartments.mockReset();
        getDepartments.mockResolvedValue([department]);
    });

    it('opens the department from its card and shows the status counts as badges', async () => {
        const user = userEvent.setup();
        renderWithoutProviders(
            <MemoryRouter initialEntries={['/departments']}>
                <Routes>
                    <Route path="/departments" element={<DepartmentsPage />} />
                    <Route path="/departments/:id" element={<div data-testid="department-route" />} />
                </Routes>
            </MemoryRouter>,
        );

        const heading = await screen.findByRole('heading', { level: 3, name: 'Operations' });
        const card = heading.closest('button') as HTMLElement;
        expect(card).not.toBeNull();
        expect(within(card).getByText('OPS')).toBeInTheDocument();

        const breaching = within(card).getByText(/^1\s/);
        expect(breaching).toHaveAttribute('data-tone', 'warning');
        const critical = within(card).getByText(/^2\s/);
        expect(critical).toHaveAttribute('data-tone', 'danger');
        expect(critical).toHaveAttribute('data-severity', 'critical');

        await user.click(card);
        expect(await screen.findByTestId('department-route')).toBeInTheDocument();
    });

    it('draws the Risks / Controls / KRIs metrics with the shared entity icons', async () => {
        const iconClass = (Icon: LucideIcon): string => {
            const { container, unmount } = render(<Icon />);
            const name = Array.from(container.querySelector('svg')!.classList).find((value) => /^lucide-.+/.test(value))!;
            unmount();
            return name;
        };
        const expected = [ENTITY_ICONS.risk, ENTITY_ICONS.control, ENTITY_ICONS.kri, ENTITY_ICONS.department].map(iconClass);

        renderWithoutProviders(
            <MemoryRouter>
                <DepartmentsPage />
            </MemoryRouter>,
        );

        const card = (await screen.findByRole('heading', { level: 3, name: 'Operations' })).closest('button') as HTMLElement;
        for (const name of expected) {
            expect(card.querySelector(`svg.${name}`), name).not.toBeNull();
        }
        card.querySelectorAll('svg').forEach((icon) => expect(icon).toHaveAttribute('aria-hidden', 'true'));
    });
});
