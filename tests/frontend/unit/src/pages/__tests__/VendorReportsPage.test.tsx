import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { VendorReportsPage } from '@/pages/VendorReportsPage';

const getCapabilitiesMock = vi.fn();
const downloadAnnualMock = vi.fn();
const downloadDoraRegisterMock = vi.fn();
const getDepartmentsMock = vi.fn();

function LocationProbe() {
    const location = useLocation();
    return <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>;
}

function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });
    return { promise, reject, resolve };
}

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
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

    it('shows truthful announced recovery when backend capabilities are unavailable', async () => {
        getCapabilitiesMock
            .mockRejectedValueOnce(new Error('network'))
            .mockResolvedValueOnce(allowReports());

        render(<VendorReportsPage />);

        expect(await screen.findByRole('alert')).toHaveTextContent('reports.unavailable');
        expect(screen.queryByText('reports.not_authorized')).not.toBeInTheDocument();
        expect(screen.queryByText('reports.annual.title')).not.toBeInTheDocument();
        expect(screen.queryByText('reports.dora.title')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /reports\.annual\.download_csv/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /reports\.dora\.download/ })).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'actions.retry' }));

        expect(await screen.findByText('reports.annual.title')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(getCapabilitiesMock).toHaveBeenCalledTimes(2);
    });

    it('hides report content and actions when backend denies read access', async () => {
        getCapabilitiesMock.mockResolvedValue(allowReports({ can_read: false }));

        render(<VendorReportsPage />);

        expect(await screen.findByText('reports.not_authorized')).toBeInTheDocument();
        expect(screen.queryByText('reports.annual.title')).not.toBeInTheDocument();
        expect(screen.queryByText('reports.dora.title')).not.toBeInTheDocument();
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

    it('keeps annual failure local and retries the captured year and department', async () => {
        const firstDownload = createDeferred<void>();
        const initialYear = new Date().getFullYear();
        getCapabilitiesMock.mockResolvedValue(allowReports());
        downloadAnnualMock
            .mockReturnValueOnce(firstDownload.promise)
            .mockResolvedValueOnce(undefined);
        const user = userEvent.setup();

        render(
            <MemoryRouter initialEntries={['/vendor-reports?source=audit#annual']}>
                <VendorReportsPage />
                <LocationProbe />
            </MemoryRouter>,
        );

        const annualButton = await screen.findByRole('button', { name: /reports\.annual\.download_csv/ });
        const doraButton = screen.getByRole('button', { name: /reports\.dora\.download/ });
        await waitFor(() => expect(screen.getAllByLabelText('labels.department')[0]).toHaveValue('42'));
        await user.click(annualButton);

        expect(annualButton).toBeDisabled();
        expect(doraButton).toBeEnabled();
        await act(async () => firstDownload.reject(new Error('annual unavailable')));

        const annualSection = screen.getByText('reports.annual.title').closest('section');
        expect(annualSection).not.toBeNull();
        expect(within(annualSection!).getByRole('alert')).toHaveTextContent('export.errors.failed');
        expect(doraButton).toBeEnabled();
        expect(screen.getByTestId('location')).toHaveTextContent('/vendor-reports?source=audit#annual');

        await user.clear(screen.getByLabelText('reports.annual.year'));
        await user.type(screen.getByLabelText('reports.annual.year'), String(initialYear + 1));
        await user.click(doraButton);
        expect(downloadDoraRegisterMock).toHaveBeenCalledWith(42);

        await user.click(within(annualSection!).getByRole('button', { name: 'actions.retry' }));
        await waitFor(() => expect(downloadAnnualMock).toHaveBeenCalledTimes(2));
        expect(downloadAnnualMock).toHaveBeenNthCalledWith(1, initialYear, 'csv', 42);
        expect(downloadAnnualMock).toHaveBeenNthCalledWith(2, initialYear, 'csv', 42);
        await waitFor(() => expect(within(annualSection!).queryByRole('alert')).not.toBeInTheDocument());
    });

    it('keeps DORA failure local and retries its captured department independently', async () => {
        const firstDownload = createDeferred<void>();
        getCapabilitiesMock.mockResolvedValue(allowReports());
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
            {
                id: 77,
                name: 'Finance',
                code: 'FIN',
                user_count: 1,
                risk_count: 0,
                control_count: 0,
                kri_count: 0,
                high_risk_count: 0,
                breaching_kri_count: 0,
                total_net_score: 0,
            },
        ]);
        downloadDoraRegisterMock
            .mockReturnValueOnce(firstDownload.promise)
            .mockResolvedValueOnce(undefined);
        const user = userEvent.setup();

        render(
            <MemoryRouter initialEntries={['/vendor-reports?source=audit#dora']}>
                <VendorReportsPage />
                <LocationProbe />
            </MemoryRouter>,
        );

        const annualButton = await screen.findByRole('button', { name: /reports\.annual\.download_csv/ });
        const doraButton = screen.getByRole('button', { name: /reports\.dora\.download/ });
        const departmentSelectors = await screen.findAllByLabelText('labels.department');
        await user.selectOptions(departmentSelectors[1], '42');
        await user.click(doraButton);

        expect(doraButton).toBeDisabled();
        expect(annualButton).toBeEnabled();
        await act(async () => firstDownload.reject(new Error('DORA unavailable')));

        const doraSection = screen.getByText('reports.dora.title').closest('section');
        expect(doraSection).not.toBeNull();
        expect(within(doraSection!).getByRole('alert')).toHaveTextContent('export.errors.failed');
        expect(annualButton).toBeEnabled();
        expect(screen.getByTestId('location')).toHaveTextContent('/vendor-reports?source=audit#dora');

        await user.selectOptions(departmentSelectors[0], '77');
        await user.click(within(doraSection!).getByRole('button', { name: 'actions.retry' }));
        await waitFor(() => expect(downloadDoraRegisterMock).toHaveBeenCalledTimes(2));
        expect(downloadDoraRegisterMock).toHaveBeenNthCalledWith(1, 42);
        expect(downloadDoraRegisterMock).toHaveBeenNthCalledWith(2, 42);
        await waitFor(() => expect(within(doraSection!).queryByRole('alert')).not.toBeInTheDocument());
    });
});
