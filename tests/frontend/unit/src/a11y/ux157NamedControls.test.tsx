import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityLogFilterBar } from '@/components/activity-log/ActivityLogFilterBar';
import i18n from '@/i18n';
import { VendorReportsPage } from '@/pages/VendorReportsPage';
import { DepartmentDetailHeader } from '@/pages/departments/DepartmentDetailHeader';
import { server } from '@test/mocks/server';

let observedAnnualRequestUrl = '';

const activityFilterProps = {
    search: '',
    onSearchChange: vi.fn(),
    action: '',
    onActionChange: vi.fn(),
    actions: [],
    dateFrom: '2026-08-01',
    onDateFromChange: vi.fn(),
    dateTo: '2026-08-29',
    onDateToChange: vi.fn(),
    viewMode: 'chronological' as const,
    onViewModeChange: vi.fn(),
    selectedActorId: null,
    onActorChange: vi.fn(),
    selectedDepartmentId: null,
    onDepartmentChange: vi.fn(),
    selectedRiskId: null,
    onRiskChange: vi.fn(),
    actors: [],
    departments: [],
    risks: [],
    canFilterByDepartment: false,
    canViewEntityFilters: true,
};

describe('UX-157 pinned control names', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        observedAnnualRequestUrl = '';
        vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:vendor-report');
        vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => undefined);
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
        server.use(
            http.get('*/api/v1/vendor-reports/capabilities', () => HttpResponse.json({
                can_read: true,
                can_download_annual_report: true,
                can_download_dora_register: false,
                can_use_department_filter: false,
            })),
            http.get('*/api/v1/vendor-reports/annual', ({ request }) => {
                observedAnnualRequestUrl = request.url;
                return new HttpResponse('vendor\n', {
                    headers: {
                        'Content-Disposition': 'attachment; filename="vendor-annual-report-2032.csv"',
                        'Content-Type': 'text/csv',
                    },
                });
            }),
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it.each([
        ['en', 'From date', 'To date'],
        ['cs', 'Datum od', 'Datum do'],
    ] as const)('names both Activity Log dates distinctly in %s', async (language, fromName, toName) => {
        await i18n.changeLanguage(language);
        render(<ActivityLogFilterBar {...activityFilterProps} />);

        const from = screen.getByLabelText(fromName);
        const to = screen.getByLabelText(toName);
        expect(from).toHaveAttribute('type', 'date');
        expect(to).toHaveAttribute('type', 'date');

        fireEvent.change(from, { target: { value: '2026-08-02' } });
        fireEvent.change(to, { target: { value: '2026-08-30' } });
        expect(activityFilterProps.onDateFromChange).toHaveBeenCalledWith('2026-08-02');
        expect(activityFilterProps.onDateToChange).toHaveBeenCalledWith('2026-08-30');
    });

    it.each([
        ['en', 'Year'],
        ['cs', 'Rok'],
    ] as const)('names the Vendor Report year and preserves its request contract in %s', async (language, yearName) => {
        await i18n.changeLanguage(language);
        const user = userEvent.setup();
        render(<VendorReportsPage />);

        const year = await screen.findByRole('spinbutton', { name: yearName });
        expect(year).toHaveAttribute('min', '2000');
        expect(year).toHaveAttribute('max', '2100');
        await user.clear(year);
        await user.type(year, '2032');
        const download = screen.getByRole('button', { name: i18n.t('vendors:reports.annual.download_csv') });
        await user.click(download);

        await waitFor(() => expect(observedAnnualRequestUrl).not.toBe(''));
        const observedRequest = new URL(observedAnnualRequestUrl);
        expect(observedRequest.searchParams.get('year')).toBe('2032');
        expect(observedRequest.searchParams.get('format')).toBe('csv');
        expect(observedRequest.searchParams.has('department_id')).toBe(false);
        await waitFor(() => expect(download).toBeEnabled());
    });

    it.each([
        ['en', 'Back', 'Refresh'],
        ['cs', 'Zpět', 'Obnovit'],
    ] as const)('names both Department detail actions in %s', async (language, backName, refreshName) => {
        await i18n.changeLanguage(language);
        const user = userEvent.setup();
        const onBack = vi.fn();
        const onRefresh = vi.fn();
        render(
            <DepartmentDetailHeader
                department={{ name: 'Operations', code: 'OPS' } as never}
                onBack={onBack}
                onRefresh={onRefresh}
            />,
        );

        const back = screen.getByRole('button', { name: backName });
        const refresh = screen.getByRole('button', { name: refreshName });
        expect(back).toHaveAttribute('type', 'button');
        expect(refresh).toHaveAttribute('type', 'button');
        expect(back.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
        expect(refresh.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
        await user.click(back);
        await user.click(refresh);
        expect(onBack).toHaveBeenCalledOnce();
        expect(onRefresh).toHaveBeenCalledOnce();
    });

});
