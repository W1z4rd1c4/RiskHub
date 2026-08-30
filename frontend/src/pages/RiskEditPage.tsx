import { Edit } from 'lucide-react';
import { useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { RiskForm } from '@/components/RiskForm';
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
                backLabel={t('risks:title')}
                isRetrying={isRetrying}
                onBack={() => navigate(returnTo)}
                onRetry={riskId === null ? undefined : () => void fetchRisk()}
            />
        );
    }

    return (
        <div className="space-y-8">
            {loadOutcome === 'stale-with-error' ? (
                <DetailStaleWarning isRetrying={isRetrying} onRetry={() => void fetchRisk()} />
            ) : null}
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

            {resolveCapabilityFlag(risk.capabilities, 'can_update') ? (
                <RiskForm
                    initialData={risk}
                    isEdit={true}
                    onCancel={() => navigate(detailPath)}
                    onSuccess={() => navigate(detailPath)}
                />
            ) : (
                <FormCapabilityGateState state="denied" />
            )}
        </div>
    );
}

export default RiskEditPage;
