import { describe, expect, it } from 'vitest';

import { cn } from '@/lib/utils';

/**
 * `cn()` must resolve conflicts with the named design-token scales added to
 * tailwind.config.js (audit 2026-09-30 §4.5–4.6), so a primitive's token class
 * and a caller override never both survive, and `.text-eyebrow` is never
 * mistaken for a text colour.
 */
describe('cn with design-token scales', () => {
    it.each([
        [['shadow-popover', 'shadow-sm'], 'shadow-sm'],
        [['shadow-sm', 'shadow-glass'], 'shadow-glass'],
        [['z-modal', 'z-10'], 'z-10'],
        [['z-10', 'z-modal-overlay'], 'z-modal-overlay'],
        [['duration-base', 'duration-300'], 'duration-300'],
        [['max-w-page', 'max-w-5xl'], 'max-w-5xl'],
        [['max-w-prose', 'max-w-form'], 'max-w-form'],
        [['text-2xs', 'text-sm'], 'text-sm'],
        [['rounded', 'rounded-lg'], 'rounded-lg'],
        [['bg-overlay', 'bg-tint/10'], 'bg-tint/10'],
        [['shadow-popover', 'shadow-none'], 'shadow-none'],
        [['z-[9999]', 'z-modal'], 'z-modal'],
        [['duration-fast', 'duration-slow'], 'duration-slow'],
        [['bg-severity-high/10', 'bg-warning/10'], 'bg-warning/10'],
        [['text-heat-0-foreground', 'text-heat-4-foreground'], 'text-heat-4-foreground'],
    ])('%j merges to %s', (inputs, expected) => {
        expect(cn(...inputs)).toBe(expected);
    });

    it('keeps the eyebrow recipe next to a text colour override', () => {
        expect(cn('text-eyebrow', 'text-foreground')).toBe('text-eyebrow text-foreground');
        expect(cn('text-2xs', 'text-muted-foreground')).toBe('text-2xs text-muted-foreground');
    });

    it.each([
        ['max-w-form', 'max-h-screen'],
        ['max-w-page', 'w-full'],
        ['z-modal', 'duration-base'],
        ['stroke-chart-1', 'stroke-2'],
        ['text-severity-high-foreground', 'text-2xs'],
        ['font-heading', 'font-bold'],
        ['bg-heat-3', 'text-heat-3-foreground'],
        ['focus-ring', 'ring-offset-2'],
    ])('keeps the unrelated pair %s + %s', (first, second) => {
        expect(cn(first, second)).toBe(`${first} ${second}`);
    });

    it('lets a later text-eyebrow replace the typography utilities that would beat it in CSS', () => {
        // `.text-eyebrow` lives in @layer components, so an earlier base utility
        // (e.g. a primitive's `text-sm`) would otherwise silently win.
        expect(cn('text-sm leading-6 font-medium normal-case tracking-tight text-foreground', 'text-eyebrow')).toBe(
            'text-eyebrow',
        );
        // Unrelated classes survive; a later utility still overrides on purpose.
        expect(cn('px-2 rounded bg-muted border-border', 'text-eyebrow')).toBe(
            'px-2 rounded bg-muted border-border text-eyebrow',
        );
        expect(cn('text-eyebrow', 'text-sm')).toBe('text-eyebrow text-sm');
    });

    it('keeps shadow-colour utilities separate from the token shadows', () => {
        expect(cn('shadow-popover', 'shadow-accent/20')).toBe('shadow-popover shadow-accent/20');
    });
});
