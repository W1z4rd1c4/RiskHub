import { useEffect } from 'react';
import type { Location, NavigateFunction } from 'react-router-dom';

import {
    getVendorDetailScrollTargetId,
    normalizeVendorDetailSearch,
} from './vendorDetailPresentation';

export function useVendorDeepLinkScroll(location: Location) {
    useEffect(() => {
        if (!location.search) {
            return;
        }

        const params = new URLSearchParams(location.search);
        const targetId = getVendorDetailScrollTargetId(params.get('tab'), params.get('section'));
        if (!targetId) {
            return;
        }

        const frameId = window.requestAnimationFrame(() => {
            document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        return () => {
            window.cancelAnimationFrame(frameId);
        };
    }, [location.pathname, location.search]);
}

export function useNormalizeLegacyVendorDetailSearch(location: Location, navigate: NavigateFunction) {
    useEffect(() => {
        const search = normalizeVendorDetailSearch(location.search);
        if (search === null) return;

        void navigate({
            pathname: location.pathname,
            search,
            hash: location.hash,
        }, { replace: true });
    }, [location.hash, location.pathname, location.search, navigate]);
}
