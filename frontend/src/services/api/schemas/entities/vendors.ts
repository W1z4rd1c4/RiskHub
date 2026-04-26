import type { Vendor, VendorLinkedRiskSummary, VendorListResponse } from '@/types/vendor';
import type { LinkedVendorSummary } from '@/types/vendorLink';

import { collectionPaginationSchema, passthroughObject, z } from '../common';

export const linkedVendorSummarySchema: z.ZodType<LinkedVendorSummary> = passthroughObject({
    id: z.number(),
    name: z.string(),
});
export const linkedVendorSummaryArraySchema = z.array(linkedVendorSummarySchema);

export const vendorLinkedRiskSummarySchema: z.ZodType<VendorLinkedRiskSummary> =
    passthroughObject({
        risk_id: z.number(),
        risk_id_code: z.string(),
        risk_name: z.string(),
    });

const vendorCapabilitiesSchema = passthroughObject({
    can_read: z.boolean(),
    can_update: z.boolean(),
    can_archive: z.boolean(),
    can_restore: z.boolean(),
    can_create_linked_risk: z.boolean(),
    can_create_linked_control: z.boolean(),
    can_create_linked_kri: z.boolean(),
    can_link_risk: z.boolean(),
    can_link_control: z.boolean(),
    can_link_kri: z.boolean(),
    can_view_linked_risks: z.boolean(),
    can_view_linked_controls: z.boolean(),
    can_view_linked_kris: z.boolean(),
    can_create_issue: z.boolean(),
});

export const vendorSchema: z.ZodType<Vendor> = passthroughObject({
    id: z.number(),
    name: z.string(),
    legal_name: z.string().nullable().optional(),
    registration_id: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    process: z.string(),
    subprocess: z.string().nullable().optional(),
    department_id: z.number().nullable().optional(),
    department_name: z.string().nullable().optional(),
    outsourcing_owner_user_id: z.number(),
    outsourcing_owner_name: z.string().nullable().optional(),
    linked_risks: z.array(vendorLinkedRiskSummarySchema),
    capabilities: vendorCapabilitiesSchema.nullable().optional(),
    vendor_type: z.enum(['ict', 'outsourcing', 'professional_services', 'partner', 'other']),
    risk_score_1_5: z.number(),
    supports_important_core_insurance_function: z.boolean(),
    dora_relevant: z.boolean(),
    is_significant_vendor: z.boolean(),
    materiality_assessed_max_impact_pct_own_funds: z.number().nullable().optional(),
    replaceability: z.enum(['easy', 'medium', 'hard']).nullable().optional(),
    has_alternative_providers: z.boolean(),
    status: z.enum(['active', 'inactive']),
    created_at: z.string(),
    updated_at: z.string(),
});
export const vendorArraySchema = z.array(vendorSchema);
export const vendorListResponseSchema: z.ZodType<VendorListResponse> =
    collectionPaginationSchema(vendorSchema);
