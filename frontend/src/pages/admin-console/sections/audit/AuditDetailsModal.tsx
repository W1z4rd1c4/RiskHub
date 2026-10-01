import { useEffect, useId, useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import { logError } from '@/services/logger';
import { DialogBody, DialogFooter, DialogHeader, DialogShell } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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
        <DialogShell isOpen={Boolean(extra)} onClose={onClose} titleId={titleId} size="lg">
            <DialogHeader title={t('audit.details_modal.title')} hideClose />
            <DialogBody>
                <pre className="whitespace-pre-wrap break-all rounded-xl border border-border bg-nested p-4 text-xs text-nested-foreground">
                    {detailsJson}
                </pre>
            </DialogBody>
            <DialogFooter
                cancelLabel={t('common:actions.close')}
                extra={(
                    <Button type="button" variant="outline" size="compact" onClick={() => void copyDetails()}>
                        {copied
                            ? <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                        {copied ? t('audit.details_modal.copied') : t('audit.details_modal.copy')}
                    </Button>
                )}
            />
        </DialogShell>
    );
}
