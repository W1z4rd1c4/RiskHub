import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ControlForm } from '@/components/control-form/ControlFormContainer';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { controlApi } from '@/services/controlApi';
import { logError } from '@/services/logger';
import { vendorApi } from '@/services/vendorApi';
import { vendorLinkApi } from '@/services/vendorLinkApi';

import { FormCapabilityGateState } from './shared/FormCapabilityGateState';
import { combineCapabilityGateStates, useCreateCapabilityGate } from './shared/useCreateCapabilityGate';
import {
    coerceVendorContext,
    type VendorDetailFlash,
} from './vendors/vendorDetailPresentation';

export function ControlNewPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { t } = useTranslation(['controls', 'common', 'vendors']);
    const { vendorId, returnTo } = coerceVendorContext(
        searchParams.get('vendor_id'),
        searchParams.get('return_to'),
    );
    const isVendorContext = vendorId !== null && returnTo !== null;
    const [vendorContextState, setVendorContextState] = useState<'loading' | 'allowed' | 'denied'>(
        isVendorContext ? 'loading' : 'allowed',
    );
    const createGateState = useCreateCapabilityGate({
        load: useCallback(() => controlApi.getControls({ offset: 0, limit: 1 }), []),
        logMessage: 'Failed to load control create capabilities.',
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
                    resolveCapabilityFlag(vendor.capabilities, 'can_create_linked_control') ? 'allowed' : 'denied',
                );
            } catch (error) {
                logError('Failed to load vendor control-create capabilities.', error);
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
            void navigate('/controls');
            return;
        }
        void navigate(returnTo, {
            state: {
                vendorFlash: flash,
            },
        });
    };

    const handleVendorContextSuccess = async (controlId: number) => {
        if (!vendorId || !returnTo) {
            void navigate(`/controls/${controlId}`);
            return;
        }

        try {
            await vendorLinkApi.linkControl(vendorId, controlId);
            navigateToVendor({
                tone: 'success',
                message: t('vendors:links.controls.created_and_linked'),
                ctaHref: `/controls/${controlId}`,
                ctaLabel: t('vendors:links.actions.open_control'),
            });
        } catch (error) {
            logError('Control created but failed to link vendor context.', error);
            navigateToVendor({
                tone: 'warn',
                message: t('vendors:links.controls.created_but_not_linked'),
                ctaHref: `/controls/${controlId}`,
                ctaLabel: t('vendors:links.actions.open_control'),
            });
        }
    };

    const gateState = combineCapabilityGateStates([createGateState, vendorContextState]);

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-2">
                <button
                    onClick={() => navigate(isVendorContext ? returnTo! : '/controls')}
                    className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-accent transition-colors uppercase tracking-widest mb-2"
                >
                    <ArrowLeft className="h-3 w-3" />
                    {isVendorContext ? t('vendors:links.actions.back_to_vendor') : `${t('common:actions.back')} ${t('controls:title')}`}
                </button>
                <h2 className="text-3xl font-black text-white tracking-tighter">{t('controls:new_control')}</h2>
                <p className="text-slate-500 font-medium tracking-tight">{t('controls:page_subtitle')}</p>
            </div>

            {gateState !== 'allowed' ? (
                <FormCapabilityGateState state={gateState} />
            ) : (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <ControlForm
                        allowRiskLinking={!isVendorContext}
                        onSuccess={isVendorContext ? handleVendorContextSuccess : undefined}
                        onCancel={isVendorContext ? () => navigate(returnTo!) : undefined}
                        firstStepBackLabel={isVendorContext ? t('vendors:links.actions.back_to_vendor') : undefined}
                    />
                </motion.div>
            )}
        </div>
    );
}

export default ControlNewPage;
