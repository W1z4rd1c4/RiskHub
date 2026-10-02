import { AuthFrame } from '@/components/layout/AuthFrame';
import { Button } from '@/components/ui/button';
import { InlineMessage } from '@/components/ui/inline-message';

import { AccountButton } from './AccountButton';
import type { DemoAccountGroups } from './loginPageTypes';

interface DemoLoginViewProps {
    showBootstrapUnavailableBanner: boolean;
    authActionUnavailableError: string | null;
    showConfigWarning: boolean;
    showSsoButton: boolean;
    isSsoLoading: boolean;
    isAnyDemoLoginLoading: boolean;
    loadingEmail: string | null;
    demoErrorMessage: string | null;
    demoAccounts: DemoAccountGroups;
    onDemoLogin: (email: string) => void;
    onSsoLogin: () => void;
    translate: (key: string) => string;
}

/**
 * Demo / hybrid login on the shared public frame (DS-24): the wide `AuthFrame` card holds
 * the status messages, the optional Microsoft sign-in and the persona grid.
 */
export function DemoLoginView({
    showBootstrapUnavailableBanner,
    authActionUnavailableError,
    showConfigWarning,
    showSsoButton,
    isSsoLoading,
    isAnyDemoLoginLoading,
    loadingEmail,
    demoErrorMessage,
    demoAccounts,
    onDemoLogin,
    onSsoLogin,
    translate,
}: DemoLoginViewProps) {
    const accounts = [
        ...demoAccounts.privileged,
        ...demoAccounts.department_heads,
        ...demoAccounts.employees,
    ];
    return (
        <AuthFrame
            title={translate('login_demo.title')}
            subtitle={translate('login_demo.subtitle')}
            size="wide"
            footer={translate('login_demo.footer_note')}
        >
            {showBootstrapUnavailableBanner ? (
                <InlineMessage tone="danger">{translate('login.unavailable_bootstrap_error')}</InlineMessage>
            ) : null}

            {authActionUnavailableError ? (
                <InlineMessage tone="danger">{authActionUnavailableError}</InlineMessage>
            ) : null}

            {showConfigWarning ? (
                <InlineMessage tone="warning">{translate('login_demo.auth_config_unavailable')}</InlineMessage>
            ) : null}

            {showSsoButton ? (
                <div className="flex justify-center">
                    <Button
                        variant="outline"
                        onClick={onSsoLogin}
                        disabled={isAnyDemoLoginLoading}
                        isLoading={isSsoLoading}
                    >
                        {translate('login_sso.continue_with_microsoft')}
                    </Button>
                </div>
            ) : null}

            {demoErrorMessage ? (
                <InlineMessage tone="danger">{demoErrorMessage}</InlineMessage>
            ) : null}

            <div data-testid="demo-persona-grid" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {accounts.map((account) => (
                    <AccountButton
                        key={account.email}
                        account={account}
                        disabled={isAnyDemoLoginLoading}
                        isLoading={loadingEmail === account.email}
                        onSelect={onDemoLogin}
                        translate={translate}
                    />
                ))}
            </div>
        </AuthFrame>
    );
}
