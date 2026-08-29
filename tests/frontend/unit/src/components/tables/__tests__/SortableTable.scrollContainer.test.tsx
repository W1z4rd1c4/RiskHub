import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

function setWidths(element: HTMLElement, clientWidth: number, scrollWidth: number) {
    Object.defineProperties(element, {
        clientWidth: { configurable: true, value: clientWidth },
        scrollWidth: { configurable: true, value: scrollWidth },
    });
}

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('SortableTable horizontal viewport', () => {
    it('updates its named region, Tab eligibility, and continuation cue as overflow changes', () => {
        render(
            <MemoryRouter>
                <SortableTable data={rows} columns={columns} keyExtractor={(row) => row.id} />
            </MemoryRouter>,
        );

        const viewport = screen.getByRole('region', { name: 'Scrollable data table' });
        setWidths(viewport, 500, 500);
        act(() => window.dispatchEvent(new Event('resize')));
        expect(viewport).toHaveAttribute('tabindex', '-1');
        expect(screen.queryByText('More columns to the right')).not.toBeInTheDocument();

        setWidths(viewport, 500, 900);
        act(() => window.dispatchEvent(new Event('resize')));
        expect(viewport).toHaveAttribute('tabindex', '0');
        expect(screen.getByText('More columns to the right')).toBeVisible();

        setWidths(viewport, 500, 500);
        act(() => window.dispatchEvent(new Event('resize')));
        expect(viewport).toHaveAttribute('tabindex', '-1');
        expect(screen.queryByText('More columns to the right')).not.toBeInTheDocument();
    });

    it('scrolls with literal Arrow keys while focused', async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <SortableTable data={rows} columns={columns} keyExtractor={(row) => row.id} />
            </MemoryRouter>,
        );

        const viewport = screen.getByRole('region', { name: 'Scrollable data table' });
        setWidths(viewport, 400, 900);
        act(() => window.dispatchEvent(new Event('resize')));
        viewport.focus();

        await user.keyboard('{ArrowRight}');
        expect(viewport.scrollLeft).toBeGreaterThan(0);

        fireEvent.keyDown(viewport, { key: 'ArrowLeft' });
        expect(viewport.scrollLeft).toBe(0);
    });

    it('localizes the region and continuation cue in Czech', async () => {
        await i18n.changeLanguage('cs');
        render(
            <MemoryRouter>
                <SortableTable data={rows} columns={columns} keyExtractor={(row) => row.id} />
            </MemoryRouter>,
        );

        const viewport = screen.getByRole('region', { name: 'Posuvná datová tabulka' });
        setWidths(viewport, 400, 900);
        act(() => window.dispatchEvent(new Event('resize')));
        expect(screen.getByText('Další sloupce vpravo')).toBeVisible();
    });
});
