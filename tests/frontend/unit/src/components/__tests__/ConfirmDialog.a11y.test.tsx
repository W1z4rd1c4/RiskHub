import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { HTMLAttributes, ReactNode } from 'react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '@/components/ConfirmDialog';

vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    motion: {
        div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    },
}));

function renderConfirmDialog(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
    const props = {
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        title: 'Delete control evidence',
        message: 'This removes the uploaded evidence from the control.',
        confirmLabel: 'Delete evidence',
        cancelLabel: 'Keep evidence',
        ...overrides,
    };

    const result = render(<ConfirmDialog {...props} />);
    return { ...result, props };
}

function ControlledConfirmDialog({ onClose }: { onClose: () => void }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button type="button" onClick={() => setIsOpen(true)}>
                Open delete confirmation
            </button>
            <ConfirmDialog
                isOpen={isOpen}
                onClose={() => {
                    setIsOpen(false);
                    onClose();
                }}
                onConfirm={vi.fn()}
                title="Delete control evidence"
                message="This removes the uploaded evidence from the control."
                confirmLabel="Delete evidence"
                cancelLabel="Keep evidence"
            />
        </>
    );
}

describe('ConfirmDialog accessibility', () => {
    it('renders through a portal as a labelled modal dialog with a described body, accessible close button, and backdrop close', async () => {
        const user = userEvent.setup();
        const { container, props } = renderConfirmDialog();

        expect(container.firstChild).toBeNull();

        const dialog = screen.getByRole('dialog', { name: 'Delete control evidence' });
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(dialog).toHaveAccessibleDescription('This removes the uploaded evidence from the control.');
        expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();

        const backdrop = document.body.querySelector('[data-dialog-backdrop]');
        expect(backdrop).toBeInTheDocument();
        await user.click(backdrop as Element);
        expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('moves initial focus into the dialog, traps Tab and Shift+Tab, closes with Escape, and restores opener focus', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(<ControlledConfirmDialog onClose={onClose} />);

        const opener = screen.getByRole('button', { name: 'Open delete confirmation' });
        await user.click(opener);

        const dialog = screen.getByRole('dialog', { name: 'Delete control evidence' });
        const closeButton = within(dialog).getByRole('button', { name: 'Close' });
        const confirmButton = within(dialog).getByRole('button', { name: 'Delete evidence' });

        await waitFor(() => expect(confirmButton).toHaveFocus());

        await user.tab();
        expect(closeButton).toHaveFocus();

        await user.tab({ shift: true });
        expect(confirmButton).toHaveFocus();

        await user.keyboard('{Escape}');

        expect(onClose).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(opener).toHaveFocus());
        expect(screen.queryByRole('dialog', { name: 'Delete control evidence' })).not.toBeInTheDocument();
    });

    it('keeps every close path disabled while loading', async () => {
        const user = userEvent.setup();
        const { props } = renderConfirmDialog({ isLoading: true });

        const dialog = screen.getByRole('dialog', { name: 'Delete control evidence' });
        expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled();
        expect(within(dialog).getByRole('button', { name: 'Keep evidence' })).toBeDisabled();

        await user.keyboard('{Escape}');
        expect(props.onClose).not.toHaveBeenCalled();

        const backdrop = document.body.querySelector('[data-dialog-backdrop]');
        expect(backdrop).toBeInTheDocument();
        await user.click(backdrop as Element);
        expect(props.onClose).not.toHaveBeenCalled();
    });
});
