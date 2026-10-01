import { useId } from 'react';
import { AlertCircle, Archive } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import type { RoleHubRead } from '@/services/riskHubApi';
import { DialogBody, DialogFooter, DialogHeader, DialogShell } from '@/components/ui/dialog';
import { InlineMessage } from '@/components/ui/inline-message';

interface RoleDeleteDialogProps {
    onCancel: () => void;
    onConfirm: () => void;
    role: RoleHubRead | null;
    /** Archive in flight: blocks every close path and shows the busy action. */
    isBusy?: boolean;
    /** Archive failure, shown inside the dialog (D10). */
    errorText?: string | null;
}

/**
 * Role archive confirmation. Roles are soft-deleted and restorable, so this is
 * an archive (D10: `Archive` icon and wording, never `Trash2`).
 */
export function RoleDeleteDialog({ onCancel, onConfirm, role, isBusy = false, errorText = null }: RoleDeleteDialogProps) {
    const { t } = useTranslation(['admin', 'common']);
    const titleId = useId();
    const descriptionId = useId();

    if (!role) {
        return null;
    }

    return (
        <DialogShell
            isOpen
            onClose={onCancel}
            titleId={titleId}
            descriptionIds={[descriptionId]}
            role="alertdialog"
            size="sm"
            isBusy={isBusy}
        >
            <DialogHeader title={t('confirmations.archive_role')} icon={Archive} tone="danger" />
            <DialogBody className="text-sm text-muted-foreground">
                <p id={descriptionId}>
                    {t('admin:roles_panel.archive_confirm', { name: role.display_name })}
                </p>
                {role.user_count > 0 && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-destructive">
                        <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
                        <span>
                            {t('admin:roles_panel.cannot_archive_assigned', { count: role.user_count })}
                        </span>
                    </div>
                )}
                {errorText ? <InlineMessage tone="danger">{errorText}</InlineMessage> : null}
            </DialogBody>
            <DialogFooter
                cancelLabel={t('common:actions.cancel')}
                intent="destructive"
                submitLabel={role.user_count === 0 ? t('common:actions.archive') : undefined}
                onSubmit={onConfirm}
            />
        </DialogShell>
    );
}
