export type VendorAssessmentQuestionType =
    | 'boolean'
    | 'text'
    | 'textarea'
    | 'number'
    | 'single_select';

export interface VendorAssessmentQuestion {
    key: string;
    labelKey: string;
    type: VendorAssessmentQuestionType;
    options?: { value: string; labelKey: string }[];
    placeholderKey?: string;
}

export interface VendorAssessmentSection {
    key: string;
    titleKey: string;
    questions: VendorAssessmentQuestion[];
}

export const VENDOR_ASSESSMENT_STANDARD_V1: VendorAssessmentSection[] = [
    {
        key: 'financial_stability',
        titleKey: 'vendors:assessments.template.financial_stability.title',
        questions: [
            { key: 'financial.annual_report_available', labelKey: 'vendors:assessments.template.financial_stability.annual_report_available', type: 'boolean' },
            { key: 'financial.notes', labelKey: 'vendors:assessments.template.notes', type: 'textarea', placeholderKey: 'vendors:assessments.template.financial_stability.notes_placeholder' },
        ],
    },
    {
        key: 'regulatory_legal',
        titleKey: 'vendors:assessments.template.regulatory_legal.title',
        questions: [
            { key: 'legal.gdpr_compliance', labelKey: 'vendors:assessments.template.regulatory_legal.gdpr_compliance', type: 'boolean' },
            { key: 'legal.notes', labelKey: 'vendors:assessments.template.notes', type: 'textarea', placeholderKey: 'vendors:assessments.template.regulatory_legal.notes_placeholder' },
        ],
    },
    {
        key: 'cyber_security',
        titleKey: 'vendors:assessments.template.cyber_security.title',
        questions: [
            { key: 'security.iso27001_or_equivalent', labelKey: 'vendors:assessments.template.cyber_security.iso27001_or_equivalent', type: 'boolean' },
            { key: 'security.notes', labelKey: 'vendors:assessments.template.notes', type: 'textarea', placeholderKey: 'vendors:assessments.template.cyber_security.notes_placeholder' },
        ],
    },
    {
        key: 'bcp_dr',
        titleKey: 'vendors:assessments.template.bcp_dr.title',
        questions: [
            { key: 'bcp.dr_tested_last_12m', labelKey: 'vendors:assessments.template.bcp_dr.dr_tested_last_12m', type: 'boolean' },
            { key: 'bcp.notes', labelKey: 'vendors:assessments.template.notes', type: 'textarea', placeholderKey: 'vendors:assessments.template.bcp_dr.notes_placeholder' },
        ],
    },
    {
        key: 'governance_auditability',
        titleKey: 'vendors:assessments.template.governance_auditability.title',
        questions: [
            { key: 'gov.audit_rights', labelKey: 'vendors:assessments.template.governance_auditability.audit_rights', type: 'boolean' },
            { key: 'gov.notes', labelKey: 'vendors:assessments.template.notes', type: 'textarea', placeholderKey: 'vendors:assessments.template.governance_auditability.notes_placeholder' },
        ],
    },
    {
        key: 'replaceability_subcontractors',
        titleKey: 'vendors:assessments.template.replaceability_subcontractors.title',
        questions: [
            { key: 'supply_chain.uses_subcontractors', labelKey: 'vendors:assessments.template.replaceability_subcontractors.uses_subcontractors', type: 'boolean' },
            { key: 'supply_chain.replaceability', labelKey: 'vendors:assessments.template.replaceability_subcontractors.replaceability', type: 'single_select', options: [
                { value: 'easy', labelKey: 'vendors:assessments.template.replaceability_options.easy' },
                { value: 'medium', labelKey: 'vendors:assessments.template.replaceability_options.medium' },
                { value: 'hard', labelKey: 'vendors:assessments.template.replaceability_options.hard' },
            ] },
            { key: 'supply_chain.notes', labelKey: 'vendors:assessments.template.notes', type: 'textarea', placeholderKey: 'vendors:assessments.template.replaceability_subcontractors.notes_placeholder' },
        ],
    },
];

export const VENDOR_ASSESSMENT_DORA_V1: VendorAssessmentSection[] = [
    ...VENDOR_ASSESSMENT_STANDARD_V1,
    {
        key: 'dora_subcontractors',
        titleKey: 'vendors:assessments.template.dora_subcontractors.title',
        questions: [
            { key: 'dora.subcontractor_disclosure', labelKey: 'vendors:assessments.template.dora_subcontractors.subcontractor_disclosure', type: 'boolean' },
            { key: 'dora.subcontractor_notes', labelKey: 'vendors:assessments.template.notes', type: 'textarea', placeholderKey: 'vendors:assessments.template.dora_subcontractors.notes_placeholder' },
        ],
    },
    {
        key: 'dora_incident_reporting',
        titleKey: 'vendors:assessments.template.dora_incident_reporting.title',
        questions: [
            { key: 'dora.incident_reporting_sla', labelKey: 'vendors:assessments.template.dora_incident_reporting.incident_reporting_sla', type: 'boolean' },
            { key: 'dora.incident_notes', labelKey: 'vendors:assessments.template.notes', type: 'textarea', placeholderKey: 'vendors:assessments.template.dora_incident_reporting.notes_placeholder' },
        ],
    },
];

export function getVendorAssessmentTemplate(scope: 'standard' | 'dora', version: string): VendorAssessmentSection[] {
    if (version !== 'v1') return VENDOR_ASSESSMENT_STANDARD_V1;
    return scope === 'dora' ? VENDOR_ASSESSMENT_DORA_V1 : VENDOR_ASSESSMENT_STANDARD_V1;
}
