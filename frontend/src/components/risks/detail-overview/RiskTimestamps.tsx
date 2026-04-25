import { Clock } from 'lucide-react';

import { formatDateValue } from '@/i18n/formatters';
import { useTranslation } from '@/i18n/hooks';

interface RiskTimestampsProps {
    createdAt: string;
    updatedAt: string;
}

export function RiskTimestamps({ createdAt, updatedAt }: RiskTimestampsProps) {
    const { t, i18n } = useTranslation(['common']);

    return (
        <div className="flex items-center justify-end gap-6 text-[10px] text-slate-600 font-medium">
            <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {t('common:labels.created_at')}: {formatDateValue(createdAt, i18n.language)}
            </div>
            <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {t('common:labels.updated_at')}: {formatDateValue(updatedAt, i18n.language)}
            </div>
        </div>
    );
}
