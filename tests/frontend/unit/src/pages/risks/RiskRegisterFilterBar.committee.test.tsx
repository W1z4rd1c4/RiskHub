import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';
import { RiskRegisterFilterBar } from '@/pages/risks/RiskRegisterFilterBar';
import { parseRiskRegisterFilters } from '@/pages/risks/riskRegisterConfig';

vi.mock('@/hooks/useRiskHubConfig', () => ({ useRiskTypes: () => ({ riskTypes: [] }) }));

describe('RiskRegisterFilterBar Committee population', () => {
    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it('locks lifecycle and status to all until the Committee chip is removed', () => {
        render(<RiskRegisterFilterBar facets={{}} filters={parseRiskRegisterFilters({})} isPopulationLocked
            isLoading={false} onClearAll={vi.fn()} onFilterChange={vi.fn()} onRefresh={vi.fn()}
            onSearchChange={vi.fn()} search="" />);
        expect(screen.getByTestId('risks-lifecycle-filter-trigger')).toBeDisabled();
        expect(screen.getByTestId('risks-status-filter-trigger')).toBeDisabled();
    });

    it.each([
        ['en', 'Nízké', 'Net band: Low'],
        ['en', 'Střední', 'Net band: Medium'],
        ['en', 'Vysoké', 'Net band: High'],
        ['en', 'Kritické', 'Net band: Critical'],
        ['cs', 'Nízké', 'Čisté pásmo: Nízké'],
        ['cs', 'Střední', 'Čisté pásmo: Střední'],
        ['cs', 'Vysoké', 'Čisté pásmo: Vysoké'],
        ['cs', 'Kritické', 'Čisté pásmo: Kritické'],
    ] as const)('localizes canonical net-band code %s/%s without changing transport', async (
        language,
        transportCode,
        visibleLabel,
    ) => {
        await i18n.changeLanguage(language);
        const user = userEvent.setup();
        const onClearAll = vi.fn();
        const onFilterChange = vi.fn();
        render(<RiskRegisterFilterBar
            facets={{}}
            filters={parseRiskRegisterFilters({ net_band: transportCode })}
            isLoading={false}
            onClearAll={onClearAll}
            onFilterChange={onFilterChange}
            onRefresh={vi.fn()}
            onSearchChange={vi.fn()}
            search=""
        />);

        expect(screen.getByTestId('risks-filter-chip-net_band')).toHaveTextContent(visibleLabel);
        const removeLabel = language === 'en' ? `Remove ${visibleLabel}` : `Odebrat ${visibleLabel}`;
        await user.click(screen.getByRole('button', { name: removeLabel }));
        expect(onFilterChange).toHaveBeenCalledWith('net_band', '');

        await user.click(screen.getByTestId('risks-clear-filters'));
        expect(onClearAll).toHaveBeenCalledOnce();
    });

    it.each([
        ['en', true, 'KRI breach: Yes'],
        ['en', false, 'KRI breach: No'],
        ['cs', true, 'Překročení KRI: Ano'],
        ['cs', false, 'Překročení KRI: Ne'],
    ] as const)('renders the selected KRI breach boolean in %s', async (language, hasBreach, label) => {
        await i18n.changeLanguage(language);
        render(<RiskRegisterFilterBar
            facets={{}}
            filters={parseRiskRegisterFilters({ has_breach: hasBreach })}
            isLoading={false}
            onClearAll={vi.fn()}
            onFilterChange={vi.fn()}
            onRefresh={vi.fn()}
            onSearchChange={vi.fn()}
            search=""
        />);

        expect(screen.getByTestId('risks-filter-chip-has_breach')).toHaveTextContent(label);
    });
});
