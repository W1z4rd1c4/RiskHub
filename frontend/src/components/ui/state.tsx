import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, Inbox, Loader2, RefreshCw, SearchX, ShieldX, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { InlineMessage } from '@/components/ui/inline-message';
import { useTranslation } from '@/i18n/hooks';
import type { Namespace } from '@/i18n/types';
import { cn } from '@/lib/utils';

/**
 * Page and region states (audit 2026-09-30 §4.15, DS-17, GAP-C-11, GAP-D-20).
 *
 * Every query-backed region renders exactly one of: `LoadingState` (first
 * load), `ErrorState` (error without data), `ErrorState variant="banner"` above
 * stale data (refetch error), `EmptyState`, or the data. An error never falls
 * through to an empty state. Pick the branch with `resolveCollectionOutcome` /
 * `resolveTableErrorContract`; `TableErrorState` is the table-contract adapter
 * over `ErrorState`.
 *
 * `layout` sets the footprint: `page` replaces the whole route content
 * (centred, `min-h-[60vh]`), `section` replaces one card or table (centred,
 * padded), `inline` is a compact left-aligned row inside an existing surface.
 * The primitives add no card surface of their own; wrap them in `Card` when the
 * region needs one. Icons are decorative (`aria-hidden`), colours are tokens.
 */
export type StateLayout = 'page' | 'section' | 'inline';

const LAYOUT_CLASS: Readonly<Record<StateLayout, string>> = {
    page: 'flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center',
    section: 'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
    inline: 'flex flex-wrap items-center gap-2 py-2 text-left text-sm',
};

const SPINNER_SIZE = { sm: 'size-4', md: 'size-5', lg: 'size-8' } as const;

export interface SpinnerProps {
    size?: keyof typeof SPINNER_SIZE;
    /** When set, the spinner is announced (`role="status"` + sr-only label); otherwise it is decorative. */
    label?: string;
    className?: string;
}

/** Loader2 spinner on the accent text token; `size-8` (`lg`) is the page-state size. */
export function Spinner({ size = 'md', label, className }: SpinnerProps) {
    const icon = (
        <Loader2 aria-hidden="true" className={cn('shrink-0 animate-spin text-accent-text', SPINNER_SIZE[size], className)} />
    );
    if (!label) return icon;
    return (
        <span role="status" className="inline-flex items-center">
            {icon}
            <span className="sr-only">{label}</span>
        </span>
    );
}

/** Decorative placeholder block; announce the load with `LoadingState skeleton`. */
export function Skeleton({ className }: { className?: string }) {
    return <div aria-hidden="true" className={cn('animate-pulse rounded-lg bg-tint/10', className)} />;
}

export interface LoadingStateProps {
    layout?: StateLayout;
    /** Translated label; defaults to `common:loading.generic`. */
    label?: string;
    /** Skeleton markup shown instead of the spinner; the label stays available to screen readers. */
    skeleton?: ReactNode;
    className?: string;
    /** `data-testid` on the wrapper that holds the live region and the busy placeholder. */
    testId?: string;
}

/**
 * First-load state of a region. The label sits in a polite `role="status"`
 * live region that never carries `aria-busy` and never sits inside a busy
 * element: assistive technology holds back the updates of a busy region, so a
 * busy status would not be announced before the content replaces it. The
 * spinner or skeleton is the placeholder for the content being loaded and
 * carries `aria-busy="true"` (`data-loading-placeholder`). A region that keeps
 * its content mounted while it refetches sets `aria-busy` on that content
 * container itself and keeps any status text outside it.
 */
export function LoadingState({ layout = 'section', label, skeleton, className, testId }: LoadingStateProps) {
    const { t } = useTranslation('common');
    const resolvedLabel = label ?? t('loading.generic');

    if (skeleton) {
        return (
            <div data-testid={testId} className={cn('w-full', className)}>
                <p role="status" aria-live="polite" className="sr-only">{resolvedLabel}</p>
                <div aria-busy="true" aria-hidden="true" data-loading-placeholder="">{skeleton}</div>
            </div>
        );
    }

    return (
        <div data-testid={testId} className={cn(LAYOUT_CLASS[layout], className)}>
            <span aria-busy="true" data-loading-placeholder="" className="inline-flex">
                <Spinner size={layout === 'inline' ? 'sm' : 'lg'} />
            </span>
            <p role="status" aria-live="polite" className="text-sm font-medium text-muted-foreground">
                {resolvedLabel}
            </p>
        </div>
    );
}

export type EmptyStateKind = 'no-data' | 'no-results';

const EMPTY_ICON: Readonly<Record<EmptyStateKind, LucideIcon>> = {
    'no-data': Inbox,
    'no-results': SearchX,
};

export interface EmptyStateProps {
    layout?: StateLayout;
    /** Replaces the kind icon; `null` hides it. */
    icon?: LucideIcon | null;
    title: ReactNode;
    description?: ReactNode;
    /** `no-data`: nothing exists yet; `no-results`: filters or search matched nothing. */
    kind?: EmptyStateKind;
    action?: ReactNode;
    className?: string;
    testId?: string;
}

export function EmptyState({
    layout = 'section',
    icon,
    title,
    description,
    kind = 'no-data',
    action,
    className,
    testId,
}: EmptyStateProps) {
    const Icon = icon === null ? null : (icon ?? EMPTY_ICON[kind]);
    const isInline = layout === 'inline';

    return (
        <div role="status" data-kind={kind} data-testid={testId} className={cn(LAYOUT_CLASS[layout], className)}>
            {Icon ? (
                <Icon aria-hidden="true" className={cn('shrink-0 text-muted-foreground', isInline ? 'size-4' : 'size-12')} />
            ) : null}
            <div className={cn(!isInline && 'space-y-1')}>
                <p className={cn('text-foreground', isInline ? 'text-sm' : 'font-medium')}>{title}</p>
                {description ? (
                    <p className={cn('text-sm text-muted-foreground', !isInline && 'mx-auto max-w-md')}>{description}</p>
                ) : null}
            </div>
            {action ? <div className="flex flex-wrap items-center justify-center gap-3">{action}</div> : null}
        </div>
    );
}

