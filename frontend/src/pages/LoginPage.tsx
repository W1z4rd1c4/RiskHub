import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { sanitizeReturnTo } from '@/services/authRedirect';
import { AuthConfigErrorView, LoadingLoginView, LoginNotConfiguredView } from '@/pages/login/LoginStateViews';
import { DemoLoginView } from '@/pages/login/DemoLoginView';
import { SsoOnlyView } from '@/pages/login/SsoOnlyView';
import { type DemoAccountGroups, type ProdLanguage } from '@/pages/login/loginPageTypes';
import { getProdAuthCopy } from '@/pages/login/prodAuthCopy';
import { useAuthConfigLoader } from '@/pages/login/useAuthConfigLoader';
import { useLoginActions } from '@/pages/login/useLoginActions';
import { useProdLoginMetadata } from '@/pages/login/useProdLoginMetadata';
import { useSessionSnapshot } from '@/services/sessionStore';

export default function LoginPage() {
    const { t, i18n } = useTranslation(['auth', 'errorKeys', 'common']);
    const location = useLocation();
    const navigate = useNavigate();
    const { returnTo, authErrorParam } = useMemo(() => {
        const params = new URLSearchParams(location.search);
        return {
            returnTo: sanitizeReturnTo(params.get('returnTo')),
            authErrorParam: params.get('authError'),
        };
    }, [location.search]);

    const [prodLanguage, setProdLanguage] = useState<ProdLanguage>('cs');
    const hasAccessToken = useSessionSnapshot().token !== null;
    const showBootstrapUnavailableBanner = authErrorParam === 'service_unavailable';

    useEffect(() => {
        if (!hasAccessToken) {
            return;
        }
        void navigate(returnTo, { replace: true });
    }, [hasAccessToken, navigate, returnTo]);

    const {
        authConfig,
        authConfigError,
        isAuthConfigLoading,
        reloadAuthConfig,
    } = useAuthConfigLoader({
        unavailableServiceMessage: t('login.unavailable_service_error'),
        unavailableConfigMessage: t('login.unavailable_config_error'),
    });

    const demoAccounts = useMemo<DemoAccountGroups>(
        () => ({
            privileged: (authConfig?.demo_personas ?? []).filter((account) => account.section === 'privileged'),
            department_heads: (authConfig?.demo_personas ?? []).filter((account) => account.section === 'department_heads'),
            employees: (authConfig?.demo_personas ?? []).filter((account) => account.section === 'employees'),
        }),
        [authConfig?.demo_personas],
    );

    const {
        isLoading,
        errorKey,
        isSsoLoading,
        authActionUnavailableError,
        handleDemoLogin,
        handleSsoLogin,
    } = useLoginActions({
        returnTo,
        translate: t,
    });

    const resolveFixedTranslate = useMemo(
        () => (language: ProdLanguage, namespace: 'auth' | 'errorKeys') => {
            if (typeof i18n.getFixedT === 'function') {
                return i18n.getFixedT(language, namespace) as (key: string) => string;
            }
            const translator = i18n as { t: (key: string, options?: Record<string, unknown>) => string };
            return ((key: string) => translator.t(key, { lng: language, ns: namespace })) as (key: string) => string;
        },
        [i18n],
    );

    const prodAuthTranslate = useMemo(
        () => resolveFixedTranslate(prodLanguage, 'auth'),
        [prodLanguage, resolveFixedTranslate],
    );
    const prodErrorTranslate = useMemo(
        () => resolveFixedTranslate(prodLanguage, 'errorKeys'),
        [prodLanguage, resolveFixedTranslate],
    );

    const prodCopy = useMemo(
        () => getProdAuthCopy(prodAuthTranslate),
        [prodAuthTranslate],
    );
    const prodErrorMessage = errorKey ? prodErrorTranslate(errorKey) : '';
    const demoErrorMessage = errorKey ? t(errorKey, { ns: 'errorKeys' }) : null;

    useProdLoginMetadata({
        enabled: authConfig?.auth_mode === 'microsoft_sso',
        language: prodLanguage,
        title: prodAuthTranslate('login_sso_prod.html_title'),
    });

    if (isAuthConfigLoading) {
        return <LoadingLoginView message={t('loading.generic', { ns: 'common' })} />;
    }

    if (authConfigError || !authConfig) {
        return (
            <AuthConfigErrorView
                title={t('login.unavailable_title')}
                message={authConfigError || t('login.unavailable_config_error')}
                retryHint={t('login.unavailable_retry_hint')}
                retryLabel={t('common:actions.retry')}
                onRetry={reloadAuthConfig}
            />
        );
    }

    if (authConfig.auth_mode === 'microsoft_sso') {
        return (
            <SsoOnlyView
                showBootstrapUnavailableBanner={showBootstrapUnavailableBanner}
                prodCopy={prodCopy}
                prodErrorMessage={prodErrorMessage}
                prodLanguage={prodLanguage}
                isSsoLoading={isSsoLoading}
                ssoEnabled={Boolean(authConfig.sso.enabled)}
                ssoError={authConfig.sso_error}
                onChangeLanguage={setProdLanguage}
                onSsoLogin={handleSsoLogin}
                translate={t}
            />
        );
    }

    if (authConfig.auth_mode === 'hybrid_dev') {
        return (
            <DemoLoginView
                showBootstrapUnavailableBanner={showBootstrapUnavailableBanner}
                authActionUnavailableError={authActionUnavailableError}
                showConfigWarning={false}
                showSsoButton={Boolean(authConfig.sso.enabled)}
                isSsoLoading={isSsoLoading}
                isAnyDemoLoginLoading={isLoading !== null}
                loadingEmail={isLoading}
                demoErrorMessage={demoErrorMessage}
                demoAccounts={demoAccounts}
                onDemoLogin={handleDemoLogin}
                onSsoLogin={handleSsoLogin}
                translate={t}
            />
        );
    }

    // auth_mode=password (or any unexpected state): only show demo UI if explicitly enabled.
    if (authConfig.demo_login_enabled) {
        return (
            <DemoLoginView
                showBootstrapUnavailableBanner={showBootstrapUnavailableBanner}
                authActionUnavailableError={authActionUnavailableError}
                showConfigWarning={false}
                showSsoButton={Boolean(authConfig.sso.enabled)}
                isSsoLoading={isSsoLoading}
                isAnyDemoLoginLoading={isLoading !== null}
                loadingEmail={isLoading}
                demoErrorMessage={demoErrorMessage}
                demoAccounts={demoAccounts}
                onDemoLogin={handleDemoLogin}
                onSsoLogin={handleSsoLogin}
                translate={t}
            />
        );
    }

    return (
        <LoginNotConfiguredView
            title={t('login.not_configured_title')}
            description={t('login.not_configured_description')}
        />
    );
}
