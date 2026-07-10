import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildProcessColumns } from '@/pages/processes/processColumns';
import {
    buildProcessListParams,
    buildProcessWritePayload,
    getProcessDisplayStatus,
} from '@/pages/processes/processesPagePresentation';
import type { Process, ProcessDerived } from '@/types/process';

function sampleProcessDerived(overrides: Partial<ProcessDerived> = {}): ProcessDerived {
    return {
        criticality_score: 17,
        criticality_class: 'Kritická',
        cif: 'Ano',
        rto_mtpd_check: 'OK',
        bcm_check: 'OK',
        next_review_date: null,
        linked_asset_count: 1,
        linked_vendor_count: 0,
        is_complete: false,
        is_duplicate: false,
        inputs: {
            impact_client: 4,
            impact_market_operations: 4,
            impact_regulatory: 4,
            impact_financial: 5,
            mtpd_hours: 24,
            mtpd_bonus: 3,
            threshold_critical_score: 16,
            threshold_high_score: 12,
            threshold_medium_score: 8,
            mtpd_critical_hours: 4,
            mtpd_medium_hours: 24,
            preliminary_criticality: 'Vysoká',
            criticality_class_source: 'score',
            cif_override: null,
            cif_class_critical: true,
            cif_mtpd_within_critical: false,
            cif_any_impact_maximal: true,
            rto_hours: 8,
            bcm_link: 'Ano',
            assessment_date: null,
            missing_for_completeness: ['owner'],
        },
        ...overrides,
    };
}

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
        derived: sampleProcessDerived(),
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
        expect(screen.getByText('processes:status.archived')).toBeInTheDocument();
    });

    it('exposes MTPD and the derived criticality columns in the register column set', () => {
        const columns = buildProcessColumns({
            t: (key: string) => key,
            onRestore: () => undefined,
            canRestoreProcess: () => false,
        });
        const keys = columns.map((column) => column.key);

        expect(keys).toContain('mtpd_hours');
        // Ticket #48: the register shows the ENGINE-derived class and CIF; the
        // entered preliminary class stays a form/detail field only.
        expect(keys).toContain('derived_criticality_class');
        expect(keys).toContain('derived_cif');
        expect(keys).not.toContain('preliminary_criticality');
        expect(keys).not.toContain('cif_override');

        const mtpdColumn = columns.find((column) => column.key === 'mtpd_hours');
        render(mtpdColumn?.render?.(sampleProcess(), 0) as ReactElement);
        expect(screen.getByText('24')).toBeInTheDocument();
    });

    it('renders the derived criticality class pill and CIF read-only', () => {
        const columns = buildProcessColumns({
            t: (key: string) => key,
            onRestore: () => undefined,
            canRestoreProcess: () => false,
        });

        const classColumn = columns.find((column) => column.key === 'derived_criticality_class');
        render(classColumn?.render?.(sampleProcess(), 0) as ReactElement);
        expect(screen.getByText('Kritická')).toBeInTheDocument();

        const cifColumn = columns.find((column) => column.key === 'derived_cif');
        render(cifColumn?.render?.(sampleProcess(), 0) as ReactElement);
        expect(screen.getByText('Ano')).toBeInTheDocument();
    });

    it('renders placeholders when the derived block is absent', () => {
        const columns = buildProcessColumns({
            t: (key: string) => key,
            onRestore: () => undefined,
            canRestoreProcess: () => false,
        });
        const bare = sampleProcess({ derived: null });

        const classColumn = columns.find((column) => column.key === 'derived_criticality_class');
        render(classColumn?.render?.(bare, 0) as ReactElement);
        const cifColumn = columns.find((column) => column.key === 'derived_cif');
        render(cifColumn?.render?.(bare, 0) as ReactElement);
        expect(screen.getAllByText('—')).toHaveLength(2);
    });
});
