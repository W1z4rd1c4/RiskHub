import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RowRestoreButton } from '@/components/tables/RowRestoreButton';
import { renderWithoutProviders, screen } from '@test/render';

/** Audit §4.7 / PG-28: one row "restore from archive" action with the shared vocabulary. */
describe('RowRestoreButton', () => {
    it('is a named icon-only row action that never activates the row', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        const onRowClick = vi.fn();
        renderWithoutProviders(
            <table>
                <tbody>
                    <tr onClick={onRowClick}>
                        <td><RowRestoreButton itemName="Liquidity risk" onClick={onClick} data-testid="restore" /></td>
                    </tr>
                </tbody>
            </table>,
        );

        const restore = screen.getByRole('button', { name: 'Restore Liquidity risk' });
        expect(restore).toHaveAttribute('data-testid', 'restore');
        expect(restore).toHaveAttribute('type', 'button');
        await user.click(restore);
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(onRowClick).not.toHaveBeenCalled();
    });

    it('falls back to the plain "Restore" name', () => {
        renderWithoutProviders(<RowRestoreButton onClick={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    });
});
