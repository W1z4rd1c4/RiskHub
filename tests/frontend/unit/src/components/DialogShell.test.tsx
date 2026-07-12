import * as axe from 'axe-core';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DialogShell } from '@/components/DialogShell';
import { renderWithoutProviders, screen, userEvent, waitFor } from '@test/render';

/**
 * FR-P2c-2 / FR-P2c-3 (ADR-015 decision 3, spec N14–N15, finding S7).
 *
 * `DialogShell` is the one accessible modal primitive every true dialog /
 * alert-dialog surface is migrated onto. This is the stateful focus + axe
 * matrix required by N10: for BOTH roles it opens the modal, asserts the
 * focus contract (initial focus PER ROLE, Tab trap, Esc-to-close, focus
 * restoration to the opener) and scans the OPEN state for axe violations.
 *
 * This file is the generic-harness proof of the primitive. The per-surface
 * proof — each real migrated dialog / alertdialog component mounted OPEN — lives
 * in `dialogInteractionMatrix.test.tsx`, inventoried at
 * `docs/dora-ict-register/FRONTEND-DIALOG-INTERACTION-INVENTORY.md` (FR-P2c-1).
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoAxeViolations(node: Element | Document = document.body): Promise<void> {
    const results = await axe.run(node as Element, {
        runOnly: { type: 'tag', values: AXE_TAGS },
        // Contrast is theme-token driven and covered by the P1 contrast suite.
        rules: { 'color-contrast': { enabled: false } },
    });
    const summary = results.violations
        .map((v) => `${v.id} (${v.nodes.length}): ${v.help}`)
        .join('\n');
    expect(summary, summary).toBe('');
}

interface HarnessProps {
    role?: 'dialog' | 'alertdialog';
    withInitialFocus?: boolean;
    onClose?: () => void;
}

function DialogHarness({ role, withInitialFocus = false, onClose }: HarnessProps) {
    const [open, setOpen] = useState(false);
    const secondRef = useRef<HTMLButtonElement>(null);
    return (
        <div>
            <button type="button" onClick={() => setOpen(true)}>
                launch
            </button>
            <DialogShell
                isOpen={open}
                onClose={() => {
                    setOpen(false);
                    onClose?.();
                }}
                titleId="dh-title"
                descriptionIds={['dh-desc']}
                role={role}
                initialFocusRef={withInitialFocus ? secondRef : undefined}
                contentClassName="relative w-full max-w-md bg-slate-900 p-6"
            >
                <h2 id="dh-title">Confirm action</h2>
                <p id="dh-desc">This needs your attention.</p>
                <button type="button">first</button>
                <button type="button" ref={secondRef}>
                    second
                </button>
                <button type="button">third</button>
            </DialogShell>
        </div>
    );
}

describe('DialogShell — initial focus per role (FR-P2c-2 / N15)', () => {
    it('role="dialog" (default) focuses the first focusable element', async () => {
        const user = userEvent.setup();
        renderWithoutProviders(<DialogHarness />);
        await user.click(screen.getByRole('button', { name: 'launch' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'first' })).toHaveFocus());
    });

    it('role="alertdialog" focuses the dialog container, not the first (destructive) control', async () => {
        const user = userEvent.setup();
        renderWithoutProviders(<DialogHarness role="alertdialog" />);
        await user.click(screen.getByRole('button', { name: 'launch' }));
        const alertdialog = await screen.findByRole('alertdialog');
        await waitFor(() => expect(alertdialog).toHaveFocus());
        expect(screen.getByRole('button', { name: 'first' })).not.toHaveFocus();
    });

    it('an explicit initialFocusRef still wins for role="alertdialog"', async () => {
        const user = userEvent.setup();
        renderWithoutProviders(<DialogHarness role="alertdialog" withInitialFocus />);
        await user.click(screen.getByRole('button', { name: 'launch' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'second' })).toHaveFocus());
    });
});

describe('DialogShell — focus trap + Esc + restoration (FR-P2c-3 / N10)', () => {
    it('traps Tab from the last focusable back to the first', async () => {
        const user = userEvent.setup();
        renderWithoutProviders(<DialogHarness />);
        await user.click(screen.getByRole('button', { name: 'launch' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'first' })).toHaveFocus());

        await user.click(screen.getByRole('button', { name: 'third' }));
        await user.tab();
        await waitFor(() => expect(screen.getByRole('button', { name: 'first' })).toHaveFocus());
    });

    it('traps Shift+Tab from the first focusable to the last', async () => {
        const user = userEvent.setup();
        renderWithoutProviders(<DialogHarness />);
        await user.click(screen.getByRole('button', { name: 'launch' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'first' })).toHaveFocus());

        await user.click(screen.getByRole('button', { name: 'first' }));
        await user.tab({ shift: true });
        await waitFor(() => expect(screen.getByRole('button', { name: 'third' })).toHaveFocus());
    });

    it('Escape closes the dialog and restores focus to the opener', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        renderWithoutProviders(<DialogHarness onClose={onClose} />);
        const launch = screen.getByRole('button', { name: 'launch' });

        await user.click(launch);
        await waitFor(() => expect(screen.getByRole('button', { name: 'first' })).toHaveFocus());

        await user.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        await waitFor(() => expect(launch).toHaveFocus());
    });

    it('a backdrop click closes the dialog', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        renderWithoutProviders(<DialogHarness onClose={onClose} />);
        await user.click(screen.getByRole('button', { name: 'launch' }));
        await screen.findByRole('dialog');

        const backdrop = document.querySelector('[data-dialog-backdrop="true"]');
        expect(backdrop).not.toBeNull();
        await user.click(backdrop as Element);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

describe('DialogShell — ARIA + stateful axe sweep (N10)', () => {
    it.each(['dialog', 'alertdialog'] as const)(
        'open %s exposes aria-modal + accessible name and has no axe violations',
        async (role) => {
            const user = userEvent.setup();
            renderWithoutProviders(<DialogHarness role={role} />);
            await user.click(screen.getByRole('button', { name: 'launch' }));

            const surface = await screen.findByRole(role);
            expect(surface).toHaveAttribute('aria-modal', 'true');
            expect(surface).toHaveAccessibleName('Confirm action');
            expect(surface).toHaveAttribute('aria-describedby');

            await expectNoAxeViolations(document.body);
        },
    );
});

function NestedHarness() {
    const [outerOpen, setOuterOpen] = useState(false);
    const [innerOpen, setInnerOpen] = useState(false);
    return (
        <div>
            <button type="button" onClick={() => setOuterOpen(true)}>
                launch-outer
            </button>
            <DialogShell isOpen={outerOpen} onClose={() => setOuterOpen(false)} titleId="outer-t">
                <h2 id="outer-t">Outer dialog</h2>
                <button type="button" onClick={() => setInnerOpen(true)}>
                    open-inner
                </button>
                <DialogShell
                    isOpen={innerOpen}
                    onClose={() => setInnerOpen(false)}
                    titleId="inner-t"
                    role="alertdialog"
                >
                    <h2 id="inner-t">Inner alert</h2>
                    <button type="button">inner-ok</button>
                </DialogShell>
            </DialogShell>
        </div>
    );
}

describe('DialogShell — stacked dialogs (Esc peels off the topmost only)', () => {
    it('Escape closes only the focused (inner) dialog, leaving the outer open', async () => {
        const user = userEvent.setup();
        renderWithoutProviders(<NestedHarness />);

        await user.click(screen.getByRole('button', { name: 'launch-outer' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'open-inner' })).toHaveFocus());

        await user.click(screen.getByRole('button', { name: 'open-inner' }));
        const inner = await screen.findByRole('alertdialog');
        await waitFor(() => expect(inner).toHaveFocus());

        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
        // The outer dialog must survive the first Escape.
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        // A second Escape (focus now back in the outer) closes the outer too.
        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
});

describe('ConfirmDialog — real alert-dialog surface on DialogShell', () => {
    it('renders role="alertdialog", is labelled by its title, and Esc closes it', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        renderWithoutProviders(
            <ConfirmDialog
                isOpen
                onClose={onClose}
                onConfirm={() => {}}
                title="Delete department?"
                message="This cannot be undone."
            />,
        );

        const dialog = await screen.findByRole('alertdialog');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(dialog).toHaveAccessibleName('Delete department?');

        await user.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
