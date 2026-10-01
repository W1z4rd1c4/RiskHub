import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    type HTMLAttributes,
    type ReactNode,
    type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

/**
 * DialogShell v2 (audit 2026-09-30 §4.11, D5, DS-07, DS-08, PG-22).
 *
 * The one accessible modal primitive: portal, focus trap, Escape and backdrop
 * close, opener-focus restoration and stacked-dialog layering are unchanged
 * from v1. v2 adds:
 *
 * - a fixed, themed surface (`bg-popover` + `border-border` + `shadow-popover`)
 *   sized by `size`, and the token backdrop `bg-overlay`; dialogs never set
 *   surface colours themselves;
 * - `DialogHeader` / `DialogBody` / `DialogFooter` (also reachable as
 *   `DialogShell.Header` / `.Body` / `.Footer`), which read the shell's title
 *   id and guarded close from context;
 * - close guards: `closeDisabled` / `isBusy` block Escape, backdrop, header
 *   close and footer cancel while a mutation is in flight (PG-22), and
 *   `dirtyGuard` routes every close request through `useDirtyTaskGuard`.
 *
 * The raw class props (`containerClassName`, `backdropClassName`,
 * `contentClassName`) are deprecated and kept only so the existing call sites
 * render unchanged until they migrate (W6/W7): a passed class string replaces
 * the v2 recipe for that layer exactly as in v1. The dialog-inventory contract
 * ratchets their use down (`frontend/scripts/a11y/validate-dialog-inventory.mjs`).
 */

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type DialogTone = 'default' | 'danger' | 'warning' | 'info';
export type DialogFooterIntent = 'accent' | 'destructive' | 'warning';

/**
 * Structural slice of `useDirtyTaskGuard()`'s result. Typed structurally so
 * this primitive does not import the hook (the hook renders a ConfirmDialog,
 * which renders this shell).
 */
export interface DialogDirtyGuard {
    requestLocalLeave: (leave: () => void) => void;
    /** Rendered next to the shell so callers need not place it themselves. */
    confirmationDialog?: ReactNode;
}

export interface DialogShellProps {
    isOpen: boolean;
    onClose: () => void;
    titleId: string;
    descriptionIds?: string[];
    children: ReactNode;
    initialFocusRef?: { current: HTMLElement | null };
    /**
     * ARIA role for the modal surface. `"dialog"` (default) focuses the first
     * focusable control. `"alertdialog"` is for confirmations / destructive
     * decisions: absent an explicit `initialFocusRef`, initial focus lands on
     * the dialog container (so the labelled + described alert message is
     * announced) rather than on the first, often destructive, control.
     */
    role?: 'dialog' | 'alertdialog';
    /** Surface width: sm 24rem · md 28rem · lg 42rem · xl 56rem · 2xl 72rem. */
    size?: DialogSize;
    /** Layout-only additions merged onto the v2 surface with `cn` (never colours). */
    className?: string;
    /** Blocks every close path. Wire it to the submitting state (PG-22). */
    closeDisabled?: boolean;
    /** Marks the surface `aria-busy` and blocks every close path while true. */
    isBusy?: boolean;
    /** Routes every close request through `useDirtyTaskGuard().requestLocalLeave`. */
    dirtyGuard?: DialogDirtyGuard;
    dataTestId?: string;
    /** @deprecated Migration only (audit §4.11): drop it; the shell owns the layer. */
    containerClassName?: string;
    /** @deprecated Migration only (audit §4.11): drop it; the backdrop is `bg-overlay`. */
    backdropClassName?: string;
    /** @deprecated Migration only (audit §4.11): use `size` (+ `className` for layout). */
    contentClassName?: string;
}

const DIALOG_CONTAINER = 'fixed inset-0 z-modal flex items-center justify-center p-4';
const DIALOG_BACKDROP = 'absolute inset-0 bg-overlay backdrop-blur-sm';
const DIALOG_SURFACE = 'relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-popover';
const DIALOG_SIZES: Readonly<Record<DialogSize, string>> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-6xl',
};

