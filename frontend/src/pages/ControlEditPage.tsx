import { motion } from 'framer-motion';
import { Edit } from 'lucide-react';
import { useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { ControlForm } from '@/components/control-form/ControlFormContainer';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
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
                backLabel={t('controls:detail.back_to_catalog')}
                isRetrying={isRetrying}
                onBack={() => navigate(returnTo)}
                onRetry={controlId === null ? undefined : () => void fetchControl()}
            />
        );
    }

    return (
        <PageContainer size="form">
            {loadOutcome === 'stale-with-error' ? (
                <DetailStaleWarning isRetrying={isRetrying} onRetry={() => void fetchControl()} />
            ) : null}
            {/* D7 / D14 (PG-12): one `h1`; the back label names the record it returns to. */}
            <PageHeader
                title={t('controls:edit_control')}
                description={control.name}
                documentTitle={t('common:page_title.edit', { name: control.name })}
                icon={Edit}
                back={{
                    label: t('common:actions.back_to_detail', { name: control.name }),
                    onClick: () => void navigate(detailPath),
                }}
                breadcrumbs={[
                    { label: t('navigation:sidebar.controls'), to: returnTo },
                    { label: control.name, to: detailPath },
                    { label: t('controls:edit_control') },
                ]}
            />

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
                        onSuccess={() => navigate(detailPath)}
                        approvalReturnTo={detailPath}
                    />
                ) : (
                    <FormCapabilityGateState state="denied" />
                )}
            </motion.div>
        </PageContainer>
    );
}

export default ControlEditPage;
