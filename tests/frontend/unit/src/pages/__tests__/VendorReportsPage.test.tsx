import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VendorReportsPage } from '@/pages/VendorReportsPage';

const getCapabilitiesMock = vi.fn();
const downloadAnnualMock = vi.fn();
const downloadDoraRegisterMock = vi.fn();
const getDepartmentsMock = vi.fn();
let permissionGateAllows = true;

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('@/components/PermissionGate', () => ({
    PermissionGate: ({ children }: { children: ReactNode }) =>
        permissionGateAllows ? <>{children}</> : <div>local report gate denied</div>,
}));

vi.mock('@/services/vendorReportApi', () => ({
    vendorReportApi: {
        getCapabilities: () => getCapabilitiesMock(),
        downloadAnnual: (...args: unknown[]) => downloadAnnualMock(...args),
        downloadDoraRegister: (...args: unknown[]) => downloadDoraRegisterMock(...args),
    },
}));

vi.mock('@/services/departmentApi', () => ({
    departmentApi: {
        getDepartments: () => getDepartmentsMock(),
    },
}));

function allowReports(overrides = {}) {
    return {
        can_read: true,
        can_download_annual_report: true,
        can_download_dora_register: true,
        can_use_department_filter: true,
        ...overrides,
    };
}

describe('VendorReportsPage', () => {
    beforeEach(() => {
        getCapabilitiesMock.mockReset();
        downloadAnnualMock.mockReset();
        downloadDoraRegisterMock.mockReset();
        getDepartmentsMock.mockReset();
        downloadAnnualMock.mockResolvedValue(undefined);
        downloadDoraRegisterMock.mockResolvedValue(undefined);
        permissionGateAllows = true;
        getDepartmentsMock.mockResolvedValue([
            {
                id: 42,
                name: 'Operations',
                code: 'OPS',
                user_count: 1,
                risk_count: 0,
                control_count: 0,
                kri_count: 0,
                high_risk_count: 0,
                breaching_kri_count: 0,
                total_net_score: 0,
            },
        ]);
    });

    it('hides report actions when backend capabilities are unavailable', async () => {
        getCapabilitiesMock.mockRejectedValue(new Error('network'));

        render(<VendorReportsPage />);

        expect(await screen.findByText('reports.not_authorized')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /reports\.annual\.download_csv/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /reports\.dora\.download/ })).not.toBeInTheDocument();
    });

    it('shows only report downloads allowed by backend capabilities', async () => {
        getCapabilitiesMock.mockResolvedValue(
            allowReports({
                can_download_annual_report: true,
                can_download_dora_register: false,
                can_use_department_filter: false,
            }),
        );

        render(<VendorReportsPage />);

        expect(await screen.findByRole('button', { name: /reports\.annual\.download_csv/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /reports\.dora\.download/ })).not.toBeInTheDocument();
        expect(screen.queryByLabelText('labels.department')).not.toBeInTheDocument();
        expect(getDepartmentsMock).not.toHaveBeenCalled();
    });

    it('does not let the legacy local report gate hide backend-authorized report actions', async () => {
        permissionGateAllows = false;
        getCapabilitiesMock.mockResolvedValue(allowReports());

        render(<VendorReportsPage />);

        expect(await screen.findByRole('button', { name: /reports\.annual\.download_csv/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /reports\.dora\.download/ })).toBeInTheDocument();
        expect(screen.queryByText('local report gate denied')).not.toBeInTheDocument();
    });

    it('omits department filters from downloads when backend denies department filtering', async () => {
        getCapabilitiesMock.mockResolvedValue(
            allowReports({
                can_use_department_filter: false,
            }),
        );
        const user = userEvent.setup();

        render(<VendorReportsPage />);

        await user.click(await screen.findByRole('button', { name: /reports\.annual\.download_csv/ }));

        expect(downloadAnnualMock).toHaveBeenCalledWith(expect.any(Number), 'csv', null);
    });

    it('uses backend-enabled department filters for downloads', async () => {
        getCapabilitiesMock.mockResolvedValue(allowReports());
        const user = userEvent.setup();

        render(<VendorReportsPage />);

        await waitFor(() => expect(getDepartmentsMock).toHaveBeenCalled());
        const departmentSelectors = await screen.findAllByLabelText('labels.department');
        await user.selectOptions(departmentSelectors[0], '42');
        await user.click(screen.getByRole('button', { name: /reports\.dora\.download/ }));

        expect(downloadDoraRegisterMock).toHaveBeenCalledWith(42);
    });
});
