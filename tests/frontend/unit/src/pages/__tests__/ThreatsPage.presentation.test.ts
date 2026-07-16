import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildThreatColumns } from '@/pages/threats/threatColumns';
import {
    buildThreatListParams,
    buildThreatWritePayload,
    getThreatDisplayStatus,
    threatCategoryLabel,
    threatsEmptyStateKey,
} from '@/pages/threats/threatsPagePresentation';
import {
    buildLinkTargetOptions,
    canDeleteThreatRiskLink,
    parseLinkTargetId,
} from '@/pages/threats/threatRiskLinksPresentation';
import type { ThreatListItem, ThreatRiskLink } from '@/types/threat';

function sampleThreat(overrides: Partial<ThreatListItem> = {}): ThreatListItem {
    return {
        id: 7,
        name: 'Ransomware',
        threat_steward_user_id: 8,
        threat_steward: {
            name: 'Klára Černá',
            email: 'klara@example.com',
            role_name: 'CISO',
        },
        steward_orphaned: false,
        stewardship_status: 'assigned',
        category: 'availability',
        description: 'Zašifrování dat a vydírání.',
        typical_weaknesses: 'Neaktualizované systémy, phishing',
        relevant_subject: 'Aktivum',
        notes: null,
        visible_linked_risk_count: 2,
        is_archived: false,
        archived_at: null,
        archived_by_id: null,
        capabilities: null,
        created_at: '2026-07-10T10:00:00Z',
        updated_at: '2026-07-10T10:00:00Z',
        ...overrides,
    };
}

function sampleRiskLink(overrides: Partial<ThreatRiskLink> = {}): ThreatRiskLink {
    return {
        id: 11,
        threat_id: 7,
        risk_id: 3,
        capabilities: { can_delete: true },
        created_at: '2026-07-10T10:00:00Z',
        ...overrides,
    };
}

