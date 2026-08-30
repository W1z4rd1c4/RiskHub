import { act, render, screen, waitFor } from '@testing-library/react';
import { Profiler } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildActivityLogFilters, transitionActivityLogViewMode } from '@/hooks/activityLogPageWorkflow';
import { useActivityLogPageState } from '@/hooks/useActivityLogPageState';
import type { ActivityLogListResponse } from '@/types/activityLog';
import { DepartmentRegisterScopeProvider } from '@/pages/departments/DepartmentRegisterScope';

const mockList = vi.fn();
const mockGetActions = vi.fn();
const mockGetActors = vi.fn();
const mockGetDepartments = vi.fn();
const mockGetRisks = vi.fn();
const mockUseDebouncedValue = vi.fn((value: unknown) => value);

vi.mock('@/hooks/useDebouncedValue', () => ({
    useDebouncedValue: <T,>(value: T) => mockUseDebouncedValue(value) as T,
}));

vi.mock('@/services/activityLogApi', () => ({
    activityLogApi: {
        list: (...args: unknown[]) => mockList(...args),
        getActions: () => mockGetActions(),
        getActors: (...args: unknown[]) => mockGetActors(...args),
    },
}));

vi.mock('@/services/lookupApi', () => ({
    lookupApi: {
        getDepartments: () => mockGetDepartments(),
    },
}));

vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisks: (...args: unknown[]) => mockGetRisks(...args),
    },
}));

function createDeferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

function HookHarness() {
    const state = useActivityLogPageState();

    return (
        <div>
            <button type="button" onClick={() => state.setViewMode('by_risk')}>
                by risk
            </button>
            <button type="button" onClick={() => state.setSelectedRiskId(7)}>
                select risk
            </button>
            <button type="button" onClick={() => state.setSelectedRiskId(null)}>
                clear risk
            </button>
            <button type="button" onClick={() => state.setDateFrom('2026-04-20')}>
                set date from
            </button>
            <button type="button" onClick={() => state.setDateTo('2026-04-20')}>
                set date to
            </button>
            <button type="button" onClick={() => state.setActiveTab('risk')}>
                risk tab
            </button>
            <button type="button" onClick={() => state.setSearch('policy')}>
                search policy
            </button>
            <button type="button" onClick={() => state.refresh()}>
                refresh entries
            </button>
            <span data-testid="active-tab">{state.activeTab}</span>
            <span data-testid="raw-search">{state.search}</span>
            <span data-testid="entries-count">{state.entries.length}</span>
            <span data-testid="needs-risk-selection">{String(state.needsRiskSelection)}</span>
            <span data-testid="actions">{state.actions.join(',')}</span>
            <span data-testid="actors">{state.actors.map((actor) => actor.name).join(',')}</span>
            <span data-testid="departments">{state.departments.map((department) => department.name).join(',')}</span>
            <span data-testid="risks">{state.risks.map((risk) => risk.name).join(',')}</span>
        </div>
    );
}

function renderWithRouter(children: React.ReactNode) {
    return render(<MemoryRouter>{children}</MemoryRouter>);
}

