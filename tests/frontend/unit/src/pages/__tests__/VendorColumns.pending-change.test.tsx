import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

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

        expect(screen.getByTestId('vendor-pending-change-87')).toHaveTextContent(
            'vendors:pending_change.badge',
        );
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
