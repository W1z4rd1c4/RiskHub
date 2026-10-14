import { MemoryRouter } from 'react-router-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getBreachesMock = vi.hoisted(() => vi.fn());
let selectedDepartment: number | null = null;

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { shown?: number; total?: number }) => (
            key === 'kri.showing' && options
                ? `Showing ${options.shown} of ${options.total}`
                : key
        ),
    }),
}));

vi.mock('@/contexts/DashboardFilterContext', () => ({
    useDashboardFilterSelector: (
        selector: (state: { filters: { departmentId: number | null } }) => unknown,
    ) => selector({ filters: { departmentId: selectedDepartment } }),
}));

vi.mock('@/services/kriApi', () => ({
    kriApi: {
        getBreaches: getBreachesMock,
    },
}));

vi.mock('@/services/logger', () => ({ logError: vi.fn() }));

import { KRIBreachWidget } from '@/components/dashboard/KRIBreachWidget';

describe('KRIBreachWidget population count', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        selectedDepartment = null;
        getBreachesMock.mockResolvedValue(
            Array.from({ length: 6 }, (_, index) => ({
                id: index + 1,
                risk_id: index + 10,
                metric_name: `Breach ${index + 1}`,
                current_value: 120,
                upper_limit: 100,
                unit: '%',
            })),
        );
    });

    it('keeps the exact breach total while showing only the first five', async () => {
        render(
            <MemoryRouter>
                <KRIBreachWidget canReadDepartments />
            </MemoryRouter>,
        );

        expect(await screen.findByText('Showing 5 of 6')).toBeInTheDocument();
        expect(screen.getByTestId('kri-breach-total')).toHaveTextContent('6');
        expect(screen.getByText('Breach 5')).toBeInTheDocument();
        expect(screen.queryByText('Breach 6')).not.toBeInTheDocument();
    });

    it('renders each breach and the register shortcut as keyboard-reachable links', async () => {
        render(
            <MemoryRouter>
                <KRIBreachWidget canReadDepartments />
            </MemoryRouter>,
        );

        const firstBreach = await screen.findByRole('link', { name: /Breach 1/ });
        expect(firstBreach).toHaveAttribute('href', '/risks/10');
        expect(firstBreach).toHaveTextContent('120 %');
        const href=screen.getByRole('link', { name: 'kri.view_risk_register' }).getAttribute('href')!;
        expect(JSON.parse(new URL(href,'http://riskhub.test').searchParams.get('filters')!)).toEqual({has_breach:true,status:'all'});
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 2, name: 'kri.active_breaches' })).toBeInTheDocument();
    });
    it.each([false,undefined])('uses the actual Department Risks destination and withholds it for unavailable filtering authority=%s',async capability=>{
        selectedDepartment=17;
        const {rerender}=render(<MemoryRouter><KRIBreachWidget canReadDepartments canUseDepartmentFilter /></MemoryRouter>);
        const footer=await screen.findByRole('link',{name:'kri.view_risk_register'});
        expect(new URL(footer.getAttribute('href')!,'http://riskhub.test').pathname).toBe('/departments/17');
        rerender(<MemoryRouter><KRIBreachWidget canReadDepartments canUseDepartmentFilter={capability}/></MemoryRouter>);
        expect(screen.queryByRole('link',{name:'kri.view_risk_register'})).not.toBeInTheDocument();
    });
    it('does not pair old breaches with a new department footer before the matching request resolves',async()=>{
        let resolveB!:(value:unknown[])=>void;
        getBreachesMock.mockImplementation((params?:{department_id:number})=>params?.department_id===2?new Promise(resolve=>{resolveB=resolve;}):Promise.resolve([{id:1,risk_id:10,metric_name:'A breach',current_value:120,upper_limit:100,unit:'%'}]));
        selectedDepartment=1;
        const {rerender}=render(<MemoryRouter><KRIBreachWidget canReadDepartments canUseDepartmentFilter/></MemoryRouter>);
        await screen.findByText('A breach');
        selectedDepartment=2;
        rerender(<MemoryRouter><KRIBreachWidget canReadDepartments canUseDepartmentFilter/></MemoryRouter>);
        expect(screen.queryByRole('link',{name:'kri.view_risk_register'})).not.toBeInTheDocument();
        await act(()=>Promise.resolve(resolveB([{id:2,risk_id:20,metric_name:'B breach',current_value:120,upper_limit:100,unit:'%'}])));
        await waitFor(()=>expect(screen.getByRole('link',{name:'kri.view_risk_register'})).toHaveAttribute('href',expect.stringContaining('/departments/2')));
    });

    it('rejects an old A request after A→B→A and keeps the footer bound to the new owner',async()=>{
        const resolveA:Array<(value:unknown[])=>void>=[];
        const breach=(name:string,id:number)=>[{id,risk_id:id,metric_name:name,current_value:120,upper_limit:100,unit:'%'}];
        getBreachesMock.mockImplementation((params:{department_id:number})=>params.department_id===1?new Promise(resolve=>{resolveA.push(resolve);}):Promise.resolve(breach('B population',20)));
        selectedDepartment=1;
        const {rerender,unmount}=render(<MemoryRouter><KRIBreachWidget canReadDepartments canUseDepartmentFilter/></MemoryRouter>);
        selectedDepartment=2;rerender(<MemoryRouter><KRIBreachWidget canReadDepartments canUseDepartmentFilter/></MemoryRouter>);
        await screen.findByText('B population');
        selectedDepartment=1;rerender(<MemoryRouter><KRIBreachWidget canReadDepartments canUseDepartmentFilter/></MemoryRouter>);
        expect(resolveA).toHaveLength(2);
        await act(()=>Promise.resolve(resolveA[0](breach('Old A population',10))));
        expect(screen.queryByText('Old A population')).not.toBeInTheDocument();
        expect(screen.queryByRole('link',{name:'kri.view_risk_register'})).not.toBeInTheDocument();
        await act(()=>Promise.resolve(resolveA[1](breach('New A population',11))));
        expect(await screen.findByText('New A population')).toBeVisible();
        expect(screen.getByRole('link',{name:'kri.view_risk_register'})).toHaveAttribute('href',expect.stringContaining('/departments/1'));
        unmount();
        expect(screen.queryByRole('link',{name:'kri.view_risk_register'})).not.toBeInTheDocument();
    });

    it('keeps a confirmed global filter unavailable when Department shell read is denied',async()=>{
        selectedDepartment=17;
        getBreachesMock.mockResolvedValue([{id:1,risk_id:1,metric_name:'Visible KRI',current_value:120,upper_limit:100,unit:'%'}]);
        render(<MemoryRouter><KRIBreachWidget canUseDepartmentFilter canReadDepartments={false}/></MemoryRouter>);
        expect(await screen.findByText('Visible KRI')).toBeVisible();
        expect(screen.queryByRole('link',{name:'kri.view_risk_register'})).not.toBeInTheDocument();
        expect(screen.getByText('destinations.department_unavailable')).toBeVisible();
    });

});
