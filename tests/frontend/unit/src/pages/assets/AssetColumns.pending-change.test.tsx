import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
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

        expect(screen.getByTestId('asset-pending-change-88')).toHaveTextContent(
            'assets:pending_change.badge',
        );
        await expectNoAxeViolations(container);
    });
});
