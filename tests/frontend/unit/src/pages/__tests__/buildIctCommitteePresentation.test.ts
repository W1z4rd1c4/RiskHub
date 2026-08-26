import { describe, expect, it } from 'vitest';

import { buildIctCommitteePresentation } from '@/pages/ictRegisterCommittee/buildIctCommitteePresentation';
import type { IctCommittee, IctRoiTemplateReadiness } from '@/types/ictRegisterCommittee';

function template(overrides: Partial<IctRoiTemplateReadiness> = {}): IctRoiTemplateReadiness {
    return {
        code: 'B_06.01',
        name_en: 'Functions identification',
        name_cs: 'Identifikace funkcí',
        feed: 'processes',
        gate: 'all',
        coverage: 'full',
        row_count: 1,
        required_field_count: 2,
        populated_field_count: 1,
        readiness_pct: 50,
        gap_row_count: 1,
        gap_rows: [
            {
                entity_type: 'vendor',
                entity_id: 7,
                label: '{{unknown_vendor}}',
                route_entity_type: 'vendor',
                route_entity_id: 7,
                missing: [{ key: 'legal_name', code: null }],
            },
        ],
        ...overrides,
    };
}

function snapshot(): IctCommittee {
    return {
        dashboard: {
            register_state: {
                process_count: 1,
                asset_count: 2,
                process_asset_link_count: 3,
                vendor_count: 4,
                assets_pending_review_count: 5,
                direct_process_vendor_link_count: 6,
                contracts_in_roi_scope_count: 7,
                sub_outsourcing_link_count: 8,
                assets_without_data_classification_count: 0,
                top_tier_vendors_without_orderly_exit_count: 9,
            },
            key_metrics: {
                cif_process_count: 10,
                processes_without_impact_assessment_count: 11,
                critical_asset_count: 12,
                critical_vendor_count: 13,
                risks_above_tolerance_count: 14,
                open_dq_finding_count: 0,
            },
        },
        cro: {
            kpi: {
                risk_count: 20,
                material_risk_count: 0,
                risks_above_tolerance_count: 21,
                accepted_above_tolerance_count: 0,
                cif_without_bcm_count: 22,
                open_dq_finding_count: 23,
                material_risk_count_production_inert: true,
            },
            heatmap: { rows: [{ probability: 5, cells: [0, 1, 2, 3, 4] }] },
            migration_matrix: { rows: [{ gross_band: 'Kritické', cells: [1, 2, 3, 5] }] },
            top_risks: [
                {
                    rank: 1,
                    risk_id: 99,
                    code: null,
                    subject_label: 'Payments',
                    threat_label: 'Outage',
                    gross_score: 20,
                    net_score: 10,
                    net_band: 'Nízké',
                    vs_tolerance: 'V toleranci',
                    status_label: 'Open',
                },
            ],
            top_vendors: [{ rank: 1, vendor_id: 8, name: 'Vendor A', cif_process_count: 2, tier: 'Kritický dodavatel' }],
            narratives: {
                cif_process_count: 1,
                process_count: 2,
                cif_with_bcm_count: 1,
                critical_vendor_count: 3,
                critical_vendors_with_functional_exit_count: 2,
                critical_vendors_with_identifier_count: 3,
                tolerance: 39,
                risks_above_tolerance_count: 4,
                accepted_above_tolerance_count: 1,
                sub_outsourcing_link_count: 5,
                vendors_in_sub_role_count: 6,
            },
            assets_by_criticality: [{ band: 'Kritická', count: 2 }],
            risks_by_band: [{ band: 'Vysoké', gross_count: 3, net_count: 1 }],
        },
        roi_readiness: {
            templates: [template()],
            overall_readiness_pct: 50,
            total_gap_row_count: 1,
        },
    };
}

