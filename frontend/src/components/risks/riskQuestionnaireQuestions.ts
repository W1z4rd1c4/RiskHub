export type RiskQuestionnaireQuestionType = 'boolean' | 'single_select' | 'text' | 'textarea' | 'number';

export interface RiskQuestionnaireQuestion {
    key: string;
    type: RiskQuestionnaireQuestionType;
    required: boolean;
    options?: string[];
    helperTextKey?: string;
}

export interface RiskQuestionnaireSection {
    titleKey: string;
    questions: RiskQuestionnaireQuestion[];
}

export const RISK_OWNER_REASSESSMENT_V1: RiskQuestionnaireSection[] = [
    {
        titleKey: 'questionnaire.sections.risk_changes',
        questions: [
            { key: 'risk_assessment.q1_description_changed', type: 'boolean', required: true },
            { key: 'risk_assessment.q2_new_triggers', type: 'textarea', required: false },
            { key: 'risk_assessment.q3_recent_incidents', type: 'textarea', required: false },
        ],
    },
    {
        titleKey: 'questionnaire.sections.controls',
        questions: [
            { key: 'risk_assessment.q4_controls_effective', type: 'boolean', required: true },
            { key: 'risk_assessment.q5_control_gaps', type: 'textarea', required: false },
        ],
    },
    {
        titleKey: 'questionnaire.sections.kris',
        questions: [
            { key: 'risk_assessment.q6_kri_changes', type: 'textarea', required: false },
            { key: 'risk_assessment.q7_kri_breaches', type: 'textarea', required: false },
        ],
    },
    {
        titleKey: 'questionnaire.sections.outlook',
        questions: [
            {
                key: 'risk_assessment.q8_outlook_trend',
                type: 'single_select',
                required: true,
                options: [
                    'risk_assessment.options.trend.up',
                    'risk_assessment.options.trend.stable',
                    'risk_assessment.options.trend.down',
                ],
            },
            { key: 'risk_assessment.q9_mitigation_actions', type: 'textarea', required: true },
            { key: 'risk_assessment.q10_support_needed', type: 'textarea', required: false },
        ],
    },
];

export const RISK_OWNER_REASSESSMENT_V2: RiskQuestionnaireSection[] = [
    ...RISK_OWNER_REASSESSMENT_V1.slice(0, 3),
    {
        ...RISK_OWNER_REASSESSMENT_V1[3],
        questions: [
            { key: 'risk_assessment.q11_likelihood_12m', type: 'number', required: true, helperTextKey: 'questionnaire.helpers.risk_assessment.q11_likelihood_12m' },
            { key: 'risk_assessment.q12_worst_case_impact', type: 'number', required: true, helperTextKey: 'questionnaire.helpers.risk_assessment.q12_worst_case_impact' },
            ...RISK_OWNER_REASSESSMENT_V1[3].questions,
        ],
    },
];

export function getRiskOwnerReassessmentTemplate(templateVersion: string): RiskQuestionnaireSection[] {
    if (templateVersion === 'v2') return RISK_OWNER_REASSESSMENT_V2;
    return RISK_OWNER_REASSESSMENT_V1;
}

export function getRiskOwnerReassessmentQuestionKeys(templateVersion: string): string[] {
    return getRiskOwnerReassessmentTemplate(templateVersion).flatMap(s => s.questions).map(q => q.key);
}
