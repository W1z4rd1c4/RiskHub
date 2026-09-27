import { createElement, useState } from 'react';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RiskFormIdentityStep } from '@/components/risk-form/RiskFormIdentityStep';
import { useRiskLookups } from '@/components/risk-form/useRiskLookups';
import i18n from '@/i18n';
import type { Risk } from '@/types/risk';

const getDepartmentsMock = vi.fn();
const getRiskFiltersMock = vi.fn();
const getRisksMock = vi.fn();

vi.mock('@/services/lookupApi', () => ({
    lookupApi: {
        getDepartments: (...args: unknown[]) => getDepartmentsMock(...args),
        getRiskFilters: (...args: unknown[]) => getRiskFiltersMock(...args),
    },
}));

vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisks: (...args: unknown[]) => getRisksMock(...args),
    },
}));

function LookupBackedIdentityStep() {
    const lookups = useRiskLookups();
    const [formData, setFormData] = useState<Partial<Risk>>({
        name: '',
        process: '',
        category: '',
        description: '',
    });

    return createElement(RiskFormIdentityStep, {
        t: i18n.t.bind(i18n),
        formData,
        fieldErrors: {},
        riskTypes: [],
        riskTypesLoading: false,
        existingProcesses: lookups.existingProcesses,
        existingCategories: lookups.existingCategories,
        subprocessesByProcess: lookups.subprocessesByProcess,
        handleInputChange: (field, value) => setFormData((current) => ({ ...current, [field]: value })),
    });
}

describe('useRiskLookups', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getDepartmentsMock.mockResolvedValue([{ id: 3, name: 'Operations', code: 'OPS' }]);
        getRiskFiltersMock.mockResolvedValue({
            processes: ['Claims', 'Underwriting'],
            categories: ['Financial', 'Operational'],
            subprocesses_by_process: {
                Claims: ['FNOL', 'Settlement'],
            },
        });
        getRisksMock.mockResolvedValue({ items: [], total: 0 });
    });

    it('loads Risk suggestions once from the scoped lookup and never downloads the Risk register', async () => {
        const { result } = renderHook(() => useRiskLookups());

        await waitFor(() => expect(result.current.existingProcesses).toEqual(['Claims', 'Underwriting']));

        expect(result.current.existingCategories).toEqual(['Financial', 'Operational']);
        expect(result.current.subprocessesByProcess).toEqual({
            Claims: ['FNOL', 'Settlement'],
        });
        expect(getRiskFiltersMock).toHaveBeenCalledTimes(1);
        expect(getRisksMock).not.toHaveBeenCalled();
    });

    it('keeps Department choices when optional Risk suggestions fail', async () => {
        getRiskFiltersMock.mockRejectedValueOnce(new Error('suggestions unavailable'));

        const { result } = renderHook(() => useRiskLookups());

        await waitFor(() => expect(result.current.departments).toEqual([{ id: 3, name: 'Operations', code: 'OPS' }]));
        expect(result.current.existingProcesses).toEqual([]);
        expect(result.current.existingCategories).toEqual([]);
        expect(result.current.subprocessesByProcess).toEqual({});
        expect(getRisksMock).not.toHaveBeenCalled();
    });

    it('keeps the rendered Risk form editable when its single scoped suggestion lookup fails', async () => {
        getRiskFiltersMock.mockRejectedValueOnce(new Error('suggestions unavailable'));
        const user = userEvent.setup();

        render(createElement(LookupBackedIdentityStep));
        await waitFor(() => expect(getRiskFiltersMock).toHaveBeenCalledTimes(1));

        const process = screen.getByRole('combobox', { name: 'Main Process' });
        await user.type(process, 'Novel process');

        expect(process).toHaveValue('Novel process');
        expect(screen.getByText('Create "Novel process"')).toBeVisible();
        expect(getRiskFiltersMock).toHaveBeenCalledTimes(1);
        expect(getRisksMock).not.toHaveBeenCalled();
    });

    it('aborts both suggestion and Department requests when the Risk form unmounts', async () => {
        getDepartmentsMock.mockReturnValue(new Promise(() => undefined));
        getRiskFiltersMock.mockReturnValue(new Promise(() => undefined));

        const { unmount } = renderHook(() => useRiskLookups());

        await waitFor(() => {
            expect(getDepartmentsMock).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
            expect(getRiskFiltersMock).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
        });
        const signals = [
            getDepartmentsMock.mock.calls[0]?.[0]?.signal,
            getRiskFiltersMock.mock.calls[0]?.[0]?.signal,
        ] as AbortSignal[];
        expect(signals.every((signal) => signal.aborted === false)).toBe(true);

        unmount();

        expect(signals.every((signal) => signal.aborted)).toBe(true);
    });
});
