import { Clock } from 'lucide-react';

import { useFormat, useTranslation } from '@/i18n/hooks';

interface RiskTimestampsProps {
    createdAt: string;
    updatedAt: string;
}

export function RiskTimestamps({ createdAt, updatedAt }: RiskTimestampsProps) {
    const { t } = useTranslation(['common']);
    const format = useFormat();

    return (
        <div className="flex items-center justify-end gap-6 text-xs text-muted-foreground font-medium">
            <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {t('common:labels.created_at')}: {format.date(createdAt)}
            </div>
            <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {t('common:labels.updated_at')}: {format.date(updatedAt)}
            </div>
        </div>
    );
}
