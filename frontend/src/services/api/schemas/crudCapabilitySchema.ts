import { passthroughObject, z } from './common';

export const CRUD_BASE_FIELDS = ['can_read', 'can_update'] as const;
export type CrudBaseField = (typeof CRUD_BASE_FIELDS)[number];

/**
 * Shared CRUD base for capability schema tests and types only.
 *
 * Entity capability schemas must remain literal-flat passthroughObject({
 * ... }) declarations. The capability catalog parser uses brace-matched
 * literal extraction and does not follow .merge() or .extend().
 */
export const crudCapabilitySchema = passthroughObject({
    can_read: z.boolean(),
    can_update: z.boolean(),
});
