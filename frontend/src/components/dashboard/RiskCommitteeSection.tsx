import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi, type DashboardCommitteeSummary } from '@/services/dashboardApi';
import { useTranslation } from '@/i18n/hooks';
import { logError } from '@/services/logger';
import {
    RiskCommitteeErrorState,
    RiskCommitteeLoadingState,
    RiskCommitteeSummaryContent,
} from './RiskCommitteeCards';

export function RiskCommitteeSection() {
    const { t } = useTranslation('dashboard');
    const navigate = useNavigate();
    const [summary, setSummary] = useState<DashboardCommitteeSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        dashboardApi.fetchCommitteeSummary()
            .then(setSummary)
            .catch((err) => {
                logError('Failed to fetch committee summary:', err);
                setError(t('errors.load_failed'));
            })
            .finally(() => setIsLoading(false));
    }, [t]);

    if (isLoading) {
        return <RiskCommitteeLoadingState />;
    }

    if (error || !summary) {
        return <RiskCommitteeErrorState message={error} t={t} />;
    }

    return <RiskCommitteeSummaryContent navigate={navigate} summary={summary} t={t} />;
}
