import { describe, expect, it } from 'vitest';

import {
    buildRegisterLinkOptions,
    canDeleteRegisterLink,
    parseRegisterLinkTargetId,
} from '@/components/risks/detail-overview/riskRegisterLinksPresentation';
import type { RiskAssetLink, RiskProcessLink, ThreatRiskLink } from '@/types/threat';

function sampleThreatLink(overrides: Partial<ThreatRiskLink> = {}): ThreatRiskLink {
    return {
        id: 1,
        threat_id: 7,
        risk_id: 3,
        capabilities: { can_delete: true },
        created_at: '2026-07-10T10:00:00Z',
        ...overrides,
    };
}

function sampleProcessLink(overrides: Partial<RiskProcessLink> = {}): RiskProcessLink {
    return {
        id: 2,
        risk_id: 3,
        process_id: 5,
        capabilities: { can_delete: true },
        created_at: '2026-07-10T10:00:00Z',
        ...overrides,
    };
}

function sampleAssetLink(overrides: Partial<RiskAssetLink> = {}): RiskAssetLink {
    return {
        id: 3,
        risk_id: 3,
        asset_id: 9,
        capabilities: { can_delete: true },
        created_at: '2026-07-10T10:00:00Z',
        ...overrides,
    };
}

describe('Risk register-links presentation helpers', () => {
    it('parses the link target id, rejecting empty and non-positive values', () => {
        expect(parseRegisterLinkTargetId('9')).toBe(9);
        expect(parseRegisterLinkTargetId(' 9 ')).toBe(9);
        expect(parseRegisterLinkTargetId('')).toBeNull();
        expect(parseRegisterLinkTargetId('-1')).toBeNull();
        expect(parseRegisterLinkTargetId('Veris')).toBeNull();
    });

    it('gates the per-row remove action on the backend capability for every link type', () => {
        expect(canDeleteRegisterLink(sampleThreatLink())).toBe(true);
        expect(canDeleteRegisterLink(sampleThreatLink({ capabilities: { can_delete: false } }))).toBe(false);

        expect(canDeleteRegisterLink(sampleProcessLink())).toBe(true);
        expect(canDeleteRegisterLink(sampleProcessLink({ capabilities: null }))).toBe(false);

        expect(canDeleteRegisterLink(sampleAssetLink())).toBe(true);
        expect(canDeleteRegisterLink(sampleAssetLink({ capabilities: undefined }))).toBe(false);
    });

    it('offers only active, not-yet-linked targets in the link selects', () => {
        const options = buildRegisterLinkOptions(
            [
                { id: 7, label: 'Ransomware', isArchived: false },
                { id: 8, label: 'Phishing', isArchived: true },
                { id: 9, label: 'Výpadek datového centra', isArchived: false },
            ],
            new Set([7]),
        );
        expect(options).toEqual([{ value: '9', label: 'Výpadek datového centra' }]);
    });
});
