import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { ControlForm } from '@/components/control-form/ControlFormContainer';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { controlApi } from '@/services/controlApi';
import type { Control } from '@/types/control';
import { DetailLoadUnavailableState, DetailStaleWarning } from './detail/DetailLoadState';
import { useDetailQuery } from './detail/useDetailQuery';
import { FormCapabilityGateState } from './shared/FormCapabilityGateState';
import { appendRegisterReturnTo, resolveRegisterReturnTo } from './shared/registerReturnContext';

export function ControlEditPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const returnTo = resolveRegisterReturnTo(searchParams.get('return_to'), '/controls');
    const detailPath = appendRegisterReturnTo(`/controls/${id}`, returnTo);
    const { t } = useTranslation(['controls', 'common']);
    const loadControl = useCallback((controlId: number) => controlApi.getControl(controlId), []);
    const {
        isRetrying,
        loadOutcome,
        refetch: fetchControl,
        resource: control,
        resourceId: controlId,
    } = useDetailQuery<Control>({ entity: 'control', rawId: id, load: loadControl });

    if (loadOutcome === 'loading') {
        return <FormCapabilityGateState state="loading" />;
    }

    if (loadOutcome === 'unavailable' || !control) {
        return (
            <DetailLoadUnavailableState
                backLabel={t('controls:title')}
                isRetrying={isRetrying}
                onBack={() => navigate(returnTo)}
                onRetry={controlId === null ? undefined : () => void fetchControl()}
            />
        );
    }

    return (
        <div className="space-y-8">
            {loadOutcome === 'stale-with-error' ? (
                <DetailStaleWarning isRetrying={isRetrying} onRetry={() => void fetchControl()} />
            ) : null}
            <div className="flex flex-col gap-2">
                <button
                    onClick={() => navigate(detailPath)}
                    className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-accent transition-colors uppercase tracking-widest mb-2"
                >
                    <ArrowLeft className="h-3 w-3" /> {t('common:actions.back')} {t('common:labels.details')}
                </button>
                <h2 className="text-3xl font-black text-white tracking-tighter">{t('controls:edit_control')}</h2>
                <p className="text-slate-500 font-medium tracking-tight">{t('controls:view_control')}: {control.name}</p>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                {resolveCapabilityFlag(control.capabilities, 'can_update') ? (
                    <ControlForm
                        initialData={control}
                        isEdit={true}
                        allowRiskLinking={resolveCapabilityFlag(control.capabilities, 'can_link_risk')}
                        onCancel={() => navigate(detailPath)}
                        onSuccess={(_controlId, locationState) => navigate(
                            detailPath,
                            locationState ? { state: locationState } : undefined,
                        )}
                    />
                ) : (
                    <FormCapabilityGateState state="denied" />
                )}
            </motion.div>
        </div>
    );
}

export default ControlEditPage;
