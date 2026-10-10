/**
 * Semantic tones → Tailwind class recipes (audit 2026-09-30 §4.4 A, ADR-015
 * Decision 1 and Addendum 1).
 *
 * Callers express meaning (`tone="danger"`); only this module, `lib/severity.ts`
 * and `components/ui/*` map meaning to token classes (audit principle P7).
 * Every recipe uses the semantic theme tokens declared in `index.css` and wired
 * in `tailwind.config.js`, so all three themes follow automatically.
 *
 * Recipes carry colour only. Geometry (border width, radius, padding, type
 * size) belongs to the consuming primitive, e.g. `Badge` adds `border`.
 *
 * Class strings are written out in full on purpose: Tailwind's JIT scanner only
 * generates classes that appear literally in the source.
 */
import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    type LucideIcon,
    ShieldQuestion,
    Sparkles,
} from 'lucide-react';

export const TONES = ['neutral', 'info', 'success', 'warning', 'severity-high', 'danger', 'accent'] as const;
export type Tone = (typeof TONES)[number];

/**
 * Surfaces a tone (or a severity band, see `lib/severity.ts`) can paint.
 *
 * - `badge`: soft pill / chip (`bg-x/10`, paired text token, `border-x/20`).
 * - `fill`: solid fill with its contract-tested foreground.
 * - `matrix-cell`: heatmap / matrix cell fill (`/40`, `/60` on hover).
 * - `card`: soft surface tint with paired text (score cards, callouts).
 * - `text`: text colour only.
 * - `slider`: native range / checkbox `accent-color`.
 * - `border`: solid border colour (accent edges, outlines).
 * - `dot`: solid swatch for legends and status dots.
 */
export const TONE_VARIANTS = ['badge', 'fill', 'matrix-cell', 'card', 'text', 'slider', 'border', 'dot'] as const;
export type ToneVariant = (typeof TONE_VARIANTS)[number];

export const TONE_CLASSES: Readonly<Record<Tone, Readonly<Record<ToneVariant, string>>>> = {
    neutral: {
        badge: 'bg-muted text-muted-foreground border-border',
        fill: 'bg-muted text-muted-foreground',
        'matrix-cell': 'bg-muted-foreground/20 hover:bg-muted-foreground/30',
        card: 'bg-muted text-muted-foreground',
        text: 'text-muted-foreground',
        slider: 'accent-muted-foreground',
        border: 'border-border',
        dot: 'bg-muted-foreground',
    },
    info: {
        badge: 'bg-info/10 text-accent-text border-info/20',
        fill: 'bg-info text-info-foreground',
        'matrix-cell': 'bg-info/40 hover:bg-info/60',
        card: 'bg-info/10 text-accent-text',
        text: 'text-accent-text',
        slider: 'accent-info',
        border: 'border-info',
        dot: 'bg-info',
    },
    success: {
        badge: 'bg-success/10 text-success-text border-success/20',
        fill: 'bg-success text-success-foreground',
        'matrix-cell': 'bg-success/40 hover:bg-success/60',
        card: 'bg-success/10 text-success-text',
        text: 'text-success-text',
        slider: 'accent-success',
        border: 'border-success',
        dot: 'bg-success',
    },
    warning: {
        badge: 'bg-warning/10 text-warning-text border-warning/20',
        fill: 'bg-warning text-warning-foreground',
        'matrix-cell': 'bg-warning/40 hover:bg-warning/60',
        card: 'bg-warning/10 text-warning-text',
        text: 'text-warning-text',
        slider: 'accent-warning',
        border: 'border-warning',
        dot: 'bg-warning',
    },
    'severity-high': {
        badge: 'bg-severity-high/10 text-severity-high-text border-severity-high/20',
        fill: 'bg-severity-high text-severity-high-foreground',
        'matrix-cell': 'bg-severity-high/40 hover:bg-severity-high/60',
        card: 'bg-severity-high/10 text-severity-high-text',
        text: 'text-severity-high-text',
        slider: 'accent-severity-high',
        border: 'border-severity-high',
        dot: 'bg-severity-high',
    },
    danger: {
        badge: 'bg-destructive/10 text-destructive border-destructive/20',
        fill: 'bg-destructive text-destructive-foreground',
        'matrix-cell': 'bg-destructive/40 hover:bg-destructive/60',
        card: 'bg-destructive/10 text-destructive',
        text: 'text-destructive',
        slider: 'accent-destructive',
        border: 'border-destructive',
        dot: 'bg-destructive',
    },
    accent: {
        badge: 'bg-accent/10 text-accent-text border-accent/20',
        fill: 'bg-accent text-accent-foreground',
        'matrix-cell': 'bg-accent/40 hover:bg-accent/60',
        card: 'bg-accent/10 text-accent-text',
        text: 'text-accent-text',
        slider: 'accent-accent',
        border: 'border-accent',
        dot: 'bg-accent',
    },
};

