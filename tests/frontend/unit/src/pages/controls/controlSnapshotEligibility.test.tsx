import type { controlApi as importedControlApi } from '@/services/controlApi';
import type { reportApi as importedReportApi } from '@/services/reportApi';
import type { ControlListResponse } from '@/types/control';
import { afterEach,expect,it,vi } from 'vitest';
import { renderInRouter,screen,userEvent,waitFor } from '@test/render';
import { useControlsPageState } from '@/pages/controls/useControlsPageState';
import { DepartmentRegisterScopeProvider } from '@/pages/departments/DepartmentRegisterScope';
import { ExportDialog } from '@/components/reports/ExportDialog';
import i18n from '@/i18n';
const controlApi = vi.hoisted(() => ({getControls:vi.fn<typeof importedControlApi.getControls>().mockResolvedValue({items:[],total:0,offset:0,limit:50}),downloadExport:vi.fn<typeof importedControlApi.downloadExport>().mockResolvedValue(undefined)}));
const reportApi = vi.hoisted(() => ({exportControls:vi.fn<typeof importedReportApi.exportControls>().mockResolvedValue(undefined)}));
vi.mock('@/services/reportApi',()=>({reportApi:reportApi}));
vi.mock('@/services/controlApi',()=>({controlApi:controlApi}));
const rejected=vi.fn<(error: unknown) => void>();
function controlPage(id: number, name: string): ControlListResponse {
    return {
        items: [{ id, name, frequency: 'monthly', risk_level: 3, status: 'active', is_archived: false, control_form: 'manual' }],
        total: 1, offset: 0, limit: 50,
    };
}
function Probe(){
    const state=useControlsPageState();
    return <><ExportDialog datedUnavailableReason={state.snapshotUnavailableReason} isOpen onClose={()=>undefined} onSubmit={state.exportControlSnapshot} onCurrentViewSubmit={state.exportCurrentControls}/>
        <button onClick={()=>void state.exportControlSnapshot({format:'csv',asOfDate:'2025-01-15'}).catch(rejected)}>Direct snapshot</button>
        <button onClick={()=>state.updateFilter('control_form','')}>Clear form</button>
        <output data-testid="items">{state.items.map(item=>item.name).join(',')}</output>
        <output data-testid="busy">{String(state.isExporting)}</output></>;
}
it.each([null,17])('refuses form-filtered snapshot through callback, department=%s',async departmentId=>{
    rejected.mockClear();vi.mocked(reportApi).exportControls.mockClear();
    const probe=<Probe/>;
    renderInRouter(departmentId?<DepartmentRegisterScopeProvider value={{departmentId,departmentName:'Scoped'}}>{probe}</DepartmentRegisterScopeProvider>:probe,{initialEntries:['/controls?filters=%7B%22control_form%22%3A%22manual%22%7D']});
    await userEvent.click(screen.getByText('Direct snapshot'));
    await waitFor(()=>expect(rejected).toHaveBeenCalledOnce());
    expect(vi.mocked(reportApi).exportControls).not.toHaveBeenCalled();
    expect(screen.getByTestId('busy')).toHaveTextContent('false');
});

afterEach(async()=>{await i18n.changeLanguage('en');});
it.each(['en','cs'] as const)('preserves dated draft and explains unavailable form in %s',async language=>{
    await i18n.changeLanguage(language);
    rejected.mockClear();vi.mocked(reportApi).exportControls.mockClear();vi.mocked(controlApi.downloadExport).mockClear();
    renderInRouter(<Probe/>,{initialEntries:['/controls?filters=%7B%22control_form%22%3A%22automatic%22%7D']});
    await userEvent.click(screen.getByTestId('export-submit-button'));
    expect(controlApi.downloadExport).toHaveBeenCalledWith(expect.objectContaining({control_form:'automatic'}),'en');
    await userEvent.click(screen.getByTestId('export-purpose-point-in-time'));
    await userEvent.clear(screen.getByTestId('export-date-input'));
    await userEvent.type(screen.getByTestId('export-date-input'),'2025-01-15');
    const reason=i18n.t('controls:register.snapshot_unavailable',{form:i18n.t('controls:control_forms.automatic')});
    expect(reason).not.toBe('register.snapshot_unavailable');expect(reason.length).toBeGreaterThan(30);
    expect(screen.getByText(reason)).toBeVisible();
    expect(screen.getByTestId('export-submit-button')).toBeDisabled();
    await userEvent.click(screen.getByText('Direct snapshot'));
    await waitFor(()=>expect(rejected).toHaveBeenCalledOnce());
    expect(rejected.mock.calls[0][0]).toHaveProperty('message', reason);
    expect(vi.mocked(reportApi).exportControls).not.toHaveBeenCalled();
    expect(screen.getByTestId('busy')).toHaveTextContent('false');
    await userEvent.click(screen.getByText('Clear form'));
    expect(screen.getByTestId('export-purpose-point-in-time')).toBeChecked();
    expect(screen.getByTestId('export-date-input')).toHaveValue('2025-01-15');
    expect(screen.getByTestId('export-submit-button')).toBeEnabled();
    await userEvent.click(screen.getByTestId('export-submit-button'));
    expect(vi.mocked(reportApi).exportControls).toHaveBeenCalledWith(expect.objectContaining({asOfDate:'2025-01-15'}));
});

it('does not apply a delayed old-form response after current form is cleared',async()=>{
    let resolveOld!:(value:ControlListResponse)=>void;
    const old=new Promise<ControlListResponse>(resolve=>{resolveOld=resolve;});
    vi.mocked(controlApi).getControls.mockImplementation(params=>params.control_form?old:Promise.resolve(controlPage(2, 'Current all forms')));
    renderInRouter(<Probe/>,{initialEntries:['/controls?filters=%7B%22control_form%22%3A%22manual%22%7D']});
    await waitFor(()=>expect(vi.mocked(controlApi).getControls).toHaveBeenCalledWith(expect.objectContaining({control_form:'manual'})));
    await userEvent.click(screen.getByText('Clear form'));
    await waitFor(()=>expect(screen.getByTestId('items')).toHaveTextContent('Current all forms'));
    resolveOld(controlPage(1, 'Old manual response'));
    await waitFor(()=>expect(screen.getByTestId('items')).not.toHaveTextContent('Old manual response'));
    expect(screen.getByTestId('items')).toHaveTextContent('Current all forms');
    vi.mocked(controlApi).getControls.mockResolvedValue({items:[],total:0,offset:0,limit:50});
});
