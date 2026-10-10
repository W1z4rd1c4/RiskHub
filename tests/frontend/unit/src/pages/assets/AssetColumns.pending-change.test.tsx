import type { ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import * as axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';

import { buildAssetColumns } from '@/pages/assets/assetColumns';
import type { Asset } from '@/types/asset';

async function expectNoAxeViolations(node: Element): Promise<void> {
    const results = await axe.run(node, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
        rules: { 'color-contrast': { enabled: false } },
    });
    const summary = results.violations.map((violation) => (
        `${violation.id} (${violation.nodes.length}): ${violation.help}`
    )).join('\n');
    expect(summary, summary).toBe('');
}

describe('Asset register columns', () => {
    it('renders the canonical pending-change badge from backend capability metadata', async () => {
        const asset = {
            id: 88,
            name: 'Payments platform',
            is_archived: false,
            capabilities: {
                has_pending_change: true,
            },
        } as Asset;
        const columns = buildAssetColumns({
            canRestoreAsset: vi.fn(() => false),
            onRestore: vi.fn(),
            t: (key: string) => key,
        });
        const statusColumn = columns.find((column) => column.key === 'status');

        const { container } = render(statusColumn?.render?.(asset, 0) as ReactElement);

        // Shared `PendingChangeBadge`: short visible text, full accessible name.
        const badge = screen.getByTestId('asset-pending-change-88');
        expect(badge).toHaveTextContent('Pending');
        expect(badge).toHaveTextContent('Pending approval');
        await expectNoAxeViolations(container);
    });

    it('tones the lifecycle status and restores an archived asset through a named icon button', async () => {
        const onRestore = vi.fn();
        const columns = buildAssetColumns({
            canRestoreAsset: vi.fn(() => true),
            onRestore,
            t: (key: string) => key,
        });
        const statusColumn = columns.find((column) => column.key === 'status');
        const archived = { id: 88, name: 'Payments platform', is_archived: true, capabilities: {} } as Asset;

        const { container } = render(statusColumn?.render?.(archived, 0) as ReactElement);

        expect(screen.getByText('assets:status.archived')).toHaveAttribute('data-tone', 'neutral');
        const restore = screen.getByRole('button', { name: 'Restore Payments platform' });
        expect(restore).toBe(screen.getByTestId('asset-restore-88'));
        fireEvent.click(restore);
        expect(onRestore).toHaveBeenCalledWith(88, expect.anything());
        await expectNoAxeViolations(container);
    });
});
