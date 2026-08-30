import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EvidencePage } from '@/pages/EvidencePage';

const authz = {
    canReadControls: true,
    canViewActivityLog: true,
};
const getExecutions = vi.fn();
const getVendorReportCapabilities = vi.fn();

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => authz,
}));

vi.mock('@/services/executionApi', () => ({
    executionApi: {
        getExecutions: (...args: unknown[]) => getExecutions(...args),
    },
}));

vi.mock('@/services/vendorReportApi', () => ({
    vendorReportApi: {
        getCapabilities: (...args: unknown[]) => getVendorReportCapabilities(...args),
    },
}));

describe('EvidencePage', () => {
    beforeEach(() => {
        authz.canReadControls = true;
        authz.canViewActivityLog = true;
        getExecutions.mockReset();
        getVendorReportCapabilities.mockReset();
        getExecutions.mockResolvedValue({
            items: [],
            total: 0,
            skip: 0,
            limit: 1,
            capabilities: { can_read: true, can_export_csv: false },
        });
        getVendorReportCapabilities.mockResolvedValue({
            can_read: true,
            can_download_annual_report: false,
            can_download_dora_register: false,
            can_use_department_filter: false,
        });
    });

    it('shows exactly the three authorized evidence questions and destination links', async () => {
        render(
            <MemoryRouter>
                <EvidencePage />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('link', { name: 'Open Control Execution History' })).toHaveAttribute(
            'href',
            '/audit-trail',
        );
        expect(await screen.findByRole('link', { name: 'Open Vendor Reports' })).toHaveAttribute(
            'href',
            '/vendor-reports',
        );
        expect(screen.getByRole('link', { name: 'Open Activity Log' })).toHaveAttribute(
            'href',
            '/activity-log',
        );
        expect(screen.getAllByRole('link')).toHaveLength(3);
        expect(screen.getByText('Who changed a business record, and when?')).toBeInTheDocument();
        expect(screen.getByText('Were controls performed, and what were the results?')).toBeInTheDocument();
        expect(screen.getByText('Which vendor and DORA reports are available to export?')).toBeInTheDocument();
        expect(getExecutions).toHaveBeenCalledWith({ skip: 0, limit: 1 });
        expect(getVendorReportCapabilities).toHaveBeenCalledTimes(1);
    });

    it('omits denied cards and never requests execution authority without control read access', async () => {
        authz.canReadControls = false;
        authz.canViewActivityLog = false;
        getVendorReportCapabilities.mockResolvedValue({
            can_read: false,
            can_download_annual_report: false,
            can_download_dora_register: false,
            can_use_department_filter: false,
        });

        render(
            <MemoryRouter>
                <EvidencePage />
            </MemoryRouter>,
        );

        await waitFor(() => expect(getVendorReportCapabilities).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.queryAllByRole('link')).toHaveLength(0));
        expect(getExecutions).not.toHaveBeenCalled();
        expect(screen.queryByText('Activity Log')).not.toBeInTheDocument();
        expect(screen.queryByText('Control Execution History')).not.toBeInTheDocument();
        expect(screen.queryByText('Vendor Reports')).not.toBeInTheDocument();
    });

    it('keeps capability checks non-actionable while they are pending', () => {
        getExecutions.mockReturnValue(new Promise(() => undefined));
        getVendorReportCapabilities.mockReturnValue(new Promise(() => undefined));

        render(
            <MemoryRouter>
                <EvidencePage />
            </MemoryRouter>,
        );

        const executionCard = screen.getByText('Control Execution History').closest('article');
        const vendorCard = screen.getByText('Vendor Reports').closest('article');
        expect(executionCard).not.toBeNull();
        expect(vendorCard).not.toBeNull();
        expect(within(executionCard!).getByRole('status')).toHaveTextContent('Checking availability');
        expect(within(vendorCard!).getByRole('status')).toHaveTextContent('Checking availability');
        expect(within(executionCard!).queryByRole('link')).not.toBeInTheDocument();
        expect(within(vendorCard!).queryByRole('link')).not.toBeInTheDocument();
    });

    it('shows unavailable with local retry for failed execution and vendor capability checks', async () => {
        const user = userEvent.setup();
        getExecutions
            .mockRejectedValueOnce(new Error('execution capability unavailable'))
            .mockResolvedValueOnce({
                items: [],
                total: 0,
                skip: 0,
                limit: 1,
                capabilities: { can_read: true, can_export_csv: false },
            });
        getVendorReportCapabilities
            .mockRejectedValueOnce(new Error('vendor capability unavailable'))
            .mockResolvedValueOnce({
                can_read: true,
                can_download_annual_report: false,
                can_download_dora_register: false,
                can_use_department_filter: false,
            });

        render(
            <MemoryRouter>
                <EvidencePage />
            </MemoryRouter>,
        );

        const executionCard = (await screen.findByText('Control Execution History')).closest('article');
        const vendorCard = screen.getByText('Vendor Reports').closest('article');
        expect(executionCard).not.toBeNull();
        expect(vendorCard).not.toBeNull();
        expect(await within(executionCard!).findByRole('alert')).toHaveTextContent('Unavailable');
        expect(await within(vendorCard!).findByRole('alert')).toHaveTextContent('Unavailable');
        expect(within(executionCard!).queryByRole('link')).not.toBeInTheDocument();
        expect(within(vendorCard!).queryByRole('link')).not.toBeInTheDocument();

        await user.click(within(executionCard!).getByRole('button', { name: 'Retry' }));
        await user.click(within(vendorCard!).getByRole('button', { name: 'Retry' }));

        expect(await within(executionCard!).findByRole('link', { name: 'Open Control Execution History' })).toBeInTheDocument();
        expect(await within(vendorCard!).findByRole('link', { name: 'Open Vendor Reports' })).toBeInTheDocument();
        expect(getExecutions).toHaveBeenCalledTimes(2);
        expect(getVendorReportCapabilities).toHaveBeenCalledTimes(2);
    });
});
