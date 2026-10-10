import { Plus } from 'lucide-react';
import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { RiskForm } from '@/components/RiskForm';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { useTranslation } from '@/i18n/hooks';
import { logError } from '@/services/logger';
import { riskApi } from '@/services/riskApi';
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

export function RiskNewPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { t } = useTranslation(['risks', 'common', 'vendors']);
    const { vendorId, returnTo } = coerceVendorContext(
        searchParams.get('vendor_id'),
        searchParams.get('return_to'),
    );
    const isVendorContext = vendorId !== null && returnTo !== null;
    const riskListReturnTo = resolveRegisterReturnTo(searchParams.get('return_to'), '/risks');
    const createGateState = useCreateCapabilityGate({
        load: useCallback(() => riskApi.getRisks({ offset: 0, limit: 1 }), []),
        logMessage: 'Failed to load risk create capabilities.',
    });

    const vendorContextGate = useCreateCapabilityGate({
        enabled: isVendorContext,
        load: useCallback(() => vendorApi.getVendor(vendorId!), [vendorId]),
        capability: 'can_create_linked_risk',
        logMessage: 'Failed to load vendor risk-create capabilities.',
    });

    const reportVendorOutcome = useVendorContextOutcome();
    const navigateToVendor = (flash: VendorDetailFlash) => {
        reportVendorOutcome(flash);
        void navigate(returnTo ?? '/risks');
    };

    const handleVendorContextSuccess = async (riskId: number, acceptNavigation?: () => void) => {
        if (!vendorId || !returnTo) {
            acceptNavigation?.();
            void navigate(`/risks/${riskId}`);
            return;
        }

        const finish = (flash: VendorDetailFlash) => {
            acceptNavigation?.();
            navigateToVendor(flash);
        };

        try {
            const result = await vendorLinkApi.linkRisk(vendorId, riskId);
            if (isProcessApprovalQueuedResponse(result)) {
                finish({
                    tone: 'warn',
                    message: t('vendors:links.risks.created_but_not_linked'),
                    ctaHref: `/risks/${riskId}`,
                    ctaLabel: t('vendors:links.actions.open_risk'),
                });
                return;
            }
            finish({
                tone: 'success',
                message: t('vendors:links.risks.created_and_linked'),
                ctaHref: `/risks/${riskId}`,
                ctaLabel: t('vendors:links.actions.open_risk'),
            });
        } catch (error) {
            logError('Risk created but failed to link vendor context.', error);
            finish({
                tone: 'warn',
                message: t('vendors:links.risks.created_but_not_linked'),
                ctaHref: `/risks/${riskId}`,
                ctaLabel: t('vendors:links.actions.open_risk'),
            });
        }
    };

    const gateState = combineCapabilityGateStates([createGateState.state, vendorContextGate.state]);

    return (
        <PageContainer size="form">
            {/* D7 / D14 (PG-12): one `h1`, a whole-phrase back label naming the destination. */}
            <PageHeader
                title={t('risks:new_risk')}
                icon={Plus}
                back={{
                    label: isVendorContext ? t('vendors:links.actions.back_to_vendor') : t('risks:actions.back_to_register'),
                    onClick: () => void navigate(isVendorContext ? returnTo! : riskListReturnTo),
                }}
                breadcrumbs={isVendorContext ? undefined : [
                    { label: t('navigation:sidebar.risks'), to: riskListReturnTo },
                    { label: t('risks:new_risk') },
                ]}
            />

            {gateState !== 'allowed' ? (
                <FormCapabilityGateState state={gateState} onRetry={() => { createGateState.retry(); vendorContextGate.retry(); }} />
            ) : (
                <RiskForm
                    onSuccess={isVendorContext
                        ? handleVendorContextSuccess
                        : (riskId) => navigate(appendRegisterReturnTo(`/risks/${riskId}`, riskListReturnTo))}
                    approvalReturnTo={isVendorContext ? returnTo! : riskListReturnTo}
                    onCancel={() => {
                        void navigate(isVendorContext ? returnTo! : riskListReturnTo);
                    }}
                    firstStepBackLabel={isVendorContext ? t('vendors:links.actions.back_to_vendor') : undefined}
                />
            )}
        </PageContainer>
    );
}

export default RiskNewPage;
