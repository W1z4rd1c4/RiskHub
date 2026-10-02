import * as React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/hooks';
import { toneClass, type Tone } from '@/lib/tones';
import { cn } from '@/lib/utils';

/**
 * Inline message / banner (audit 2026-09-30 §4.10, AX-05, D9).
 *
 * Announcement follows the tone unless `live` overrides it:
 * `danger` → `role="alert"` (assertive); every other tone → `role="status"`
 * (polite); `live="off"` renders a static note with no live role.
 *
 * Use it for blocking errors scoped to the failing region and for persistent
 * notices (pending approval, archived). Transient success belongs in a toast.
 */
export type InlineMessageTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';
export type InlineMessageLive = 'polite' | 'assertive' | 'off';

const TONE_ICON: Readonly<Record<InlineMessageTone, LucideIcon>> = {
    info: Info,
    success: CheckCircle2,
    warning: AlertTriangle,
    danger: AlertCircle,
    neutral: Info,
};

/** InlineMessage tones are a subset of the semantic tones in `lib/tones.ts`. */
const TONE_TOKEN: Readonly<Record<InlineMessageTone, Tone>> = {
    info: 'info',
    success: 'success',
    warning: 'warning',
    danger: 'danger',
    neutral: 'neutral',
};

function liveRole(tone: InlineMessageTone, live: InlineMessageLive | undefined): 'alert' | 'status' | undefined {
    if (live === 'off') return undefined;
    if (live === 'assertive') return 'alert';
    if (live === 'polite') return 'status';
    return tone === 'danger' ? 'alert' : 'status';
}

export interface InlineMessageProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title' | 'role'> {
    tone: InlineMessageTone;
    title?: React.ReactNode;
    children?: React.ReactNode;
    /** Inline actions under the message (e.g. a retry `Button`). */
    action?: React.ReactNode;
    /** Renders a named dismiss button (compact icon button). */
    onDismiss?: () => void;
    /** Accessible name of the dismiss button; defaults to `common:actions.dismiss_message`. */
    dismissLabel?: string;
    /** Overrides the tone-derived live role (see the module comment). */
    live?: InlineMessageLive;
    /** Replaces the tone icon; `null` hides it. */
    icon?: LucideIcon | null;
}

export const InlineMessage = React.forwardRef<HTMLDivElement, InlineMessageProps>(
    ({ tone, title, children, action, onDismiss, dismissLabel, live, icon, className, ...props }, ref) => {
        const { t } = useTranslation('common');
        const Icon = icon === null ? null : (icon ?? TONE_ICON[tone]);

        return (
            <div
                ref={ref}
                {...props}
                role={liveRole(tone, live)}
                data-tone={tone}
                className={cn(
                    'flex items-start gap-3 rounded-xl border p-4 text-sm',
                    toneClass(TONE_TOKEN[tone], 'badge'),
                    className,
                )}
            >
                {Icon ? <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" /> : null}
                <div className="min-w-0 flex-1">
                    {title ? <p className="font-semibold">{title}</p> : null}
                    {children ? <div className={cn(title ? 'mt-1' : undefined)}>{children}</div> : null}
                    {action ? <div className="mt-3 flex flex-wrap items-center gap-2">{action}</div> : null}
                </div>
                {onDismiss ? (
                    <Button
                        variant="ghost"
                        size="iconCompact"
                        aria-label={dismissLabel ?? t('actions.dismiss_message')}
                        onClick={onDismiss}
                        className="-my-1.5 -mr-1.5 shrink-0 text-current hover:text-current"
                    >
                        <X aria-hidden="true" />
                    </Button>
                ) : null}
            </div>
        );
    },
);
InlineMessage.displayName = 'InlineMessage';
