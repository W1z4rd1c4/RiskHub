import { describe, expect, it } from 'vitest';

import { parseAssetRegisterFilters, serializeAssetRegisterFilters } from '@/pages/assets/assetRegisterConfig';
import { parseControlRegisterFilters, serializeControlRegisterFilters } from '@/pages/controls/controlRegisterConfig';
import { parseIssueRegisterFilters, serializeIssueRegisterFilters } from '@/pages/issues/issueRegisterConfig';
import { parseKriRegisterFilters, serializeKriRegisterFilters } from '@/pages/kris/kriRegisterConfig';
import { parseProcessRegisterFilters, serializeProcessRegisterFilters } from '@/pages/processes/processRegisterConfig';
import { parseRiskRegisterFilters, serializeRiskRegisterFilters } from '@/pages/risks/riskRegisterConfig';
import {
    buildRegisterUrlParams,
    normalizeRegisterUrlParams,
    parseRegisterUrlState,
    type RegisterUrlState,
} from '@/pages/shared/registerListQuery';
import { parseThreatRegisterFilters, serializeThreatRegisterFilters } from '@/pages/threats/threatRegisterConfig';
import { parseVendorRegisterFilters, serializeVendorRegisterFilters } from '@/pages/vendors/vendorRegisterConfig';

const REGISTER_ROUTES = [
    {
        canonicalizeFilters: (filters: RegisterUrlState['filters']) => (
            serializeRiskRegisterFilters(parseRiskRegisterFilters(filters))
        ),
        filters: { critical: true },
        name: 'Risk',
        sort: 'name',
        view: 'department',
        views: ['all', 'department'],
    },
    {
        canonicalizeFilters: (filters: RegisterUrlState['filters']) => (
            serializeControlRegisterFilters(parseControlRegisterFilters(filters))
        ),
        filters: { status: 'draft' },
        name: 'Control',
        sort: 'frequency',
        view: 'risk',
        views: ['all', 'risk'],
    },
    {
        canonicalizeFilters: (filters: RegisterUrlState['filters']) => (
            serializeKriRegisterFilters(parseKriRegisterFilters(filters))
        ),
        filters: { frequency: 'monthly' },
        name: 'KRI',
        sort: 'metric_name',
        view: 'vendor',
        views: ['all', 'vendor'],
    },
    {
        canonicalizeFilters: (filters: RegisterUrlState['filters']) => (
            serializeIssueRegisterFilters(parseIssueRegisterFilters(filters))
        ),
        filters: { overdue: true },
        name: 'Issue',
        sort: 'severity',
        view: 'owner',
        views: ['all', 'owner'],
    },
    {
        canonicalizeFilters: (filters: RegisterUrlState['filters']) => (
            serializeProcessRegisterFilters(parseProcessRegisterFilters(filters))
        ),
        filters: { criticality: ['critical'] },
        name: 'Process',
        sort: 'f_code',
        view: 'l0',
        views: ['all', 'l0'],
    },
    {
        canonicalizeFilters: (filters: RegisterUrlState['filters']) => (
            serializeAssetRegisterFilters(parseAssetRegisterFilters(filters))
        ),
        filters: { cif: true },
        name: 'Asset',
        sort: 'asset_type',
        view: 'business_owner',
        views: ['all', 'business_owner'],
    },
    {
        canonicalizeFilters: (filters: RegisterUrlState['filters']) => (
            serializeThreatRegisterFilters(parseThreatRegisterFilters(filters))
        ),
        filters: { categories: ['availability'] },
        name: 'Threat',
        sort: 'threat_steward',
        view: 'linked_risk',
        views: ['all', 'linked_risk'],
    },
    {
        canonicalizeFilters: (filters: RegisterUrlState['filters']) => (
            serializeVendorRegisterFilters(parseVendorRegisterFilters(filters))
        ),
        filters: { vendor_types: ['ict'] },
        name: 'Vendor',
        sort: 'risk_score',
        view: 'flag',
        views: ['all', 'flag'],
    },
] as const;

const state: RegisterUrlState = {
    filters: {
        bcm_link: ['yes', 'not_assessed'],
        cif: true,
        department_ids: [7, 9],
        mtpd: { min: 4, max: 48 },
    },
    search: 'claims',
    page: 5,
    selectedGroupValue: 'department:7',
    sort: { field: 'f_code', direction: 'desc' },
    view: 'department',
};