/**
 * The CSS custom property that carries each tone's base colour, for canvas,
 * SVG and Recharts consumers (read it through `lib/cssTokens.ts`).
 */
export const TONE_CSS_VAR: Readonly<Record<Tone, `--${string}`>> = {
    neutral: '--muted-foreground',
    info: '--info',
    success: '--success',
    warning: '--warning',
    'severity-high': '--severity-high',
    danger: '--destructive',
    accent: '--accent',
};

export function toneClass(tone: Tone, variant: ToneVariant): string {
    return TONE_CLASSES[tone][variant];
}

export function isTone(value: unknown): value is Tone {
    return typeof value === 'string' && (TONES as readonly string[]).includes(value);
}

/**
 * Lifecycle / monitoring / outcome status tones (audit §4.4 A). Domain
 * presentation modules map *status → StatusTone*; severity bands use
 * `lib/severity.ts` instead.
 */
export type StatusTone = Extract<Tone, 'success' | 'warning' | 'danger' | 'info' | 'neutral'>;

export interface BadgeTone {
    badgeClassName: string;
    textClassName: string;
    gaugeToneClassName: string;
    gaugeZoneClassName: string;
    icon: LucideIcon;
}

/**
 * Canonical status-tone presentation (moved here from `lib/monitoringStatus.ts`,
 * which builds its monitoring metas on it). `badgeClassName` is the tone's `badge` recipe plus the
 * `border` width, kept byte-identical to the pre-move strings.
 */
export const BADGE_TONES: Readonly<Record<StatusTone, BadgeTone>> = {
    success: {
        badgeClassName: 'bg-success/10 text-success-text border border-success/20',
        textClassName: 'text-success-text',
        gaugeToneClassName: 'text-success-text',
        gaugeZoneClassName: 'text-success/20',
        icon: CheckCircle2,
    },
    warning: {
        badgeClassName: 'bg-warning/10 text-warning-text border border-warning/20',
        textClassName: 'text-warning-text',
        gaugeToneClassName: 'text-warning-text',
        gaugeZoneClassName: 'text-warning/20',
        icon: Clock3,
    },
    danger: {
        badgeClassName: 'bg-destructive/10 text-destructive border border-destructive/20',
        textClassName: 'text-destructive',
        gaugeToneClassName: 'text-destructive',
        gaugeZoneClassName: 'text-destructive/20',
        icon: AlertTriangle,
    },
    info: {
        badgeClassName: 'bg-info/10 text-accent-text border border-info/20',
        textClassName: 'text-accent-text',
        gaugeToneClassName: 'text-accent-text',
        gaugeZoneClassName: 'text-info/20',
        icon: Sparkles,
    },
    neutral: {
        badgeClassName: 'bg-muted text-muted-foreground border border-border',
        textClassName: 'text-muted-foreground',
        gaugeToneClassName: 'text-muted-foreground',
        gaugeZoneClassName: 'text-muted-foreground/20',
        icon: ShieldQuestion,
    },
};
