export type VendorAssessmentQuestionType =
    | 'boolean'
    | 'text'
    | 'textarea'
    | 'number'
    | 'single_select';

export interface VendorAssessmentQuestion {
    key: string;
    label: string;
    type: VendorAssessmentQuestionType;
    options?: { value: string; label: string }[];
    placeholder?: string;
}

export interface VendorAssessmentSection {
    key: string;
    title: string;
    questions: VendorAssessmentQuestion[];
}

export const VENDOR_ASSESSMENT_STANDARD_V1: VendorAssessmentSection[] = [
    {
        key: 'financial_stability',
        title: 'Financial Stability',
        questions: [
            { key: 'financial.annual_report_available', label: 'Annual report / financial statements available?', type: 'boolean' },
            { key: 'financial.notes', label: 'Notes', type: 'textarea', placeholder: 'Summarize financial stability evidence...' },
        ],
    },
    {
        key: 'regulatory_legal',
        title: 'Regulatory / Legal',
        questions: [
            { key: 'legal.gdpr_compliance', label: 'GDPR compliance confirmed?', type: 'boolean' },
            { key: 'legal.notes', label: 'Notes', type: 'textarea', placeholder: 'Summarize legal/regulatory checks...' },
        ],
    },
    {
        key: 'cyber_security',
        title: 'Cyber / Security',
        questions: [
            { key: 'security.iso27001_or_equivalent', label: 'ISO 27001 (or equivalent) in place?', type: 'boolean' },
            { key: 'security.notes', label: 'Notes', type: 'textarea', placeholder: 'Summarize security posture evidence...' },
        ],
    },
    {
        key: 'bcp_dr',
        title: 'BCP / DR',
        questions: [
            { key: 'bcp.dr_tested_last_12m', label: 'DR tested in last 12 months?', type: 'boolean' },
            { key: 'bcp.notes', label: 'Notes', type: 'textarea', placeholder: 'Summarize resilience evidence...' },
        ],
    },
    {
        key: 'governance_auditability',
        title: 'Governance / Auditability',
        questions: [
            { key: 'gov.audit_rights', label: 'Audit rights are contractually ensured?', type: 'boolean' },
            { key: 'gov.notes', label: 'Notes', type: 'textarea', placeholder: 'Summarize governance controls...' },
        ],
    },
    {
        key: 'replaceability_subcontractors',
        title: 'Replaceability / Subcontractors',
        questions: [
            { key: 'supply_chain.uses_subcontractors', label: 'Uses subcontractors / fourth parties?', type: 'boolean' },
            { key: 'supply_chain.replaceability', label: 'Replaceability', type: 'single_select', options: [
                { value: 'easy', label: 'Easy' },
                { value: 'medium', label: 'Medium' },
                { value: 'hard', label: 'Hard' },
            ] },
            { key: 'supply_chain.notes', label: 'Notes', type: 'textarea', placeholder: 'Summarize concentration/replaceability...' },
        ],
    },
];

export const VENDOR_ASSESSMENT_DORA_V1: VendorAssessmentSection[] = [
    ...VENDOR_ASSESSMENT_STANDARD_V1,
    {
        key: 'dora_subcontractors',
        title: 'DORA — Subcontractors & ICT Supply Chain',
        questions: [
            { key: 'dora.subcontractor_disclosure', label: 'Full subcontractor disclosure available?', type: 'boolean' },
            { key: 'dora.subcontractor_notes', label: 'Notes', type: 'textarea', placeholder: 'Summarize subcontractor oversight...' },
        ],
    },
    {
        key: 'dora_incident_reporting',
        title: 'DORA — Incident Reporting',
        questions: [
            { key: 'dora.incident_reporting_sla', label: 'Incident reporting SLAs defined (timelines, escalation)?', type: 'boolean' },
            { key: 'dora.incident_notes', label: 'Notes', type: 'textarea', placeholder: 'Summarize incident notification clauses...' },
        ],
    },
];

export function getVendorAssessmentTemplate(scope: 'standard' | 'dora', version: string): VendorAssessmentSection[] {
    if (version !== 'v1') return VENDOR_ASSESSMENT_STANDARD_V1;
    return scope === 'dora' ? VENDOR_ASSESSMENT_DORA_V1 : VENDOR_ASSESSMENT_STANDARD_V1;
}

