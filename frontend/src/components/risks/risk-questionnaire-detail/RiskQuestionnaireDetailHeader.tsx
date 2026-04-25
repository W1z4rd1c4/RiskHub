import { FileText, X } from 'lucide-react';

import type { RiskQuestionnaireDetail } from '@/types/riskQuestionnaire';

import { RiskQuestionnaireMetaBar } from './RiskQuestionnaireMetaBar';
import type { TranslateFn } from './questionnairePresentation';

interface RiskQuestionnaireDetailHeaderProps {
    compareMode: boolean;
    isOverdue: boolean;
    locale: string;
    onClose: () => void;
    questionnaire: RiskQuestionnaireDetail | null;
    setCompareMode: (updater: (value: boolean) => boolean) => void;
    t: TranslateFn;
}

export function RiskQuestionnaireDetailHeader({
    compareMode,
    isOverdue,
    locale,
    onClose,
    questionnaire,
    setCompareMode,
    t,
}: RiskQuestionnaireDetailHeaderProps) {
    return (
        <div className="flex items-start justify-between p-6 border-b border-white/5">
            <div className="min-w-0">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <FileText className="h-5 w-5 text-accent" />
                    {t('risks:questionnaire.title')}
                </h3>
                {questionnaire && (
                    <RiskQuestionnaireMetaBar
                        compareMode={compareMode}
                        isOverdue={isOverdue}
                        locale={locale}
                        questionnaire={questionnaire}
                        setCompareMode={setCompareMode}
                        t={t}
                    />
                )}
            </div>
            <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
            >
                <X className="h-5 w-5" />
            </button>
        </div>
    );
}
