import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';
import { ControlRegisterFilterBar } from '@/pages/controls/ControlRegisterFilterBar';
import { EMPTY_CONTROL_REGISTER_FILTERS } from '@/pages/controls/controlRegisterConfig';

const facets = {
    status: [
        { value: 'draft', label: 'draft', count: 2, selected: false, disabled: false },
        { value: 'inactive', label: 'inactive', count: 1, selected: true, disabled: false },
    ],
    process: [
        { value: 'Payments API', label: 'Payments API', count: 3, selected: true, disabled: false },
    ],
    category: [
        { value: 'ICT operations', label: 'ICT operations', count: 4, selected: true, disabled: false },
    ],
};

describe('ControlRegisterFilterBar domain-status localization', () => {
    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it.each([
        ['en', 'Status: Inactive', 'Draft (2)'],
        ['cs', 'Stav: Neaktivní', 'Návrh (2)'],
    ] as const)('localizes canonical status chips and options in %s', async (
        language,
        statusChip,
        draftOption,
    ) => {
        await i18n.changeLanguage(language);
        const user = userEvent.setup();

        render(
            <ControlRegisterFilterBar
                facets={facets}
                filters={{
                    ...EMPTY_CONTROL_REGISTER_FILTERS,
                    status: 'inactive',
                    process: 'Payments API',
                    category: 'ICT operations',
                }}
                isLoading={false}
                onClearAll={vi.fn()}
                onFilterChange={vi.fn()}
                onRefresh={vi.fn()}
                onSearchChange={vi.fn()}
                search=""
            />,
        );

        expect(screen.getByTestId('controls-filter-chip-status')).toHaveTextContent(statusChip);
        expect(screen.getByTestId('controls-filter-chip-process')).toHaveTextContent('Payments API');
        expect(screen.getByTestId('controls-filter-chip-category')).toHaveTextContent('ICT operations');

        await user.click(screen.getByRole('combobox', { name: language === 'cs' ? 'Stav' : 'Status' }));
        expect(screen.getByRole('option', { name: draftOption })).toBeInTheDocument();
    });
});
