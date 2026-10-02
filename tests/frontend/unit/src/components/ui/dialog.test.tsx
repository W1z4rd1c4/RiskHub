import { useRef, useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
    DialogBody,
    DialogFooter,
    DialogHeader,
    DialogShell,
    type DialogDirtyGuard,
    type DialogShellProps,
} from '@/components/ui/dialog';
import { renderWithoutProviders, screen, userEvent, waitFor, within } from '@test/render';

/**
 * Audit 2026-09-30 §4.11 / roadmap 1.7 (D5, DS-07, DS-08, PG-22): DialogShell v2.
 * Focus semantics shared with v1 stay proven by `DialogShell.test.tsx`; this
 * suite covers the v2 surface, sizes, sub-components, close guards and the
 * deprecated class-prop passthrough that keeps unmigrated dialogs unchanged (O4).
 */

type ShellOverrides = Partial<Omit<DialogShellProps, 'children'>>;

function V2Dialog({
    shell = {},
    footer,
    onClose = () => {},
}: {
    shell?: ShellOverrides;
    footer?: ReactNode;
    onClose?: () => void;
}) {
    const [open, setOpen] = useState(false);
    return (
        <div>
            <button type="button" onClick={() => setOpen(true)}>launch</button>
            <DialogShell
                isOpen={open}
                onClose={() => {
                    setOpen(false);
                    onClose();
                }}
                titleId="v2-title"
                descriptionIds={['v2-desc']}
                {...shell}
            >
                <DialogHeader title="Edit owner" description="Changes are audited." descriptionId="v2-desc" />
                <DialogBody>
                    <label htmlFor="v2-field">Owner</label>
                    <input id="v2-field" />
                </DialogBody>
                {footer ?? <DialogFooter submitLabel="Save" onSubmit={() => {}} />}
            </DialogShell>
        </div>
    );
}

async function openDialog(ui: ReactNode) {
    const user = userEvent.setup();
    renderWithoutProviders(ui);
    const launch = screen.getByRole('button', { name: 'launch' });
    launch.focus();
    await user.click(launch);
    const dialog = await screen.findByRole('dialog');
    return { user, dialog, launch };
}

function backdrop() {
    const element = document.body.querySelector('[data-dialog-backdrop]');
    expect(element).toBeInTheDocument();
    return element as HTMLElement;
}

describe('DialogShell v2 — themed surface and sizes', () => {
    it('renders the fixed themed surface, token backdrop and z-modal container by default', async () => {
        const { dialog } = await openDialog(<V2Dialog />);

        for (const token of ['bg-popover', 'text-popover-foreground', 'border-border', 'shadow-popover', 'rounded-2xl', 'max-w-md']) {
            expect(dialog.className.split(/\s+/)).toContain(token);
        }
        // Dialogs never paint raw palette or white/black alpha surfaces (D5).
        expect(dialog.className).not.toMatch(/\b(?:bg|border)-(?:slate|gray|black|white)\b|glass-card/);
        expect(backdrop()).toHaveClass('bg-overlay', 'backdrop-blur-sm');
        expect(backdrop().parentElement).toHaveClass('fixed', 'inset-0', 'z-modal');
    });

    it.each([
        ['sm', 'max-w-sm'],
        ['md', 'max-w-md'],
        ['lg', 'max-w-2xl'],
        ['xl', 'max-w-4xl'],
        ['2xl', 'max-w-6xl'],
    ] as const)('size="%s" maps to %s', async (size, widthClass) => {
        const { dialog } = await openDialog(<V2Dialog shell={{ size }} />);
        expect(dialog).toHaveClass(widthClass);
    });

    it('merges layout-only className with cn so a later width wins', async () => {
        const { dialog } = await openDialog(<V2Dialog shell={{ size: 'md', className: 'max-w-lg min-h-[20rem]' }} />);
        expect(dialog).toHaveClass('max-w-lg', 'min-h-[20rem]', 'bg-popover');
        expect(dialog).not.toHaveClass('max-w-md');
    });

    it('owns every layer: the container, the bg-overlay backdrop and the themed surface (roadmap 4.3)', async () => {
        const { dialog } = await openDialog(<V2Dialog shell={{ size: 'lg' }} />);
        expect(dialog).toHaveClass('relative', 'bg-popover', 'max-w-2xl');
        expect(backdrop()).toHaveClass('bg-overlay');
        expect(backdrop().parentElement).toHaveClass('fixed', 'inset-0', 'z-modal');
    });

    it('attaches the sub-components to the primitive', () => {
        expect(DialogShell.Header).toBe(DialogHeader);
        expect(DialogShell.Body).toBe(DialogBody);
        expect(DialogShell.Footer).toBe(DialogFooter);
    });
});

