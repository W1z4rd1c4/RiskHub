import { useCallback } from 'react';

import { useTranslation } from '@/i18n/hooks';

import { ConfirmDialog } from './ConfirmDialog';

interface ArchiveConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (reason: string) => Promise<void>;
    resourceType: 'control' | 'risk';
    resourceName: string;
}

/**
 * Required-reason archive confirmation. Delegates to
 * `<ConfirmDialog intent="archive" reason="required">` (audit §4.11, D10);
 * callers migrate to ConfirmDialog directly and this wrapper is deleted in
 * Phase 4 (roadmap 4.3). Closes itself once `onConfirm` resolves; a rejection
 * stays in the open dialog with the typed reason intact.
 */
export function ArchiveConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    resourceType,
    resourceName,
}: ArchiveConfirmDialogProps) {
    const { t } = useTranslation('common');

    const handleConfirm = useCallback(async (reason?: string) => {
        await onConfirm((reason ?? '').trim());
        onClose();
    }, [onClose, onConfirm]);

    return (
        <ConfirmDialog
            isOpen={isOpen}
            onClose={onClose}
            onConfirm={handleConfirm}
            intent="archive"
            entityLabel={resourceType === 'control' ? t('labels.control') : t('labels.risk')}
            entityName={resourceName}
            reason="required"
            reasonPlaceholder={t('labels.archive_reason_placeholder')}
        />
    );
}
