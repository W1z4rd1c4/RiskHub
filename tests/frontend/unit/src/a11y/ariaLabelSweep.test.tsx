import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Pagination } from '@/components/tables/Pagination';
import { SearchableEntitySelect } from '@/components/ui/SearchableEntitySelect';
import { buildAssetColumns } from '@/pages/assets/assetColumns';
import { buildProcessColumns } from '@/pages/processes/processColumns';
import { buildThreatColumns } from '@/pages/threats/threatColumns';
import { buildVendorContractColumns } from '@/pages/vendors/vendorContractsPresentation';
import type { Asset } from '@/types/asset';
import type { Process } from '@/types/process';
import type { Threat } from '@/types/threat';
import type { VendorContract } from '@/types/vendorContract';

const TS = '2026-07-10T10:00:00Z';

// Pagination + SearchableEntitySelect resolve their labels via the hook; the
// column factories take `t` as a parameter, so those get `echoT` directly.
vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) =>
            opts && 'page' in opts ? `Go to page ${String(opts.page)}` : key,
        i18n: { language: 'en' },
    }),
}));

const echoT = (key: string) => key;

describe('FR-P5-9 — icon/control aria-label sweep (S8 / P5 / P7)', () => {
    it('gives Pagination page-number buttons an accessible name + marks the current page (P5)', () => {
        render(
            <Pagination
                currentPage={2}
                totalPages={4}
                totalItems={40}
                itemsPerPage={10}
                onPageChange={() => undefined}
            />,
        );

        expect(screen.getByRole('button', { name: 'Go to page 1' })).toBeInTheDocument();
        const current = screen.getByRole('button', { name: 'Go to page 2' });
        expect(current).toHaveAttribute('aria-current', 'page');
        // A non-current page button never claims aria-current.
        expect(screen.getByRole('button', { name: 'Go to page 3' })).not.toHaveAttribute('aria-current');
    });

    it('gives the SearchableEntitySelect search box an accessible name (P7)', () => {
        render(
            <SearchableEntitySelect
                value=""
                onValueChange={() => undefined}
                options={[]}
                searchValue=""
                onSearchChange={() => undefined}
                searchPlaceholder="Search vendors"
            />,
        );

        expect(screen.getByRole('textbox', { name: 'Search vendors' })).toBeInTheDocument();
    });

    it('labels the archived-row restore icon button on assets, processes, and threats (S8)', () => {
        const archivedAsset: Asset = { id: 7, name: 'A', is_archived: true, created_at: TS, updated_at: TS };
        const assetStatus = buildAssetColumns({
            t: echoT,
            onRestore: () => undefined,
            canRestoreAsset: () => true,
        }).find((column) => column.key === 'status');
        render(assetStatus?.render?.(archivedAsset, 0) as ReactElement);
        expect(screen.getByTestId('asset-restore-7')).toHaveAttribute('aria-label', 'assets:actions.restore');

        const archivedProcess: Process = {
            id: 8,
            f_code: 'F1',
            l0_area: 'Area',
            l1_process: 'Process',
            is_archived: true,
            created_at: TS,
            updated_at: TS,
        };
        const processStatus = buildProcessColumns({
            t: echoT,
            onRestore: () => undefined,
            canRestoreProcess: () => true,
        }).find((column) => column.key === 'status');
        render(processStatus?.render?.(archivedProcess, 0) as ReactElement);
        expect(screen.getByTestId('process-restore-8')).toHaveAttribute('aria-label', 'processes:actions.restore');

        const archivedThreat: Threat = { id: 9, name: 'T', is_archived: true, created_at: TS, updated_at: TS };
        const threatStatus = buildThreatColumns({
            t: echoT,
            onRestore: () => undefined,
            canRestoreThreat: () => true,
        }).find((column) => column.key === 'status');
        render(threatStatus?.render?.(archivedThreat, 0) as ReactElement);
        expect(screen.getByTestId('threat-restore-9')).toHaveAttribute('aria-label', 'threats:actions.restore');
    });

    it('labels every vendor-contract action icon button (S8)', () => {
        const actions = buildVendorContractColumns({
            t: echoT,
            onEdit: () => undefined,
            onArchive: () => undefined,
            onRestore: () => undefined,
        }).find((column) => column.key === 'actions');

        const active: VendorContract = {
            id: 3,
            vendor_id: 4,
            is_archived: false,
            created_at: TS,
            updated_at: TS,
            capabilities: { can_read: true, can_update: true, can_archive: true, can_restore: false },
        };
        render(actions?.render?.(active, 0) as ReactElement);
        expect(screen.getByTestId('vendor-contract-edit-3')).toHaveAttribute(
            'aria-label',
            'vendors:contracts.actions.edit',
        );
        expect(screen.getByTestId('vendor-contract-archive-3')).toHaveAttribute(
            'aria-label',
            'vendors:contracts.actions.archive',
        );

        const archived: VendorContract = {
            id: 12,
            vendor_id: 4,
            is_archived: true,
            created_at: TS,
            updated_at: TS,
            capabilities: { can_read: true, can_update: false, can_archive: false, can_restore: true },
        };
        render(actions?.render?.(archived, 0) as ReactElement);
        expect(screen.getByTestId('vendor-contract-restore-12')).toHaveAttribute(
            'aria-label',
            'vendors:contracts.actions.restore',
        );
    });
});
