import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import { logError } from '@/services/logger';

interface AuditDetailsModalProps {
    extra: Record<string, unknown> | null;
    onClose: () => void;
}

export function AuditDetailsModal({ extra, onClose }: AuditDetailsModalProps) {
    const { t } = useTranslation('admin');
    const [copied, setCopied] = useState(false);
    const detailsJson = useMemo(() => (extra ? JSON.stringify(extra, null, 2) : ''), [extra]);

    useEffect(() => {
        if (!copied) return;
        const timeout = window.setTimeout(() => setCopied(false), 1500);
        return () => window.clearTimeout(timeout);
    }, [copied]);

    const copyDetails = async () => {
        if (!detailsJson) return;
        try {
            await navigator.clipboard.writeText(detailsJson);
            setCopied(true);
        } catch (err) {
            logError('Failed to copy audit log details:', err);
        }
    };

    return (
        <AnimatePresence>
            {extra && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        className="relative w-full max-w-2xl max-h-[80vh] glass-card !p-0 overflow-hidden shadow-2xl"
                    >
                        <div className="admin-surface-muted flex items-center justify-between border-b px-5 py-4">
                            <h4 className="admin-title text-sm font-bold">{t('audit.details_modal.title')}</h4>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={copyDetails}
                                    className="admin-surface-muted admin-text flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors hover:bg-white/10"
                                >
                                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                    {copied ? t('audit.details_modal.copied') : t('audit.details_modal.copy')}
                                </button>
                                <button
                                    onClick={onClose}
                                    className="admin-surface-muted admin-text rounded-lg border px-3 py-1.5 text-xs transition-colors hover:bg-white/10"
                                >
                                    {t('common:actions.close')}
                                </button>
                            </div>
                        </div>
                        <div className="p-5 max-h-[60vh] overflow-auto">
                            <pre className="admin-text whitespace-pre-wrap break-all rounded-xl border border-white/10 bg-black/20 p-4 text-xs">
                                {detailsJson}
                            </pre>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
