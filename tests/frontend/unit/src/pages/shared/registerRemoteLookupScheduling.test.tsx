import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrincipalQueryBoundary } from '@/contexts/PrincipalQueryBoundary';
import { AssetRegisterFilterBar } from '@/pages/assets/AssetRegisterFilterBar';
import { parseAssetRegisterFilters } from '@/pages/assets/assetRegisterConfig';
import { ProcessRegisterFilterBar } from '@/pages/processes/ProcessRegisterFilterBar';
import { parseProcessRegisterFilters } from '@/pages/processes/processRegisterConfig';
import { parseRegisterUrlState, type RegisterFilters } from '@/pages/shared/registerListQuery';
import { ThreatRegisterFilterBar } from '@/pages/threats/ThreatRegisterFilterBar';
import { parseThreatRegisterFilters } from '@/pages/threats/threatRegisterConfig';
import { VendorRegisterFilterBar } from '@/pages/vendors/VendorRegisterFilterBar';
import { parseVendorRegisterFilters } from '@/pages/vendors/vendorRegisterConfig';

type Option = { id: number; label: string; disabled: boolean };
type Lookup = (resource: string, options: { search?: string; selectedIds: number[] }) => Promise<Option[]>;
const mocks = vi.hoisted(() => ({
    asset: vi.fn<Lookup>(), process: vi.fn<Lookup>(), threat: vi.fn<Lookup>(), vendor: vi.fn<Lookup>(),
}));
vi.mock('@/services/assetApi', () => ({ assetApi: { getLookupOptions: mocks.asset } }));
vi.mock('@/services/processApi', () => ({ processApi: { getLookupOptions: mocks.process } }));
vi.mock('@/services/threatApi', () => ({ threatApi: { getLookupOptions: mocks.threat } }));
vi.mock('@/services/vendorApi', () => ({ vendorApi: { getLookupOptions: mocks.vendor } }));

interface CommonProps {
    facets: object;
    isLoading: boolean;
    onClearAll: () => void;
    onFilterChange: (key: string, value: unknown) => void;
    onRefresh: () => void;
    onSearchChange: (value: string) => void;
    search: string;
}
interface Register {
    prefix: string;
    filterKey: string;
    lookup: typeof mocks.asset;
    renderBar: (filters: RegisterFilters, props: CommonProps) => ReactNode;
}
const REGISTERS: Register[] = [
    { prefix: 'assets', filterKey: 'business_owner_ids', lookup: mocks.asset, renderBar: (filters, props) => <AssetRegisterFilterBar {...props} filters={parseAssetRegisterFilters(filters)} /> },
    { prefix: 'processes', filterKey: 'owner_ids', lookup: mocks.process, renderBar: (filters, props) => <ProcessRegisterFilterBar {...props} filters={parseProcessRegisterFilters(filters)} /> },
    { prefix: 'threats', filterKey: 'steward_ids', lookup: mocks.threat, renderBar: (filters, props) => <ThreatRegisterFilterBar {...props} filters={parseThreatRegisterFilters(filters)} /> },
    { prefix: 'vendors', filterKey: 'outsourcing_owner_ids', lookup: mocks.vendor, renderBar: (filters, props) => <VendorRegisterFilterBar {...props} filters={parseVendorRegisterFilters(filters)} /> },
];
const options: Option[] = [{ id: 42, label: 'Alice Example', disabled: false }, { id: 7, label: 'Bob Example', disabled: false }];

function Harness({ register }: { register: Register }) {
    const [params, setParams] = useSearchParams();
    const state = parseRegisterUrlState(params, { defaultView: 'all' });
    const update = (key: string, value: string) => {
        const next = new URLSearchParams(params);
        next.set(key, value);
        setParams(next);
    };
    return register.renderBar(state.filters, {
        facets: {}, isLoading: false, onClearAll: () => undefined, onRefresh: () => undefined,
        onFilterChange: (key, value) => update('filters', JSON.stringify({ ...state.filters, [key]: value })),
        onSearchChange: (value) => update('q', value), search: state.search,
    });
}

function content(register: Register, principalId = 1) {
    const params = new URLSearchParams({ filters: JSON.stringify({ [register.filterKey]: [42, 7] }) });
    return <PrincipalQueryBoundary principalId={principalId}>
        <MemoryRouter initialEntries={[`/${register.prefix}?${params.toString()}`]}><Harness register={register} /></MemoryRouter>
    </PrincipalQueryBoundary>;
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
    return { promise, resolve, reject };
}

async function updateAndFlush(update: () => void) {
    await act(async () => { update(); await Promise.resolve(); });
}

