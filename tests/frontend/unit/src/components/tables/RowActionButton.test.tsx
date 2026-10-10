import type { ReactElement, SVGProps } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RowActionButton } from '@/components/tables';
import { renderWithoutProviders, screen } from '@test/render';

/**
 * Audit 2026-09-30 §4.7 / §4.13 (GAP-B-03): icon-only row actions carry a
 * required name, a tooltip, and a disabled reason instead of being hidden or
 * generically disabled. Row actions never trigger row activation.
 */

// lucide-react is not resolvable from the external test root; a stub icon
// with the same props contract is enough for these behaviour assertions.
const Pencil = (props: SVGProps<SVGSVGElement>) => <svg {...props} />;
const Trash2 = (props: SVGProps<SVGSVGElement>) => <svg {...props} />;

function renderInRow(ui: ReactElement, rowHandlers: { onClick?: () => void; onKeyDown?: () => void } = {}) {
    return renderWithoutProviders(
        <table>
            <tbody>
                <tr onClick={rowHandlers.onClick} onKeyDown={rowHandlers.onKeyDown}>
                    <td>{ui}</td>
                </tr>
            </tbody>
        </table>,
    );
}

describe('RowActionButton', () => {
    it('is an icon-only button named by its label with a matching tooltip', () => {
        renderInRow(<RowActionButton icon={Pencil} label="Edit Credit risk" onClick={vi.fn()} />);
        const button = screen.getByRole('button', { name: 'Edit Credit risk' });
        expect(button).toHaveAttribute('type', 'button');
        expect(button).toHaveAttribute('title', 'Edit Credit risk');
        expect(button).toHaveTextContent('');
        expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
        expect(button.className.split(/\s+/)).toContain('h-8');
    });

    it('runs the action on click, Enter and Space without activating the row', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        const onRowClick = vi.fn();
        const onRowKeyDown = vi.fn();
        renderInRow(<RowActionButton icon={Pencil} label="Edit" onClick={onClick} />, {
            onClick: onRowClick,
            onKeyDown: onRowKeyDown,
        });
        const button = screen.getByRole('button', { name: 'Edit' });

        await user.click(button);
        button.focus();
        await user.keyboard('{Enter}');
        await user.keyboard(' ');

        expect(onClick).toHaveBeenCalledTimes(3);
        expect(onRowClick).not.toHaveBeenCalled();
        expect(onRowKeyDown).not.toHaveBeenCalled();
    });

    it('stays focusable but inert with a disabledReason, exposed as tooltip and description', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        const onRowClick = vi.fn();
        renderInRow(
            <RowActionButton
                icon={Pencil}
                label="Edit Admin"
                onClick={onClick}
                disabledReason="You cannot edit the Admin role"
            />,
            { onClick: onRowClick },
        );
        const button = screen.getByRole('button', { name: 'Edit Admin' });

        expect(button).toHaveAttribute('aria-disabled', 'true');
        expect(button).not.toBeDisabled();
        expect(button).toHaveAttribute('title', 'You cannot edit the Admin role');
        expect(button).toHaveAccessibleDescription('You cannot edit the Admin role');

        await user.tab();
        expect(button).toHaveFocus();
        await user.keyboard('{Enter}');
        await user.click(button);
        expect(onClick).not.toHaveBeenCalled();
        expect(onRowClick).not.toHaveBeenCalled();
    });

    it('marks destructive row actions with the danger tone', () => {
        renderInRow(<RowActionButton icon={Trash2} label="Delete" tone="danger" onClick={vi.fn()} />);
        const cls = screen.getByRole('button', { name: 'Delete' }).className.split(/\s+/);
        expect(cls).toContain('hover:text-destructive');
        expect(cls).toContain('hover:bg-destructive/10');
    });
});
