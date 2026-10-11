import { expect, it } from 'vitest';
import { buildRiskRegisterListParams, parseRiskRegisterFilters, serializeRiskRegisterFilters } from '@/pages/risks/riskRegisterConfig';
import { buildRegisterUrlParams, parseRegisterUrlState } from '@/pages/shared/registerListQuery';
import { buildRiskCollectionQuery } from '@/services/riskApi';

it('preserves configured range and explicit all-status through the real URL and wire adapters', () => {
    const filters = parseRiskRegisterFilters({ risk_level: 'high', status: 'all', critical: true });
    const url = buildRegisterUrlParams({ filters: serializeRiskRegisterFilters(filters), page: 1, search: '', selectedGroupValue: null, sort: null, view: 'all' });
    const reloaded = parseRiskRegisterFilters(parseRegisterUrlState(url, {defaultView:'all'}).filters);
    const params = buildRiskRegisterListParams({filters: reloaded, criticalMinNetScore: 25, currentPage:1, groupValue:null, limit:50, search:'', sort:null, view:'all'});
    const wire = JSON.parse(buildRiskCollectionQuery(params).get('filters')!);
    expect(wire).toMatchObject({risk_level:'high', critical:true, lifecycle:'active'});
    expect(wire).not.toHaveProperty('status');
    expect(wire).not.toHaveProperty('min_net_score');
    expect(JSON.parse(url.get('filters')!)).toMatchObject({status:'all',risk_level:'high'});
});

it.each(['all','low','medium','high','critical'] as const)('overview %s destinations preserve configured criteria and all-live status', async (riskLevel) => {
    const { buildDashboardDrillthrough } = await import('@/pages/dashboard/dashboardStats');
    for (const departmentId of [null,17]) {
        const links = buildDashboardDrillthrough({departmentId,riskLevel});
        for (const [kind,href] of Object.entries(links.risks)) {
            const url = new URL(href,'http://riskhub.test');
            expect(url.pathname).toBe(departmentId ? '/departments/17' : '/risks');
            if (departmentId) expect(url.searchParams.get('tab')).toBe('risks');
            const filters=parseRiskRegisterFilters(parseRegisterUrlState(url.searchParams,{defaultView:'all'}).filters);
            expect(filters.status).toBe('');
            expect(filters.risk_level).toBe(riskLevel==='all'?'':riskLevel);
            expect(filters.critical).toBe(kind==='critical');
        }
    }
});

it('keeps explicit legacy numeric criteria distinct from the canonical checkbox', () => {
    const wire=JSON.parse(buildRiskCollectionQuery({critical:true,risk_level:'high',min_net_score:18}).get('filters')!);
    expect(wire).toEqual({critical:true,risk_level:'high',min_net_score:18});
});
