import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useActivityLogPageState } from '@/hooks/useActivityLogPageState';
import { DepartmentRegisterScopeProvider } from '@/pages/departments/DepartmentRegisterScope';

const mockList = vi.fn();
const mockGetActions = vi.fn();
const mockGetActors = vi.fn();
const mockGetDepartments = vi.fn();
const mockGetRisks = vi.fn();

vi.mock('@/hooks/useDebouncedValue', () => ({
    useDebouncedValue: <T,>(value: T) => value,
}));

vi.mock('@/services/activityLogApi', () => ({
    activityLogApi: {
        list: (...args: unknown[]) => mockList(...args),
        getActions: (...args: unknown[]) => mockGetActions(...args),
        getActors: (...args: unknown[]) => mockGetActors(...args),
    },
}));

vi.mock('@/services/lookupApi', () => ({
    lookupApi: {
        getDepartments: (...args: unknown[]) => mockGetDepartments(...args),
    },
}));

vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisks: (...args: unknown[]) => mockGetRisks(...args),
    },
}));

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((next) => {
        resolve = next;
    });
    return { promise, resolve };
}

function LocationProbe() {
    const location = useLocation();
    const navigate = useNavigate();
    return (
        <div>
            <output data-testid="location">{location.pathname}{location.search}</output>
            <button type="button" onClick={() => navigate(-1)}>history back</button>
            <button type="button" onClick={() => navigate(1)}>history forward</button>
        </div>
    );
}

function ActivityStateHarness() {
    const state = useActivityLogPageState();
    const [lastPage, setLastPage] = useState(state.page);

    return (
        <div>
            <LocationProbe />
            <output data-testid="state">
                {state.viewMode}|{state.activeTab}|{state.search}|{state.action}|{state.dateFrom}|{state.dateTo}|
                {state.selectedActorId ?? 'none'}|{state.selectedDepartmentId ?? 'none'}|
                {state.selectedRiskId ?? 'none'}|{state.page}
            </output>
            <button type="button" onClick={() => state.setSearch('policy')}>search policy</button>
            <button type="button" onClick={() => state.setAction('create')}>action create</button>
            <button type="button" onClick={() => state.setViewMode('by_risk')}>view by risk</button>
            <button type="button" onClick={() => state.setSelectedRiskId(12)}>risk twelve</button>
            <button type="button" onClick={() => state.setDateFrom('2026-05-02')}>date from</button>
            <button
                type="button"
                onClick={() => state.setPage((current) => {
                    const next = current + 1;
                    setLastPage(next);
                    return next;
                })}
            >next page</button>
            <output data-testid="last-page">{lastPage}</output>
        </div>
    );
}

function renderHarness(initialEntries: string[], initialIndex = initialEntries.length - 1) {
    return render(
        <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
            <ActivityStateHarness />
        </MemoryRouter>,
    );
}

