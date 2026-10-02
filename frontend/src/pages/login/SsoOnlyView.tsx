import { ArrowRight, KeyRound, ShieldCheck } from 'lucide-react';

import { AuthFrame } from '@/components/layout/AuthFrame';
import { Button } from '@/components/ui/button';
import { InlineMessage } from '@/components/ui/inline-message';

import type { ProdAuthCopy, ProdLanguage } from './loginPageTypes';

/** Preview-route-only copy (GAP-B-01): passed by `ProdLoginPreviewPage`, never by the live login. */
export interface SsoPreviewNotes {
    buttonHint: string;
    note: string;
}

interface SsoOnlyViewProps {
    showBootstrapUnavailableBanner: boolean;
    ssoLogoutRecoveryMessage: string | null;
    prodCopy: ProdAuthCopy;
    prodErrorMessage: string;
    prodLanguage: ProdLanguage;
    isSsoLoading: boolean;
    isSsoLogoutRecoveryPending: boolean;
    ssoEnabled: boolean;
    ssoError?: string | null;
    onChangeLanguage: (language: ProdLanguage) => void;
    onRetrySsoLogout: () => void;
    onSsoLogin: () => void;
    translate: (key: string) => string;
    /** Only the standalone preview passes these; the production `/login` never renders them. */
    previewNotes?: SsoPreviewNotes;
}

/**
 * The production Microsoft SSO login on the shared public frame (audit 2026-09-30 §4.20,
 * DS-24, RS-02, D14): `AuthFrame` owns the scrolling `<main>`, the wordmark, the CS / EN
 * switch (driven by the login's own fixed-language copy) and the OS colour scheme, so the
 * page reads the same in light and dark. The provider panel and its states use tokens and
 * `ui` primitives only. `ProdLoginPreviewPage` renders this same view with `previewNotes`.
 */
export function SsoOnlyView({
    showBootstrapUnavailableBanner,
    ssoLogoutRecoveryMessage,
    prodCopy,
    prodErrorMessage,
    prodLanguage,
    isSsoLoading,
    isSsoLogoutRecoveryPending,
    ssoEnabled,
    ssoError,
    onChangeLanguage,
    onRetrySsoLogout,
    onSsoLogin,
    translate,
    previewNotes,
}: SsoOnlyViewProps) {
    return (
        <AuthFrame
            title={prodCopy.title}
            documentTitle={prodCopy.sign_in_label}
            eyebrow={prodCopy.eyebrow}
            subtitle={(
                <>
                    <p className="text-base text-foreground">{prodCopy.description}</p>
                    <p>{prodCopy.detail}</p>
                </>
            )}
            language={{ value: prodLanguage, onChange: onChangeLanguage, label: prodCopy.switch_label }}
            error={prodErrorMessage || null}
            footer={previewNotes?.note}
        >
            {showBootstrapUnavailableBanner ? (
                <InlineMessage tone="danger">{translate('login.unavailable_bootstrap_error')}</InlineMessage>
            ) : null}

            {ssoLogoutRecoveryMessage ? (
                <InlineMessage
                    tone="warning"
                    action={(
                        <Button variant="outline" size="compact" onClick={onRetrySsoLogout} isLoading={isSsoLogoutRecoveryPending}>
                            {translate('logout.complete_microsoft_sign_out')}
                        </Button>
                    )}
                >
                    {ssoLogoutRecoveryMessage}
                </InlineMessage>
            ) : null}

            <div className="space-y-4 rounded-lg border border-border bg-nested p-5">
                <p className="text-eyebrow">{prodCopy.sign_in_label}</p>
                <div className="flex items-center gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent-text">
                        <KeyRound className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <h2 className="font-heading text-lg font-semibold text-foreground">{prodCopy.card_title}</h2>
                        <p className="text-xs text-muted-foreground">{prodCopy.provider_label}</p>
                    </div>
                </div>
                <p className="text-sm text-foreground">{prodCopy.card_body}</p>
                <p className="flex items-start gap-2 rounded-lg bg-tint/5 p-3 text-xs text-muted-foreground">
                    <ShieldCheck className="size-4 shrink-0 text-success-text" aria-hidden="true" />
                    {prodCopy.security_note}
                </p>

                {ssoEnabled ? (
                    <Button variant="accent" size="lg" className="w-full" onClick={onSsoLogin} isLoading={isSsoLoading}>
                        {prodCopy.button_label}
                        <ArrowRight aria-hidden="true" />
                    </Button>
                ) : (
                    <InlineMessage tone="danger">{ssoError || prodCopy.not_configured}</InlineMessage>
                )}

                {previewNotes ? (
                    <p className="text-center text-xs text-muted-foreground">{previewNotes.buttonHint}</p>
                ) : null}
            </div>
        </AuthFrame>
    );
}
