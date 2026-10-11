import { afterEach,it,expect,vi } from 'vitest';
import { render,screen,userEvent,within } from '@test/render';
import { DashboardRiskSections } from '@/pages/dashboard/DashboardRiskSections';
import { DashboardSummarySections } from '@/pages/dashboard/DashboardSummarySections';
import { buildDashboardStats,buildDashboardDrillthrough } from '@/pages/dashboard/dashboardStats';

vi.mock('@/components/dashboard/KRIBreachWidget',()=>({KRIBreachWidget:()=>null}));
vi.mock('@/components/dashboard/KRIStatusWidget',()=>({KRIStatusWidget:()=>null}));
vi.mock('@/components/dashboard/RiskDrilldownModal',()=>({RiskDrilldownModal:()=>null}));

afterEach(()=>window.history.replaceState({},'', '/'));

it('opens the existing exact Department population without discarding Dashboard filters',async()=>{
    window.history.replaceState({},'', '/?departmentId=17&riskLevel=high&controlForm=manual');
    const filters={departmentId:17,riskLevel:'high' as const,controlStatus:null,controlForm:'manual'};
    const metrics=[{department_id:17,department_name:'Risk populated',risk_count:1,control_count:0},{department_id:18,department_name:'Control populated',risk_count:0,control_count:2},{department_id:19,department_name:'Zero population',risk_count:0,control_count:0}].map(row=>({...row,high_risk_count:0,audited_control_count:0,breaching_kri_count:0,total_kri_count:0,compliance_rate:0}));
    const stats=buildDashboardStats({filters,canReadControls:false,canReadIssues:false,canReadVendors:false,departmentMetrics:metrics,issueSummary:null,summary:null,t:key=>key});
    render(<><DashboardSummarySections issueLinks={buildDashboardDrillthrough(filters).issues} canReadIssues={false} categoryAnalyticsTitle="Analytics" issueAging={null} issueAgingTitle="Age" issueSeverity={null} issueSeverityTitle="Severity" issueSummary={null} stats={stats} summary={null}/><DashboardRiskSections canUseDepartmentFilter={false} departmentMetrics={metrics} departmentVisibilityTitle="Counted departments" breachHistoryTitle="Breach history" breachTrends={[]} controlExecutionTitle="Executions" grossDistribution={null} grossMatrixTitle="Gross" historicalTitle="History" netDistribution={null} netMatrixTitle="Net" noExecutionHistoryLabel="None" onGrossCellClick={()=>undefined} onNetCellClick={()=>undefined} onRiskModalClose={()=>undefined} riskCreationTitle="Created" riskModal={{isOpen:false,impact:0,probability:0,riskType:'gross'}} riskTrends={[]} trends={[]}/></>);
    const tile=screen.getByRole('link',{name:/stats.active_depts/});
    expect(tile).toHaveTextContent('2');
    const rows=within(screen.getByRole('region',{name:'Counted departments'})).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(screen.queryByText('Zero population')).not.toBeInTheDocument();
    expect(tile).toHaveAttribute('href','#dashboard-departments');
    await userEvent.click(tile);
    expect(screen.getByRole('region',{name:'Counted departments'})).toHaveFocus();
    expect(window.location.search).toBe('?departmentId=17&riskLevel=high&controlForm=manual');
});

it.each([false,true])('projects selected Risk and Control destinations from Department shell authority %s',canReadDepartments=>{
    const filters={departmentId:17,riskLevel:'high' as const,controlStatus:null,controlForm:'manual'};
    const stats=buildDashboardStats({filters,canReadDepartments,canReadControls:true,canReadIssues:false,canReadVendors:false,departmentMetrics:[],issueSummary:null,summary:null,t:key=>key});
    render(<DashboardSummarySections issueLinks={buildDashboardDrillthrough(filters).issues} canReadIssues={false} categoryAnalyticsTitle="Analytics" issueAging={null} issueAgingTitle="Age" issueSeverity={null} issueSeverityTitle="Severity" issueSummary={null} stats={stats} summary={null}/>);
    for(const title of ['stats.total_controls','stats.critical_risks','stats.avg_risk_score']) {
        if(canReadDepartments) {
            const link=screen.getByRole('link',{name:new RegExp(title)});
            expect(link).toHaveAttribute('href',expect.stringContaining('/departments/17?'));
        } else {
            expect(screen.queryByRole('link',{name:new RegExp(title)})).not.toBeInTheDocument();
            expect(screen.getByText(title).closest('[aria-disabled="true"]')).not.toBeNull();
        }
    }
    expect(screen.queryAllByText('dashboard:destinations.department_unavailable')).toHaveLength(canReadDepartments?0:3);
});
