import type { riskApi as importedRiskApi } from '@/services/riskApi';
import type { reportApi as importedReportApi } from '@/services/reportApi';
import { objectContaining } from '@test/matchers';
import { afterEach, vi, it, expect } from 'vitest';
import { renderInRouter, screen, userEvent, waitFor } from '@test/render';
import { useRisksPageState } from '@/pages/risks/useRisksPageState';
import { DepartmentRegisterScopeProvider } from '@/pages/departments/DepartmentRegisterScope';
import { ExportDialog } from '@/components/reports/ExportDialog';
const reportApi = vi.hoisted(() => ({ exportRisks: vi.fn<typeof importedReportApi.exportRisks>().mockResolvedValue(undefined) }));
const riskApi = vi.hoisted(() => ({getRisks:vi.fn<typeof importedRiskApi.getRisks>().mockResolvedValue({items:[],total:0,offset:0,limit:50}),downloadExport:vi.fn<typeof importedRiskApi.downloadExport>().mockResolvedValue(undefined)}));
import i18n from '@/i18n';

vi.mock('@/services/reportApi', () => ({ reportApi: reportApi }));
vi.mock('@/services/riskApi', () => ({riskApi:riskApi}));
const configured = vi.hoisted(()=>({thresholds:{medium:6,high:12,critical:20}}));
vi.mock('@/hooks/useRiskHubConfig', () => ({useRiskThresholds:()=>configured}));
const rejection = vi.fn<(error: unknown) => void>();
function Probe({ language = 'en' }: { language?: 'en' | 'cs' }) {
    const state = useRisksPageState({}, language);
    return <>
        <ExportDialog datedUnavailableReason={state.snapshotUnavailableReason} isOpen onClose={()=>undefined} onSubmit={state.exportRiskSnapshot} onCurrentViewSubmit={state.exportCurrentRisks} isSubmitting={state.isExporting} />
        <button onClick={()=>void state.exportRiskSnapshot({format:'csv',asOfDate:'2025-01-15'}).catch(rejection)}>Direct snapshot</button>
        <button onClick={()=>state.updateFilter('critical',false)}>Clear critical</button>
        <button onClick={()=>state.updateFilter('risk_level','')}>Clear level</button>
        <button onClick={()=>state.updateFilter('has_breach',null)}>Clear breach</button>
        <button onClick={()=>state.updateFilter('net_band','')}>Clear net band</button>
        <button onClick={state.clearSelectedGroup}>Clear group</button>
        <output data-testid="group">{state.selectedGroupValue}</output>
        <output data-testid="busy">{String(state.isExporting)}</output>
        <output data-testid="filters">{JSON.stringify(state.filters)}</output>
    </>;
}
afterEach(async()=>{ await i18n.changeLanguage('en'); });
it.each(['en','cs'] as const)('refuses configured snapshot with actionable %s copy and incremental filter clearing', async (language) => {
    await i18n.changeLanguage(language);
    // The scope-specific matrix below separately exercises both callback paths.
    vi.mocked(reportApi).exportRisks.mockClear(); rejection.mockClear();
    renderInRouter(<Probe/>, {initialEntries:['/risks?filters='+encodeURIComponent(JSON.stringify({risk_level:'high',critical:true,status:'all'}))]});
    await userEvent.click(screen.getByTestId('export-purpose-point-in-time'));
    await userEvent.clear(screen.getByTestId('export-date-input'));
    await userEvent.type(screen.getByTestId('export-date-input'),'2025-01-15');
    const message = i18n.t('risks:register.snapshot_unavailable',{criteria:[i18n.t('risks:register.net_bands.high'),i18n.t('risks:register.filters.critical')].join(', ')});
    expect(message).not.toBe('register.snapshot_unavailable'); expect(message.length).toBeGreaterThan(30);
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.getByTestId('export-submit-button')).toBeDisabled();
    await userEvent.click(screen.getByText('Direct snapshot'));
    await waitFor(()=>expect(rejection).toHaveBeenCalledOnce());
    expect(rejection.mock.calls[0][0]).toHaveProperty('message', message);
    expect(vi.mocked(reportApi).exportRisks).not.toHaveBeenCalled();
    expect(screen.getByTestId('busy')).toHaveTextContent('false');
    await userEvent.click(screen.getByText('Clear critical'));
    expect(screen.getByTestId('export-submit-button')).toBeDisabled();
    expect(screen.getByTestId('export-date-input')).toHaveValue('2025-01-15');
    expect(screen.getByTestId('export-purpose-point-in-time')).toBeChecked();
    expect(screen.getByTestId('filters')).toHaveTextContent('"risk_level":"high"');
    await userEvent.click(screen.getByText('Clear level'));
    expect(screen.getByTestId('export-submit-button')).toBeEnabled();
    await userEvent.click(screen.getByTestId('export-submit-button'));
    expect(vi.mocked(reportApi).exportRisks).toHaveBeenCalledWith(expect.objectContaining({asOfDate:'2025-01-15',filters: objectContaining({status:null})}));
});
it.each([null,7].flatMap(departmentId=>['level','critical','both'].map(criterion=>({departmentId,criterion}))))('keeps current-view and guards alternate dated submit: $departmentId/$criterion', async ({departmentId,criterion}) => {
    vi.mocked(reportApi).exportRisks.mockClear(); vi.mocked(riskApi.downloadExport).mockClear(); rejection.mockClear();
    const filters={risk_level:criterion==='critical'?undefined:'high',critical:criterion!=='level',status:'all'};
    const probe=<Probe/>;
    renderInRouter(departmentId ? <DepartmentRegisterScopeProvider value={{departmentId,departmentName:'Scoped'}}>{probe}</DepartmentRegisterScopeProvider> : probe, {initialEntries:['/risks?filters='+encodeURIComponent(JSON.stringify(filters))]});
    await userEvent.click(screen.getByTestId('export-submit-button'));
    expect(riskApi.downloadExport).toHaveBeenCalledWith(expect.objectContaining({risk_level:filters.risk_level,critical:filters.critical||undefined,department_id:departmentId??undefined,status:undefined}), 'en');
    await userEvent.click(screen.getByTestId('export-purpose-point-in-time'));
    await userEvent.click(screen.getByText('Direct snapshot'));
    await waitFor(()=>expect(rejection).toHaveBeenCalledOnce());
    expect(vi.mocked(reportApi).exportRisks).not.toHaveBeenCalled();
    expect(screen.getByTestId('busy')).toHaveTextContent('false');
    expect(screen.getByTestId('export-submit-button')).toBeDisabled();
});

