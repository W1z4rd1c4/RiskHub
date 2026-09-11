import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useTranslation } from '@/i18n/hooks';

interface PendingChangeCancellationDialogProps {
    isOpen: boolean;
    targetName: string;
    isLoading: boolean;
    errorText: string | null;
    onClose: () => void;
    onConfirm: () => void;
}

export function PendingChangeCancellationDialog({
    isOpen,
    targetName,
    isLoading,
    errorText,
    onClose,
    onConfirm,
}: PendingChangeCancellationDialogProps) {
    const { t } = useTranslation('common');

    return (
        <ConfirmDialog
            isOpen={isOpen}
            onClose={onClose}
            onConfirm={onConfirm}
            title={t('pending_change_cancellation.title')}
            message={t('pending_change_cancellation.message', { targetName })}
            confirmLabel={errorText
                ? t('actions.retry')
                : t('pending_change_cancellation.confirm')}
            variant="danger"
            isLoading={isLoading}
            errorText={errorText}
        />
    );
}
