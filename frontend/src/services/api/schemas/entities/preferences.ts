import type { UserPreferences } from '@/services/preferencesApi';

import {
    passthroughObject,
    z,
} from '../common';

export const riskFiltersSchema = passthroughObject({
    processes: z.array(z.string()),
    categories: z.array(z.string()),
});

export const userPreferencesSchema: z.ZodType<UserPreferences> = passthroughObject({
    theme: z.enum(['light', 'dark', 'riskhub']),
    language: z.enum(['en', 'cs']),
});
