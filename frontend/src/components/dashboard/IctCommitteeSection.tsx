import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { RefreshCw } from 'lucide-react';

import { RegisterExportLink } from '@/components/ict-register/RegisterExportLink';
import { TableErrorState, useTableErrorContract } from '@/components/tables/tableError';
import { useTranslation } from '@/i18n/hooks';
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
    const { t, i18n } = useTranslation('ictRegisterCommittee');
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
            <div
                className="flex flex-col items-center justify-center gap-4 py-24"
                aria-busy="true"
                data-loading="true"
                data-testid="committee-loading"
            >
                <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 font-bold animate-pulse uppercase tracking-widest text-xs">
                    {t('loading')}
                </p>
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
              language: i18n.language ?? 'en',
              t,
          })
        : null;

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
                    <p className="text-slate-500 font-medium mt-1">{t('subtitle')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <RegisterExportLink />
                    <button
                        type="button"
                        onClick={() => void fetchCommittee()}
                        data-testid="committee-refresh-button"
                        className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 font-bold hover:bg-white/10 transition-all flex items-center gap-2"
                    >
                        <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                        {t('actions.refresh')}
                    </button>
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
                <div className="glass-card text-slate-500 text-center py-8">{t('empty')}</div>
            )}
        </div>
    );
}
