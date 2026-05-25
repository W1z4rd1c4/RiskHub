import { useCallback, useEffect, useRef, type ReactNode } from 'react';
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
    containerClassName = 'fixed inset-0 z-[9999] flex items-center justify-center p-4',
    backdropClassName = 'absolute inset-0 bg-slate-950/70 backdrop-blur-sm',
    contentClassName = 'relative w-full max-w-md glass-card !p-0 overflow-hidden shadow-2xl',
    dataTestId,
}: DialogShellProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const openerRef = useRef<HTMLElement | null>(null);
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

        const [firstFocusable] = getFocusableElements(dialog);
        if (firstFocusable) {
            firstFocusable.focus();
            return;
        }

        dialog.focus();
    }, [initialFocusRef]);

    const handleClose = useCallback(() => {
        if (closeDisabled) return;
        onClose();
    }, [closeDisabled, onClose]);

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (!isOpen) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            handleClose();
            return;
        }

        if (event.key !== 'Tab') return;

        const dialog = dialogRef.current;
        if (!dialog) return;

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

    useEffect(() => {
        if (!isOpen || typeof document === 'undefined') return undefined;

        openerRef.current = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;

        const focusTimer = window.setTimeout(focusInitialElement, 0);

        return () => {
            window.clearTimeout(focusTimer);
            const opener = openerRef.current;
            openerRef.current = null;

            if (opener?.isConnected) {
                opener.focus();
            }
        };
    }, [focusInitialElement, isOpen]);

    useEffect(() => {
        if (!isOpen || typeof document === 'undefined') return undefined;

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown, isOpen]);

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
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    role="dialog"
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
