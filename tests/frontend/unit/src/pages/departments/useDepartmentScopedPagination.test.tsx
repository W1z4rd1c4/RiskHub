import { MemoryRouter, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { DepartmentRegisterScopeProvider } from '@/pages/departments/DepartmentRegisterScope';
import { useDepartmentScopedPagination } from '@/pages/departments/useDepartmentScopedPagination';

function Probe() {
    const [localPage, setLocalPage] = useState(1);
    const [params, setParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();
    const pagination = useDepartmentScopedPagination({
        localPage,
        setLocalPage,
        searchParams: params,
        setSearchParams: setParams,
    });
    return (
        <>
            <output data-testid="page">{pagination.currentPage}</output>
            <output data-testid="search">{location.search}</output>
            <button onClick={() => pagination.setCurrentPage(4)}>page-4</button>
            <button onClick={() => navigate(-1)}>back</button>
        </>
    );
}

describe('useDepartmentScopedPagination', () => {
    it('writes scoped pagination to the URL and browser Back restores it', async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter initialEntries={['/departments/7?tab=risks&page=2', '/departments/7?tab=risks&page=3']} initialIndex={1}>
                <DepartmentRegisterScopeProvider value={{ departmentId: 7, departmentName: 'Compliance' }}>
                    <Probe />
                </DepartmentRegisterScopeProvider>
            </MemoryRouter>,
        );

        expect(screen.getByTestId('page')).toHaveTextContent('3');
        await user.click(screen.getByRole('button', { name: 'page-4' }));
        expect(screen.getByTestId('search')).toHaveTextContent('?tab=risks&page=4');
        await user.click(screen.getByRole('button', { name: 'back' }));
        expect(screen.getByTestId('page')).toHaveTextContent('3');
    });

    it.each([
        'risks/useRisksPageState.ts',
        'controls/useControlsPageState.ts',
        'kris/useKrisPageState.ts',
        'issues/useIssuesPageState.ts',
        'processes/useProcessesPageState.ts',
        'assets/useAssetsPageState.ts',
        'vendors/useVendorsPageState.ts',
    ])('atomically resets scoped pagination without clobbering %s URL state', (relativePath) => {
        const source = readFileSync(`src/pages/${relativePath}`, 'utf8');

        expect(source).toContain('setSearchParams(resetDepartmentScopedPage(params, isDepartmentScoped), { replace });');
        expect(source).toContain('if (!isDepartmentScoped) setCurrentPage(1);');
        expect(source).not.toMatch(
            /setSearchParams\(resetDepartmentScopedPage\(params, isDepartmentScoped\), \{ replace \}\);\s*setCurrentPage\(1\);/,
        );
    });

    it('preserves the existing local-only top-level behavior without scope', async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter initialEntries={['/risks?q=alpha']}>
                <Probe />
            </MemoryRouter>,
        );

        await user.click(screen.getByRole('button', { name: 'page-4' }));
        expect(screen.getByTestId('page')).toHaveTextContent('4');
        expect(screen.getByTestId('search')).toHaveTextContent('?q=alpha');
    });
});
