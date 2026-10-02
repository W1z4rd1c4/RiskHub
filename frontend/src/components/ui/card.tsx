import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Card surfaces (audit 2026-09-30 §4.10, D5): `glass` is the canonical,
 * theme-aware card surface. Rules:
 *
 * - a page section is a `Card` with a `CardHeader` whose title is an `h2`;
 * - never nest `glass` in `glass`: an inner panel uses `tone="nested"`;
 * - never double-pad: pick one `padding` step on the card instead of adding
 *   padding to its children (`padding="none"` for edge-to-edge tables).
 */
const CARD_PADDING = {
    none: 'p-0',
    compact: 'p-4',
    default: 'p-6',
} as const;

/** Cards use the 16px radius; nested panels the 14px radius (tailwind.config.js radius roles). */
const CARD_TONE = {
    default: 'glass rounded-2xl',
    nested: 'rounded-xl border border-border bg-nested text-nested-foreground',
} as const;

export type CardPadding = keyof typeof CARD_PADDING;
export type CardTone = keyof typeof CARD_TONE;

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
    /**
     * Rendered element. `button` makes the whole card one native action (group
     * cards that open a drill-down): it gets `type="button"`, a full-width
     * left-aligned layout and the shared focus ring, and keeps the card's own
     * padding, radius and icon sizes (unlike a `Button` restyled as a card).
     */
    as?: 'section' | 'div' | 'article' | 'button';
    /** `none` p-0 · `compact` p-4 · `default` p-6. */
    padding?: CardPadding;
    /** Hover lift for clickable cards (the `interactive-card` recipe). */
    interactive?: boolean;
    /** `default` = glass surface; `nested` = solid inner panel inside another card. */
    tone?: CardTone;
}

export const Card = React.forwardRef<HTMLElement, CardProps>(
    ({ as: Component = 'div', padding = 'default', interactive = false, tone = 'default', className, ...props }, ref) => {
        const isButton = Component === 'button';
        return (
            <Component
                ref={ref as React.Ref<HTMLButtonElement & HTMLDivElement>}
                {...(isButton ? { type: 'button' as const } : null)}
                {...props}
                className={cn(
                    CARD_TONE[tone],
                    CARD_PADDING[padding],
                    interactive && 'interactive-card',
                    isButton && 'block w-full text-left focus-ring',
                    className,
                )}
            />
        );
    },
);
Card.displayName = 'Card';

/** Heading roles (§4.5): section title `h2`, card / subsection title `h3`. */
const CARD_TITLE_CLASS = {
    h2: 'font-heading text-xl font-semibold text-foreground',
    h3: 'font-heading text-base font-semibold text-foreground',
} as const;

export type CardTitleLevel = keyof typeof CARD_TITLE_CLASS;

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
    as?: CardTitleLevel;
}

export const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
    ({ as: Heading = 'h2', className, ...props }, ref) => (
        <Heading ref={ref} {...props} className={cn(CARD_TITLE_CLASS[Heading], className)} />
    ),
);
CardTitle.displayName = 'CardTitle';

export interface CardHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
    title: React.ReactNode;
    /** Heading level of the title; follow the document outline (default `h2`). */
    titleAs?: CardTitleLevel;
    /** Optional id for the title, e.g. to name the card via `aria-labelledby`. */
    titleId?: string;
    /** Decorative icon before the title. */
    icon?: LucideIcon;
    /** Uppercase eyebrow above the title (`.text-eyebrow`). */
    eyebrow?: React.ReactNode;
    description?: React.ReactNode;
    /** Trailing actions (buttons, links). */
    actions?: React.ReactNode;
}

export function CardHeader({
    title,
    titleAs = 'h2',
    titleId,
    icon: Icon,
    eyebrow,
    description,
    actions,
    className,
    ...props
}: CardHeaderProps) {
    return (
        <div {...props} className={cn('mb-4 flex items-start justify-between gap-4', className)}>
            <div className="min-w-0 space-y-1">
                {eyebrow ? <p className="text-eyebrow">{eyebrow}</p> : null}
                <CardTitle as={titleAs} id={titleId} className={cn(Icon && 'flex items-center gap-2')}>
                    {Icon ? <Icon aria-hidden="true" className="size-5 shrink-0 text-accent-text" /> : null}
                    {title}
                </CardTitle>
                {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
    );
}

export type CardBodyProps = React.HTMLAttributes<HTMLDivElement>;

export function CardBody({ className, ...props }: CardBodyProps) {
    return <div {...props} className={cn('min-w-0', className)} />;
}

export type CardFooterProps = React.HTMLAttributes<HTMLDivElement>;

/** Footer actions: `border-t border-border pt-4 flex justify-end gap-3`. */
export function CardFooter({ className, ...props }: CardFooterProps) {
    return <div {...props} className={cn('mt-4 flex justify-end gap-3 border-t border-border pt-4', className)} />;
}
