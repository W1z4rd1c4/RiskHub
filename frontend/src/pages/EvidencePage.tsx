import { Activity, ClipboardCheck, FileSpreadsheet, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuthz } from '@/authz/useAuthz';
import { useVendorReportCapabilities } from '@/hooks/useVendorReportCapabilities';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { executionApi } from '@/services/executionApi';
import { logError } from '@/services/logger';

type CardState = 'available' | 'pending' | 'unavailable';

interface EvidenceCardProps {
    icon: LucideIcon;
    linkLabel: string;
    question: string;
    retry?: () => void;
    state: CardState;
    title: string;
    to: string;
}

function EvidenceCard({ icon: Icon, linkLabel, question, retry, state, title, to }: EvidenceCardProps) {
    const { t } = useTranslation('evidence');

    return (
        <article className="glass-card flex min-h-64 flex-col gap-4 p-6">
            <div className="flex items-center gap-3">
                <div className="rounded-xl bg-accent/10 p-2">
                    <Icon className="h-5 w-5 text-accent-text" aria-hidden="true" />
                </div>
                <h2 className="text-xl font-bold text-foreground">{title}</h2>
            </div>
            <p className="flex-1 text-muted-foreground">{question}</p>
            {state === 'available' ? (
                <Link
                    to={to}
                    className="inline-flex w-fit items-center rounded-xl bg-accent px-4 py-2 font-bold text-accent-foreground"
                >
                    {linkLabel}
                </Link>
            ) : state === 'pending' ? (
                <p role="status" className="text-sm font-medium text-muted-foreground">
                    {t('availability.checking')}
                </p>
            ) : (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-rose-300">{t('availability.unavailable')}</span>
                    <button
                        type="button"
                        onClick={retry}
                        className="rounded-lg border border-border bg-muted px-3 py-2 text-sm font-bold text-foreground"
                    >
                        {t('availability.retry')}
                    </button>
                </div>
            )}
        </article>
    );
}

export function EvidencePage() {
    const authz = useAuthz();
    const { t } = useTranslation('evidence');
    const vendorCapability = useVendorReportCapabilities();
    const [executionState, setExecutionState] = useState<CardState | 'omitted'>(
        authz.canReadControls ? 'pending' : 'omitted',
    );
    const [executionAttempt, setExecutionAttempt] = useState(0);

    useEffect(() => {
        if (!authz.canReadControls) {
            setExecutionState('omitted');
            return;
        }

        let cancelled = false;
        setExecutionState('pending');
        executionApi.getExecutions({ skip: 0, limit: 1 })
            .then((response) => {
                if (cancelled) return;
                setExecutionState(resolveCapabilityFlag(response.capabilities, 'can_read') ? 'available' : 'omitted');
            })
            .catch((error: unknown) => {
                if (cancelled) return;
                setExecutionState('unavailable');
                logError('Failed to load control execution history capability.', error);
            });

        return () => {
            cancelled = true;
        };
    }, [authz.canReadControls, executionAttempt]);

    const vendorCanRead = resolveCapabilityFlag(vendorCapability.capabilities, 'can_read');
    const vendorState: CardState | 'omitted' = vendorCapability.state === 'pending'
        ? 'pending'
        : vendorCapability.state === 'unavailable'
            ? 'unavailable'
            : vendorCanRead ? 'available' : 'omitted';

    return (
        <div className="space-y-8">
            <header>
                <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
                <p className="mt-2 text-muted-foreground">{t('subtitle')}</p>
            </header>
            <div className="grid gap-6 lg:grid-cols-3">
                {authz.canViewActivityLog ? (
                    <EvidenceCard
                        icon={Activity}
                        linkLabel={t('cards.activity.link')}
                        question={t('cards.activity.question')}
                        state="available"
                        title={t('cards.activity.title')}
                        to="/activity-log"
                    />
                ) : null}
                {executionState !== 'omitted' ? (
                    <EvidenceCard
                        icon={ClipboardCheck}
                        linkLabel={t('cards.execution.link')}
                        question={t('cards.execution.question')}
                        retry={() => setExecutionAttempt((current) => current + 1)}
                        state={executionState}
                        title={t('cards.execution.title')}
                        to="/audit-trail"
                    />
                ) : null}
                {vendorState !== 'omitted' ? (
                    <EvidenceCard
                        icon={FileSpreadsheet}
                        linkLabel={t('cards.vendor.link')}
                        question={t('cards.vendor.question')}
                        retry={vendorCapability.retry}
                        state={vendorState}
                        title={t('cards.vendor.title')}
                        to="/vendor-reports"
                    />
                ) : null}
            </div>
        </div>
    );
}

export default EvidencePage;
