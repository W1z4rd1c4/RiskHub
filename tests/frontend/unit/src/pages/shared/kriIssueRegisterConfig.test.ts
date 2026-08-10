import { describe, expect, it } from 'vitest';

import {
    buildIssueRegisterListParams,
    issueGroupBy,
    parseIssueRegisterFilters,
    serializeIssueRegisterFilters,
} from '@/pages/issues/issueRegisterConfig';
import {
    buildKriRegisterListParams,
    kriGroupBy,
    parseKriRegisterFilters,
    serializeKriRegisterFilters,
} from '@/pages/kris/kriRegisterConfig';

describe('KRI and Issue shared register configuration', () => {
    it('keeps KRI lifecycle separate from monitoring and timeliness state', () => {
        const filters = parseKriRegisterFilters({
            lifecycle: 'archived',
            monitoring_status: 'warning',
            timeliness_status: 'due_soon',
            frequency: 'quarterly',
            department_id: 7,
        });

        expect(filters).toMatchObject({
            lifecycle: 'archived',
            monitoring_status: 'warning',
            timeliness_status: 'due_soon',
            frequency: 'quarterly',
            department_id: 7,
        });
        expect(serializeKriRegisterFilters(filters)).toMatchObject({
            lifecycle: 'archived',
            monitoring_status: 'warning',
            timeliness_status: 'due_soon',
        });
    });

    it('builds the unambiguous KRI grouped list contract', () => {
        const params = buildKriRegisterListParams({
            currentPage: 3,
            filters: {
                lifecycle: 'all', monitoring_status: 'breach', timeliness_status: '', breach_only: false,
                frequency: 'monthly', department_id: 7, reporting_owner_id: 9,
            },
            groupValue: 'risk:42',
            limit: 20,
            search: ' appetite ',
            sort: { field: 'metric_name', direction: 'desc' },
            view: 'risk',
        });

        expect(params).toMatchObject({
            offset: 40, limit: 20, lifecycle: 'all', include_archived: true,
            monitoring_status: 'breach', frequency: 'monthly',
            department_id: 7, reporting_owner_id: 9, search: 'appetite',
            group_by: 'risk', group_value: 'risk:42', sort_by: 'metric_name', sort_order: 'desc',
        });
        expect(kriGroupBy('vendor')).toBe('vendor');
    });

    it('normalizes breached-only state to active lifecycle across URL and list contracts', () => {
        const filters = parseKriRegisterFilters({ lifecycle: 'archived', breach_only: true });
        expect(filters).toMatchObject({ lifecycle: 'active', breach_only: true });
        expect(serializeKriRegisterFilters(filters)).toEqual(expect.objectContaining({ breach_only: true }));
        expect(serializeKriRegisterFilters(filters).lifecycle).toBeUndefined();

        const params = buildKriRegisterListParams({
            currentPage: 1,
            filters: { ...filters, lifecycle: 'all' },
            groupValue: null,
            limit: 20,
            search: '',
            sort: null,
            view: 'all',
        });
        expect(params).toMatchObject({ lifecycle: 'active', breach_only: true });
        expect(params.is_archived).toBeUndefined();
        expect(params.include_archived).toBeUndefined();
    });

    it('keeps Issue status independent while closing visibility remains explicit', () => {
        const filters = parseIssueRegisterFilters({
            status: 'in_progress', severity: 'high_critical', include_closed: true,
            overdue: true, exclude_active_exceptions: true,
        });
        expect(filters).toMatchObject({
            status: 'in_progress', severity: 'high_critical', include_closed: true,
            overdue: true, exclude_active_exceptions: true,
        });
        expect(serializeIssueRegisterFilters(filters)).toMatchObject({
            status: 'in_progress', severity_group: 'high_critical', include_closed: true,
        });
        expect(serializeIssueRegisterFilters(filters).severity).toBeUndefined();
    });

    it('normalizes Closed visibility and severity-group URL state', () => {
        const filters = parseIssueRegisterFilters({
            status: 'closed', severity_group: 'high_critical', include_closed: false,
        });

        expect(filters).toMatchObject({
            status: 'closed', severity: 'high_critical', include_closed: true,
        });
        expect(serializeIssueRegisterFilters(filters)).toMatchObject({
            status: 'closed', severity_group: 'high_critical', include_closed: true,
        });

        const params = buildIssueRegisterListParams({
            currentPage: 1, filters, groupValue: null, limit: 20,
            search: '', sort: null, view: 'all',
        });
        expect(params).toMatchObject({
            status: 'closed', severity_group: 'high_critical', include_closed: true,
        });
        expect(params).not.toHaveProperty('severity');
    });

    it('maps Issue severity groups and grouping without emitting conflicting severity', () => {
        const params = buildIssueRegisterListParams({
            currentPage: 1,
            filters: {
                status: 'open', severity: 'high_critical', overdue: true,
                exclude_active_exceptions: true, include_closed: true,
                department_id: 7, owner_user_id: 9, remediation_status: 'blocked',
            },
            groupValue: 'owner:9', limit: 20, search: ' remediation ', sort: null, view: 'owner',
        });
        expect(params).toMatchObject({
            status: 'open', severity_group: 'high_critical', overdue: true,
            exclude_active_exceptions: true, include_closed: true,
            department_id: 7, owner_user_id: 9, search: 'remediation',
            remediation_status: 'blocked',
            group_by: 'owner', group_value: 'owner:9',
        });
        expect(params).not.toHaveProperty('severity');
        expect(issueGroupBy('severity')).toBe('severity');
    });
});
