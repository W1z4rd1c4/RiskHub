import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { RiskForm } from '@/components/RiskForm';
import { riskApi } from '@/services/riskApi';
import { vendorLinkApi } from '@/services/vendorLinkApi';
import type { Risk } from '@/types/risk';
import { ArrowLeft, Edit, Plus } from 'lucide-react';
import {
    coerceVendorContext,
    type VendorDetailFlash,
} from './vendors/vendorDetailPresentation';

export function RiskNewPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { t } = useTranslation(['risks', 'common', 'vendors']);
    const { vendorId, returnTo } = coerceVendorContext(
        searchParams.get('vendor_id'),
        searchParams.get('return_to'),
    );
    const isVendorContext = vendorId !== null && returnTo !== null;

    const navigateToVendor = (flash: VendorDetailFlash) => {
        if (!returnTo) {
            navigate('/risks');
            return;
        }
        navigate(returnTo, {
            state: {
                vendorFlash: flash,
            },
        });
    };

    const handleVendorContextSuccess = async (riskId: number) => {
        if (!vendorId || !returnTo) {
            navigate(`/risks/${riskId}`);
            return;
        }

        try {
            await vendorLinkApi.linkRisk(vendorId, riskId);
            navigateToVendor({
                tone: 'success',
                message: t('vendors:links.risks.created_and_linked'),
                ctaHref: `/risks/${riskId}`,
                ctaLabel: t('vendors:links.actions.open_risk'),
            });
        } catch (error) {
            console.error('Risk created but failed to link vendor context:', error);
            navigateToVendor({
                tone: 'warn',
                message: t('vendors:links.risks.created_but_not_linked'),
                ctaHref: `/risks/${riskId}`,
                ctaLabel: t('vendors:links.actions.open_risk'),
            });
        }
    };

    return (
        <div className="space-y-8">
            <div className="space-y-3">
                <button
                    onClick={() => navigate(isVendorContext ? returnTo! : '/risks')}
                    className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-accent transition-colors uppercase tracking-widest"
                >
                    <ArrowLeft className="h-3 w-3" />
                    {isVendorContext ? t('vendors:links.actions.back_to_vendor') : `${t('common:actions.back')} ${t('risks:title')}`}
                </button>
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
            </div>

            <RiskForm
                onSuccess={isVendorContext ? handleVendorContextSuccess : undefined}
                onCancel={isVendorContext ? () => navigate(returnTo!) : undefined}
                firstStepBackLabel={isVendorContext ? t('vendors:links.actions.back_to_vendor') : undefined}
            />
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
