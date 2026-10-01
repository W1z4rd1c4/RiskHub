import { FileText } from 'lucide-react';

import { DialogHeader } from '@/components/ui/dialog';
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
        <DialogHeader
            title={t('risks:questionnaire.title')}
            icon={FileText}
            onClose={onClose}
            closeLabel={t('common:actions.close')}
        >
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
        </DialogHeader>
    );
}
