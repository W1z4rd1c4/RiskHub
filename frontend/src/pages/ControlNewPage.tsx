import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ControlForm } from '@/components/control-form/ControlFormContainer';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { useTranslation } from '@/i18n/hooks';
import { controlApi } from '@/services/controlApi';
import { logError } from '@/services/logger';
import { vendorApi } from '@/services/vendorApi';
import { vendorLinkApi } from '@/services/vendorLinkApi';
import { isProcessApprovalQueuedResponse } from '@/types/process';

import { FormCapabilityGateState } from './shared/FormCapabilityGateState';
import { appendRegisterReturnTo, resolveRegisterReturnTo } from './shared/registerReturnContext';
import { combineCapabilityGateStates, useCreateCapabilityGate } from './shared/useCreateCapabilityGate';
import { useVendorContextOutcome } from './vendors/useVendorContextOutcome';
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
    const controlListReturnTo = resolveRegisterReturnTo(searchParams.get('return_to'), '/controls');
    const createGateState = useCreateCapabilityGate({
        load: useCallback(() => controlApi.getControls({ offset: 0, limit: 1 }), []),
        logMessage: 'Failed to load control create capabilities.',
    });

    const vendorContextGate = useCreateCapabilityGate({
        enabled: isVendorContext,
        load: useCallback(() => vendorApi.getVendor(vendorId!), [vendorId]),
        capability: 'can_create_linked_control',
        logMessage: 'Failed to load vendor control-create capabilities.',
    });

    const reportVendorOutcome = useVendorContextOutcome();
    const navigateToVendor = (flash: VendorDetailFlash) => {
        reportVendorOutcome(flash);
        void navigate(returnTo ?? '/controls');
    };

    const handleVendorContextSuccess = async (
        controlId: number,
        acceptNavigation?: () => void,
    ) => {
        if (!vendorId || !returnTo) {
            acceptNavigation?.();
            void navigate(`/controls/${controlId}`);
            return;
        }

        const finish = (flash: VendorDetailFlash) => {
            acceptNavigation?.();
            navigateToVendor(flash);
        };

        try {
            const result = await vendorLinkApi.linkControl(vendorId, controlId);
            if (isProcessApprovalQueuedResponse(result)) {
                finish({
                    tone: 'warn',
                    message: t('vendors:links.controls.created_but_not_linked'),
                    ctaHref: `/controls/${controlId}`,
                    ctaLabel: t('vendors:links.actions.open_control'),
                });
                return;
            }
            finish({
                tone: 'success',
                message: t('vendors:links.controls.created_and_linked'),
                ctaHref: `/controls/${controlId}`,
                ctaLabel: t('vendors:links.actions.open_control'),
            });
        } catch (error) {
            logError('Control created but failed to link vendor context.', error);
            finish({
                tone: 'warn',
                message: t('vendors:links.controls.created_but_not_linked'),
                ctaHref: `/controls/${controlId}`,
                ctaLabel: t('vendors:links.actions.open_control'),
            });
        }
    };

    const gateState = combineCapabilityGateStates([createGateState.state, vendorContextGate.state]);

    return (
        <PageContainer size="form">
            {/* D7 / D14 (PG-12): one `h1`, a whole-phrase back label naming the destination. */}
            <PageHeader
                title={t('controls:new_control')}
                description={t('controls:page_subtitle')}
                icon={Plus}
                back={{
                    label: isVendorContext ? t('vendors:links.actions.back_to_vendor') : t('controls:detail.back_to_catalog'),
                    onClick: () => void navigate(isVendorContext ? returnTo! : controlListReturnTo),
                }}
                breadcrumbs={isVendorContext ? undefined : [
                    { label: t('navigation:sidebar.controls'), to: controlListReturnTo },
                    { label: t('controls:new_control') },
                ]}
            />

            {gateState !== 'allowed' ? (
                <FormCapabilityGateState state={gateState} onRetry={() => { createGateState.retry(); vendorContextGate.retry(); }} />
            ) : (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <ControlForm
                        allowRiskLinking={!isVendorContext}
                        onSuccess={isVendorContext
                            ? handleVendorContextSuccess
                            : (controlId) => navigate(
                                appendRegisterReturnTo(`/controls/${controlId}`, controlListReturnTo),
                            )}
                        onCancel={() => navigate(isVendorContext ? returnTo! : controlListReturnTo)}
                        firstStepBackLabel={isVendorContext ? t('vendors:links.actions.back_to_vendor') : undefined}
                    />
                </motion.div>
            )}
        </PageContainer>
    );
}

export default ControlNewPage;
