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
});
