import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { toneClass, type Tone } from '@/lib/tones';
import { cn } from '@/lib/utils';

/**
 * Toast primitives on `@radix-ui/react-toast` (audit 2026-09-30 §4.16, D9).
 *
 * Feature code never renders these directly: it calls `useFeedback()` and the
 * app-root `FeedbackProvider` renders the queue. The primitives own the look:
 * a `bg-popover` card with the popover shadow and a tone icon, stacked in a
 * bottom-right viewport above every other layer (`z-toast`). The viewport
 * itself ignores the pointer, so an empty corner never blocks the page.
 *
 * Announcements come from Radix: `type="foreground"` → assertive,
 * `type="background"` → polite (`ToastTone` → type mapping lives in
 * `toastAnnouncementType`).
 */
export type ToastTone = Extract<Tone, 'success' | 'info' | 'warning' | 'danger'>;

const TONE_ICON: Readonly<Record<ToastTone, LucideIcon>> = {
    success: CheckCircle2,
    info: Info,
    warning: AlertTriangle,
    danger: AlertCircle,
};

/** Danger interrupts (assertive); every other tone waits its turn (polite). */
export function toastAnnouncementType(tone: ToastTone): 'foreground' | 'background' {
    return tone === 'danger' ? 'foreground' : 'background';
}

export const ToastProvider = ToastPrimitive.Provider;

export const ToastViewport = React.forwardRef<
    React.ElementRef<typeof ToastPrimitive.Viewport>,
    React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
    <ToastPrimitive.Viewport
        ref={ref}
        className={cn(
            'pointer-events-none fixed bottom-0 right-0 z-toast m-0 flex max-h-screen w-full list-none flex-col gap-2 p-4 outline-none sm:max-w-sm',
            className,
        )}
        {...props}
    />
));
ToastViewport.displayName = 'ToastViewport';

export interface ToastProps extends React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root> {
    tone: ToastTone;
}

export const Toast = React.forwardRef<React.ElementRef<typeof ToastPrimitive.Root>, ToastProps>(
    ({ tone, className, children, ...props }, ref) => {
        const Icon = TONE_ICON[tone];
        return (
            <ToastPrimitive.Root
                ref={ref}
                type={toastAnnouncementType(tone)}
                data-tone={tone}
                className={cn(
                    'pointer-events-auto relative flex w-full items-start gap-3 rounded-xl border border-border bg-popover p-4 pr-12 text-sm text-popover-foreground shadow-popover',
                    // Follow the pointer while swiping; a dismissing swipe fades out where it was released.
                    'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[swipe=cancel]:translate-x-0',
                    'data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]',
                    'motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in motion-safe:data-[state=open]:slide-in-from-right-full',
                    'motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out',
                    className,
                )}
                {...props}
            >
                <Icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', toneClass(tone, 'text'))} />
                <div className="min-w-0 flex-1">{children}</div>
            </ToastPrimitive.Root>
        );
    },
);
Toast.displayName = 'Toast';

export const ToastTitle = React.forwardRef<
    React.ElementRef<typeof ToastPrimitive.Title>,
    React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
    <ToastPrimitive.Title ref={ref} className={cn('font-semibold text-popover-foreground', className)} {...props} />
));
ToastTitle.displayName = 'ToastTitle';

export const ToastDescription = React.forwardRef<
    React.ElementRef<typeof ToastPrimitive.Description>,
    React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
    <ToastPrimitive.Description ref={ref} className={cn('mt-1 text-muted-foreground', className)} {...props} />
));
ToastDescription.displayName = 'ToastDescription';

export interface ToastActionProps {
    /** Visible label; also the `altText` screen readers get for the action. */
    label: string;
    onClick: () => void;
}

/** One optional follow-up action ("Undo", "View approvals"); activating it closes the toast. */
export function ToastAction({ label, onClick }: ToastActionProps) {
    return (
        <ToastPrimitive.Action altText={label} asChild>
            <Button variant="outline" size="compact" className="mt-3" onClick={onClick}>
                {label}
            </Button>
        </ToastPrimitive.Action>
    );
}

export function ToastClose({ label }: { label: string }) {
    return (
        <ToastPrimitive.Close asChild>
            <Button
                variant="ghost"
                size="iconCompact"
                aria-label={label}
                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
            >
                <X aria-hidden="true" />
            </Button>
        </ToastPrimitive.Close>
    );
}
