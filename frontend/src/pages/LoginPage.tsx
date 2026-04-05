import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
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

export default function LoginPage() {
    const { t, i18n } = useTranslation(['auth', 'errorKeys', 'common']);
    const location = useLocation();
    const { returnTo, authErrorParam } = useMemo(() => {
        const params = new URLSearchParams(location.search);
        return {
            returnTo: sanitizeReturnTo(params.get('returnTo')),
            authErrorParam: params.get('authError'),
        };
    }, [location.search]);

    const [prodLanguage, setProdLanguage] = useState<ProdLanguage>('cs');
    const showBootstrapUnavailableBanner = authErrorParam === 'service_unavailable';

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

    const prodCopy = useMemo(
        () => getProdAuthCopy((key) => i18n.t(key, { ns: 'auth', lng: prodLanguage })),
        [i18n, prodLanguage],
    );
    const prodErrorMessage = errorKey ? i18n.t(errorKey, { ns: 'errorKeys', lng: prodLanguage }) : '';
    const demoErrorMessage = errorKey ? t(errorKey, { ns: 'errorKeys' }) : null;

    useProdLoginMetadata({
        enabled: authConfig?.auth_mode === 'microsoft_sso',
        language: prodLanguage,
        title: i18n.t('login_sso_prod.html_title', { ns: 'auth', lng: prodLanguage }),
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
