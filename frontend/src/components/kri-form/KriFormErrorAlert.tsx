import { AlertCircle } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';

interface KriFormErrorAlertProps {
    error: string;
}

export function KriFormErrorAlert({ error }: KriFormErrorAlertProps) {
    const { t } = useTranslation(['errorKeys', 'kris']);

    return (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm font-medium text-rose-400 animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="h-5 w-5" />
            {error.startsWith('errorKeys.')
                ? t(error, { ns: 'errorKeys' })
                : error.startsWith('kris:')
                    ? t(error, { ns: 'kris' })
                    : error}
        </div>
    );
}
