import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ActivityLogEntries } from '@/components/activity-log/ActivityLogEntries';
import type { ActivityLogEntry } from '@/types/activityLog';

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/i18n/formatters', () => ({
    formatDateTimeValue: () => '2026-04-06 10:00',
    formatRelativeDateValue: () => 'just now',
}));

function renderEntries(entries: ActivityLogEntry[]) {
    render(
        <ActivityLogEntries
            entries={entries}
            isLoading={false}
            errorType={null}
            onRetry={() => {}}
        />
    );
}

describe('ActivityLogEntries', () => {
    it('does not quote generic entity labels', () => {
        renderEntries([
            {
                id: 1,
                entity_type: 'issue',
                entity_id: 42,
                entity_name: 'Issue',
                action: 'update',
                actor_id: 7,
                actor_name: 'Anna Kowalski',
                department_id: 3,
                changes: null,
                description: 'Sanitized entry',
                created_at: '2026-04-06T10:00:00Z',
            },
        ]);

        expect(screen.getByText('Anna Kowalski')).toBeInTheDocument();
        expect(screen.getByText('Sanitized entry')).toBeInTheDocument();
        expect(screen.queryByText('"Issue"')).not.toBeInTheDocument();
    });

    it('renders explicit safe entity labels when they differ from the entity type', () => {
        renderEntries([
            {
                id: 2,
                entity_type: 'risk',
                entity_id: 53,
                entity_name: 'R-AUD-053',
                action: 'update',
                actor_id: 8,
                actor_name: 'Risk Analyst',
                department_id: 5,
                changes: {
                    risk_id_code: { old: 'R-AUD-052', new: 'R-AUD-053' },
                },
                description: 'Updated Risk (fields: risk_id_code)',
                created_at: '2026-04-06T11:00:00Z',
            },
        ]);

        expect(screen.getAllByText('R-AUD-053')[0]).toBeInTheDocument();
        expect(screen.getByText('Updated Risk (fields: risk_id_code)')).toBeInTheDocument();
    });

    it('suppresses duplicate generic labels for mapped snake_case entity types', () => {
        renderEntries([
            {
                id: 3,
                entity_type: 'issue_exception',
                entity_id: 54,
                entity_name: 'Issue Exception',
                action: 'update',
                actor_id: 9,
                actor_name: 'Risk Analyst',
                department_id: 5,
                changes: null,
                description: 'Updated Issue Exception',
                created_at: '2026-04-06T12:00:00Z',
            },
        ]);

        expect(screen.getAllByText('Issue Exception')).toHaveLength(1);
    });

    it('suppresses duplicate generic labels for unmapped future snake_case entity types', () => {
        renderEntries([
            {
                id: 4,
                entity_type: 'future_entity_type',
                entity_id: 55,
                entity_name: 'Future Entity Type',
                action: 'create',
                actor_id: 10,
                actor_name: 'Ops Analyst',
                department_id: 6,
                changes: null,
                description: 'Created Future Entity Type',
                created_at: '2026-04-06T13:00:00Z',
            },
        ]);

        expect(screen.getAllByText('Future Entity Type')).toHaveLength(1);
    });
});
