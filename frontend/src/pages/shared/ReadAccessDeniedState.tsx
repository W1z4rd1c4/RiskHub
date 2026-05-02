import { ShieldX } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';

interface ReadAccessDeniedStateProps {
    descriptionKey?: string;
}

export function ReadAccessDeniedState({
    descriptionKey = 'errors.forbidden',
}: ReadAccessDeniedStateProps) {
    const { t } = useTranslation('common');

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
            <div className="p-4 bg-rose-500/10 rounded-2xl">
                <ShieldX className="h-12 w-12 text-rose-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">{t('access.denied')}</h2>
            <p className="text-slate-400 max-w-md">{t(descriptionKey)}</p>
        </div>
    );
}
