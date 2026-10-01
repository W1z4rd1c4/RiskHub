import userEvent from '@testing-library/user-event';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { Table, TableRowButton, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import i18n from '@/i18n';
import { renderWithoutProviders, screen, within } from '@test/render';

/**
 * Audit 2026-09-30 §4.13 / roadmap 1.9 (D14, DS-11, GAP-D-10, AX-02): the static
 * table primitives share SortableTable's header recipe and scroll container;
 * sortable headers are buttons with `aria-sort` on the `th`; the row button is
 * a named, keyboard-native activation target that never bubbles to the row.
 */

describe('Table primitives', () => {
    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it('wraps the table in a named scroll region and applies the D14 recipes', () => {
        renderWithoutProviders(
            <Table regionLabel="Departments">
                <THead>
                    <TR>
                        <TH>Name</TH>
                        <TH align="right">Count</TH>
                    </TR>
                </THead>
                <TBody>
                    <TR>
                        <TD>Alpha</TD>
                        <TD align="right">3</TD>
                    </TR>
                </TBody>
            </Table>,
        );
        const region = screen.getByRole('region', { name: 'Departments' });
        const table = within(region).getByRole('table');
        expect(table.parentElement).toBe(region);
        expect(region).toHaveClass('w-full', 'overflow-x-auto');

        const name = screen.getByRole('columnheader', { name: 'Name' });
        expect(name).toHaveAttribute('scope', 'col');
        expect(name).toHaveClass('px-6', 'py-4', 'text-left', 'text-xs', 'font-bold', 'uppercase', 'tracking-wider', 'text-muted-foreground');
        expect(name).not.toHaveAttribute('aria-sort');
        expect(screen.getByRole('columnheader', { name: 'Count' })).toHaveClass('text-right');

        const [headerRow, bodyRow] = screen.getAllByRole('row');
        expect(headerRow).toHaveClass('border-b', 'border-border');
        expect(bodyRow).toHaveClass('hover:bg-tint/5');
        expect(bodyRow.parentElement).toHaveClass('divide-y', 'divide-border');
        expect(screen.getByRole('cell', { name: 'Alpha' })).toHaveClass('px-6', 'py-4');
    });

    it('defaults the region name and uses compact padding when asked', async () => {
        await i18n.changeLanguage('cs');
        renderWithoutProviders(
            <Table density="compact">
                <TBody>
                    <TR>
                        <TD>Alpha</TD>
                    </TR>
                </TBody>
            </Table>,
        );
        expect(screen.getByRole('region', { name: 'Posuvná datová tabulka' })).toBeInTheDocument();
        expect(screen.getByRole('cell', { name: 'Alpha' })).toHaveClass('px-4', 'py-3');
        await i18n.changeLanguage('en');
    });

    it('renders sortable headers as buttons with aria-sort on the th', async () => {
        const user = userEvent.setup();
        const onSort = vi.fn();
        renderWithoutProviders(
            <Table>
                <THead>
                    <TR>
                        <TH onSort={onSort} sortDirection="asc">Name</TH>
                        <TH onSort={vi.fn()} sortDirection="desc">Score</TH>
                        <TH onSort={vi.fn()}>Owner</TH>
                    </TR>
                </THead>
            </Table>,
        );
        expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'ascending');
        expect(screen.getByRole('columnheader', { name: 'Score' })).toHaveAttribute('aria-sort', 'descending');
        expect(screen.getByRole('columnheader', { name: 'Owner' })).toHaveAttribute('aria-sort', 'none');

        const button = within(screen.getByRole('columnheader', { name: 'Name' })).getByRole('button', { name: 'Name' });
        expect(button).toHaveAttribute('type', 'button');
        expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
        button.focus();
        await user.keyboard('{Enter}');
        await user.keyboard(' ');
        expect(onSort).toHaveBeenCalledTimes(2);
    });

    it('names the row button from its content plus srLabel and stops row bubbling', async () => {
        const user = userEvent.setup();
        const onActivate = vi.fn();
        const onRowClick = vi.fn();
        renderWithoutProviders(
            <Table>
                <TBody>
                    <TR onClick={onRowClick}>
                        <TD>
                            <TableRowButton onClick={onActivate} srLabel="Open questionnaire">
                                Submitted
                            </TableRowButton>
                        </TD>
                    </TR>
                </TBody>
            </Table>,
        );
        const button = screen.getByRole('button', { name: 'Submitted Open questionnaire' });
        expect(button).toHaveAttribute('type', 'button');
        await user.tab();
        expect(button).toHaveFocus();
        await user.keyboard('{Enter}');
        await user.keyboard(' ');
        await user.click(button);
        expect(onActivate).toHaveBeenCalledTimes(3);
        expect(onRowClick).not.toHaveBeenCalled();
    });
});
