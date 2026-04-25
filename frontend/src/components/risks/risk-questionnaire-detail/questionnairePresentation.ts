import { IMPACT_DESCRIPTIONS, PROBABILITY_DESCRIPTIONS, formatFinancialRange } from '@/constants/riskScoreDescriptions';
import type { RiskQuestionnaireClarification } from '@/types/riskQuestionnaire';

import type { RiskQuestionnaireSection } from '../riskQuestionnaireQuestions';

export const LIKELIHOOD_12M_KEY = 'risk_assessment.q11_likelihood_12m';
export const WORST_CASE_IMPACT_KEY = 'risk_assessment.q12_worst_case_impact';

export type TranslateFn = (
    key: string,
    optionsOrFallback?: string | Record<string, unknown>,
    fallback?: string,
) => string;

export interface QuestionnaireOption {
    value: string;
    label: string;
}

export function isMissingAnswer(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    return false;
}

export function getMissingRequiredKeys(
    template: RiskQuestionnaireSection[],
    answers: Record<string, unknown>,
): string[] {
    return template
        .flatMap((section) => section.questions)
        .filter((question) => question.required)
        .filter((question) => isMissingAnswer(answers[question.key]))
        .map((question) => question.key);
}

export function normalizeForCompare(value: unknown): unknown {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed === '' ? null : trimmed;
    }
    return value;
}

export function isChangedAnswer({
    key,
    compareMode,
    templateQuestionKeys,
    currentAnswers,
    previousAnswers,
}: {
    key: string;
    compareMode: boolean;
    templateQuestionKeys: Set<string>;
    currentAnswers: Record<string, unknown>;
    previousAnswers: Record<string, unknown>;
}): boolean {
    if (!compareMode) return false;
    if (!templateQuestionKeys.has(key)) return false;
    const previous = normalizeForCompare(previousAnswers[key]);
    if (previous === null) return false;
    const current = normalizeForCompare(currentAnswers[key]);
    return current !== previous;
}

export function getChangedAnswerCount(
    keys: string[],
    currentAnswers: Record<string, unknown>,
    previousAnswers: Record<string, unknown> | null | undefined,
): number | null {
    if (!previousAnswers) return null;
    let count = 0;
    for (const key of keys) {
        const previous = normalizeForCompare(previousAnswers[key]);
        if (previous === null) continue;
        const current = normalizeForCompare(currentAnswers[key]);
        if (current !== previous) count += 1;
    }
    return count;
}

export function groupClarificationsBySection(
    clarifications: RiskQuestionnaireClarification[],
): Map<string, RiskQuestionnaireClarification[]> {
    const grouped = new Map<string, RiskQuestionnaireClarification[]>();
    for (const clarification of clarifications) {
        const list = grouped.get(clarification.section_key) ?? [];
        list.push(clarification);
        grouped.set(clarification.section_key, list);
    }
    return grouped;
}

export function formatLikelihoodOptionLabel(level: number, t: TranslateFn): string {
    const meta = PROBABILITY_DESCRIPTIONS[level];
    if (!meta) return String(level);
    return `${level} — ${t(meta.labelKey, meta.labelKey)} — ${t(meta.descriptionKey, meta.descriptionKey)}`;
}

export function formatWorstCaseImpactOptionLabel(
    level: number,
    totalAssets: number,
    t: TranslateFn,
): string {
    const meta = IMPACT_DESCRIPTIONS[level];
    if (!meta) return String(level);
    const range = formatFinancialRange(level, totalAssets, t('risks:form.financial.no_loss'));
    return `${level} — ${t(meta.labelKey, meta.labelKey)} — ${t(meta.descriptionKey, meta.descriptionKey)}. ${t('risks:form.financial.loss')}: ${range}`;
}

export function buildLikelihoodOptions(t: TranslateFn): QuestionnaireOption[] {
    return [1, 2, 3, 4, 5].map((level) => ({
        value: String(level),
        label: formatLikelihoodOptionLabel(level, t),
    }));
}

export function buildWorstCaseImpactOptions(totalAssets: number, t: TranslateFn): QuestionnaireOption[] {
    return [1, 2, 3, 4, 5].map((level) => ({
        value: String(level),
        label: formatWorstCaseImpactOptionLabel(level, totalAssets, t),
    }));
}

export function formatQuestionnaireAnswer(
    key: string,
    value: unknown,
    options: {
        totalAssets: number;
        t: TranslateFn;
    },
): string {
    const { totalAssets, t } = options;
    if (value === undefined || value === null) return t('labels.unknown');
    if (typeof value === 'boolean') return value ? t('actions.yes') : t('actions.no');
    if (key === LIKELIHOOD_12M_KEY) {
        const level = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
        if (Number.isFinite(level)) return formatLikelihoodOptionLabel(level, t);
    }
    if (key === WORST_CASE_IMPACT_KEY) {
        const level = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
        if (Number.isFinite(level)) return formatWorstCaseImpactOptionLabel(level, totalAssets, t);
    }
    if (typeof value === 'string') {
        if (value.startsWith('risk_assessment.options.')) {
            return t(`risks:questionnaire.questions.${value}`, value);
        }
        return value;
    }
    return String(value);
}
