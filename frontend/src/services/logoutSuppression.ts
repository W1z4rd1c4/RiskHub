const EXPLICIT_LOGOUT_SUPPRESSION_KEY = 'riskhub_explicit_logout_suppressed';

function canUseSessionStorage(): boolean {
    return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function isExplicitLogoutSuppressed(): boolean {
    if (!canUseSessionStorage()) {
        return false;
    }
    return window.sessionStorage.getItem(EXPLICIT_LOGOUT_SUPPRESSION_KEY) === '1';
}

export function setExplicitLogoutSuppressed(): void {
    if (!canUseSessionStorage()) {
        return;
    }
    window.sessionStorage.setItem(EXPLICIT_LOGOUT_SUPPRESSION_KEY, '1');
}

export function clearExplicitLogoutSuppressed(): void {
    if (!canUseSessionStorage()) {
        return;
    }
    window.sessionStorage.removeItem(EXPLICIT_LOGOUT_SUPPRESSION_KEY);
}

export function __resetExplicitLogoutSuppressionForTests(): void {
    clearExplicitLogoutSuppressed();
}
