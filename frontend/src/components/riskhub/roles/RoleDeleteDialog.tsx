import { AlertCircle } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import type { RoleHubRead } from '@/services/riskHubApi';

interface RoleDeleteDialogProps {
    onCancel: () => void;
    onConfirm: () => void;
    role: RoleHubRead | null;
}

export function RoleDeleteDialog({ onCancel, onConfirm, role }: RoleDeleteDialogProps) {
    const { t } = useTranslation(['admin', 'common']);

    if (!role) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-white/10 shadow-2xl rounded-2xl w-full max-w-sm p-6">
                <h3 className="text-lg font-bold text-white mb-2">{t('confirmations.delete_role')}</h3>
                <p className="text-slate-400 text-sm mb-4">
                    {t('admin:roles_panel.delete_confirm', { name: role.display_name })}
                </p>
                {role.user_count > 0 && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-red-400">
                        <AlertCircle className="h-5 w-5 shrink-0" />
                        <span>
                            {t('admin:roles_panel.cannot_delete_assigned', { count: role.user_count })}
                        </span>
                    </div>
                )}
                <div className="flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                    >
                        {t('common:actions.cancel')}
                    </button>
                    {role.user_count === 0 && (
                        <button
                            onClick={onConfirm}
                            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                        >
                            {t('common:actions.delete')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
