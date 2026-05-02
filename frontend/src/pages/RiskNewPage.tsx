import { ArrowLeft, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { RiskForm } from '@/components/RiskForm';
import { useTranslation } from '@/i18n/hooks';
import { logError } from '@/services/logger';
import { riskApi } from '@/services/riskApi';
import { vendorApi } from '@/services/vendorApi';
import { vendorLinkApi } from '@/services/vendorLinkApi';

import { FormCapabilityGateState } from './shared/FormCapabilityGateState';
import { combineCapabilityGateStates, useCreateCapabilityGate } from './shared/useCreateCapabilityGate';
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
    const [vendorContextState, setVendorContextState] = useState<'loading' | 'allowed' | 'denied'>(
        isVendorContext ? 'loading' : 'allowed',
    );
    const createGateState = useCreateCapabilityGate({
        load: useCallback(() => riskApi.getRisks({ offset: 0, limit: 1 }), []),
        logMessage: 'Failed to load risk create capabilities.',
    });

    useEffect(() => {
        if (!isVendorContext || vendorId === null) {
            setVendorContextState('allowed');
            return;
        }

        let isMounted = true;
        const loadVendorContext = async () => {
            setVendorContextState('loading');
            try {
                const vendor = await vendorApi.getVendor(vendorId);
                if (!isMounted) return;
                setVendorContextState(
                    vendor.capabilities?.can_create_linked_risk === true ? 'allowed' : 'denied',
                );
            } catch (error) {
                logError('Failed to load vendor risk-create capabilities.', error);
                if (isMounted) {
                    setVendorContextState('denied');
                }
            }
        };

        void loadVendorContext();

        return () => {
            isMounted = false;
        };
    }, [isVendorContext, vendorId]);

    const navigateToVendor = (flash: VendorDetailFlash) => {
        if (!returnTo) {
            void navigate('/risks');
            return;
        }
        void navigate(returnTo, {
            state: {
                vendorFlash: flash,
            },
        });
    };

    const handleVendorContextSuccess = async (riskId: number) => {
        if (!vendorId || !returnTo) {
            void navigate(`/risks/${riskId}`);
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
            logError('Risk created but failed to link vendor context.', error);
            navigateToVendor({
                tone: 'warn',
                message: t('vendors:links.risks.created_but_not_linked'),
                ctaHref: `/risks/${riskId}`,
                ctaLabel: t('vendors:links.actions.open_risk'),
            });
        }
    };

    const gateState = combineCapabilityGateStates([createGateState, vendorContextState]);

    return (
        <div className="space-y-8">
            <div className="space-y-3">
                <button
                    onClick={() => {
                        void navigate(isVendorContext ? returnTo! : '/risks');
                    }}
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

            {gateState !== 'allowed' ? (
                <FormCapabilityGateState state={gateState} />
            ) : (
                <RiskForm
                    onSuccess={isVendorContext ? handleVendorContextSuccess : undefined}
                    onCancel={isVendorContext ? () => {
                        void navigate(returnTo!);
                    } : undefined}
                    firstStepBackLabel={isVendorContext ? t('vendors:links.actions.back_to_vendor') : undefined}
                />
            )}
        </div>
    );
}

export default RiskNewPage;
