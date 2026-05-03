import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { RiskQuestionnaireDetail } from '@/types/riskQuestionnaire';

export function shouldAutoOpenQuestionnaire(
    questionnaire: Pick<RiskQuestionnaireDetail, 'capabilities' | 'status'>,
): boolean {
    return questionnaire.status === 'sent' && resolveCapabilityFlag(questionnaire.capabilities, 'can_open');
}
