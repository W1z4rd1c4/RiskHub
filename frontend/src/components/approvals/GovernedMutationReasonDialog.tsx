import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useTranslation } from '@/i18n/hooks';

interface GovernedMutationReasonDialogProps {
    isOpen: boolean;
    isLoading?: boolean;
    kind: 'link_add' | 'link_remove' | 'link_update';
    reasonRequired?: boolean;
    onClose: () => void;
    onConfirm: (reason: string) => void;
}

export function GovernedMutationReasonDialog({
    isOpen,
    isLoading = false,
    kind,
    reasonRequired = true,
    onClose,
    onConfirm,
}: GovernedMutationReasonDialogProps) {
    const { t } = useTranslation('processes');
    return (
        <ConfirmDialog
            isOpen={isOpen}
            onClose={onClose}
            onConfirm={(value) => onConfirm(value?.trim() ?? '')}
            title={t(`link_approval.${kind}.title`)}
            message={t(`link_approval.${kind}.message`)}
            confirmLabel={t('link_approval.continue')}
            variant={kind === 'link_remove' ? 'warning' : 'info'}
            isLoading={isLoading}
            showInput={reasonRequired}
            inputRequired={reasonRequired}
            inputLabel={t('form.request_reason')}
            inputPlaceholder={t('link_approval.reason_placeholder')}
        />
    );
}