describe('register remote lookup scheduling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        for (const register of REGISTERS) register.lookup.mockResolvedValue(options);
    });
    afterEach(() => vi.useRealTimers());

    it.each(REGISTERS)('$prefix does not reload selected IDs while the register URL search changes', async (register) => {
        const pending = deferred<Option[]>();
        register.lookup.mockReturnValueOnce(pending.promise);
        render(content(register));
        expect(register.lookup).toHaveBeenCalledTimes(1);
        for (let length = 1; length <= 12; length += 1) {
            await updateAndFlush(() => fireEvent.change(screen.getByTestId(`${register.prefix}-search-input`), {
                target: { value: 'abcdefghijkl'.slice(0, length) },
            }));
        }
        expect(register.lookup).toHaveBeenCalledTimes(1);
        expect(register.lookup.mock.lastCall?.[1].selectedIds).toEqual([42, 7]);
        await updateAndFlush(() => pending.resolve(options));
        expect(screen.getByText('Alice Example')).toBeInTheDocument();
    });

    it.each(REGISTERS)('$prefix preserves selection order, empty selections, and lookup search debounce', async (register) => {
        render(content(register));
        await screen.findByText('Alice Example');
        await updateAndFlush(() => fireEvent.click(screen.getByRole('checkbox', { name: 'Alice Example' })));
        expect(register.lookup).toHaveBeenCalledTimes(2);
        expect(register.lookup.mock.lastCall?.[1].selectedIds).toEqual([7]);
        await updateAndFlush(() => fireEvent.click(screen.getByRole('checkbox', { name: 'Alice Example' })));
        expect(register.lookup).toHaveBeenCalledTimes(3);
        expect(register.lookup.mock.lastCall?.[1].selectedIds).toEqual([7, 42]);
        await updateAndFlush(() => fireEvent.click(screen.getByRole('checkbox', { name: 'Alice Example' })));
        await updateAndFlush(() => fireEvent.click(screen.getByRole('checkbox', { name: 'Bob Example' })));
        expect(register.lookup).toHaveBeenCalledTimes(5);
        expect(register.lookup.mock.lastCall?.[1].selectedIds).toEqual([]);

        const fieldset = screen.getByTestId(`${register.prefix}-filter-control-${register.filterKey}`);
        vi.useFakeTimers();
        for (const search of ['a', 'al', 'ali']) {
            fireEvent.change(within(fieldset).getByRole('searchbox'), { target: { value: search } });
        }
        await act(async () => vi.advanceTimersByTimeAsync(249));
        expect(register.lookup).toHaveBeenCalledTimes(5);
        await act(async () => vi.advanceTimersByTimeAsync(1));
        expect(register.lookup).toHaveBeenCalledTimes(6);
        expect(register.lookup.mock.lastCall?.[1]).toEqual({ search: 'ali', selectedIds: [] });
    });

    it.each(REGISTERS)('$prefix ignores stale lookup failures after a newer selection succeeds', async (register) => {
        render(content(register));
        await screen.findByText('Alice Example');
        const previous = deferred<Option[]>();
        register.lookup.mockReturnValueOnce(previous.promise).mockResolvedValueOnce([{ id: 9, label: 'Current option', disabled: false }]);
        await updateAndFlush(() => fireEvent.click(screen.getByRole('checkbox', { name: 'Alice Example' })));
        await updateAndFlush(() => fireEvent.click(screen.getByRole('checkbox', { name: 'Bob Example' })));
        expect(screen.getByText('Current option')).toBeInTheDocument();
        await updateAndFlush(() => previous.reject(new Error('Older selection failed')));
        expect(screen.getByText('Current option')).toBeInTheDocument();
        expect(register.lookup).toHaveBeenCalledTimes(3);
    });

    it.each(REGISTERS)('$prefix fetches for a new principal and ignores the unmounted principal response', async (register) => {
        const previous = deferred<Option[]>();
        const current = deferred<Option[]>();
        register.lookup.mockReturnValueOnce(previous.promise).mockReturnValueOnce(current.promise);
        const view = render(content(register));
        view.rerender(content(register, 2));
        expect(register.lookup).toHaveBeenCalledTimes(2);
        await updateAndFlush(() => previous.resolve(options));
        expect(screen.queryByText('Alice Example')).not.toBeInTheDocument();
        await updateAndFlush(() => current.resolve([{ id: 9, label: 'New principal option', disabled: false }]));
        await waitFor(() => expect(screen.getByText('New principal option')).toBeInTheDocument());
        expect(register.lookup).toHaveBeenCalledTimes(2);
    });
});
