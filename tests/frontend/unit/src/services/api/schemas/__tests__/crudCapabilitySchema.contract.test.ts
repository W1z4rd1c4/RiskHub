import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
    CRUD_BASE_FIELDS,
    crudCapabilitySchema,
} from '@/services/api/schemas/crudCapabilitySchema';

const ENTITY_DIR = path.resolve(process.cwd(), 'src/services/api/schemas/entities');

describe('crudCapabilitySchema literal-flat contract (#65)', () => {
    it('exposes CRUD_BASE_FIELDS = ["can_read", "can_update"]', () => {
        expect([...CRUD_BASE_FIELDS]).toEqual(['can_read', 'can_update']);
    });

    it('schema shape has exactly can_read and can_update', () => {
        expect(Object.keys((crudCapabilitySchema as { shape?: object }).shape ?? {})).toEqual([
            'can_read',
            'can_update',
        ]);
    });

    const entityFiles = ['risks.ts', 'controls.ts', 'kris.ts', 'vendors.ts'];

    it.each(entityFiles)('%s capability schema is literal-flat (no .merge / .extend)', (rel) => {
        const src = fs.readFileSync(path.join(ENTITY_DIR, rel), 'utf8');
        expect(src).toMatch(/can_read:\s*z\.boolean\(\)/);
        expect(src).toMatch(/can_update:\s*z\.boolean\(\)/);
        expect(src).not.toMatch(/crudCapabilitySchema\.(merge|extend)\b/);
    });
});
