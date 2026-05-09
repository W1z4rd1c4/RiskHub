import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDepartmentDetail } from '@/hooks/useDepartmentDetail';

const departmentApiMock = vi.hoisted(() => ({
    getDepartment: vi.fn(),
    getDepartmentRisks: vi.fn(),
    getDepartmentControls: vi.fn(),
    getDepartmentKRIs: vi.fn(),
}));

const userApiMock = vi.hoisted(() => ({
    getUsers: vi.fn(),
}));

const riskHubApiMock = vi.hoisted(() => ({
    getConfigValue: vi.fn(),
}));

vi.mock('@/services/departmentApi', () => ({
    departmentApi: departmentApiMock,
}));

vi.mock('@/services/userApi', () => ({
    userApi: userApiMock,
}));

vi.mock('@/services/riskHubApi', () => ({
    riskHubApi: riskHubApiMock,
}));

vi.mock('@/services/logger', () => ({
    logError: vi.fn(),
}));

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });

    return function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

describe('useDepartmentDetail thresholds', () => {
    beforeEach(() => {
        departmentApiMock.getDepartment.mockResolvedValue({
            id: 3,
            name: 'Operations',
            risk_count: 0,
            high_risk_count: 0,
            risk_distribution: {
                critical: 0,
                high: 0,
                medium: 0,
                low: 0,
            },
        });
        departmentApiMock.getDepartmentRisks.mockResolvedValue([]);
        departmentApiMock.getDepartmentControls.mockResolvedValue([]);
        departmentApiMock.getDepartmentKRIs.mockResolvedValue({ items: [], total: 0 });
        userApiMock.getUsers.mockResolvedValue({ items: [], total: 0 });
        riskHubApiMock.getConfigValue.mockImplementation((key: string) => {
            if (key === 'high_risk_min_net_score') return Promise.resolve({ value: 12 });
            if (key === 'critical_risk_min_net_score') return Promise.resolve({ value: 20 });
            if (key === 'medium_risk_min_net_score') return Promise.resolve({ value: 6 });
            return Promise.resolve(null);
        });
    });

    it('uses the configured high-risk threshold for the department high-risk filter', async () => {
        renderHook(
            () => useDepartmentDetail({
                departmentId: 3,
                activeTab: 'risks',
                riskFilter: 'high',
                kriFilter: 'all',
                riskPage: 1,
                controlPage: 1,
                kriPage: 1,
                userPage: 1,
            }),
            { wrapper: createWrapper() },
        );

        await waitFor(() => {
            expect(departmentApiMock.getDepartmentRisks).toHaveBeenCalledWith(
                3,
                expect.objectContaining({ min_net_score: 12 }),
            );
        });
    });

    it('uses department high_risk_count for high-risk totals instead of static distribution buckets', async () => {
        departmentApiMock.getDepartment.mockResolvedValueOnce({
            id: 3,
            name: 'Operations',
            risk_count: 20,
            high_risk_count: 3,
            risk_distribution: {
                critical: 4,
                high: 5,
                medium: 7,
                low: 4,
            },
        });

        const { result } = renderHook(
            () => useDepartmentDetail({
                departmentId: 3,
                activeTab: 'risks',
                riskFilter: 'high',
                kriFilter: 'all',
                riskPage: 1,
                controlPage: 1,
                kriPage: 1,
                userPage: 1,
            }),
            { wrapper: createWrapper() },
        );

        await waitFor(() => {
            expect(result.current.department?.high_risk_count).toBe(3);
        });

        expect(result.current.getRiskCount()).toBe(3);
    });
});
