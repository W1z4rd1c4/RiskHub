import { describe, expect, it } from 'vitest';

import {
    accessUserReadSchema,
    controlListResponseSchema,
    controlOrApprovalSchema,
    dashboardOverviewSchema,
    executionListResponseSchema,
    issueOrApprovalSchema,
    keyRiskIndicatorOrApprovalSchema,
    riskOrApprovalSchema,
    userPreferencesSchema,
    userReadSchema,
    vendorListResponseSchema,
} from '@/services/api/schemas/entities';

describe('entity schema barrel exports', () => {
    it('keeps existing public schema exports available from the entities path', () => {
        expect(userReadSchema).toBeDefined();
        expect(accessUserReadSchema).toBeDefined();
        expect(executionListResponseSchema).toBeDefined();
        expect(controlListResponseSchema).toBeDefined();
        expect(vendorListResponseSchema).toBeDefined();
        expect(dashboardOverviewSchema).toBeDefined();
        expect(userPreferencesSchema).toBeDefined();
        expect(issueOrApprovalSchema).toBeDefined();
        expect(riskOrApprovalSchema).toBeDefined();
        expect(controlOrApprovalSchema).toBeDefined();
        expect(keyRiskIndicatorOrApprovalSchema).toBeDefined();
    });
});
