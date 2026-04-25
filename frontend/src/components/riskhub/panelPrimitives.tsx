import { AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';

import { useTranslation } from '@/i18n/hooks';

interface RiskHubModalFrameProps {
    children: ReactNode;
    title: string;
}

export function RiskHubModalFrame({ children, title }: RiskHubModalFrameProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-white/10 shadow-2xl rounded-2xl w-full max-w-md p-6">
                <h2 className="text-xl font-bold text-white mb-4">{title}</h2>
                {children}
            </div>
        </div>
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
        <div className="flex justify-end gap-3 pt-4 border-t border-white/10 mt-6">
            <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
            >
                {cancelLabel ?? t('common:actions.cancel')}
            </button>
            <button
                type="submit"
                disabled={saving || disableSave}
                className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
                {saving ? (savingLabel ?? t('common:loading.generic')) : (saveLabel ?? t('common:actions.save'))}
            </button>
        </div>
    );
}

interface RiskHubFieldErrorProps {
    errorKey: string | null;
}

export function RiskHubFieldError({ errorKey }: RiskHubFieldErrorProps) {
    const { t } = useTranslation(['errorKeys']);
    if (!errorKey) return null;
    return (
        <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4" />
            {t(errorKey, { ns: 'errorKeys' })}
        </div>
    );
}
