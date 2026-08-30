import { ArrowLeft, Building2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/hooks';
import type { DepartmentDetail } from '@/services/departmentApi';

interface DepartmentDetailHeaderProps {
    department: DepartmentDetail;
    onBack: () => void;
    onRefresh: () => void;
}

export function DepartmentDetailHeader({ department, onBack, onRefresh }: DepartmentDetailHeaderProps) {
    const { t } = useTranslation('common');

    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={onBack}
                    aria-label={t('actions.back')}
                    title={t('actions.back')}
                >
                    <ArrowLeft aria-hidden="true" />
                </Button>
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Building2 className="h-8 w-8 text-accent" />
                        <h2 className="text-3xl font-black text-foreground">{department.name}</h2>
                        <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-mono">
                            {department.code}
                        </span>
                    </div>
                    {department.description && <p className="text-muted-foreground font-medium">{department.description}</p>}
                </div>
            </div>
            <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={onRefresh}
                aria-label={t('actions.refresh')}
                title={t('actions.refresh')}
            >
                <RefreshCw aria-hidden="true" />
            </Button>
        </div>
    );
}
