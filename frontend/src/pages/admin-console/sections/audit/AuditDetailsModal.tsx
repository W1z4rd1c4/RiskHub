import { useEffect, useId, useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import { logError } from '@/services/logger';
import { DialogShell } from '@/components/DialogShell';

interface AuditDetailsModalProps {
    extra: Record<string, unknown> | null;
    onClose: () => void;
}

export function AuditDetailsModal({ extra, onClose }: AuditDetailsModalProps) {
    const { t } = useTranslation('admin');
    const titleId = useId();
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
        <DialogShell
            isOpen={Boolean(extra)}
            onClose={onClose}
            titleId={titleId}
            backdropClassName="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            contentClassName="relative w-full max-w-2xl max-h-[80vh] glass-card !p-0 overflow-hidden shadow-2xl"
        >
            <div className="admin-surface-muted flex items-center justify-between border-b px-5 py-4">
                <h4 id={titleId} className="admin-title text-sm font-bold">{t('audit.details_modal.title')}</h4>
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
        </DialogShell>
    );
}
