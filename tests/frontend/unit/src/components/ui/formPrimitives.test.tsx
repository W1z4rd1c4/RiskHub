import * as axe from 'axe-core';
import { describe, it, expect } from 'vitest';

import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { render, renderWithoutProviders, screen, within } from '@test/render';

/**
 * FR-P2a-1 / FR-P2a-2 (ADR-015, spec N12) — accessible `Field` / `Label` /
 * `Input` primitives.
 *
 * Covers the ARIA wiring the `Field` wrapper owns (htmlFor / aria-labelledby /
 * aria-describedby / aria-invalid / aria-required), the tokenized `Input`
 * styling, and a stateful axe scan in each of the three themes (default
 * `:root`, `.theme-dark`, `.theme-light`) — jsdom has no layout engine, so the
 * scan asserts structural a11y (names, roles, associations), not contrast
 * (contrast is covered by design-system/statusTokenContrast.test.ts).
 */

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

describe('Label', () => {
    it('associates with its control and renders an aria-hidden required affordance', () => {
        renderWithoutProviders(
            <>
                <Label htmlFor="x" required>
                    Vendor name
                </Label>
                <input id="x" />
            </>,
        );
        // Accessible name excludes the "*" (asterisk is aria-hidden): the
        // accname computation behind getByRole skips aria-hidden subtrees.
        const input = screen.getByRole('textbox', { name: 'Vendor name' });
        expect(input).toBeInTheDocument();
        const asterisk = screen.getByText('*');
        expect(asterisk).toHaveAttribute('aria-hidden', 'true');
    });
});

describe('Input', () => {
    it('is token-driven with a focus-visible ring (no hardcoded colours)', () => {
        renderWithoutProviders(<Input aria-label="Name" />);
        const cls = screen.getByRole('textbox').className;
        expect(cls).toContain('border-input');
        expect(cls).toContain('focus-visible:ring-ring');
        expect(cls).toContain('aria-[invalid=true]:border-destructive');
        expect(cls).not.toMatch(/\bfocus:ring-/);
        expect(cls).not.toContain('ring-accent');
        expect(cls).not.toContain('bg-white/');
    });
});

/** Stand-in for a lucide icon (the test tree cannot import lucide-react). */
function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
    return <svg {...props} />;
}

describe('Input sizes (cva)', () => {
    it('keeps the 40px default and offers the 32px compact size with a leading icon', () => {
        renderWithoutProviders(
            <>
                <div><Input aria-label="Default" /></div>
                <Input aria-label="Compact" size="compact" leadingIcon={SearchIcon} />
            </>,
        );
        const regular = screen.getByRole('textbox', { name: 'Default' });
        expect(regular.className).toContain('h-10');
        expect(regular.className).toContain('rounded-lg');
        expect(regular.parentElement?.querySelector('svg')).toBeNull();

        const compact = screen.getByRole('textbox', { name: 'Compact' });
        expect(compact.className).toContain('h-8');
        expect(compact.className).not.toContain('h-10');
        expect(compact.className).toContain('pl-8');
        const icon = compact.parentElement?.querySelector('svg');
        expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
});

describe('Field', () => {
    it('owns the id and wires label + help + error + aria state onto the control', () => {
        renderWithoutProviders(
            <Field label="Asset name" required help="Human-readable name" error="Required">
                {(field) => <Input {...field} />}
            </Field>,
        );
        const input = screen.getByRole('textbox', { name: 'Asset name' });
        const id = input.getAttribute('id');
        expect(id).toBeTruthy();

        // Label association: htmlFor -> control id, and aria-labelledby -> label id.
        const labelledby = input.getAttribute('aria-labelledby');
        expect(labelledby).toBe(`${id}-label`);
        expect(document.getElementById(`${id}-label`)).toHaveTextContent('Asset name');

        // Required + invalid state exposed programmatically.
        expect(input).toHaveAttribute('aria-required', 'true');
        expect(input).toHaveAttribute('aria-invalid', 'true');

        // Help + error both wired into aria-describedby, in that order.
        expect(input.getAttribute('aria-describedby')).toBe(`${id}-help ${id}-error`);
        expect(document.getElementById(`${id}-help`)).toHaveTextContent('Human-readable name');
        expect(document.getElementById(`${id}-error`)).toHaveTextContent('Required');
    });

    it('omits aria-invalid/aria-required/error when the field is valid and optional', () => {
        renderWithoutProviders(
            <Field label="Notes" help="Optional context">
                {(field) => <Input {...field} />}
            </Field>,
        );
        const input = screen.getByRole('textbox', { name: 'Notes' });
        const id = input.getAttribute('id');
        expect(input).not.toHaveAttribute('aria-invalid');
        expect(input).not.toHaveAttribute('aria-required');
        expect(input.getAttribute('aria-describedby')).toBe(`${id}-help`);
    });

    it('generates a unique id per instance and honours an explicit id', () => {
        renderWithoutProviders(
            <>
                <Field label="First">{(f) => <Input {...f} />}</Field>
                <Field label="Second">{(f) => <Input {...f} />}</Field>
                <Field id="explicit-id" label="Third">
                    {(f) => <Input {...f} />}
                </Field>
            </>,
        );
        const first = screen.getByRole('textbox', { name: 'First' }).getAttribute('id');
        const second = screen.getByRole('textbox', { name: 'Second' }).getAttribute('id');
        expect(first).not.toBe(second);
        expect(screen.getByRole('textbox', { name: 'Third' })).toHaveAttribute('id', 'explicit-id');
    });

    it('appends the translated "(optional)" hint, never alongside the required marker', () => {
        renderWithoutProviders(
            <>
                <Field label="Notes" optional>{(f) => <Input {...f} />}</Field>
                <Field label="Title" optional required>{(f) => <Input {...f} />}</Field>
            </>,
        );
        expect(screen.getByRole('textbox', { name: 'Notes (optional)' })).not.toHaveAttribute('aria-required');
        const title = screen.getByRole('textbox', { name: 'Title' });
        expect(title).toHaveAttribute('aria-required', 'true');
        expect(document.getElementById(`${title.id}-label`)).not.toHaveTextContent('(optional)');
    });

    it('keeps a visually hidden label as the accessible name (filter bars)', () => {
        renderWithoutProviders(
            <Field label="Search risks" labelVisuallyHidden>{(f) => <Input {...f} placeholder="Search…" />}</Field>,
        );
        const input = screen.getByRole('textbox', { name: 'Search risks' });
        expect(document.getElementById(`${input.id}-label`)).toHaveClass('sr-only');
    });

    it('renders the inline layout with the control before its label and messages', () => {
        renderWithoutProviders(
            <Field layout="inline" label="Accept terms" help="Required once" error="Accept to continue">
                {(f) => <input type="checkbox" {...f} />}
            </Field>,
        );
        const checkbox = screen.getByRole('checkbox', { name: 'Accept terms' });
        const label = document.getElementById(`${checkbox.id}-label`);
        expect(label).not.toBeNull();
        expect(checkbox.compareDocumentPosition(label as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(checkbox).toHaveAccessibleDescription('Required once Accept to continue');
    });

    it.each(THEMES)('has no axe violations in the $name theme', async ({ className }) => {
        const { container } = render(
            <div className={className}>
                <Field label="Environment" required help="Where it runs" error="Pick one">
                    {(field) => <Input {...field} />}
                </Field>
            </div>,
        );
        expect(within(container).getByRole('textbox', { name: 'Environment' })).toBeInTheDocument();
        await expectNoAxeViolations(container);
    });
});
