import * as axe from 'axe-core';
import { describe, it, expect } from 'vitest';

import { Field } from '@/components/ui/field';
import { ThemedSelect, type SelectOption } from '@/components/ui/ThemedSelect';
import { render, renderWithoutProviders, screen, userEvent, within } from '@test/render';

/**
 * FR-P2a-3 / FR-P2a-4 (ADR-015, spec N13, findings C1 + S6) — tokenized
 * `select.tsx` + `ThemedSelect` ARIA.
 *
 * - N13: a real visible label (associated via `aria-labelledby`) MUST win over
 *   the fallback `aria-label`; the ~95 existing call sites that pass neither
 *   keep their placeholder-derived name.
 * - S6: the trigger is token-driven with a `focus-visible` (not `focus:`) ring
 *   and `ring-ring` (not `ring-accent`).
 * - N10: the stateful axe sweep opens the Radix listbox and scans the OPEN
 *   state (not just the closed trigger), in each of the three themes.
 */

const OPTIONS: SelectOption[] = [
    { value: 'prod', label: 'Production' },
    { value: 'stage', label: 'Staging' },
    { value: 'dev', label: 'Development' },
];

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const THEMES: ReadonlyArray<{ name: string; className: string }> = [
    { name: 'default (:root)', className: '' },
    { name: 'true-dark (.theme-dark)', className: 'theme-dark' },
    { name: 'light (.theme-light)', className: 'theme-light' },
];

async function expectNoAxeViolations(node: Element | Document = document.body): Promise<void> {
    const results = await axe.run(node as Element, {
        runOnly: { type: 'tag', values: AXE_TAGS },
        rules: { 'color-contrast': { enabled: false } },
    });
    const summary = results.violations
        .map((v) => `${v.id} (${v.nodes.length}): ${v.help}`)
        .join('\n');
    expect(summary, summary).toBe('');
}

describe('ThemedSelect — accessible name (N13 / C1)', () => {
    it('falls back to the placeholder for call sites that pass no label (preserves ~95 sites)', () => {
        renderWithoutProviders(
            <ThemedSelect value="" onValueChange={() => {}} options={OPTIONS} placeholder="Choose environment" />,
        );
        const trigger = screen.getByRole('combobox');
        expect(trigger).toHaveAttribute('aria-label', 'Choose environment');
        expect(trigger).not.toHaveAttribute('aria-labelledby');
    });

    it('prefers an explicit triggerAriaLabel over the placeholder', () => {
        renderWithoutProviders(
            <ThemedSelect
                value=""
                onValueChange={() => {}}
                options={OPTIONS}
                placeholder="Choose environment"
                triggerAriaLabel="Environment filter"
            />,
        );
        expect(screen.getByRole('combobox')).toHaveAttribute('aria-label', 'Environment filter');
    });

    it('lets a visible label (aria-labelledby) WIN — no fallback aria-label override', () => {
        renderWithoutProviders(
            <>
                <span id="ext-label">Data classification</span>
                <ThemedSelect
                    value=""
                    onValueChange={() => {}}
                    options={OPTIONS}
                    placeholder="Choose"
                    triggerAriaLabel="should-be-ignored"
                    aria-labelledby="ext-label"
                />
            </>,
        );
        const trigger = screen.getByRole('combobox', { name: 'Data classification' });
        expect(trigger).toHaveAttribute('aria-labelledby', 'ext-label');
        // The fallback aria-label MUST be suppressed so it does not override.
        expect(trigger).not.toHaveAttribute('aria-label');
    });

    it('wired through Field: accessible name is the visible label, not the placeholder', () => {
        renderWithoutProviders(
            <Field label="Environment" required error="Pick one" help="Deployment target">
                {(field) => (
                    <ThemedSelect {...field} value="" onValueChange={() => {}} options={OPTIONS} placeholder="Choose" />
                )}
            </Field>,
        );
        const trigger = screen.getByRole('combobox', { name: 'Environment' });
        expect(trigger).not.toHaveAttribute('aria-label');
        expect(trigger).toHaveAttribute('aria-required', 'true');
        expect(trigger).toHaveAttribute('aria-invalid', 'true');
        const id = trigger.getAttribute('id');
        expect(trigger.getAttribute('aria-describedby')).toBe(`${id}-help ${id}-error`);
    });
});

describe('select.tsx — tokenization (S6 / FR-P2a-3)', () => {
    it('trigger uses tokens + focus-visible ring, not hardcoded colours', () => {
        renderWithoutProviders(
            <ThemedSelect value="" onValueChange={() => {}} options={OPTIONS} triggerAriaLabel="env" />,
        );
        const cls = screen.getByRole('combobox').className;
        expect(cls).toContain('focus-visible:ring-ring');
        expect(cls).toContain('border-input');
        expect(cls).toContain('data-[placeholder]:text-muted-foreground');
        // S6 regressions must stay fixed:
        expect(cls).not.toContain('ring-accent');
        expect(cls).not.toMatch(/\bfocus:(ring|border|outline)/);
        expect(cls).not.toContain('bg-white/');
        expect(cls).not.toContain('text-slate-300');
    });

    it('content + items use popover/accent tokens once opened', async () => {
        const user = userEvent.setup();
        renderWithoutProviders(
            <ThemedSelect
                value=""
                onValueChange={() => {}}
                options={OPTIONS}
                triggerAriaLabel="env"
                contentTestId="content"
                optionTestIdPrefix="opt"
            />,
        );
        await user.click(screen.getByRole('combobox'));
        const content = await screen.findByTestId('content');
        expect(content.className).toContain('bg-popover/95');
        expect(content.className).toContain('text-popover-foreground');
        expect(content.className).not.toContain('bg-slate-900');
        const option = screen.getByTestId('opt-prod');
        expect(option.className).toContain('data-[highlighted]:bg-accent/15');
        expect(option.className).not.toContain('bg-white/');
    });
});

describe('ThemedSelect — stateful OPEN-listbox axe sweep (N10)', () => {
    it.each(THEMES)('closed trigger has no axe violations — $name', async ({ className }) => {
        const { container } = render(
            <div className={className}>
                <Field label="Environment">
                    {(field) => (
                        <ThemedSelect {...field} value="" onValueChange={() => {}} options={OPTIONS} placeholder="Choose" />
                    )}
                </Field>
            </div>,
        );
        expect(within(container).getByRole('combobox', { name: 'Environment' })).toBeInTheDocument();
        await expectNoAxeViolations(container);
    });

    it.each(THEMES)('OPEN Radix listbox has no axe violations — $name', async ({ className }) => {
        const user = userEvent.setup();
        render(
            <div className={className}>
                <Field label="Environment">
                    {(field) => (
                        <ThemedSelect {...field} value="" onValueChange={() => {}} options={OPTIONS} placeholder="Choose" />
                    )}
                </Field>
            </div>,
        );

        await user.click(screen.getByRole('combobox', { name: 'Environment' }));

        // The listbox + its options must actually be in the OPEN state we scan.
        const listbox = await screen.findByRole('listbox');
        expect(listbox).toBeInTheDocument();
        expect(screen.getAllByRole('option')).toHaveLength(OPTIONS.length);

        // Scan document.body so the portalled listbox is included (N10).
        await expectNoAxeViolations(document.body);
    });
});