function translate(key: string, values?: Record<string, unknown>): string {
    const known: Record<string, string> = {
        'common:fallbacks.unknown': 'Unknown',
        'common:fallbacks.unknown_risk': 'Unknown risk',
        'common:fallbacks.unknown_threat': 'Unknown threat',
        'common:fallbacks.unknown_vendor': 'Unknown vendor',
    };
    return known[key] ?? `${key}${values ? `:${JSON.stringify(values)}` : ''}`;
}

describe('buildIctCommitteePresentation', () => {
    it('owns the fixed Dashboard, executive-summary, and RoI section order', () => {
        const presentation = buildIctCommitteePresentation(snapshot(), { language: 'en', t: translate });

        expect(presentation.sections.map((section) => section.key)).toEqual([
            'dashboard',
            'executiveSummary',
            'roiReadiness',
        ]);
    });

    it('owns deterministic ordering, drill-downs, tones, and inert KPI behavior', () => {
        const presentation = buildIctCommitteePresentation(snapshot(), { language: 'en', t: translate });

        expect(presentation.dashboard.navigation).toMatchObject({
            croHref: '#cro',
            dqHref: '/ict-register/data-quality',
        });
        expect(presentation.dashboard.stateTiles.map((tile) => tile.key)).toEqual([
            'process_count',
            'asset_count',
            'process_asset_link_count',
            'vendor_count',
            'assets_pending_review_count',
            'direct_process_vendor_link_count',
            'contracts_in_roi_scope_count',
            'sub_outsourcing_link_count',
            'assets_without_data_classification_count',
            'top_tier_vendors_without_orderly_exit_count',
        ]);
        expect(presentation.dashboard.stateTiles[4]).toMatchObject({
            href: '/ict-register/data-quality?check=DQ-09',
            tone: 'warning',
            value: 5,
        });
        expect(presentation.dashboard.stateTiles[8]).toMatchObject({ tone: 'success', value: 0 });
        expect(Object.fromEntries(presentation.dashboard.stateTiles.map((tile) => [tile.key, tile.href]))).toEqual({
            process_count: '/processes',
            asset_count: '/assets?committee_scope=true',
            process_asset_link_count: '/assets?committee_scope=true&has_process_link=true',
            vendor_count: '/vendors?committee_scope=true',
            assets_pending_review_count: '/ict-register/data-quality?check=DQ-09',
            direct_process_vendor_link_count: '/vendors?committee_scope=true&has_direct_process_link=true',
            contracts_in_roi_scope_count: '/vendors?committee_scope=true&has_roi_contract=true',
            sub_outsourcing_link_count: '/vendors?committee_scope=true&has_sub_outsourcing=true',
            assets_without_data_classification_count: '/ict-register/data-quality?check=DQ-46',
            top_tier_vendors_without_orderly_exit_count: '/ict-register/data-quality?check=DQ-49',
        });
        expect(presentation.dashboard.metrics.map((metric) => metric.key)).toEqual([
            'cif_process_count',
            'processes_without_impact_assessment_count',
            'critical_asset_count',
            'critical_vendor_count',
            'risks_above_tolerance_count',
            'open_dq_finding_count',
        ]);
        expect(presentation.dashboard.metrics[4]).toMatchObject({
            href: '/risks?committee_scope=true&ict_linked=true&above_tolerance=true',
            tone: 'warning',
        });
        expect(presentation.executiveSummary.kpis.map((kpi) => kpi.key)).toEqual([
            'risk_count',
            'material_risk_count',
            'risks_above_tolerance_count',
            'accepted_above_tolerance_count',
            'cif_without_bcm_count',
            'open_dq_finding_count',
        ]);
        expect(presentation.executiveSummary.kpis[1]).toMatchObject({
            key: 'material_risk_count',
            href: null,
            inert: true,
            displayValue: '—',
        });
    });

    it('owns matrix cells, chart links, narratives, styles, and route presentation', () => {
        const presentation = buildIctCommitteePresentation(snapshot(), { language: 'en', t: translate });

        expect(presentation.executiveSummary.heatmap.rows[0].cells[2]).toEqual({
            column: 3,
            count: 2,
            fill: '#FFEB84',
            href: '/risks?committee_scope=true&ict_linked=true&gross_probability=5&gross_impact=3',
        });
        expect(presentation.executiveSummary.heatmap.rows[0].cells.map((cell) => cell.fill)).toEqual([
            null,
            '#FFF5C2',
            '#FFEB84',
            '#FCAA78',
            '#F8696B',
        ]);
        expect(presentation.executiveSummary.migration.rows[0].cells[1]).toMatchObject({
            band: 'Střední',
            count: 2,
            href: '/risks?committee_scope=true&ict_linked=true&gross_band=Kritick%C3%A9&net_band=St%C5%99edn%C3%AD',
        });
        expect(presentation.executiveSummary.migration.rows[0].cells[3].fill).toBe('#F8696B');
        expect(presentation.executiveSummary.topRisks[0]).toMatchObject({
            href: '/risks/99',
            label: 'Unknown risk',
            netBandStyle: {
                backgroundColor: 'hsl(var(--success))',
                color: 'hsl(var(--success-foreground))',
            },
        });
        expect(presentation.executiveSummary.assetChart[0].href).toBe(
            '/assets?committee_scope=true&criticality=critical',
        );
        expect(presentation.executiveSummary.riskBandChart[0]).toMatchObject({
            grossHref: '/risks?committee_scope=true&ict_linked=true&gross_band=Vysok%C3%A9',
            netHref: '/risks?committee_scope=true&ict_linked=true&net_band=Vysok%C3%A9',
        });
        expect(presentation.executiveSummary.topVendors[0]).toMatchObject({
            href: '/vendors/8',
            tierStyle: {
                backgroundColor: 'hsl(var(--destructive))',
                color: 'hsl(var(--destructive-foreground))',
            },
        });
        expect(presentation.executiveSummary.narratives[0].text).toContain(
            'narratives.a34:{"cif":1,"total":2,"bcm":1}',
        );
        expect(presentation.executiveSummary.narratives[0].className).toBe('text-slate-300 text-sm');
        expect(presentation.executiveSummary.narratives[4]).toMatchObject({
            key: 'a38',
            className: 'text-slate-500 text-sm italic',
        });
    });

    it('normalizes unresolved top-risk subject and threat labels for the active locale', () => {
        const unresolved = snapshot();
        unresolved.cro.top_risks = [
            { ...unresolved.cro.top_risks[0], subject_label: '?', threat_label: null },
            { ...unresolved.cro.top_risks[0], rank: 2, subject_label: '   ', threat_label: '' },
        ];

        const presentation = buildIctCommitteePresentation(unresolved, { language: 'en', t: translate });

        expect(presentation.executiveSummary.topRisks.map(({ subjectLabel, threatLabel }) => ({
            subjectLabel,
            threatLabel,
        }))).toEqual([
            { subjectLabel: 'Unknown', threatLabel: 'Unknown threat' },
            { subjectLabel: 'Unknown', threatLabel: 'Unknown threat' },
        ]);
    });

    it('applies the active locale and human-readable unknown labels to RoI presentation', () => {
        const english = buildIctCommitteePresentation(snapshot(), { language: 'en', t: translate });
        const czech = buildIctCommitteePresentation(snapshot(), { language: 'cs-CZ', t: translate });

        expect(english.roiReadiness.templates[0].name).toBe('Functions identification');
        expect(czech.roiReadiness.templates[0].name).toBe('Identifikace funkcí');
        expect(english.roiReadiness.templates[0].gapRows[0]).toMatchObject({
            label: 'Unknown vendor',
            href: '/vendors/7',
        });
        expect(english.roiReadiness.templates[0].gapRows[0].label).not.toMatch(/7/);
        expect(english.roiReadiness.templates[0]).toMatchObject({
            coverageClass: 'bg-success text-success-foreground',
            readinessBarClass: 'bg-warning',
        });
    });
});
