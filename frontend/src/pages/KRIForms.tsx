import { Plus } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { KRIForm } from '@/components/KRIForm';

export function KRINewPage() {
    const { t } = useTranslation(['kris', 'common']);
    const [searchParams] = useSearchParams();
    const riskIdParam = searchParams.get('risk_id');
    const parsedRiskId = riskIdParam ? Number(riskIdParam) : NaN;
    const preselectedRiskId = Number.isInteger(parsedRiskId) && parsedRiskId > 0
        ? parsedRiskId
        : undefined;

    return (
        <div className="space-y-8">
            <div className="flex items-center gap-4">
                <div className="bg-accent/20 p-3 rounded-2xl">
                    <Plus className="h-6 w-6 text-accent" />
                </div>
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tighter">{t('kris:new_kri')}</h2>
                    <p className="text-slate-500 font-medium tracking-tight uppercase text-[10px] tracking-widest mt-1">
                        {t('kris:title')} / {t('common:actions.create')}
                    </p>
                </div>
            </div>

            <KRIForm initialData={preselectedRiskId ? { risk_id: preselectedRiskId } : undefined} />
        </div>
    );
}
