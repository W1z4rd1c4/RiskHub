import { expect,it } from 'vitest';
import { buildDashboardDrillthrough } from '@/pages/dashboard/dashboardStats';
import { parseRegisterUrlState } from '@/pages/shared/registerListQuery';
import { parseControlRegisterFilters,buildControlRegisterListParams } from '@/pages/controls/controlRegisterConfig';
import { buildControlCollectionQuery } from '@/services/controlApi';

it.each([null,17].flatMap(departmentId=>[null,'manual','automatic'].flatMap(controlForm=>[null,'draft','active','inactive'].map(controlStatus=>({departmentId,controlForm,controlStatus})))))('preserves exact destination: $departmentId/$controlForm/$controlStatus',({departmentId,controlForm,controlStatus})=>{
    const links=buildDashboardDrillthrough({departmentId,controlForm,controlStatus,riskLevel:'critical'});
    expect(links).toHaveProperty('controls');
    const url=new URL(links.controls,'http://riskhub.test');
    const filters=parseControlRegisterFilters(parseRegisterUrlState(url.searchParams,{defaultView:'all'}).filters);
    const wire=JSON.parse(buildControlCollectionQuery(buildControlRegisterListParams({filters,currentPage:1,groupValue:null,limit:50,search:'',sort:null,view:'all'})).get('filters')!);
    expect(wire).toMatchObject({lifecycle:'active',...(controlForm?{control_form:controlForm}:{}),...(controlStatus?{status:controlStatus}:{})});
    expect(wire).not.toHaveProperty('risk_level');
    expect(url.pathname).toBe(departmentId?'/departments/17':'/controls');
    if(departmentId)expect(url.searchParams.get('tab')).toBe('controls');
});
