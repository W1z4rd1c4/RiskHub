import { expect,it,vi } from 'vitest';
import { Route,Routes } from 'react-router-dom';
import { renderInRouter,screen,waitFor } from '@test/render';
import { DepartmentDetailPage } from '@/pages/DepartmentDetailPage';
import { departmentApi } from '@/services/departmentApi';
import { ApiClientError } from '@/services/apiClient';
import i18n from '@/i18n';

vi.mock('@/services/departmentApi',()=>({departmentApi:{getDepartment:vi.fn()}}));
vi.mock('@/hooks/useRiskHubConfig',()=>({useRiskThresholds:()=>({thresholds:{medium:6,high:12,critical:20}})}));

it.each(['risks','controls'])('the real Department shell retains denied read authority for %s',async tab=>{
    vi.mocked(departmentApi.getDepartment).mockReset().mockRejectedValue(new ApiClientError({status:403,messageKey:'errors.forbidden'}));
    renderInRouter(<Routes><Route path="/departments/:id" element={<DepartmentDetailPage/>}/></Routes>,{initialEntries:[`/departments/17?tab=${tab}&filters=%7B%22status%22%3A%22all%22%7D`]});
    await waitFor(()=>expect(departmentApi.getDepartment).toHaveBeenCalledWith(17));
    expect(await screen.findByRole('heading',{name:i18n.t('common:access.denied')})).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
});
