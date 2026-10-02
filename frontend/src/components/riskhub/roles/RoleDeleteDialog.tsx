import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useTranslation } from '@/i18n/hooks';
import type { RoleHubRead } from '@/services/riskHubApi';

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
 * Role archive confirmation: `ConfirmDialog intent="archive"` (PM-1, D10).
 * Roles are soft-deleted and restorable, so the action is an archive (`Archive`
 * icon and wording, never `Trash2`); the role API takes no reason. A role with
 * assigned users never reaches this dialog: `RolesTable` disables its Archive
 * action with the reason (GAP-B-03).
 */
export function RoleDeleteDialog({ onCancel, onConfirm, role, isBusy = false, errorText = null }: RoleDeleteDialogProps) {
    const { t } = useTranslation(['admin', 'common']);

    return (
        <ConfirmDialog
            isOpen={role !== null}
            onClose={onCancel}
            onConfirm={onConfirm}
            intent="archive"
            title={t('admin:confirmations.archive_role')}
            message={role ? t('admin:roles_panel.archive_confirm', { name: role.display_name }) : undefined}
            isLoading={isBusy}
            errorText={errorText}
        />
    );
}
