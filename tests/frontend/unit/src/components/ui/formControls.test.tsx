import * as axe from 'axe-core';
import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { NativeSelect } from '@/components/ui/native-select';
import { RadioGroup } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { fireEvent, render, renderWithoutProviders, screen, userEvent, within } from '@test/render';

/**
 * Audit 2026-09-30 §4.8 / roadmap 1.5 (DS-02, DS-04, DS-10, GAP-D-26):
 * contract tests for the Textarea, Checkbox, Switch, RadioGroup and
 * NativeSelect primitives — accessible name, required state, error
 * announcement (aria-invalid + accessible description), keyboard, tokens,
 * and a structural axe pass in each theme (jsdom has no layout, so contrast is
 * covered by the rendered-contrast gate, not here).
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const THEMES: ReadonlyArray<{ name: string; className: string }> = [
    { name: 'default (:root)', className: '' },
    { name: 'true-dark (.theme-dark)', className: 'theme-dark' },
    { name: 'light (.theme-light)', className: 'theme-light' },
];

async function expectNoAxeViolations(node: Element): Promise<void> {
    const results = await axe.run(node, {
        runOnly: { type: 'tag', values: AXE_TAGS },
        rules: { 'color-contrast': { enabled: false } },
    });
    const summary = results.violations
        .map((v) => `${v.id} (${v.nodes.length}): ${v.help}`)
        .join('\n');
    expect(summary, summary).toBe('');
}

function expectTokenOnly(className: string): void {
    expect(className).not.toMatch(/\btext-white\b/);
    expect(className).not.toMatch(/\b(?:bg|text|border)-(?:white|black)\//);
    expect(className).not.toMatch(/\b(?:bg|text|border)-(?:slate|gray|red|green|blue|amber)-\d{2,3}\b/);
}

describe('Textarea', () => {
    it('is labelled, required and announces its error through Field', () => {
        renderWithoutProviders(
            <Field label="Rationale" required help="Why the link exists" error="Enter a rationale">
                {(field) => <Textarea {...field} defaultValue="" />}
            </Field>,
        );
        const textarea = screen.getByRole('textbox', { name: 'Rationale' });
        expect(textarea.tagName).toBe('TEXTAREA');
        expect(textarea).toBeRequired();
        expect(textarea).toBeInvalid();
        expect(textarea).toHaveAccessibleDescription('Why the link exists Enter a rationale');
        expect(textarea.className).toContain('aria-[invalid=true]:border-destructive');
        expect(textarea.className).toContain('resize-y');
        expectTokenOnly(textarea.className);
    });

    it('accepts typing (multi-line) and grows with autoResize', async () => {
        const user = userEvent.setup();
        renderWithoutProviders(<Textarea aria-label="Notes" autoResize />);
        const textarea = screen.getByRole('textbox', { name: 'Notes' });
        await user.type(textarea, 'first{Enter}second');
        expect(textarea).toHaveValue('first\nsecond');
        expect(textarea.className).toContain('resize-none');
        expect(textarea.style.height).not.toBe('');
    });
});

describe('Checkbox', () => {
    it('is named by an inline Field, toggles with Space and reports the next state', async () => {
        const user = userEvent.setup();
        const onCheckedChange = vi.fn<(checked: boolean) => void>();
        function Harness() {
            const [checked, setChecked] = useState(false);
            return (
                <Field layout="inline" label="Remember me" required error="Required to continue">
                    {(field) => (
                        <Checkbox
                            {...field}
                            checked={checked}
                            onCheckedChange={(next) => { setChecked(next); onCheckedChange(next); }}
                        />
                    )}
                </Field>
            );
        }
        renderWithoutProviders(<Harness />);
        const checkbox = screen.getByRole('checkbox', { name: 'Remember me' });
        expect(checkbox).toBeRequired();
        expect(checkbox).toBeInvalid();
        expect(checkbox).toHaveAccessibleDescription('Required to continue');

        checkbox.focus();
        await user.keyboard(' ');
        expect(checkbox).toBeChecked();
        expect(onCheckedChange).toHaveBeenLastCalledWith(true);

        // Clicking the visible label toggles it too (htmlFor association).
        await user.click(screen.getByText('Remember me'));
        expect(checkbox).not.toBeChecked();
        expect(onCheckedChange).toHaveBeenLastCalledWith(false);
        expect(checkbox.className).toContain('focus-ring');
        expectTokenOnly(checkbox.className);
    });

    it('exposes the mixed state for a partial selection', () => {
        renderWithoutProviders(<Checkbox aria-label="Select all rows" checked={false} indeterminate onCheckedChange={() => {}} />);
        expect(screen.getByRole('checkbox', { name: 'Select all rows' })).toBePartiallyChecked();
    });
});

describe('Switch', () => {
    it('is a named, stateful switch that Space and Enter toggle', async () => {
        const user = userEvent.setup();
        function Harness() {
            const [checked, setChecked] = useState(false);
            return (
                <>
                    <span id="setting-name">Email digests</span>
                    <Switch aria-labelledby="setting-name" checked={checked} onCheckedChange={setChecked} />
                </>
            );
        }
        renderWithoutProviders(<Harness />);
        const toggle = screen.getByRole('switch', { name: 'Email digests' });
        expect(toggle).toHaveAttribute('type', 'button');
        expect(toggle).not.toBeChecked();

        toggle.focus();
        await user.keyboard(' ');
        expect(toggle).toBeChecked();
        await user.keyboard('{Enter}');
        expect(toggle).not.toBeChecked();
        await user.click(toggle);
        expect(toggle).toBeChecked();

        expect(toggle.className).toContain('bg-accent');
        expect(toggle.className).toContain('focus-ring');
        expectTokenOnly(toggle.className);
    });

    it('works inside Field and stays put while disabled', async () => {
        const user = userEvent.setup();
        const onCheckedChange = vi.fn<(checked: boolean) => void>();
        renderWithoutProviders(
            <Field layout="inline" label="Require approval" help="Applies to new changes">
                {(field) => <Switch {...field} checked={false} disabled onCheckedChange={onCheckedChange} />}
            </Field>,
        );
        const toggle = screen.getByRole('switch', { name: 'Require approval' });
        expect(toggle).toHaveAccessibleDescription('Applies to new changes');
        expect(toggle).toBeDisabled();
        await user.click(toggle);
        expect(onCheckedChange).not.toHaveBeenCalled();
        expect(toggle.className).toContain('bg-input');
    });
});

describe('RadioGroup', () => {
    const OPTIONS = [
        { value: 'csv', label: 'CSV', description: 'Spreadsheet friendly' },
        { value: 'pdf', label: 'PDF' },
        { value: 'xml', label: 'XML', disabled: true },
    ] as const;

    function Harness({ variant }: { variant?: 'list' | 'card' }) {
        const [value, setValue] = useState<'csv' | 'pdf' | 'xml'>('csv');
        return (
            <RadioGroup
                legend="Format"
                variant={variant}
                value={value}
                onValueChange={setValue}
                options={OPTIONS}
            />
        );
    }

    it('names the group by its legend and each radio by its label (description separate)', () => {
        renderWithoutProviders(<Harness />);
        const group = screen.getByRole('radiogroup', { name: 'Format' });
        const csv = within(group).getByRole('radio', { name: 'CSV' });
        expect(csv).toBeChecked();
        expect(csv).toHaveAccessibleDescription('Spreadsheet friendly');
        expect(within(group).getByRole('radio', { name: 'XML' })).toBeDisabled();
    });

    it('moves the selection with arrow keys and on label click', async () => {
        const user = userEvent.setup();
        renderWithoutProviders(<Harness variant="card" />);
        const csv = screen.getByRole('radio', { name: 'CSV' });
        csv.focus();
        await user.keyboard('{ArrowDown}');
        expect(screen.getByRole('radio', { name: 'PDF' })).toBeChecked();
        await user.click(screen.getByText('CSV'));
        expect(csv).toBeChecked();
    });

    it('takes its name, required and error state from a group Field', () => {
        renderWithoutProviders(
            <Field group label="Export format" required error="Pick a format">
                {(field) => (
                    <RadioGroup {...field} value="" onValueChange={() => {}} options={[{ value: 'csv', label: 'CSV' }]} />
                )}
            </Field>,
        );
        const group = screen.getByRole('radiogroup', { name: 'Export format' });
        expect(group).toHaveAttribute('aria-required', 'true');
        expect(group).toHaveAttribute('aria-invalid', 'true');
        expect(group).toHaveAccessibleDescription('Pick a format');
        // A group is named by text, never by an orphan `<label for>` pointing at a fieldset.
        expect(document.querySelector(`label[for="${group.id}"]`)).toBeNull();
    });
});

describe('NativeSelect', () => {
    it('keeps native select semantics and keyboard while sharing the Input recipe', async () => {
        const user = userEvent.setup();
        renderWithoutProviders(
            <Field label="Method" required error="Choose a method">
                {(field) => (
                    <NativeSelect {...field} defaultValue="totp">
                        <option value="totp">Authenticator app</option>
                        <option value="recovery_code">Recovery code</option>
                    </NativeSelect>
                )}
            </Field>,
        );
        const select = screen.getByRole('combobox', { name: 'Method' });
        expect(select.tagName).toBe('SELECT');
        expect(select).toBeRequired();
        expect(select).toBeInvalid();
        expect(select).toHaveAccessibleDescription('Choose a method');
        await user.selectOptions(select, 'recovery_code');
        expect(select).toHaveValue('recovery_code');
        expect(select.className).toContain('h-10');
        expect(select.className).toContain('appearance-none');
        expectTokenOnly(select.className);
    });

    it('offers the compact 32px size', () => {
        renderWithoutProviders(
            <NativeSelect aria-label="Status" size="compact" defaultValue="a">
                <option value="a">A</option>
            </NativeSelect>,
        );
        expect(screen.getByRole('combobox', { name: 'Status' }).className).toContain('h-8');
    });

    it('renders only the transparent native select in overlay mode (register Add-filter chip)', () => {
        const onChange = vi.fn();
        const { container } = renderWithoutProviders(
            <label className="relative">
                Add filter
                <NativeSelect overlay aria-label="Add filter" value="" onChange={onChange} data-testid="add-filter">
                    <option value="">Add filter</option>
                    <option value="owner">Owner</option>
                </NativeSelect>
            </label>,
        );
        const select = screen.getByTestId('add-filter');
        expect(select.tagName).toBe('SELECT');
        expect(select).toHaveClass('absolute', 'inset-0', 'opacity-0', 'cursor-pointer');
        expect(select.className).not.toContain('h-10');
        // No recipe wrapper and no chevron: the positioned parent draws the visible control.
        expect(select.parentElement?.tagName).toBe('LABEL');
        expect(container.querySelector('svg')).toBeNull();
        fireEvent.change(select, { target: { value: 'owner' } });
        expect(onChange).toHaveBeenCalledTimes(1);
    });
});

describe('form controls axe sweep', () => {
    it.each(THEMES)('has no axe violations in the $name theme', async ({ className }) => {
        const { container } = render(
            <div className={className}>
                <Field label="Notes" optional help="Shown to approvers">
                    {(field) => <Textarea {...field} defaultValue="" />}
                </Field>
                <Field layout="inline" label="Notify owners" required>
                    {(field) => <Checkbox {...field} checked onCheckedChange={() => {}} />}
                </Field>
                <Field layout="inline" label="Enabled" error="Must be enabled">
                    {(field) => <Switch {...field} checked={false} onCheckedChange={() => {}} />}
                </Field>
                <RadioGroup
                    legend="Purpose"
                    variant="card"
                    value="a"
                    onValueChange={() => {}}
                    options={[{ value: 'a', label: 'Current view', description: 'What you see now' }, { value: 'b', label: 'Point in time' }]}
                />
                <Field label="Method">
                    {(field) => (
                        <NativeSelect {...field} defaultValue="x">
                            <option value="x">X</option>
                        </NativeSelect>
                    )}
                </Field>
            </div>,
        );
        expect(within(container).getByRole('switch', { name: 'Enabled' })).toBeInTheDocument();
        await expectNoAxeViolations(container);
    });
});

describe('form primitive API consistency (refs, displayName, className, size)', () => {
    it('forwards a ref to the native control (or trigger / group root) of every primitive', () => {
        const refs = {
            input: createRef<HTMLInputElement>(),
            textarea: createRef<HTMLTextAreaElement>(),
            nativeSelect: createRef<HTMLSelectElement>(),
            checkbox: createRef<HTMLInputElement>(),
            switch: createRef<HTMLButtonElement>(),
            radioGroup: createRef<HTMLFieldSetElement>(),
            multiSelect: createRef<HTMLButtonElement>(),
        };
        render(
            <div>
                <Input ref={refs.input} aria-label="Name" />
                <Textarea ref={refs.textarea} aria-label="Notes" />
                <NativeSelect ref={refs.nativeSelect} aria-label="Method" defaultValue="a">
                    <option value="a">A</option>
                </NativeSelect>
                <Checkbox ref={refs.checkbox} aria-label="Select row" />
                <Switch ref={refs.switch} aria-label="Enabled" checked={false} />
                <RadioGroup
                    ref={refs.radioGroup}
                    legend="Purpose"
                    value="a"
                    onValueChange={() => {}}
                    options={[{ value: 'a', label: 'A' }]}
                />
                <MultiSelect
                    ref={refs.multiSelect}
                    triggerAriaLabel="Roles"
                    options={[{ value: 'cro', label: 'CRO' }]}
                    value={[]}
                    onChange={() => {}}
                />
            </div>,
        );
        expect(refs.input.current).toBe(screen.getByRole('textbox', { name: 'Name' }));
        expect(refs.textarea.current).toBe(screen.getByRole('textbox', { name: 'Notes' }));
        expect(refs.nativeSelect.current).toBe(screen.getByRole('combobox', { name: 'Method' }));
        expect(refs.checkbox.current).toBe(screen.getByRole('checkbox', { name: 'Select row' }));
        expect(refs.switch.current).toBe(screen.getByRole('switch', { name: 'Enabled' }));
        expect(refs.radioGroup.current).toBe(screen.getByRole('radiogroup', { name: 'Purpose' }));
        expect(refs.multiSelect.current).toBe(screen.getByRole('combobox', { name: 'Roles' }));
    });

    it('names every primitive for React DevTools', () => {
        const named = { Input, Textarea, NativeSelect, Checkbox, Switch, RadioGroup, MultiSelect };
        for (const [name, component] of Object.entries(named)) {
            expect((component as { displayName?: string }).displayName, name).toBe(name);
        }
    });

    it('merges className with cn so a caller override wins over the recipe', () => {
        render(
            <div>
                <Textarea aria-label="Notes" className="min-h-40" />
                <Checkbox aria-label="Select row" className="size-5" />
                <RadioGroup
                    legend="Purpose"
                    className="space-y-4"
                    value="a"
                    onValueChange={() => {}}
                    options={[{ value: 'a', label: 'A' }]}
                />
                <MultiSelect
                    triggerAriaLabel="Roles"
                    className="h-12"
                    options={[{ value: 'cro', label: 'CRO' }]}
                    value={[]}
                    onChange={() => {}}
                />
            </div>,
        );
        const textarea = screen.getByRole('textbox', { name: 'Notes' }).className.split(/\s+/);
        expect(textarea).toContain('min-h-40');
        expect(textarea).not.toContain('min-h-20');
        const checkbox = screen.getByRole('checkbox', { name: 'Select row' }).className.split(/\s+/);
        expect(checkbox).toContain('size-5');
        expect(checkbox).not.toContain('size-4');
        const group = screen.getByRole('radiogroup', { name: 'Purpose' }).className.split(/\s+/);
        expect(group).toContain('space-y-4');
        expect(group).not.toContain('space-y-2');
        const trigger = screen.getByRole('combobox', { name: 'Roles' }).className.split(/\s+/);
        expect(trigger).toContain('h-12');
        expect(trigger).not.toContain('h-10');
    });

    it('shares the default (40px) / compact (32px) size vocabulary across Input, NativeSelect and MultiSelect', () => {
        render(
            <div>
                <Input aria-label="Search" size="compact" />
                <NativeSelect aria-label="Method" size="compact" defaultValue="a">
                    <option value="a">A</option>
                </NativeSelect>
                <MultiSelect
                    triggerAriaLabel="Roles compact"
                    size="compact"
                    options={[{ value: 'cro', label: 'CRO' }]}
                    value={[]}
                    onChange={() => {}}
                />
                <MultiSelect
                    triggerAriaLabel="Roles default"
                    options={[{ value: 'cro', label: 'CRO' }]}
                    value={[]}
                    onChange={() => {}}
                />
            </div>,
        );
        expect(screen.getByRole('textbox', { name: 'Search' }).className).toContain('h-8');
        expect(screen.getByRole('combobox', { name: 'Method' }).className).toContain('h-8');
        expect(screen.getByRole('combobox', { name: 'Roles compact' }).className).toContain('h-8');
        expect(screen.getByRole('combobox', { name: 'Roles default' }).className).toContain('h-10');
    });
});