it('refetches selected configured population when medium/high change despite unchanged wire criteria', async () => {
    vi.mocked(riskApi).getRisks.mockClear();
    const {rerender}=renderInRouter(<Probe/>,{initialEntries:['/risks?filters=%7B%22risk_level%22%3A%22medium%22%7D']});
    await waitFor(()=>expect(vi.mocked(riskApi).getRisks).toHaveBeenCalled());
    const before=vi.mocked(riskApi).getRisks.mock.calls.length;
    configured.thresholds={medium:7,high:13,critical:20};
    rerender(<Probe/>);
    await waitFor(()=>expect(vi.mocked(riskApi).getRisks.mock.calls.length).toBeGreaterThan(before));
    const last=vi.mocked(riskApi).getRisks.mock.calls.at(-1)![0];
    expect(last).toMatchObject({risk_level:'medium'});
    expect(last).not.toHaveProperty('min_net_score');
    configured.thresholds={medium:6,high:12,critical:20};
});

it.each((['en','cs'] as const).flatMap(language=>[true,false].flatMap(has_breach=>[null,7].map(departmentId=>({language,has_breach,departmentId})))))('refuses dated breach $has_breach in $language for $departmentId while retaining current export',async ({language,has_breach,departmentId})=>{
    await i18n.changeLanguage(language);
    vi.mocked(reportApi).exportRisks.mockClear(); vi.mocked(riskApi.downloadExport).mockClear(); rejection.mockClear();
    const probe=<Probe language={language}/>;
    renderInRouter(departmentId ? <DepartmentRegisterScopeProvider value={{departmentId,departmentName:'Scoped'}}>{probe}</DepartmentRegisterScopeProvider> : probe,{initialEntries:['/risks?filters='+encodeURIComponent(JSON.stringify({has_breach,status:'all'}))]});
    await userEvent.click(screen.getByTestId('export-submit-button'));
    expect(riskApi.downloadExport).toHaveBeenCalledWith(expect.objectContaining({has_breach,department_id:departmentId??undefined,status:undefined}),language);
    await userEvent.click(screen.getByTestId('export-purpose-point-in-time'));
    await userEvent.clear(screen.getByTestId('export-date-input'));
    await userEvent.type(screen.getByTestId('export-date-input'),'2025-01-15');
    const criterion=i18n.t(`risks:register.snapshot_breach_${has_breach?'yes':'no'}`);
    expect(criterion).not.toContain('snapshot_breach'); expect(criterion.length).toBeGreaterThan(5);
    const message=i18n.t('risks:register.snapshot_unavailable',{criteria:criterion});
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.getByTestId('export-submit-button')).toBeDisabled();
    await userEvent.click(screen.getByText('Direct snapshot'));
    await waitFor(()=>expect(rejection).toHaveBeenCalledOnce());
    expect(rejection.mock.calls[0][0]).toHaveProperty('message', message);
    expect(vi.mocked(reportApi).exportRisks).not.toHaveBeenCalled();
    expect(screen.getByTestId('busy')).toHaveTextContent('false');
    expect(screen.getByTestId('filters')).toHaveTextContent(`"has_breach":${has_breach}`);
    expect(screen.getByTestId('export-date-input')).toHaveValue('2025-01-15');
    expect(screen.getByTestId('export-purpose-point-in-time')).toBeChecked();
    await userEvent.click(screen.getByText('Clear breach'));
    expect(screen.getByTestId('export-submit-button')).toBeEnabled();
});