describe('Threats page presentation helpers', () => {
    it('builds register list params with search, archive filter, sort, and paging', () => {
        expect(
            buildThreatListParams({
                currentPage: 3,
                debouncedSearch: '  ransom  ',
                includeArchived: true,
                limit: 20,
                sortDirection: 'desc',
                sortField: 'name',
            })
        ).toEqual({
            offset: 40,
            limit: 20,
            include_archived: true,
            search: 'ransom',
            sort_by: 'name',
            sort_order: 'desc',
        });

        expect(
            buildThreatListParams({
                currentPage: 1,
                debouncedSearch: '',
                includeArchived: false,
                limit: 20,
                sortDirection: null,
                sortField: null,
            })
        ).toEqual({ offset: 0, limit: 20, include_archived: false });
    });

    it('derives the display status from the archive flag', () => {
        expect(getThreatDisplayStatus(sampleThreat())).toBe('active');
        expect(getThreatDisplayStatus(sampleThreat({ is_archived: true }))).toBe('archived');
    });

    it('does not render legacy controlled labels as canonical category values', () => {
        expect(threatCategoryLabel((key) => key, 'Dostupnost')).toBe('threats:register.values.unknown');
    });

    it('strips empty strings to nulls and drops untouched fields in write payloads', () => {
        expect(
            buildThreatWritePayload({
                name: ' Ransomware ',
                category: 'availability',
                description: '',
                typical_weaknesses: 'Neaktualizované systémy, phishing',
                notes: '',
            })
        ).toEqual({
            name: 'Ransomware',
            category: 'availability',
            description: null,
            typical_weaknesses: 'Neaktualizované systémy, phishing',
            notes: null,
        });

        // Untouched fields (undefined) stay unsent on PATCH.
        expect(buildThreatWritePayload({ notes: 'Po revizi.' })).toEqual({ notes: 'Po revizi.' });
    });

    it('renders the 12_Hrozby entered columns in the register column set', () => {
        const columns = buildThreatColumns({
            t: (key: string) => key,
            onRestore: () => undefined,
            canRestoreThreat: () => false,
        });
        const keys = columns.map((column) => column.key);

        expect(keys).toContain('name');
        expect(keys).toContain('category');
        expect(keys).toContain('threat_steward');
        expect(keys).toContain('typical_weaknesses');
        expect(keys).toContain('relevant_subject');
        expect(keys).toContain('linked_risk_count');
        expect(keys).toContain('status');

        const nameColumn = columns.find((column) => column.key === 'name');
        render(nameColumn?.render?.(sampleThreat(), 0) as ReactElement);
        expect(screen.getByText('Ransomware')).toBeInTheDocument();

        const categoryColumn = columns.find((column) => column.key === 'category');
        render(categoryColumn?.render?.(sampleThreat(), 0) as ReactElement);
        expect(screen.getByText('threats:categories.availability')).toBeInTheDocument();

        const stewardColumn = columns.find((column) => column.key === 'threat_steward');
        render(stewardColumn?.render?.(sampleThreat(), 0) as ReactElement);
        expect(screen.getByText('Klára Černá')).toBeInTheDocument();

        const linkedRiskColumn = columns.find((column) => column.key === 'linked_risk_count');
        render(linkedRiskColumn?.render?.(sampleThreat(), 0) as ReactElement);
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(linkedRiskColumn?.className).toContain('text-right');
    });

    it('distinguishes an empty register from an unmatched search (FR-P5-5)', () => {
        expect(threatsEmptyStateKey(false)).toBe('empty.no_threats');
        expect(threatsEmptyStateKey(true)).toBe('empty.no_results');
    });

    it('gives truncated free-text cells a title + hover cue, but not the em-dash placeholder (P9)', () => {
        const columns = buildThreatColumns({
            t: (key: string) => key,
            onRestore: () => undefined,
            canRestoreThreat: () => false,
        });

        // The name column's secondary line truncates the description → full text
        // on hover via `title`, `cursor-help` as the cue.
        const nameColumn = columns.find((column) => column.key === 'name');
        render(nameColumn?.render?.(sampleThreat(), 0) as ReactElement);
        const description = screen.getByText('Zašifrování dat a vydírání.');
        expect(description).toHaveAttribute('title', 'Zašifrování dat a vydírání.');
        expect(description.className).toContain('truncate');
        expect(description.className).toContain('cursor-help');

        const weaknessColumn = columns.find((column) => column.key === 'typical_weaknesses');
        render(weaknessColumn?.render?.(sampleThreat(), 0) as ReactElement);
        const weakness = screen.getByText('Neaktualizované systémy, phishing');
        expect(weakness).toHaveAttribute('title', 'Neaktualizované systémy, phishing');
        expect(weakness.className).toContain('cursor-help');

        // An absent value renders the em-dash with no title and no help cursor.
        render(
            weaknessColumn?.render?.(sampleThreat({ typical_weaknesses: null }), 0) as ReactElement,
        );
        const placeholder = screen.getByText('—');
        expect(placeholder).not.toHaveAttribute('title');
        expect(placeholder.className).not.toContain('cursor-help');
    });

    it('renders the archived status pill with the restore affordance gated per row', () => {
        const columns = buildThreatColumns({
            t: (key: string) => key,
            onRestore: () => undefined,
            canRestoreThreat: (threat) => threat.id === 7,
        });
        const statusColumn = columns.find((column) => column.key === 'status');

        render(statusColumn?.render?.(sampleThreat({ is_archived: true }), 0) as ReactElement);
        expect(screen.getByText('threats:status.archived')).toBeInTheDocument();
        expect(screen.getByTestId('threat-restore-7')).toBeInTheDocument();
    });
});

describe('Threat risk-links presentation helpers', () => {
    it('parses the link target id, rejecting empty and non-positive values', () => {
        expect(parseLinkTargetId('3')).toBe(3);
        expect(parseLinkTargetId(' 3 ')).toBe(3);
        expect(parseLinkTargetId('')).toBeNull();
        expect(parseLinkTargetId('0')).toBeNull();
        expect(parseLinkTargetId('abc')).toBeNull();
    });

    it('gates the per-row remove action on the backend capability', () => {
        expect(canDeleteThreatRiskLink(sampleRiskLink())).toBe(true);
        expect(canDeleteThreatRiskLink(sampleRiskLink({ capabilities: { can_delete: false } }))).toBe(false);
        expect(canDeleteThreatRiskLink(sampleRiskLink({ capabilities: null }))).toBe(false);
    });

    it('offers only active, not-yet-linked targets in the link select', () => {
        const options = buildLinkTargetOptions(
            [
                { id: 1, label: 'RIZ-1: Výpadek', isArchived: false },
                { id: 2, label: 'RIZ-2: Únik dat', isArchived: true },
                { id: 3, label: 'RIZ-3: Podvod', isArchived: false },
            ],
            new Set([3]),
        );
        expect(options).toEqual([{ value: '1', label: 'RIZ-1: Výpadek' }]);
    });
});
