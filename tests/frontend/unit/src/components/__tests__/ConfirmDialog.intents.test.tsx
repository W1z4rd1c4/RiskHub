import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { resolveConfirmCopy } from '@/components/confirmDialogCopy';
import i18n from '@/i18n';
import type { SafeTFunction } from '@/i18n/hooks';

/**
 * Audit 2026-09-30 §4.11 / roadmap 1.7 (D10, PG-07, PG-22, PM-1): ConfirmDialog
 * intents, reason policy, count-aware copy, busy guard and in-dialog errors.
 */

type Props = Parameters<typeof ConfirmDialog>[0];

function renderConfirm(overrides: Partial<Props> = {}) {
    const props: Props = {
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        ...overrides,
    };
    render(<ConfirmDialog {...props} />);
    return { props, dialog: screen.getByRole('alertdialog') };
}

function deferred() {
    let resolve!: () => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function fixedT(lng: 'en' | 'cs'): SafeTFunction {
    return i18n.getFixedT(lng, 'common') as unknown as SafeTFunction;
}

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('ConfirmDialog intents (D10)', () => {
    it('archive: Archive icon and wording, never Trash2 or "Delete"', () => {
        const { dialog } = renderConfirm({ intent: 'archive', entityLabel: 'Control', entityName: 'Access review' });

        expect(dialog).toHaveAccessibleName('Archive Control?');
        expect(dialog).toHaveAccessibleDescription(/can be undone/);
        expect(dialog).toHaveAccessibleDescription(/Access review/);
        expect(within(dialog).getByRole('button', { name: 'Archive' })).toHaveClass('bg-destructive');
        expect(dialog.querySelector('svg.lucide-archive')).toBeInTheDocument();
        expect(dialog.querySelector('svg.lucide-trash-2, svg.lucide-trash')).not.toBeInTheDocument();
        expect(dialog).not.toHaveTextContent(/delete/i);
    });

    it('delete: Trash2 for the irreversible action', () => {
        const { dialog } = renderConfirm({ intent: 'delete', entityLabel: 'Department' });

        expect(dialog).toHaveAccessibleName('Delete Department?');
        expect(dialog).toHaveAccessibleDescription('This cannot be undone.');
        expect(dialog.querySelector('svg.lucide-trash-2')).toBeInTheDocument();
        expect(within(dialog).getByRole('button', { name: 'Delete' })).toHaveClass('bg-destructive');
    });

    it('unlink: Unlink icon and "Remove link", naming the linked record in the title', () => {
        const { dialog } = renderConfirm({ intent: 'unlink', entityName: 'Payments platform' });

        expect(dialog).toHaveAccessibleName('Remove link to Payments platform?');
        expect(dialog).toHaveAccessibleDescription(/linked record itself is not deleted/);
        expect(dialog.querySelector('svg.lucide-unlink')).toBeInTheDocument();
        expect(within(dialog).getByRole('button', { name: 'Remove link' })).toBeInTheDocument();
        expect(dialog.querySelector('svg.lucide-trash-2')).not.toBeInTheDocument();
    });

    it('send: Send icon, accent primary action and a count-aware title', () => {
        const { dialog } = renderConfirm({ intent: 'send', count: 3 });

        expect(dialog).toHaveAccessibleName('Send 3 items?');
        expect(dialog.querySelector('svg.lucide-send')).toBeInTheDocument();
        expect(within(dialog).getByRole('button', { name: 'Send' })).toHaveClass('bg-accent', 'text-accent-foreground');
    });

    it('discard: warning action with the dirty-guard copy', () => {
        const { dialog } = renderConfirm({ intent: 'discard' });

        expect(dialog).toHaveAccessibleName('Discard unsaved changes?');
        expect(within(dialog).getByRole('button', { name: 'Discard' })).toHaveClass('bg-warning');
    });

    it('caller copy overrides the intent defaults', () => {
        const { dialog } = renderConfirm({
            intent: 'archive',
            title: 'Archive vendor contract?',
            message: 'The contract stays in the register history.',
            confirmLabel: 'Archive contract',
        });

        expect(dialog).toHaveAccessibleName('Archive vendor contract?');
        expect(dialog).toHaveAccessibleDescription('The contract stays in the register history.');
        expect(within(dialog).getByRole('button', { name: 'Archive contract' })).toBeInTheDocument();
    });
});

describe('ConfirmDialog count-aware plural copy', () => {
    it.each([
        [1, 'Archive 1 item?'],
        [2, 'Archive 2 items?'],
        [5, 'Archive 5 items?'],
    ])('en: count %i → %s', (count, expected) => {
        expect(resolveConfirmCopy(fixedT('en'), { intent: 'archive', count }).title).toBe(expected);
    });

    it.each([
        ['archive', 1, 'Archivovat 1 položku?'],
        ['archive', 3, 'Archivovat 3 položky?'],
        ['archive', 5, 'Archivovat 5 položek?'],
        ['delete', 4, 'Smazat 4 položky?'],
        ['send', 1, 'Odeslat 1 položku?'],
        ['send', 12, 'Odeslat 12 položek?'],
        ['unlink', 2, 'Odebrat 2 propojení?'],
    ] as const)('cs: %s count %i → %s', (intent, count, expected) => {
        expect(resolveConfirmCopy(fixedT('cs'), { intent, count }).title).toBe(expected);
    });

    it('renders Czech intent copy when the language is cs', async () => {
        await i18n.changeLanguage('cs');
        const { dialog } = renderConfirm({ intent: 'archive', count: 3, reason: 'optional' });

        expect(dialog).toHaveAccessibleName('Archivovat 3 položky?');
        expect(within(dialog).getByRole('button', { name: 'Archivovat' })).toBeInTheDocument();
        expect(within(dialog).getByText(/nepovinné/)).toBeInTheDocument();
    });
});

describe('ConfirmDialog reason policy (PM-1)', () => {
    it('reason="none" renders no reason field and confirms without a value', async () => {
        const user = userEvent.setup();
        const { dialog, props } = renderConfirm({ intent: 'delete' });

        expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
        await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
        expect(props.onConfirm).toHaveBeenCalledWith(undefined);
    });

    it('reason="required" blocks confirmation until a non-blank reason is entered', async () => {
        const user = userEvent.setup();
        const { dialog, props } = renderConfirm({ intent: 'archive', reason: 'required' });

        const reason = within(dialog).getByRole('textbox', { name: /Reason for Archiving/ });
        const archive = within(dialog).getByRole('button', { name: 'Archive' });
        expect(reason).toHaveAttribute('aria-required', 'true');
        expect(archive).toBeDisabled();

        await user.type(reason, '   ');
        expect(archive).toBeDisabled();

        fireEvent.submit(archive.closest('form') as HTMLFormElement);
        const validation = await within(dialog).findByRole('alert');
        expect(validation).toHaveTextContent('This field is required.');
        expect(reason).toHaveAttribute('aria-invalid', 'true');
        expect(reason).toHaveAccessibleDescription('This field is required.');
        expect(props.onConfirm).not.toHaveBeenCalled();

        await user.type(reason, 'Superseded');
        expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
        await user.click(archive);
        expect(props.onConfirm).toHaveBeenCalledWith('   Superseded');
    });

    it('reason="optional" marks the field optional and allows an empty reason', async () => {
        const user = userEvent.setup();
        const { dialog, props } = renderConfirm({ intent: 'archive', reason: 'optional' });

        expect(within(dialog).getByRole('textbox', { name: /Reason for Archiving.*\(optional\)/ })).toBeInTheDocument();
        await user.click(within(dialog).getByRole('button', { name: 'Archive' }));
        expect(props.onConfirm).toHaveBeenCalledWith('');
    });

    it('keeps the deprecated showInput / inputRequired props working', () => {
        const { dialog } = renderConfirm({ title: 'Legacy', message: 'Legacy body', showInput: true, inputRequired: false, inputLabel: 'Request reason' });
        expect(within(dialog).getByRole('textbox', { name: /Request reason/ })).toBeInTheDocument();
        expect(within(dialog).getByRole('button', { name: 'Confirm' })).toBeEnabled();
    });
});

describe('ConfirmDialog busy state and in-dialog errors', () => {
    it('stays busy while the returned promise is pending: Escape, backdrop and cancel are blocked', async () => {
        const user = userEvent.setup();
        const pending = deferred();
        const { dialog, props } = renderConfirm({ intent: 'delete', onConfirm: vi.fn(() => pending.promise) });

        await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

        await waitFor(() => expect(dialog).toHaveAttribute('aria-busy', 'true'));
        expect(within(dialog).getByRole('button', { name: /Deleting/ })).toHaveAttribute('aria-busy', 'true');
        expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
        expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled();

        await user.keyboard('{Escape}');
        await user.click(document.body.querySelector('[data-dialog-backdrop]') as HTMLElement);
        expect(props.onClose).not.toHaveBeenCalled();

        pending.resolve();
        await waitFor(() => expect(dialog).not.toHaveAttribute('aria-busy'));
        expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled();
    });

    it('announces a rejected confirmation inside the open dialog and keeps the typed reason', async () => {
        const user = userEvent.setup();
        const { dialog, props } = renderConfirm({
            intent: 'archive',
            reason: 'required',
            onConfirm: vi.fn().mockRejectedValue(new Error('rejected')),
        });

        const reason = within(dialog).getByRole('textbox');
        await user.type(reason, 'Exact rationale');
        await user.click(within(dialog).getByRole('button', { name: 'Archive' }));

        const alert = await within(dialog).findByRole('alert');
        expect(alert).toHaveTextContent('Something went wrong. Please try again.');
        expect(dialog).toHaveAccessibleDescription(/Something went wrong/);
        expect(reason).toHaveValue('Exact rationale');
        expect(props.onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('renders the owner errorText as an alert inside the dialog', () => {
        const { dialog } = renderConfirm({ intent: 'archive', errorText: 'Archive failed' });
        expect(within(dialog).getByRole('alert')).toHaveTextContent('Archive failed');
    });

    it('uses the v2 themed surface instead of hook classes', () => {
        const { dialog } = renderConfirm({ intent: 'archive' });
        expect(dialog).toHaveClass('bg-popover', 'text-popover-foreground', 'max-w-md');
        expect(dialog.className).not.toMatch(/confirm-dialog-|glass-card/);
        expect(within(dialog).getByRole('heading', { level: 2 })).toHaveTextContent('Archive this item?');
    });
});
