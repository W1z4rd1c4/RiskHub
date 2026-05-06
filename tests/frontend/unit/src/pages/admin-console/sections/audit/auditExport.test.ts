import { describe, expect, it } from 'vitest';

import { buildAuditExportFilename } from '@/pages/admin-console/sections/audit/auditExport';

describe('auditExport', () => {
    it('builds Windows-safe audit export filenames', () => {
        expect(buildAuditExportFilename('csv', new Date('2026-05-06T12:30:00.000Z'))).toBe(
            'riskhub_audit_logs_2026-05-06T12-30-00-000Z.csv',
        );
    });
});
