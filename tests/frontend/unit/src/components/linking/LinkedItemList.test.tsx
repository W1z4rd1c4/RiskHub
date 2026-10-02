import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import '@/i18n';
import { LinkedItemList, LinkedItemRow, LinkRemoveButton } from '@/components/linking/LinkedItemList';

describe('LinkedItemList', () => {
    it('lists rows with their details and actions', () => {
        render(
            <LinkedItemList testId="links">
                <LinkedItemRow actions={<button type="button">Act</button>}>
                    <span>Payroll</span>
                </LinkedItemRow>
                <LinkedItemRow>
                    <span>Billing</span>
                </LinkedItemRow>
            </LinkedItemList>,
        );

        expect(screen.getByTestId('links').tagName).toBe('UL');
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
        expect(screen.getAllByRole('button')).toHaveLength(1);
    });
});

describe('LinkRemoveButton', () => {
    it('is named after the removed record, never "button" or a bare title (AX-01, GAP-C-04)', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(<LinkRemoveButton name="Payroll" onClick={onClick} testId="remove-payroll" />);

        const button = screen.getByRole('button', { name: 'Remove link: Payroll' });
        expect(button).toBe(screen.getByTestId('remove-payroll'));
        await user.click(button);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('stays focusable but inert and explains why when a reason is given', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(<LinkRemoveButton name="Payroll" onClick={onClick} disabledReason="A governed change is pending." />);

        const button = screen.getByRole('button', { name: 'Remove link: Payroll' });
        expect(button).toHaveAttribute('aria-disabled', 'true');
        expect(button).toHaveAttribute('title', 'A governed change is pending.');
        await user.click(button);
        expect(onClick).not.toHaveBeenCalled();
    });

    it('shows a busy, disabled button while the removal is in flight', () => {
        render(<LinkRemoveButton name="Payroll" onClick={vi.fn()} isBusy />);

        const button = screen.getByRole('button', { name: 'Remove link: Payroll' });
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('aria-busy', 'true');
    });

    it('keeps the same button element across idle and busy, so focus can return to it', () => {
        const { rerender } = render(<LinkRemoveButton name="Payroll" onClick={vi.fn()} />);
        const idle = screen.getByRole('button', { name: 'Remove link: Payroll' });

        rerender(<LinkRemoveButton name="Payroll" onClick={vi.fn()} isBusy />);
        expect(screen.getByRole('button', { name: 'Remove link: Payroll' })).toBe(idle);

        rerender(<LinkRemoveButton name="Payroll" onClick={vi.fn()} />);
        const again = screen.getByRole('button', { name: 'Remove link: Payroll' });
        expect(again).toBe(idle);
        expect(again).not.toBeDisabled();
        expect(again.querySelector('svg.lucide-unlink')).not.toBeNull();
    });
});
