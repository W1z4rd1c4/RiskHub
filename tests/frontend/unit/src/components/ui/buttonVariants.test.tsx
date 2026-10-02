import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button, buttonVariants, type ButtonVariant } from '@/components/ui/button';
import { renderWithoutProviders, screen } from '@test/render';

/**
 * Audit 2026-09-30 §4.7 / roadmap 1.4 (D4, DS-09, DS-29): the Button variant
 * and size contract. `accent` is THE primary CTA and the default; the
 * outline/ghost/secondary hovers use the neutral tint instead of a saturated
 * fill, and `link` reads in the accent-text role.
 */

const VARIANT_TOKENS: Record<ButtonVariant, string[]> = {
    accent: ['bg-accent', 'text-accent-foreground', 'hover:bg-accent-hover'],
    secondary: ['bg-secondary', 'text-secondary-foreground', 'border', 'border-border', 'hover:bg-tint/10'],
    outline: ['border', 'border-input', 'bg-transparent'],
    ghost: ['hover:text-foreground'],
    destructive: ['bg-destructive', 'text-destructive-foreground'],
    warning: ['bg-warning', 'text-warning-foreground'],
    success: ['bg-success', 'text-success-foreground'],
    link: ['text-accent-text', 'underline-offset-4', 'hover:underline'],
};

describe('Button variants', () => {
    it.each(Object.entries(VARIANT_TOKENS))('renders the %s variant with semantic tokens only', (variant, tokens) => {
        renderWithoutProviders(<Button variant={variant as ButtonVariant}>Action</Button>);
        const button = screen.getByRole('button', { name: 'Action' });
        for (const token of tokens) {
            expect(button.className.split(/\s+/)).toContain(token);
        }
        // Theme via tokens only: no raw palette shades and no `dark:` variant (D14).
        expect(button.className).not.toMatch(/\b(?:bg|text|border)-(?:white|black|slate|gray|red|blue|emerald|amber)-?/);
        expect(button.className).not.toMatch(/\bdark:/);
    });

    it('falls back to the accent variant for unspecified callers (the `default` alias is gone)', () => {
        renderWithoutProviders(<Button>Primary</Button>);
        const classes = screen.getByRole('button', { name: 'Primary' }).className.split(/\s+/);
        expect(classes).toContain('bg-accent');
        expect(classes).not.toContain('bg-primary');
    });

    it.each(['outline', 'ghost'] as const)('%s hover uses a neutral tint, not the saturated accent fill (DS-29)', (variant) => {
        const cls = buttonVariants({ variant });
        expect(cls).not.toContain('hover:bg-accent');
        expect(cls).not.toContain('hover:text-accent-foreground');
        expect(cls).toContain('hover:bg-tint/10');
        expect(cls).toContain('hover:text-foreground');
    });

    it.each(Object.keys(VARIANT_TOKENS))('%s uses the shared focus-ring utility (§4.6)', (variant) => {
        const cls = buttonVariants({ variant: variant as ButtonVariant }).split(/\s+/);
        expect(cls).toContain('focus-ring');
        expect(cls).not.toContain('focus-visible:ring-1');
    });
});

describe('Button sizes', () => {
    it.each([
        ['default', 'h-10'],
        ['lg', 'h-11'],
        ['compact', 'h-8'],
    ] as const)('size %s renders %s geometry', (size, height) => {
        renderWithoutProviders(<Button size={size}>Sized</Button>);
        expect(screen.getByRole('button', { name: 'Sized' }).className.split(/\s+/)).toContain(height);
    });

    it.each([
        ['icon', 'w-10'],
        ['iconCompact', 'w-8'],
    ] as const)('icon-only size %s is square and named by aria-label', (size, width) => {
        renderWithoutProviders(
            <Button size={size} aria-label="Remove filter">
                <svg aria-hidden="true" />
            </Button>,
        );
        const button = screen.getByRole('button', { name: 'Remove filter' });
        expect(button.className.split(/\s+/)).toContain(width);
    });

    it('icon-only buttons can be named by aria-labelledby', () => {
        renderWithoutProviders(
            <>
                <span id="external-name">Close panel</span>
                <Button size="iconCompact" aria-labelledby="external-name">
                    <svg aria-hidden="true" />
                </Button>
            </>,
        );
        expect(screen.getByRole('button', { name: 'Close panel' })).toBeInTheDocument();
    });
});

describe('Button loading state', () => {
    it('keeps the text name, adds an aria-hidden spinner, aria-busy and disables', () => {
        renderWithoutProviders(<Button variant="accent" isLoading>Save</Button>);
        const button = screen.getByRole('button', { name: 'Save' });
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('aria-busy', 'true');
        const spinner = button.querySelector('svg.animate-spin');
        expect(spinner).not.toBeNull();
        expect(spinner).toHaveAttribute('aria-hidden', 'true');
    });

    it('replaces the icon of an icon-only button with the spinner while loading', () => {
        renderWithoutProviders(
            <Button size="icon" aria-label="Export" isLoading>
                <svg aria-hidden="true" data-testid="export-icon" />
            </Button>,
        );
        const button = screen.getByRole('button', { name: 'Export' });
        expect(screen.queryByTestId('export-icon')).toBeNull();
        expect(button.querySelectorAll('svg')).toHaveLength(1);
        expect(button.querySelector('svg.animate-spin')).not.toBeNull();
    });

    it('does not set aria-busy when idle unless the caller asks for it', () => {
        renderWithoutProviders(<Button>Idle</Button>);
        expect(screen.getByRole('button', { name: 'Idle' })).not.toHaveAttribute('aria-busy');
    });
});

describe('Button keyboard', () => {
    it('activates with Enter and Space and is skipped while loading', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        const { rerender } = renderWithoutProviders(<Button variant="accent" onClick={onClick}>Submit</Button>);

        await user.tab();
        expect(screen.getByRole('button', { name: 'Submit' })).toHaveFocus();
        await user.keyboard('{Enter}');
        await user.keyboard(' ');
        expect(onClick).toHaveBeenCalledTimes(2);

        rerender(<Button variant="accent" onClick={onClick} isLoading>Submit</Button>);
        await user.click(screen.getByRole('button', { name: 'Submit' }));
        expect(onClick).toHaveBeenCalledTimes(2);
    });
});