describe('Activity Log URL state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockList.mockResolvedValue({ items: [], total: 0, skip: 0, limit: 50 });
        mockGetActions.mockResolvedValue(['create', 'update']);
        mockGetActors.mockResolvedValue([{ id: 7, name: 'Ada' }]);
        mockGetDepartments.mockResolvedValue([{ id: 3, name: 'Risk' }]);
        mockGetRisks.mockResolvedValue({ items: [{ id: 12, name: 'Cyber' }], total: 1, offset: 0, limit: 100 });
    });

    it('uses a valid deep link for the first rendered state and list request', async () => {
        renderHarness([
            '/activity?source=review&view=by_person&tab=control&q=policy&action=update&dateFrom=2026-04-20&dateTo=2026-04-21&actorId=7&page=3',
        ]);

        expect(screen.getByTestId('state')).toHaveTextContent(
            'by_person|control|policy|update|2026-04-20|2026-04-21|7|none|none|2',
        );
        await waitFor(() => expect(mockList).toHaveBeenCalled());
        expect(mockList).toHaveBeenNthCalledWith(1, {
            skip: 100,
            limit: 50,
            search: 'policy',
            entity_type: ['control', 'control_execution', 'control_risk_link'],
            entity_id: undefined,
            actor_id: 7,
            department_id: undefined,
            action: 'update',
            date_from: '2026-04-20T00:00:00.000',
            date_to: '2026-04-21T23:59:59.999',
        });
        expect(screen.getByTestId('location').textContent).toBe(
            '/activity?source=review&view=by_person&tab=control&q=policy&action=update&dateFrom=2026-04-20&dateTo=2026-04-21&actorId=7&page=3',
        );
    });

    it('replaces invalid/default values without adding a Back entry', async () => {
        renderHarness([
            '/previous',
            '/activity?source=review&view=unknown&tab=wat&page=0&actorId=-1&dateFrom=2026-02-30',
        ]);

        await waitFor(() => {
            expect(screen.getByTestId('location').textContent).toBe('/activity?source=review');
        });

        fireEvent.click(screen.getByRole('button', { name: 'history back' }));
        await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/previous'));
    });

    it('replaces debounced search, resets page, pushes discrete choices, and restores them with Back', async () => {
        renderHarness(['/previous', '/activity?source=review&page=3']);
        await waitFor(() => expect(mockList).toHaveBeenCalled());

        fireEvent.click(screen.getByRole('button', { name: 'search policy' }));
        await waitFor(() => {
            expect(screen.getByTestId('location').textContent).toBe('/activity?source=review&q=policy');
        });

        fireEvent.click(screen.getByRole('button', { name: 'action create' }));
        await waitFor(() => {
            expect(screen.getByTestId('location').textContent).toBe('/activity?source=review&q=policy&action=create');
        });

        fireEvent.click(screen.getByRole('button', { name: 'view by risk' }));
        fireEvent.click(screen.getByRole('button', { name: 'risk twelve' }));
        await waitFor(() => {
            expect(screen.getByTestId('location').textContent).toBe(
                '/activity?source=review&view=by_risk&q=policy&action=create&riskId=12',
            );
        });

        fireEvent.click(screen.getByRole('button', { name: 'history back' }));
        await waitFor(() => {
            expect(screen.getByTestId('location').textContent).toBe(
                '/activity?source=review&view=by_risk&q=policy&action=create',
            );
        });
        expect(screen.getByTestId('state')).toHaveTextContent('by_risk|kri|policy|create');

        fireEvent.click(screen.getByRole('button', { name: 'history forward' }));
        await waitFor(() => {
            expect(screen.getByTestId('location').textContent).toBe(
                '/activity?source=review&view=by_risk&q=policy&action=create&riskId=12',
            );
        });
    });

    it('preserves an action until metadata loads, then normalizes an unknown action with replace', async () => {
        const actions = deferred<string[]>();
        mockGetActions.mockReturnValue(actions.promise);

        renderHarness(['/previous', '/activity?action=legacy&page=2&source=review']);

        await waitFor(() => expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ action: 'legacy', skip: 50 })));
        expect(screen.getByTestId('location').textContent).toBe('/activity?source=review&action=legacy&page=2');

        await act(async () => {
            actions.resolve(['create', 'update']);
            await actions.promise;
        });

        await waitFor(() => {
            expect(screen.getByTestId('location').textContent).toBe('/activity?source=review');
            expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ action: undefined, skip: 0 }));
        });

        fireEvent.click(screen.getByRole('button', { name: 'history back' }));
        await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/previous'));
    });

    it('keeps the Department workspace authoritative over a conflicting selector', async () => {
        render(
            <MemoryRouter initialEntries={['/activity?source=review&view=by_department&departmentId=999']}>
                <DepartmentRegisterScopeProvider value={{ departmentId: 7, departmentName: 'Compliance' }}>
                    <ActivityStateHarness />
                </DepartmentRegisterScopeProvider>
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(screen.getByTestId('location').textContent).toBe(
                '/activity?source=review&view=by_department&departmentId=7',
            );
        });
        expect(screen.getByTestId('state')).toHaveTextContent('by_department|kri|||||none|7|none|0');
        expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ department_id: 7 }));
        expect(mockGetActors).toHaveBeenCalledWith(7);
        expect(mockGetDepartments).not.toHaveBeenCalled();
    });
});
