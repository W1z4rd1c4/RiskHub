import type { ProdAuthCopy } from './loginPageTypes';

export function getProdAuthCopy(translate: (key: string) => string): ProdAuthCopy {
    return {
        html_title: translate('login_sso_prod.html_title'),
        switch_label: translate('login_sso_prod.switch_label'),
        eyebrow: translate('login_sso_prod.eyebrow'),
        title: translate('login_sso_prod.title'),
        description: translate('login_sso_prod.description'),
        detail: translate('login_sso_prod.detail'),
        sign_in_label: translate('login_sso_prod.sign_in_label'),
        provider_label: translate('login_sso_prod.provider_label'),
        card_title: translate('login_sso_prod.card_title'),
        card_body: translate('login_sso_prod.card_body'),
        security_note: translate('login_sso_prod.security_note'),
        button_label: translate('login_sso_prod.button_label'),
        button_hint: translate('login_sso_prod.button_hint'),
        preview_note: translate('login_sso_prod.preview_note'),
        not_configured: translate('login_sso_prod.not_configured'),
    };
}
