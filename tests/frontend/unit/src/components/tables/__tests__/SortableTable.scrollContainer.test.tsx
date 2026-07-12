import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { SortableTable, type Column } from '@/components/tables/SortableTable';
import i18n from '@/i18n';

interface Row {
    id: number;
    name: string;
}

const rows: Row[] = [{ id: 1, name: 'Alpha' }];
const columns: Column<Row>[] = [
    { key: 'name', label: 'Name', render: (row) => <span>{row.name}</span> },
];

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('SortableTable — horizontal scroll container (FR-P5-3)', () => {
    it('wraps the dense table in an overflow-x-auto container so wide columns scroll, not clip', () => {
        const { container } = render(
            <MemoryRouter>
                <SortableTable data={rows} columns={columns} keyExtractor={(row) => row.id} />
            </MemoryRouter>,
        );

        const table = container.querySelector('table');
        expect(table).not.toBeNull();

        // The table is inside an overflow-x-auto scroll container (>= lg horizontal scroll)...
        const scroller = table?.closest('.overflow-x-auto');
        expect(scroller).not.toBeNull();

        // ...whose parent card still clips its rounded corners with overflow-hidden.
        expect(scroller?.parentElement?.className).toContain('overflow-hidden');
    });
});
