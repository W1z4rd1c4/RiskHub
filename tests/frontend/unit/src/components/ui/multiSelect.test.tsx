import * as axe from 'axe-core';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DialogShell } from '@/components/DialogShell';
import { Field } from '@/components/ui/field';
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select';
import { render, renderWithoutProviders, screen, userEvent, waitFor, within } from '@test/render';

/**
 * Audit 2026-09-30 §3.1 / §4.8 (GAP-B-07): `MultiSelect` is a named
 * select-only combobox trigger with a selected-count summary that opens a
 * Radix popover holding a checkbox list. Covers naming via `Field`, required /
 * error state, the translated summary (en), keyboard (open, arrow navigation,
 * Space, Escape back to the trigger), search, chip removal labelled "Remove",
 * use inside `DialogShell`, and a stateful axe pass on the open popover.
 */

const OPTIONS: MultiSelectOption[] = [
    { value: 'cro', label: 'CRO' },
    { value: 'risk_manager', label: 'Risk Manager' },
    { value: 'auditor', label: 'Auditor', disabled: true },
];

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const THEMES: ReadonlyArray<{ name: string; className: string }> = [
    { name: 'default (:root)', className: '' },
    { name: 'true-dark (.theme-dark)', className: 'theme-dark' },
    { name: 'light (.theme-light)', className: 'theme-light' },
];

function Harness({
    initial = [],
    onChange,
    searchable = false,
}: {
    initial?: string[];
    onChange?: (value: string[]) => void;
    searchable?: boolean;
}) {
    const [value, setValue] = useState<string[]>(initial);
    return (
        <Field label="Approver roles" required error={value.length === 0 ? 'Pick at least one role' : undefined}>
            {(field) => (
                <MultiSelect
                    {...field}
                    options={OPTIONS}
                    value={value}
                    searchable={searchable}
                    onChange={(next) => { setValue(next); onChange?.(next); }}
                />
            )}
        </Field>
    );
}

