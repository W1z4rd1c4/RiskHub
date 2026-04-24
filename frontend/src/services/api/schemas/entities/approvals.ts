import {
    approvalCreatedResponseSchema,
    approvalIdMessageSchema,
} from '../common';

import {
    controlSchema,
    issueSchema,
    keyRiskIndicatorSchema,
    riskSchema,
} from './governance';

export const issueOrApprovalSchema = issueSchema.or(approvalIdMessageSchema);
export const riskOrApprovalSchema = riskSchema.or(approvalCreatedResponseSchema);
export const controlOrApprovalSchema = controlSchema.or(approvalCreatedResponseSchema);
export const keyRiskIndicatorOrApprovalSchema = keyRiskIndicatorSchema.or(approvalCreatedResponseSchema);