it.each(['all','archived'])('transmits lifecycle %s independently of selected business status', async lifecycle=>{
    vi.mocked(reportApi).exportRisks.mockClear(); rejection.mockClear();
    renderInRouter(<Probe/>,{initialEntries:['/risks?filters='+encodeURIComponent(JSON.stringify({lifecycle,status:'emerging'}))]});
    await userEvent.click(screen.getByText('Direct snapshot'));
    await waitFor(()=>expect(vi.mocked(reportApi).exportRisks).toHaveBeenCalledOnce());
    expect(vi.mocked(reportApi).exportRisks).toHaveBeenCalledWith(expect.objectContaining({filters: objectContaining({lifecycle,status:'emerging'})}));
});

it.each((['en','cs'] as const).flatMap(language=>[null,7].map(departmentId=>({language,departmentId}))))('retains current export and refuses net band/group snapshot in $language for $departmentId',async ({language,departmentId})=>{
    await i18n.changeLanguage(language);
    vi.mocked(reportApi).exportRisks.mockClear(); vi.mocked(riskApi.downloadExport).mockClear(); rejection.mockClear();
    const probe=<Probe language={language}/>;
    renderInRouter(departmentId ? <DepartmentRegisterScopeProvider value={{departmentId,departmentName:'Scoped'}}>{probe}</DepartmentRegisterScopeProvider> : probe,{initialEntries:['/risks?view=category&group=Operational&filters='+encodeURIComponent(JSON.stringify({net_band:'high'}))]});
    await userEvent.click(screen.getByTestId('export-submit-button'));
    expect(riskApi.downloadExport).toHaveBeenCalledWith(expect.objectContaining({net_band:'Vysoké',group_by:'category',group_value:'Operational',department_id:departmentId??undefined}),language);
    await userEvent.click(screen.getByTestId('export-purpose-point-in-time'));
    await userEvent.clear(screen.getByTestId('export-date-input'));
    await userEvent.type(screen.getByTestId('export-date-input'),'2025-01-15');
    const criteria=(['snapshot_net_band','snapshot_group'] as const).map(key=>{
        const text=i18n.t(`risks:register.${key}`); expect(text).not.toContain(key); expect(text.length).toBeGreaterThan(5); return text;
    });
    const message=i18n.t('risks:register.snapshot_unavailable',{criteria:criteria.join(', ')});
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.getByTestId('export-submit-button')).toBeDisabled();
    await userEvent.click(screen.getByText('Direct snapshot'));
    await waitFor(()=>expect(rejection).toHaveBeenCalledOnce());
    expect(rejection.mock.calls[0][0]).toHaveProperty('message', message);
    expect(vi.mocked(reportApi).exportRisks).not.toHaveBeenCalled();
    expect(screen.getByTestId('busy')).toHaveTextContent('false');
    expect(screen.getByTestId('filters')).toHaveTextContent('"net_band":"high"');
    expect(screen.getByTestId('group')).toHaveTextContent('Operational');
    await userEvent.click(screen.getByText('Clear group'));
    expect(screen.getByTestId('export-submit-button')).toBeDisabled();
    expect(screen.getByText(i18n.t('risks:register.snapshot_unavailable',{criteria:criteria[0]}))).toBeVisible();
    await userEvent.click(screen.getByText('Direct snapshot'));
    await waitFor(()=>expect(rejection).toHaveBeenCalledTimes(2));
    expect(vi.mocked(reportApi).exportRisks).not.toHaveBeenCalled();
    expect(screen.getByTestId('export-date-input')).toHaveValue('2025-01-15');
    expect(screen.getByTestId('export-purpose-point-in-time')).toBeChecked();
    await userEvent.click(screen.getByText('Clear net band'));
    expect(screen.getByTestId('export-submit-button')).toBeEnabled();
    await userEvent.click(screen.getByTestId('export-submit-button'));
    expect(vi.mocked(reportApi).exportRisks).toHaveBeenCalledOnce();
});

