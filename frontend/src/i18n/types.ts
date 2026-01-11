import type { resources, namespaces, SupportedLanguage } from './index';

// Re-export SupportedLanguage for convenience
export type { SupportedLanguage };

// Extract namespace names
export type Namespace = typeof namespaces[number];

// Type-safe resources
export type Resources = typeof resources;

// Type for translation keys in each namespace
export type TranslationKeys<NS extends Namespace> = keyof Resources['en'][NS];

// Augment i18next types for type-safe translations
declare module 'i18next' {
    interface CustomTypeOptions {
        defaultNS: 'common';
        resources: Resources['en'];
    }
}
