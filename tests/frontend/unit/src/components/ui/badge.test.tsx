import type { SVGProps } from 'react';
import { afterAll, describe, expect, it } from 'vitest';

import { Badge, SeverityBadge } from '@/components/ui/badge';
import i18n from '@/i18n';
import { SEVERITY_BANDS } from '@/lib/severity';
import { TONES } from '@/lib/tones';
import { renderWithoutProviders, screen } from '@test/render';

// lucide-react is not resolvable from the external test root; stub icons with
// the same props contract are enough for these assertions.
const CheckCircle2 = (props: SVGProps<SVGSVGElement>) => <svg {...props} />;

/**
 * Audit 2026-09-30 §4.9 / roadmap 1.6 (DS-13, D1, D6 amended): one Badge shell
 * with tone colours from `lib/tones.ts`, two sizes (sm = 11px eyebrow-style,
 * md = 12px) and a severity wrapper on the D1 scale with translated labels.
 */

function classesOf(element: HTMLElement): string[] {
    return element.className.split(/\s+/);
}

describe('Badge', () => {
    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it('defaults to a neutral, soft, md pill', () => {
        renderWithoutProviders(<Badge>Draft</Badge>);
        const badge = screen.getByText('Draft');
        expect(classesOf(badge)).toEqual(
            expect.arrayContaining(['rounded-full', 'h-6', 'px-2.5', 'text-xs', 'border', 'bg-muted', 'text-muted-foreground', 'border-border']),
        );
        expect(badge).toHaveAttribute('data-tone', 'neutral');
    });

    it.each(TONES)('paints the %s tone with semantic tokens only', (tone) => {
        renderWithoutProviders(<Badge tone={tone}>Label</Badge>);
        const badge = screen.getByText('Label');
        expect(badge).toHaveAttribute('data-tone', tone);
        expect(badge.className).not.toMatch(/\b(?:bg|text|border)-(?:white|black|slate|gray|rose|red|amber|emerald|green|blue)-?\d*/);
        expect(badge.className).not.toMatch(/\bdark:/);
    });

    it('maps the soft, solid and outline variants onto the tone recipes', () => {
        renderWithoutProviders(
            <>
                <Badge tone="success">Soft</Badge>
                <Badge tone="success" variant="solid">Solid</Badge>
                <Badge tone="success" variant="outline">Outline</Badge>
            </>,
        );
        expect(classesOf(screen.getByText('Soft'))).toEqual(
            expect.arrayContaining(['bg-success/10', 'text-success-text', 'border-success/20']),
        );
        expect(classesOf(screen.getByText('Solid'))).toEqual(
            expect.arrayContaining(['bg-success', 'text-success-foreground', 'border-transparent']),
        );
        expect(classesOf(screen.getByText('Outline'))).toEqual(
            expect.arrayContaining(['bg-transparent', 'text-success-text', 'border-success']),
        );
    });

    it('keeps sm at the 11px uppercase step (D6) and supports the rounded shape', () => {
        renderWithoutProviders(
            <Badge size="sm" shape="rounded">
                Dense
            </Badge>,
        );
        const badge = screen.getByText('Dense');
        expect(classesOf(badge)).toEqual(expect.arrayContaining(['h-5', 'text-2xs', 'uppercase', 'tracking-wide', 'rounded']));
        expect(classesOf(badge)).not.toContain('rounded-full');
        expect(badge.className).not.toMatch(/text-\[\d+px\]/);
    });

    it('renders a decorative icon and dot', () => {
        renderWithoutProviders(
            <Badge tone="warning" icon={CheckCircle2} dot>
                Pending
            </Badge>,
        );
        const badge = screen.getByText('Pending');
        expect(badge.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
        const dot = badge.querySelector('[data-badge-dot]');
        expect(dot).toHaveAttribute('aria-hidden', 'true');
        expect(dot).toHaveClass('bg-warning');
    });

    it('reads srLabel instead of an abbreviated visible label', () => {
        renderWithoutProviders(<Badge srLabel="High priority">HP</Badge>);
        expect(screen.getByText('HP').closest('[aria-hidden="true"]')).not.toBeNull();
        expect(screen.getByText('High priority')).toHaveClass('sr-only');
    });

    it('passes through test ids and titles', () => {
        renderWithoutProviders(
            <Badge data-testid="status" title="Hint">
                OK
            </Badge>,
        );
        expect(screen.getByTestId('status')).toHaveAttribute('title', 'Hint');
    });
});

describe('SeverityBadge', () => {
    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    const BAND_TONE = { low: 'success', medium: 'warning', high: 'severity-high', critical: 'danger' } as const;
    const EN_LABEL = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' } as const;
    const CS_LABEL = { low: 'Nízká', medium: 'Střední', high: 'Vysoká', critical: 'Kritická' } as const;

    it.each(SEVERITY_BANDS)('maps the %s band onto the D1 tone with a translated label', async (band) => {
        await i18n.changeLanguage('en');
        renderWithoutProviders(<SeverityBadge band={band} />);
        const badge = screen.getByText(EN_LABEL[band]);
        expect(badge).toHaveAttribute('data-tone', BAND_TONE[band]);
        expect(badge).toHaveAttribute('data-severity', band);
        // Blue never encodes severity (D1).
        expect(badge.className).not.toMatch(/\b(?:bg|text|border)-(?:info|accent)\b/);
    });

    it.each(SEVERITY_BANDS)('translates the %s label into Czech', async (band) => {
        await i18n.changeLanguage('cs');
        renderWithoutProviders(<SeverityBadge band={band} />);
        expect(screen.getByText(CS_LABEL[band])).toHaveAttribute('data-severity', band);
    });

    it('prefers a domain label over the shared one', async () => {
        await i18n.changeLanguage('en');
        renderWithoutProviders(<SeverityBadge band="high" label="Severe" size="sm" />);
        const badge = screen.getByText('Severe');
        expect(badge).toHaveClass('bg-severity-high/10', 'text-severity-high-text', 'text-2xs');
        expect(screen.queryByText('High')).not.toBeInTheDocument();
    });
});
