import { createElement, useState } from 'react';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RiskFormIdentityStep } from '@/components/risk-form/RiskFormIdentityStep';
import { useRiskLookups } from '@/components/risk-form/useRiskLookups';
import i18n from '@/i18n';
import type { lookupApi } from '@/services/lookupApi';
import type { Risk } from '@/types/risk';
const abortSignalMatcher: unknown = expect.any(AbortSignal);


const getDepartmentsMock = vi.hoisted(() => vi.fn<typeof lookupApi.getDepartments>());
const getRiskFiltersMock = vi.hoisted(() => vi.fn<typeof lookupApi.getRiskFilters>());
const getRisksMock = vi.hoisted(() => vi.fn());

const departmentChoices: Awaited<ReturnType<typeof lookupApi.getDepartments>> = [{
    id: 3, name: 'Operations', code: 'OPS',
    user_count: 0, risk_count: 0, high_risk_count: 0, control_count: 0,
    kri_count: 0, breaching_kri_count: 0, total_net_score: 0,
}];

vi.mock('@/services/lookupApi', () => ({
    lookupApi: {
        getDepartments: getDepartmentsMock,
        getRiskFilters: getRiskFiltersMock,
    },
}));

vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisks: getRisksMock,
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
        t: (key, options) => i18n.t(key, { defaultValue: key, ...(typeof options === 'string' ? { defaultValue: options } : options) }),
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
        getDepartmentsMock.mockResolvedValue(departmentChoices);
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

        await waitFor(() => expect(result.current.departments).toEqual(departmentChoices));
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
            expect(getDepartmentsMock).toHaveBeenCalledWith({ signal: abortSignalMatcher });
            expect(getRiskFiltersMock).toHaveBeenCalledWith({ signal: abortSignalMatcher });
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
