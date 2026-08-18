import { describe, expect, it } from 'vitest';

import { buildAuditCsv, buildAuditExportFilename } from '@/pages/admin-console/sections/audit/auditExport';
import type { RecentLogEntry } from '@/services/adminApi';

function auditEntry(overrides: Partial<RecentLogEntry> = {}): RecentLogEntry {
    return {
        timestamp: '2026-08-18T10:00:00Z',
        level: 'INFO',
        event: 'audit_event',
        logger_name: 'audit',
        request_id: 'request-safe',
        user_id: 42,
        client_ip: '192.0.2.10',
        feature: 'admin',
        extra: { source: 'test' },
        ...overrides,
    };
}

describe('auditExport', () => {
    it('neutralizes direct spreadsheet formula markers in every emitted cell', () => {
        const entries = [
            auditEntry({ event: '=EVENT()', request_id: '=1+1' }),
            auditEntry({ event: '+EVENT()', request_id: '+SUM(A1:A2)' }),
            auditEntry({ event: '-EVENT()', request_id: '-2+3' }),
            auditEntry({ event: '@EVENT()', request_id: '@HYPERLINK("https://example.test")' }),
        ];

        const expectedCsv =
            '"Timestamp","Level","Event","User ID","IP","Request ID","Details"\n' +
            '"2026-08-18T10:00:00Z","INFO","\'=EVENT()","42","192.0.2.10","\'=1+1","{""source"":""test""}"\n' +
            '"2026-08-18T10:00:00Z","INFO","\'+EVENT()","42","192.0.2.10","\'+SUM(A1:A2)","{""source"":""test""}"\n' +
            '"2026-08-18T10:00:00Z","INFO","\'-EVENT()","42","192.0.2.10","\'-2+3","{""source"":""test""}"\n' +
            '"2026-08-18T10:00:00Z","INFO","\'@EVENT()","42","192.0.2.10","\'@HYPERLINK(""https://example.test"")","{""source"":""test""}"';

        expect(buildAuditCsv(entries)).toBe(expectedCsv);
    });

    it('neutralizes formula markers after leading ASCII whitespace and initial control characters', () => {
        const entries = [
            auditEntry({
                timestamp: ' =TIMESTAMP()',
                level: '  +LEVEL()',
                event: '\t-EVENT()',
                client_ip: '\r@IP()',
                request_id: '\n=REQUEST()',
            }),
            auditEntry({
                timestamp: '\nplain timestamp',
                event: ' \t\r\n+MIXED()',
                client_ip: '\tplain ip',
                request_id: '\rplain request',
            }),
        ];

        const expectedCsv =
            '"Timestamp","Level","Event","User ID","IP","Request ID","Details"\n' +
            '"\' =TIMESTAMP()","\'  +LEVEL()","\'\t-EVENT()","42","\'\r@IP()","\'\n=REQUEST()","{""source"":""test""}"\n' +
            '"\'\nplain timestamp","INFO","\' \t\r\n+MIXED()","42","\'\tplain ip","\'\rplain request","{""source"":""test""}"';

        expect(buildAuditCsv(entries)).toBe(expectedCsv);
    });

    it('preserves safe values and existing CSV quoting exactly', () => {
        const entry = {
            ...auditEntry({
                timestamp: ' 2026-08-18T10:00:00Z',
                level: null,
                event: 'review, "approved"\nnext line',
                user_id: 73,
                request_id: '  request-safe',
                extra: { note: 'safe, "quoted"', count: 2 },
            }),
            client_ip: undefined,
        } as unknown as RecentLogEntry;

        const expectedCsv =
            '"Timestamp","Level","Event","User ID","IP","Request ID","Details"\n' +
            '" 2026-08-18T10:00:00Z","","review, ""approved""\nnext line","73","","  request-safe","{""note"":""safe, \\""quoted\\"""",""count"":2}"';

        expect(buildAuditCsv([entry])).toBe(expectedCsv);
    });

    it('emits the exact header artifact when there are no rows', () => {
        expect(buildAuditCsv([])).toBe(
            '"Timestamp","Level","Event","User ID","IP","Request ID","Details"',
        );
    });

    it('builds Windows-safe audit export filenames', () => {
        expect(buildAuditExportFilename('csv', new Date('2026-05-06T12:30:00.000Z'))).toBe(
            'riskhub_audit_logs_2026-05-06T12-30-00-000Z.csv',
        );
    });
});
