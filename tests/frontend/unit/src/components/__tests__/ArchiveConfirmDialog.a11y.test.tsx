import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { HTMLAttributes, ReactNode } from 'react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ArchiveConfirmDialog } from '@/components/ArchiveConfirmDialog';

vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    motion: {
        div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    },
}));

function renderArchiveDialog(overrides: Partial<Parameters<typeof ArchiveConfirmDialog>[0]> = {}) {
    const props = {
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(async () => undefined),
        resourceType: 'control' as const,
        resourceName: 'Quarterly access review',
        ...overrides,
    };

    const result = render(<ArchiveConfirmDialog {...props} />);
    return { ...result, props };
}

function ControlledArchiveDialog({ onClose }: { onClose: () => void }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button type="button" onClick={() => setIsOpen(true)}>
                Open archive confirmation
            </button>
            <ArchiveConfirmDialog
                isOpen={isOpen}
                onClose={() => {
                    setIsOpen(false);
                    onClose();
                }}
                onConfirm={vi.fn(async () => undefined)}
                resourceType="control"
                resourceName="Quarterly access review"
            />
        </>
    );
}

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((resolver) => {
        resolve = resolver;
    });
    return { promise, resolve };
}

describe('ArchiveConfirmDialog accessibility', () => {
    it('renders through a portal as a labelled modal dialog that describes the archive context and exposes reason validation', async () => {
        const user = userEvent.setup();
        const { container, props } = renderArchiveDialog();

        expect(container.firstChild).toBeNull();

        const dialog = screen.getByRole('dialog', { name: 'Archive Control' });
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(dialog).toHaveAccessibleDescription(/This action can be undone by an administrator\./);
        expect(dialog).toHaveAccessibleDescription(/Quarterly access review/);
        expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();

        const reasonInput = within(dialog).getByRole('textbox', { name: /Reason for Archiving/ });
        const archiveButton = within(dialog).getByRole('button', { name: 'Archive' });

        await waitFor(() => expect(reasonInput).toHaveFocus());

        expect(archiveButton).toBeDisabled();
        await user.type(reasonInput, '   ');
        expect(archiveButton).toBeDisabled();

        await user.clear(reasonInput);
        await user.type(reasonInput, 'Superseded by new quarterly control.');
        expect(archiveButton).toBeEnabled();

        const backdrop = document.body.querySelector('[data-dialog-backdrop]');
        expect(backdrop).toBeInTheDocument();
        await user.click(backdrop as Element);
        expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('traps focus, closes with Escape, and restores opener focus', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(<ControlledArchiveDialog onClose={onClose} />);

        const opener = screen.getByRole('button', { name: 'Open archive confirmation' });
        await user.click(opener);

        const dialog = screen.getByRole('dialog', { name: 'Archive Control' });
        const closeButton = within(dialog).getByRole('button', { name: 'Close' });
        const archiveButton = within(dialog).getByRole('button', { name: 'Archive' });
        const reasonInput = within(dialog).getByRole('textbox', { name: /Reason for Archiving/ });

        await waitFor(() => expect(reasonInput).toHaveFocus());

        await user.type(reasonInput, 'Retired control');
        archiveButton.focus();
        await user.tab();
        expect(closeButton).toHaveFocus();

        await user.tab({ shift: true });
        expect(archiveButton).toHaveFocus();

        await user.keyboard('{Escape}');

        expect(onClose).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(opener).toHaveFocus());
        expect(screen.queryByRole('dialog', { name: 'Archive Control' })).not.toBeInTheDocument();
    });

    it('keeps close semantics disabled while archive submission is loading', async () => {
        const user = userEvent.setup();
        const pendingSubmit = deferred();
        const { props } = renderArchiveDialog({
            onConfirm: vi.fn(() => pendingSubmit.promise),
        });

        const dialog = screen.getByRole('dialog', { name: 'Archive Control' });
        await user.type(within(dialog).getByRole('textbox', { name: /Reason for Archiving/ }), 'Retired control');
        await user.click(within(dialog).getByRole('button', { name: 'Archive' }));

        await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled());
        expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();

        await user.keyboard('{Escape}');
        expect(props.onClose).not.toHaveBeenCalled();

        const backdrop = document.body.querySelector('[data-dialog-backdrop]');
        expect(backdrop).toBeInTheDocument();
        await user.click(backdrop as Element);
        expect(props.onClose).not.toHaveBeenCalled();

        pendingSubmit.resolve();
    });

    it('describes validation errors from the same dialog body', async () => {
        renderArchiveDialog();

        const dialog = screen.getByRole('dialog', { name: 'Archive Control' });
        const reasonInput = within(dialog).getByRole('textbox', { name: /Reason for Archiving/ });

        fireEvent.submit(reasonInput.closest('form') as HTMLFormElement);

        const error = await within(dialog).findByText('This field is required.');
        expect(error).toBeInTheDocument();
        expect(dialog).toHaveAccessibleDescription(/This field is required\./);
    });
});
