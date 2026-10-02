import { useCallback } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { KRIFormContainer as KRIForm } from '@/components/kri-form/KRIFormContainer';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { kriApi } from '@/services/kriApi';
import { vendorApi } from '@/services/vendorApi';

import { FormCapabilityGateState } from './shared/FormCapabilityGateState';
import { appendRegisterReturnTo, resolveRegisterReturnTo } from './shared/registerReturnContext';
import { combineCapabilityGateStates, useCreateCapabilityGate } from './shared/useCreateCapabilityGate';
import { coerceVendorContext } from './vendors/vendorDetailPresentation';

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
    const kriListReturnTo = resolveRegisterReturnTo(searchParams.get('return_to'), '/kris');
    const createGateState = useCreateCapabilityGate({
        load: useCallback(() => kriApi.getKRIs({ offset: 0, limit: 1 }), []),
        logMessage: 'Failed to load KRI create capabilities.',
    });

    const vendorContextGate = useCreateCapabilityGate({
        enabled: vendorId !== null,
        load: useCallback(() => vendorApi.getVendor(vendorId!), [vendorId]),
        capability: 'can_create_linked_kri',
        logMessage: 'Failed to load vendor kri-create capabilities.',
    });

    const handleVendorContextCancel = () => {
        if (returnTo) {
            void navigate(returnTo);
            return;
        }
        void navigate(kriListReturnTo);
    };

    const gateState = combineCapabilityGateStates([createGateState.state, vendorContextGate.state]);

    return (
        <PageContainer size="form">
            {/* D7 / D14 (PG-12): one `h1`, a whole-phrase back label naming the destination. */}
            <PageHeader
                title={t('kris:new_kri')}
                icon={Plus}
                back={{
                    label: isVendorContext ? t('vendors:links.actions.back_to_vendor') : t('kris:actions.back_to_register'),
                    onClick: () => void navigate(isVendorContext ? returnTo! : kriListReturnTo),
                }}
                breadcrumbs={isVendorContext ? undefined : [
                    { label: t('navigation:sidebar.kris'), to: kriListReturnTo },
                    { label: t('kris:new_kri') },
                ]}
            />

            {gateState !== 'allowed' ? (
                <FormCapabilityGateState state={gateState} onRetry={() => { createGateState.retry(); vendorContextGate.retry(); }} />
            ) : (
                <KRIForm
                    initialData={preselectedRiskId ? { risk_id: preselectedRiskId } : undefined}
                    onCancel={isVendorContext ? handleVendorContextCancel : () => navigate(kriListReturnTo)}
                    onSuccess={isVendorContext
                        ? undefined
                        : (kriId) => navigate(appendRegisterReturnTo(`/kris/${kriId}`, kriListReturnTo))}
                    firstStepBackLabel={isVendorContext ? t('vendors:links.actions.back_to_vendor') : undefined}
                    vendorContext={isVendorContext ? {
                        vendorId,
                        vendorName: vendorContextGate.data?.name,
                        returnTo,
                        protectedChangeRequiresApproval: resolveCapabilityFlag(vendorContextGate.data?.capabilities, 'protected_change_requires_approval'),
                    } : null}
                />
            )}
        </PageContainer>
    );
}

export default KRINewPage;
