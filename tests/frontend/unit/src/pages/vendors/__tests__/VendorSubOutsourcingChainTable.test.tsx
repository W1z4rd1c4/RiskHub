/**
 * FR-P4-7 (S13): the flattened, always-expanded sub-outsourcing list becomes a
 * per-contract grouped render with working expand/collapse. These tests pin the
 * grouping + disclosure behaviour and prove the structural indent and the
 * authoritative engine rank badge survive the regrouping unchanged.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { VendorSubOutsourcingChainTable } from '@/pages/vendors/VendorSubOutsourcingChainTable';
import {
    buildSubOutsourcingChainRows,
    buildVendorSubOutsourcingColumns,
    groupSubOutsourcingChainRows,
} from '@/pages/vendors/vendorSubOutsourcingPresentation';
import type {
    VendorSubOutsourcing,
    VendorSubOutsourcingDerived,
} from '@/types/vendorSubOutsourcing';

function sampleDerived(overrides: Partial<VendorSubOutsourcingDerived> = {}): VendorSubOutsourcingDerived {
    return {
        contract_reference: 'SML-9',
        contract_vendor_id: 4,
        contract_vendor_name: 'BIZ DATA',
        rank: 1,
        critical_service: 'Ne',
        chain_check: 'OK',
        roi_scope: 'Ano',
        inputs: {
            contract_id: 9,
            predecessor_id: null,
            predecessor_rank: null,
            is_direct: true,
            duplicate_key_count: 1,
        },
        ...overrides,
    };
}

function sampleEntry(overrides: Partial<VendorSubOutsourcing> = {}): VendorSubOutsourcing {
    return {
        id: 1,
        vendor_id: 4,
        contract_id: 9,
        predecessor_id: null,
        sub_provider_name: 'CLOUD OPS s.r.o.',
        country: 'CZ',
        ict_service_code: 'S17',
        is_archived: false,
        capabilities: null,
        derived: sampleDerived(),
        created_at: '2026-07-10T10:00:00Z',
        updated_at: '2026-07-10T10:00:00Z',
        ...overrides,
    };
}

function renderChainTable() {
    // Contract 9: A (root) -> B (rank-2 child); contract 12: C (root).
    const a = sampleEntry({ id: 1, contract_id: 9, sub_provider_name: 'CLOUD OPS s.r.o.', derived: sampleDerived({ rank: 1 }) });
    const b = sampleEntry({
        id: 2,
        contract_id: 9,
        predecessor_id: 1,
        sub_provider_name: 'DC HOSTING GmbH',
        derived: sampleDerived({ rank: 2 }),
    });
    const c = sampleEntry({ id: 3, contract_id: 12, sub_provider_name: 'Print Services s.r.o.', derived: sampleDerived({ rank: 1 }) });

    const rows = buildSubOutsourcingChainRows([c, b, a]);
    const getContractLabel = (entry: VendorSubOutsourcing) => (entry.contract_id === 9 ? 'SML-9' : 'SML-12');
    const columns = buildVendorSubOutsourcingColumns({
        t: (key: string) => key,
        getContractLabel,
        onEdit: () => undefined,
        onArchive: () => undefined,
        onRestore: () => undefined,
    });
    const groups = groupSubOutsourcingChainRows(rows, getContractLabel);
    return render(<VendorSubOutsourcingChainTable groups={groups} columns={columns} />);
}

describe('VendorSubOutsourcingChainTable (FR-P4-7)', () => {
    it('nests the table scroll container inside the clipped glass card', () => {
        renderChainTable();

        const table = screen.getByRole('table');
        const scrollContainer = table.parentElement;
        const card = scrollContainer?.parentElement;

        expect(scrollContainer).toHaveClass('overflow-x-auto');
        expect(card).toHaveClass('glass-card', '!p-0', 'overflow-hidden');
        expect(card).not.toHaveClass('overflow-x-auto');
    });

    it('groups chain nodes under a per-contract header, expanded by default, indent + rank preserved', () => {
        renderChainTable();

        const header9 = screen.getByTestId('vendor-sub-outsourcing-group-9');
        const header12 = screen.getByTestId('vendor-sub-outsourcing-group-12');
        expect(header9).toHaveTextContent('SML-9');
        expect(header12).toHaveTextContent('SML-12');
        // Groups render expanded on first paint (no chain data hidden — N10).
        expect(header9).toHaveAttribute('aria-expanded', 'true');

        // All chain nodes are visible.
        expect(screen.getByTestId('vendor-sub-outsourcing-provider-1')).toBeInTheDocument();
        expect(screen.getByTestId('vendor-sub-outsourcing-provider-2')).toBeInTheDocument();
        expect(screen.getByTestId('vendor-sub-outsourcing-provider-3')).toBeInTheDocument();

        // The child keeps its structural indent (depth 1 -> 20px)…
        expect(screen.getByTestId('vendor-sub-outsourcing-provider-2').style.paddingLeft).toBe('20px');
        // …and the authoritative engine rank badge is rendered verbatim.
        expect(screen.getByTestId('vendor-sub-outsourcing-rank-2')).toHaveTextContent('2');
    });

    it('collapses only the toggled contract and re-expands it', () => {
        renderChainTable();

        // Collapse contract 9.
        fireEvent.click(screen.getByTestId('vendor-sub-outsourcing-group-9'));
        expect(screen.getByTestId('vendor-sub-outsourcing-group-9')).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByTestId('vendor-sub-outsourcing-provider-1')).not.toBeInTheDocument();
        expect(screen.queryByTestId('vendor-sub-outsourcing-provider-2')).not.toBeInTheDocument();
        // Contract 12 is untouched.
        expect(screen.getByTestId('vendor-sub-outsourcing-provider-3')).toBeInTheDocument();

        // Re-expanding restores the chain nodes.
        fireEvent.click(screen.getByTestId('vendor-sub-outsourcing-group-9'));
        expect(screen.getByTestId('vendor-sub-outsourcing-group-9')).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByTestId('vendor-sub-outsourcing-provider-1')).toBeInTheDocument();
        expect(screen.getByTestId('vendor-sub-outsourcing-provider-2')).toBeInTheDocument();
    });

    it('associates every chain data cell with its column and per-contract headers', () => {
        renderChainTable();

        const groupButton = screen.getByTestId('vendor-sub-outsourcing-group-9');
        const groupHeader = groupButton.closest('th');
        const panel = document.getElementById(groupButton.getAttribute('aria-controls') ?? '');
        const dataCells = Array.from(panel?.querySelectorAll('td') ?? []);
        expect(groupHeader).not.toHaveAttribute('scope', 'colgroup');
        expect(groupHeader?.id).toBeTruthy();
        expect(dataCells.length).toBeGreaterThan(0);

        dataCells.forEach((cell) => {
            const associatedHeaderIds = cell.getAttribute('headers')?.split(/\s+/) ?? [];
            expect(associatedHeaderIds).toContain(groupHeader?.id);
            const associatedHeaders = associatedHeaderIds.map((id) => document.getElementById(id));
            expect(associatedHeaders).toContain(groupHeader);
            expect(associatedHeaders.some((header) => header?.getAttribute('scope') === 'col')).toBe(true);
            expect(associatedHeaders.every((header) => header?.tagName === 'TH')).toBe(true);
        });
    });
});
