import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ISSUES = path.resolve(process.cwd(), 'src/services/api/schemas/entities/issues.ts');

describe('issueCapabilitiesSchema is structurally distinct (#65)', () => {
    it('does not import crudCapabilitySchema', () => {
        const src = fs.readFileSync(ISSUES, 'utf8');
        expect(src).not.toMatch(/from '@\/services\/api\/schemas\/crudCapabilitySchema'/);
    });

    it('does not call .merge() against crudCapabilitySchema', () => {
        const src = fs.readFileSync(ISSUES, 'utf8');
        expect(src).not.toMatch(/crudCapabilitySchema\.merge/);
    });
});
