import {
    approvalIdMessageSchema,
} from '../common';
import { approvalCreatedResponseSchema } from '../workflow';
import type { ZodType } from 'zod';

import {
    controlSchema,
    issueSchema,
    keyRiskIndicatorSchema,
    riskSchema,
} from './governance';
import type { ApprovalCreatedResponse } from '@/types/approval';
import type { Control } from '@/types/control';
import type { Issue } from '@/types/issue';
import type { KeyRiskIndicator } from '@/types/kri';
import type { Risk } from '@/types/risk';

type ApprovalIdMessage = {
    approval_id: number;
    message: string;
};

export const issueOrApprovalSchema: ZodType<Issue | ApprovalIdMessage> =
    issueSchema.or(approvalIdMessageSchema);
export const riskOrApprovalSchema: ZodType<Risk | ApprovalCreatedResponse> =
    riskSchema.or(approvalCreatedResponseSchema);
export const controlOrApprovalSchema: ZodType<Control | ApprovalCreatedResponse> =
    controlSchema.or(approvalCreatedResponseSchema);
export const keyRiskIndicatorOrApprovalSchema: ZodType<KeyRiskIndicator | ApprovalCreatedResponse> =
    keyRiskIndicatorSchema.or(approvalCreatedResponseSchema);
