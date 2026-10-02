import { useEffect } from 'react';

interface UseProdLoginMetadataOptions {
    enabled: boolean;
    title: string;
}

/**
 * Owns the production-login document title only. `<html lang>` follows the
 * in-app language for every route via LanguageProvider (AX-09), so the login
 * screen must not write or restore it here.
 */
export function useProdLoginMetadata({ enabled, title }: UseProdLoginMetadataOptions): void {
    useEffect(() => {
        if (!enabled) {
            return;
        }

        const previousTitle = document.title;
        document.title = title;

        return () => {
            document.title = previousTitle;
        };
    }, [enabled, title]);
}
