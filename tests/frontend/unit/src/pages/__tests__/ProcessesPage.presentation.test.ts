import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildProcessColumns } from '@/pages/processes/processColumns';
import {
    buildProcessListParams,
    buildProcessWritePayload,
    getProcessDisplayStatus,
} from '@/pages/processes/processesPagePresentation';
import type { Process } from '@/types/process';

function sampleProcess(overrides: Partial<Process> = {}): Process {
    return {
        id: 7,
        f_code: 'F7',
        l0_area: 'Provoz a služby klientům',
        l1_process: 'Správa pojistných smluv',
        l2_subprocess: null,
        owner: 'Provozní úsek',
        owner_department: 'Provoz',
        impact_client: 4,
        impact_market_operations: 3,
        impact_regulatory: 2,
        impact_financial: 5,
        impact_reputational: 1,
        mtpd_hours: 24,
        preliminary_criticality: 'Vysoká',
        cif_override: null,
        licensed_activity: null,
        rto_hours: 8,
        rpo_hours: 4,
        bcm_link: 'Ano',
        last_dr_test_date: null,
        dr_test_result: null,
        interruption_impact: null,
        assessment_date: null,
        notes: null,
        is_archived: false,
        archived_at: null,
        archived_by_id: null,
        capabilities: null,
        created_at: '2026-07-09T10:00:00Z',
        updated_at: '2026-07-09T10:00:00Z',
        ...overrides,
    };
}

describe('Processes page presentation helpers', () => {
    it('builds register list params with search, archive filter, sort, and paging', () => {
        expect(
            buildProcessListParams({
                currentPage: 3,
                debouncedSearch: '  smluv  ',
                includeArchived: true,
                limit: 20,
                sortDirection: 'desc',
                sortField: 'l1_process',
            })
        ).toEqual({
            offset: 40,
            limit: 20,
            include_archived: true,
            search: 'smluv',
            sort_by: 'l1_process',
            sort_order: 'desc',
        });

        expect(
            buildProcessListParams({
                currentPage: 1,
                debouncedSearch: '',
                includeArchived: false,
                limit: 20,
                sortDirection: null,
                sortField: null,
            })
        ).toEqual({ offset: 0, limit: 20, include_archived: false });
    });

    it('derives the display status from the archive flag', () => {
        expect(getProcessDisplayStatus(sampleProcess())).toBe('active');
        expect(getProcessDisplayStatus(sampleProcess({ is_archived: true }))).toBe('archived');
    });

    it('strips empty strings to nulls and drops untouched fields in write payloads', () => {
        expect(
            buildProcessWritePayload({
                l0_area: 'Provoz a služby klientům',
                l1_process: 'Správa pojistných smluv',
                l2_subprocess: '',
                owner: '  Provozní úsek ',
                owner_department: 'Provoz',
                impact_client: 4,
                impact_market_operations: null,
                mtpd_hours: 24,
                preliminary_criticality: '',
                cif_override: 'Ano',
                notes: '',
            })
        ).toEqual({
            l0_area: 'Provoz a služby klientům',
            l1_process: 'Správa pojistných smluv',
            l2_subprocess: null,
            owner: 'Provozní úsek',
            owner_department: 'Provoz',
            impact_client: 4,
            impact_market_operations: null,
            mtpd_hours: 24,
            preliminary_criticality: null,
            cif_override: 'Ano',
            notes: null,
        });
    });

    it('renders the F-code and the archived status pill in the table columns', () => {
        const columns = buildProcessColumns({
            t: (key: string) => key,
            onRestore: () => undefined,
            canRestoreProcess: () => false,
        });

        const fCodeColumn = columns.find((column) => column.key === 'f_code');
        render(fCodeColumn?.render?.(sampleProcess(), 0) as ReactElement);
        expect(screen.getByText('F7')).toBeInTheDocument();

        const statusColumn = columns.find((column) => column.key === 'status');
        render(statusColumn?.render?.(sampleProcess({ is_archived: true }), 0) as ReactElement);
        expect(screen.getByText('status.archived')).toBeInTheDocument();
    });

    it('exposes MTPD and the preliminary class in the criticality column set', () => {
        const columns = buildProcessColumns({
            t: (key: string) => key,
            onRestore: () => undefined,
            canRestoreProcess: () => false,
        });
        const keys = columns.map((column) => column.key);

        expect(keys).toContain('mtpd_hours');
        expect(keys).toContain('preliminary_criticality');

        const mtpdColumn = columns.find((column) => column.key === 'mtpd_hours');
        render(mtpdColumn?.render?.(sampleProcess(), 0) as ReactElement);
        expect(screen.getByText('24')).toBeInTheDocument();
    });
});