interface DialogContextValue {
    titleId: string;
    requestClose: () => void;
    closeDisabled: boolean;
    isBusy: boolean;
}

const DialogContext = createContext<DialogContextValue | null>(null);

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container: HTMLElement) {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => (
        !element.hasAttribute('disabled')
        && element.tabIndex >= 0
        && element.getAttribute('aria-hidden') !== 'true'
        && !element.closest('[aria-hidden="true"]')
    ));
}

function isTopmostModal(dialog: HTMLElement) {
    const openModalSurfaces = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]'));
    return openModalSurfaces.at(-1) === dialog;
}

function isInActiveInteractionLayer(dialog: HTMLElement, target: EventTarget | null) {
    return target instanceof HTMLElement
        && (dialog.contains(target) || Boolean(target.closest('.themed-select-content')));
}

function DialogShellRoot({
    isOpen,
    onClose,
    titleId,
    descriptionIds = [],
    children,
    initialFocusRef,
    closeDisabled = false,
    isBusy = false,
    dirtyGuard,
    role = 'dialog',
    size,
    className,
    containerClassName,
    backdropClassName,
    contentClassName,
    dataTestId,
}: DialogShellProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const openerRef = useRef<HTMLElement | null>(null);
    const openerStableIdentityRef = useRef<{ id?: string; testId?: string; ariaLabel?: string }>({});
    const lastFocusedWhileClosedRef = useRef<HTMLElement | null>(null);
    const describedBy = descriptionIds.filter(Boolean).join(' ') || undefined;
    const isCloseBlocked = closeDisabled || isBusy;
    const requestLocalLeave = dirtyGuard?.requestLocalLeave;

    const focusInitialElement = useCallback(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const preferredElement = initialFocusRef?.current;
        if (
            preferredElement
            && !preferredElement.hasAttribute('disabled')
            && dialog.contains(preferredElement)
        ) {
            preferredElement.focus();
            return;
        }

        // alertdialog: without an explicit target, focus the container so the
        // labelled + described alert is announced instead of auto-focusing the
        // first (often destructive) control. Focus stays trapped either way.
        if (role === 'alertdialog') {
            dialog.focus();
            return;
        }

        const [firstFocusable] = getFocusableElements(dialog);
        if (firstFocusable) {
            firstFocusable.focus();
            return;
        }

        dialog.focus();
    }, [initialFocusRef, role]);

    const requestClose = useCallback(() => {
        if (isCloseBlocked) return;
        if (requestLocalLeave) {
            requestLocalLeave(onClose);
            return;
        }
        onClose();
    }, [isCloseBlocked, onClose, requestLocalLeave]);

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (!isOpen) return;

        const dialog = dialogRef.current;
        if (!dialog) return;
        if (!isTopmostModal(dialog)) return;

        if (event.key === 'Escape') {
            const eventTarget = event.target;
            // Radix Select renders its active listbox outside the dialog DOM.
            // That top interaction layer owns the first Escape; closing the
            // parent here would collapse both layers in a single keystroke.
            if (
                eventTarget instanceof HTMLElement
                && eventTarget.closest('.themed-select-content')
            ) return;

            // Only the topmost modal owns keyboard handling. This makes Escape
            // peel stacked dialogs one at a time and prevents the outer trap
            // from stealing Tab after the inner trap has moved focus.
            event.preventDefault();
            requestClose();
            return;
        }

        if (event.key !== 'Tab') return;

        if (isInActiveInteractionLayer(dialog, event.target) && !dialog.contains(event.target as Node)) {
            return;
        }

        const focusableElements = getFocusableElements(dialog);
        if (focusableElements.length === 0) {
            event.preventDefault();
            dialog.focus();
            return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const activeElement = document.activeElement;

        if (!dialog.contains(activeElement)) {
            event.preventDefault();
            firstElement.focus();
            return;
        }

        if (event.shiftKey && activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
            return;
        }

        if (!event.shiftKey && activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
        }
    }, [isOpen, requestClose]);

    const handleFocusIn = useCallback((event: FocusEvent) => {
        if (!isOpen) return;

        const dialog = dialogRef.current;
        const target = event.target;
        if (!dialog || !(target instanceof HTMLElement)) return;
        if (!isTopmostModal(dialog)) return;
        if (isInActiveInteractionLayer(dialog, target)) return;

        focusInitialElement();
    }, [focusInitialElement, isOpen]);

    useEffect(() => {
        if (isOpen || typeof document === 'undefined') return undefined;

        const recordFocusedElement = (event: FocusEvent) => {
            if (event.target instanceof HTMLElement) {
                lastFocusedWhileClosedRef.current = event.target;
            }
        };
        if (document.activeElement instanceof HTMLElement) {
            lastFocusedWhileClosedRef.current = document.activeElement;
        }
        document.addEventListener('focusin', recordFocusedElement);
        return () => document.removeEventListener('focusin', recordFocusedElement);
    }, [isOpen]);

    useLayoutEffect(() => {
        if (!isOpen || typeof document === 'undefined') return undefined;

        if (openerRef.current === null) {
            openerRef.current = lastFocusedWhileClosedRef.current
                ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
            openerStableIdentityRef.current = openerRef.current ? {
                id: openerRef.current.id || undefined,
                testId: openerRef.current.dataset.testid || undefined,
                ariaLabel: openerRef.current.getAttribute('aria-label') || undefined,
            } : {};
        }

        const focusTimer = window.setTimeout(() => {
            const dialog = dialogRef.current;
            // A busy event loop may let the user move focus into the dialog
            // before this initial-focus task runs. Never overwrite that valid
            // choice (especially in an alertdialog, whose default target is
            // the container).
            if (
                dialog
                && isTopmostModal(dialog)
                && !isInActiveInteractionLayer(dialog, document.activeElement)
            ) {
                focusInitialElement();
            }
        }, 0);
        // Native form activation can finish after the first zero-delay focus
        // task and put focus back on the submitter. Re-check after that event
        // cycle, but never override focus that is already inside the dialog.
        const focusGuardTimer = window.setTimeout(() => {
            const dialog = dialogRef.current;
            if (
                dialog
                && isTopmostModal(dialog)
                && !isInActiveInteractionLayer(dialog, document.activeElement)
            ) {
                focusInitialElement();
            }
        }, 50);

        return () => {
            window.clearTimeout(focusTimer);
            window.clearTimeout(focusGuardTimer);
            const opener = openerRef.current;
            const stableIdentity = openerStableIdentityRef.current;
            openerRef.current = null;
            openerStableIdentityRef.current = {};

            const restoreOpenerFocus = () => {
                let target = opener?.isConnected ? opener : null;
                if (!target && stableIdentity.id) {
                    target = document.getElementById(stableIdentity.id);
                }
                if (!target && stableIdentity.testId) {
                    target = Array.from(document.querySelectorAll<HTMLElement>('[data-testid]'))
                        .find((element) => element.dataset.testid === stableIdentity.testId) ?? null;
                }
                if (!target && stableIdentity.ariaLabel) {
                    target = Array.from(document.querySelectorAll<HTMLElement>('[aria-label]'))
                        .find((element) => element.getAttribute('aria-label') === stableIdentity.ariaLabel) ?? null;
                }
                target?.focus();
            };

            restoreOpenerFocus();
            window.setTimeout(restoreOpenerFocus, 0);
        };
    }, [focusInitialElement, isOpen]);

    useEffect(() => {
        if (!isOpen || typeof document === 'undefined') return undefined;

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('focusin', handleFocusIn);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('focusin', handleFocusIn);
        };
    }, [handleFocusIn, handleKeyDown, isOpen]);

    const contextValue = useMemo<DialogContextValue>(() => ({
        titleId,
        requestClose,
        closeDisabled: isCloseBlocked,
        isBusy,
    }), [isBusy, isCloseBlocked, requestClose, titleId]);

    if (!isOpen || typeof document === 'undefined') return null;

    // A deprecated class prop replaces that layer's v2 recipe exactly as in v1
    // (O4: the hard-coded dark dialogs keep their surface until W6 tokenises
    // surface + inner text together).
    const surfaceClassName = contentClassName === undefined
        ? cn(DIALOG_SURFACE, DIALOG_SIZES[size ?? 'md'], className)
        : cn('relative', contentClassName);

    return (
        <>
            {createPortal(
                <AnimatePresence>
                    <div className={containerClassName ?? DIALOG_CONTAINER}>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className={backdropClassName ?? DIALOG_BACKDROP}
                            data-dialog-backdrop="true"
                            onClick={requestClose}
                        />

                        <motion.div
                            ref={dialogRef}
                            initial={{ scale: 0.95, y: 10 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 10 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            onAnimationComplete={() => {
                                const dialog = dialogRef.current;
                                if (
                                    dialog
                                    && isTopmostModal(dialog)
                                    && !isInActiveInteractionLayer(dialog, document.activeElement)
                                ) {
                                    focusInitialElement();
                                }
                            }}
                            role={role}
                            aria-modal="true"
                            aria-labelledby={titleId}
                            aria-describedby={describedBy}
                            aria-busy={isBusy || undefined}
                            tabIndex={-1}
                            data-testid={dataTestId}
                            className={surfaceClassName}
                        >
                            <DialogContext.Provider value={contextValue}>
                                {children}
                            </DialogContext.Provider>
                        </motion.div>
                    </div>
                </AnimatePresence>,
                document.body,
            )}
            {dirtyGuard?.confirmationDialog}
        </>
    );
}

const HEADER_TONES: Readonly<Record<DialogTone, { tile: string; icon: string }>> = {
    default: { tile: 'bg-accent', icon: 'text-accent-foreground' },
    danger: { tile: 'bg-destructive', icon: 'text-destructive-foreground' },
    warning: { tile: 'bg-warning', icon: 'text-warning-foreground' },
    info: { tile: 'bg-info', icon: 'text-info-foreground' },
};

export interface DialogHeaderProps {
    title: ReactNode;
    /** Defaults to the enclosing shell's `titleId`; the id sits on the `h2` only. */
    titleId?: string;
    description?: ReactNode;
    descriptionId?: string;
    icon?: LucideIcon;
    tone?: DialogTone;
    /** Defaults to the shell's guarded close request. */
    onClose?: () => void;
    /** Defaults to the shell's close guard (`closeDisabled` / `isBusy`). */
    closeDisabled?: boolean;
    closeLabel?: string;
    hideClose?: boolean;
    className?: string;
    /** Extra header content rendered under the title (e.g. a status badge). */
    children?: ReactNode;
}

/** Title row: optional tone icon, `h2` title + description, icon-only close. */
export function DialogHeader({
    title,
    titleId,
    description,
    descriptionId,
    icon: Icon,
    tone = 'default',
    onClose,
    closeDisabled,
    closeLabel,
    hideClose = false,
    className,
    children,
}: DialogHeaderProps) {
    const { t } = useTranslation('common');
    const dialog = useContext(DialogContext);
    const close = onClose ?? dialog?.requestClose;
    const isCloseDisabled = closeDisabled ?? dialog?.closeDisabled ?? false;
    const toneClasses = HEADER_TONES[tone];

    return (
        <div className={cn('flex items-start gap-4 border-b border-border px-6 py-4', className)}>
            {Icon ? (
                <div className={cn('shrink-0 rounded-xl p-3', toneClasses.tile)}>
                    <Icon aria-hidden="true" className={cn('h-6 w-6', toneClasses.icon)} />
                </div>
            ) : null}
            <div className="min-w-0 flex-1 self-center">
                <h2 id={titleId ?? dialog?.titleId} className="font-heading text-lg font-semibold text-foreground">
                    {title}
                </h2>
                {description ? (
                    <p id={descriptionId} className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {description}
                    </p>
                ) : null}
                {children}
            </div>
            {!hideClose && close ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="iconCompact"
                    onClick={close}
                    disabled={isCloseDisabled}
                    aria-label={closeLabel ?? t('actions.close')}
                    className="shrink-0 [&_svg]:size-5"
                >
                    <X aria-hidden="true" />
                </Button>
            ) : null}
        </div>
    );
}

