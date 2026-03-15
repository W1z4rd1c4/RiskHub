import { useEffect, useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { KRIForm } from '@/components/KRIForm';
import { useTranslation } from '@/i18n/hooks';
import { vendorApi } from '@/services/vendorApi';
import {
    coerceVendorContext,
} from './vendors/vendorDetailPresentation';

export function KRINewPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { t } = useTranslation(['kris', 'common', 'vendors']);
    const riskIdParam = searchParams.get('risk_id');
    const parsedRiskId = riskIdParam ? Number(riskIdParam) : NaN;
    const preselectedRiskId = Number.isInteger(parsedRiskId) && parsedRiskId > 0
        ? parsedRiskId
        : undefined;
    const { vendorId, returnTo } = coerceVendorContext(
        searchParams.get('vendor_id'),
        searchParams.get('return_to'),
    );
    const isVendorContext = vendorId !== null && returnTo !== null;
    const [vendorName, setVendorName] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (!vendorId) {
            setVendorName(undefined);
            return;
        }

        const loadVendorName = async () => {
            try {
                const vendor = await vendorApi.getVendor(vendorId);
                setVendorName(vendor.name);
            } catch (error) {
                console.error('Failed to load vendor context for KRI create:', error);
                setVendorName(undefined);
            }
        };

        void loadVendorName();
    }, [vendorId]);

    const handleVendorContextCancel = () => {
        if (returnTo) {
            navigate(returnTo);
            return;
        }
        navigate('/kris');
    };

    return (
        <div className="space-y-8">
            <div className="space-y-3">
                <button
                    onClick={() => navigate(isVendorContext ? returnTo! : '/kris')}
                    className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-accent transition-colors uppercase tracking-widest"
                >
                    <ArrowLeft className="h-3 w-3" />
                    {isVendorContext ? t('vendors:links.actions.back_to_vendor') : `${t('common:actions.back')} ${t('kris:title')}`}
                </button>
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
            </div>

            <KRIForm
                initialData={preselectedRiskId ? { risk_id: preselectedRiskId } : undefined}
                onCancel={isVendorContext ? handleVendorContextCancel : undefined}
                firstStepBackLabel={isVendorContext ? t('vendors:links.actions.back_to_vendor') : undefined}
                vendorContext={isVendorContext ? {
                    vendorId,
                    vendorName,
                    returnTo,
                } : null}
            />
        </div>
    );
}
