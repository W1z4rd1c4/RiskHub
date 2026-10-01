import { useId } from 'react';
import { AlertCircle, Trash2 } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import type { RoleHubRead } from '@/services/riskHubApi';
import { DialogBody, DialogFooter, DialogHeader, DialogShell } from '@/components/ui/dialog';

interface RoleDeleteDialogProps {
    onCancel: () => void;
    onConfirm: () => void;
    role: RoleHubRead | null;
}

export function RoleDeleteDialog({ onCancel, onConfirm, role }: RoleDeleteDialogProps) {
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
        >
            <DialogHeader title={t('confirmations.delete_role')} icon={Trash2} tone="danger" />
            <DialogBody className="text-sm text-muted-foreground">
                <p id={descriptionId}>
                    {t('admin:roles_panel.delete_confirm', { name: role.display_name })}
                </p>
                {role.user_count > 0 && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-destructive">
                        <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
                        <span>
                            {t('admin:roles_panel.cannot_delete_assigned', { count: role.user_count })}
                        </span>
                    </div>
                )}
            </DialogBody>
            <DialogFooter
                cancelLabel={t('common:actions.cancel')}
                intent="destructive"
                submitLabel={role.user_count === 0 ? t('common:actions.delete') : undefined}
                onSubmit={onConfirm}
            />
        </DialogShell>
    );
}
