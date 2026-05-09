import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(process.cwd(), '..');
const ENTITY_DIR = path.join(REPO_ROOT, 'frontend/src/services/api/schemas/entities');

function parseSchema(file: string, schema: string): string[] {
    const code = `
import json
import pathlib
import sys
from scripts.security.authz_contract_validator.capability_catalog import _extract_frontend_capability_fields

source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
fields = sorted(_extract_frontend_capability_fields(source, sys.argv[2]) or [])
print(json.dumps({"fields": fields}))
`;
    const out = execFileSync('python3', [
        '-c',
        code,
        path.join(ENTITY_DIR, file),
        schema,
    ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
    });
    return JSON.parse(out).fields;
}

describe('capability_catalog parser still extracts each entity field set', () => {
    it.each([
        ['risks.ts', 'riskCapabilitiesSchema'],
        ['controls.ts', 'controlCapabilitiesSchema'],
        ['kris.ts', 'kriCapabilitiesSchema'],
        ['vendors.ts', 'vendorCapabilitiesSchema'],
    ])('parser returns can_read + can_update for %s', (file, schema) => {
        const fields = parseSchema(file, schema);
        expect(fields).toContain('can_read');
        expect(fields).toContain('can_update');
    });
});