export interface ErrorStateProps {
    layout?: StateLayout;
    /** `block` replaces the region (no data); `banner` sits above stale data after a refetch error. */
    variant?: 'block' | 'banner';
    title?: ReactNode;
    /** Translated message; wins over `messageKey`. */
    message?: ReactNode;
    /** Translation key (`common` namespace, or an `errorKeys.*` key); defaults to `errors.load_failed`. */
    messageKey?: string;
    onRetry?: () => void;
    /** Defaults to `common:actions.retry`. */
    retryLabel?: string;
    /**
     * Marks the retry button busy and inert (`aria-disabled`, clicks ignored) and
     * spins its icon while a retry is in flight. The button stays focusable, so
     * keyboard focus is not lost mid-retry.
     */
    isRetrying?: boolean;
    /** Extra actions after Retry, e.g. a `BackButton`. */
    actions?: ReactNode;
    className?: string;
    testId?: string;
}

export function ErrorState({
    layout = 'section',
    variant = 'block',
    title,
    message,
    messageKey,
    onRetry,
    retryLabel,
    isRetrying = false,
    actions,
    className,
    testId,
}: ErrorStateProps) {
    const { t } = useTranslation('common');
    const resolvedMessage = message ?? t(messageKey ?? 'errors.load_failed');
    const isCompact = variant === 'banner' || layout === 'inline';

    const retryButton = onRetry ? (
        <Button
            variant="outline"
            size={isCompact ? 'compact' : 'default'}
            onClick={isRetrying ? undefined : onRetry}
            aria-disabled={isRetrying || undefined}
            aria-busy={isRetrying || undefined}
            className={cn(isRetrying && 'cursor-not-allowed opacity-70')}
        >
            <RefreshCw aria-hidden="true" className={cn(isRetrying && 'animate-spin')} />
            {retryLabel ?? t('actions.retry')}
        </Button>
    ) : null;
    const actionRow = retryButton || actions ? (
        <>
            {retryButton}
            {actions}
        </>
    ) : null;

    if (variant === 'banner') {
        return (
            <InlineMessage tone="danger" title={title} action={actionRow} className={className} data-testid={testId}>
                {resolvedMessage}
            </InlineMessage>
        );
    }

    if (layout === 'inline') {
        return (
            <div role="alert" data-testid={testId} className={cn(LAYOUT_CLASS.inline, className)}>
                <AlertCircle aria-hidden="true" className="size-4 shrink-0 text-destructive" />
                {title ? <span className="font-medium text-foreground">{title}</span> : null}
                <span className={title ? 'text-muted-foreground' : 'text-foreground'}>{resolvedMessage}</span>
                {actionRow}
            </div>
        );
    }

    return (
        <div role="alert" data-testid={testId} className={cn(LAYOUT_CLASS[layout], className)}>
            <AlertTriangle aria-hidden="true" className="size-12 shrink-0 text-destructive" />
            <div className="space-y-1">
                {title ? <p className="font-semibold text-foreground">{title}</p> : null}
                <p className={cn('mx-auto max-w-md text-sm', title ? 'text-muted-foreground' : 'text-foreground')}>
                    {resolvedMessage}
                </p>
            </div>
            {actionRow ? <div className="flex flex-wrap items-center justify-center gap-3">{actionRow}</div> : null}
        </div>
    );
}

const ACCESS_HEADING = { 1: 'h1', 2: 'h2', 3: 'h3' } as const;

export interface AccessDeniedStateProps {
    layout?: Exclude<StateLayout, 'inline'>;
    /** Translation key for the explanation; defaults to `errors.forbidden`. */
    descriptionKey?: string;
    /** Namespace of `descriptionKey`; defaults to `common`. */
    ns?: Namespace;
    /** Heading text; defaults to `common:access.denied`. */
    title?: ReactNode;
    /** Follow the document outline: `1` when the state replaces a whole route that has no other `h1`. */
    headingLevel?: keyof typeof ACCESS_HEADING;
    /**
     * Announce the state (`role="alert"`) when it can replace content that was
     * already on screen, e.g. a refresh denied after rows were shown. A state
     * rendered on first load stays silent (the route title is announced).
     */
    live?: boolean;
    action?: ReactNode;
    className?: string;
    testId?: string;
}

/** The one access-denied rendering; `pages/shared/ReadAccessDeniedState` is an alias of it. */
export function AccessDeniedState({
    layout = 'page',
    descriptionKey = 'errors.forbidden',
    ns,
    title,
    headingLevel = 2,
    live = false,
    action,
    className,
    testId,
}: AccessDeniedStateProps) {
    const { t } = useTranslation('common');
    const Heading = ACCESS_HEADING[headingLevel];

    return (
        <div role={live ? 'alert' : undefined} data-testid={testId} className={cn(LAYOUT_CLASS[layout], className)}>
            <div className="rounded-2xl bg-destructive/10 p-4">
                <ShieldX aria-hidden="true" className="size-12 text-destructive" />
            </div>
            <Heading className="font-heading text-xl font-semibold text-foreground">{title ?? t('access.denied')}</Heading>
            <p className="max-w-md text-muted-foreground">{t(descriptionKey, ns ? { ns } : undefined)}</p>
            {action ? <div className="flex flex-wrap items-center justify-center gap-3">{action}</div> : null}
        </div>
    );
}
