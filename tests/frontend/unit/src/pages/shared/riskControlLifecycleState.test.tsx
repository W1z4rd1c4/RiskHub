import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useControlsPageState } from '@/pages/controls/useControlsPageState';
import { useRisksPageState } from '@/pages/risks/useRisksPageState';

const mocks = vi.hoisted(() => ({
    downloadControlExport: vi.fn(),
    downloadRiskExport: vi.fn(),
    getControls: vi.fn(),
    getRisks: vi.fn(),
}));

const emptyPage = {
    items: [],
    total: 0,
    offset: 0,
    limit: 50,
    groups: [],
    facets: {},
    capabilities: { can_create: true, can_export: true },
};
const noRiskSemanticFilters = {};

vi.mock('@/services/riskApi', () => ({
    riskApi: {
        downloadExport: mocks.downloadRiskExport,
        getRisks: mocks.getRisks,
        restoreRisk: vi.fn(),
    },
}));

vi.mock('@/services/controlApi', () => ({
    controlApi: {
        downloadExport: mocks.downloadControlExport,
        getControls: mocks.getControls,
        restoreControl: vi.fn(),
    },
}));

vi.mock('@/services/reportApi', () => ({
    reportApi: {
        exportControls: vi.fn(),
        exportRisks: vi.fn(),
    },
}));

vi.mock('@/hooks/useRiskHubConfig', () => ({
    useRiskThresholds: () => ({ thresholds: { critical: 15 } }),
}));

function wrapper(entry: string) {
    return ({ children }: { children: ReactNode }) => (
        <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>
    );
}

function registerEntry(
    path: '/risks' | '/controls',
    filters: Record<string, string>,
): string {
    const params = new URLSearchParams({ filters: JSON.stringify(filters) });
    return `${path}?${params.toString()}`;
}

describe('Risk and Control lifecycle page state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getRisks.mockResolvedValue(emptyPage);
        mocks.getControls.mockResolvedValue(emptyPage);
        mocks.downloadRiskExport.mockResolvedValue(undefined);
        mocks.downloadControlExport.mockResolvedValue(undefined);
    });

    it.each(['all', 'archived'] as const)(
        'keeps Risk lifecycle=%s AND emerging status in list and current-view export state',
        async (lifecycle) => {
            const { result } = renderHook(() => useRisksPageState(noRiskSemanticFilters, 'cs'), {
                wrapper: wrapper(registerEntry('/risks', { lifecycle, status: 'emerging' })),
            });

            await waitFor(() => expect(mocks.getRisks).toHaveBeenCalled());
            expect(mocks.getRisks.mock.calls.at(-1)?.[0]).toMatchObject({
                lifecycle,
                status: 'emerging',
            });
            expect(mocks.getRisks.mock.calls.at(-1)?.[0]).not.toHaveProperty('include_archived');

            await act(async () => { await result.current.exportCurrentRisks(); });
            expect(mocks.downloadRiskExport).toHaveBeenCalledWith(
                expect.objectContaining({ lifecycle, status: 'emerging' }),
                'cs',
            );
            expect(mocks.downloadRiskExport.mock.calls.at(-1)?.[0]).not.toHaveProperty('include_archived');
        },
    );

    it.each(['all', 'archived'] as const)(
        'keeps Control lifecycle=%s AND domain/monitoring status in list and current-view export state',
        async (lifecycle) => {
            const { result } = renderHook(() => useControlsPageState('en'), {
                wrapper: wrapper(registerEntry('/controls', {
                    lifecycle,
                    status: 'inactive',
                    monitoring_status: 'failed',
                })),
            });

            await waitFor(() => expect(mocks.getControls).toHaveBeenCalled());
            expect(mocks.getControls.mock.calls.at(-1)?.[0]).toMatchObject({
                lifecycle,
                status: 'inactive',
                monitoring_status: 'failed',
            });
            expect(mocks.getControls.mock.calls.at(-1)?.[0]).not.toHaveProperty('include_archived');

            await act(async () => { await result.current.exportCurrentControls(); });
            expect(mocks.downloadControlExport).toHaveBeenCalledWith(
                expect.objectContaining({ lifecycle, status: 'inactive', monitoring_status: 'failed' }),
                'en',
            );
            expect(mocks.downloadControlExport.mock.calls.at(-1)?.[0]).not.toHaveProperty('include_archived');
        },
    );

    it.each(['Vysoké', 'Kritické'] as const)(
        'keeps Department Risk net_band=%s when undefined semantic filters are present',
        async (netBand) => {
            renderHook(
                () => useRisksPageState({ net_band: undefined }),
                { wrapper: wrapper(registerEntry('/risks', { net_band: netBand })) },
            );

            await waitFor(() => expect(mocks.getRisks).toHaveBeenCalled());
            expect(mocks.getRisks.mock.calls.at(-1)?.[0]).toMatchObject({
                net_band: netBand,
            });
        },
    );

    it('clears the Department Risk net band from public URL-backed register state', async () => {
        const { result } = renderHook(
            () => useRisksPageState(),
            { wrapper: wrapper(registerEntry('/risks', { net_band: 'Kritické' })) },
        );

        await waitFor(() => expect(result.current.filters.net_band).toBe('Kritické'));
        act(() => result.current.clearFilters());

        await waitFor(() => expect(result.current.filters.net_band).toBe(''));
        await waitFor(() => expect(mocks.getRisks.mock.calls.at(-1)?.[0].net_band).toBeUndefined());
    });

    it('keeps the existing top-level semantic Risk net_band behavior', async () => {
        renderHook(
            () => useRisksPageState({ net_band: 'Kritické' }),
            { wrapper: wrapper('/risks?net_band=Kritick%C3%A9') },
        );

        await waitFor(() => expect(mocks.getRisks).toHaveBeenCalled());
        expect(mocks.getRisks.mock.calls.at(-1)?.[0]).toMatchObject({
            net_band: 'Kritické',
        });
    });
});
