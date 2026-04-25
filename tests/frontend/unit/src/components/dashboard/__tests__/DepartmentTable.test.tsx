import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';
import { DepartmentTable } from '@/components/dashboard/DepartmentTable';
import type { DepartmentMetrics } from '@/types/dashboard';

const mockNavigate = vi.fn();

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => ({
            'department_table.columns.department': 'Department',
            'department_table.columns.controls': 'Controls',
            'department_table.columns.risks': 'Risks',
            'department_table.columns.audited': 'Audited',
            'department_table.columns.kri_breaches': 'KRI Breaches',
            'department_table.columns.quick_actions': 'Quick Actions',
            'department_table.focused': 'Focused',
            'department_table.high': 'high',
            'department_table.audited': 'audited',
            'department_table.breached': 'breached',
            'department_table.empty': 'No departments',
            'department_table.actions.view_controls': 'View controls',
            'department_table.actions.view_risks': 'View risks',
            'department_table.actions.remove_focus': 'Remove focus',
            'department_table.actions.set_focus': 'Set focus',
            'department_table.actions.go_to_department': 'Go to department',
        }[key] ?? key),
    }),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const metrics: DepartmentMetrics[] = [
    {
        department_id: 20,
        department_name: 'Beta',
        control_count: 5,
        risk_count: 2,
        high_risk_count: 0,
        audited_control_count: 1,
        breaching_kri_count: 0,
        total_kri_count: 3,
        compliance_rate: 20,
    },
    {
        department_id: 10,
        department_name: 'Alpha',
        control_count: 3,
        risk_count: 6,
        high_risk_count: 2,
        audited_control_count: 2,
        breaching_kri_count: 1,
        total_kri_count: 4,
        compliance_rate: 67,
    },
];

function renderDepartmentTable(rows: DepartmentMetrics[] = metrics) {
    return render(
        <DashboardFilterProvider>
            <DepartmentTable metrics={rows} />
        </DashboardFilterProvider>,
    );
}

function expectTextBefore(first: string, second: string) {
    const firstElement = screen.getByText(first);
    const secondElement = screen.getByText(second);
    expect(firstElement.compareDocumentPosition(secondElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

describe('DepartmentTable', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sorts departments by name ascending by default and toggles name sorting', () => {
        renderDepartmentTable();

        expectTextBefore('Alpha', 'Beta');

        fireEvent.click(screen.getByText('Department'));

        expectTextBefore('Beta', 'Alpha');
    });

    it('marks the focused department when the department name is selected', () => {
        renderDepartmentTable();

        fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));

        const alphaRow = screen.getByRole('button', { name: /Alpha/ }).closest('tr');
        expect(alphaRow).not.toBeNull();
        expect(within(alphaRow as HTMLTableRowElement).getByText('Focused')).toBeInTheDocument();
    });

    it('renders an empty table state', () => {
        renderDepartmentTable([]);

        expect(screen.getByText('No departments')).toBeInTheDocument();
    });

    it('keeps quick actions wired to the existing dashboard routes and focus behavior', () => {
        renderDepartmentTable();

        const alphaRow = screen.getByRole('button', { name: 'Alpha' }).closest('tr');
        expect(alphaRow).not.toBeNull();
        const row = within(alphaRow as HTMLTableRowElement);

        fireEvent.click(row.getByRole('button', { name: 'View controls' }));
        fireEvent.click(row.getByRole('button', { name: 'View risks' }));
        fireEvent.click(row.getByRole('button', { name: 'Set focus' }));

        expect(mockNavigate).toHaveBeenNthCalledWith(1, '/controls?department=10');
        expect(mockNavigate).toHaveBeenNthCalledWith(2, '/risks?department=10');
        expect(row.getByRole('button', { name: 'Remove focus' })).toBeInTheDocument();

        fireEvent.click(row.getByRole('button', { name: 'Go to department' }));

        expect(mockNavigate).toHaveBeenNthCalledWith(3, '/risks?department=10');
    });
});
