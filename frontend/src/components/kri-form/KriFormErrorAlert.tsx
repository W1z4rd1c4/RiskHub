import { AlertCircle } from 'lucide-react';

import { translateUiMessage, useTranslation } from '@/i18n/hooks';

interface KriFormErrorAlertProps {
    error: string;
}

export function KriFormErrorAlert({ error }: KriFormErrorAlertProps) {
    const { t } = useTranslation(['errorKeys', 'kris']);

    return (
        <div
            role="alert"
            className="mb-6 flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm font-medium text-destructive animate-in fade-in slide-in-from-top-2"
        >
            <AlertCircle className="h-5 w-5" />
            {translateUiMessage(t, error)}
        </div>
    );
}
