import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import { severityTone, type SeverityBand } from '@/lib/severity';
import { toneClass, type Tone } from '@/lib/tones';
import { cn } from '@/lib/utils';

/**
 * Badge: the shared visual shell for status pills and chips (audit 2026-09-30
 * §4.9, DS-13; D6 amended: `size="sm"` is the only 11px text besides the eyebrow).
 *
 * The shell is shared; the vocabulary is not. Domain wrappers (status badges,
 * `CriticalityClassPill`, ...) keep choosing the tone and the translated label and
 * render through `Badge`. Colours come from `lib/tones.ts` only:
 *
 * - `soft` (default): the tone's `badge` recipe (`bg-x/10`, paired text token, `border-x/20`).
 * - `solid`: the tone's `fill` recipe with a transparent border.
 * - `outline`: the tone's `text` + `border` recipes on a transparent background.
 *
 * Rules: always render a translated label (never a raw enum); an icon-only or
 * abbreviated badge needs `srLabel`; `md` in tables and headers, `sm` only in
 * dense cells; `shape="rounded"` only for `RiskTypeBadge` and kbd-like chips.
 */
const badgeVariants = cva('inline-flex items-center gap-1 whitespace-nowrap border font-bold', {
    variants: {
        size: {
            sm: 'h-5 px-2 text-2xs uppercase tracking-wide',
            md: 'h-6 px-2.5 text-xs',
        },
        shape: {
            pill: 'rounded-full',
            rounded: 'rounded',
        },
    },
    defaultVariants: {
        size: 'md',
        shape: 'pill',
    },
});

export type BadgeVariant = 'soft' | 'solid' | 'outline';
export type BadgeSize = NonNullable<VariantProps<typeof badgeVariants>['size']>;
export type BadgeShape = NonNullable<VariantProps<typeof badgeVariants>['shape']>;

function badgeToneClass(tone: Tone, variant: BadgeVariant): string {
    if (variant === 'solid') return cn(toneClass(tone, 'fill'), 'border-transparent');
    if (variant === 'outline') return cn('bg-transparent', toneClass(tone, 'text'), toneClass(tone, 'border'));
    return toneClass(tone, 'badge');
}

export interface BadgeProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'> {
    tone?: Tone;
    variant?: BadgeVariant;
    size?: BadgeSize;
    shape?: BadgeShape;
    /** Decorative leading icon (always `aria-hidden`). */
    icon?: LucideIcon;
    /** Leading status dot in the tone's solid colour (decorative). */
    dot?: boolean;
    /**
     * Accessible text for icon-only or abbreviated badges. When set, the visible
     * content is hidden from assistive technology and this text is read instead.
     */
    srLabel?: string;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
    (
        {
            tone = 'neutral',
            variant = 'soft',
            size = 'md',
            shape = 'pill',
            icon: Icon,
            dot = false,
            srLabel,
            className,
            children,
            ...props
        },
        ref,
    ) => {
        const iconSize = size === 'sm' ? 'size-3' : 'size-3.5';
        const visual = (
            <>
                {dot ? (
                    <span
                        aria-hidden="true"
                        data-badge-dot=""
                        className={cn('size-1.5 shrink-0 rounded-full', toneClass(tone, 'dot'))}
                    />
                ) : null}
                {Icon ? <Icon aria-hidden="true" className={cn(iconSize, 'shrink-0')} /> : null}
                {children}
            </>
        );

        return (
            <span
                ref={ref}
                {...props}
                data-tone={tone}
                className={cn(badgeVariants({ size, shape }), badgeToneClass(tone, variant), className)}
            >
                {srLabel ? (
                    <>
                        <span aria-hidden="true" className="inline-flex items-center gap-1">
                            {visual}
                        </span>
                        <span className="sr-only">{srLabel}</span>
                    </>
                ) : (
                    visual
                )}
            </span>
        );
    },
);
Badge.displayName = 'Badge';

/** Literal keys so the i18n usage validator sees every label (`common:severity.*`). */
const SEVERITY_LABEL_KEYS: Readonly<Record<SeverityBand, string>> = {
    low: 'severity.low',
    medium: 'severity.medium',
    high: 'severity.high',
    critical: 'severity.critical',
};

export interface SeverityBadgeProps extends Omit<BadgeProps, 'tone'> {
    band: SeverityBand;
    /**
     * Domain label for the band (already translated). Defaults to the shared
     * `common:severity.<band>` label.
     */
    label?: React.ReactNode;
}

/**
 * The D1 severity scale as a badge: low → success, medium → warning,
 * high → severity-high, critical → danger (via `lib/severity.ts`). Always shows
 * a text label, so colour is never the only signal.
 */
export const SeverityBadge = React.forwardRef<HTMLSpanElement, SeverityBadgeProps>(
    ({ band, label, children, ...props }, ref) => {
        const { t } = useTranslation('common');
        return (
            <Badge ref={ref} {...props} tone={severityTone(band)} data-severity={band}>
                {label ?? children ?? t(SEVERITY_LABEL_KEYS[band])}
            </Badge>
        );
    },
);
SeverityBadge.displayName = 'SeverityBadge';
