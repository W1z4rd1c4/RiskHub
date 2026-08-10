import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';
import { IssuesFilterBar } from '@/pages/issues/IssuesFilterBar';
import { issueSeverityFacetOptions, issueStatusFacetOptions } from '@/pages/issues/issueFacetOptions';
import { EMPTY_ISSUE_REGISTER_FILTERS } from '@/pages/issues/issueRegisterConfig';

const facets = {
    status: [
        { value: 'open', label: 'open', count: 2, selected: false, disabled: false },
        { value: 'closed', label: 'closed', count: 0, selected: false, disabled: true },
    ],
    severity: [
        { value: 'high', label: 'high', count: 2, selected: false, disabled: false },
        { value: 'critical', label: 'critical', count: 1, selected: false, disabled: false },
    ],
};

describe('IssuesFilterBar canonical status and severity facets', () => {
    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it('preserves backend-disabled canonical options and synthesizes missing options as disabled', () => {
        expect(issueStatusFacetOptions(facets.status, '')).toContainEqual(expect.objectContaining({
            value: 'closed', count: 0, disabled: true,
        }));
        expect(issueSeverityFacetOptions(facets.severity, '')).toContainEqual(expect.objectContaining({
            value: 'high_critical', count: 0, disabled: true,
        }));
        expect(issueSeverityFacetOptions([
            { value: 'high_critical', label: 'high_critical', count: 0, selected: true, disabled: true },
        ], 'high_critical')).toContainEqual(expect.objectContaining({
            value: 'high_critical', count: 0, selected: true, disabled: true,
        }));
    });

    it.each([
        ['en', 'Closed (0)', 'High + Critical (0)'],
        ['cs', 'Uzavřený (0)', 'Vysoká + Kritická (0)'],
    ] as const)('localizes and disables zero-count status/severity options in %s', async (
        language,
        closedLabel,
        combinedLabel,
    ) => {
        await i18n.changeLanguage(language);
        const user = userEvent.setup();
        const onFilterChange = vi.fn();

        render(
            <IssuesFilterBar
                facets={facets}
                filters={EMPTY_ISSUE_REGISTER_FILTERS}
                isLoading={false}
                onClearAll={vi.fn()}
                onFilterChange={onFilterChange}
                onRefresh={vi.fn()}
                onSearchChange={vi.fn()}
                search=""
            />,
        );

        await user.click(screen.getByTestId('issues-status-filter-trigger'));
        const closed = screen.getByRole('option', { name: closedLabel });
        expect(closed).toHaveAttribute('data-disabled');
        await user.keyboard('{Escape}');

        await user.click(screen.getByTestId('issues-severity-filter-trigger'));
        const combined = screen.getByRole('option', { name: combinedLabel });
        expect(combined).toHaveAttribute('data-disabled');
        expect(onFilterChange).not.toHaveBeenCalled();
    });

    it.each([
        ['en', 'All statuses: Closed', 'All severities: High + Critical'],
        ['cs', 'Všechny stavy: Uzavřený', 'Všechny závažnosti: Vysoká + Kritická'],
    ] as const)('keeps selected zero-count options removable through chips and clear-all in %s', async (
        language,
        statusChipLabel,
        severityChipLabel,
    ) => {
        await i18n.changeLanguage(language);
        const user = userEvent.setup();
        const onFilterChange = vi.fn();
        const onClearAll = vi.fn();
        render(
            <IssuesFilterBar
                facets={{
                    status: [{ value: 'closed', label: 'closed', count: 0, selected: true, disabled: true }],
                    severity: [{ value: 'high_critical', label: 'high_critical', count: 0, selected: true, disabled: true }],
                }}
                filters={{ ...EMPTY_ISSUE_REGISTER_FILTERS, status: 'closed', severity: 'high_critical', include_closed: true }}
                isLoading={false}
                onClearAll={onClearAll}
                onFilterChange={onFilterChange}
                onRefresh={vi.fn()}
                onSearchChange={vi.fn()}
                search=""
            />,
        );

        const statusChip = screen.getByTestId('issues-filter-chip-status');
        const severityChip = screen.getByTestId('issues-filter-chip-severity');
        expect(statusChip).toHaveTextContent(statusChipLabel);
        expect(severityChip).toHaveTextContent(severityChipLabel);

        await user.click(within(statusChip).getByRole('button'));
        expect(onFilterChange).toHaveBeenCalledWith('status', '');
        await user.click(within(severityChip).getByRole('button'));
        expect(onFilterChange).toHaveBeenCalledWith('severity', '');
        await user.click(screen.getByTestId('issues-clear-filters'));
        expect(onClearAll).toHaveBeenCalledTimes(1);
    });
});
