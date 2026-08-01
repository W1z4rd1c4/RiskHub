import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildControlColumns } from '@/pages/controls/controlColumns';
import type { ControlSummary } from '@/types/control';

describe('buildControlColumns', () => {
    it('uses the control frequency as the translation fallback', () => {
        const translate = vi.fn((key: string, options?: Record<string, unknown>) => (
            typeof options?.defaultValue === 'string' ? options.defaultValue : key
        ));
        const columns = buildControlColumns({
            onRestore: vi.fn(),
            pendingApprovalIds: new Set(),
            translate,
        });
        const frequencyColumn = columns.find((column) => column.key === 'frequency');
        const control: ControlSummary = {
            id: 7,
            name: 'Access review',
            frequency: 'semi-annually',
            risk_level: 2,
            status: 'active',
            is_archived: false,
            control_form: 'manual',
        };

        render(<>{frequencyColumn?.render?.(control)}</>);

        expect(screen.getByText('semi-annually')).toBeInTheDocument();
        expect(translate).toHaveBeenCalledWith('frequencies.semi-annually', {
            defaultValue: 'semi-annually',
        });
    });
});
