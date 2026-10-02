import { useEffect, useMemo, useState } from 'react';

import type { SupportedLanguage } from '@/i18n';
import { resources } from '@/i18n/allResources';
import { SsoOnlyView } from '@/pages/login/SsoOnlyView';
import { getProdAuthCopy } from '@/pages/login/prodAuthCopy';

const noop = () => undefined;

/**
 * Standalone preview of the production SSO login (`prod-login-preview.html`): the same
 * `SsoOnlyView` the live `/login` renders, with no active authentication. Only this route
 * shows the preview-only hint and note (GAP-B-01). Copy comes straight from the bundled
 * locale resources, so the preview language is local state and never persisted.
 */
export default function ProdLoginPreviewPage() {
    const [language, setLanguage] = useState<SupportedLanguage>('cs');
    const content = resources[language].auth.login_sso_prod;
    const prodCopy = useMemo(
        () => getProdAuthCopy((key) => content[key.replace('login_sso_prod.', '') as keyof typeof content] ?? key),
        [content],
    );

    useEffect(() => {
        document.documentElement.lang = language;
        document.title = content.html_title;
    }, [content.html_title, language]);

    return (
        <SsoOnlyView
            showBootstrapUnavailableBanner={false}
            ssoLogoutRecoveryMessage={null}
            prodCopy={prodCopy}
            prodErrorMessage=""
            prodLanguage={language}
            isSsoLoading={false}
            isSsoLogoutRecoveryPending={false}
            ssoEnabled
            onChangeLanguage={setLanguage}
            onRetrySsoLogout={noop}
            onSsoLogin={noop}
            translate={(key) => key}
            previewNotes={{ buttonHint: content.button_hint, note: content.preview_note }}
        />
    );
}