/** Scrollable content region between header and footer. */
export function DialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
    return <div {...props} className={cn('min-h-0 flex-1 space-y-4 overflow-y-auto p-6', className)} />;
}

export interface DialogFooterProps {
    /** Primary action label; omit for a cancel-only footer. */
    submitLabel?: ReactNode;
    onSubmit?: () => void;
    /** `id` of a `<form>` the primary action submits (renders `type="submit"`). */
    submitForm?: string;
    /** Use `"submit"` when the footer sits inside the `<form>` it submits. */
    submitType?: 'button' | 'submit';
    submitDisabled?: boolean;
    submitRef?: Ref<HTMLButtonElement>;
    submitIcon?: ReactNode;
    intent?: DialogFooterIntent;
    /** Defaults to the shell's `isBusy`. Shows the spinner on the primary action. */
    isSubmitting?: boolean;
    /** Defaults to the shell's guarded close request. */
    onCancel?: () => void;
    cancelLabel?: ReactNode;
    hideCancel?: boolean;
    /** Left-aligned secondary content (e.g. a hint or a tertiary action). */
    extra?: ReactNode;
    className?: string;
    /** Custom right-aligned actions; replaces the default Cancel + primary pair. */
    children?: ReactNode;
}

/** Action row: Cancel (secondary) then the primary action, right-aligned. */
export function DialogFooter({
    submitLabel,
    onSubmit,
    submitForm,
    submitType,
    submitDisabled = false,
    submitRef,
    submitIcon,
    intent = 'accent',
    isSubmitting,
    onCancel,
    cancelLabel,
    hideCancel = false,
    extra,
    className,
    children,
}: DialogFooterProps) {
    const { t } = useTranslation('common');
    const dialog = useContext(DialogContext);
    const cancel = onCancel ?? dialog?.requestClose;
    const busy = isSubmitting ?? dialog?.isBusy ?? false;
    const cancelDisabled = busy || (dialog?.closeDisabled ?? false);
    const submitButtonType = submitForm ? 'submit' : (submitType ?? 'button');

    return (
        <div className={cn('flex items-center justify-end gap-3 border-t border-border bg-nested/50 px-6 py-4', className)}>
            {extra ? <div className="mr-auto flex min-w-0 items-center gap-3">{extra}</div> : null}
            {children ?? (
                <>
                    {!hideCancel && cancel ? (
                        <Button type="button" variant="secondary" onClick={cancel} disabled={cancelDisabled}>
                            {cancelLabel ?? t('actions.cancel')}
                        </Button>
                    ) : null}
                    {submitLabel !== undefined ? (
                        <Button
                            ref={submitRef}
                            type={submitButtonType}
                            form={submitForm}
                            variant={intent}
                            onClick={onSubmit}
                            disabled={submitDisabled}
                            isLoading={busy}
                        >
                            {busy ? null : submitIcon}
                            {submitLabel}
                        </Button>
                    ) : null}
                </>
            )}
        </div>
    );
}

/**
 * `DialogShell` with its sub-components attached, so call sites can write
 * `<DialogShell.Header />` / `.Body` / `.Footer` as well as the named exports.
 */
export const DialogShell = Object.assign(DialogShellRoot, {
    Header: DialogHeader,
    Body: DialogBody,
    Footer: DialogFooter,
});
