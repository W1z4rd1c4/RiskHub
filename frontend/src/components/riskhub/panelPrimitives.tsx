import { useId, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import { DialogFooter, DialogHeader, DialogShell } from '@/components/ui/dialog';

interface RiskHubModalFrameProps {
    children: ReactNode;
    title: string;
    onClose: () => void;
    /** Blocks every close path while the form submits (PG-22). */
    isBusy?: boolean;
}

/**
 * Risk Hub create/edit modal on the themed DialogShell v2 surface (D5, DS-07).
 * Children render below the header: a `<form>` laid out as
 * `flex min-h-0 flex-1 flex-col` with a `DialogBody` and `RiskHubModalActions`.
 */
export function RiskHubModalFrame({ children, title, onClose, isBusy = false }: RiskHubModalFrameProps) {
    const titleId = useId();
    return (
        <DialogShell isOpen onClose={onClose} titleId={titleId} size="md" isBusy={isBusy}>
            <DialogHeader title={title} />
            {children}
        </DialogShell>
    );
}

interface RiskHubModalActionsProps {
    cancelLabel?: string;
    disableSave?: boolean;
    onCancel: () => void;
    saveLabel?: string;
    saving: boolean;
    savingLabel?: string;
}

/** Footer of a Risk Hub modal form: Cancel, then the submit action (§4.11 order). */
export function RiskHubModalActions({
    cancelLabel,
    disableSave,
    onCancel,
    saveLabel,
    saving,
    savingLabel,
}: RiskHubModalActionsProps) {
    const { t } = useTranslation(['common']);
    return (
        <DialogFooter
            onCancel={onCancel}
            cancelLabel={cancelLabel ?? t('common:actions.cancel')}
            submitType="submit"
            submitDisabled={disableSave}
            isSubmitting={saving}
            submitLabel={saving ? (savingLabel ?? t('common:loading.generic')) : (saveLabel ?? t('common:actions.save'))}
        />
    );
}

interface RiskHubFieldErrorProps {
    errorKey: string | null;
}

export function RiskHubFieldError({ errorKey }: RiskHubFieldErrorProps) {
    const { t } = useTranslation(['errorKeys']);
    if (!errorKey) return null;
    return (
        <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            {t(errorKey, { ns: 'errorKeys' })}
        </div>
    );
}
