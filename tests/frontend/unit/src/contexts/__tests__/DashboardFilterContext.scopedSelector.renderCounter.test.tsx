import { act, render, screen } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { describe, expect, it } from 'vitest';

import {
    DashboardFilterProvider,
    useDashboardFilterMutators,
    useDashboardFilterSelector,
} from '@/contexts/DashboardFilterContext';

function DepartmentConsumer() {
    const count = useRef(0);
    const dept = useDashboardFilterSelector((state) => state.filters.departmentId);
    useEffect(() => {
        count.current += 1;
    });
    return <span data-testid="dept-renders">{count.current}|{dept ?? 'none'}</span>;
}

function RiskMutator() {
    const { setRiskLevel } = useDashboardFilterMutators();
    return <button onClick={() => setRiskLevel('high')}>mut</button>;
}

describe('DashboardFilterContext scoped selector', () => {
    it('mutating riskLevel does not re-render department consumer', () => {
        render(
            <DashboardFilterProvider>
                <DepartmentConsumer />
                <RiskMutator />
            </DashboardFilterProvider>,
        );

        const before = screen.getByTestId('dept-renders').textContent;
        act(() => screen.getByText('mut').click());
        const after = screen.getByTestId('dept-renders').textContent;

        expect(after).toBe(before);
    });
});