describe('MultiSelect', () => {
    it('is a named combobox with required/error state and a placeholder summary', () => {
        renderWithoutProviders(<Harness />);
        const trigger = screen.getByRole('combobox', { name: 'Approver roles' });
        expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(trigger).toHaveAttribute('aria-required', 'true');
        expect(trigger).toBeInvalid();
        expect(trigger).toHaveAccessibleDescription('Pick at least one role');
        expect(trigger).toHaveTextContent('Select');
    });

    it('toggles options with the mouse and summarises the selected count (plural-aware)', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn<(value: string[]) => void>();
        renderWithoutProviders(<Harness onChange={onChange} />);
        const trigger = screen.getByRole('combobox', { name: 'Approver roles' });

        await user.click(trigger);
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        const panel = await screen.findByRole('dialog', { name: 'Approver roles' });
        await user.click(within(panel).getByRole('checkbox', { name: 'CRO' }));
        expect(onChange).toHaveBeenLastCalledWith(['cro']);
        expect(trigger).toHaveTextContent('1 selected');
        await user.click(within(panel).getByRole('checkbox', { name: 'Risk Manager' }));
        expect(onChange).toHaveBeenLastCalledWith(['cro', 'risk_manager']);
        expect(trigger).toHaveTextContent('2 selected');
        expect(within(panel).getByRole('checkbox', { name: 'Auditor' })).toBeDisabled();
        expect(trigger).not.toBeInvalid();
    });

    it('supports keyboard: ArrowDown opens, arrows move, Space toggles, Escape returns focus', async () => {
        const user = userEvent.setup();
        renderWithoutProviders(<Harness />);
        const trigger = screen.getByRole('combobox', { name: 'Approver roles' });

        trigger.focus();
        await user.keyboard('{ArrowDown}');
        const cro = await screen.findByRole('checkbox', { name: 'CRO' });
        await waitFor(() => expect(cro).toHaveFocus());

        await user.keyboard('{ArrowDown}');
        const riskManager = screen.getByRole('checkbox', { name: 'Risk Manager' });
        expect(riskManager).toHaveFocus();
        // The disabled option is skipped; End stays on the last enabled option.
        await user.keyboard('{End}');
        expect(riskManager).toHaveFocus();
        await user.keyboard(' ');
        expect(riskManager).toBeChecked();
        await user.keyboard('{Home}');
        expect(cro).toHaveFocus();

        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(trigger).toHaveFocus();
        expect(trigger).toHaveTextContent('1 selected');
    });

    it('filters options with the optional search box', async () => {
        const user = userEvent.setup();
        renderWithoutProviders(<Harness searchable />);
        await user.click(screen.getByRole('combobox', { name: 'Approver roles' }));
        const search = await screen.findByRole('textbox', { name: 'Search items...' });
        await user.type(search, 'risk');
        expect(screen.getByRole('checkbox', { name: 'Risk Manager' })).toBeInTheDocument();
        expect(screen.queryByRole('checkbox', { name: 'CRO' })).not.toBeInTheDocument();
        await user.clear(search);
        await user.type(search, 'zzz');
        expect(screen.getByText('No results found')).toBeInTheDocument();
    });

    it('removes a value from its chip with a "Remove {name}" button', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn<(value: string[]) => void>();
        renderWithoutProviders(<Harness initial={['cro', 'legacy_role']} onChange={onChange} />);
        // Unknown values keep their raw code as the chip label.
        expect(screen.getByText('legacy_role')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Remove CRO' }));
        expect(onChange).toHaveBeenLastCalledWith(['legacy_role']);
        expect(screen.queryByRole('button', { name: 'Remove CRO' })).not.toBeInTheDocument();
    });

    it('falls back to triggerAriaLabel when no visible label is associated', () => {
        renderWithoutProviders(
            <MultiSelect triggerAriaLabel="Departments" options={OPTIONS} value={[]} onChange={() => {}} />,
        );
        expect(screen.getByRole('combobox', { name: 'Departments' })).toBeInTheDocument();
    });

    it('keeps its popover interactive inside DialogShell and closes only itself on Escape', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        renderWithoutProviders(
            <DialogShell isOpen onClose={onClose} titleId="dlg-title">
                <h2 id="dlg-title">Configure</h2>
                <Harness />
            </DialogShell>,
        );
        await user.click(screen.getByRole('combobox', { name: 'Approver roles' }));
        const cro = await screen.findByRole('checkbox', { name: 'CRO' });
        await user.click(cro);
        expect(cro).toHaveFocus();
        expect(cro).toBeChecked();

        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'CRO' })).not.toBeInTheDocument());
        expect(onClose).not.toHaveBeenCalled();
        // The first Escape closed only the popover and focus is back in the dialog,
        // so the next Escape belongs to the dialog.
        expect(screen.getByRole('combobox', { name: 'Approver roles' })).toHaveFocus();
        await user.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('returns focus to the trigger when Tab leaves the popover, so it never escapes the dialog trap', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        renderWithoutProviders(
            <DialogShell isOpen onClose={onClose} titleId="dlg-tab-title">
                <h2 id="dlg-tab-title">Configure</h2>
                <Harness searchable />
                <button type="button">After</button>
            </DialogShell>,
        );
        const trigger = screen.getByRole('combobox', { name: 'Approver roles' });

        await user.click(trigger);
        const search = await screen.findByRole('textbox', { name: 'Search items...' });
        await waitFor(() => expect(search).toHaveFocus());
        // Tab moves through the popover's own controls (the disabled option is skipped)...
        await user.tab();
        expect(screen.getByRole('checkbox', { name: 'CRO' })).toHaveFocus();
        await user.tab();
        expect(screen.getByRole('checkbox', { name: 'Risk Manager' })).toHaveFocus();
        // ...and tabbing past the last one closes the list and lands on the trigger.
        await user.tab();
        await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'CRO' })).not.toBeInTheDocument());
        expect(trigger).toHaveFocus();

        // Shift+Tab before the first control does the same.
        await user.click(trigger);
        await waitFor(() => expect(screen.getByRole('textbox', { name: 'Search items...' })).toHaveFocus());
        await user.tab({ shift: true });
        await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Search items...' })).not.toBeInTheDocument());
        expect(trigger).toHaveFocus();
        expect(onClose).not.toHaveBeenCalled();
    });

    it.each(THEMES)('has no axe violations with the list open in the $name theme', async ({ className }) => {
        const user = userEvent.setup();
        const { container } = render(
            <div className={className}>
                <Harness initial={['cro']} />
            </div>,
        );
        await user.click(within(container).getByRole('combobox', { name: 'Approver roles' }));
        await screen.findByRole('checkbox', { name: 'CRO' });
        const results = await axe.run(document.body, {
            runOnly: { type: 'tag', values: AXE_TAGS },
            rules: { 'color-contrast': { enabled: false } },
        });
        const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`).join('\n');
        expect(summary, summary).toBe('');
    });
});
