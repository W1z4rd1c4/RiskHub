import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

interface DialogShellProps {
    isOpen: boolean;
    onClose: () => void;
    titleId: string;
    descriptionIds?: string[];
    children: ReactNode;
    initialFocusRef?: { current: HTMLElement | null };
    closeDisabled?: boolean;
    /**
     * ARIA role for the modal surface. `"dialog"` (default) preserves today's
     * behaviour. `"alertdialog"` is for confirmations / destructive decisions:
     * absent an explicit `initialFocusRef`, initial focus lands on the dialog
     * container (so the labelled + described alert message is announced) rather
     * than auto-focusing the first — often destructive — control.
     */
    role?: 'dialog' | 'alertdialog';
    containerClassName?: string;
    backdropClassName?: string;
    contentClassName?: string;
    dataTestId?: string;
}

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

function classNames(...values: Array<string | undefined>) {
    return values.filter(Boolean).join(' ');
}

function getFocusableElements(container: HTMLElement) {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => (
        !element.hasAttribute('disabled')
        && element.getAttribute('aria-hidden') !== 'true'
        && !element.closest('[aria-hidden="true"]')
    ));
}

export function DialogShell({
    isOpen,
    onClose,
    titleId,
    descriptionIds = [],
    children,
    initialFocusRef,
    closeDisabled = false,
    role = 'dialog',
    containerClassName = 'fixed inset-0 z-[9999] flex items-center justify-center p-4',
    backdropClassName = 'absolute inset-0 bg-slate-950/70 backdrop-blur-sm',
    contentClassName = 'relative w-full max-w-md glass-card !p-0 overflow-hidden shadow-2xl',
    dataTestId,
}: DialogShellProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const openerRef = useRef<HTMLElement | null>(null);
    const openerStableIdentityRef = useRef<{ id?: string; testId?: string; ariaLabel?: string }>({});
    const lastFocusedWhileClosedRef = useRef<HTMLElement | null>(null);
    const describedBy = descriptionIds.filter(Boolean).join(' ') || undefined;

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

    const handleClose = useCallback(() => {
        if (closeDisabled) return;
        onClose();
    }, [closeDisabled, onClose]);

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (!isOpen) return;

        const dialog = dialogRef.current;
        if (!dialog) return;
        const openModalSurfaces = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]'));
        if (openModalSurfaces.at(-1) !== dialog) return;

        if (event.key === 'Escape') {
            // Only the topmost modal owns keyboard handling. This makes Escape
            // peel stacked dialogs one at a time and prevents the outer trap
            // from stealing Tab after the inner trap has moved focus.
            event.preventDefault();
            handleClose();
            return;
        }

        if (event.key !== 'Tab') return;

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
    }, [handleClose, isOpen]);

    const handleFocusIn = useCallback((event: FocusEvent) => {
        if (!isOpen) return;

        const dialog = dialogRef.current;
        const target = event.target;
        if (!dialog || !(target instanceof HTMLElement)) return;
        const openModalSurfaces = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]'));
        if (openModalSurfaces.at(-1) !== dialog) return;
        if (dialog.contains(target) || target.closest('.themed-select-content')) return;

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

        const focusTimer = window.setTimeout(focusInitialElement, 0);
        // Native form activation can finish after the first zero-delay focus
        // task and put focus back on the submitter. Re-check after that event
        // cycle, but never override focus that is already inside the dialog.
        const focusGuardTimer = window.setTimeout(() => {
            const dialog = dialogRef.current;
            if (dialog && !dialog.contains(document.activeElement)) {
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

    if (!isOpen || typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            <div className={containerClassName}>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className={backdropClassName}
                    data-dialog-backdrop="true"
                    onClick={handleClose}
                />

                <motion.div
                    ref={dialogRef}
                    initial={{ scale: 0.95, y: 10 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.95, y: 10 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    onAnimationComplete={() => {
                        const dialog = dialogRef.current;
                        if (dialog && !dialog.contains(document.activeElement)) {
                            focusInitialElement();
                        }
                    }}
                    role={role}
                    aria-modal="true"
                    aria-labelledby={titleId}
                    aria-describedby={describedBy}
                    tabIndex={-1}
                    data-testid={dataTestId}
                    className={classNames('relative', contentClassName)}
                >
                    {children}
                </motion.div>
            </div>
        </AnimatePresence>,
        document.body,
    );
}
