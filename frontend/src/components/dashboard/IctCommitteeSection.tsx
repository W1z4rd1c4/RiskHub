import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import { RegisterExportLink } from '@/components/ict-register/RegisterExportLink';
import { TableErrorState, useTableErrorContract } from '@/components/tables/tableError';
import { RefreshButton } from '@/components/ui/RefreshButton';
import { useFormat, useTranslation } from '@/i18n/hooks';
import {
    buildIctCommitteePresentation,
    type IctCommitteePresentationSection,
} from '@/pages/ictRegisterCommittee/buildIctCommitteePresentation';
import { ReadAccessDeniedState } from '@/pages/shared/ReadAccessDeniedState';
import { apiClient, isForbiddenApiError } from '@/services/apiClient';
import { ictRegisterCommitteeApi } from '@/services/ictRegisterCommitteeApi';
import type { IctCommittee } from '@/types/ictRegisterCommittee';

import { IctCommitteeDashboardSection } from './ictCommittee/IctCommitteeDashboardSection';
import { IctCommitteeExecutiveSummarySection } from './ictCommittee/IctCommitteeExecutiveSummarySection';
import { IctCommitteeRoiReadinessSection } from './ictCommittee/IctCommitteeRoiReadinessSection';
import { EmptyState, LoadingState } from '@/components/ui/state';

function renderCommitteeSection(section: IctCommitteePresentationSection): ReactElement {
    switch (section.key) {
        case 'dashboard':
            return <IctCommitteeDashboardSection key={section.key} presentation={section.presentation} />;
        case 'executiveSummary':
            return <IctCommitteeExecutiveSummarySection key={section.key} presentation={section.presentation} />;
        case 'roiReadiness':
            return <IctCommitteeRoiReadinessSection key={section.key} presentation={section.presentation} />;
    }
}

export function IctCommitteeSection() {
    const { t } = useTranslation('ictRegisterCommittee');
    const format = useFormat();
    const [data, setData] = useState<IctCommittee | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [isAccessDenied, setIsAccessDenied] = useState(false);

    const fetchCommittee = useCallback(async () => {
        setIsLoading(true);
        setErrorKey(null);
        try {
            setData(await ictRegisterCommitteeApi.getCommittee());
            setIsAccessDenied(false);
        } catch (error) {
            if (isForbiddenApiError(error)) {
                setIsAccessDenied(true);
            } else {
                setErrorKey(apiClient.toUiMessageKey(error));
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchCommittee();
    }, [fetchCommittee]);

    const hasData = data !== null;
    const errorContract = useTableErrorContract({
        isError: errorKey !== null,
        hasData,
    });

    if (isAccessDenied) {
        return <ReadAccessDeniedState />;
    }

    if (isLoading && !hasData) {
        return (
            <div data-loading="true">
                <LoadingState className="py-24" label={t('loading')} testId="committee-loading" />
            </div>
        );
    }

    if (errorContract.showErrorBlock) {
        return (
            <TableErrorState onRetry={() => void fetchCommittee()} isRetrying={isLoading} testId="committee-error" />
        );
    }

    const presentation = data
        ? buildIctCommitteePresentation(data, {
              language: format.locale,
              t,
          })
        : null;

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    {/* D7 / DS-15: a section of the dashboard, so `h2`; the dashboard owns the `h1`. */}
                    <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground">{t('title')}</h2>
                    <p className="text-muted-foreground font-medium mt-1">{t('subtitle')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <RegisterExportLink />
                    <RefreshButton
                        label={t('actions.refresh')}
                        onRefresh={() => void fetchCommittee()}
                        isFetching={isLoading}
                        data-testid="committee-refresh-button"
                    />
                </div>
            </div>

            {errorContract.showErrorBanner && (
                <TableErrorState
                    variant="banner"
                    onRetry={() => void fetchCommittee()}
                    isRetrying={isLoading}
                    testId="committee-error-banner"
                />
            )}

            {presentation?.sections.map(renderCommitteeSection)}

            {!isLoading && !data && !errorKey && (
                <EmptyState layout="section" title={t('empty')} className="glass-card" testId="committee-empty" />
            )}
        </div>
    );
}
