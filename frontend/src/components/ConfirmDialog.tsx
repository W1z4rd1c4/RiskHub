import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (inputValue?: string) => void;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'warning' | 'info';
    isLoading?: boolean;
    // Optional input field
    showInput?: boolean;
    inputLabel?: string;
    inputPlaceholder?: string;
    inputRequired?: boolean;
}

const variantStyles = {
    danger: {
        icon: Trash2,
        iconBg: 'bg-rose-500/20',
        iconColor: 'text-rose-400',
        buttonBg: 'bg-rose-500 hover:bg-rose-600',
        buttonRing: 'focus:ring-rose-500/50',
    },
    warning: {
        icon: AlertTriangle,
        iconBg: 'bg-amber-500/20',
        iconColor: 'text-amber-400',
        buttonBg: 'bg-amber-500 hover:bg-amber-600',
        buttonRing: 'focus:ring-amber-500/50',
    },
    info: {
        icon: AlertTriangle,
        iconBg: 'bg-accent/20',
        iconColor: 'text-accent',
        buttonBg: 'bg-accent hover:bg-accent/80',
        buttonRing: 'focus:ring-accent/50',
    },
};

export function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel,
    cancelLabel,
    variant = 'danger',
    isLoading = false,
    showInput = false,
    inputLabel,
    inputPlaceholder,
    inputRequired = true,
}: ConfirmDialogProps) {
    const { t } = useTranslation('common');
    const confirmRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [inputValue, setInputValue] = useState('');
    const styles = variantStyles[variant];
    const IconComponent = styles.icon;

    const handleClose = useCallback(() => {
        setInputValue('');
        onClose();
    }, [onClose]);

    // Use translations for defaults
    const resolvedConfirmLabel = confirmLabel ?? t('actions.confirm');
    const resolvedCancelLabel = cancelLabel ?? t('actions.cancel');
    const resolvedInputPlaceholder = inputPlaceholder ?? t('labels.notes');

    // Focus handling
    useEffect(() => {
        if (isOpen) {
            // Focus input if present, otherwise focus confirm button
            setTimeout(() => {
                if (showInput && inputRef.current) {
                    inputRef.current.focus();
                } else if (confirmRef.current) {
                    confirmRef.current.focus();
                }
            }, 100);
        }
    }, [isOpen, showInput]);

    // Handle escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                handleClose();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, handleClose]);

    const handleConfirm = () => {
        onConfirm(showInput ? inputValue : undefined);
        setInputValue('');
    };

    const isConfirmDisabled = isLoading || (showInput && inputRequired && !inputValue.trim());

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop - theme aware */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="confirm-dialog-backdrop fixed inset-0 backdrop-blur-sm z-[100]"
                        onClick={handleClose}
                    />

                    {/* Dialog */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="fixed inset-0 flex items-center justify-center z-[101] p-4"
                    >
                        <div className="confirm-dialog-content w-full max-w-md glass-card !p-0 overflow-hidden shadow-2xl">
                            {/* Header */}
                            <div className="flex items-start gap-4 p-6 pb-4">
                                <div className={`p-3 rounded-xl ${styles.iconBg}`}>
                                    <IconComponent className={`h-6 w-6 ${styles.iconColor}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-lg font-bold text-white">{title}</h3>
                                    <p className="text-sm text-slate-400 mt-1 leading-relaxed whitespace-pre-wrap">{message}</p>
                                </div>
                                <button
                                    onClick={handleClose}
                                    className="p-1.5 text-slate-500 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            {/* Optional Input Field */}
                            {showInput && (
                                <div className="px-6 pb-4">
                                    {inputLabel && (
                                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                                            {inputLabel} {inputRequired && <span className="text-rose-400">*</span>}
                                        </label>
                                    )}
                                    <textarea
                                        ref={inputRef}
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        placeholder={resolvedInputPlaceholder}
                                        rows={3}
                                        className="confirm-dialog-input w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-500 outline-none focus:border-accent/50 transition-all resize-none"
                                    />
                                </div>
                            )}

                            {/* Actions */}
                            <div className="confirm-dialog-actions flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5">
                                <button
                                    onClick={handleClose}
                                    disabled={isLoading}
                                    className="px-4 py-2.5 text-sm font-semibold text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all disabled:opacity-50"
                                >
                                    {resolvedCancelLabel}
                                </button>
                                <button
                                    ref={confirmRef}
                                    onClick={handleConfirm}
                                    disabled={isConfirmDisabled}
                                    className={`px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition-all focus:outline-none focus:ring-2 disabled:opacity-50 ${styles.buttonBg} ${styles.buttonRing}`}
                                >
                                    {isLoading ? (
                                        <span className="flex items-center gap-2">
                                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            {t('labels.loading')}
                                        </span>
                                    ) : (
                                        resolvedConfirmLabel
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