describe('DialogShell v2 — Header / Body / Footer', () => {
    it('labels the dialog from the h2 the header renders with the shell title id', async () => {
        const { dialog } = await openDialog(<V2Dialog />);

        expect(dialog).toHaveAccessibleName('Edit owner');
        expect(dialog).toHaveAccessibleDescription('Changes are audited.');
        const heading = within(dialog).getByRole('heading', { level: 2, name: 'Edit owner' });
        expect(heading).toHaveAttribute('id', 'v2-title');
        expect(document.querySelectorAll('#v2-title')).toHaveLength(1);
    });

    it('orders the footer Cancel then the primary action, right-aligned', async () => {
        const { dialog } = await openDialog(<V2Dialog footer={<DialogFooter submitLabel="Save" intent="destructive" />} />);

        const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
        const save = within(dialog).getByRole('button', { name: 'Save' });
        expect(cancel.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(cancel.parentElement).toHaveClass('justify-end', 'border-t', 'border-border');
        expect(save).toHaveClass('bg-destructive', 'text-destructive-foreground');
        expect(save.parentElement?.lastElementChild).toBe(save);
    });

    it('closes from the header close button and the footer cancel through the shell', async () => {
        const onClose = vi.fn();
        const { user, dialog } = await openDialog(<V2Dialog onClose={onClose} />);

        await user.click(within(dialog).getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'launch' }));
        await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('traps Tab inside the dialog and restores focus to the opener on Escape', async () => {
        const { user, dialog, launch } = await openDialog(<V2Dialog />);

        const close = within(dialog).getByRole('button', { name: 'Close' });
        const save = within(dialog).getByRole('button', { name: 'Save' });
        await waitFor(() => expect(close).toHaveFocus());

        save.focus();
        await user.tab();
        expect(close).toHaveFocus();
        await user.tab({ shift: true });
        expect(save).toHaveFocus();

        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        await waitFor(() => expect(launch).toHaveFocus());
    });
});

describe('DialogShell v2 — close guards (PG-22)', () => {
    it('isBusy marks the surface busy and blocks Escape, backdrop, header close and cancel', async () => {
        const onClose = vi.fn();
        const { user, dialog } = await openDialog(<V2Dialog shell={{ isBusy: true }} onClose={onClose} />);

        expect(dialog).toHaveAttribute('aria-busy', 'true');
        expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled();
        expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
        expect(within(dialog).getByRole('button', { name: 'Save' })).toHaveAttribute('aria-busy', 'true');

        await user.keyboard('{Escape}');
        await user.click(backdrop());
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('closeDisabled blocks closing without marking the surface busy', async () => {
        const onClose = vi.fn();
        const { user, dialog } = await openDialog(<V2Dialog shell={{ closeDisabled: true }} onClose={onClose} />);

        expect(dialog).not.toHaveAttribute('aria-busy');
        await user.keyboard('{Escape}');
        await user.click(backdrop());
        expect(onClose).not.toHaveBeenCalled();
    });

    it('routes every close request through the dirty guard and renders its confirmation', async () => {
        const onClose = vi.fn();
        const requestLocalLeave = vi.fn();
        const dirtyGuard: DialogDirtyGuard = {
            requestLocalLeave,
            confirmationDialog: <p>unsaved-changes-confirmation</p>,
        };
        const { user, dialog } = await openDialog(<V2Dialog shell={{ dirtyGuard }} onClose={onClose} />);

        expect(screen.getByText('unsaved-changes-confirmation')).toBeInTheDocument();

        await user.keyboard('{Escape}');
        await user.click(backdrop());
        await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        expect(requestLocalLeave).toHaveBeenCalledTimes(3);
        expect(onClose).not.toHaveBeenCalled();

        // The guard decides: leaving runs the shell's onClose.
        const leave = requestLocalLeave.mock.calls[0][0] as () => void;
        leave();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('focuses the requested initial element', async () => {
        function InitialFocusDialog() {
            const [open, setOpen] = useState(false);
            const saveRef = useRef<HTMLButtonElement>(null);
            return (
                <>
                    <button type="button" onClick={() => setOpen(true)}>launch</button>
                    <DialogShell isOpen={open} onClose={() => setOpen(false)} titleId="focus-title" initialFocusRef={saveRef} role="alertdialog">
                        <DialogHeader title="Confirm" />
                        <DialogFooter submitLabel="Save" submitRef={saveRef} />
                    </DialogShell>
                </>
            );
        }
        const user = userEvent.setup();
        renderWithoutProviders(<InitialFocusDialog />);
        await user.click(screen.getByRole('button', { name: 'launch' }));
        const dialog = await screen.findByRole('alertdialog', { name: 'Confirm' });
        await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Save' })).toHaveFocus());
    });
});
