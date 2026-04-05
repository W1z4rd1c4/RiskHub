import type { AuthConfigResponse } from '@/services/authApi';

export type ProdLanguage = 'cs' | 'en';
export type DemoAccount = NonNullable<AuthConfigResponse['demo_personas']>[number];

export interface DemoAccountGroups {
    privileged: DemoAccount[];
    department_heads: DemoAccount[];
    employees: DemoAccount[];
}

export interface ProdAuthCopy {
    html_title: string;
    switch_label: string;
    eyebrow: string;
    title: string;
    description: string;
    detail: string;
    sign_in_label: string;
    provider_label: string;
    card_title: string;
    card_body: string;
    security_note: string;
    button_label: string;
    button_hint: string;
    preview_note: string;
    not_configured: string;
}
