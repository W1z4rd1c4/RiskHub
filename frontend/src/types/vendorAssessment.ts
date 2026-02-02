export type VendorAssessmentStatus =
    | 'draft'
    | 'submitted'
    | 'in_review'
    | 'committee_recommended'
    | 'approved'
    | 'rejected';

export type VendorAssessmentScope = 'standard' | 'dora';

export type VendorCommitteeRecommendation =
    | 'approve'
    | 'approve_with_conditions'
    | 'reject';

export interface VendorAssessment {
    id: number;
    vendor_id: number;

    status: VendorAssessmentStatus;
    template_key: string;
    template_version: string;
    scope: VendorAssessmentScope;

    answers_json?: Record<string, unknown> | null;
    evidence_reference?: string | null;

    submitted_at?: string | null;
    reviewed_at?: string | null;
    decision_at?: string | null;

    submitted_by_user_id?: number | null;
    reviewed_by_user_id?: number | null;
    decided_by_user_id?: number | null;

    committee_recommendation?: VendorCommitteeRecommendation | null;
    conditions_text?: string | null;

    created_at: string;
    updated_at: string;
}

export interface VendorAssessmentDraftUpdate {
    answers_json?: Record<string, unknown> | null;
    evidence_reference?: string | null;
}

export interface VendorAssessmentCommitteeRecommend {
    committee_recommendation: VendorCommitteeRecommendation;
    conditions_text?: string | null;
}

export interface VendorAssessmentDecide {
    decision: 'approved' | 'rejected';
}

