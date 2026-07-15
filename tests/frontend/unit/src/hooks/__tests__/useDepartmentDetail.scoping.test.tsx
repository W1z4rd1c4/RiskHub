import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDepartmentDetail } from '@/hooks/useDepartmentDetail';

const departmentApiMock = vi.hoisted(() => ({
  getDepartment: vi.fn(),
  getDepartmentRisks: vi.fn(),
  getDepartmentControls: vi.fn(),
  getDepartmentKRIs: vi.fn(),
}));
const accessApiMock = vi.hoisted(() => ({ listDepartmentAccessUsers: vi.fn() }));

vi.mock('@/services/departmentApi', () => ({ departmentApi: departmentApiMock }));
vi.mock('@/services/accessApi', () => ({ accessApi: accessApiMock }));
vi.mock('@/services/logger', () => ({ logError: vi.fn() }));
vi.mock('@/hooks/useRiskHubConfig', () => ({
  useRiskThresholds: () => ({ thresholds: { critical: 16, high: 10, medium: 5 } }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function department(id: number, name: string, riskCount: number) {
  return {
    id,
    name,
    code: `D${id}`,
    description: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    user_count: 0,
    risk_count: riskCount,
    high_risk_count: 0,
    control_count: 0,
    kri_count: 0,
    kri_monitoring_counts: { new: 0, not_submitted: 0, breach: 0, warning: 0, optimal: 0 },
    risk_distribution: { low: 0, medium: 0, high: 0, critical: 0 },
    risk_by_status: {},
    control_stats: { total: 0, active: 0, inactive: 0, by_form: {}, by_frequency: {} },
    recent_executions: [],
  };
}

function risk(id: number, name: string) {
  return {
    id,
    risk_id_code: `R-${id}`,
    name,
    process: 'Ops',
    risk_type: 'operational',
    description: '',
    gross_score: 6,
    gross_probability: 2,
    gross_impact: 3,
    net_score: 4,
    status: 'active',
    is_archived: false,
    is_priority: false,
  };
}

function params(departmentId: number) {
  return {
    departmentId,
    activeTab: 'risks' as const,
    canViewUsers: true,
    riskFilter: 'all' as const,
    kriFilter: 'all' as const,
    riskPage: 1,
    controlPage: 1,
    kriPage: 1,
    userPage: 1,
  };
}

describe('useDepartmentDetail department ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    departmentApiMock.getDepartmentControls.mockResolvedValue([]);
    departmentApiMock.getDepartmentKRIs.mockResolvedValue({ items: [], total: 0 });
    accessApiMock.listDepartmentAccessUsers.mockResolvedValue([]);
  });

  it('exposes no A metadata, rows, or totals synchronously after navigating to B', async () => {
    const bMetadata = deferred<ReturnType<typeof department>>();
    const bRisks = deferred<ReturnType<typeof risk>[]>();
    departmentApiMock.getDepartment.mockImplementation((id: number) => (
      id === 7 ? Promise.resolve(department(7, 'Alpha', 205)) : bMetadata.promise
    ));
    departmentApiMock.getDepartmentRisks.mockImplementation((id: number) => (
      id === 7 ? Promise.resolve([risk(71, 'Alpha Risk')]) : bRisks.promise
    ));

    const { result, rerender } = renderHook(
      ({ id }) => useDepartmentDetail(params(id)),
      { initialProps: { id: 7 } },
    );
    await waitFor(() => expect(result.current.risks[0]?.name).toBe('Alpha Risk'));
    expect(result.current.riskTotalPages).toBe(3);

    rerender({ id: 8 });

    expect(result.current.department).toBeNull();
    expect(result.current.risks).toEqual([]);
    expect(result.current.riskTotalPages).toBe(1);
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      bMetadata.resolve(department(8, 'Beta', 1));
      bRisks.resolve([risk(81, 'Beta Risk')]);
    });
    await waitFor(() => expect(result.current.risks[0]?.name).toBe('Beta Risk'));
  });

  it('ignores delayed A completions after B owns the route', async () => {
    const aMetadata = deferred<ReturnType<typeof department>>();
    const aRisks = deferred<ReturnType<typeof risk>[]>();
    departmentApiMock.getDepartment.mockImplementation((id: number) => (
      id === 7 ? aMetadata.promise : Promise.resolve(department(8, 'Beta', 1))
    ));
    departmentApiMock.getDepartmentRisks.mockImplementation((id: number) => (
      id === 7 ? aRisks.promise : Promise.resolve([risk(81, 'Beta Risk')])
    ));

    const { result, rerender } = renderHook(
      ({ id }) => useDepartmentDetail(params(id)),
      { initialProps: { id: 7 } },
    );
    rerender({ id: 8 });
    await waitFor(() => expect(result.current.risks[0]?.name).toBe('Beta Risk'));

    await act(async () => {
      aMetadata.resolve(department(7, 'Alpha', 205));
      aRisks.resolve([risk(71, 'Alpha Risk')]);
    });

    expect(result.current.department?.name).toBe('Beta');
    expect(result.current.risks.map((item) => item.name)).toEqual(['Beta Risk']);
    expect(result.current.riskTotalPages).toBe(1);
  });

  it('keeps B empty on failure, then retries into B-owned rows and totals', async () => {
    departmentApiMock.getDepartment.mockImplementation((id: number) => Promise.resolve(
      id === 7 ? department(7, 'Alpha', 205) : department(8, 'Beta', 101),
    ));
    departmentApiMock.getDepartmentRisks
      .mockImplementationOnce(() => Promise.resolve([risk(71, 'Alpha Risk')]))
      .mockImplementationOnce(() => Promise.reject(new Error('B failed')))
      .mockImplementationOnce(() => Promise.resolve([risk(81, 'Beta Risk')]));

    const { result, rerender } = renderHook(
      ({ id }) => useDepartmentDetail(params(id)),
      { initialProps: { id: 7 } },
    );
    await waitFor(() => expect(result.current.risks[0]?.name).toBe('Alpha Risk'));
    rerender({ id: 8 });

    await waitFor(() => expect(result.current.risksState.errorKey).toBe('tables.error.message'));
    expect(result.current.risks).toEqual([]);
    expect(result.current.riskTotalPages).toBe(2);

    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.risks[0]?.name).toBe('Beta Risk'));
    expect(result.current.risksState.errorKey).toBeNull();
    expect(result.current.riskTotalPages).toBe(2);
  });

  it('does not fetch a department roster without department-access capability', async () => {
    departmentApiMock.getDepartment.mockResolvedValue(department(7, 'Alpha', 0));

    const { result } = renderHook(() => useDepartmentDetail({
      ...params(7),
      activeTab: 'users',
      canViewUsers: false,
    }));

    await waitFor(() => expect(result.current.department?.name).toBe('Alpha'));

    expect(accessApiMock.listDepartmentAccessUsers).not.toHaveBeenCalled();
    expect(result.current.users).toEqual([]);
  });

  it('fetches the scoped roster when department-access capability is present', async () => {
    departmentApiMock.getDepartment.mockResolvedValue(department(7, 'Alpha', 0));
    accessApiMock.listDepartmentAccessUsers.mockResolvedValue([]);

    renderHook(() => useDepartmentDetail({
      ...params(7),
      activeTab: 'users',
      canViewUsers: true,
    }));

    await waitFor(() => expect(accessApiMock.listDepartmentAccessUsers).toHaveBeenCalledWith(7));
  });
});
