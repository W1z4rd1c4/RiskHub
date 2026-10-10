import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';
import { buildVendorColumns } from '@/pages/vendors/vendorColumns';
import type { Vendor } from '@/types/vendor';

function vendorWithPendingChange(): Vendor {
    return {
        id: 87,
        name: 'Critical hosting partner',
        is_archived: false,
        capabilities: {
            has_pending_change: true,
        },
    } as Vendor;
}

describe('Vendor register columns', () => {
    it('renders the canonical protected-change badge when the row has a pending change', () => {
        const columns = buildVendorColumns({
            onRestore: vi.fn(),
            t: (key: string) => key,
        });
        const statusColumn = columns.find((column) => column.key === 'status');

        render(statusColumn?.render?.(vendorWithPendingChange(), 0) as ReactElement);

        // PG-29 / D13: the shared PendingChangeBadge — one look and vocabulary on every register.
        const badge = screen.getByTestId('vendor-pending-change-87');
        expect(badge).toHaveTextContent(i18n.t('common:columns.pending'));
        expect(badge).toHaveAttribute('data-tone', 'warning');
        expect(badge).toHaveAttribute('title', i18n.t('common:columns.pending_tooltip'));
    });

    it('renders the status as a toned Badge and restores through the shared named row action', () => {
        const onRestore = vi.fn();
        const columns = buildVendorColumns({
            onRestore,
            t: (key: string) => key,
        });
        const archived = {
            id: 88,
            name: 'Legacy hosting',
            is_archived: true,
            capabilities: { can_restore: true },
        } as Vendor;

        render(columns.find((column) => column.key === 'status')?.render?.(archived, 0) as ReactElement);
        expect(screen.getByText('vendors:status.inactive')).toHaveAttribute('data-tone', 'neutral');

        render(columns.find((column) => column.key === 'id')?.render?.(archived, 0) as ReactElement);
        const restore = screen.getByTestId('vendor-unarchive-88');
        expect(restore).toHaveAccessibleName(i18n.t('common:actions.restore_named', { name: 'Legacy hosting' }));
        restore.click();
        expect(onRestore).toHaveBeenCalledWith(88, expect.anything());
    });

    it.each([
        [5, 'destructive'],
        [4, 'severity-high'],
        [3, 'warning'],
        [2, 'success'],
        [1, 'success'],
    ])('colours a vendor risk score of %i on the D1 severity scale, never blue', (score, token) => {
        const columns = buildVendorColumns({
            onRestore: vi.fn(),
            t: (key: string) => key,
        });
        const scoreColumn = columns.find((column) => column.key === 'risk_score');

        render(scoreColumn?.render?.({ id: 1, risk_score_1_5: score } as Vendor, 0) as ReactElement);

        const pill = screen.getByText(`${score} / 5`);
        expect(pill.className).toContain(token);
        expect(pill.className).not.toMatch(/\b(?:bg|text|border)-(?:info|accent)/);
    });
});
