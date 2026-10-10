import userEvent from '@testing-library/user-event';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { RegisterFilterCard } from '@/components/ict-register/RegisterFilterCard';
import { buildFacetChip, buildFilterChip, resolveFacetValueLabel } from '@/components/ict-register/registerFilterChips';
import i18n from '@/i18n';
import type { SafeTFunction } from '@/i18n/hooks';
import { renderWithoutProviders, screen } from '@test/render';

const t = ((key: string, options?: Record<string, unknown>) => i18n.t(key, options)) as SafeTFunction;
const departments = [
    { value: '3', label: 'Operations', count: 4, selected: false, disabled: false },
    { value: '4', label: 'Finance', count: 1, selected: false, disabled: false },
];

/** Audit §4.13 / PG-05, GAP-D-22: "Label: value" chips and one added-filter card. */
describe('register filter chips', () => {
    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it('resolves a facet value to its label and falls back to the raw value', () => {
        expect(resolveFacetValueLabel(departments, 3)).toBe('Operations');
        expect(resolveFacetValueLabel(departments, '99')).toBe('99');
        expect(resolveFacetValueLabel(departments, 'open', (value) => `#${value}`)).toBe('#open');
    });

    it.each([
        ['en', 'Department: Finance'],
        ['cs', 'Department: Finance'],
    ] as const)('builds a "Label: value" chip in %s', async (language, expected) => {
        await i18n.changeLanguage(language);
        expect(buildFacetChip(t, 'department_id', 'Department', departments, 4)).toEqual({ key: 'department_id', label: expected });
        expect(buildFilterChip(t, 'status', 'Status', 'Closed').label).toBe('Status: Closed');
    });

    it('renders the added-filter card with a named remove button', async () => {
        const user = userEvent.setup();
        const onRemove = vi.fn();
        renderWithoutProviders(
            <RegisterFilterCard removeLabel="Remove Owner" onRemove={onRemove} data-testid="card">
                <span>control</span>
            </RegisterFilterCard>,
        );
        expect(screen.getByTestId('card').className).toContain('bg-nested');
        await user.click(screen.getByRole('button', { name: 'Remove Owner' }));
        expect(onRemove).toHaveBeenCalledTimes(1);
    });
});