describe('shared register URL state', () => {
    it('round-trips search, view, sort, filters, opaque group, and page', () => {
        const params = buildRegisterUrlParams(state, new URLSearchParams('committee_scope=true&page=5'));

        expect(params.get('q')).toBe('claims');
        expect(params.get('view')).toBe('department');
        expect(params.get('sort')).toBe('f_code:desc');
        expect(params.get('group')).toBe('department:7');
        expect(params.get('page')).toBe('5');
        expect(params.get('committee_scope')).toBe('true');
        expect(parseRegisterUrlState(params, { defaultView: 'all' })).toEqual(state);
    });

    it.each(['0', '-2', '1.5', 'NaN', '9007199254740992'])('normalizes invalid page %s to the first page', (page) => {
        expect(parseRegisterUrlState(
            new URLSearchParams(`sort=oops&filters=%7Bbad&group=&page=${page}`),
            { defaultView: 'all' },
        )).toEqual({
            filters: {},
            page: 1,
            search: '',
            selectedGroupValue: null,
            sort: null,
            view: 'all',
        });
    });

    it('omits the default page while preserving unrelated query parameters', () => {
        const params = buildRegisterUrlParams(
            { ...state, page: 1 },
            new URLSearchParams('source=external-review&page=8'),
        );

        expect(params.get('page')).toBeNull();
        expect(params.get('source')).toBe('external-review');
    });

    it('replaces invalid and default owned values with one canonical register query', () => {
        const params = new URLSearchParams(
            'source=review&view=bogus&sort=oops&filters=%7Bbad&group=&page=004&q=',
        );

        expect(normalizeRegisterUrlParams(params, {
            allowedSortFields: ['name'],
            allowedViews: ['all', 'department'],
            canonicalizeFilters: (filters) => filters,
            defaultView: 'all',
        })).toBe(true);
        expect(params.toString()).toBe('source=review&page=4');
        expect(normalizeRegisterUrlParams(params, {
            allowedSortFields: ['name'],
            allowedViews: ['all', 'department'],
            canonicalizeFilters: (filters) => filters,
            defaultView: 'all',
        })).toBe(false);
    });

    it.each(REGISTER_ROUTES)(
        '$name preserves valid route-owned vocabulary and unrelated parameters',
        ({ canonicalizeFilters, filters, sort, view, views }) => {
            const params = new URLSearchParams({
                filters: JSON.stringify(filters),
                page: '004',
                sort: `${sort}:desc`,
                source: 'review',
                view,
            });

            expect(normalizeRegisterUrlParams(params, {
                allowedSortFields: [sort],
                allowedViews: views,
                canonicalizeFilters,
                defaultView: 'all',
            })).toBe(true);
            expect(params.get('source')).toBe('review');
            expect(params.get('view')).toBe(view);
            expect(params.get('sort')).toBe(`${sort}:desc`);
            expect(JSON.parse(params.get('filters') ?? '{}')).toEqual(filters);
            expect(params.get('page')).toBe('4');
        },
    );

    it.each(REGISTER_ROUTES)(
        '$name removes invalid and default route-owned values',
        ({ canonicalizeFilters, sort, views }) => {
            const params = new URLSearchParams(
                `source=review&view=bogus&sort=unknown:asc&filters=3&group=%20&page=1&q=%20&valid_sort=${sort}`,
            );

            expect(normalizeRegisterUrlParams(params, {
                allowedSortFields: [sort],
                allowedViews: views,
                canonicalizeFilters,
                defaultView: 'all',
            })).toBe(true);
            expect(params.toString()).toBe(`source=review&valid_sort=${sort}`);
        },
    );

    it.each(['name', 'name:sideways', 'name:asc:desc', 'unknown:asc'])(
        'removes invalid sort form %s',
        (sort) => {
            const params = new URLSearchParams({ sort, source: 'review' });

            expect(normalizeRegisterUrlParams(params, {
                allowedSortFields: ['name'],
                allowedViews: ['all'],
                canonicalizeFilters: (filters) => filters,
                defaultView: 'all',
            })).toBe(true);
            expect(params.toString()).toBe('source=review');
        },
    );

    it.each(['{bad', 'null', '[]', '3', '"wrong"', '{"critical":"yes"}'])(
        'removes malformed, non-object, or wrong-shaped filters %s',
        (filters) => {
            const params = new URLSearchParams({ filters, source: 'review' });

            expect(normalizeRegisterUrlParams(params, {
                allowedSortFields: ['name'],
                allowedViews: ['all'],
                canonicalizeFilters: (rawFilters) => (
                    serializeRiskRegisterFilters(parseRiskRegisterFilters(rawFilters))
                ),
                defaultView: 'all',
            })).toBe(true);
            expect(params.toString()).toBe('source=review');
        },
    );
});
