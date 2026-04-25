import type { TranslateFn } from './questionnairePresentation';

interface RiskQuestionnaireCompareNoticeProps {
    compareMode: boolean;
    hasPreviousCycle: boolean;
    previousCycleLoaded: boolean;
    t: TranslateFn;
}

export function RiskQuestionnaireCompareNotice({
    compareMode,
    hasPreviousCycle,
    previousCycleLoaded,
    t,
}: RiskQuestionnaireCompareNoticeProps) {
    if (!compareMode || !previousCycleLoaded || hasPreviousCycle) return null;

    return (
        <div className="text-xs text-slate-500">
            {t('risks:questionnaire.no_previous_cycle')}
        </div>
    );
}
