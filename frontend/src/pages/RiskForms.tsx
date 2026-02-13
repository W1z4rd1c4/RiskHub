import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { RiskForm } from '@/components/RiskForm';
import { riskApi } from '@/services/riskApi';
import type { Risk } from '@/types/risk';
import { Plus, Edit } from 'lucide-react';

export function RiskNewPage() {
    const { t } = useTranslation(['risks', 'common']);
    return (
        <div className="space-y-8">
            <div className="flex items-center gap-4">
                <div className="bg-accent/20 p-3 rounded-2xl">
                    <Plus className="h-6 w-6 text-accent" />
                </div>
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tighter">{t('risks:new_risk')}</h2>
                    <p className="text-slate-500 font-medium tracking-tight uppercase text-[10px] tracking-widest mt-1">
                        {t('risks:title')} / {t('common:actions.create')}
                    </p>
                </div>
            </div>

            <RiskForm />
        </div>
    );
}

export function RiskEditPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation(['risks', 'common']);
    const [risk, setRisk] = useState<Risk | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchRisk = async () => {
            if (!id) return;
            try {
                const data = await riskApi.getRisk(parseInt(id));
                setRisk(data);
            } catch (err) {
                console.error('Failed to fetch risk:', err);
                navigate('/risks');
            } finally {
                setIsLoading(false);
            }
        };
        fetchRisk();
    }, [id, navigate]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[40vh]">
                <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center gap-4">
                <div className="bg-accent/20 p-3 rounded-2xl">
                    <Edit className="h-6 w-6 text-accent" />
                </div>
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tighter">{t('risks:edit_risk')}</h2>
                    <p className="text-slate-500 font-medium tracking-tight uppercase text-[10px] tracking-widest mt-1">
                        {t('risks:title')} / {t('common:actions.edit')}
                    </p>
                </div>
            </div>

            {risk && <RiskForm initialData={risk} isEdit={true} />}
        </div>
    );
}