it.each(['en','cs'] as const)('refuses selected group alone with translated %s explanation',async language=>{
    await i18n.changeLanguage(language);
    vi.mocked(reportApi).exportRisks.mockClear(); rejection.mockClear();
    renderInRouter(<Probe language={language}/>,{initialEntries:['/risks?view=category&group=Operational']});
    await userEvent.click(screen.getByTestId('export-purpose-point-in-time'));
    const criterion=i18n.t('risks:register.snapshot_group');
    expect(criterion).not.toContain('snapshot_group');
    expect(screen.getByText(i18n.t('risks:register.snapshot_unavailable',{criteria:criterion}))).toBeVisible();
    expect(screen.getByTestId('export-submit-button')).toBeDisabled();
    await userEvent.click(screen.getByText('Direct snapshot'));
    await waitFor(()=>expect(rejection).toHaveBeenCalledOnce());
    expect(vi.mocked(reportApi).exportRisks).not.toHaveBeenCalled();
    expect(screen.getByTestId('busy')).toHaveTextContent('false');
    expect(screen.getByTestId('group')).toHaveTextContent('Operational');
});

it('retains immutable Department scope over a conflicting URL in listing and dated export',async ()=>{
    vi.mocked(reportApi).exportRisks.mockClear(); vi.mocked(riskApi).getRisks.mockClear(); rejection.mockClear();
    renderInRouter(<DepartmentRegisterScopeProvider value={{departmentId:7,departmentName:'Scoped'}}><Probe/></DepartmentRegisterScopeProvider>,{initialEntries:['/departments/7/risks?department_id=99&filters='+encodeURIComponent(JSON.stringify({department_id:99,lifecycle:'all',status:'emerging'}))]});
    await waitFor(()=>expect(vi.mocked(riskApi).getRisks).toHaveBeenCalled());
    expect(vi.mocked(riskApi).getRisks.mock.calls.every(([params])=>params?.department_id===7)).toBe(true);
    await userEvent.click(screen.getByText('Direct snapshot'));
    await waitFor(()=>expect(vi.mocked(reportApi).exportRisks).toHaveBeenCalledOnce());
    expect(vi.mocked(reportApi).exportRisks).toHaveBeenCalledWith(expect.objectContaining({asOfDate:'2025-01-15',filters: objectContaining({departmentId:7,lifecycle:'all',status:'emerging'})}));
    expect(rejection).not.toHaveBeenCalled();
});
