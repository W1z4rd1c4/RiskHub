import { useEffect } from 'react';
import type { ProdLanguage } from './loginPageTypes';

interface UseProdLoginMetadataOptions {
    enabled: boolean;
    language: ProdLanguage;
    title: string;
}

export function useProdLoginMetadata({ enabled, language, title }: UseProdLoginMetadataOptions): void {
    useEffect(() => {
        if (!enabled) {
            return;
        }

        const previousTitle = document.title;
        const previousLang = document.documentElement.lang;

        document.title = title;
        document.documentElement.lang = language;

        return () => {
            document.title = previousTitle;
            document.documentElement.lang = previousLang;
        };
    }, [enabled, language, title]);
}
