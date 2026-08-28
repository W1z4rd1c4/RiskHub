import { describe, expect, it } from 'vitest';

import { getControlMonitoringMeta, getKriMonitoringMeta } from '@/lib/monitoringStatus';

describe('monitoring status presentation', () => {
    it('exposes semantic gauge tones for every status family', () => {
        const outputs = [
            getControlMonitoringMeta('passed').gaugeToneClassName,
            getControlMonitoringMeta('needs_review').gaugeToneClassName,
            getControlMonitoringMeta('failed').gaugeToneClassName,
            getKriMonitoringMeta('new').gaugeToneClassName,
            getKriMonitoringMeta(null).gaugeToneClassName,
        ];

        expect(new Set(outputs).size).toBe(outputs.length);
        for (const output of outputs) {
            expect(output).not.toMatch(/(?:rose|amber|emerald|sky|slate)-/);
        }
    });

    it('maps every retained gauge band to an explicit semantic zone tone', () => {
        const controlZones = [
            getControlMonitoringMeta('passed').gaugeZoneClassName,
            getControlMonitoringMeta('needs_review').gaugeZoneClassName,
            getControlMonitoringMeta('failed').gaugeZoneClassName,
            getControlMonitoringMeta('new').gaugeZoneClassName,
            getControlMonitoringMeta(null).gaugeZoneClassName,
        ];

        expect(new Set(controlZones).size).toBe(controlZones.length);
        expect(getKriMonitoringMeta('optimal').gaugeZoneClassName)
            .toBe(getControlMonitoringMeta('passed').gaugeZoneClassName);
        expect(getKriMonitoringMeta('breach').gaugeZoneClassName)
            .toBe(getControlMonitoringMeta('failed').gaugeZoneClassName);
    });
});
