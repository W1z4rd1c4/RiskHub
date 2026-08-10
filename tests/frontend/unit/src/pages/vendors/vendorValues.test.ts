import { afterEach, describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { VENDOR_CONTROLLED_CODES, vendorValueLabel } from '@/lib/vendorValues';
import { vendorDerivedInputsSchema } from '@/services/api/schemas/entities/vendors';
import type { VendorDerivedInputs } from '@/types/vendor';

describe('Vendor canonical value presentation', () => {
    afterEach(async () => {
        await i18n.changeLanguage('en');
    });

    it.each(['en', 'cs'] as const)('resolves every controlled code in %s without leaking an i18n key', async (locale) => {
        await i18n.changeLanguage(locale);
        const t = i18n.getFixedT(locale, 'vendors');

        for (const [field, codes] of Object.entries(VENDOR_CONTROLLED_CODES)) {
            for (const code of codes) {
                const label = vendorValueLabel(t, field, code);
                expect(label).not.toContain('values.');
                expect(label).not.toBe(t('values.unknown'));
            }
        }
    });

    it('uses a localized unknown fallback instead of exposing an unrecognized code', () => {
        const t = i18n.getFixedT('en', 'vendors');
        expect(vendorValueLabel(t, 'tier', 'obsolete-db-label')).toBe(t('values.unknown'));
    });

    it.each([
        {
            locale: 'en' as const,
            reintegration: 'Highly complex',
            serviceDisruption: 'High',
        },
        {
            locale: 'cs' as const,
            reintegration: 'Velmi složitá',
            serviceDisruption: 'Vysoký',
        },
    ])('keeps field-colliding controlled labels exact in $locale', async ({
        locale,
        reintegration,
        serviceDisruption,
    }) => {
        await i18n.changeLanguage(locale);
        const t = i18n.getFixedT(locale, 'vendors');

        expect(vendorValueLabel(t, 'reintegration', 'highly_complex')).toBe(reintegration);
        expect(vendorValueLabel(t, 'service_disruption_impact', 'high')).toBe(serviceDisruption);
    });

    it('accepts catalog codes and rejects localized or legacy derived inputs', () => {
        const canonical: VendorDerivedInputs = {
            country: 'CZ',
            substitutability: 'highly_complex',
            exit_plan_state: 'approved',
            significance_authorization_conditions: 'yes',
            significance_regulatory_requirements: 'no',
            significance_service_quality: 'not_applicable',
            significance_financial_impact: 'yes',
            significance_reputation_continuity: 'no',
            significance_cumulative_impact: 'not_applicable',
            cif_asset_link_count: 1,
            cif_process_link_count: 2,
            tier_cif_chain: true,
            tier_max_rank_at_least_high: false,
            tier_substitutability_match: true,
            cloud_service_link_count: 0,
            manual_process_link_count: 1,
            transitive_process_pair_count: 1,
            missing_for_completeness: [],
        };

        expect(vendorDerivedInputsSchema.parse(canonical)).toEqual(canonical);
        expect(vendorDerivedInputsSchema.safeParse({
            ...canonical,
            substitutability: 'Velmi obtížně nahraditelný',
        }).success).toBe(false);
        expect(vendorDerivedInputsSchema.safeParse({
            ...canonical,
            significance_service_quality: 'Ano',
        }).success).toBe(false);
    });
});
