import { describe, expect, it } from 'vitest';

import {
    accessUserReadSchema,
    controlListResponseSchema,
    controlOrApprovalSchema,
    dashboardOverviewSchema,
    executionListResponseSchema,
    issueOrApprovalSchema,
    keyRiskIndicatorOrApprovalSchema,
    riskListResponseSchema,
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

    it.each([
        ['control', controlListResponseSchema, 'status'],
        ['risk', riskListResponseSchema, 'risk_type'],
        ['vendor', vendorListResponseSchema, 'lifecycle'],
    ] as const)('parses %s collection facets while preserving response extensions', (_name, schema, facetKey) => {
        const response = schema.parse({
            items: [],
            total: 0,
            offset: 0,
            limit: 25,
            facets: {
                [facetKey]: [{
                    value: 'active',
                    label: 'Active',
                    count: 3,
                    selected: false,
                    disabled: false,
                }],
            },
            response_extension: 'preserved',
        });

        expect(response).toMatchObject({
            facets: {
                [facetKey]: [{ value: 'active', count: 3 }],
            },
            response_extension: 'preserved',
        });
    });
});
