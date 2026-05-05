import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildActivityLogFilters, transitionActivityLogViewMode } from '@/hooks/activityLogPageWorkflow';
import { useActivityLogPageState } from '@/hooks/useActivityLogPageState';
import type { ActivityLogListResponse } from '@/types/activityLog';

const mockList = vi.fn();
const mockGetActions = vi.fn();
const mockGetUsers = vi.fn();
const mockGetDepartments = vi.fn();
const mockGetRisks = vi.fn();

vi.mock('@/hooks/useDebouncedValue', () => ({
    useDebouncedValue: <T,>(value: T) => value,
}));

vi.mock('@/services/activityLogApi', () => ({
    activityLogApi: {
        list: (...args: unknown[]) => mockList(...args),
        getActions: () => mockGetActions(),
    },
}));

vi.mock('@/services/lookupApi', () => ({
    lookupApi: {
        getUsers: () => mockGetUsers(),
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
            <span data-testid="entries-count">{state.entries.length}</span>
            <span data-testid="needs-risk-selection">{String(state.needsRiskSelection)}</span>
        </div>
    );
}

describe('useActivityLogPageState', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetActions.mockResolvedValue([]);
        mockGetUsers.mockResolvedValue([]);
        mockGetDepartments.mockResolvedValue([]);
        mockGetRisks.mockResolvedValue({ items: [], total: 0, offset: 0, limit: 100 });
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

        render(<HookHarness />);

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

    it('submits local calendar-day boundaries without forcing UTC', async () => {
        mockList.mockResolvedValue({ items: [], total: 0, skip: 0, limit: 50 });

        render(<HookHarness />);

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

        render(<CapabilityHarness />);

        await waitFor(() => expect(screen.getByTestId('department-filter')).toHaveTextContent('true'));
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