describe('useActivityLogPageState', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetActions.mockResolvedValue([]);
        mockGetActors.mockResolvedValue([]);
        mockGetDepartments.mockResolvedValue([]);
        mockGetRisks.mockResolvedValue({ items: [], total: 0, offset: 0, limit: 100 });
        mockUseDebouncedValue.mockImplementation((value: unknown) => value);
    });

    it('keeps independent filter options when the actor lookup fails', async () => {
        mockList.mockResolvedValue({ items: [], total: 0, skip: 0, limit: 50 });
        mockGetActions.mockResolvedValue(['create']);
        mockGetActors.mockRejectedValue(new Error('actor lookup unavailable'));
        mockGetDepartments.mockResolvedValue([{ id: 2, name: 'Security' }]);
        mockGetRisks.mockResolvedValue({
            items: [{ id: 7, name: 'Cyber risk' }],
            total: 1,
            offset: 0,
            limit: 100,
        });

        renderWithRouter(<HookHarness />);

        await waitFor(() => expect(screen.getByTestId('actions')).toHaveTextContent('create'));
        expect(screen.getByTestId('actors')).toBeEmptyDOMElement();
        expect(screen.getByTestId('departments')).toHaveTextContent('Security');
        expect(screen.getByTestId('risks')).toHaveTextContent('Cyber risk');
    });

    it('ignores stale risk responses after clearing the selected risk', async () => {
        const deferred = createDeferred<ActivityLogListResponse>();
        mockList
            .mockResolvedValueOnce({
                items: [],
                total: 0,
                skip: 0,
                limit: 50,
                capabilities: {
                    can_read: true,
                    can_filter_by_department: false,
                    can_view_entity_filters: true,
                    can_export_csv: false,
                },
            })
            .mockImplementationOnce(() => deferred.promise);

        renderWithRouter(<HookHarness />);

        await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));

        await act(async () => {
            screen.getByRole('button', { name: 'by risk' }).click();
        });

        expect(screen.getByTestId('needs-risk-selection')).toHaveTextContent('true');

        await act(async () => {
            screen.getByRole('button', { name: 'select risk' }).click();
        });

        await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));

        await act(async () => {
            screen.getByRole('button', { name: 'clear risk' }).click();
        });

        expect(screen.getByTestId('entries-count')).toHaveTextContent('0');
        expect(screen.getByTestId('needs-risk-selection')).toHaveTextContent('true');

        deferred.resolve({
            items: [
                {
                    id: 99,
                    entity_type: 'risk',
                    entity_id: 7,
                    entity_name: 'Stale Risk',
                    action: 'update',
                    actor_id: 5,
                    actor_name: 'Analyst',
                    department_id: 3,
                    changes: null,
                    description: 'Stale response',
                    created_at: '2026-04-20T08:00:00Z',
                },
            ],
            total: 1,
            skip: 0,
            limit: 50,
        });

        await act(async () => {
            await Promise.resolve();
        });

        expect(screen.getByTestId('entries-count')).toHaveTextContent('0');
        expect(screen.getByTestId('needs-risk-selection')).toHaveTextContent('true');
    });

    it('does not commit the prior tab entries under a new tab query', async () => {
        const riskRequest = createDeferred<ActivityLogListResponse>();
        const riskCommitEntryCounts: string[] = [];
        const host = document.createElement('div');
        document.body.appendChild(host);
        mockList
            .mockResolvedValueOnce({
                items: [{
                    id: 91,
                    entity_type: 'kri',
                    entity_id: 7,
                    entity_name: 'Availability',
                    action: 'update',
                    actor_id: 5,
                    actor_name: 'Analyst',
                    department_id: 3,
                    changes: null,
                    description: 'Prior KRI activity',
                    created_at: '2026-04-20T08:00:00Z',
                }],
                total: 1,
                skip: 0,
                limit: 50,
            })
            .mockReturnValueOnce(riskRequest.promise);

        render(
            <Profiler
                id="activity-log-state"
                onRender={() => {
                    if (host.querySelector('[data-testid="active-tab"]')?.textContent !== 'risk') return;
                    riskCommitEntryCounts.push(
                        host.querySelector('[data-testid="entries-count"]')?.textContent ?? '',
                    );
                }}
            >
                <MemoryRouter>
                    <HookHarness />
                </MemoryRouter>
            </Profiler>,
            { container: host },
        );

        await waitFor(() => expect(screen.getByTestId('entries-count')).toHaveTextContent('1'));
        act(() => {
            screen.getByRole('button', { name: 'risk tab' }).click();
        });

        expect(riskCommitEntryCounts).not.toContain('1');
        expect(screen.getByTestId('entries-count')).toHaveTextContent('0');

        await act(async () => {
            riskRequest.resolve({ items: [], total: 0, skip: 0, limit: 50 });
            await riskRequest.promise;
        });
        expect(screen.getByTestId('entries-count')).toHaveTextContent('0');
    });

    it('does not commit prior rows after raw search changes while the debounce is pending', async () => {
        const searchCommitHasPriorRows: boolean[] = [];
        const host = document.createElement('div');
        document.body.appendChild(host);
        mockUseDebouncedValue.mockImplementation((value: unknown) => value === 'policy' ? '' : value);
        mockList.mockResolvedValue({
            items: [{
                id: 92,
                entity_type: 'kri',
                entity_id: 8,
                entity_name: 'Recovery time',
                action: 'update',
                actor_id: 5,
                actor_name: 'Analyst',
                department_id: 3,
                changes: null,
                description: 'Prior unfiltered activity',
                created_at: '2026-04-20T08:00:00Z',
            }],
            total: 1,
            skip: 0,
            limit: 50,
        });

        render(
            <Profiler
                id="activity-log-search-state"
                onRender={() => {
                    if (host.querySelector('[data-testid="raw-search"]')?.textContent !== 'policy') return;
                    searchCommitHasPriorRows.push(
                        host.querySelector('[data-testid="entries-count"]')?.textContent === '1',
                    );
                }}
            >
                <MemoryRouter>
                    <HookHarness />
                </MemoryRouter>
            </Profiler>,
            { container: host },
        );

        await waitFor(() => expect(screen.getByTestId('entries-count')).toHaveTextContent('1'));
        const requestsBeforeSearch = mockList.mock.calls.length;
        act(() => {
            screen.getByRole('button', { name: 'search policy' }).click();
        });

        expect(screen.getByTestId('raw-search')).toHaveTextContent('policy');
        expect(searchCommitHasPriorRows).not.toContain(true);
        expect(screen.getByTestId('entries-count')).toHaveTextContent('0');
        expect(mockList).toHaveBeenCalledTimes(requestsBeforeSearch);
        act(() => {
            screen.getByRole('button', { name: 'refresh entries' }).click();
        });
        expect(mockList).toHaveBeenCalledTimes(requestsBeforeSearch);
    });

    it('submits local calendar-day boundaries without forcing UTC', async () => {
        mockList.mockResolvedValue({ items: [], total: 0, skip: 0, limit: 50 });

        renderWithRouter(<HookHarness />);

        await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));

        await act(async () => {
            screen.getByRole('button', { name: 'set date from' }).click();
            screen.getByRole('button', { name: 'set date to' }).click();
        });

        await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));

        expect(mockList).toHaveBeenLastCalledWith(
            expect.objectContaining({
                date_from: '2026-04-20T00:00:00.000',
                date_to: '2026-04-20T23:59:59.999',
            })
        );
    });

    it('exposes backend activity-log capabilities from the list response', async () => {
        mockList.mockResolvedValue({
            items: [],
            total: 0,
            skip: 0,
            limit: 50,
            capabilities: {
                can_read: true,
                can_filter_by_department: true,
                can_view_entity_filters: true,
                can_export_csv: true,
            },
        });

        function CapabilityHarness() {
            const state = useActivityLogPageState();
            return (
                <span data-testid="department-filter">
                    {String(state.capabilities?.can_filter_by_department === true)}
                </span>
            );
        }

        renderWithRouter(<CapabilityHarness />);

        await waitFor(() => expect(screen.getByTestId('department-filter')).toHaveTextContent('true'));
    });

    it('locks entries and lookups to the Department workspace', async () => {
        mockList.mockResolvedValue({ items: [], total: 0, skip: 0, limit: 50 });

        renderWithRouter(
            <DepartmentRegisterScopeProvider value={{ departmentId: 7, departmentName: 'Compliance' }}>
                <HookHarness />
            </DepartmentRegisterScopeProvider>,
        );

        await waitFor(() => expect(mockList).toHaveBeenCalled());
        expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ department_id: 7 }));
        expect(mockGetActors).toHaveBeenCalledWith(7);
        expect(mockGetDepartments).not.toHaveBeenCalled();
        expect(mockGetRisks).toHaveBeenCalledWith(expect.objectContaining({ department_id: 7 }));
        expect(screen.getByTestId('departments')).toHaveTextContent('Compliance');
    });

    it('uses workflow helpers for view transitions and filter payloads', () => {
        expect(
            transitionActivityLogViewMode({
                nextMode: 'by_risk',
                selectedActorId: 1,
                selectedDepartmentId: 2,
                selectedRiskId: 3,
            })
        ).toEqual({
            selectedActorId: null,
            selectedDepartmentId: null,
            selectedRiskId: 3,
        });

        expect(
            buildActivityLogFilters({
                page: 2,
                limit: 50,
                search: 'policy',
                entityTypes: ['risk'],
                entityId: 7,
                viewMode: 'by_risk',
                selectedActorId: 11,
                selectedDepartmentId: 12,
                action: 'update',
                dateFrom: '2026-04-20',
                dateTo: '2026-04-21',
            })
        ).toEqual({
            skip: 100,
            limit: 50,
            search: 'policy',
            entity_type: ['risk'],
            entity_id: 7,
            actor_id: undefined,
            department_id: undefined,
            action: 'update',
            date_from: '2026-04-20T00:00:00.000',
            date_to: '2026-04-21T23:59:59.999',
        });
    });
});
