import { Edit } from 'lucide-react';
import { useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { RiskForm } from '@/components/RiskForm';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { riskApi } from '@/services/riskApi';
import type { Risk } from '@/types/risk';
import { DetailLoadUnavailableState, DetailStaleWarning } from './detail/DetailLoadState';
import { useDetailQuery } from './detail/useDetailQuery';
import { FormCapabilityGateState } from './shared/FormCapabilityGateState';
import { appendRegisterReturnTo, resolveRegisterReturnTo } from './shared/registerReturnContext';

export function RiskEditPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const returnTo = resolveRegisterReturnTo(searchParams.get('return_to'), '/risks');
    const detailPath = appendRegisterReturnTo(`/risks/${id}`, returnTo);
    const { t } = useTranslation(['risks', 'common']);
    const loadRisk = useCallback((riskId: number) => riskApi.getRisk(riskId), []);
    const {
        isRetrying,
        loadOutcome,
        refetch: fetchRisk,
        resource: risk,
        resourceId: riskId,
    } = useDetailQuery<Risk>({ entity: 'risk-edit', rawId: id, load: loadRisk });

    if (loadOutcome === 'loading') {
        return <FormCapabilityGateState state="loading" />;
    }

    if (loadOutcome === 'unavailable' || !risk) {
        return (
            <DetailLoadUnavailableState
                backLabel={t('risks:actions.back_to_register')}
                isRetrying={isRetrying}
                onBack={() => navigate(returnTo)}
                onRetry={riskId === null ? undefined : () => void fetchRisk()}
            />
        );
    }

    return (
        <PageContainer size="form">
            {loadOutcome === 'stale-with-error' ? (
                <DetailStaleWarning isRetrying={isRetrying} onRetry={() => void fetchRisk()} />
            ) : null}
            <PageHeader
                title={t('risks:edit_risk')}
                description={risk.name}
                documentTitle={t('common:page_title.edit', { name: risk.name })}
                icon={Edit}
                back={{
                    label: t('common:actions.back_to_detail', { name: risk.name }),
                    onClick: () => void navigate(detailPath),
                }}
                breadcrumbs={[
                    { label: t('navigation:sidebar.risks'), to: returnTo },
                    { label: risk.name, to: detailPath },
                    { label: t('risks:edit_risk') },
                ]}
            />

            {resolveCapabilityFlag(risk.capabilities, 'can_update') ? (
                <RiskForm
                    initialData={risk}
                    isEdit={true}
                    onCancel={() => navigate(detailPath)}
                    onSuccess={() => navigate(detailPath)}
                    approvalReturnTo={detailPath}
                />
            ) : (
                <FormCapabilityGateState state="denied" />
            )}
        </PageContainer>
    );
}

export default RiskEditPage;
