import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { IssueCreateForm } from '@/components/issues/IssueCreateForm';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { issuesApi } from '@/services/issuesApi';
import type { Issue } from '@/types/issue';
import { FormCapabilityGateState } from './shared/FormCapabilityGateState';
import { appendRegisterReturnTo, resolveRegisterReturnTo } from './shared/registerReturnContext';
import { useCreateCapabilityGate } from './shared/useCreateCapabilityGate';

export function IssueNewPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const returnTo = resolveRegisterReturnTo(searchParams.get('return_to'), '/issues');
    const { t } = useTranslation('issues');
    // PG-14: the shared create-capability gate separates "denied" from a network
    // failure (error + retry) instead of treating every failure as denied.
    const createGate = useCreateCapabilityGate({
        load: useCallback(() => issuesApi.list({ offset: 0, limit: 1 }), []),
        logMessage: 'Failed to load issue create capabilities.',
    });

    const handleCreated = (issue: Issue) => {
        void navigate(appendRegisterReturnTo(`/issues/${issue.id}`, returnTo));
    };

    // D7 / D14: the page title, a labelled back control and breadcrumbs stay in
    // place while the create capability loads or is denied.
    const body = createGate.state === 'allowed' ? (
        <section className="glass-card p-8 space-y-6">
            <IssueCreateForm onCreated={handleCreated} onCancel={() => navigate(returnTo)} />
        </section>
    ) : (
        <FormCapabilityGateState
            state={createGate.state}
            onRetry={createGate.retry}
            deniedDescriptionKey="permissions.create_denied"
            deniedNs="issues"
        />
    );

    return (
        <PageContainer size="form">
            <PageHeader
                title={t('new_page.title')}
                icon={Plus}
                back={{ label: t('actions.back_to_issues'), onClick: () => void navigate(returnTo) }}
                breadcrumbs={[
                    { label: t('navigation:sidebar.issues'), to: returnTo },
                    { label: t('new_page.title') },
                ]}
            />
            {body}
        </PageContainer>
    );
}

export default IssueNewPage;
