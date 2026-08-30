import { describe, expect, it } from 'vitest';

import { resources } from '@/i18n';

describe('canonical desktop navigation terminology', () => {
    it('uses the approved English labels and KRI supporting copy', () => {
        expect(resources.en.navigation.sidebar).toMatchObject({
            approvals: 'Approvals',
            kris: 'KRIs',
            activity_log: 'Activity Log',
            evidence: 'Evidence & Reports',
        });
        expect(resources.en.navigation.tabs.risk_appetite).toBe('KRIs');
        expect(resources.en.approvals.title).toBe('Approvals');
        expect(resources.en.kris.title).toBe('KRIs');
        expect(resources.en.kris.page_subtitle).toBe('Risk appetite monitoring');
        expect(resources.en.controls.audit_trail.title).toBe('Control Execution History');
        expect(resources.en.controls.access.denied_control_execution_history).toBe(
            'You do not have permission to view Control Execution History.',
        );
        expect(resources.en.admin.activity_log.title).toBe('Activity Log');
        expect(resources.en.vendors.reports.title).toBe('Vendor Reports');
    });

    it('keeps the same concepts aligned in Czech', () => {
        expect(resources.cs.navigation.sidebar).toMatchObject({
            approvals: 'Schválení',
            kris: 'KRI',
            activity_log: 'Záznam aktivit',
            evidence: 'Důkazy a reporty',
        });
        expect(resources.cs.navigation.tabs.risk_appetite).toBe('KRI');
        expect(resources.cs.approvals.title).toBe('Schválení');
        expect(resources.cs.kris.title).toBe('KRI');
        expect(resources.cs.kris.page_subtitle).toBe('Sledování rizikového apetitu');
        expect(resources.cs.controls.audit_trail.title).toBe('Historie provedení kontrol');
        expect(resources.cs.controls.access.denied_control_execution_history).toBe(
            'Nemáte oprávnění zobrazit historii provedení kontrol.',
        );
        expect(resources.cs.admin.activity_log.title).toBe('Záznam aktivit');
        expect(resources.cs.vendors.reports.title).toBe('Reporty dodavatelů');
    });
});
