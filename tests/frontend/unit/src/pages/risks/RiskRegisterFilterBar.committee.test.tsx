import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RiskRegisterFilterBar } from '@/pages/risks/RiskRegisterFilterBar';
import { parseRiskRegisterFilters } from '@/pages/risks/riskRegisterConfig';

vi.mock('@/hooks/useRiskHubConfig', () => ({ useRiskTypes: () => ({ riskTypes: [] }) }));

describe('RiskRegisterFilterBar Committee population', () => {
    it('locks lifecycle and status to all until the Committee chip is removed', () => {
        render(<RiskRegisterFilterBar facets={{}} filters={parseRiskRegisterFilters({})} isPopulationLocked
            isLoading={false} onClearAll={vi.fn()} onFilterChange={vi.fn()} onRefresh={vi.fn()}
            onSearchChange={vi.fn()} search="" />);
        expect(screen.getByTestId('risks-lifecycle-filter-trigger')).toBeDisabled();
        expect(screen.getByTestId('risks-status-filter-trigger')).toBeDisabled();
    });
});
