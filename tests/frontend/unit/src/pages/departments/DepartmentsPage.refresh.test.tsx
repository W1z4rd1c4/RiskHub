import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DepartmentsPage } from '@/pages/DepartmentsPage';
import { renderWithoutProviders, screen, waitFor } from '@test/render';

/**
 * Audit 2026-09-30 FB-02: the department exposure page refreshes through the
 * shared `RefreshButton` — translated name, `aria-busy` while loading, and no
 * duplicate requests while a fetch is in flight.
 */
const getDepartments = vi.fn();
vi.mock('@/services/departmentApi', () => ({
    departmentApi: { getDepartments: (...args: unknown[]) => getDepartments(...args) },
}));

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((yes) => { resolve = yes; });
    return { promise, resolve };
}

describe('DepartmentsPage refresh', () => {
    beforeEach(() => {
        getDepartments.mockReset();
    });

    it('reports aria-busy while loading, ignores clicks mid-fetch, and refetches when idle', async () => {
        const user = userEvent.setup();
        const first = deferred<unknown[]>();
        getDepartments.mockReturnValueOnce(first.promise).mockResolvedValue([]);
        renderWithoutProviders(
            <MemoryRouter>
                <DepartmentsPage />
            </MemoryRouter>,
        );

        const refresh = screen.getByRole('button', { name: 'Refresh' });
        expect(refresh).toHaveAttribute('aria-busy', 'true');
        await user.click(refresh);
        expect(getDepartments).toHaveBeenCalledTimes(1);

        first.resolve([]);
        await waitFor(() => expect(refresh).toHaveAttribute('aria-busy', 'false'));
        await user.click(refresh);
        await waitFor(() => expect(getDepartments).toHaveBeenCalledTimes(2));
    });
});
